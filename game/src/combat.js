import { PISTOL_DAMAGE, PISTOL_RANGE, PISTOL_FIRE_INTERVAL } from './config.js';
import { addWantedHeat } from './police.js';

// Bullets are pooled in a plain array: fired, flown, and reaped every frame.
// The player shoots on foot with the mouse; mission enemies shoot back.
export function fireBullet(state, x, y, angle, owner, damage) {
  if (state.bullets.length > 60) return;
  state.bullets.push({
    x, y, vx: Math.cos(angle) * 780, vy: Math.sin(angle) * 780,
    life: 0.7, owner, damage: damage || PISTOL_DAMAGE,
  });
  state.particles.push({ x, y, vx: 0, vy: 0, life: 0.1, maxLife: 0.1, size: 16, kind: 'flash', color: '#fff3b0' });
  state.gunshotAt = state.time;
}

export function updateBullets(state, dt) {
  const p = state.player;
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0;
    // Buildings stop bullets.
    for (const bd of state.world.buildings) {
      if (Math.abs(b.x - bd.x) < bd.w / 2 && Math.abs(b.y - bd.y) < bd.d / 2) {
        dead = true;
        state.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.25, maxLife: 0.25, size: 8, kind: 'spark', color: '#ffb02e' });
        break;
      }
    }
    if (!dead && b.owner === 'player') {
      for (const e of state.enemies) {
        if (e.health > 0 && Math.hypot(e.x - b.x, e.y - b.y) < 22) {
          e.health -= b.damage;
          dead = true;
          state.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.3, maxLife: 0.3, size: 10, kind: 'spark', color: '#ff5a4e' });
          if (e.health <= 0) {
            state.flashMessage('Target down.', 1.5);
            addWantedHeat(state, 8);
          }
          break;
        }
      }
      if (!dead) {
        for (const cop of state.cops) {
          if (cop.health > 0 && Math.hypot(cop.x - b.x, cop.y - b.y) < 22) {
            cop.health -= b.damage;
            dead = true;
            if (cop.health <= 0) {
              addWantedHeat(state, 30);
              state.cops = state.cops.filter((c) => c !== cop);
              state.flashMessage('Officer down — the whole city is coming.', 2.5);
            }
            break;
          }
        }
      }
    }
    if (!dead && b.owner === 'enemy') {
      if (!state.playerCar && Math.hypot(p.x - b.x, p.y - b.y) < 18) {
        dead = true;
        state.player.health -= b.damage;
        state.player.lastDamageAt = state.time;
        if (state.player.health <= 0) {
          state.player.health = 0;
          state.gameOver = 'DOWN';
          state.mode = 'gameover';
        }
      }
    }
    if (dead) state.bullets.splice(i, 1);
  }
}

export function tryPlayerShoot(state, move) {
  const p = state.player;
  if (state.playerCar || p.health <= 0) return;
  if (!move.shoot) return;
  if (state.time - (state.lastShotAt || 0) < PISTOL_FIRE_INTERVAL) return;
  if (p.ammo <= 0) {
    state.flashMessage('Out of ammo — find a pickup.', 2);
    state.lastShotAt = state.time + 0.5;
    return;
  }
  state.lastShotAt = state.time;
  p.ammo -= 1;
  fireBullet(state, p.x + Math.cos(p.aimAngle) * 22, p.y + Math.sin(p.aimAngle) * 22, p.aimAngle, 'player', PISTOL_DAMAGE);
  if (state.audio && state.audio.gunshot) state.audio.gunshot();
  addWantedHeat(state, 2);
}

export function updateEnemies(state, dt) {
  const p = state.player;
  for (const e of state.enemies) {
    if (e.health <= 0) continue;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d > 480 || state.playerCar) {
      // Hold position and wait; enemies guard their turf.
      continue;
    }
    if (state.time > (e.shootAt || 0)) {
      e.shootAt = state.time + 1.5;
      const angle = Math.atan2(p.y - e.y, p.x - e.x);
      fireBullet(state, e.x + Math.cos(angle) * 20, e.y + Math.sin(angle) * 20, angle, 'enemy', 5);
    }
  }
  state.enemies = state.enemies.filter((e) => e.health > 0 || state.time - (e.diedAt || 0) < 0.5);
}

export function spawnEnemies(state, x, y, count, spread) {
  state.enemies = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + state.rng() * 0.5;
    state.enemies.push({
      x: x + Math.cos(a) * (spread || 120),
      y: y + Math.sin(a) * (spread || 120),
      health: 50, shootAt: state.time + 1.2, diedAt: 0,
    });
  }
}
