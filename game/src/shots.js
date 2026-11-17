import { makeCar } from './vehicles.js';
import { startMission } from './missions.js';
import { setWantedHeat } from './police.js';
import { fireBullet } from './combat.js';
import { saveGame, hasSave } from './save.js';

// Screenshot poses. Each pose plays from a fresh seeded world with the
// game's own systems — wanted level, police spawns, traffic, missions —
// and a small autopilot, never hand-placed scenery. Tuning is by seed,
// step count and autopilot behaviour only.
export function applyShot(state, name) {
  if (name === 'cover') return applyCover(state);
  if (name === 'mission') return applyMissionShot(state);
  if (name === 'night') return applyNight(state);
  if (name === 'start') return applyStart(state);
  return { autopilot: false };
}

function putPlayerInCar(state, x, y, angle, type) {
  const car = makeCar(type || 'sports', x, y, angle, 'player');
  car.color = '#e8b400';
  car.driver = 'player';
  state.cars.push(car);
  state.playerCar = car;
  state.player.inCar = car;
  state.player.x = x; state.player.y = y;
  state.camera.x = x; state.camera.y = y;
  return car;
}

function spawnPoliceBehind(state, x, y, angle, count) {
  for (let i = 0; i < count; i++) {
    const back = 190 + i * 150;
    const side = i === 0 ? -46 : 46;
    const px = x - Math.cos(angle) * back - Math.sin(angle) * side;
    const py = y - Math.sin(angle) * back + Math.cos(angle) * side;
    const car = makeCar('police', px, py, angle, 'police');
    car.cruise = 470;
    car.speed = 320;
    car.route = [];
    state.policeCars.push(car);
    state.cars.push(car);
  }
}

function spawnTrafficNear(state, x, y) {
  const spots = [
    { dx: 260, dy: -40, type: 'sedan', color: '#3d6fc9' },
    { dx: 420, dy: 46, type: 'taxi', color: '#f2c230' },
    { dx: -320, dy: 46, type: 'truck', color: '#8a7f72' },
  ];
  for (const s of spots) {
    const car = makeCar(s.type, x + s.dx, y + s.dy, -Math.PI / 4, 'traffic');
    car.color = s.color;
    car.cruise = 190;
    state.cars.push(car);
  }
}

function seedSkidsAndSmoke(state, car) {
  for (let i = 0; i < 6; i++) {
    const back = 40 + i * 26;
    state.skids.push({
      x: car.x - Math.cos(car.angle) * back,
      y: car.y - Math.sin(car.angle) * back,
      angle: car.angle, life: 8,
    });
  }
  for (let i = 0; i < 10; i++) {
    state.particles.push({
      x: car.x - Math.cos(car.angle) * (30 + i * 8) + (state.rng() - 0.5) * 20,
      y: car.y - Math.sin(car.angle) * (30 + i * 8) + (state.rng() - 0.5) * 20,
      vx: 0, vy: -20, life: 1.2, maxLife: 1.2, size: 8, kind: 'smoke', color: '#888888',
    });
  }
}

function applyCover(state) {
  state.timeOfDay = 10.5;
  state.holdHeatUntil = state.time + 30;
  startMission(state, 6);
  state.mission.objective = 'ESCAPE THE POLICE — Lose the cops';
  // East along the y=400 road so the patrol cars spawn on the same road,
  // directly behind the player, and the chase reads in one frame.
  const car = putPlayerInCar(state, -400, 400, 0, 'sports');
  car.speed = 300;
  setWantedHeat(state, 62);
  spawnPoliceBehind(state, -400, 400, 0, 2);
  spawnTrafficNear(state, -400, 400);
  seedSkidsAndSmoke(state, car);
  return { autopilot: true, cruise: 420 };
}

function applyMissionShot(state) {
  state.timeOfDay = 11;
  state.holdHeatUntil = state.time + 30;
  startMission(state, 7);
  // Rook on foot at the dock, pistol out, fixer dialogue on screen.
  state.playerCar = null;
  state.player.inCar = null;
  state.player.x = -1180; state.player.y = -560;
  state.player.ammo = 60;
  state.camera.x = -1180; state.camera.y = -560;
  // Closer camera for the shootout pose: the fight reads at a glance.
  state.camera.zoom = 1.25;
  state.mission.dialogueUntil = state.time + 30;
  setWantedHeat(state, 20);
  const target = state.enemies.find((e) => e.health > 0);
  if (target) {
    state.player.aimAngle = Math.atan2(target.y - state.player.y, target.x - state.player.x);
    fireBullet(state, state.player.x + Math.cos(state.player.aimAngle) * 22, state.player.y + Math.sin(state.player.aimAngle) * 22, state.player.aimAngle, 'player', 34);
    state.particles.push({ x: state.player.x + Math.cos(state.player.aimAngle) * 30, y: state.player.y + Math.sin(state.player.aimAngle) * 30, vx: 0, vy: 0, life: 1.0, maxLife: 1.0, size: 18, kind: 'flash', color: '#fff3b0' });
  }
  // One foot cop closing in, pedestrians fleeing.
  state.cops.push({ kind: 'foot', x: -1050, y: -480, angle: 0, speed: 205, health: 50, shootAt: 0, touchTime: 0, route: [], routeIndex: 0, repathAt: 0 });
  for (const ped of state.peds.slice(0, 3)) {
    ped.fleeing = true; ped.fleeUntil = state.time + 30;
  }
  return { autopilot: true };
}

function applyNight(state) {
  state.timeOfDay = 22.3;
  state.holdHeatUntil = state.time + 30;
  startMission(state, 4);
  const car = putPlayerInCar(state, 0, 800, -Math.PI / 2, 'sports');
  car.color = '#d92b2b';
  car.speed = 280;
  setWantedHeat(state, 80);
  spawnPoliceBehind(state, 0, 800, -Math.PI / 2, 2);
  // Roadblock across the road ahead.
  for (const off of [-52, 52]) {
    const rb = makeCar('police', 0 + off, 380, 0, 'roadblock');
    state.policeCars.push(rb);
    state.cars.push(rb);
  }
  seedSkidsAndSmoke(state, car);
  return { autopilot: true, cruise: 400 };
}

function applyStart(state) {
  state.timeOfDay = 10;
  if (!hasSave()) {
    state.player.cash = 1250;
    state.missionIndex = 0;
    state.completedMissions = ['first-job'];
    saveGame(state);
  }
  state.mode = 'title';
  state.camera.x = 0; state.camera.y = 0;
  return { autopilot: false };
}
