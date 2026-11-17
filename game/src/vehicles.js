import { CAR_TYPES } from './config.js';
import { makeRng, pick, range } from './random.js';
import { collideBuildings, collideWorldBounds, nearestNode, randomRoadPoint } from './world.js';

// Every car in Crescent Bay: parked, traffic, police, courier and the one
// the player drives. One physics model for all of them.
let carIdCounter = 1;

export function makeCar(type, x, y, angle, role) {
  const spec = CAR_TYPES[type];
  return {
    id: carIdCounter++,
    type, role: role || 'traffic',
    x, y, angle, speed: 0,
    topSpeed: spec.topSpeed, accel: spec.accel, turn: spec.turn,
    length: spec.length, width: spec.width,
    color: pick(makeRng((carIdCounter * 7919 + 13) ^ (x | 0)), spec.colors),
    damage: 0, smoke: 0, driver: role === 'parked' ? null : 'ai',
    route: [], routeIndex: 0, cruise: 200,
    stuckAt: 0, lastX: x, lastY: y,
    sirenPhase: Math.random() * 6,
  };
}

export function spawnParkedCars(state, count) {
  const rng = makeRng(state.world.seed + 101);
  const types = ['sedan', 'sedan', 'taxi', 'sports', 'truck', 'sedan', 'sports'];
  for (let i = 0; i < count; i++) {
    const pt = randomRoadPoint(rng);
    const type = types[i % types.length];
    const angle = (Math.floor(rng() * 4) * Math.PI) / 2;
    const car = makeCar(type, pt.x, pt.y, angle, 'parked');
    car.color = pick(rng, CAR_TYPES[type].colors);
    // Park slightly off the centreline, on the road edge.
    car.x += Math.cos(angle + Math.PI / 2) * 34;
    car.y += Math.sin(angle + Math.PI / 2) * 34;
    state.cars.push(car);
  }
}

export function nearestParkedCar(state, x, y, maxDist, minTopSpeed) {
  let best = null; let bestD = maxDist * maxDist;
  for (const car of state.cars) {
    if (car.role !== 'parked') continue;
    if (minTopSpeed && car.topSpeed < minTopSpeed) continue;
    const d = (car.x - x) * (car.x - x) + (car.y - y) * (car.y - y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function driveCar(state, car, dt, throttle, steer, handbrake) {
  const spec = CAR_TYPES[car.type];
  if (throttle > 0) car.speed += spec.accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 20) car.speed -= spec.accel * 1.4 * dt;
    else car.speed -= spec.accel * 0.55 * dt;
  }
  car.speed -= car.speed * 0.35 * dt;
  if (handbrake) car.speed -= car.speed * 1.6 * dt;
  const maxFwd = spec.topSpeed * (car.cruiseLimit ? car.cruiseLimit / spec.topSpeed : 1);
  if (car.speed > maxFwd) car.speed = maxFwd;
  if (car.speed < -140) car.speed = -140;
  if (Math.abs(car.speed) < 4 && throttle === 0) car.speed = 0;
  const grip = handbrake ? 0.45 : 1;
  const turnRate = spec.turn * grip * Math.min(1, Math.abs(car.speed) / 120) * (car.speed >= 0 ? 1 : -1);
  car.angle += steer * turnRate * dt;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const radius = Math.max(car.length, car.width) * 0.42;
  const stepped = collideBuildings(state.world, nx, car.y, radius);
  const hitWallX = stepped.x !== nx;
  const stepped2 = collideBuildings(state.world, stepped.x, ny, radius);
  const hitWallY = stepped2.y !== ny;
  const bounded = collideWorldBounds(state.world, stepped2.x, stepped2.y, radius);
  if (hitWallX || hitWallY) {
    if (Math.abs(car.speed) > 160) {
      car.damage += Math.min(22, Math.abs(car.speed) * 0.05);
      state.addSkid(car.x, car.y, car.angle);
    }
    car.speed *= 0.45;
  }
  car.x = bounded.x; car.y = bounded.y;
  if (car.damage > 55) car.smoke = Math.min(1, (car.damage - 55) / 45);
  return { hitWall: hitWallX || hitWallY };
}

// Keep cars from overlapping: push two close cars apart along their centres.
export function separateCars(state) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i]; const b = cars[j];
      const dx = b.x - a.x; const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = 46;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const ux = dx / d; const uy = dy / d;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
      }
    }
  }
}

export function carAheadDistance(state, car, maxDist) {
  let best = maxDist;
  const fx = Math.cos(car.angle); const fy = Math.sin(car.angle);
  for (const other of state.cars) {
    if (other === car) continue;
    const dx = other.x - car.x; const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    if (along <= 0 || along > best) continue;
    const side = Math.abs(-dx * fy + dy * fx);
    if (side < 42) best = along;
  }
  return best;
}

export function updateCarSmoke(state, car, dt) {
  if (car.smoke > 0.15 && Math.random() < dt * 14) {
    state.particles.push({
      x: car.x - Math.cos(car.angle) * car.length * 0.4,
      y: car.y - Math.sin(car.angle) * car.length * 0.4,
      vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 20,
      life: 0.9, maxLife: 0.9, size: 7 + Math.random() * 6, kind: 'smoke', color: '#888888',
    });
  }
}

export { nearestNode };
