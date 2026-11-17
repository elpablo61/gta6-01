import {
  PLAYER_WALK_SPEED, PLAYER_RUN_SPEED, PLAYER_RADIUS, PLAYER_HEALTH_MAX,
  PISTOL_AMMO_MAX,
} from './config.js';
import { collideCircle, pointInBuilding } from './world.js';
import { playGunshot } from './audio.js';

// The player's effective position: the car when driving, the feet otherwise.
// Spawn systems must use this, not the stale on-foot coordinates.
function playerPos(G) {
  const p = G.player;
  return p.inCar ? { x: p.inCar.x, y: p.inCar.y } : { x: p.x, y: p.y };
}

function createPlayer(x, y) {
  return {
    x, y, angle: 0, speed: 0,
    health: PLAYER_HEALTH_MAX, cash: 250, ammo: 24,
    inCar: null, // vehicle object or null
    fireCooldown: 0, hurtFlash: 0, dead: false,
    hasPistol: true, kills: 0,
  };
}

function updatePlayerOnFoot(G, dt) {
  const p = G.player;
  if (p.inCar || p.dead) return;
  const inp = G.input;
  let mx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  let my = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
  const len = Math.hypot(mx, my);
  if (len > 0) { mx /= len; my /= len; }
  const speed = inp.sprint ? PLAYER_RUN_SPEED : PLAYER_WALK_SPEED;
  p.x += mx * speed * dt;
  p.y += my * speed * dt;
  p.speed = len * speed;
  // Aim at the mouse (screen space -> world space).
  const wx = G.camera.x + inp.mouseX;
  const wy = G.camera.y + inp.mouseY;
  p.angle = Math.atan2(wy - p.y, wx - p.x);
  // Collision: buildings + water + world bounds.
  const c = collideCircle(G.world, p.x, p.y, PLAYER_RADIUS);
  p.x = c.x; p.y = c.y;
  // Shooting (hold to fire, or a single click fires one shot).
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  if ((inp.fire || inp.pressed.Mouse0) && p.fireCooldown <= 0 && p.ammo > 0) {
    p.fireCooldown = 0.28;
    p.ammo -= 1;
    G.shotsFiredRecently = 1.5; // nearby pedestrians hear the shot and flee
    fireBullet(G, p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20, p.angle, 'player');
    G.muzzle = { x: p.x + Math.cos(p.angle) * 26, y: p.y + Math.sin(p.angle) * 26, t: 0.07 };
    playGunshot(G.audio);
  }
  p.hurtFlash = Math.max(0, p.hurtFlash - dt);
}

function damagePlayer(G, amount, cause) {
  const p = G.player;
  if (p.dead || G.state !== 'playing') return;
  p.health -= amount;
  p.hurtFlash = 0.25;
  if (p.health <= 0) {
    p.health = 0;
    p.dead = true;
    gameOver(G, cause === 'caught' ? 'CAUGHT' : 'DOWN');
  }
}

function gameOver(G, reason) {
  G.state = 'gameover';
  G.gameOverReason = reason;
  const el = document.getElementById('game-over-screen');
  const title = document.getElementById('game-over-title');
  const sub = document.getElementById('game-over-sub');
  if (title) title.textContent = reason;
  if (sub) {
    sub.textContent = reason === 'CAUGHT'
      ? 'The Crescent Bay PD hauled you in. You lost $' + 150 + ' — but the street remembers.'
      : 'You went down in the streets of Crescent Bay. The fixer still needs you.';
  }
  if (el) el.classList.remove('hidden');
  // Respawn costs cash but never ends the run or loses mission progress.
  G.player.cash = Math.max(0, G.player.cash - 150);
}

function respawnPlayer(G) {
  const p = G.player;
  p.dead = false;
  p.health = PLAYER_HEALTH_MAX;
  p.ammo = Math.max(p.ammo, 12);
  const lm = G.world.landmarks.hospital;
  p.x = lm.x + 30; p.y = lm.y + 30;
  p.inCar = null;
  G.wanted.heat = Math.max(0, G.wanted.heat - 40);
  updateWantedStars(G);
  document.getElementById('game-over-screen')?.classList.add('hidden');
  G.state = 'playing';
  toast(G, 'Patched up at St. Marina Hospital. Back on the street, Rook.');
}

function healPlayer(G, amount) {
  G.player.health = Math.min(PLAYER_HEALTH_MAX, G.player.health + amount);
}

function giveAmmo(G, amount) {
  G.player.ammo = Math.min(PISTOL_AMMO_MAX, G.player.ammo + amount);
}

function fireBullet(G, x, y, angle, from) {
  // Pooled bullets: reuse a dead slot instead of allocating.
  let b = G.bullets.find((bb) => !bb.alive);
  if (!b) {
    if (G.bullets.length >= 80) return;
    b = {}; G.bullets.push(b);
  }
  b.alive = true; b.x = x; b.y = y; b.angle = angle;
  b.speed = 720; b.life = 0.9; b.from = from;
}

function updateBullets(G, dt) {
  for (const b of G.bullets) {
    if (!b.alive) continue;
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    b.life -= dt;
    if (b.life <= 0) { b.alive = false; continue; }
    // Hit a building?
    if (pointInBuilding(G.world, b.x, b.y)) {
      b.alive = false;
      spawnImpact(G, b.x, b.y);
      continue;
    }
    if (b.from === 'player') {
      // Hit an enemy?
      for (const e of G.enemies) {
        if (!e.alive) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < 16) {
          b.alive = false; e.health -= 34;
          spawnImpact(G, b.x, b.y);
          if (e.health <= 0) { e.alive = false; G.player.kills++; addCash(G, 25); }
          break;
        }
      }
      if (!b.alive) continue;
      // Hit a cop on foot?
      for (const c of G.cops) {
        if (!c.alive || c.inCar) continue;
        if (Math.hypot(c.x - b.x, c.y - b.y) < 16) {
          b.alive = false; c.health -= 34;
          addWantedHeat(G, 8, 'cop shot');
          spawnImpact(G, b.x, b.y);
          if (c.health <= 0) { c.alive = false; G.player.kills++; addWantedHeat(G, 14, 'cop down'); }
          break;
        }
      }
      if (!b.alive) continue;
      // Hit a pedestrian? (a crime — the player chose to do it)
      for (const ped of G.peds) {
        if (!ped.alive) continue;
        if (Math.hypot(ped.x - b.x, ped.y - b.y) < 13) {
          b.alive = false; ped.alive = false; ped.fleeing = true;
          addWantedHeat(G, 6, 'pedestrian hit');
          spawnImpact(G, b.x, b.y);
          break;
        }
      }
    } else {
      // Enemy / cop bullet vs the player.
      const p = G.player;
      if (!p.dead && !p.inCar && Math.hypot(p.x - b.x, p.y - b.y) < 14) {
        b.alive = false;
        damagePlayer(G, 9, 'shot');
        spawnImpact(G, b.x, b.y);
      } else if (!p.dead && p.inCar && Math.hypot(p.inCar.x - b.x, p.inCar.y - b.y) < 24) {
        b.alive = false;
        damageVehicle(G, p.inCar, 6);
        spawnImpact(G, b.x, b.y);
      }
    }
  }
}

function spawnImpact(G, x, y) {
  for (let i = 0; i < 6; i++) {
    spawnParticle(G, x, y, (Math.random() - 0.5) * 160, (Math.random() - 0.5) * 160, 0.35, '#ffd76a', 3);
  }
}

function spawnParticle(G, x, y, vx, vy, life, color, size) {
  let pt = G.particles.find((pp) => !pp.alive);
  if (!pt) {
    if (G.particles.length >= 300) return;
    pt = {}; G.particles.push(pt);
  }
  pt.alive = true; pt.x = x; pt.y = y; pt.vx = vx; pt.vy = vy;
  pt.life = life; pt.maxLife = life; pt.color = color; pt.size = size;
}

function updateParticles(G, dt) {
  for (const pt of G.particles) {
    if (!pt.alive) continue;
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vx *= 0.92; pt.vy *= 0.92;
    pt.life -= dt;
    if (pt.life <= 0) pt.alive = false;
  }
  if (G.muzzle) {
    G.muzzle.t -= dt;
    if (G.muzzle.t <= 0) G.muzzle = null;
  }
}

function toast(G, msg) {
  G.toast = { text: msg, t: 4 };
}

function addCash(G, amount) {
  G.player.cash += amount;
}

function addWantedHeat(G, amount, why) {
  G.wanted.heat = Math.min(100, G.wanted.heat + amount);
  updateWantedStars(G);
}

function updateWantedStars(G) {
  const h = G.wanted.heat;
  let stars = 0;
  if (h >= 80) stars = 5;
  else if (h >= 55) stars = 4;
  else if (h >= 30) stars = 3;
  else if (h >= 12) stars = 2;
  else if (h > 0) stars = 1;
  G.wanted.stars = stars;
}

function damageVehicle(G, car, amount) {
  car.damage = Math.min(100, (car.damage || 0) + amount);
  if (car.damage >= 100 && !car.wrecked) {
    car.wrecked = true;
    car.speed = 0;
    spawnSmoke(G, car.x, car.y);
    if (G.player.inCar === car) {
      // The car dies under the player: bail out on foot.
      G.player.inCar = null;
      G.player.x = car.x + 40; G.player.y = car.y + 40;
    }
  }
}

function spawnSmoke(G, x, y) {
  for (let i = 0; i < 10; i++) {
    spawnParticle(G, x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 30, -30 - Math.random() * 30, 1.2, '#888888', 7);
  }
}

export {
  createPlayer, playerPos, updatePlayerOnFoot, damagePlayer, gameOver, respawnPlayer,
  healPlayer, giveAmmo, fireBullet, updateBullets, spawnParticle, updateParticles,
  toast, addCash, addWantedHeat, updateWantedStars, damageVehicle, spawnSmoke,
};
