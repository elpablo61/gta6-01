// Crescent Bay (gta6-01) hand-in program. Node 22, standard library only.
//
// The game is plain static files in game/ beside this file, and screenshots/
// holds the four JPEGs its maker took. This program stages both into the
// output directory the grader reads (or MAKEFUN_OUTPUT_DIR outside the
// grader) and writes dossier.json with the vendored make.fun builder, the
// summary the judge reads. Run it like this:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// Caps mirror the scorer's own limits: at most 4 screenshots, each at most
// 256 KiB; game/ at most 993 files and 48 MiB; dossier text at most 160 KiB.
const dossierText = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossierText);
console.log('dossier written:', join(outputDir, 'dossier.json'), dossierText.length, 'bytes');
// The gate refuses a dossier over 1,500,000 bytes; warn well before that
// so a too-heavy screenshot set is caught here, not at submission.
if (dossierText.length > 1450000) {
  console.error('WARNING: dossier is over the 1,450,000 byte safety cap — shrink the screenshots before submitting.');
  process.exitCode = 1;
}
