// Crescent Bay — traffic: ordinary cars that follow the road graph and
// slow behind the car ahead. Traffic cars never drive the player's car
// (the player's car is excluded from the traffic list).
import { S } from './state.js';
import { makeRng, dist } from './random.js';
import { driveToward, spawnTrafficCar } from './vehicles.js';
import { nearestJunction } from './world.js';

let rng = makeRng(20261118 + 77);

export function initTraffic(count) {
  for (let i = 0; i < count; i++) spawnTrafficCar(rng);
}

export function updateTraffic(dt, timeOfDay) {
  // Density varies by time of day: busier at midday, quieter at night.
  const target = timeOfDay >= 7 && timeOfDay <= 19 ? 14 : 8;
  const traffic = S.cars.filter((c) => c.isTraffic);
  if (traffic.length < target) spawnTrafficCar(rng);
  for (const car of traffic) {
    if (car.hp <= 0) continue;
    // Slow behind the car ahead.
    let cruise = car.cruise;
    for (const other of S.cars) {
      if (other === car || other.parked) continue;
      const dx = other.x - car.x, dy = other.y - car.y;
      const d = Math.hypot(dx, dy);
      const ahead = Math.cos(car.angle) * dx + Math.sin(car.angle) * dy;
      if (d < 90 && ahead > 0) { cruise = Math.min(cruise, Math.max(40, other.speed * 0.8)); break; }
    }
    if (!car.route || car.routeIdx >= car.route.length) {
      const tx = 200 + Math.floor(rng.next() * 8) * 400;
      const ty = 200 + Math.floor(rng.next() * 8) * 400;
      car.route = null;
      car.routeDest = null;
      driveToward(car, tx, ty, dt, cruise);
    } else {
      const dest = car.routeDest;
      driveToward(car, dest.x, dest.y, dt, cruise);
    }
    if (car.hp <= 0) car.parked = true;
  }
  // Remove wrecked traffic far from the player.
  S.cars = S.cars.filter((c) => !(c.isTraffic && c.hp <= 0 && dist(c.x, c.y, S.player.x, S.player.y) > 900));
}
