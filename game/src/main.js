import {
  GAME_TITLE, WORLD_SEED, STEP, CLOCK_START_H, DAY_LENGTH_S,
  SPRAY_SHOP_COST,
} from './config.js';
import { makeRng } from './random.js';
import { buildWorld } from './world.js';
import { createInput, pressKey } from './input.js';
import { createAudio, startMusicLoop, playClick } from './audio.js';
import {
  createPlayer, updatePlayerOnFoot, updateBullets, updateParticles,
  respawnPlayer, toast, addWantedHeat, updateWantedStars, damageVehicle,
} from './player.js';
import { updatePlayerCar, tryEnterExitCar, createVehicle } from './vehicles.js';
import { updateTraffic, spawnParkedCars } from './traffic.js';
import { updatePedestrians } from './pedestrians.js';
import { updateWantedHeat, updatePolice } from './police.js';
import { updateEnemies, updatePickups, spawnPickup } from './combat.js';
import {
  MISSION_ARC, startMission, updateMission, onPlayerRespawn,
  advanceDialogue, updateDialogue,
} from './missions.js';
import { saveGame, loadGame, autosave, clearSave } from './save.js';
import { render } from './render.js';
import { runShot } from './shots.js';

// Crescent Bay — a complete top-down 2D open-world crime game.
// Fixed-timestep loop (1/60 s), deterministic seeded city, DOM menus over a
// live canvas world. No library, no network, no external assets.
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(window.location.search);
const seedParam = Number(params.get('seed'));
const WORLD_SEED_USED = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : WORLD_SEED;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const G = {
  title: GAME_TITLE,
  world: buildWorld(WORLD_SEED_USED),
  rng: makeRng(WORLD_SEED_USED + 7),
  input: createInput(canvas),
  audio: createAudio(),
  player: null,
  cars: [], peds: [], cops: [], enemies: [], bullets: [], particles: [], pickups: [],
  wanted: { heat: 0, stars: 0, hiddenT: 0 },
  mission: null, missionMarker: null, dialogue: null,
  toast: null, clockH: CLOCK_START_H, nightAlpha: 0, time: 0,
  state: 'title', gameOverReason: null, roadblock: null,
  camera: { x: 0, y: 0 }, canvas, ctx,
  save: { missionsDone: [] },
  debug: params.has('debug'), fps: 60, frameMs: 0,
  shotsFiredRecently: 0, muzzle: null, muzzleEnemy: null,
  shotMode: false, stuckT: 0, stuckAcc: 0,
  lightCanvas: null,
};

const spawn = G.world.landmarks.fixerGarage;
G.player = createPlayer(spawn.x - 30, spawn.y + 60);
spawnParkedCars(G);
// Pickups: health at the hospital, ammo at the docks and the bank.
spawnPickup(G, G.world.landmarks.hospital.x + 40, G.world.landmarks.hospital.y, 'health');
spawnPickup(G, G.world.landmarks.docks.x - 20, G.world.landmarks.docks.y + 40, 'ammo');
spawnPickup(G, G.world.landmarks.bank.x + 40, G.world.landmarks.bank.y, 'ammo');
spawnPickup(G, G.world.landmarks.marina.x, G.world.landmarks.marina.y - 40, 'health');

function nightAlphaFor(clockH) {
  if (clockH >= 20 || clockH < 6) return 0.85;
  if (clockH >= 18) return 0.85 * ((clockH - 18) / 2);
  if (clockH < 7) return 0.85 * ((7 - clockH) / 1);
  return 0;
}

function update(dt) {
  G.time += dt;
  G.clockH = (G.clockH + (dt / DAY_LENGTH_S) * 24) % 24;
  G.nightAlpha = nightAlphaFor(G.clockH);
  if (G.toast) {
    G.toast.t -= dt;
    if (G.toast.t <= 0) G.toast = null;
  }
  updateDialogue(G, dt);
  if (G.state === 'title') {
    // The city stays alive behind the title screen.
    updateTraffic(G, dt);
    updatePedestrians(G, dt);
    return;
  }
  if (G.state !== 'playing') return;
  // Edge-triggered keys, consumed once per step.
  const pressed = G.input.pressed;
  if (pressed.KeyE || pressed.Enter) {
    if (G.dialogue) advanceDialogue(G);
    else tryEnterExitCar(G);
  }
  if (pressed.Escape || pressed.KeyP) togglePause();
  if (pressed.F3) { G.debug = !G.debug; }
  if (pressed.KeyM) { if (saveGame(G)) toast(G, 'Game saved.'); }
  G.input.pressed = {};
  // The Spray Shop: drive in with $50+ and a wanted level to lose the heat.
  const p = G.player;
  if (p.inCar && G.wanted.stars > 0) {
    const s = G.world.landmarks.sprayShop;
    if (Math.hypot(p.inCar.x - s.x, p.inCar.y - s.y) < 80 && p.cash >= SPRAY_SHOP_COST) {
      p.cash -= SPRAY_SHOP_COST;
      G.wanted.heat = 0;
      updateWantedStars(G);
      toast(G, 'New paint job at the Spray Shop — the cops lost your car. -$50');
    }
  }
  if (p.inCar) updatePlayerCar(G, dt);
  else updatePlayerOnFoot(G, dt);
  updateTraffic(G, dt);
  updatePedestrians(G, dt);
  updateWantedHeat(G, dt);
  updatePolice(G, dt);
  updateMission(G, dt);
  updateEnemies(G, dt);
  updateBullets(G, dt);
  updateParticles(G, dt);
  updatePickups(G, dt);
  G.shotsFiredRecently = Math.max(0, G.shotsFiredRecently - dt);
  // Car-vs-car bumps: the player's car shoves traffic (and takes damage).
  // NOTE: damageVehicle can wreck the player's car and bail the player out
  // (inCar -> null), so re-check inCar on every iteration. Bump damage is
  // throttled like crash damage: a grind must not deal damage every step.
  if (p.inCar && !p.inCar.wrecked) {
    for (const car of G.cars) {
      if (!p.inCar || p.inCar.wrecked) break;
      if (car === p.inCar || car.wrecked) continue;
      const d = Math.hypot(car.x - p.inCar.x, car.y - p.inCar.y);
      if (d < 46 && d > 0.01) {
        const push = (46 - d) / 2;
        const a = Math.atan2(car.y - p.inCar.y, car.x - p.inCar.x);
        car.x += Math.cos(a) * push; car.y += Math.sin(a) * push;
        if (Math.abs(p.inCar.speed) > 200 && (p.inCar.crashT || 0) <= 0) {
          p.inCar.crashT = 0.5;
          damageVehicle(G, car, 3);
          damageVehicle(G, p.inCar, 2);
        }
      }
    }
  }
  // Wrecked player car: bail out.
  if (p.inCar && p.inCar.wrecked) {
    p.inCar = null;
    p.x += 40; p.y += 40;
  }
}
G.update = update;

function renderGame() { render(G); }
G.render = renderGame;

function togglePause() {
  if (G.state === 'playing') {
    G.state = 'paused';
    document.getElementById('pause-menu')?.classList.remove('hidden');
  } else if (G.state === 'paused') {
    G.state = 'playing';
    document.getElementById('pause-menu')?.classList.add('hidden');
  }
}

function startNewGame() {
  G.audio.ensure();
  startMusicLoop(G.audio);
  clearSave();
  G.save.missionsDone = [];
  G.player = createPlayer(spawn.x - 30, spawn.y + 60);
  G.wanted.heat = 0; updateWantedStars(G);
  G.mission = null; G.enemies = []; G.cops = [];
  G.clockH = CLOCK_START_H;
  document.getElementById('title-screen')?.classList.add('hidden');
  document.getElementById('game-over-screen')?.classList.add('hidden');
  G.state = 'playing';
  toast(G, 'Welcome to Crescent Bay, Rook. Find the yellow marker for your first job.');
}

function continueGame() {
  const res = loadGame();
  if (!res.ok) { startNewGame(); return; }
  applySaveData(res.data);
  G.audio.ensure();
  startMusicLoop(G.audio);
  document.getElementById('title-screen')?.classList.add('hidden');
  G.state = 'playing';
  toast(G, 'Welcome back, Rook. The city kept your seat warm.');
}

function applySaveData(data) {
  const p = G.player;
  p.cash = data.cash;
  p.health = data.health;
  p.ammo = data.ammo;
  p.kills = data.kills || 0;
  p.x = data.x; p.y = data.y;
  G.wanted.heat = data.heat || 0;
  updateWantedStars(G);
  G.clockH = data.clockH ?? CLOCK_START_H;
  G.save.missionsDone = [...(data.missionsDone || [])];
  if (data.inCarType) {
    const car = createVehicle(data.inCarType, data.x, data.y, 0);
    car.damage = data.carDamage || 0;
    G.cars.push(car);
    p.inCar = car;
  }
  if (data.missionId) {
    startMission(G, data.missionId);
    if (G.mission) {
      G.mission.stageI = Math.min(data.missionStage || 0, G.mission.def.stages.length - 1);
    }
  }
}

function quitToTitle() {
  autosave(G);
  G.state = 'title';
  document.getElementById('pause-menu')?.classList.add('hidden');
  document.getElementById('game-over-screen')?.classList.add('hidden');
  showTitle();
}

function showTitle() {
  const title = document.getElementById('title-screen');
  if (!title) return;
  title.classList.remove('hidden');
  const res = loadGame();
  const cont = document.getElementById('btn-continue');
  const slot = document.getElementById('save-slot');
  const list = document.getElementById('mission-select');
  if (res.ok) {
    if (cont) cont.classList.remove('hidden');
    if (slot) {
      const d = new Date(res.data.savedAt);
      slot.textContent = `Save: ${res.data.missionsDone.length} missions done · $${res.data.cash} · ${d.toLocaleDateString()}`;
    }
  } else {
    if (cont) cont.classList.add('hidden');
    if (slot) slot.textContent = res.corrupt ? 'Save file was damaged — starting fresh.' : 'No save yet — start a new game.';
  }
  if (list) {
    list.innerHTML = '';
    const done = res.ok ? res.data.missionsDone : [];
    for (const m of MISSION_ARC) {
      const li = document.createElement('li');
      li.textContent = (done.includes(m.id) ? '✓ ' : '○ ') + m.name;
      list.appendChild(li);
    }
  }}

// DOM wiring.
document.getElementById('btn-new-game')?.addEventListener('click', () => { playClick(G.audio); startNewGame(); });
document.getElementById('btn-continue')?.addEventListener('click', () => { playClick(G.audio); continueGame(); });
document.getElementById('btn-resume')?.addEventListener('click', () => { playClick(G.audio); togglePause(); });
document.getElementById('btn-save')?.addEventListener('click', () => { playClick(G.audio); if (saveGame(G)) toast(G, 'Game saved.'); });
document.getElementById('btn-quit-title')?.addEventListener('click', () => { playClick(G.audio); quitToTitle(); });
document.getElementById('btn-respawn')?.addEventListener('click', () => {
  playClick(G.audio);
  respawnPlayer(G);
  onPlayerRespawn(G);
});
document.getElementById('btn-gameover-title')?.addEventListener('click', () => { playClick(G.audio); quitToTitle(); });
document.getElementById('dialogue-box')?.addEventListener('click', () => advanceDialogue(G));
document.getElementById('title-screen')?.addEventListener('click', () => G.audio.ensure(), { once: true });

// Fixed-timestep loop: simulate in 1/60 s steps, render the remainder.
let last = performance.now();
let acc = 0;
let fpsFrames = 0, fpsT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min(100, now - last);
  last = now;
  acc += elapsed / 1000;
  let steps = 0;
  const t0 = performance.now();
  while (acc >= STEP && steps < 5) {
    update(STEP);
    acc -= STEP;
    steps++;
  }
  if (steps === 5) acc = 0;
  render(G);
  G.frameMs = performance.now() - t0;
  fpsFrames++; fpsT += elapsed;
  if (fpsT >= 500) {
    G.fps = (fpsFrames * 1000) / fpsT;
    fpsFrames = 0; fpsT = 0;
  }
}

// Test + autopilot hooks (used by Playwright playtests; harmless in play).
window.__cb = {
  G, startMission, startNewGame, continueGame, saveGame, loadGame,
  addWantedHeat, pressKey: (code) => pressKey(G.input, code),
  setInput: (patch) => Object.assign(G.input, patch),
  missionArc: MISSION_ARC,
};

// Shot mode: run the deterministic pose synchronously, render once, stop.
// No requestAnimationFrame loop — the frame is fully reproducible.
const shotName = params.get('shot');
if (shotName) {
  if (shotName !== 'start') document.getElementById('title-screen')?.classList.add('hidden');
  runShot(G, shotName);
} else {
  showTitle();
  requestAnimationFrame(frame);
}

export { G };
