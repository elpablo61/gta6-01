// Crescent Bay — combat: bullets, enemies, shootouts, pickups.
// Enemies use the pistol only. The player shoots from the mouse aim
// (or the autopilot's aim) in aimed bursts; bullets check buildings,
// cars, enemies and the helicopter.
import { S } from './state.js';
import { ENEMY_HP } from './config.js';
import { dist, clamp } from './random.js';
import { collideBuildings } from './world.js';
import { currentWeapon, currentAmmo, addAmmo } from './weapons.js';
import { damageHeli } from './helicopter.js';
import { addHeat, setHeat } from './police.js';
import { sfx } from './audio.js';

export function spawnEnemy(x, y) {
  S.enemies.push({ x, y, angle: 0, hp: ENEMY_HP, fireTimer: 1 + Math.random(), speed: 110, home: { x, y } });
}

export function spawnAmmoPickup(x, y) {
  S.pickups.push({ x, y, kind: 'ammo', amount: 24, taken: false });
}
export function spawnHealthPickup(x, y) {
  S.pickups.push({ x, y, kind: 'health', amount: 40, taken: false });
}
export function spawnMoneyDrop(x, y) {
  S.pickups.push({ x, y, kind: 'money', amount: 150, taken: false });
}

export function firePlayerBullet(aimAngle) {
  const w = S.weapons;
  if (w.cooldown > 0) return false;
  const def = currentWeapon();
  if ((w.ammo[w.current] || 0) <= 0) return false;
  w.ammo[w.current] -= 1;
  w.cooldown = def.rate;
  S.stats.shotsFired += 1;
  S.flags.gunshot = true;
  for (let i = 0; i < def.pellets; i++) {
    const spread = (Math.random() - 0.5) * def.spread * 2;
    const a = aimAngle + spread;
    S.bullets.push({
      x: S.player.x + Math.cos(a) * 26, y: S.player.y + Math.sin(a) * 26,
      vx: Math.cos(a) * def.speed, vy: Math.sin(a) * def.speed,
      damage: def.damage, range: def.range, travelled: 0, fromPlayer: true,
    });
  }
  addHeat(0.4);
  sfx('shoot');
  return true;
}

export function updateBullets(dt) {
  for (const b of S.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.travelled += Math.hypot(b.vx, b.vy) * dt;
    if (b.travelled > b.range || b.x < 0 || b.x > 3200 || b.y < 0 || b.y > 3200) { b.dead = true; continue; }
    if (collideBuildings(b.x, b.y, 2)) { b.dead = true; S.fx.push({ x: b.x, y: b.y, life: 0.25, kind: 'spark' }); continue; }
    if (b.fromPlayer) {
      // Helicopter: bullets near its ground shadow damage it.
      if (S.heli && S.heli.active && !S.heli.retreating && dist(b.x, b.y, S.heli.x, S.heli.y) < 70) {
        damageHeli(b.damage);
        b.dead = true;
        continue;
      }
      for (const e of S.enemies) {
        if (e.hp > 0 && dist(b.x, b.y, e.x, e.y) < 22) {
          e.hp -= b.damage;
          b.dead = true;
          sfx('hit');
          S.fx.push({ x: e.x, y: e.y, life: 0.3, kind: 'hit' });
          break;
        }
      }
      if (b.dead) continue;
      for (const cop of S.police) {
        if (cop.hp > 0 && dist(b.x, b.y, cop.x, cop.y) < 20) {
          cop.hp -= b.damage;
          b.dead = true;
          addHeat(2);
          break;
        }
      }
    } else {
      // Enemy bullet vs the player.
      if (S.player.onFoot && dist(b.x, b.y, S.player.x, S.player.y) < 18) {
        damagePlayer(b.damage);
        b.dead = true;
      } else if (S.player.inCar && dist(b.x, b.y, S.player.inCar.x, S.player.inCar.y) < 26) {
        S.player.inCar.hp -= b.damage * 0.5;
        b.dead = true;
      }
    }
  }
  S.bullets = S.bullets.filter((b) => !b.dead);
}

export function damagePlayer(n) {
  const armor = S.player.inCar ? S.player.inCar.upgrades.armor || 0 : 0;
  const resist = armor * 0.12;
  S.player.hp -= n * (1 - resist);
  S.player.lastDamageAt = S.time;
  if (S.player.hp <= 0) {
    S.player.hp = 0;
    S.player.dead = true;
    S.mode = 'over';
    S.overReason = 'DOWN';
  }
}

export function updateEnemies(dt) {
  const p = S.player;
  for (const e of S.enemies) {
    if (e.hp <= 0) continue;
    const d = dist(e.x, e.y, p.x, p.y);
    // Enemies hold their arena ground and shoot when the player is near.
    if (d > 320) {
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      e.x += Math.cos(a) * e.speed * 0.5 * dt;
      e.y += Math.sin(a) * e.speed * 0.5 * dt;
    } else if (d < 140) {
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      e.x += Math.cos(a) * e.speed * 0.4 * dt;
      e.y += Math.sin(a) * e.speed * 0.4 * dt;
    }
    e.angle = Math.atan2(p.y - e.y, p.x - e.x);
    e.fireTimer -= dt;
    if (e.fireTimer <= 0 && d < 480 && p.onFoot) {
      e.fireTimer = 1.15 + Math.random() * 0.5;
      const a = e.angle + (Math.random() - 0.5) * 0.12;
      S.bullets.push({
        x: e.x + Math.cos(a) * 24, y: e.y + Math.sin(a) * 24,
        vx: Math.cos(a) * 620, vy: Math.sin(a) * 620,
        damage: 6, range: 500, travelled: 0, fromPlayer: false,
      });
      sfx('shoot');
    }
  }
  S.enemies = S.enemies.filter((e) => e.hp > 0);
}

export function updatePickups(dt) {
  const p = S.player;
  for (const pk of S.pickups) {
    if (pk.taken) continue;
    if (dist(p.x, p.y, pk.x, pk.y) < 42) {
      pk.taken = true;
      if (pk.kind === 'health') S.player.hp = clamp(S.player.hp + pk.amount, 0, 100);
      else if (pk.kind === 'ammo') addAmmo(S.weapons.current, pk.amount);
      else if (pk.kind === 'money') S.player.cash += pk.amount;
      sfx('pickup');
    }
  }
  S.pickups = S.pickups.filter((pk) => !pk.taken);
}
