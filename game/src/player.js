// Crescent Bay — the player: Rook on foot and behind the wheel.
// On foot: WASD/arrows move, mouse aim, click shoot, Shift sprint.
// Driving: E enter/exit, steal parked cars, carjack traffic cars
// (the driver flees). Manual driving never runs on a frame the
// autopilot drove (that conflict used to brake the car to ~0).
import { S } from './state.js';
import { WALK_SPEED, SPRINT_SPEED } from './config.js';
import { keys, pressed, mouse } from './input.js';
import { dist, clamp, angleDiff } from './random.js';
import { resolveCircle, nearestRoadPoint } from './world.js';
import { addHeat } from './police.js';
import { firePlayerBullet } from './combat.js';
import { spawnPed } from './pedestrians.js';
import { currentWeapon } from './weapons.js';
import { sfx } from './audio.js';

export function nearestCar(maxD) {
  let best = null, bestD = maxD;
  for (const car of S.cars) {
    if (car.hp <= 0) continue;
    const d = dist(S.player.x, S.player.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function enterCar(car) {
  if (!car) return false;
  const wasParked = car.parked;
  const wasTraffic = car.isTraffic;
  car.parked = false;
  car.isTraffic = false;
  car.isPlayer = true;
  car.driver = null;
  S.player.inCar = car;
  S.player.onFoot = false;
  S.player.x = car.x;
  S.player.y = car.y;
  if (wasParked || wasTraffic) {
    addHeat(6);
    S.stats.carsStolen += 1;
    if (wasTraffic) {
      // The driver flees on foot.
      spawnPed(car.x + 40, car.y + 40);
    }
  }
  return true;
}

export function exitCar() {
  const car = S.player.inCar;
  if (!car) return;
  car.isPlayer = false;
  car.parked = true;
  car.speed = 0;
  S.player.inCar = null;
  S.player.onFoot = true;
  const a = car.angle + Math.PI / 2;
  S.player.x = car.x + Math.cos(a) * 34;
  S.player.y = car.y + Math.sin(a) * 34;
}

export function updatePlayer(dt, autopilotDrove) {
  const p = S.player;
  if (p.dead) return;
  // Health regen is slow and only out of combat.
  if (S.time - p.lastDamageAt > 8 && p.hp < 100) p.hp = Math.min(100, p.hp + 2 * dt);

  if (p.inCar) {
    const car = p.inCar;
    p.x = car.x; p.y = car.y;
    p.angle = car.angle;
    p.speed = car.speed;
    if (car.hp <= 0) {
      exitCar();
      p.hp -= 10;
      if (p.hp <= 0) { p.hp = 0; p.dead = true; S.mode = 'over'; S.overReason = 'DOWN'; }
      return;
    }
    if (!autopilotDrove) updateManualDriving(car, dt);
    if (pressed.interact) exitCar();
    return;
  }

  // On foot.
  let dx = 0, dy = 0;
  if (keys.up) dy -= 1;
  if (keys.down) dy += 1;
  if (keys.left) dx -= 1;
  if (keys.right) dx += 1;
  const moving = dx !== 0 || dy !== 0;
  const sp = keys.sprint ? SPRINT_SPEED : WALK_SPEED;
  if (moving) {
    const len = Math.hypot(dx, dy);
    p.x += (dx / len) * sp * dt;
    p.y += (dy / len) * sp * dt;
    p.vx = (dx / len) * sp;
    p.vy = (dy / len) * sp;
    p.angle = Math.atan2(dy, dx);
  } else { p.vx = 0; p.vy = 0; }
  p.x = clamp(p.x, 24, 3176);
  p.y = clamp(p.y, 24, 3176);
  resolveCircle(p, 14);
  // Aim at the mouse (world coordinates come from main).
  p.aimAngle = Math.atan2(mouse.wy - p.y, mouse.wx - p.x);
  // Shooting: mouse held OR the edge flag (fast clicks must fire).
  if ((mouse.down || mouse.pressed) && S.weapons) {
    firePlayerBullet(p.aimAngle);
  }
  if (pressed.interact) {
    const car = nearestCar(70);
    if (car) enterCar(car);
  }
}

function updateManualDriving(car, dt) {
  // WASD: up/down throttle, left/right steer. Radius-based steering.
  let throttle = 0;
  if (keys.up) throttle = 1;
  if (keys.down) throttle = -0.6;
  let steer = 0;
  if (keys.left) steer = -1;
  if (keys.right) steer = 1;
  const top = car.top + (car.upgrades.engine || 0) * 45;
  const brakeMul = 1 + (car.upgrades.brakes || 0) * 0.25;
  if (throttle > 0) car.speed = Math.min(top, car.speed + car.accel * throttle * dt);
  else if (throttle < 0) car.speed = Math.max(-140, car.speed + car.accel * throttle * dt);
  else car.speed = Math.max(0, car.speed - car.accel * 0.9 * brakeMul * dt);
  if (car.speed !== 0) {
    const turnRate = clamp(steer, -1, 1) * Math.max(0.9, Math.min(3.0, Math.abs(car.speed) / 70 + 0.6));
    car.angle += turnRate * dt * (car.speed < 0 ? -1 : 1);
  }
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(nx, 24, 3176);
  car.y = clamp(ny, 24, 3176);
  const hit = resolveCircle(car, 20);
  if (hit) {
    car.wallTick -= dt;
    if (car.wallTick <= 0) { car.hp -= 4; car.wallTick = 0.5; sfx('crash'); }
  }
}
