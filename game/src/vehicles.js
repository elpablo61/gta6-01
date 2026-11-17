import { VEHICLE_TYPES, WATER_X0, WORLD_W, WORLD_H } from './config.js';
import { collideCircle } from './world.js';
import { playCrash, playPickup } from './audio.js';
import { addWantedHeat, damageVehicle, spawnParticle, spawnSmoke, toast } from './player.js';

// Create a vehicle of a given type at a position and heading.
function createVehicle(type, x, y, angle) {
  const t = VEHICLE_TYPES[type] || VEHICLE_TYPES.sedan;
  return {
    type, x, y, angle, speed: 0,
    len: t.len, wid: t.wid, color: t.color,
    topSpeed: t.topSpeed, accel: t.accel, brake: t.brake, steer: t.steer,
    damage: 0, wrecked: false, driver: null, police: type === 'police',
    skid: [], smokeT: 0, hornT: 0, id: Math.random().toString(36).slice(2, 8),
  };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Drive the player's car with the keyboard: accel, brake/reverse, steering
// that scales down with speed, handbrake drift, skid marks and crash damage.
function updatePlayerCar(G, dt) {
  const car = G.player.inCar;
  if (!car || car.wrecked) return;
  car.crashT = Math.max(0, (car.crashT || 0) - dt);
  const inp = G.input;
  const fwd = (inp.up ? 1 : 0) - (inp.down ? 1 : 0);
  const steerIn = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
  const speed01 = Math.min(1, Math.abs(car.speed) / car.topSpeed);
  if (fwd > 0) car.speed += car.accel * dt * (1 - speed01 * 0.55);
  else if (fwd < 0) {
    if (car.speed > 20) car.speed -= car.brake * dt;
    else car.speed -= car.accel * 0.6 * dt; // reverse
  } else {
    car.speed -= Math.sign(car.speed) * 140 * dt;
    if (Math.abs(car.speed) < 8) car.speed = 0;
  }
  car.speed = Math.max(-car.topSpeed * 0.35, Math.min(car.topSpeed, car.speed));
  // Steering: stronger at low speed, flips when reversing.
  const steerRate = car.steer * (1 - speed01 * 0.55) * Math.sign(car.speed || 1);
  car.angle += steerIn * steerRate * dt * (inp.handbrake ? 1.5 : 1);
  // Handbrake: kill grip, drop speed, leave skid marks.
  const skidding = inp.handbrake && Math.abs(car.speed) > 120;
  if (skidding) car.speed *= (1 - 0.8 * dt);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const c = collideCircle(G.world, nx, ny, car.len * 0.42);
  if (c.hit) {
    // Crash damage is throttled: one hit per half second, not per step,
    // or a one-second scrape against a wall wrecks the car outright.
    if (Math.abs(car.speed) > 150 && car.crashT <= 0) {
      car.crashT = 0.5;
      damageVehicle(G, car, Math.abs(car.speed) * 0.03);
      playCrash(G.audio, Math.abs(car.speed) > 320);
      spawnSmoke(G, car.x, car.y);
      addWantedHeat(G, 1, 'crash');
    }
    car.speed *= 0.35;
  }
  car.x = c.x; car.y = c.y;
  if (skidding) {
    const bx = car.x - Math.cos(car.angle) * car.len * 0.45;
    const by = car.y - Math.sin(car.angle) * car.len * 0.45;
    car.skid.push({ x: bx, y: by, t: 3 });
    if (car.skid.length > 40) car.skid.shift();
  }
  for (const s of car.skid) s.t -= dt;
  car.skid = car.skid.filter((s) => s.t > 0);
  if (car.damage > 55) {
    car.smokeT -= dt;
    if (car.smokeT <= 0) {
      car.smokeT = 0.12;
      spawnParticle(G, car.x, car.y - 6, (Math.random() - 0.5) * 20, -40, 0.9, '#777777', 6);
    }
  }
  G.audio.setEngine(Math.abs(car.speed) / car.topSpeed);
}

// E: enter the nearest car, or step out of the one being driven.
// Parked cars are preferred: a driven car (traffic or police) must be
// jacked, and jacking is a crime the driver reports.
function tryEnterExitCar(G) {
  const p = G.player;
  if (p.inCar) {
    const car = p.inCar;
    p.inCar = null;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    const c = collideCircle(G.world, p.x, p.y, 14);
    p.x = c.x; p.y = c.y;
    car.speed = 0;
    G.audio.setEngine(0);
    return;
  }
  // Prefer a parked car; only jack a driven one if no parked car is near.
  let best = null, bestD = 70;
  for (const car of G.cars) {
    if (car.wrecked || !car.parked) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) { best = car; bestD = d; }
  }
  if (!best) {
    for (const car of G.cars) {
      if (car.wrecked || car.parked) continue;
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < bestD) { best = car; bestD = d; }
    }
  }
  if (!best) return;
  // Jacking a car someone is driving is a crime; a parked car is free.
  if (best.driver) {
    best.driver = null;
    addWantedHeat(G, 6, 'car jacked');
    toast(G, 'You jacked a car! The driver ran — the cops noticed.');
  } else if (best.parked) {
    addWantedHeat(G, 2, 'car taken');
  }
  best.parked = false;
  p.inCar = best;
  G.audio.ensure();
}

function nearestCar(G, x, y, maxD) {
  let best = null, bestD = maxD;
  for (const car of G.cars) {
    if (car.wrecked) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

export { createVehicle, angleDiff, updatePlayerCar, tryEnterExitCar, nearestCar };
