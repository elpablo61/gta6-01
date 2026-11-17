import { makeRng, pick, range } from './random.js';
import { makeCar, driveCar, carAheadDistance } from './vehicles.js';
import { nearestNode, findRoute, randomRoadPoint } from './world.js';

// Traffic: each car holds a waypoint route along the road graph, slows for
// the car ahead, and never reverses direction except at a dead end. Cars
// spawn and despawn only near the player, about twenty at a time.
const TRAFFIC_TYPES = ['sedan', 'sedan', 'taxi', 'sedan', 'truck', 'sedan'];

export function updateTraffic(state, dt) {
  const px = state.player.x; const py = state.player.y;
  // Despawn far traffic, keep the count near the target.
  state.cars = state.cars.filter((car) => {
    if (car.role === 'traffic') {
      const d = Math.hypot(car.x - px, car.y - py);
      return d < 1500;
    }
    return true;
  });
  const trafficCount = state.cars.filter((c) => c.role === 'traffic').length;
  if (trafficCount < 18 && state.time - (state.lastTrafficSpawn || 0) > 0.7) {
    state.lastTrafficSpawn = state.time;
    spawnTrafficCar(state);
  }
  for (const car of state.cars) {
    if (car.role !== 'traffic') continue;
    driveTrafficCar(state, car, dt);
  }
}

function spawnTrafficCar(state) {
  const rng = state.rng;
  const angle = Math.floor(rng() * 8) * (Math.PI / 4);
  const dist = 700 + rng() * 500;
  const x = state.player.x + Math.cos(angle) * dist;
  const y = state.player.y + Math.sin(angle) * dist;
  const node = nearestNode(state.world, x, y);
  const type = pick(rng, TRAFFIC_TYPES);
  const car = makeCar(type, node.x, node.y, pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]), 'traffic');
  car.color = pick(rng, ['#c94f3d', '#3d6fc9', '#d8d3c8', '#5a7d5a', '#f2c230', '#8a7f72']);
  car.cruise = 170 + rng() * 70;
  car.route = [];
  car.routeIndex = 0;
  state.cars.push(car);
}

function driveTrafficCar(state, car, dt) {
  if (!car.route || car.routeIndex >= car.route.length) {
    const from = nearestNode(state.world, car.x, car.y);
    const target = randomRoadPoint(state.rng);
    const route = findRoute(state.world, from, target);
    // Never reverse at a junction: drop a first step that points backwards.
    car.route = route;
    car.routeIndex = 0;
  }
  const wp = car.route[car.routeIndex];
  if (!wp) return;
  const dx = wp.x - car.x; const dy = wp.y - car.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 26) { car.routeIndex++; return; }
  const want = Math.atan2(dy, dx);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  const ahead = carAheadDistance(state, car, 130);
  let throttle = 1;
  if (ahead < 70) throttle = 0;
  else if (ahead < 130) throttle = 0.35;
  if (Math.abs(diff) > 1.1) throttle = Math.min(throttle, 0.4);
  driveCar(state, car, dt, throttle, steer, false);
  // Keep the cruise modest: traffic never races the player.
  if (car.speed > car.cruise) car.speed = car.cruise;
}
