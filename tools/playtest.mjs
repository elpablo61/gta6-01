// Crescent Bay — playtest suites, driven by Playwright in headless Chromium.
//   node tools/playtest.mjs cold            fresh load, title, new game, move, radio, save
//   node tools/playtest.mjs edge            heat/star table, pause, weapon keys, corrupt slot
//   node tools/playtest.mjs arc [mission]   full 12-mission autopilot arc, or one mission (arc m3)
//   node tools/playtest.mjs fps             frame rate during a wanted chase
// Serves game/ on port 8931 via serve.ts. Long arc runs append one state
// line per poll to /tmp/arc-progress.txt so a killed run still shows where
// it stopped. Exit code 0 only when every check passes; per-mode JSON is
// written under tools/.
import { spawn } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 8931;
const BASE = `http://localhost:${PORT}`;
const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell`;
const PROGRESS = '/tmp/arc-progress.txt';
const MISSIONS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'];
// Generous per-mission ceilings (seconds); the autopilot finished every
// mission far inside these in the v2 rebuild, and the arc aborts at 55 min.
const LIMITS = { m1: 300, m2: 300, m3: 240, m4: 360, m5: 300, m6: 420, m7: 420, m8: 600, m9: 420, m10: 420, m11: 420, m12: 600 };

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail: String(detail ?? '') });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve() {
  return spawn('node', ['serve.ts', '--port', String(PORT)], {
    cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore',
  });
}

async function waitForServer(tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${BASE}/index.html`);
      if (res.ok) return true;
    } catch { /* server not up yet */ }
    await sleep(200);
  }
  return false;
}

// Open the game at a URL, wait for the debug hook, collect console errors.
async function openGame(browser, query) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/${query}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__game, null, { timeout: 15000 });
  return { page, errors };
}

function snapshot(page) {
  return page.evaluate(() => {
    const S = window.__game.S;
    return {
      mode: S.mode, x: Math.round(S.player.x), y: Math.round(S.player.y),
      hp: S.player.hp, cash: S.player.cash, heat: S.heat, stars: S.stars,
      radio: S.radioStation, missionIndex: S.missionIndex,
      completed: S.completedMissions, inCar: !!S.player.inCar,
      weapon: S.weapons ? S.weapons.current : null,
      owned: S.weapons ? Object.keys(S.weapons.owned).filter((k) => S.weapons.owned[k]) : [],
      heli: !!S.heli, garageBuys: S.stats.garageBuys,
      dialog: !!S.dialog, cars: S.cars.length, peds: S.peds.length,
      paused: S.paused, stage: S.mission ? S.mission.stages[S.mission.stageIndex].type : null,
      mission: S.mission ? S.mission.id : null,
      over: S.overReason || null, cops: S.police.length, patrols: S.patrols.length,
      enemies: S.enemies.length,
      carSpd: S.player.inCar ? Math.round(S.player.inCar.speed) : null,
      carHp: S.player.inCar ? Math.round(S.player.inCar.hp) : null,
      carTop: S.player.inCar ? S.player.inCar.top : null,
      routeDest: S.player.inCar && S.player.inCar.routeDest ? `${S.player.inCar.routeDest.x},${S.player.inCar.routeDest.y}` : null,
      rec: S.player.inCar ? !!S.player.inCar.rec : null,
    };
  });
}

async function beginRun(page) {
  await page.evaluate(() => window.__game.startNewGame(0));
  await sleep(500);
}

async function cold(browser) {
  const { page, errors } = await openGame(browser, '?seed=7');
  await sleep(1500);
  const titleShown = await page.evaluate(() => {
    const el = document.getElementById('title-screen');
    return !!el && getComputedStyle(el).display !== 'none';
  });
  check('cold: title screen visible', titleShown);
  const overlays = await page.evaluate(() =>
    ['title-screen', 'pause-menu', 'game-over-screen', 'mission-dialog', 'controls-list']
      .every((id) => document.getElementById(id)));
  check('cold: all semantic overlays exist', overlays);
  const slots = await page.evaluate(() => window.__game.listSlots());
  check('cold: 3 save slots listed', Array.isArray(slots) && slots.length === 3,
    JSON.stringify(slots.map((s) => s.status)));
  await beginRun(page);
  let s = await snapshot(page);
  check('cold: new game is playing', s.mode === 'playing', s.mode);
  const before = s;
  await page.keyboard.down('w');
  await sleep(1200);
  await page.keyboard.up('w');
  s = await snapshot(page);
  check('cold: player moves on W', Math.hypot(s.x - before.x, s.y - before.y) > 20,
    `${before.x},${before.y} -> ${s.x},${s.y}`);
  const radioBefore = s.radio;
  await page.keyboard.press('r');
  await sleep(300);
  s = await snapshot(page);
  check('cold: R cycles the radio station', s.radio === (radioBefore + 1) % 3,
    `${radioBefore} -> ${s.radio}`);
  const saved = await page.evaluate(() => window.__game.saveToSlot(1));
  const slotsAfter = await page.evaluate(() => window.__game.listSlots());
  check('cold: save to slot 1 reads back ok', saved && slotsAfter[1].status === 'ok', slotsAfter[1].status);
  const shot = await page.screenshot({ type: 'png' });
  check('cold: canvas renders (screenshot non-trivial)', shot.length > 20000, `${shot.length} bytes`);
  check('cold: zero console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

async function edge(browser) {
  const { page, errors } = await openGame(browser, '?seed=7');
  await beginRun(page);
  // Heat -> stars table from config STAR_THRESHOLDS [0,12,30,52,74,92].
  const table = [[0, 0], [11, 0], [12, 1], [29, 1], [30, 2], [51, 2], [52, 3], [73, 3], [74, 4], [91, 4], [92, 5], [100, 5]];
  let tableOk = true; let tableDetail = '';
  for (const [heat, want] of table) {
    const got = await page.evaluate((h) => { window.__game.setHeat(h); return window.__game.S.stars; }, heat);
    if (got !== want) { tableOk = false; tableDetail = `heat ${heat}: want ${want} got ${got}`; break; }
  }
  check('edge: heat -> stars thresholds', tableOk, tableDetail);
  await page.evaluate(() => window.__game.setHeat(0));
  await page.keyboard.press('Escape');
  await sleep(300);
  let s = await snapshot(page);
  check('edge: Escape pauses', s.mode === 'paused', s.mode);
  await page.keyboard.press('Escape');
  await sleep(300);
  s = await snapshot(page);
  check('edge: Escape resumes', s.mode === 'playing', s.mode);
  // Only the pistol is owned at the start: Digit2 and Q must not switch.
  await page.keyboard.press('2');
  await sleep(200);
  s = await snapshot(page);
  check('edge: Digit2 with no SMG stays on pistol', s.weapon === 'pistol', s.weapon);
  await page.keyboard.press('q');
  await sleep(200);
  s = await snapshot(page);
  check('edge: Q cycles with one weapon stays on pistol', s.weapon === 'pistol', s.weapon);
  const stations = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('r');
    await sleep(200);
    stations.push((await snapshot(page)).radio);
  }
  check('edge: radio cycles 1,2,0 and wraps', stations.join(',') === '1,2,0', stations.join(','));
  await page.evaluate(() => localStorage.setItem('crescentbay_save_2', '{not json'));
  const slots = await page.evaluate(() => window.__game.listSlots());
  check('edge: corrupt slot reports corrupt', slots[2].status === 'corrupt', slots[2].status);
  const stillBoots = await page.evaluate(() => { window.__game.startNewGame(0); return true; });
  check('edge: game still boots with a corrupt slot', stillBoots);
  s = await snapshot(page);
  check('edge: world has cars and peds', s.cars > 5 && s.peds > 5, `cars ${s.cars} peds ${s.peds}`);
  check('edge: zero console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

async function arc(browser, only) {
  const { page, errors } = await openGame(browser, '?seed=7&autopilot=1');
  writeFileSync(PROGRESS, `arc start ${new Date().toISOString()} only=${only || 'all'}\n`);
  await beginRun(page);
  const targets = only ? [only] : MISSIONS;
  const perMission = {};
  let heliSeen = false; let smgSeen = false; let garageBought = false;
  const arcStart = Date.now();
  for (const id of targets) {
    const targetIndex = MISSIONS.indexOf(id);
    if (only) {
      // Jump straight to the requested mission with some cash to spend.
      await page.evaluate((idx) => {
        const S = window.__game.S;
        S.missionIndex = idx;
        S.completedMissions = idx;
        S.mission = null;
        S.player.cash = 5000;
      }, targetIndex);
      await sleep(500);
    }
    const deadline = Date.now() + (LIMITS[id] + 120) * 1000;
    const missionStart = Date.now();
    let done = false; let failReason = '';
    while (Date.now() < deadline) {
      const s = await snapshot(page);
      if (s.heli) heliSeen = true;
      if (s.owned.includes('smg')) smgSeen = true;
      if (s.garageBuys > 0) garageBought = true;
      appendFileSync(PROGRESS,
        `${new Date().toISOString()} ${id} idx=${s.missionIndex} completed=${s.completed} mode=${s.mode} ` +
        `pos=${s.x},${s.y} heat=${s.heat} stars=${s.stars} heli=${s.heli} cash=${s.cash} ` +
        `mis=${s.mission} stage=${s.stage} inCar=${s.inCar} carSpd=${s.carSpd} carHp=${s.carHp} carTop=${s.carTop} routeDest=${s.routeDest} rec=${s.rec} paused=${s.paused} dialog=${s.dialog} ` +
        `hp=${Math.round(s.hp)} over=${s.over} cops=${s.cops} patrols=${s.patrols} enemies=${s.enemies}\n`);
      if (s.completed > targetIndex) { done = true; break; }
      if (s.mode === 'over') { failReason = `game over during mission (${s.over || '?'})`; break; }
      if (s.hp <= 0) { failReason = 'player hp 0'; break; }
      await sleep(2000);
    }
    const secs = Math.round((Date.now() - missionStart) / 1000);
    perMission[id] = { ok: done, secs, failReason };
    check(`arc: ${id} completable by autopilot`, done, done ? `${secs}s` : failReason || 'timeout');
    if (!done) break;
    if (Date.now() - arcStart > 55 * 60 * 1000) { check('arc: aborted (55min cap)', false, 'too slow'); break; }
  }
  if (!only) {
    check('arc: helicopter seen in the m9/m12 run', heliSeen);
    check('arc: SMG picked up in the m10 run', smgSeen);
    check('arc: garage purchase in the m11 run', garageBought);
  }
  check('arc: zero console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  writeFileSync(`tools/playtest-arc-${only || 'all'}.json`,
    JSON.stringify({ perMission, heliSeen, smgSeen, garageBought, errors }, null, 2));
  await page.close();
}

async function fps(browser) {
  const { page, errors } = await openGame(browser, '?seed=7&autopilot=1');
  await beginRun(page);
  await page.evaluate(() => window.__game.setHeat(58));
  await sleep(1000);
  const frames = await page.evaluate(() => new Promise((resolve) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 10000) requestAnimationFrame(tick); else resolve(n); };
    requestAnimationFrame(tick);
  }));
  const avg = (frames / 10).toFixed(1);
  check('fps: >=50 during a wanted chase', frames / 10 >= 50, `${avg} fps (${frames} frames / 10s)`);
  check('fps: zero console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

const mode = process.argv[2];
const only = process.argv[3];
if (!['cold', 'edge', 'arc', 'fps'].includes(mode)) {
  console.error('usage: node tools/playtest.mjs <cold|edge|arc|fps> [mission]');
  process.exit(2);
}
if (mode === 'arc' && only && !MISSIONS.includes(only)) {
  console.error(`unknown mission ${only}; use one of ${MISSIONS.join(' ')}`);
  process.exit(2);
}
const server = serve();
if (!(await waitForServer())) { console.error('server did not come up'); server.kill(); process.exit(1); }
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
try {
  if (mode === 'cold') await cold(browser);
  else if (mode === 'edge') await edge(browser);
  else if (mode === 'arc') await arc(browser, only);
  else if (mode === 'fps') await fps(browser);
} finally {
  await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${mode}: ${results.length - failed.length}/${results.length} passed`);
writeFileSync(`tools/playtest-${mode}${only ? '-' + only : ''}.json`, JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
