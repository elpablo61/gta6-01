// Crescent Bay playtest harness (Playwright, headless Chromium).
// Modes: cold | edge | arc | fps | all
//   cold: fresh profile, title appears, New Game starts, move, enter a car,
//         drive, shoot, zero console errors.
//   edge: wall collision, enter/exit x5, wanted 5 -> 0 via Spray Shop,
//         pause/resume/save/reload/Continue, corrupt save.
//   arc:  all eight missions end to end by autopilot, per-mission timing.
//   fps:  frames per second during a wanted chase.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8123;
const BASE = 'http://127.0.0.1:' + PORT;
const mode = process.argv[2] || 'cold';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startServer() {
  const proc = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: ROOT, stdio: 'pipe' });
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(BASE + '/index.html');
      if (res.ok) return proc;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('server did not come up');
}

async function newPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  return { context, page, errors };
}

async function startGame(page) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#title-screen', { state: 'visible', timeout: 10000 });
  await sleep(800);
  await page.click('#new-game-btn');
  await sleep(600);
}

function check(errors, label, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (detail ? ' — ' + detail : ''));
  return ok;
}

async function modeCold(browser) {
  const { context, page, errors } = await newPage(browser);
  let pass = 0; let total = 0;
  const t0 = Date.now();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  total++; if (check(errors, 'title screen appears', await page.isVisible('#title-screen'), Date.now() - t0 + 'ms')) pass++;
  await page.click('#new-game-btn');
  await sleep(500);
  total++; if (check(errors, 'New Game starts playing', await page.evaluate(() => window.__game.state.mode === 'playing'))) pass++;
  const p0 = await page.evaluate(() => ({ x: window.__game.state.player.x, y: window.__game.state.player.y }));
  await page.keyboard.down('KeyW');
  await sleep(1000);
  await page.keyboard.up('KeyW');
  const p1 = await page.evaluate(() => ({ x: window.__game.state.player.x, y: window.__game.state.player.y }));
  total++; if (check(errors, 'player moves on foot', Math.hypot(p1.x - p0.x, p1.y - p0.y) > 50, Math.round(Math.hypot(p1.x - p0.x, p1.y - p0.y)) + 'px')) pass++;
  await page.evaluate(() => {
    const s = window.__game.state;
    const car = s.cars.find((c) => c.type === 'sports' && c.role === 'parked');
    s.player.x = car.x; s.player.y = car.y;
  });
  await page.keyboard.press('KeyE');
  await sleep(400);
  total++; if (check(errors, 'enter the sports car', await page.evaluate(() => !!window.__game.state.playerCar))) pass++;
  const c0 = await page.evaluate(() => ({ x: window.__game.state.player.x, y: window.__game.state.player.y }));
  await page.keyboard.down('KeyW');
  await sleep(2000);
  await page.keyboard.up('KeyW');
  const c1 = await page.evaluate(() => ({ x: window.__game.state.player.x, y: window.__game.state.player.y }));
  total++; if (check(errors, 'car drives', Math.hypot(c1.x - c0.x, c1.y - c0.y) > 100, Math.round(Math.hypot(c1.x - c0.x, c1.y - c0.y)) + 'px')) pass++;
  await page.keyboard.press('KeyE');
  await sleep(300);
  const ammo0 = await page.evaluate(() => window.__game.state.player.ammo);
  await page.mouse.click(700, 300);
  await sleep(300);
  const ammo1 = await page.evaluate(() => window.__game.state.player.ammo);
  total++; if (check(errors, 'shooting spends ammo', ammo1 < ammo0, ammo0 + ' -> ' + ammo1)) pass++;
  total++; if (check(errors, 'zero console errors', errors.length === 0, errors.join(' | ') || 'clean')) pass++;
  console.log('COLD: ' + pass + '/' + total);
  await context.close();
  return pass === total;
}

async function modeEdge(browser) {
  const { context, page, errors } = await newPage(browser);
  let pass = 0; let total = 0;
  await startGame(page);
  // 1. Buildings block movement.
  await page.evaluate(() => {
    const s = window.__game.state;
    const b = s.world.buildings[0];
    s.player.x = b.x - b.w / 2 - 22; s.player.y = b.y;
    s.camera.x = s.player.x; s.camera.y = s.player.y;
  });
  const wallBefore = await page.evaluate(() => window.__game.state.player.x);
  const wallEdge = await page.evaluate(() => { const b = window.__game.state.world.buildings[0]; return b.x - b.w / 2; });
  await page.keyboard.down('KeyD');
  await sleep(1200);
  await page.keyboard.up('KeyD');
  const wallAfter = await page.evaluate(() => window.__game.state.player.x);
  total++; if (check(errors, 'building blocks movement', wallAfter < wallEdge + 2, 'edge ' + Math.round(wallEdge) + ', stopped at ' + Math.round(wallAfter))) pass++;
  // 2. Enter/exit a car five times.
  await page.evaluate(() => {
    const s = window.__game.state;
    const car = s.cars.find((c) => c.role === 'parked');
    s.player.x = car.x; s.player.y = car.y;
  });
  let toggles = 0;
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('KeyE');
    await sleep(250);
    const inCar = await page.evaluate(() => !!window.__game.state.playerCar);
    if (inCar === (i % 2 === 0)) toggles++;
    await sleep(100);
  }
  total++; if (check(errors, 'enter/exit car x5', toggles === 5, toggles + '/5 toggles correct')) pass++;
  // 3. Wanted 5 -> 0 via the Spray Shop.
  await page.evaluate(() => {
    const s = window.__game.state;
    window.__game.setWantedHeat(95);
    if (!s.playerCar) {
      const car = s.cars.find((c) => c.role === 'parked');
      s.player.x = car.x; s.player.y = car.y;
    }
  });
  await page.keyboard.press('KeyE');
  await sleep(300);
  await page.evaluate(() => {
    const s = window.__game.state;
    if (s.playerCar) { s.playerCar.x = 200; s.playerCar.y = -1000; s.playerCar.speed = 0; s.player.x = 200; s.player.y = -1000; }
    else { s.player.x = 200; s.player.y = -1000; }
  });
  await sleep(6000);
  const stars = await page.evaluate(() => window.__game.state.wantedStars);
  total++; if (check(errors, 'wanted 5 -> 0 via Spray Shop', stars === 0, 'stars now ' + stars)) pass++;
  // 4. Pause -> resume -> save -> reload -> Continue restores cash.
  await page.evaluate(() => { window.__game.state.player.cash = 777; });
  await page.keyboard.press('Escape');
  await sleep(300);
  total++; if (check(errors, 'pause opens', await page.evaluate(() => window.__game.state.mode === 'paused'))) pass++;
  await page.keyboard.press('Escape');
  await sleep(300);
  total++; if (check(errors, 'pause resumes', await page.evaluate(() => window.__game.state.mode === 'playing'))) pass++;
  await page.evaluate(() => window.__game.saveGame());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#title-screen', { state: 'visible', timeout: 10000 });
  await page.click('#continue-btn');
  await sleep(500);
  const cash = await page.evaluate(() => window.__game.state.player.cash);
  total++; if (check(errors, 'Continue restores saved cash', cash === 777, 'cash ' + cash)) pass++;
  // 5. Corrupt save starts fresh instead of crashing.
  await page.evaluate(() => localStorage.setItem('crescent-bay-save-v1', '{not json'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#title-screen', { state: 'visible', timeout: 10000 });
  await page.click('#continue-btn');
  await sleep(500);
  const freshMode = await page.evaluate(() => window.__game.state.mode);
  total++; if (check(errors, 'corrupt save starts fresh', freshMode === 'playing', 'mode ' + freshMode)) pass++;
  total++; if (check(errors, 'zero console errors', errors.length === 0, errors.join(' | ') || 'clean')) pass++;
  console.log('EDGE: ' + pass + '/' + total);
  await context.close();
  return pass === total;
}

async function modeArc(browser) {
  const { context, page, errors } = await newPage(browser);
  await startGame(page);
  await page.evaluate(() => window.__game.setAutoplay(true));
  const t0 = Date.now();
  const seen = new Set();
  let pass = true;
  let lastSnap = 0;
  while (Date.now() - t0 < 2400000) {
    const done = await page.evaluate(() => window.__game.state.completedMissions.slice());
    for (const id of done) {
      if (!seen.has(id)) { seen.add(id); console.log('MISSION DONE ' + id + ' at ' + Math.round((Date.now() - t0) / 1000) + 's'); }
    }
    if (done.length >= 8) break;
    if (Date.now() - lastSnap > 30000) {
      lastSnap = Date.now();
      const snap = await page.evaluate(() => {
        const s = window.__game.state;
        const m = s.mission;
        return {
          mode: s.mode, gameOver: s.gameOver,
          mission: m ? m.def.id + ' stage' + m.stage + ' tgt' + m.targetIndex + (m.def.type === 'chase' ? ' hits' + m.hits : '') : 'none',
          marker: s.missionMarker ? Math.round(s.missionMarker.x) + ',' + Math.round(s.missionMarker.y) : 'none',
          px: Math.round(s.player.x), py: Math.round(s.player.y),
          inCar: s.playerCar ? s.playerCar.type : 'foot',
          speed: Math.round(s.playerCar ? s.playerCar.speed : 0),
          heat: Math.round(s.wantedHeat), stars: s.wantedStars,
          cops: s.cops.length, policeCars: s.policeCars.length,
          enemies: s.enemies.filter((e) => e.health > 0).length,
          hp: Math.round(s.player.health), cash: Math.round(s.player.cash),
          gameTime: Math.round(s.time),
        };
      });
      console.log('SNAP ' + Math.round((Date.now() - t0) / 1000) + 's ' + JSON.stringify(snap));
    }
    const modeNow = await page.evaluate(() => window.__game.state.mode);
    if (modeNow === 'gameover') {
      console.log('GAME OVER during arc — respawning');
      await page.evaluate(() => window.__game.respawn());
      await sleep(500);
    }
    await sleep(5000);
  }
  const done = await page.evaluate(() => window.__game.state.completedMissions.slice());
  console.log('ARC: ' + done.length + '/8 missions in ' + Math.round((Date.now() - t0) / 1000) + 's — ' + done.join(', '));
  if (done.length < 8) { pass = false; console.log('ARC FAIL: unfinished missions remain'); }
  if (errors.length) { pass = false; console.log('ARC console errors: ' + errors.join(' | ')); }
  else console.log('ARC: zero console errors');
  await context.close();
  return pass;
}

async function modeFps(browser) {
  const { context, page, errors } = await newPage(browser);
  await startGame(page);
  await page.evaluate(() => { window.__game.setWantedHeat(70); window.__game.setAutoplay(true); });
  await sleep(4000);
  const fps = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = () => {
      frames++;
      if (performance.now() - start < 5000) requestAnimationFrame(tick);
      else resolve(frames / 5);
    };
    requestAnimationFrame(tick);
  }));
  console.log('FPS during wanted chase: ' + Math.round(fps));
  const ok = fps >= 50 && errors.length === 0;
  console.log((ok ? 'PASS' : 'FAIL') + '  fps >= 50 and zero console errors' + (errors.length ? ' — ' + errors.join(' | ') : ''));
  await context.close();
  return ok;
}

const server = await startServer();
const browser = await chromium.launch({ args: ['--no-sandbox'] });
let ok = true;
try {
  if (mode === 'cold' || mode === 'all') ok = (await modeCold(browser)) && ok;
  if (mode === 'edge' || mode === 'all') ok = (await modeEdge(browser)) && ok;
  if (mode === 'fps' || mode === 'all') ok = (await modeFps(browser)) && ok;
  if (mode === 'arc' || mode === 'all') ok = (await modeArc(browser)) && ok;
} finally {
  await browser.close();
  server.kill();
}
process.exit(ok ? 0 : 1);
