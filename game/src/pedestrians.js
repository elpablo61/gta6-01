// Crescent Bay — pedestrians: walk the sidewalks, flee when scared.
// Variety in colour and speed, some walk in pairs (living city).
import { S } from './state.js';
import { makeRng, dist } from './random.js';
import { roads, nearestRoadPoint } from './world.js';

const SHIRT_COLORS = ['#d86a6a', '#6a8ad8', '#6ad88a', '#d8c86a', '#b06ad8', '#e8e8e8', '#3a3a3a', '#d88a3a'];
let rng = makeRng(20261118 + 31);

export function initPeds(count) {
  for (let i = 0; i < count; i++) spawnPed();
}

export function spawnPed(x, y) {
  const px = x ?? roads[rng.int(0, 7)] + (rng.chance(0.5) ? 48 : -48);
  const py = y ?? 200 + rng.next() * 2800;
  const pair = rng.chance(0.3);
  const base = {
    x: px, y: py, angle: rng.next() * Math.PI * 2,
    speed: rng.range(40, 85), color: rng.pick(SHIRT_COLORS),
    target: null, flee: 0, pairId: pair ? Math.floor(rng.next() * 10000) : -1,
  };
  S.peds.push(base);
  if (pair) {
    S.peds.push({ ...base, x: px + 26, y: py + 10, speed: base.speed, pairId: base.pairId, target: null, flee: 0 });
  }
}

function pickTarget(p) {
  const rp = nearestRoadPoint(p.x, p.y);
  const jx = rp.x + (rng.chance(0.5) ? 1 : -1) * rng.range(100, 400);
  const jy = rp.y + (rng.chance(0.5) ? 1 : -1) * rng.range(100, 400);
  return { x: Math.max(60, Math.min(3140, jx)), y: Math.max(60, Math.min(3140, jy)) };
}

export function updatePeds(dt) {
  const px = S.player.x, py = S.player.y;
  const playerCar = S.player.inCar;
  for (const p of S.peds) {
    // Flee: player (or their car) close and fast, or a gunshot nearby.
    const d = dist(p.x, p.y, px, py);
    const threat = d < 160 && (playerCar ? Math.abs(playerCar.speed) > 150 : true);
    if (threat || S.flags.gunshot) p.flee = 1.2;
    let tx, ty, sp = p.speed;
    if (p.flee > 0) {
      p.flee -= dt;
      const a = Math.atan2(p.y - py, p.x - px);
      tx = p.x + Math.cos(a) * 200;
      ty = p.y + Math.sin(a) * 200;
      sp = p.speed * 2.4;
    } else {
      if (!p.target || dist(p.x, p.y, p.target.x, p.target.y) < 30) p.target = pickTarget(p);
      tx = p.target.x; ty = p.target.y;
    }
    const a = Math.atan2(ty - p.y, tx - p.x);
    p.angle = a;
    p.x += Math.cos(a) * sp * dt;
    p.y += Math.sin(a) * sp * dt;
    p.x = Math.max(40, Math.min(3160, p.x));
    p.y = Math.max(40, Math.min(3160, p.y));
  }
  if (S.peds.length < 22) spawnPed();
}
