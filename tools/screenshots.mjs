// Crescent Bay — screenshots. Serves game/ on port 8932 (serve.ts), loads
// each pose from shots.json as ?seed=7&shot=<id> with the autopilot playing
// it, waits the pose's waitMs, and saves the frame as a JPEG in
// screenshots/. Every shot must come in at or under 200 KiB, with zero
// console errors; a summary lands in tools/screenshots.json.
import { spawn } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 8932;
const BASE = `http://localhost:${PORT}`;
const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell`;
const SHOTS = JSON.parse(readFileSync(new URL('../shots.json', import.meta.url), 'utf8'));
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

const server = serve();
if (!(await waitForServer())) { console.error('server did not come up'); server.kill(); process.exit(1); }
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const summary = [];
try {
  for (const shot of SHOTS.shots) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${BASE}/?seed=${SHOTS.seed}&shot=${shot.id}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.__game, null, { timeout: 15000 });
    await sleep(shot.waitMs);
    const path = `screenshots/${shot.file}`;
    await page.screenshot({ path, type: 'jpeg', quality: 82 });
    const bytes = statSync(path).size;
    const ok = bytes <= 200 * 1024 && errors.length === 0;
    summary.push({ shot: shot.id, file: shot.file, bytes, errors: errors.length, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${shot.id} -> ${path} (${Math.round(bytes / 1024)} KiB, ${errors.length} console errors)`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
writeFileSync('tools/screenshots.json', JSON.stringify(summary, null, 2));
const failed = summary.filter((s) => !s.ok);
console.log(`\nscreenshots: ${summary.length - failed.length}/${summary.length} passed`);
process.exit(failed.length ? 1 : 0);
