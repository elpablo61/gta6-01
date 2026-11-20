// Crescent Bay — the wanted system: heat, stars, foot police, patrol
// cars, roadblocks, the Spray Shop, and arrest rules.
// Heat decays only while hiding (no police within 450 for 3s) and only
// while the helicopter spotlight is NOT on Rook.
import { S } from './state.js';
import { STAR_THRESHOLDS, HIDE_RANGE, HIDE_SECONDS, SPRAY_RADIUS, SPRAY_DRAIN, PLAYER_HP } from './config.js';
import { makeRng, dist, clamp } from './random.js';
import { makeCar, driveToward, effectiveTop } from './vehicles.js';
import { nearestJunction, nearestRoadPoint } from './world.js';
import { sfx } from './audio.js';

export const SPRAY_SHOP = { x: 1000, y: 2600 };
export const HIDEOUT = { x: 600, y: 600 };
export const GARAGE_POS = { x: 1000, y: 1000 };

let rng = makeRng(20261118 + 55);

export function starsForHeat(heat) {
  let s = 0;
  for (let i = 0; i < STAR_THRESHOLDS.length; i++) {
    if (heat >= STAR_THRESHOLDS[i]) s = i;
  }
  return s;
}

export function addHeat(n) {
  S.heat = clamp(S.heat + n, 0, 100);
  S.stars = starsForHeat(S.heat);
}

export function setHeat(n) {
  S.heat = clamp(n, 0, 100);
  S.stars = starsForHeat(S.heat);
}

function spawnFootCop() {
  const a = rng.next() * Math.PI * 2;
  const x = clamp(S.player.x + Math.cos(a) * 500, 60, 3140);
  const y = clamp(S.player.y + Math.sin(a) * 500, 60, 3140);
  S.police.push({ x, y, angle: 0, speed: 150, hp: 30, arrest: 0 });
}

function spawnPatrol() {
  const j = nearestJunction(S.player.x, S.player.y);
  const a = rng.next() * Math.PI * 2;
  const x = clamp(j.x + Math.cos(a) * 420, 60, 3140);
  const y = clamp(j.y + Math.sin(a) * 420, 60, 3140);
  const car = makeCar(x, y, 'police');
  car.isTraffic = false;
  S.cars.push(car);
  S.patrols.push(car);
  return car;
}

function spawnRoadblock() {
  const j = nearestJunction(S.player.x + 500, S.player.y);
  const rp = nearestRoadPoint(j.x, j.y);
  S.roadblocks.push({ x: rp.x, y: rp.y, angle: 0, hp: 60 });
}

export function updateWanted(dt) {
  // Spotlight on Rook blocks heat decay entirely.
  const spotlightOn = S.heli && S.heli.active && !S.heli.retreating && S.heli.onPlayer;
  let nearestPolice = Infinity;
  for (const c of S.police) nearestPolice = Math.min(nearestPolice, dist(c.x, c.y, S.player.x, S.player.y));
  for (const c of S.patrols) nearestPolice = Math.min(nearestPolice, dist(c.x, c.y, S.player.x, S.player.y));
  if (nearestPolice > HIDE_RANGE && !spotlightOn) {
    S.hideTimer += dt;
    if (S.hideTimer > HIDE_SECONDS) setHeat(S.heat - 6 * dt);
  } else S.hideTimer = 0;

  // Spray Shop: fast heat clear inside the radius.
  const dSpray = dist(S.player.x, S.player.y, SPRAY_SHOP.x, SPRAY_SHOP.y);
  if (dSpray < SPRAY_RADIUS && S.heat > 0) setHeat(S.heat - SPRAY_DRAIN * dt);

  // Spawn pressure by stars.
  const wantCops = S.stars >= 1 ? Math.min(2 + S.stars, 6) : 0;
  const wantPatrols = S.stars >= 2 ? Math.min(S.stars - 1, 4) : 0;
  if (S.police.length < wantCops && rng.chance(dt * 0.8)) spawnFootCop();
  if (S.patrols.length < wantPatrols && rng.chance(dt * 0.5)) spawnPatrol();
  if (S.stars >= 4 && S.roadblocks.length < 2 && rng.chance(dt * 0.3)) spawnRoadblock();
  if (S.stars < 2) {
    for (const p of S.patrols) { p.hp = 0; }
    S.patrols = S.patrols.filter((p) => p.hp > 0);
    S.cars = S.cars.filter((c) => !c.isPolice || c.hp > 0);
  }
  if (S.stars < 4) S.roadblocks = [];
}

export function updatePolice(dt) {
  const p = S.player;
  // Foot cops: chase on foot, hold a ring around a shootout area,
  // arrest only after staying within 30 of a slow on-foot player for
  // 1.2s straight. Running away breaks the arrest.
  for (const cop of S.police) {
    const d = dist(cop.x, cop.y, p.x, p.y);
    // Read the live stage off the mission's stage list: S.mission has
    // no `.stage` property (it was never assigned), so the old lookup
    // `S.mission.stage.type` was always undefined and this ring never
    // engaged — cops charged straight at a stationary shooter and
    // arrested it at full HP (m12 run 3: ~31 deaths, hp 100 at each
    // reset, heat 74 from mission start). With the ring live, cops hold
    // 300 out during a shootout and can no longer close to arrest range.
    const st = S.mission && S.mission.stages ? S.mission.stages[S.mission.stageIndex] : null;
    const inArena = !!st && st.type === 'shootout';
    let tx = p.x, ty = p.y;
    if (inArena && d < 260) {
      // Perimeter: hold a ring, never pile onto one spot.
      const a = Math.atan2(cop.y - p.y, cop.x - p.x);
      tx = p.x + Math.cos(a) * 300;
      ty = p.y + Math.sin(a) * 300;
    }
    const a = Math.atan2(ty - cop.y, tx - cop.x);
    cop.angle = a;
    const sp = inArena && d < 260 ? cop.speed * 0.4 : cop.speed;
    cop.x += Math.cos(a) * sp * dt;
    cop.y += Math.sin(a) * sp * dt;
    // Arrest rule.
    if (p.onFoot && d < 30 && !p.inCar) {
      const playerSpeed = Math.hypot(p.vx || 0, p.vy || 0);
      if (playerSpeed < 60) {
        cop.arrest += dt;
        if (cop.arrest > 1.2) { S.mode = 'over'; S.overReason = 'CAUGHT'; }
      } else cop.arrest = 0;
    } else cop.arrest = 0;
  }
  // Patrol cars: ram the player's car; brake and reverse near the
  // Spray Shop so they never shove the player out of it.
  for (const car of S.patrols) {
    if (car.hp <= 0) continue;
    // Belt-and-braces: never drive the player's own car at the player
    // (a stolen patrol car is removed from S.patrols in enterCar, but
    // a stale reference must never self-ram).
    if (car === p.inCar) continue;
    const dSpray = dist(car.x, car.y, SPRAY_SHOP.x, SPRAY_SHOP.y);
    if (dSpray < 130) {
      car.speed = Math.max(-80, car.speed - 300 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      continue;
    }
    const target = p.inCar || dist(car.x, car.y, p.x, p.y) < 500;
    if (target) {
      driveToward(car, p.x, p.y, dt, Math.min(effectiveTop(car), 520));
      const d = dist(car.x, car.y, p.x, p.y);
      if (d < 60 && p.inCar) {
        p.inCar.hp -= 2 * dt;
        if (Math.abs(car.speed) > 120) sfx('crash');
      }
    }
  }
  S.patrols = S.patrols.filter((c) => c.hp > 0);
  S.police = S.police.filter((c) => c.hp > 0);
  // Roadblocks are static; the player ramming one damages the car.
  for (const rb of S.roadblocks) {
    if (p.inCar && dist(p.inCar.x, p.inCar.y, rb.x, rb.y) < 50) {
      p.inCar.hp -= 8 * dt;
      p.inCar.speed *= 0.9;
    }
  }
}
