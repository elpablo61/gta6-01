import { PLAYER_WALK_SPEED, PLAYER_SPRINT_SPEED, PLAYER_RADIUS, PLAYER_MAX_HEALTH } from './config.js';
import { collideBuildings, collideWorldBounds, pointInWater } from './world.js';

// Rook, the player on foot. Movement is axis-separated so sliding along a
// building wall feels natural; buildings always win the collision.
export function createPlayer(x, y) {
  return {
    x, y, angle: 0, radius: PLAYER_RADIUS,
    health: PLAYER_MAX_HEALTH, cash: 250, ammo: 60,
    inCar: null, speed: 0, lastDamageAt: 0, aimAngle: 0,
    moving: false,
  };
}

export function updatePlayerOnFoot(state, dt, move) {
  const p = state.player;
  const speed = move.sprint ? PLAYER_SPRINT_SPEED : PLAYER_WALK_SPEED;
  let dx = (move.right ? 1 : 0) - (move.left ? 1 : 0);
  let dy = (move.down ? 1 : 0) - (move.up ? 1 : 0);
  const len = Math.hypot(dx, dy);
  p.moving = len > 0;
  if (len > 0) {
    dx /= len; dy /= len;
    const nx = p.x + dx * speed * dt;
    const ny = p.y + dy * speed * dt;
    const stepped = collideBuildings(state.world, nx, p.y, p.radius);
    p.x = stepped.x;
    const stepped2 = collideBuildings(state.world, p.x, ny, p.radius);
    p.y = stepped2.y;
    const bounded = collideWorldBounds(state.world, p.x, p.y, p.radius);
    p.x = bounded.x; p.y = bounded.y;
    if (pointInWater(state.world, p.x)) p.x = state.world.waterX + 40;
    p.angle = Math.atan2(dy, dx);
    p.speed = speed;
  } else {
    p.speed = 0;
  }
  // Aim follows the mouse (world coordinates are set by the main loop).
  p.aimAngle = Math.atan2(move.aimY - p.y, move.aimX - p.x);
  // Slow health regen after five calm seconds.
  if (state.time - p.lastDamageAt > 5 && p.health > 0 && p.health < PLAYER_MAX_HEALTH) {
    p.health = Math.min(PLAYER_MAX_HEALTH, p.health + 4 * dt);
  }
}

export function damagePlayer(state, amount) {
  const p = state.player;
  if (p.health <= 0) return;
  p.health -= amount;
  p.lastDamageAt = state.time;
  if (p.health <= 0) {
    p.health = 0;
    state.gameOver = 'DOWN';
    state.mode = 'gameover';
  }
}

export function healPlayer(state, amount) {
  const p = state.player;
  p.health = Math.min(PLAYER_MAX_HEALTH, p.health + amount);
}
