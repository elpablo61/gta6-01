// Crescent Bay — screenshot poses (?shot=). Each pose plays itself via
// the autopilot from a fresh world, deterministic seed 7: the cover is a
// bright daytime waterfront chase, the mission shot is an on-foot
// shootout with the fixer dialog held visible, the night shot is a
// night chase with headlights and a roadblock, the start shot is the
// title overlay over the living city.
import { S } from './state.js';
import { makeCar, effectiveTop } from './vehicles.js';
import { setHeat, SPRAY_SHOP } from './police.js';
import { startMission } from './missions.js';
import { enterCar } from './player.js';
import { AP_HOOKS } from './autopilot.js';

function putPlayerInCar(x, y, type, angle) {
  const car = makeCar(x, y, type, { angle });
  car.parked = false;
  S.cars.push(car);
  S.player.x = x; S.player.y = y;
  enterCar(car);
  return car;
}

function addPatrolBehind(x, y, n) {
  for (let i = 0; i < n; i++) {
    const car = makeCar(x, y + 130 + i * 120, 'police', { angle: -Math.PI / 2 });
    car.parked = false;
    S.cars.push(car);
    S.patrols.push(car);
  }
}

export function applyShot(name, startNewGame) {
  S.shotMode = name;
  S.autopilot = true;
  if (name === 'start') {
    // Title overlay over the living city; no game started yet.
    S.mode = 'title';
    S.dayTime = 10;
    S.flags.patrolLoop = null;
    return;
  }
  startNewGame();
  S.dayTime = 10;
  if (name === 'cover') {
    // Bright daytime, waterfront, chase, wanted 3, escape objective.
    putPlayerInCar(2600, 1400, 'sports', -Math.PI / 2);
    addPatrolBehind(2600, 1400, 2);
    setHeat(58);
    startMission('m7');
    S.mission.stageIndex = 1; // escape stage: drive to the Spray Shop
    S.flags.patrolLoop = null;
  } else if (name === 'mission') {
    // On foot, shootout, fixer dialog held visible.
    startMission('m8');
    S.player.x = 2100; S.player.y = 1250;
    S.player.onFoot = true;
    S.dialog = { fixer: 'Mara', text: 'The big one. Three guards at the yard. Deal with them, then vanish.', kind: 'info' };
    S.flags.holdDialog = true;
  } else if (name === 'night') {
    // Night chase, headlights, roadblock, wanted 4.
    S.dayTime = 23;
    putPlayerInCar(2600, 1800, 'sports', -Math.PI / 2);
    addPatrolBehind(2600, 1800, 2);
    S.roadblocks.push({ x: 2600, y: 1000, angle: 0, hp: 60 });
    startMission('m7');
    // Heat AFTER startMission: startMission re-arms m7's own heat (58),
    // so setting 74 before it was overwritten and the shot read 3 stars.
    setHeat(74);
    S.mission.stageIndex = 1;
  }
  // Patrol loop for the cover/night chase poses: keep driving north.
  if (name === 'cover' || name === 'night') {
    S.flags.patrolLoop = [{ x: 2600, y: 600 }, { x: 2600, y: 2600 }];
    S.flags.patrolIdx = 0;
  }
}
