import { nearestNode, nodePos, bfsPath, collideCircle, pointInBuilding } from './world.js';
import { createVehicle } from './vehicles.js';
import { damagePlayer, fireBullet } from './player.js';
import { playSiren, playGunshot } from './audio.js';

const WANTED_STAR_THRESHOLDS = [0, 12, 30, 55, 80];
const MAX_PURSUERS_BY_STARS = [0, 1, 2, 3, 4, 5];
const ROADBLOCK_STARS = 4;

// Wanted is a heat meter with a state machine on top: heat -> stars -> the
// police budget and behaviour. Police chase on the road graph (re-planned
// every 1.5 s), spawn ahead of the player, and lose the player when no unit
// has line of sight for a while.
function updateWantedHeat(G, dt) {
  const w = G.wanted;
  if (w.stars > 0) {
    const anySees = G.cops.some((c) => c.alive && c.seesPlayer);
    if (!anySees) {
      w.hiddenT += dt;
      if (w.hiddenT > 3) w.heat = Math.max(0, w.heat - dt * (w.stars >= 3 ? 2.5 : 5));
    } else {
      w.hiddenT = 0;
    }
  }
  const h = w.heat;
  let stars = 0;
  if (h >= WANTED_STAR_THRESHOLDS[4]) stars = 5;
  else if (h >= WANTED_STAR_THRESHOLDS[3]) stars = 4;
  else if (h >= WANTED_STAR_THRESHOLDS[2]) stars = 3;
  else if (h >= WANTED_STAR_THRESHOLDS[1]) stars = 2;
  else if (h > 0) stars = 1;
  if (stars !== w.stars) {
    w.stars = stars;
    if (stars === 0) {
      toastPolice(G, 'You lost them. The heat is off — for now.');
      G.audio.stopSiren();
    } else if (stars >= 2) {
      playSiren(G.audio);
    }
  }
  if (w.stars >= 2) G.audio.updateSiren(dt);
}

function toastPolice(G, msg) {
  G.toast = { text: msg, t: 4 };
}

// Keep the right number of police units alive for the current wanted level.
function updatePolice(G, dt) {
  const w = G.wanted;
  const p = G.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  if (w.stars === 0) {
    for (const c of G.cops) c.alive = false;
    G.cops = [];
    // The patrol cars drive off too — they do not linger as free cars.
    G.cars = G.cars.filter((car) => !car.police || car === G.player.inCar || car.wrecked);
    if (G.roadblock) { for (const car of G.roadblock) car.wrecked = true; G.roadblock = null; }
    return;
  }
  const want = MAX_PURSUERS_BY_STARS[w.stars];
  const cars = G.cops.filter((c) => c.alive && c.inCar).length;
  const foot = G.cops.filter((c) => c.alive && !c.inCar).length;
  if (w.stars === 1 && foot < 1) spawnFootCop(G);
  if (w.stars >= 2 && cars < want) spawnPatrolCar(G);
  // Roadblock at 4-5 stars: two parked patrol cars across the road ahead.
  if (w.stars >= ROADBLOCK_STARS && !G.roadblock) {
    G.roadblock = makeRoadblock(G, px, py);
  } else if (w.stars < ROADBLOCK_STARS && G.roadblock) {
    for (const car of G.roadblock) car.wrecked = true;
    G.roadblock = null;
  }
  for (const c of G.cops) {
    if (!c.alive) continue;
    c.replanT -= dt;
    c.seesPlayer = Math.hypot(c.x - px, c.y - py) < 520 && hasLineOfSight(G, c.x, c.y, px, py);
    if (c.inCar) updatePatrolCar(G, c, dt, px, py);
    else updateFootCop(G, c, dt, px, py);
    // A foot cop touching the player on foot makes the arrest.
    if (c.alive && !c.inCar && !p.inCar && !p.dead && Math.hypot(c.x - p.x, c.y - p.y) < 22) {
      damagePlayer(G, 999, 'caught');
      c.alive = false;
    }
  }
  G.cops = G.cops.filter((c) => c.alive);
}

function spawnFootCop(G) {
  const p = G.player;
  const a = G.rng.range(0, Math.PI * 2);
  const cop = {
    x: p.x + Math.cos(a) * 320, y: p.y + Math.sin(a) * 320,
    angle: 0, speed: 120, health: 50, alive: true, inCar: null,
    replanT: 0, seesPlayer: false, shootT: 0,
  };
  const c = collideCircle(G.world, cop.x, cop.y, 12);
  cop.x = c.x; cop.y = c.y;
  G.cops.push(cop);
}

function spawnPatrolCar(G) {
  const p = G.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  // Spawn ahead of the player, on the road, so the pursuit arrives naturally.
  const dir = p.inCar ? p.inCar.angle : p.angle;
  const ahead = 420 + G.rng.range(0, 260);
  const x = px + Math.cos(dir) * ahead + G.rng.range(-160, 160);
  const y = py + Math.sin(dir) * ahead + G.rng.range(-160, 160);
  const car = createVehicle('police', x, y, dir + Math.PI);
  car.police = true;
  car.driver = true; // a cop is driving: taking it is a jacking
  car.targetSpeed = car.topSpeed * 0.85;
  G.cars.push(car);
  const cop = {
    x, y, angle: dir, speed: 0, health: 100, alive: true, inCar: car,
    replanT: 0, seesPlayer: false, shootT: 0, path: null, pathI: 0,
  };
  G.cops.push(cop);
}

function makeRoadblock(G, px, py) {
  const dir = G.player.inCar ? G.player.inCar.angle : G.player.angle;
  const bx = px + Math.cos(dir) * 520, by = py + Math.sin(dir) * 520;
  const cars = [];
  for (const side of [-1, 1]) {
    const car = createVehicle('police',
      bx + Math.cos(dir + Math.PI / 2) * side * 30,
      by + Math.sin(dir + Math.PI / 2) * side * 30, dir + Math.PI / 2);
    car.police = true; car.roadblock = true; car.driver = true;
    G.cars.push(car);
    cars.push(car);
  }
  return cars;
}

function updateFootCop(G, c, dt, px, py) {
  const p = G.player;
  const d = Math.hypot(px - c.x, py - c.y);
  const want = Math.atan2(py - c.y, px - c.x);
  c.angle = want;
  if (d > 26) {
    c.x += Math.cos(want) * c.speed * dt;
    c.y += Math.sin(want) * c.speed * dt;
  }
  const cc = collideCircle(G.world, c.x, c.y, 12);
  c.x = cc.x; c.y = cc.y;
  // Foot cops shoot when close and the player is on foot.
  c.shootT -= dt;
  if (d < 340 && c.shootT <= 0 && !p.inCar && !p.dead) {
    c.shootT = 1.4;
    fireBullet(G, c.x, c.y, want, 'cop');
    playGunshot(G.audio);
  }
}

function updatePatrolCar(G, c, dt, px, py) {
  const car = c.inCar;
  if (!car || car.wrecked) { c.alive = false; return; }
  // Re-plan the road-graph route to the player every 1.5 s.
  if (c.replanT <= 0) {
    c.replanT = 1.5;
    const from = nearestNode(G.world, car.x, car.y).id;
    const to = nearestNode(G.world, px, py).id;
    c.path = bfsPath(from, to);
    c.pathI = 0;
  }
  const d = Math.hypot(px - car.x, py - car.y);
  let targetAngle;
  if (d < 260) {
    // Close in: ram the player directly.
    targetAngle = Math.atan2(py - car.y, px - car.x);
  } else if (c.path && c.path.length > 1) {
    const wp = nodePos(G.world, c.path[Math.min(c.pathI + 1, c.path.length - 1)]);
    if (Math.hypot(wp.x - car.x, wp.y - car.y) < 40) c.pathI++;
    targetAngle = Math.atan2(wp.y - car.y, wp.x - car.x);
  } else {
    targetAngle = Math.atan2(py - car.y, px - car.x);
  }
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff * 4 * dt));
  const speedTarget = c.ramT > 0 ? car.targetSpeed * 0.35 : car.targetSpeed;
  car.speed += (speedTarget - car.speed) * Math.min(1, dt * 1.2);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const cc = collideCircle(G.world, nx, ny, car.len * 0.42);
  car.x = cc.x; car.y = cc.y;
  if (cc.hit) car.speed *= 0.5;
  c.x = car.x; c.y = car.y; c.angle = car.angle;
  // Ram damage when the patrol car hits the player's car — then back off
  // for a moment so the chase reads as a chase, not a pile-up.
  const p = G.player;
  if (c.ramT > 0) c.ramT -= dt;
  if (p.inCar && Math.hypot(p.inCar.x - car.x, p.inCar.y - car.y) < 44) {
    p.inCar.damage = Math.min(100, p.inCar.damage + 5 * dt);
    car.speed *= 0.7;
    if (c.ramT <= 0) c.ramT = 1.5;
  }
  // Patrol cars shoot at the player when alongside and the player is on foot.
  c.shootT -= dt;
  if (d < 300 && c.shootT <= 0 && !p.inCar && !p.dead) {
    c.shootT = 1.8;
    const a = Math.atan2(p.y - car.y, p.x - car.x);
    fireBullet(G, car.x, car.y, a, 'cop');
  }
}

// Cheap line of sight: sample the segment for a building in the way.
function hasLineOfSight(G, x0, y0, x1, y1) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 40);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (pointInBuilding(G.world, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

export {
  WANTED_STAR_THRESHOLDS, MAX_PURSUERS_BY_STARS, ROADBLOCK_STARS,
  updateWantedHeat, updatePolice, hasLineOfSight,
};
