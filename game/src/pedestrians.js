import { pick, range } from './random.js';
import { nearestRoadPoint } from './world.js';

// Pedestrians walk the sidewalks beside the roads and cross at junctions.
// A gunshot or a speeding car nearby makes them run away.
const PED_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#e67e22', '#1abc9c', '#ecf0f1'];

export function createPedestrian(state, x, y) {
  const rng = state.rng;
  return {
    x, y, angle: rng() * Math.PI * 2,
    speed: 55 + rng() * 35, color: pick(rng, PED_COLORS),
    target: null, fleeing: false, fleeUntil: 0,
    bob: rng() * 6,
  };
}

export function updatePedestrians(state, dt) {
  const px = state.player.x; const py = state.player.y;
  state.peds = state.peds.filter((ped) => Math.hypot(ped.x - px, ped.y - py) < 1600);
  if (state.peds.length < 26 && state.time - (state.lastPedSpawn || 0) > 0.35) {
    state.lastPedSpawn = state.time;
    const angle = state.rng() * Math.PI * 2;
    const dist = 500 + state.rng() * 600;
    const rp = nearestRoadPoint(state.world, px + Math.cos(angle) * dist, py + Math.sin(angle) * dist);
    const side = state.rng() > 0.5 ? 1 : -1;
    state.peds.push(createPedestrian(state, rp.x + side * 72, rp.y + side * 72));
  }
  for (const ped of state.peds) {
    updateOnePed(state, ped, dt);
  }
}

function updateOnePed(state, ped, dt) {
  const p = state.player;
  const scared = state.gunshotAt && state.time - state.gunshotAt < 1.2
    && Math.hypot(ped.x - p.x, ped.y - p.y) < 420;
  const carNear = state.playerCar && Math.hypot(ped.x - state.playerCar.x, ped.y - state.playerCar.y) < 90
    && Math.abs(state.playerCar.speed) > 200;
  if (scared || carNear) {
    ped.fleeing = true;
    ped.fleeUntil = state.time + 2.5;
  }
  if (ped.fleeing && state.time < ped.fleeUntil) {
    const away = Math.atan2(ped.y - p.y, ped.x - p.x);
    ped.angle = away;
    ped.x += Math.cos(away) * 190 * dt;
    ped.y += Math.sin(away) * 190 * dt;
    ped.bob += dt * 14;
    return;
  }
  ped.fleeing = false;
  if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 24) {
    const rp = nearestRoadPoint(state.world, ped.x + (state.rng() - 0.5) * 700, ped.y + (state.rng() - 0.5) * 700);
    const side = state.rng() > 0.5 ? 1 : -1;
    ped.target = { x: rp.x + side * 72, y: rp.y + side * 72 };
  }
  const dx = ped.target.x - ped.x; const dy = ped.target.y - ped.y;
  const d = Math.hypot(dx, dy) || 1;
  ped.angle = Math.atan2(dy, dx);
  ped.x += (dx / d) * ped.speed * dt;
  ped.y += (dy / d) * ped.speed * dt;
  ped.bob += dt * 8;
}

export function scatterPeds(state, x, y, radius) {
  for (const ped of state.peds) {
    if (Math.hypot(ped.x - x, ped.y - y) < radius) {
      ped.fleeing = true;
      ped.fleeUntil = state.time + 2.5;
    }
  }
}
