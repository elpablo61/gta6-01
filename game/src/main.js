// Crescent Bay — boot and the main loop. Update order is deliberate:
// the autopilot runs BEFORE the dialog branch and before the player,
// so it can accept mission dialogs and drive without the manual
// driving branch braking the car back to zero on the same frame.
import { S, resetRunState } from './state.js';
import { RNG_SEED, SHOT_SEED } from './config.js';
import { generateWorld } from './world.js';
import { initInput, pressed, keys, mouse, endFrameInput } from './input.js';
import { initAudio, resumeAudio, cycleRadio, sfx } from './audio.js';
import { spawnParkedCars, separateCars } from './vehicles.js';
import { initTraffic, updateTraffic } from './traffic.js';
import { initPeds, updatePeds } from './pedestrians.js';
import { updateWanted, updatePolice, setHeat } from './police.js';
import { updateHeli } from './helicopter.js';
import { initWeapons, updateCrates, switchWeapon, cycleWeapon, spawnWorldCrates } from './weapons.js';
import { updateBullets, updateEnemies, updatePickups } from './combat.js';
import { updateMissions, updateCourier, offerMission, acceptDialog, restartAfterDeath, currentMissionDef } from './missions.js';
import { updatePlayer, exitCar } from './player.js';
import { updateAutopilot, AP_HOOKS } from './autopilot.js';
import { render } from './render.js';
import { showDialog, showTitle, showPause, showGameOver } from './hud.js';
import { buildGarageMenu, openGarageMenu, garageMenuOpen, closeGarageMenu, nearGarage } from './garage.js';
import { listSlots, loadSlot, manualSave, saveToSlot } from './save.js';
import { applyShot } from './shots.js';
import { makeRng } from './random.js';

const canvas = document.getElementById('game');
const g = canvas.getContext('2d');
let viewW = 1280, viewH = 720;
let lastT = 0;
let rng = makeRng(RNG_SEED);

function resize() {
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = viewW;
  canvas.height = viewH;
}

export function startNewGame(slot = 0) {
  resetRunState();
  S.activeSlot = slot;
  S.mode = 'playing';
  S.paused = false;
  S.radioStation = 0;
  initWeapons();
  rng = makeRng(S.seed);
  generateWorld(S.seed);
  S.cars = [];
  S.peds = [];
  spawnParkedCars(rng);
  initTraffic(12);
  initPeds(20);
  spawnWorldCrates();
  S.dialogCooldown = 5;
  S.startedAt = performance.now();
  resumeAudio();
  hideOverlays();
}

function hideOverlays() {
  for (const id of ['title-screen', 'pause-menu', 'game-over-screen']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
}

function continueFromSlot(i) {
  startNewGame(i);
  if (loadSlot(i)) {
    // Loaded progress: offer the next mission, keep the cash.
    S.dialogCooldown = 1;
  }
}

function buildTitleSlots() {
  const list = document.getElementById('save-slots');
  if (!list) return;
  const slots = listSlots();
  list.innerHTML = slots.map((s) => {
    if (s.status === 'ok') {
      const d = new Date(s.date);
      return `<button class="slot" data-slot="${s.slot}">Slot ${s.slot + 1} — Mission ${s.missionIndex + 1} — $${s.cash} — ${d.toLocaleDateString()}</button>`;
    }
    if (s.status === 'corrupt') return `<button class="slot corrupt" data-slot="${s.slot}">Slot ${s.slot + 1} — Corrupt (click to overwrite)</button>`;
    return `<button class="slot empty" data-slot="${s.slot}">Slot ${s.slot + 1} — Empty</button>`;
  }).join('');
  list.querySelectorAll('.slot').forEach((b) => {
    b.addEventListener('click', () => {
      const i = Number(b.dataset.slot);
      const slot = listSlots()[i];
      if (slot.status === 'ok') continueFromSlot(i);
      else startNewGame(i);
    });
  });
}

function wireOverlays() {
  document.getElementById('new-game-btn').addEventListener('click', () => { startNewGame(0); });
  document.getElementById('resume-btn').addEventListener('click', () => { S.mode = 'playing'; S.paused = false; });
  document.getElementById('save-btn').addEventListener('click', () => {
    manualSave();
    document.getElementById('save-btn').textContent = 'Saved!';
    setTimeout(() => { document.getElementById('save-btn').textContent = 'Save game'; }, 1200);
  });
  document.getElementById('quit-btn').addEventListener('click', () => {
    manualSave();
    S.mode = 'title';
    buildTitleSlots();
  });
  document.getElementById('retry-btn').addEventListener('click', () => { restartAfterDeath(); });
  document.getElementById('dialog-accept').addEventListener('click', () => { acceptDialog(); });
  document.getElementById('dialog-close').addEventListener('click', () => { S.dialog = null; });
  document.querySelector('.garage-close').addEventListener('click', () => closeGarageMenu());
  buildGarageMenu();
  buildTitleSlots();
}

function update(dt) {
  S.time += dt;
  S.dayTime = (S.dayTime + dt * 0.01) % 24;
  if (S.dialogCooldown > 0) S.dialogCooldown -= dt;

  // Autopilot FIRST (dialog accept, driving) — never after the dialog branch.
  let autopilotDrove = false;
  if (S.autopilot) autopilotDrove = updateAutopilot(dt);

  if (S.mode === 'playing' && !S.paused) {
    // Garage: E near the garage in a car opens the menu, not exit.
    if (pressed.interact && nearGarage() && S.player.inCar) {
      openGarageMenu();
      pressed.interact = false;
    }
    // Radio + weapons.
    if (pressed.radio) cycleRadio();
    if (pressed.cycleWeapon) cycleWeapon();
    if (pressed.weapon1) switchWeapon('pistol');
    if (pressed.weapon2) switchWeapon('smg');
    if (pressed.weapon3) switchWeapon('shotgun');
    if (pressed.pause) { S.mode = 'paused'; S.paused = true; }

    updatePlayer(dt, autopilotDrove);
    updateTraffic(dt, S.dayTime);
    updatePeds(dt);
    updateCourier(dt);
    updateWanted(dt);
    updatePolice(dt);
    updateHeli(dt);
    updateBullets(dt);
    updateEnemies(dt);
    updatePickups(dt);
    updateCrates(dt);
    updateMissions(dt);
    separateCars(dt);
    if (S.weapons) S.weapons.cooldown = Math.max(0, S.weapons.cooldown - dt);
    // FX decay.
    for (const fx of S.fx) fx.life -= dt;
    S.fx = S.fx.filter((f) => f.life > 0);
    S.flags.gunshot = false;
    // Mouse world coordinates for aiming.
    mouse.wx = mouse.x + S.camera.x;
    mouse.wy = mouse.y + S.camera.y;
    // Camera follows the player.
    S.camera.x = Math.max(0, Math.min(3200 - viewW, S.player.x - viewW / 2));
    S.camera.y = Math.max(0, Math.min(3200 - viewH, S.player.y - viewH / 2));
  }
  if (S.mode === 'paused' && pressed.pause) { S.mode = 'playing'; S.paused = false; }
  if (S.mode === 'over' && !S.autopilot && pressed.accept) restartAfterDeath();

  showDialog();
  showTitle();
  showPause();
  showGameOver();
  if (S.mode === 'title') buildTitleSlotsThrottled();
}

let slotBuildAt = 0;
function buildTitleSlotsThrottled() {
  const now = performance.now();
  if (now - slotBuildAt > 1000) { slotBuildAt = now; buildTitleSlots(); }
}

function frame(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  try {
    update(dt);
    if (S.mode !== 'title' || true) render(g, viewW, viewH);
  } catch (err) {
    console.error(err);
  }
  endFrameInput();
  requestAnimationFrame(frame);
}

function boot() {
  resize();
  window.addEventListener('resize', resize);
  initInput(canvas);
  initAudio();
  wireOverlays();
  const params = new URLSearchParams(location.search);
  const seedParam = Number(params.get('seed'));
  S.seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : RNG_SEED;
  S.autopilot = params.get('autopilot') === '1' || params.has('shot');
  AP_HOOKS.newGame = () => startNewGame(0);
  generateWorld(S.seed);
  initWeapons();
  spawnParkedCars(rng);
  initTraffic(12);
  initPeds(20);
  spawnWorldCrates();
  const shot = params.get('shot');
  if (shot) {
    applyShot(shot, startNewGame);
  } else {
    S.mode = 'title';
  }
  // Debug / playtest hook: the suites drive the game through this.
  window.__game = {
    S,
    startNewGame,
    acceptDialog,
    setHeat,
    saveToSlot,
    listSlots,
    version: 'crescent-bay-v4',
  };
  requestAnimationFrame(frame);
}

boot();
