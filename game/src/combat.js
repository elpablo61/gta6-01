import { collideCircle, pointInBuilding } from './world.js';
import { fireBullet, spawnParticle, healPlayer, giveAmmo, toast } from './player.js';
import { playGunshot, playPickup } from './audio.js';

// Rival crew: armed enemies for shootout missions. They advance on the
// player, strafe, and shoot when they have line of sight and range.
function spawnRivalCrew(G, x, y, count) {
  const crew = [];
  for (let i = 0; i < count; i++) {
    const a = G.rng.range(0, Math.PI * 2);
    const r = 60 + G.rng.range(0, 90);
    const e = {
      x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
      angle: 0, speed: 95, health: 100, alive: true,
      shootT: G.rng.range(0.5, 1.5), strafeDir: G.rng.chance(0.5) ? 1 : -1,
      strafeT: 0,
    };
    const c = collideCircle(G.world, e.x, e.y, 14);
    e.x = c.x; e.y = c.y;
    G.enemies.push(e);
    crew.push(e);
  }
  return crew;
}

function updateEnemies(G, dt) {
  const p = G.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(px - e.x, py - e.y);
    const want = Math.atan2(py - e.y, px - e.x);
    e.angle = want;
    e.strafeT -= dt;
    if (e.strafeT <= 0) { e.strafeT = G.rng.range(0.8, 1.8); e.strafeDir *= -1; }
    // Advance until ~200 px, then strafe and shoot.
    if (d > 220) {
      e.x += Math.cos(want) * e.speed * dt;
      e.y += Math.sin(want) * e.speed * dt;
    } else {
      const sa = want + Math.PI / 2 * e.strafeDir;
      e.x += Math.cos(sa) * e.speed * 0.6 * dt;
      e.y += Math.sin(sa) * e.speed * 0.6 * dt;
    }
    const c = collideCircle(G.world, e.x, e.y, 14);
    e.x = c.x; e.y = c.y;
    e.shootT -= dt;
    if (d < 420 && e.shootT <= 0 && !p.dead && hasLineOfSightTo(G, e.x, e.y, px, py)) {
      e.shootT = 1.1 + G.rng.range(0, 0.6);
      const aim = want + G.rng.range(-0.12, 0.12);
      fireBullet(G, e.x, e.y, aim, 'enemy');
      playGunshot(G.audio);
      G.muzzleEnemy = { x: e.x + Math.cos(aim) * 24, y: e.y + Math.sin(aim) * 24, t: 0.07 };
    }
  }
  if (G.muzzleEnemy) {
    G.muzzleEnemy.t -= dt;
    if (G.muzzleEnemy.t <= 0) G.muzzleEnemy = null;
  }
  G.enemies = G.enemies.filter((e) => e.alive);
}

function hasLineOfSightTo(G, x0, y0, x1, y1) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 40);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (pointInBuilding(G.world, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

function spawnPickup(G, x, y, kind) {
  // Health / ammo pickups scattered at mission sites and the hospital.
  G.pickups.push({ x, y, kind, alive: true, bob: 0 });
}

function updatePickups(G, dt) {
  const p = G.player;
  for (const pk of G.pickups) {
    if (!pk.alive) continue;
    pk.bob += dt;
    const px = p.inCar ? p.inCar.x : p.x;
    const py = p.inCar ? p.inCar.y : p.y;
    if (Math.hypot(pk.x - px, pk.y - py) < 34) {
      pk.alive = false;
      if (pk.kind === 'health') healPlayer(G, 35);
      else giveAmmo(G, 24);
      playPickup(G.audio);
      toast(G, pk.kind === 'health' ? '+35 health' : '+24 ammo');
    }
  }
  G.pickups = G.pickups.filter((pk) => pk.alive);
}

export { spawnRivalCrew, updateEnemies, hasLineOfSightTo, spawnPickup, updatePickups };
