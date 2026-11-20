// Crescent Bay — the autopilot. It drives the playtest suites and the
// screenshot poses, so it must handle every system: driving, chasing,
// shootouts, the garage, the helicopter (by never stopping under the
// spotlight) and mission dialogs.
//
// Order matters (the m2 freeze lesson): the dialog-accept path runs
// BEFORE the car search, the on-foot car search falls back to walking
// to the target's nearest road point when no car is near (never walk at
// a moving target forever), and the courier rebuilds its route only
// when its target moves >100 (handled in vehicles.ensureRoute).
import { S } from './state.js';
import { WALK_SPEED, SPRINT_SPEED } from './config.js';
import { dist, clamp } from './random.js';
import { findRoute, nearestRoadPoint, nearestJunction, resolveCircle } from './world.js';
import { driveToward, effectiveTop, makeCar } from './vehicles.js';
import { SPRAY_SHOP, HIDEOUT, GARAGE_POS } from './police.js';
import { stage, acceptDialog, restartAfterDeath } from './missions.js';
import { enterCar, exitCar, nearestCar } from './player.js';
import { firePlayerBullet } from './combat.js';
import { currentAmmo } from './weapons.js';
import { openGarageMenu, closeGarageMenu, garageMenuOpen, buyCheapestUpgrade, nearGarage } from './garage.js';
import { mouse } from './input.js';

export const AP_HOOKS = { newGame: null, startFreeRoam: null };

function walkTargetFor(tx, ty) {
  const a = S.auto;
  if (!a.walkTarget || dist(tx, ty, a.walkTarget.x, a.walkTarget.y) > 120) {
    a.walkTarget = { x: tx, y: ty };
    const rp = nearestRoadPoint(tx, ty);
    a.walkRoute = findRoute(S.player.x, S.player.y, rp.x, rp.y);
    a.walkRoute.push({ x: tx, y: ty });
    a.walkIdx = 0;
  }
  return a.walkTarget;
}

// Walk on foot toward a point: road graph to the nearest road point,
// then the last leg on foot. Returns true when arrived (<40).
function walkTo(tx, ty, dt) {
  walkTargetFor(tx, ty);
  const a = S.auto;
  let wp = a.walkRoute && a.walkRoute[a.walkIdx];
  if (!wp) return true;
  const d = dist(S.player.x, S.player.y, wp.x, wp.y);
  if (d < 40) {
    a.walkIdx++;
    if (a.walkIdx >= a.walkRoute.length) return true;
    wp = a.walkRoute[a.walkIdx];
  }
  const ang = Math.atan2(wp.y - S.player.y, wp.x - S.player.x);
  const sp = dist(S.player.x, S.player.y, tx, ty) > 500 ? SPRINT_SPEED : WALK_SPEED;
  S.player.x += Math.cos(ang) * sp * dt;
  S.player.y += Math.sin(ang) * sp * dt;
  S.player.vx = Math.cos(ang) * sp;
  S.player.vy = Math.sin(ang) * sp;
  S.player.angle = ang;
  S.player.x = clamp(S.player.x, 24, 3176);
  S.player.y = clamp(S.player.y, 24, 3176);
  resolveCircle(S.player, 14);
  return false;
}

function fastestParkedNear(x, y, range, minTop) {
  let best = null, bestTop = minTop;
  for (const car of S.cars) {
    if (!car.parked || car.hp <= 0 || car.isPolice) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < range && car.top > bestTop) { bestTop = car.top; best = car; }
  }
  return best;
}

// On foot: get a car, or walk to the objective's nearest road point.
function getCarOrWalk(tx, ty, dt, chaseMode) {
  const range = chaseMode ? 320 : 200;
  const fast = fastestParkedNear(S.player.x, S.player.y, range, 0);
  const target = fast || nearestCar(600);
  if (target) {
    if (dist(S.player.x, S.player.y, target.x, target.y) < 60) {
      enterCar(target);
      S.auto.walkTarget = null;
      return true;
    }
    walkTo(target.x, target.y, dt);
    return false;
  }
  // No car anywhere near: walk to the objective's nearest road point.
  const rp = nearestRoadPoint(tx, ty);
  walkTo(rp.x, rp.y, dt);
  return false;
}

function nearestEnemy() {
  let best = null, bestD = Infinity;
  for (const e of S.enemies) {
    if (e.hp <= 0) continue;
    const d = dist(S.player.x, S.player.y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function nearestArenaAmmo() {
  let best = null, bestD = Infinity;
  for (const pk of S.pickups) {
    if (pk.kind !== 'ammo' || pk.taken) continue;
    const d = dist(S.player.x, S.player.y, pk.x, pk.y);
    if (d < bestD) { bestD = d; best = pk; }
  }
  return best;
}

function nearestArenaCrate() {
  let best = null, bestD = Infinity;
  for (const c of S.crates) {
    if (c.taken) continue;
    const d = dist(S.player.x, S.player.y, c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// Returns true if the autopilot drove the car this frame (manual
// driving must then be skipped).
export function updateAutopilot(dt) {
  const p = S.player;
  const a = S.auto;
  if (S.mode === 'over') { restartAfterDeath(); return false; }
  if (S.mode === 'title') {
    // The start screenshot pose holds the title screen; otherwise the
    // autopilot starts a new game from the title.
    if (S.shotMode === 'start') return false;
    if (AP_HOOKS.newGame) AP_HOOKS.newGame();
    return false;
  }
  if (S.mode !== 'playing' || S.paused) return false;

  // 1. Dialog accept FIRST — before any car search. (A held dialog,
  // e.g. the mission screenshot pose, is never auto-accepted.)
  if (S.dialog && !S.flags.holdDialog) { acceptDialog(); return false; }
  // 2. Garage menu: buy the cheapest upgrade, close, continue.
  if (garageMenuOpen()) {
    buyCheapestUpgrade();
    closeGarageMenu();
    return false;
  }

  const st = stage();
  if (!st) {
    // No active mission: patrol loop (screenshot chase poses) or idle.
    if (S.flags.patrolLoop && p.inCar) {
      const loop = S.flags.patrolLoop;
      const pt = loop[S.flags.patrolIdx || 0];
      if (dist(p.x, p.y, pt.x, pt.y) < 120) S.flags.patrolIdx = ((S.flags.patrolIdx || 0) + 1) % loop.length;
      driveToward(p.inCar, pt.x, pt.y, dt, effectiveTop(p.inCar));
      return true;
    }
    return false;
  }

  // --- Shootout stages ---
  if (st.type === 'shootout') {
    const arena = st.arena;
    if (p.inCar) {
      if (dist(p.x, p.y, arena.x, arena.y) < 320) { exitCar(); return false; }
      driveToward(p.inCar, arena.x, arena.y, dt, effectiveTop(p.inCar));
      return true;
    }
    // Pick up a better weapon crate in the arena first (m10).
    const crate = nearestArenaCrate();
    if (crate && S.weapons.current === 'pistol' && dist(p.x, p.y, crate.x, crate.y) < 500) {
      walkTo(crate.x, crate.y, dt);
      return false;
    }
    // Grab arena ammo when low.
    if (currentAmmo() <= 6) {
      const pk = nearestArenaAmmo();
      if (pk) { walkTo(pk.x, pk.y, dt); return false; }
    }
    const enemy = nearestEnemy();
    if (!enemy) return false;
    const d = dist(p.x, p.y, enemy.x, enemy.y);
    if (d > 300) { walkTo(enemy.x, enemy.y, dt); return false; }
    // In range: aimed bursts every 0.45s, never spray.
    a.shootTimer -= dt;
    mouse.wx = enemy.x; mouse.wy = enemy.y;
    if (a.shootTimer <= 0) {
      a.shootTimer = 0.45;
      const aim = Math.atan2(enemy.y - p.y, enemy.x - p.x);
      firePlayerBullet(aim);
    }
    return false;
  }

  // --- Garage stage (m11) ---
  if (st.type === 'garage') {
    if (p.inCar && nearGarage()) {
      openGarageMenu();
      return false;
    }
    return driveToPoint(GARAGE_POS.x, GARAGE_POS.y, dt, false);
  }

  // --- Escape stages: drive to the Spray Shop ---
  if (st.type === 'escape') {
    return driveToPoint(SPRAY_SHOP.x, SPRAY_SHOP.y, dt, false);
  }

  // --- Chase stage (m2) ---
  if (st.type === 'chase') {
    const c = S.courier;
    if (!c) return false;
    if (p.inCar) {
      // Prefer a much faster parked car for the chase.
      maybeSwitchCar(dt, 430, 320);
      driveToward(p.inCar, c.x, c.y, dt, 520);
      return true;
    }
    return getCarOrWalk(c.x, c.y, dt, true);
  }

  // --- Goto / checkpoints / collect ---
  let tx, ty;
  if (st.type === 'goto') { tx = st.x; ty = st.y; }
  else if (st.type === 'checkpoints') {
    const pt = st.points[st.idx];
    if (!pt) return false;
    tx = pt.x; ty = pt.y;
  } else if (st.type === 'collect') {
    const drop = S.pickups.find((pk) => pk.kind === 'money' && !pk.taken);
    if (!drop) return false;
    tx = drop.x; ty = drop.y;
  } else return false;

  return driveToPoint(tx, ty, dt, false);
}

function maybeSwitchCar(dt, minTop, range) {
  const p = S.player;
  if (!p.inCar) return;
  if (effectiveTop(p.inCar) >= minTop) return;
  const fast = fastestParkedNear(p.x, p.y, range, effectiveTop(p.inCar) + 80);
  if (fast) exitCar();
}

function driveToPoint(tx, ty, dt, chaseMode) {
  const p = S.player;
  const d = dist(p.x, p.y, tx, ty);
  if (p.inCar) {
    maybeSwitchCar(dt, chaseMode ? 430 : 350, chaseMode ? 320 : 200);
    if (!p.inCar) return false;
    driveToward(p.inCar, tx, ty, dt, effectiveTop(p.inCar));
    return true;
  }
  if (d < 380) { walkTo(tx, ty, dt); return false; }
  return getCarOrWalk(tx, ty, dt, chaseMode);
}
