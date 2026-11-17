import { GAME_TITLE, WORLD_SEED, PLAYER_MAX_HEALTH, HEAT_PER_CAR_THEFT, HEAT_PER_PED_HIT, MISSION_TRIGGER_RADIUS } from './config.js';
import { makeRng } from './random.js';
import { createWorld, nearestNode, findRoute, nearestRoadPoint, isOnRoad } from './world.js';
import { createInput } from './input.js';
import { createPlayer, updatePlayerOnFoot, damagePlayer, healPlayer } from './player.js';
import { makeCar, spawnParkedCars, nearestParkedCar, driveCar, separateCars, updateCarSmoke, carAheadDistance } from './vehicles.js';
import { updateTraffic } from './traffic.js';
import { updatePedestrians, scatterPeds } from './pedestrians.js';
import { updateWantedHeat, updatePolice, addWantedHeat, setWantedHeat, starsForHeat } from './police.js';
import { updateBullets, tryPlayerShoot, updateEnemies } from './combat.js';
import { MISSION_ARC, startMission, updateMission, updateCourier, missionObjectiveText } from './missions.js';
import { drawHud } from './hud.js';
import { createCamera, renderWorld, isNight } from './render.js';
import { saveGame, loadGame, autosave, hasSave, clearSave } from './save.js';
import { applyShot } from './shots.js';
import { playSiren, playGunshot, startMusicLoop, playPickup, playClick, playCrash, playEngine } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function createGameState(seed) {
  const world = createWorld(seed);
  const state = {
    world, seed,
    rng: makeRng(seed),
    time: 0, timeOfDay: 10,
    mode: 'title',
    player: createPlayer(0, 0),
    playerCar: null,
    cars: [], peds: [], cops: [], policeCars: [],
    bullets: [], particles: [], skids: [], enemies: [], pickups: [],
    courier: null,
    wantedHeat: 0, wantedStars: 0, lastCrimeAt: -99,
    mission: null, missionIndex: -1, missionMarker: null, nextMissionAt: null,
    completedMissions: [],
    camera: createCamera(),
    gameOver: null,
    fps: 60, frameCount: 0, fpsAt: 0,
    flashText: '', flashUntil: 0,
    lastShotAt: 0, gunshotAt: -99,
    lastTrafficSpawn: 0, lastPedSpawn: 0, lastCopSpawn: 0, lastRoadblockAt: -99,
    roadblock: null, showDebug: false,
    autoplay: false, autoCruise: 420, autoRoute: null, autoRouteTarget: null,
    audioCtx: null, audioMaster: null, musicOn: false, musicTimer: null,
    sirenAt: 0, engineAt: 0,
    audio: null,
  };
  state.audio = {
    siren: () => playSiren(state),
    gunshot: () => playGunshot(state),
    pickup: () => playPickup(state),
    click: () => playClick(state),
  };
  state.flashMessage = (text, secs) => { state.flashText = text; state.flashUntil = state.time + secs; };
  state.autosave = () => autosave(state);
  state.addSkid = (x, y, angle) => {
    if (state.skids.length > 120) state.skids.shift();
    state.skids.push({ x, y, angle, life: 7 });
  };
  return state;
}

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seedParam = Number(params.get('seed')) || WORLD_SEED;
const state = createGameState(seedParam);
const input = createInput(canvas);

spawnParkedCars(state, 14);
// A sports car near the start so the first job is fun immediately.
const starterCar = makeCar('sports', 60, 0, 0, 'parked');
starterCar.color = '#e8b400';
state.cars.push(starterCar);
// A few pickups scattered on roads.
state.pickups.push(
  { x: 400, y: 0, kind: 'health' },
  { x: -400, y: 800, kind: 'ammo' },
  { x: 800, y: 400, kind: 'health' },
  { x: -800, y: -400, kind: 'ammo' },
);

// ---- DOM menus (ids are the semantic hooks the outline shows) ----
const titleScreen = document.getElementById('title-screen');
const pauseMenu = document.getElementById('pause-menu');
const gameOverScreen = document.getElementById('game-over-screen');
const continueBtn = document.getElementById('continue-btn');
const newGameBtn = document.getElementById('new-game-btn');
const resumeBtn = document.getElementById('resume-btn');
const saveBtn = document.getElementById('save-btn');
const quitBtn = document.getElementById('quit-btn');
const respawnBtn = document.getElementById('respawn-btn');
const gameOverTitle = document.getElementById('game-over-title');
const gameOverText = document.getElementById('game-over-text');
const statusLine = document.getElementById('status');

function showOnly(el) {
  for (const e of [titleScreen, pauseMenu, gameOverScreen]) if (e) e.style.display = 'none';
  if (el) el.style.display = 'flex';
}
function refreshTitle() {
  if (!continueBtn) return;
  continueBtn.style.display = hasSave() ? 'block' : 'block';
  continueBtn.classList.toggle('dimmed', !hasSave());
}

function startNewGame() {
  clearSave();
  const fresh = createGameState(seedParam);
  Object.assign(state, fresh);
  state.audio = fresh.audio;
  state.flashMessage = fresh.flashMessage;
  state.autosave = fresh.autosave;
  state.addSkid = fresh.addSkid;
  spawnParkedCars(state, 14);
  const sc = makeCar('sports', 60, 0, 0, 'parked');
  sc.color = '#e8b400';
  state.cars.push(sc);
  state.pickups.push(
    { x: 400, y: 0, kind: 'health' },
    { x: -400, y: 800, kind: 'ammo' },
  );
  state.mode = 'playing';
  showOnly(null);
  startMusicLoop(state);
  startMission(state, 0);
  if (statusLine) statusLine.textContent = 'New game started. First job: pick up the package.';
}

function continueGame() {
  const result = loadGame(state);
  if (!result.ok) {
    state.flashMessage(result.reason === 'corrupt' ? 'Save was damaged — starting fresh.' : 'No save found — starting fresh.', 4);
    startNewGame();
    return;
  }
  state.mode = 'playing';
  showOnly(null);
  startMusicLoop(state);
  const next = Math.min(state.missionIndex + 1, MISSION_ARC.length - 1);
  state.nextMissionAt = state.time + 4;
  state.missionMarker = MISSION_ARC[next].startPoint;
  state.flashMessage('Welcome back, Rook. Next job at the yellow marker.', 4);
}

function respawn() {
  const p = state.player;
  p.health = PLAYER_MAX_HEALTH;
  p.cash = Math.max(0, p.cash - 200);
  p.x = 0; p.y = 0;
  if (state.playerCar) { state.playerCar = null; p.inCar = null; }
  state.wantedHeat = 0; state.wantedStars = 0;
  state.cops = []; state.enemies = [];
  state.gameOver = null;
  state.mode = 'playing';
  showOnly(null);
  if (state.mission) {
    const idx = state.mission.index;
    state.mission = null;
    startMission(state, idx);
  } else if (state.missionIndex >= 0 && state.missionIndex < MISSION_ARC.length - 1) {
    state.nextMissionAt = state.time + 4;
    state.missionMarker = MISSION_ARC[state.missionIndex + 1].startPoint;
  }
  state.flashMessage('Back on your feet. $200 hospital bill.', 3);
}

if (newGameBtn) newGameBtn.addEventListener('click', () => { playClick(state); startNewGame(); });
if (continueBtn) continueBtn.addEventListener('click', () => { playClick(state); continueGame(); });
if (resumeBtn) resumeBtn.addEventListener('click', () => { playClick(state); state.mode = 'playing'; showOnly(null); });
if (saveBtn) saveBtn.addEventListener('click', () => { playClick(state); saveGame(state); state.flashMessage('Game saved.', 2); });
if (quitBtn) quitBtn.addEventListener('click', () => { playClick(state); saveGame(state); state.mode = 'title'; refreshTitle(); showOnly(titleScreen); });
if (respawnBtn) respawnBtn.addEventListener('click', () => { playClick(state); respawn(); });

// ---- Car enter / exit ----
function tryInteract() {
  const p = state.player;
  if (state.playerCar) {
    // Exit: step out beside the car.
    const car = state.playerCar;
    car.role = 'parked';
    car.speed = 0;
    p.x = car.x - Math.cos(car.angle) * 0 - Math.sin(car.angle) * 42;
    p.y = car.y - Math.sin(car.angle) * 0 + Math.cos(car.angle) * 42;
    p.inCar = null;
    state.playerCar = null;
    return;
  }
  let best = null; let bestD = 80 * 80;
  for (const car of state.cars) {
    if (car.role !== 'parked' && car.role !== 'traffic') continue;
    if (car.role === 'traffic' && Math.abs(car.speed) > 60) continue;
    const d = (car.x - p.x) * (car.x - p.x) + (car.y - p.y) * (car.y - p.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (best) {
    if (best.role === 'traffic') {
      // Jacking a moving car: the driver flees on foot.
      state.peds.push({ x: best.x + 40, y: best.y + 40, angle: 0, speed: 190, color: '#e74c3c', target: null, fleeing: true, fleeUntil: state.time + 4, bob: 0 });
    }
    addWantedHeat(state, HEAT_PER_CAR_THEFT);
    best.role = 'player';
    best.driver = 'player';
    state.playerCar = best;
    p.inCar = best;
    p.x = best.x; p.y = best.y;
    state.flashMessage('Car taken — ' + best.type + '. The heat is on.', 2.5);
  }
}

// ---- Autopilot (drives the playtests and the screenshot poses) ----
function computeAutopilot(state) {
  const p = state.player;
  const v = { up: false, down: false, left: false, right: false, sprint: false, handbrake: false, shoot: false, aimX: p.x + 100, aimY: p.y, interact: false };
  const m = state.mission;
  let target = null;
  let isStatic = true;
  let cruise = state.autoCruise || 420;

  // Off-road recovery: a car that cut a corner into a building pocket
  // must drive back to the nearest road before resuming the route, or it
  // pushes at the same wall forever. Exempt when the mission target
  // itself is a close static landmark (marina/docks on the beach).
  if (state.playerCar && !isOnRoad(state.playerCar.x, state.playerCar.y)) {
    const cur = m ? (m.def.type === 'chase' && state.courier ? { x: state.courier.x, y: state.courier.y }
      : m.def.targets[m.targetIndex]) : state.missionMarker;
    const cd = cur ? Math.hypot(cur.x - state.playerCar.x, cur.y - state.playerCar.y) : 9999;
    if (cd >= 220) {
      const rp = nearestRoadPoint(state.world, state.playerCar.x, state.playerCar.y);
      driveToward(state, v, rp.x, rp.y, 200, true);
      return v;
    }
  }

  if (m && m.def.type === 'shootout' && m.stage === 0) {
    const alive = state.enemies.filter((e) => e.health > 0);
    if (alive.length) {
      const e = alive[0];
      target = { x: e.x, y: e.y };
      if (state.playerCar) {
        // Drive close, then get out and fight on foot.
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < 170) { v.interact = true; return v; }
        target = { x: e.x + 150, y: e.y + 120 };
      } else {
        v.aimX = e.x; v.aimY = e.y;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < 480) v.shoot = true;
        walkToward(state, v, e.x, e.y);
        return v;
      }
    }
  } else if (m && m.def.type === 'chase' && state.courier) {
    const c = state.courier;
    target = { x: c.x, y: c.y };
    isStatic = false;
    cruise = 520;
    if (!state.playerCar) {
      const fast = nearestParkedCar(state, p.x, p.y, 700, 400);
      if (fast) { walkToward(state, v, fast.x, fast.y); if (Math.hypot(fast.x - p.x, fast.y - p.y) < 70) v.interact = true; return v; }
      walkToward(state, v, c.x, c.y);
      return v;
    }
    if (state.playerCar.topSpeed < 400) {
      const fast = nearestParkedCar(state, state.playerCar.x, state.playerCar.y, 260, 400);
      if (fast) { v.interact = true; return v; }
    }
  } else if (m) {
    const t = m.def.targets[m.targetIndex];
    if (t) target = { x: t.x, y: t.y };
  } else if (state.missionMarker) {
    target = state.missionMarker;
  }
  if (!target) return v;

  if (!state.playerCar) {
    const fast = nearestParkedCar(state, p.x, p.y, 550, 0);
    const dist = Math.hypot(target.x - p.x, target.y - p.y);
    if (fast && dist > 260) {
      walkToward(state, v, fast.x, fast.y);
      if (Math.hypot(fast.x - p.x, fast.y - p.y) < 70) v.interact = true;
      return v;
    }
    walkToward(state, v, target.x, target.y);
    return v;
  }
  driveToward(state, v, target.x, target.y, cruise, isStatic);
  return v;
}

function walkToward(state, v, tx, ty) {
  const p = state.player;
  const d = Math.hypot(tx - p.x, ty - p.y);
  let wx = tx; let wy = ty;
  if (d > 220) {
    // Route along the road graph to the road point nearest the target,
    // then walk the final leg across open ground.
    const rp = nearestRoadPoint(state.world, tx, ty);
    const route = findRoute(state.world, { x: p.x, y: p.y }, rp);
    if (route.length) { wx = route[0].x; wy = route[0].y; }
    else { wx = rp.x; wy = rp.y; }
  }
  const dx = wx - p.x; const dy = wy - p.y;
  if (dy < -24) v.up = true;
  if (dy > 24) v.down = true;
  if (dx < -24) v.left = true;
  if (dx > 24) v.right = true;
  v.sprint = true;
}

function driveToward(state, v, tx, ty, cruise, isStatic) {
  const car = state.playerCar;
  if (!car) return;
  // (Re)build the graph route when the target moved or the route ran out.
  const key = Math.round(tx / 50) + ',' + Math.round(ty / 50);
  if (!state.autoRoute || state.autoRouteTarget !== key || state.autoRouteIndex >= state.autoRoute.length) {
    const from = nearestNode(state.world, car.x, car.y);
    const route = findRoute(state.world, from, { x: tx, y: ty });
    state.autoRoute = route;
    state.autoRouteTarget = key;
    state.autoRouteIndex = 0;
    state.autoFinalLeg = false;
  }
  let wx = tx; let wy = ty;
  if (state.autoRoute && state.autoRouteIndex < state.autoRoute.length) {
    const wp = state.autoRoute[state.autoRouteIndex];
    wx = wp.x; wy = wp.y;
    if (Math.hypot(wp.x - car.x, wp.y - car.y) < 55) state.autoRouteIndex++;
  } else if (isStatic && Math.hypot(tx - car.x, ty - car.y) < 220) {
    // Final leg straight to the exact point — static landmarks only, and
    // only when close. A first version drove straight at any target once
    // the route ran out, which cut across blocks, wedged the car on a
    // building, and stalled whole missions.
    wx = tx; wy = ty;
  } else {
    // Route empty but the target is still far (a moving target, or the car
    // shares the target's nearest node): aim at the road point nearest
    // the target instead of cutting straight across buildings.
    const rp = nearestRoadPoint(state.world, tx, ty);
    wx = rp.x; wy = rp.y;
  }
  const dx = wx - car.x; const dy = wy - car.y;
  const dist = Math.hypot(dx, dy);
  state.autoWaypoint = { x: wx, y: wy };
  const want = Math.atan2(dy, dx);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  v.up = true;
  if (Math.abs(diff) > 2.2 && Math.abs(car.speed) > 260) { v.handbrake = true; v.up = false; }
  if (Math.abs(diff) > 0.9 && Math.abs(car.speed) > 320) v.up = false;
  // Sharp turn ahead: brake hard instead of overshooting the junction
  // and cutting across the block behind it.
  if (Math.abs(diff) > 1.2 && Math.abs(car.speed) > 150) { v.up = false; v.down = true; }
  // Slow down for the waypoint itself. At full speed the car's minimum
  // turning radius (~48px) is wider than the arrival radius, so it falls
  // into a stable orbit around the node and never arrives. Capping speed
  // by distance shrinks the turning radius below the arrival radius and
  // the car spirals in. (Chase targets are exempt: ramming needs speed.)
  if (isStatic) {
    const wantSpeed = Math.min(cruise, Math.max(70, dist * 1.1));
    if (car.speed > wantSpeed) v.up = false;
  }
  v.left = diff < -0.08;
  v.right = diff > 0.08;
  // Slow for the car ahead.
  if (carAheadDistance(state, car, 120) < 60) v.up = false;
  car.cruiseLimit = cruise;
}

// ---- Main update ----
function update(state, dt) {
  state.time += dt;
  state.timeOfDay = (state.timeOfDay + dt * 0.02) % 24;
  const p = state.player;

  // Aim: mouse screen position -> world position.
  const rect = canvas.getBoundingClientRect();
  input.aimWorldX = state.camera.x + (input.mouseX - rect.width / 2) / state.camera.zoom;
  input.aimWorldY = state.camera.y + (input.mouseY - rect.height / 2) / state.camera.zoom;

  if (state.autoplay) {
    const v = computeAutopilot(state);
    input.virtual = v;
    if (v.interact && state.time - (state.lastAutoInteract || 0) > 0.6) {
      state.lastAutoInteract = state.time;
      tryInteract();
    }
  } else {
    input.virtual = null;
  }
  const move = input.read();

  if (input.justInteract && !state.autoplay) tryInteract();

  if (state.playerCar) {
    const car = state.playerCar;
    const steer = (move.left ? -1 : 0) + (move.right ? 1 : 0);
    let throttle = (move.up ? 1 : 0) + (move.down ? -1 : 0);
    let steerNow = steer;
    // Unstick: if the car has been pushing at under 25 speed for 2 seconds
    // (wedged on a building or another car), reverse out for a second.
    if (state.autoplay) {
      if (Math.abs(car.speed) < 25 && throttle !== 0) state.stuckTime = (state.stuckTime || 0) + dt;
      else state.stuckTime = 0;
      if (state.stuckTime > 2) { state.unstuckUntil = state.time + 1.2; state.stuckTime = 0; }
      if (state.time < (state.unstuckUntil || 0)) { throttle = -1; steerNow = -steer; }
    }
    const before = car.speed;
    const angleBefore = car.angle;
    driveCar(state, car, dt, throttle, steerNow, move.handbrake);
    // Hard cornering at speed leaves a skid trail; fast driving puffs
    // exhaust smoke — both freeze visibly in a still frame.
    const angleDelta = Math.abs(car.angle - angleBefore);
    if (angleDelta > 0.012 && Math.abs(car.speed) > 240 && state.time - (state.lastSkidAt || 0) > 0.1) {
      state.lastSkidAt = state.time;
      state.addSkid(car.x, car.y, car.angle);
    }
    if (Math.abs(car.speed) > 320 && Math.random() < dt * 6) {
      state.particles.push({
        x: car.x - Math.cos(car.angle) * car.length * 0.5,
        y: car.y - Math.sin(car.angle) * car.length * 0.5,
        vx: 0, vy: -18, life: 0.8, maxLife: 0.8, size: 6, kind: 'smoke', color: '#999999',
      });
    }
    if (Math.abs(before) > 220 && move.handbrake && state.time - (state.lastSkidAt || 0) > 0.12) {
      state.lastSkidAt = state.time;
      state.addSkid(car.x, car.y, car.angle);
    }
    p.x = car.x; p.y = car.y;
    p.angle = car.angle;
    updateCarSmoke(state, car, dt);
    playEngine(state, Math.abs(car.speed) / car.topSpeed);
    // Hitting a pedestrian at speed is a crime.
    for (const ped of state.peds) {
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < 34 && Math.abs(car.speed) > 150) {
        addWantedHeat(state, HEAT_PER_PED_HIT);
        scatterPeds(state, car.x, car.y, 300);
        state.peds = state.peds.filter((q) => q !== ped);
        playCrash(state);
        break;
      }
    }
  } else {
    updatePlayerOnFoot(state, dt, move);
    tryPlayerShoot(state, move);
  }

  updateTraffic(state, dt);
  updatePedestrians(state, dt);
  updatePolice(state, dt);
  updateWantedHeat(state, dt);
  updateCourier(state, dt);
  updateMission(state, dt);
  updateBullets(state, dt);
  updateEnemies(state, dt);
  separateCars(state);

  // Police cars live in state.cars too; keep their list in sync.
  state.policeCars = state.policeCars.filter((pc) => state.cars.includes(pc));

  // Pickups.
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pk = state.pickups[i];
    if (Math.hypot(pk.x - p.x, pk.y - p.y) < 36) {
      if (pk.kind === 'health') healPlayer(state, 40);
      else p.ammo += 30;
      state.pickups.splice(i, 1);
      playPickup(state);
      state.flashMessage(pk.kind === 'health' ? '+40 health' : '+30 ammo', 1.5);
    }
  }

  // Particles + skids age out.
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.life -= dt;
    pt.x += (pt.vx || 0) * dt;
    pt.y += (pt.vy || 0) * dt;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }
  for (let i = state.skids.length - 1; i >= 0; i--) {
    state.skids[i].life -= dt;
    if (state.skids[i].life <= 0) state.skids.splice(i, 1);
  }
  if (state.mission && state.mission.dialogue && state.time > state.mission.dialogueUntil) {
    state.mission.dialogue = null;
  }
  // Enemy bullets hitting the player are handled in combat.js; cop touch
  // busts are handled in police.js.
}

let lastTs = performance.now();
let acc = 0;
const STEP = 1 / 60;

function frame(ts) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.1, (ts - lastTs) / 1000);
  lastTs = ts;
  state.frameCount++;
  if (state.time - state.fpsAt > 0.5) {
    state.fps = state.frameCount / Math.max(0.01, state.time - state.fpsAt);
    state.frameCount = 0;
    state.fpsAt = state.time;
  }

  // Pause toggle is checked BEFORE any early exit, so pause can always
  // be left again (a v1 bug trapped the player in pause forever).
  if (input.justPause) {
    if (state.mode === 'playing') { state.mode = 'paused'; showOnly(pauseMenu); }
    else if (state.mode === 'paused') { state.mode = 'playing'; showOnly(null); }
  }
  if (input.justEnter && state.mode === 'title') startNewGame();

  if (state.mode === 'title') {
    // Living city behind the title screen: traffic and pedestrians move,
    // the camera drifts slowly around downtown.
    state.time += dtReal;
    state.timeOfDay = (state.timeOfDay + dtReal * 0.02) % 24;
    state.camera.x = Math.cos(state.time * 0.05) * 300;
    state.camera.y = Math.sin(state.time * 0.05) * 300;
    updateTraffic(state, dtReal);
    updatePedestrians(state, dtReal);
    renderWorld(state, ctx, { w: canvas.width, h: canvas.height });
    input.endFrame();
    return;
  }
  if (state.mode === 'paused') {
    renderWorld(state, ctx, { w: canvas.width, h: canvas.height });
    drawHud(state, ctx, { w: canvas.width, h: canvas.height });
    input.endFrame();
    return;
  }
  if (state.mode === 'gameover') {
    renderWorld(state, ctx, { w: canvas.width, h: canvas.height });
    drawHud(state, ctx, { w: canvas.width, h: canvas.height });
    if (gameOverTitle) gameOverTitle.textContent = state.gameOver === 'CAUGHT' ? 'CAUGHT' : 'DOWN';
    if (gameOverText) gameOverText.textContent = state.gameOver === 'CAUGHT'
      ? 'The precinct picked you up. You lose $200 and the job restarts.'
      : 'Rook is down. You lose $200 and the job restarts.';
    showOnly(gameOverScreen);
    input.endFrame();
    return;
  }

  acc += dtReal;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    update(state, STEP);
    acc -= STEP;
    steps++;
  }
  if (steps === 5) acc = 0;
  renderWorld(state, ctx, { w: canvas.width, h: canvas.height });
  drawHud(state, ctx, { w: canvas.width, h: canvas.height });
  // Edge flags clear at the END of the frame, after gameplay read them.
  input.endFrame();
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'F3') { state.showDebug = !state.showDebug; e.preventDefault(); }
});

// Shot poses run from a fresh seeded world with the autopilot driving.
if (shotName) {
  state.mode = 'playing';
  showOnly(null);
  const pose = applyShot(state, shotName);
  state.autoplay = !!pose.autopilot;
  if (pose.cruise) state.autoCruise = pose.cruise;
  if (shotName === 'start') { refreshTitle(); showOnly(titleScreen); }
} else {
  refreshTitle();
  showOnly(titleScreen);
}

// Test + screenshot harness API. startMission / addWantedHeat are bound to
// this state object, so calls from outside the game loop work.
window.__game = {
  state,
  startMission: (i) => startMission(state, i),
  addWantedHeat: (n) => addWantedHeat(state, n),
  setWantedHeat: (n) => setWantedHeat(state, n),
  setAutoplay: (on) => { state.autoplay = !!on; },
  startNewGame,
  continueGame,
  respawn,
  saveGame: () => saveGame(state),
  loadGame: () => loadGame(state),
  title: GAME_TITLE,
  missions: MISSION_ARC,
};
window.__game.state = state;

requestAnimationFrame(frame);
