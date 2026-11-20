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
import { findRoute, nearestRoadPoint, nearestReachableRoadPoint, nearestJunction, resolveCircle, collideBuildings } from './world.js';
import { driveToward, effectiveTop, makeCar } from './vehicles.js';
import { SPRAY_SHOP, HIDEOUT, GARAGE_POS } from './police.js';
import { stage, acceptDialog, restartAfterDeath } from './missions.js';
import { enterCar, exitCar, nearestCar } from './player.js';
import { firePlayerBullet } from './combat.js';
import { currentAmmo, currentWeapon } from './weapons.js';
import { openGarageMenu, closeGarageMenu, garageMenuOpen, buyCheapestUpgrade, nearGarage } from './garage.js';
import { mouse } from './input.js';

export const AP_HOOKS = { newGame: null, startFreeRoam: null };

function walkTargetFor(tx, ty) {
  const a = S.auto;
  // Rebuild when there is no target, the route is exhausted, or the
  // target moved: an exhausted route reused for a nearby new target
  // (within 120 of the old one) left walkIdx past the end, so walkTo
  // returned "arrived" every frame and the player stood still forever
  // (m11 freeze at the docks: on foot, garage stage, no movement).
  const exhausted = !a.walkRoute || a.walkIdx >= a.walkRoute.length;
  if (!a.walkTarget || exhausted || dist(tx, ty, a.walkTarget.x, a.walkTarget.y) > 120) {
    // Same progress rule as ensureRoute: a fast-moving target rebuilds
    // the walk route every ~0.3s; resetting walkIdx to 0 made the
    // player oscillate around the nearest junction instead of walking
    // on. Resume from the waypoint we were already walking to.
    const oldWp = a.walkRoute && a.walkIdx < a.walkRoute.length ? a.walkRoute[a.walkIdx] : null;
    a.walkTarget = { x: tx, y: ty };
    const rp = nearestRoadPoint(tx, ty);
    a.walkRoute = findRoute(S.player.x, S.player.y, rp.x, rp.y);
    // First get onto a road: the straight line from an off-road position
    // to the first junction can cut through a building and wedge the
    // player on its face (m12 creep: 5 u/s toward the bank). Prepend the
    // nearest reachable road point so the first leg is a clear straight
    // line onto the road, then follow the junctions.
    const prp = nearestReachableRoadPoint(S.player.x, S.player.y);
    if (dist(S.player.x, S.player.y, prp.x, prp.y) > 40) a.walkRoute.unshift(prp);
    a.walkRoute.push({ x: tx, y: ty });
    a.walkIdx = 0;
    if (oldWp) {
      const k = a.walkRoute.findIndex((p) => p.x === oldWp.x && p.y === oldWp.y);
      if (k > 0) a.walkIdx = k;
    }
  }
  return a.walkTarget;
}

// Line of sight for a bullet: sample the segment for building hits
// (bullets die on buildings, so a blocked shot is wasted ammo).
function hasLineOfSight(x1, y1, x2, y2) {
  // A "clear" shot needs margin for bullet spread: a line that grazes a
  // building corner within ~10 units passes the old r=2 check, but the
  // spread sends most bullets into the corner (m12: player stood at
  // (1519,1676), 199 from the guard, fired the SMG for 3s, 0 hits, while
  // the other guards shot it down). Sample every 10 with r=10 so a
  // grazing line counts as blocked and the player keeps closing in.
  const d = dist(x1, y1, x2, y2);
  const steps = Math.max(1, Math.ceil(d / 10));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (collideBuildings(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 10)) return false;
  }
  return true;
}

// Walk on foot toward a point: road graph to the nearest road point,
// then the last leg on foot. Returns true when arrived (<40).
function walkTo(tx, ty, dt) {
  walkTargetFor(tx, ty);
  const a = S.auto;
  let wp = a.walkRoute && a.walkRoute[a.walkIdx];
  // No waypoint (stale exhausted route): clear the walk state so the
  // next frame rebuilds a fresh route instead of reporting "arrived"
  // forever while standing still.
  if (!wp) { a.walkTarget = null; a.walkRoute = null; a.walkIdx = 0; return true; }
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
// If a car switch was just committed (maybeSwitchCar exited for a
// faster car), walk to THAT car: re-picking the fastest parked car
// every frame flickered when the faster car sat on the 320 range
// boundary (exit, then re-enter the old car, exit again — 6 thefts a
// second, heat 0 -> 100 in ~3s, then police pin and arrest: the m2
// death spiral). A committed target never flickers.
function getCarOrWalk(tx, ty, dt, chaseMode) {
  const range = chaseMode ? 320 : 200;
  const committed = S.auto.switchTarget;
  const committedOk = committed && committed.parked && committed.hp > 0 && !committed.isPolice;
  if (!committedOk) S.auto.switchTarget = null;
  const fast = committedOk ? committed : fastestParkedNear(S.player.x, S.player.y, range, 0);
  const target = fast || nearestCar(600);
  if (target) {
    if (dist(S.player.x, S.player.y, target.x, target.y) < 60) {
      enterCar(target);
      S.auto.walkTarget = null;
      S.auto.switchTarget = null;
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

function nearestArenaHealth(arena) {
  let best = null, bestD = Infinity;
  for (const pk of S.pickups) {
    if (pk.kind !== 'health' || pk.taken) continue;
    // Only this arena's pickups: a leftover from an earlier shootout
    // could sit on the far side of the city.
    if (dist(pk.x, pk.y, arena.x, arena.y) > 300) continue;
    const d = dist(S.player.x, S.player.y, pk.x, pk.y);
    if (d < bestD) { bestD = d; best = pk; }
  }
  return best;
}

function nearestArenaCrate() {
  // Prefer the arena SMG crate: it is the best shootout weapon
  // (10 dmg / 0.09s ≈ 111 dps vs pistol 56, shotgun 50). Only crates
  // spawned for this arena count — the world shotgun crate sits exactly
  // on the m10 arena centre, so "nearest crate" grabbed it first and
  // the autopilot never owned the SMG (run 3: m10 passed, smgSeen
  // false). Falls back to the nearest arena crate when no SMG is left.
  let best = null, bestD = Infinity;
  let smg = null, smgD = Infinity;
  for (const c of S.crates) {
    if (c.taken || !c.arena) continue;
    const d = dist(S.player.x, S.player.y, c.x, c.y);
    if (c.weapon === 'smg' && d < smgD) { smgD = d; smg = c; }
    if (d < bestD) { bestD = d; best = c; }
  }
  return smg || best;
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
  if (S.mode !== 'playing') return false;

  // Garage menu FIRST, before the paused check: opening the menu pauses
  // the world, and the autopilot must still buy the cheapest upgrade and
  // close it. (m11 freeze: the menu opened, the world paused, and this
  // branch sat below the paused early-return, so it was never reached
  // again — the player sat in the car at the garage forever.)
  if (garageMenuOpen()) {
    buyCheapestUpgrade();
    closeGarageMenu();
    return false;
  }
  if (S.paused) return false;

  // 1. Dialog accept FIRST — before any car search. (A held dialog,
  // e.g. the mission screenshot pose, is never auto-accepted.)
  if (S.dialog && !S.flags.holdDialog) { acceptDialog(); return false; }

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
    // Hurt: grab an arena health pickup first. A straight trade with
    // 3-5 guards drains HP faster than the fight ends (m10: DOWN at
    // 2 guards left, hp 28 -> 0); the mission already spawns two +40
    // pickups in the arena for exactly this.
    if (S.player.hp < 60) {
      const hp = nearestArenaHealth(arena);
      if (hp) { walkTo(hp.x, hp.y, dt); return false; }
    }
    // Pick up a better weapon crate in the arena first (m10). Only
    // crates near the arena count: world crates (e.g. the one at 700,700)
    // sit inside building blocks, and walking to one wedges the player
    // on a building face forever (m8 freeze).
    const crate = nearestArenaCrate();
    if (crate && S.weapons.current !== 'smg' && dist(p.x, p.y, crate.x, crate.y) < 500 && dist(crate.x, crate.y, arena.x, arena.y) < 300) {
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
    // Close in before shooting: at 300 the player often stands behind a
    // building and shoots a wall while another guard with a clear road
    // line shoots back (m8 death loop: 96 shots, 0 kills, then DOWN).
    // Only fire with a clear line of sight; otherwise keep closing in.
    if (d > 200 || !hasLineOfSight(p.x, p.y, enemy.x, enemy.y)) { walkTo(enemy.x, enemy.y, dt); return false; }
    // In range with a clear shot: aimed bursts at the weapon's own
    // rate, never spray. A fixed 0.45s cadence made the SMG crate a
    // downgrade (10 dmg / 0.45s = 22 dps vs pistol 18 / 0.45s = 40 dps)
    // and lost the m10 trade; at its own rate the SMG is the upgrade
    // it is meant to be. Same shot count, far less time under fire.
    a.shootTimer -= dt;
    mouse.wx = enemy.x; mouse.wy = enemy.y;
    if (a.shootTimer <= 0) {
      a.shootTimer = currentWeapon().rate;
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
      // maybeSwitchCar may have just exited the car (a faster parked
      // car is near): re-check before driving, or driveToward(null)
      // throws and aborts the whole frame (driveToPoint already guards
      // this the same way). Next frame the autopilot walks to that car.
      if (!p.inCar) return false;
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
  // Commit to the faster car before exiting: the on-foot search walks
  // to this exact car instead of re-picking every frame (see
  // getCarOrWalk — re-picking flickered on the range boundary and
  // stole the old car 6x a second).
  if (fast) { S.auto.switchTarget = fast; exitCar(); }
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
