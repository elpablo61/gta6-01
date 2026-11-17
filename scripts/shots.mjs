// Take the four screenshots (1280x800, JPEG) from the game's own poses:
// each ?shot= plays from a fresh seeded world with the autopilot driving,
// waits for full renders, asserts zero console errors, and saves the shot.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8124;
const BASE = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const shots = JSON.parse(readFileSync(join(ROOT, 'shots.json'), 'utf8'));
mkdirSync(join(ROOT, 'screenshots'), { recursive: true });

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: ROOT, stdio: 'pipe' });
for (let i = 0; i < 40; i++) {
  try { const res = await fetch(BASE + '/index.html'); if (res.ok) break; } catch { /* not up */ }
  await sleep(250);
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });
let failed = false;
try {
  for (const shot of shots) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(BASE + '/' + shot.query, { waitUntil: 'domcontentloaded' });
    // Let the pose's autopilot drive and the scene settle, fonts ready.
    await sleep(4200);
    const path = join(ROOT, 'screenshots', shot.name);
    await page.screenshot({ path, type: 'jpeg', quality: 85 });
    const mode = await page.evaluate(() => window.__game.state.mode);
    console.log(shot.name + '  mode=' + mode + '  errors=' + errors.length + (errors.length ? '  ' + errors.join(' | ') : ''));
    if (errors.length) failed = true;
    await context.close();
  }
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
