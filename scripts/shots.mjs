// Take the 4 gta6-01 screenshots with headless Chromium (Playwright-core).
// Usage: node scripts/shots.mjs [--port 8080]
// Serves game/ via serve.ts, loads each ?shot= pose, waits for the pose to
// finish rendering (window.__shotReady), asserts zero console/page errors,
// and saves JPEG quality 85 screenshots at 1280x800.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/home/hatch/workspace/.pw-tools/node_modules/playwright-core');
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const port = 8080;
const shots = JSON.parse(readFileSync(join(repo, 'shots.json'), 'utf8'));

const server = spawn('node', ['serve.ts'], { cwd: repo, stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 1200));

const results = [];
try {
  const browser = await chromium.launch({
    executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-gl=swiftshader'],
  });
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
    const t0 = Date.now();
    await page.goto(`http://localhost:${port}/${shot.query}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.__shotReady === true, { timeout: 60000 });
    await page.waitForTimeout(300);
    const path = join(repo, 'screenshots', shot.name);
    await page.screenshot({ path, type: 'jpeg', quality: 85 });
    const ms = Date.now() - t0;
    results.push({ name: shot.name, errors, ms });
    console.log(`${shot.name}: ready in ${ms} ms, errors: ${errors.length}`);
    for (const e of errors) console.log('  !! ' + e);
    await page.close();
  }
  await browser.close();
} finally {
  server.kill();
}
const bad = results.filter((r) => r.errors.length > 0);
console.log(bad.length === 0 ? 'ALL SHOTS: ZERO ERRORS' : `SHOTS WITH ERRORS: ${bad.length}`);
process.exit(bad.length === 0 ? 0 : 1);
