# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/elpablo61/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/elpablo61/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Crescent Bay is a 2D top-down open-world crime game that plays offline in a
desktop browser from its own static files — no libraries, no network, no
external assets. You are Rook, a driver-for-hire in the coastal city of
Crescent Bay: steal cars, outrun the police, work 12 story missions for
fixers Mara and Dex, and build your way from a first pickup job to the Bay
Finale.

The city is alive: an 8×8 road grid with five districts (Northside, Old
Town, Downtown, Waterfront, South Docks), traffic that follows the roads,
pedestrians on the sidewalks, a day/night cycle with headlights and street
lamps, and a wanted system with foot cops, patrol cars, roadblocks and a
police helicopter with a spotlight that blocks heat decay while it is on
you. Three weapons (pistol, SMG, shotgun), weapon crates, a Fixer Garage
that sells engine / armor / tires / brakes upgrades and paint, three radio
stations, a Spray Shop that clears your heat, and three save slots.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step.

Controls: WASD / arrows to move, mouse to aim, click to shoot, Shift to
sprint, E to enter / exit a car or accept a mission, 1 / 2 / 3 to switch
weapons, Q to cycle weapons, R to change the radio station, P or Esc to
pause.

## Playtest

```sh
npm install
node tools/playtest.mjs cold
node tools/playtest.mjs edge
node tools/playtest.mjs arc
node tools/playtest.mjs fps
node tools/screenshots.mjs
python3 tools/contact-sheet.py
```

## How it is built

Vanilla Canvas 2D and WebAudio, procedural art and synth sound, a
deterministic RNG (mulberry32, seed 20261118). The world is 3200×3200,
routes are found by BFS on the junction graph, and the renderer paints
the city once to a static layer and draws only the moving entities each
frame. `main.ts` (Node 22) copies `game/` and `screenshots/` to the
output directory and builds `dossier.json` with the vendored make.fun
library.

---

Entered on [make.fun](https://make.fun/?ref=vky0ybyt&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards
