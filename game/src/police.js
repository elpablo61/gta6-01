import {
  WANTED_STAR_THRESHOLDS, WANTED_HEAT_MAX, HEAT_DECAY_PER_SEC,
  HEAT_DECAY_HIDDEN_PER_SEC, HEAT_DECAY_GARAGE_PER_SEC, REPAINT_GARAGE,
} from './config.js';
import { makeCar, driveCar } from './vehicles.js';
import { nearestNode, findRoute } from './world.js';
import { damagePlayer } from './player.js';

const WANTED_STAR_THRESHOLDS_LOCAL = WANTED_STAR_THRESHOLDS;

// Heat is the 0-100 meter behind the stars: crimes add heat, hiding and the
// repaint garage bleed it away, and each threshold crossing adds a star.
export function updateWantedHeat(state, dt) {
  const p = state.player;
  const inGarage = Math.abs(p.x - REPAINT_GARAGE.x) < REPAINT_GARAGE.w / 2
    && Math.abs(p.y - REPAINT_GARAGE.y) < REPAINT_GARAGE.h / 2;
  const car = state.playerCar;
  const px = car ? car.x : p.x;
  const py = car ? car.y : p.y;
  const inGarageCar = car && Math.abs(car.x - REPAINT_GARAGE.x) < REPAINT_GARAGE.w / 2
    && Math.abs(car.y - REPAINT_GARAGE.y) < REPAINT_GARAGE.h / 2;
  let nearestCop = Infinity;
  for (const cop of state.cops) {
    const d = Math.hypot(cop.x - px, cop.y - py);
    if (d < nearestCop) nearestCop = d;
  }
  if (inGarage || inGarageCar) {
    state.wantedHeat = Math.max(0, state.wantedHeat - HEAT_DECAY_GARAGE_PER_SEC * dt);
    if (state.wantedHeat === 0 && state.wantedStars > 0) state.flashMessage('Clean — the heat is off you.', 2.5);
  } else if (nearestCop > 520 && state.wantedHeat > 0) {
    state.wantedHeat = Math.max(0, state.wantedHeat - HEAT_DECAY_HIDDEN_PER_SEC * dt);
  } else if (state.wantedHeat > 0 && state.time - state.lastCrimeAt > 6) {
    state.wantedHeat = Math.max(0, state.wantedHeat - HEAT_DECAY_PER_SEC * dt);
  }
  state.wantedStars = starsForHeat(state.wantedHeat);
}

export function starsForHeat(heat) {
  let stars = 0;
  for (const t of WANTED_STAR_THRESHOLDS_LOCAL) if (heat >= t) stars++;
  return stars;
}

export function addWantedHeat(state, amount) {
  state.wantedHeat = Math.min(WANTED_HEAT_MAX, state.wantedHeat + amount);
  state.lastCrimeAt = state.time;
  state.wantedStars = starsForHeat(state.wantedHeat);
}

export function setWantedHeat(state, heat) {
  state.wantedHeat = Math.max(0, Math.min(WANTED_HEAT_MAX, heat));
  state.wantedStars = starsForHeat(state.wantedHeat);
  state.lastCrimeAt = state.time;
}

// Police response: foot cops from 1 star, patrol cars from 2, roadblocks and
// aggressive pursuit at 4-5. Pursuers are capped by the wanted level and
// spawn ahead of the player, on the road graph.
export function updatePolice(state, dt) {
  const stars = state.wantedStars;
  const p = state.player;
  const car = state.playerCar;
  const px = car ? car.x : p.x;
  const py = car ? car.y : p.y;

  if (stars === 0) {
    // Stand down: cops drift away and despawn.
    state.cops = state.cops.filter((cop) => {
      cop.despawnAt = (cop.despawnAt || state.time + 3);
      return state.time < cop.despawnAt;
    });
    state.policeCars = state.policeCars.filter((pc) => Math.hypot(pc.x - px, pc.y - py) < 1400);
    return;
  }

  const wantFoot = Math.min(2, stars);
  const wantCars = stars >= 2 ? Math.min(3, stars - 1) : 0;
  if (state.time - (state.lastCopSpawn || 0) > 1.4) {
    state.lastCopSpawn = state.time;
    const footCount = state.cops.filter((c) => c.kind === 'foot').length;
    const carCount = state.policeCars.length;
    if (footCount < wantFoot) spawnFootCop(state, px, py);
    else if (carCount < wantCars) spawnPoliceCar(state, px, py);
  }

  for (const cop of state.cops) updateFootCop(state, cop, dt, px, py);
  for (const pc of state.policeCars) updatePoliceCar(state, pc, dt, px, py);

  // Roadblock at 4-5 stars: two patrol cars parked across the road ahead.
  if (stars >= 4 && !state.roadblock && state.time - (state.lastRoadblockAt || 0) > 25) {
    state.lastRoadblockAt = state.time;
    state.roadblock = { x: px + 500, y: py, until: state.time + 12 };
    const angle = Math.atan2(py - state.player.y, px - state.player.x);
    for (const off of [-70, 70]) {
      const rb = makeCar('police', px + Math.cos(angle) * 480 - Math.sin(angle) * off, py + Math.sin(angle) * 480 + Math.cos(angle) * off, angle + Math.PI / 2, 'roadblock');
      rb.speed = 0;
      state.policeCars.push(rb);
    }
  }
  if (state.roadblock && state.time > state.roadblock.until) state.roadblock = null;
}

function spawnFootCop(state, px, py) {
  const angle = state.rng() * Math.PI * 2;
  const node = nearestNode(state.world, px + Math.cos(angle) * 380, py + Math.sin(angle) * 380);
  state.cops.push({
    kind: 'foot', x: node.x, y: node.y, angle: 0, speed: 205,
    health: 50, shootAt: 0, touchTime: 0, route: [], routeIndex: 0, repathAt: 0,
  });
}

function spawnPoliceCar(state, px, py) {
  // Spawn ahead of the player's direction of travel, on the road.
  const heading = state.playerCar ? state.playerCar.angle : state.player.angle;
  const aheadX = px + Math.cos(heading) * 520;
  const aheadY = py + Math.sin(heading) * 520;
  const node = nearestNode(state.world, aheadX, aheadY);
  const car = makeCar('police', node.x, node.y, heading, 'police');
  car.cruise = 460;
  car.route = []; car.routeIndex = 0; car.repathAt = 0;
  state.policeCars.push(car);
  state.cars.push(car);
}

function updateFootCop(state, cop, dt, px, py) {
  const p = state.player;
  const d = Math.hypot(px - cop.x, py - cop.y);
  // Chase along roads, then the final leg straight at the player.
  if (state.time > cop.repathAt || !cop.route || cop.routeIndex >= cop.route.length) {
    cop.repathAt = state.time + 1.5;
    const from = nearestNode(state.world, cop.x, cop.y);
    cop.route = findRoute(state.world, from, { x: px, y: py });
    cop.routeIndex = 0;
  }
  let tx = px; let ty = py;
  if (cop.route && cop.routeIndex < cop.route.length) {
    const wp = cop.route[cop.routeIndex];
    tx = wp.x; ty = wp.y;
    if (Math.hypot(wp.x - cop.x, wp.y - cop.y) < 30) cop.routeIndex++;
  }
  const dx = tx - cop.x; const dy = ty - cop.y;
  const dist = Math.hypot(dx, dy) || 1;
  cop.angle = Math.atan2(dy, dx);
  cop.x += (dx / dist) * cop.speed * dt;
  cop.y += (dy / dist) * cop.speed * dt;

  if (state.playerCar) {
    // A foot cop cannot bust a driver; he waits by the car.
    cop.touchTime = 0;
    return;
  }
  if (d < 36) {
    cop.touchTime += dt;
    if (cop.touchTime > 0.8) {
      state.gameOver = 'CAUGHT';
      state.mode = 'gameover';
    }
  } else {
    cop.touchTime = 0;
  }
  // Cops shoot back at 3+ stars when close on foot.
  if (state.wantedStars >= 3 && d < 420 && state.time > cop.shootAt) {
    cop.shootAt = state.time + 1.4;
    if (state.rng() < 0.55) damagePlayer(state, 6);
    state.particles.push({ x: cop.x, y: cop.y, vx: 0, vy: 0, life: 0.12, maxLife: 0.12, size: 14, kind: 'flash', color: '#ffd76a' });
  }
}

function updatePoliceCar(state, car, dt, px, py) {
  if (car.role === 'roadblock') return;
  if (state.time > (car.repathAt || 0) || !car.route || car.routeIndex >= car.route.length) {
    car.repathAt = state.time + 1.5;
    const from = nearestNode(state.world, car.x, car.y);
    car.route = findRoute(state.world, from, { x: px, y: py });
    car.routeIndex = 0;
  }
  let target = { x: px, y: py };
  let finalLeg = false;
  if (car.route && car.routeIndex < car.route.length) {
    const wp = car.route[car.routeIndex];
    target = wp;
    if (Math.hypot(wp.x - car.x, wp.y - car.y) < 30) car.routeIndex++;
  } else {
    finalLeg = true;
  }
  const dx = target.x - car.x; const dy = target.y - car.y;
  const dist = Math.hypot(dx, dy);
  const want = Math.atan2(dy, dx);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.4));
  const throttle = dist < 60 ? 0.3 : 1;
  driveCar(state, car, dt, throttle, steer, false);
  if (car.speed > car.cruise) car.speed = car.cruise;
  if (state.rng() < dt * 0.7) playSirenSafe(state);
  // Ram the player's car.
  if (state.playerCar) {
    const pd = Math.hypot(state.playerCar.x - car.x, state.playerCar.y - car.y);
    if (pd < 70 && Math.abs(car.speed) > 120) {
      state.playerCar.damage += 4;
      state.playerCar.speed *= 0.85;
    }
  }
}

function playSirenSafe(state) {
  if (state.audio && state.audio.siren) state.audio.siren();
}
