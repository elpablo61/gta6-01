import { TRAFFIC_TARGET, DESPAWN_DIST, SPAWN_DIST, ROAD_SPACING, GRID_N } from './config.js';
import { nearestNode, nodePos, nodeNeighbours, collideCircle } from './world.js';
import { createVehicle } from './vehicles.js';
import { playerPos } from './player.js';

// Traffic cars drive the road graph: follow waypoints, slow for the car ahead,
// stop at busy intersections, never stack. Only cars near the player live.
function createTrafficCar(G, rng) {
  const types = ['sedan', 'sedan', 'taxi', 'truck', 'sports', 'sedan'];
  const type = rng.pick(types);
  const pp = playerPos(G);
  const node = nearestNode(G.world, pp.x, pp.y);
  const i = Math.max(0, Math.min(GRID_N - 1, node.i + rng.int(-4, 4)));
  const j = Math.max(0, Math.min(GRID_N - 1, node.j + rng.int(-4, 4)));
  const pos = { x: G.world.roadX(i), y: G.world.roadY(j) };
  const car = createVehicle(type, pos.x, pos.y, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]));
  car.traffic = true;
  car.driver = true; // a traffic car has a driver: taking it is a jacking
  car.targetSpeed = car.topSpeed * rng.range(0.35, 0.55);
  car.node = node.id;
  car.nextNode = null;
  car.waitT = 0;
  return car;
}

function updateTraffic(G, dt) {
  const p = G.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  // Keep the budget near the player: despawn the far, spawn the near.
  G.cars = G.cars.filter((car) => {
    if (car === p.inCar || car.parked || car.police) return true;
    if (car.traffic && Math.hypot(car.x - px, car.y - py) > DESPAWN_DIST) return false;
    return true;
  });
  const trafficCount = G.cars.filter((c) => c.traffic).length;
  for (let k = trafficCount; k < TRAFFIC_TARGET; k++) {
    const car = createTrafficCar(G, G.rng);
    if (Math.hypot(car.x - px, car.y - py) < SPAWN_DIST * 0.4) continue;
    G.cars.push(car);
  }
  for (const car of G.cars) {
    if (!car.traffic || car.wrecked) continue;
    // Pick the next intersection when the current one is reached.
    const target = car.nextNode != null ? nodePos(G.world, car.nextNode) : null;
    if (!target || Math.hypot(target.x - car.x, target.y - car.y) < 26) {
      car.node = car.nextNode != null ? car.nextNode : nearestNode(G.world, car.x, car.y).id;
      const opts = nodeNeighbours(car.node);
      car.nextNode = opts[Math.floor(G.rng.next() * opts.length)];
      continue;
    }
    const want = Math.atan2(target.y - car.y, target.x - car.x);
    let diff = want - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff * 3 * dt));
    // Slow for the car ahead, and at intersections when cross traffic is near.
    let desired = car.targetSpeed;
    for (const other of G.cars) {
      if (other === car || other.wrecked) continue;
      const dx = other.x - car.x, dy = other.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d < 70 && Math.cos(Math.atan2(dy, dx) - car.angle) > 0.6) { desired = 0; break; }
    }
    if (Math.hypot(target.x - car.x, target.y - car.y) < 90) desired = Math.min(desired, car.targetSpeed * 0.55);
    car.speed += Math.sign(desired - car.speed) * 200 * dt;
    car.speed = Math.max(0, Math.min(car.topSpeed, car.speed));
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const c = collideCircle(G.world, nx, ny, car.len * 0.42);
    car.x = c.x; car.y = c.y;
    if (c.hit) car.speed = 0;
  }
}

// Parked cars from the world generator become stealable vehicles.
function spawnParkedCars(G) {
  for (const spot of G.world.parkedSpots) {
    const car = createVehicle(spot.type, spot.x, spot.y, spot.angle);
    car.parked = true;
    car.traffic = false;
    G.cars.push(car);
  }
}

export { createTrafficCar, updateTraffic, spawnParkedCars };
