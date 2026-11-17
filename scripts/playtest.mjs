// Crescent Bay playtest suite (GATE AKHIR A15).
// Usage: node scripts/playtest.mjs [arc|edge|cold|fps|all]
// Serves game/ via serve.ts and drives it in headless Chromium.
// Prints PASS/FAIL per test; exits non-zero on any failure.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/home/hatch/workspace/.pw-tools/node_modules/playwright-core');
import { spawn } from 'node:child_process';

const MODE = process.argv[2] || 'all';
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const PORT = 8081;
const results = [];
function pass(name, detail = '') { results.push({ name, ok: true, detail }); console.log(`PASS ${name} ${detail}`); }
function fail(name, detail = '') { results.push({ name, ok: false, detail }); console.log(`FAIL ${name} ${detail}`); }

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: '/home/hatch/workspace/makefun-sweep/gta6-01', stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 1200));

async function newPage(browser, url, fresh = true) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 200)));
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => !!window.__cb, { timeout: 15000 });
  return { ctx, page, errors };
}

async function clickNewGame(page) {
  await page.click('#btn-new-game');
  await page.waitForTimeout(300);
}

let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

  // ---- COLD LOAD ----
  if (MODE === 'all' || MODE === 'cold') {
    const t0 = Date.now();
    const { ctx, page, errors } = await newPage(browser, `http://localhost:${PORT}/`);
    const paintMs = Date.now() - t0;
    const titleVisible = await page.isVisible('#title-screen');
    const continueHidden = await page.evaluate(() => document.getElementById('btn-continue').classList.contains('hidden'));
    if (titleVisible && continueHidden && errors.length === 0) pass('cold-load', `title in ${paintMs} ms, no save yet, 0 errors`);
    else fail('cold-load', `title=${titleVisible} continueHidden=${continueHidden} errors=${errors.join('|')}`);
    await clickNewGame(page);
    const state = await page.evaluate(() => window.__cb.G.state);
    if (state === 'playing') pass('new-game-starts', 'state=playing');
    else fail('new-game-starts', `state=${state}`);
    // Dismiss the opening mission dialogue (it opens if the player walks
    // past Vera's garage) so later key presses reach the game.
    for (let i = 0; i < 3; i++) {
      if (await page.isVisible('#dialogue-box')) { await page.click('#dialogue-box'); await page.waitForTimeout(200); }
    }
    // Movement: hold W, the player must move.
    const p0 = await page.evaluate(() => ({ x: window.__cb.G.player.x, y: window.__cb.G.player.y }));
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(900);
    await page.keyboard.up('KeyW');
    const p1 = await page.evaluate(() => ({ x: window.__cb.G.player.x, y: window.__cb.G.player.y }));
    if (Math.abs(p1.y - p0.y) > 30) pass('move-on-foot', `dy=${Math.round(p1.y - p0.y)}`);
    else fail('move-on-foot', `from ${JSON.stringify(p0)} to ${JSON.stringify(p1)}`);
    // Walk to the sports car by the garage, press E, assert in a car.
    await page.evaluate(() => {
      const g = window.__cb.G;
      g.player.x = 666; g.player.y = 1430;
    });
    // E may first advance an open dialogue; retry until in a car.
    let inCar = null;
    for (let i = 0; i < 4 && !inCar; i++) {
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(300);
      inCar = await page.evaluate(() => { const g = window.__cb.G; return g.player.inCar ? g.player.inCar.type : null; });
    }
    if (inCar) pass('enter-car', `in ${inCar}`);
    else fail('enter-car', 'E did not enter a car');
    // Drive forward for 2 s (car placed on the road, facing east).
    const c0 = await page.evaluate(() => {
      const c = window.__cb.G.player.inCar;
      c.x = 700; c.y = 1400; c.angle = 0; c.speed = 0;
      return { x: c.x, y: c.y };
    });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2000);
    await page.keyboard.up('KeyW');
    const c1 = await page.evaluate(() => { const c = window.__cb.G.player.inCar; return c ? { x: c.x, y: c.y } : null; });
    if (c1 && Math.hypot(c1.x - c0.x, c1.y - c0.y) > 150) pass('drive-car', `moved ${Math.round(Math.hypot(c1.x - c0.x, c1.y - c0.y))} px`);
    else fail('drive-car', `from ${JSON.stringify(c0)} to ${JSON.stringify(c1)}`);
    // Exit, then shoot: ammo must drop.
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(300);
    const ammo0 = await page.evaluate(() => window.__cb.G.player.ammo);
    await page.mouse.click(640, 300);
    await page.waitForTimeout(400);
    const ammo1 = await page.evaluate(() => window.__cb.G.player.ammo);
    if (ammo1 < ammo0) pass('shoot', `ammo ${ammo0} -> ${ammo1}`);
    else fail('shoot', `ammo stayed ${ammo0}`);
    if (errors.length === 0) pass('cold-no-console-errors', '0 errors during cold play');
    else fail('cold-no-console-errors', errors.join(' | '));
    await ctx.close();
  }

  // ---- MISSION ARC (autoplay, all 8 in sequence) ----
  if (MODE === 'all' || MODE === 'arc') {
    const { ctx, page, errors } = await newPage(browser, `http://localhost:${PORT}/?autoplay=1`);
    await clickNewGame(page);
    const done = new Set();
    const tStart = Date.now();
    let lastLog = 0;
    while (Date.now() - tStart < 12 * 60 * 1000) {
      // Respawn if the driver died mid-mission.
      const over = await page.evaluate(() => !document.getElementById('game-over-screen').classList.contains('hidden'));
      if (over) {
        await page.click('#btn-respawn');
        await page.waitForTimeout(500);
      }
      const st = await page.evaluate(() => {
        const g = window.__cb.G;
        return {
          done: [...g.save.missionsDone],
          mission: g.mission ? g.mission.def.id + '/stage' + g.mission.stageI : null,
          state: g.state, hp: Math.round(g.player.health),
          stars: g.wanted.stars, cash: g.player.cash,
          inCar: g.player.inCar ? g.player.inCar.type : null,
          px: Math.round(g.player.inCar ? g.player.inCar.x : g.player.x),
          py: Math.round(g.player.inCar ? g.player.inCar.y : g.player.y),
        };
      });
      for (const id of st.done) {
        if (!done.has(id)) { done.add(id); console.log(`  mission done: ${id} at ${Math.round((Date.now() - tStart) / 1000)}s (cash $${st.cash})`); }
      }
      if (done.size >= 8) break;
      if (Date.now() - lastLog > 30000) {
        lastLog = Date.now();
        console.log(`  ... ${Math.round((Date.now() - tStart) / 1000)}s: mission=${st.mission} state=${st.state} hp=${st.hp} stars=${st.stars} pos=${st.px},${st.py} ${st.inCar || 'foot'}`);
      }
      await page.waitForTimeout(1000);
    }
    const names = ['m1-first-job', 'm2-tail-chase', 'm3-hot-wheels', 'm4-dockside', 'm5-midnight-run', 'm6-collector', 'm7-highway-heat', 'm8-crescent-job'];
    for (const id of names) {
      if (done.has(id)) pass(`mission-${id}`, 'completed end-to-end by autoplay');
      else fail(`mission-${id}`, 'NOT completed within 12 min');
    }
    if (errors.length === 0) pass('arc-no-console-errors', '0 errors during the full arc');
    else fail('arc-no-console-errors', errors.join(' | '));
    await ctx.close();
  }

  // ---- EDGE TESTS ----
  if (MODE === 'all' || MODE === 'edge') {
    const { ctx, page, errors } = await newPage(browser, `http://localhost:${PORT}/`);
    await clickNewGame(page);
    // 1. Building collision: place the player west of a building, walk east.
    const hit = await page.evaluate(async () => {
      const g = window.__cb.G;
      const b = g.world.buildings.find((bb) => bb.w > 60 && bb.h > 60);
      g.player.x = b.x - 30; g.player.y = b.y + b.h / 2;
      g.input.right = true;
      for (let i = 0; i < 60; i++) { g.update(1 / 60); }
      g.input.right = false;
      return { playerX: g.player.x, buildingX: b.x };
    });
    if (hit.playerX < hit.buildingX - 5) pass('building-collision', `player stopped at x=${Math.round(hit.playerX)} < wall ${Math.round(hit.buildingX)}`);
    else fail('building-collision', JSON.stringify(hit));
    // 2. Enter/exit car 5 times in a row (dismiss any open dialogue first).
    for (let i = 0; i < 3; i++) {
      if (await page.isVisible('#dialogue-box')) { await page.click('#dialogue-box'); await page.waitForTimeout(200); }
    }
    let ok = true;
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => { const g = window.__cb.G; g.player.x = 666; g.player.y = 1430; });
      let inCar = false;
      for (let a = 0; a < 3 && !inCar; a++) {
        await page.keyboard.press('KeyE');
        await page.waitForTimeout(200);
        inCar = await page.evaluate(() => !!window.__cb.G.player.inCar);
      }
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(200);
      const outCar = await page.evaluate(() => !window.__cb.G.player.inCar);
      if (!inCar || !outCar) ok = false;
    }
    if (ok) pass('enter-exit-x5', '5 enter/exit cycles clean');
    else fail('enter-exit-x5', 'a cycle failed');
    // 3. Wanted 0 -> 5 -> 0 via the Spray Shop (autoplay escape mission).
    await page.evaluate(() => { window.__cb.addWantedHeat(95); window.__cb.G.player.cash = 500; });
    const stars5 = await page.evaluate(() => window.__cb.G.wanted.stars);
    await page.evaluate(() => { window.__cb.setAutoplay(true); window.__cb.startMission('m3-hot-wheels'); });
    let stars0 = false;
    for (let i = 0; i < 90; i++) {
      await page.waitForTimeout(1000);
      const s = await page.evaluate(() => window.__cb.G.wanted.stars);
      if (s === 0) { stars0 = true; break; }
    }
    await page.evaluate(() => window.__cb.setAutoplay(false));
    if (stars5 === 5 && stars0) pass('wanted-5-to-0', '5 stars -> spray shop -> 0 stars');
    else fail('wanted-5-to-0', `stars5=${stars5} stars0=${stars0}`);
    // 4. Pause -> resume -> save -> reload -> Continue restores state.
    // Reset to a clean playing state first (the wanted test may have ended
    // the run in game-over).
    const st = await page.evaluate(() => window.__cb.G.state);
    if (st === 'gameover') {
      if (await page.isVisible('#btn-respawn')) { await page.click('#btn-respawn'); await page.waitForTimeout(500); }
    } else if (st !== 'playing') {
      await page.click('#btn-new-game'); await page.waitForTimeout(500);
    }
    await page.evaluate(() => { window.__cb.G.player.cash = 777; });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const paused = await page.isVisible('#pause-menu');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const resumed = await page.evaluate(() => window.__cb.G.state === 'playing');
    await page.evaluate(() => { window.__cb.G.player.cash = 777; window.__cb.saveGame(window.__cb.G); });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__cb);
    const contVisible = await page.isVisible('#btn-continue');
    await page.click('#btn-continue');
    await page.waitForTimeout(400);
    const cash = await page.evaluate(() => window.__cb.G.player.cash);
    if (paused && resumed && contVisible && cash === 777) pass('save-reload-continue', 'pause/resume/save/reload/Continue, cash $777 restored');
    else fail('save-reload-continue', `paused=${paused} resumed=${resumed} cont=${contVisible} cash=${cash}`);
    // 5. Corrupt save -> fresh start with a message, no crash.
    await page.evaluate(() => localStorage.setItem('crescent-bay-save-v1', 'not-json{{{'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__cb);
    const msg = await page.evaluate(() => document.getElementById('save-slot').textContent);
    const noCrash = await page.evaluate(() => window.__cb.G.state === 'title');
    if (noCrash && /damaged/i.test(msg)) pass('corrupt-save', `message: "${msg}"`);
    else fail('corrupt-save', `state ok=${noCrash} msg="${msg}"`);
    if (errors.length === 0) pass('edge-no-console-errors', '0 errors during edge tests');
    else fail('edge-no-console-errors', errors.join(' | '));
    await ctx.close();
  }

  // ---- FPS ----
  if (MODE === 'all' || MODE === 'fps') {
    const { ctx, page, errors } = await newPage(browser, `http://localhost:${PORT}/?autoplay=1`);
    await clickNewGame(page);
    await page.evaluate(() => { window.__cb.addWantedHeat(40); });
    await page.waitForTimeout(5000);
    const fps = await page.evaluate(() => Math.round(window.__cb.G.fps));
    if (fps >= 50) pass('fps-headless', `${fps} fps with wanted chase running`);
    else fail('fps-headless', `${fps} fps < 50`);
    await ctx.close();
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} tests passed`);
process.exit(bad.length === 0 ? 0 : 1);
