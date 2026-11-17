import { PED_TARGET, DESPAWN_DIST, SPAWN_DIST, ROAD_W, SIDEWALK_W } from './config.js';
import { nearestNode, nodePos, nodeNeighbours, collideCircle } from './world.js';
import { addWantedHeat, spawnParticle } from './player.js';

// Pedestrians walk the sidewalks, cross at intersections, and flee from
// gunshots, speeding cars and police chases.
function createPedestrian(G, rng) {
  const node = nearestNode(G.world, G.player.x, G.player.y);
  const i = Math.max(0, Math.min(10, node.i + rng.int(-4, 4)));
  const j = Math.max(0, Math.min(10, node.j + rng.int(-4, 4)));
  const horizontal = rng.chance(0.5);
  const off = (rng.chance(0.5) ? 1 : -1) * (ROAD_W / 2 + SIDEWALK_W / 2);
  const colors = ['#d94f70', '#4f7fd9', '#e0a53c', '#7fc46a', '#9b6fd9', '#e07a4f'];
  return {
    x: horizontal ? G.world.roadX(i) + rng.range(-100, 100) : G.world.roadX(i) + off,
    y: horizontal ? G.world.roadY(j) + off : G.world.roadY(j) + rng.range(-100, 100),
    angle: rng.range(0, Math.PI * 2), speed: rng.range(45, 75),
    color: rng.pick(colors), alive: true, fleeing: false,
    target: null, waitT: 0, scaredT: 0,
  };
}

function updatePedestrians(G, dt) {
  const p = G.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  G.peds = G.peds.filter((ped) => ped.alive && Math.hypot(ped.x - px, ped.y - py) < DESPAWN_DIST);
  for (let k = G.peds.length; k < PED_TARGET; k++) {
    const ped = createPedestrian(G, G.rng);
    if (Math.hypot(ped.x - px, ped.y - py) < SPAWN_DIST * 0.35) continue;
    G.peds.push(ped);
  }
  const scared = G.shotsFiredRecently > 0 || (p.inCar && Math.abs(p.inCar.speed) > 380);
  for (const ped of G.peds) {
    if (!ped.alive) continue;
    // Flee from danger: run away from the player / gunfire.
    if (scared && Math.hypot(ped.x - px, ped.y - py) < 320) {
      ped.fleeing = true; ped.scaredT = 2.5;
    }
    if (ped.scaredT > 0) {
      ped.scaredT -= dt;
      if (ped.scaredT <= 0) ped.fleeing = false;
    }
    if (ped.fleeing) {
      const away = Math.atan2(ped.y - py, ped.x - px);
      ped.angle = away;
      ped.x += Math.cos(away) * 150 * dt;
      ped.y += Math.sin(away) * 150 * dt;
    } else {
      // Wander: pick a nearby intersection, walk to it, pick another.
      if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 20) {
        const node = nearestNode(G.world, ped.x, ped.y);
        const opts = nodeNeighbours(node.id);
        const next = opts[Math.floor(G.rng.next() * opts.length)];
        ped.target = nodePos(G.world, next);
        ped.waitT = G.rng.chance(0.25) ? G.rng.range(0.5, 2) : 0;
      }
      if (ped.waitT > 0) { ped.waitT -= dt; continue; }
      const want = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
      ped.angle = want;
      ped.x += Math.cos(want) * ped.speed * dt;
      ped.y += Math.sin(want) * ped.speed * dt;
    }
    const c = collideCircle(G.world, ped.x, ped.y, 10);
    ped.x = c.x; ped.y = c.y;
    // Hit by the player's car: a crime, and the pedestrian goes down.
    if (p.inCar && Math.abs(p.inCar.speed) > 90 && Math.hypot(ped.x - p.inCar.x, ped.y - p.inCar.y) < 26) {
      ped.alive = false;
      addWantedHeat(G, 10, 'pedestrian hit');
      for (let i = 0; i < 8; i++) spawnParticle(G, ped.x, ped.y, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, 0.5, '#e07a4f', 3);
    }
  }
}

export { createPedestrian, updatePedestrians };
