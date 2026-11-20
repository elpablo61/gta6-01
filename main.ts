// Crescent Bay entrypoint (Node 22, standard library only).
// The game itself is plain static files under game/ — a desktop browser
// loads game/index.html offline, no libraries, no network requests.
// This program hands the entry in: it copies game/ and screenshots/
// beside this file into the output directory and writes
// /output/dossier.json with the vendored make.fun library.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Count real files under a directory (recursive), for the build log.
function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const e of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (e.isFile()) n++;
  }
  return n;
}

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}
// The contact sheet is a verification artifact, not an entry screenshot:
// the dossier caps screenshots at 4, so keep it out of the output dir.
for (const sheet of ['contact-sheet.jpg', 'contact-sheet-gray.jpg']) {
  rmSync(join(out, 'screenshots', sheet), { force: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the others refuse an entry the scorer would refuse (more than
// 4 screenshots or one over 256 KiB; more than 993 files in game/ or
// 48 MiB of game files in all, or a path under game/ over 1000 bytes).
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);
const size = Buffer.byteLength(dossier, 'utf8');
console.log(`dossier.json: ${size} bytes`);
console.log(`screenshots: ${countFiles(join(here, 'screenshots'))} files; game: ${countFiles(join(here, 'game'))} files`);
if (size > 1450000) console.warn(`WARNING: dossier over 1,450,000 bytes (${size})`);
