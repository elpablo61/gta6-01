// Crescent Bay — vehicles: car types, spawning, and the shared driving
// brain. Every car (player, traffic, police, courier) steers with the
// same radius-based rules, so the autopilot and traffic agree.
import { S } from './state.js';
import { WORLD_SIZE, ON_ROAD_TOL, SHARP_TURN, WAYPOINT_ACCEPT, WALL_DAMAGE_TICK, WALL_DAMAGE, COLLISION_DAMAGE } from './config.js';
import { makeRng, clamp, normAngle, angleDiff, dist } from './random.js';
import { roads, findRoute, nearestJunction, nearestRoadPoint, nearestReachableRoadPoint, onRoad, collideBuildings, resolveCircle } from './world.js';

export const CAR_TYPES = {
  sedan: { top: 380, accel: 260, len: 46, wid: 22, color: '#c94f4f' },
  taxi: { top: 360, accel: 250, len: 46, wid: 22, color: '#e8c832' },
  truck: { top: 300, accel: 180, len: 58, wid: 26, color: '#7a8a9a' },
  sports: { top: 520, accel: 380, len: 44, wid: 22, color: '#c93a7a' },
  police: { top: 470, accel: 340, len: 48, wid: 23, color: '#2a4a8a' },
};

const PARKED_COLORS = ['#c94f4f', '#4f7ac9', '#4fae5f', '#c9a44f', '#8a4fc9', '#c9c9c9', '#3a3a3a', '#d86a2a', '#2a9a9a', '#b03a5a'];

let carId = 1;

export function makeCar(x, y, type, opts = {}) {
  const t = CAR_TYPES[type];
  const car = {
    id: carId++,
    x, y, angle: opts.angle ?? 0, speed: 0,
    type, top: t.top, accel: t.accel, len: t.len, wid: t.wid,
    color: opts.color || t.color,
    parked: opts.parked ?? false,
    isPlayer: false, isPolice: type === 'police', isTraffic: false,
    driver: null, // traffic driver state
    route: null, routeDest: null, routeIdx: 0,
    stuckTimer: 0, reverseTimer: 0, wallTick: 0,
    hp: 100, upgrades: { engine: 0, armor: 0, tires: 0, brakes: 0 },
    paint: null, cruise: t.top,
    rec: false, // off-road recovery active
  };
  if (opts.upgrades) car.upgrades = { ...opts.upgrades };
  return car;
}

export function effectiveTop(car) {
  return car.top + (car.upgrades.engine || 0) * 45;
}

export function spawnParkedCars(rng) {
  const spots = [];
  for (let i = 0; i < 42; i++) {
    const ri = rng.int(0, 7);
    const along = rng.range(260, 2940);
    const side = rng.chance(0.5) ? 1 : -1;
    const horizontal = rng.chance(0.5);
    const x = horizontal ? along : roads[ri] + side * 52;
    const y = horizontal ? roads[ri] + side * 52 : along;
    if (x > 3000 || collideBuildings(x, y, 30)) continue;
    const type = rng.pick(['sedan', 'sedan', 'taxi', 'truck', 'sports', 'sports']);
    const car = makeCar(x, y, type, { angle: horizontal ? 0 : Math.PI / 2, parked: true, color: rng.pick(PARKED_COLORS) });
    S.cars.push(car);
    spots.push(car);
  }
  return spots;
}

export function spawnTrafficCar(rng) {
  const ri = rng.int(0, 7);
  const along = rng.range(300, 2900);
  const horizontal = rng.chance(0.5);
  const x = horizontal ? along : roads[ri];
  const y = horizontal ? roads[ri] : along;
  const type = rng.pick(['sedan', 'sedan', 'taxi', 'truck', 'sports']);
  const car = makeCar(x, y, type, { angle: horizontal ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2), color: rng.pick(PARKED_COLORS) });
  car.isTraffic = true;
  car.cruise = rng.range(200, 300);
  const tj = nearestJunction(rng.range(200, 3000), rng.range(200, 3000));
  car.route = findRoute(x, y, tj.x, tj.y);
  car.routeDest = { x: tj.x, y: tj.y };
  car.routeIdx = 0;
  S.cars.push(car);
  return car;
}

// Rebuild a car's route only when its target moved >100 from the route's
// recorded destination (never every frame — that was the m2 freeze).
// A rebuild must NOT reset progress: a fast-moving target (the m2
// courier at 380) rebuilds every ~0.3s, and resetting routeIdx to 0
// re-aimed the car at the junction behind it, so it ping-ponged 180°
// forever instead of chasing (angle wound to -30 rad, 0 ram hits in
// 130s). Resume from the waypoint we were already driving to when it
// is still on the new route.
export function ensureRoute(car, tx, ty) {
  if (!car.route || !car.routeDest || dist(tx, ty, car.routeDest.x, car.routeDest.y) > 100) {
    const oldWp = car.route && car.routeIdx < car.route.length ? car.route[car.routeIdx] : null;
    const oldWasTarget = car.route ? car.routeIdx >= car.route.length - 1 : false;
    car.route = findRoute(car.x, car.y, tx, ty);
    car.routeDest = { x: tx, y: ty };
    car.routeIdx = 0;
    if (oldWp) {
      const k = car.route.findIndex((p) => p.x === oldWp.x && p.y === oldWp.y);
      if (k > 0) car.routeIdx = k;
      // Endgame: the old waypoint was the moving target itself (a live
      // position, never found in the new route). Resetting to 0 sent the
      // car back to the junction behind it, so it orbited the courier
      // at 100-200 units and never landed a ram (m2: 1 hit in 120s).
      // Stay on the new target instead — keep driving at the courier.
      else if (k === -1 && oldWasTarget) car.routeIdx = car.route.length - 1;
    }
  }
}

// The driving brain. Steers radius-based so the car can turn inside
// 64-wide roads; stops fully and rotates in place for turns sharper
// than ~52 degrees; brakes ahead of sharp turns; crawls U-turns at 60;
// reverses straight when stuck; recovers off-road via the nearest road
// then the nearest junction.
export function driveToward(car, tx, ty, dt, cruise, opts = {}) {
  const arrive = opts.arrive ?? 30;
  // Off-road recovery: sticky until the nearest junction is reached.
  if (car.rec) {
    const j = nearestJunction(car.x, car.y);
    if (dist(car.x, car.y, j.x, j.y) < 60) car.rec = false;
    else { tx = j.x; ty = j.y; }
  } else if (!onRoad(car.x, car.y, ON_ROAD_TOL)) {
    // Reachable road point, not just nearest: the nearest point can sit
    // behind a building from the car, and driving straight at it wedges
    // the car on the building face (m11 truck, speed 0, wall damage).
    const rp = nearestReachableRoadPoint(car.x, car.y);
    const j = nearestJunction(rp.x, rp.y);
    if (dist(car.x, car.y, rp.x, rp.y) < 30) { car.rec = true; tx = j.x; ty = j.y; }
    else { tx = rp.x; ty = rp.y; }
  }
  ensureRoute(car, tx, ty);
  let wp = null;
  if (car.route && car.routeIdx < car.route.length) {
    wp = car.route[car.routeIdx];
    if (dist(car.x, car.y, wp.x, wp.y) < WAYPOINT_ACCEPT) {
      car.routeIdx++;
      if (car.routeIdx < car.route.length) wp = car.route[car.routeIdx];
      else wp = { x: tx, y: ty };
    }
  } else wp = { x: tx, y: ty };
  const dTarget = dist(car.x, car.y, tx, ty);
  const routeDone = !car.route || car.routeIdx >= car.route.length;
  // Arrive only when really close (30): the old 70 stranded the car
  // short of objectives that need a closer stop — m2 froze ~52 off-road
  // from its road point, m6 froze 57 short of a money drop (pickup
  // radius is 42), both braking to 0 forever with the route exhausted.
  // 30 sits inside the pickup radius, and the 120 crawl cap keeps the
  // approach slow enough to stop without overshooting.
  if (dTarget < arrive && routeDone) {
    car.speed = Math.max(0, car.speed - car.accel * 2.2 * dt);
    if (car.speed < 5) car.speed = 0;
    moveCar(car, dt);
    return dTarget < arrive;
  }
  const want = Math.atan2(wp.y - car.y, wp.x - car.x);
  const diff = angleDiff(car.angle, want);
  // Sharp turn: STOP fully, rotate in place, then drive straight.
  if (Math.abs(diff) > SHARP_TURN) {
    car.speed = 0;
    car.angle += clamp(diff, -1, 1) * 3.2 * dt;
    moveCar(car, dt);
    return false;
  }
  // Anticipatory braking before the next sharp turn.
  let targetSpeed = cruise;
  if (car.route && car.routeIdx + 1 < car.route.length) {
    const nwp = car.route[car.routeIdx + 1];
    const nd = dist(car.x, car.y, nwp.x, nwp.y);
    const nWant = Math.atan2(nwp.y - wp.y, nwp.x - wp.x);
    const curWant = Math.atan2(wp.y - car.y, wp.x - car.x);
    const ndiff = Math.abs(angleDiff(curWant, nWant));
    if (ndiff > 0.9 && nd < 380) targetSpeed = Math.min(targetSpeed, 180);
    else if (ndiff > 0.5 && nd < 220) targetSpeed = Math.min(targetSpeed, 280);
  }
  if (Math.abs(diff) > 2.6) targetSpeed = Math.min(targetSpeed, 60); // U-turn crawl
  else if (dTarget < 170) targetSpeed = Math.min(targetSpeed, 120); // crawl near waypoint
  // Stuck detection: throttle intended but no movement -> reverse straight.
  if (car.reverseTimer > 0) {
    car.reverseTimer -= dt;
    car.speed = -90;
  } else {
    if (car.speed < targetSpeed) car.speed = Math.min(targetSpeed, car.speed + car.accel * dt);
    else car.speed = Math.max(targetSpeed, car.speed - car.accel * 1.6 * dt);
    if (car.speed < 12 && targetSpeed > 60) {
      car.stuckTimer += dt;
      if (car.stuckTimer > 1.5) { car.reverseTimer = 0.7; car.stuckTimer = 0; }
    } else car.stuckTimer = 0;
  }
  // Radius-based steering with guaranteed minimum turn authority.
  const turnRate = clamp(diff, -1, 1) * Math.max(0.9, Math.min(3.0, car.speed / 70 + 0.6));
  const tireBonus = 1 + (car.upgrades.tires || 0) * 0.15;
  car.angle += turnRate * tireBonus * dt * (car.speed < 0 ? -1 : 1);
  moveCar(car, dt);
  return false;
}

export function moveCar(car, dt) {
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const oldX = car.x, oldY = car.y;
  car.x = clamp(nx, 24, WORLD_SIZE - 24);
  car.y = clamp(ny, 24, WORLD_SIZE - 24);
  // Wall collision: slide along the wall instead of sticking.
  const hit = resolveCircle(car, 20);
  if (hit) {
    car.wallTick -= dt;
    if (car.wallTick <= 0) {
      car.hp -= WALL_DAMAGE;
      car.wallTick = WALL_DAMAGE_TICK;
    }
    // Sliding: keep the component of motion along the wall.
    const moved = dist(oldX, oldY, car.x, car.y);
    if (moved < Math.abs(car.speed) * dt * 0.3) car.speed *= 0.6;
  }
  if (car.x <= 24 || car.x >= WORLD_SIZE - 24 || car.y <= 24 || car.y >= WORLD_SIZE - 24) {
    car.wallTick -= dt;
    if (car.wallTick <= 0) { car.hp -= WALL_DAMAGE; car.wallTick = WALL_DAMAGE_TICK; }
  }
}

// Car-car separation. The player's car is never pushed (it would be
// shoved out of the Spray Shop radius by patrol cars).
export function separateCars(dt) {
  const cars = S.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (a.parked && b.parked) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = 44;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const ux = dx / d, uy = dy / d;
        if (!a.isPlayer) { a.x -= ux * push; a.y -= uy * push; }
        if (!b.isPlayer) { b.x += ux * push; b.y += uy * push; }
        if (a.isPlayer || b.isPlayer) {
          const other = a.isPlayer ? b : a;
          const pc = a.isPlayer ? a : b;
          pc.hp -= COLLISION_DAMAGE * dt;
          if (other.speed > 100) other.speed *= 0.85;
        }
      }
    }
  }
}
