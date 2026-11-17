import { GOTO_RADIUS, CHASE_HIT_DISTANCE, CHASE_HIT_MIN_SPEED, MARINA, DOCKS } from './config.js';
import { makeCar, driveCar } from './vehicles.js';
import { nearestNode, findRoute } from './world.js';
import { spawnEnemies } from './combat.js';
import { setWantedHeat } from './police.js';

// The eight-job arc. Each job is data: a fixer hook, a sequence of
// objectives that are conditions (reach, ram, escape, clear) rather than
// kill counts, and a cash reward. The engine below is generic; jobs 4-8
// are variants of the same objective types as jobs 1-3.
const MISSION_ARC = [
  {
    id: 'first-job', name: 'First Job', fixer: 'Mara Voss',
    hook: 'Mara: Rook, first job. Pick up the package on Harbor Row, drop it at the old arcade. Easy money. Don\'t make it hard.',
    reward: 400, type: 'goto',
    startPoint: { x: 0, y: 400 },
    targets: [
      { x: 400, y: 400, label: 'Pick up the package' },
      { x: -400, y: -400, label: 'Deliver the package' },
    ],
  },
  {
    id: 'tail-chase', name: 'Tail Chase', fixer: 'Mara Voss',
    hook: 'Mara: A courier is moving my cut across town. Ram his car till he stops. Five good hits and he\'s done.',
    reward: 800, type: 'chase',
    startPoint: { x: 400, y: 0 },
    targets: [{ x: 0, y: 0, label: 'Ram the courier — 5 hits' }],
    hitsNeeded: 5,
  },
  {
    id: 'hot-wheels', name: 'Hot Wheels', fixer: 'Dante Cole',
    hook: 'Dante: The crew needs a fast car moved across town, three stops, no scratches if you can help it. Clock\'s loose. Go.',
    reward: 1200, type: 'goto', timeLimit: 300,
    startPoint: { x: -400, y: 0 },
    targets: [
      { x: 1200, y: 1200, label: 'Stop 1 — South Gate' },
      { x: -1200, y: 800, label: 'Stop 2 — West End' },
      { x: 800, y: -1200, label: 'Stop 3 — North Yard' },
    ],
  },
  {
    id: 'dockside', name: 'Dockside', fixer: 'Mara Voss',
    hook: 'Mara: The docks. A crate is waiting at the marina pier. Bring it back to the garage on 5th. Watch the water.',
    reward: 1500, type: 'goto',
    startPoint: { x: 0, y: -400 },
    targets: [
      { x: MARINA.x, y: MARINA.y, label: 'Pick up the crate at the marina' },
      { x: 200, y: -800, label: 'Return to the garage' },
    ],
  },
  {
    id: 'midnight-run', name: 'Midnight Run', fixer: 'Dante Cole',
    hook: 'Dante: Night run. Two drops, no headlights off, no questions. The city sleeps — we don\'t.',
    reward: 1800, type: 'goto', night: true,
    startPoint: { x: 400, y: 400 },
    targets: [
      { x: -800, y: 1200, label: 'Drop 1 — South Docks' },
      { x: 1200, y: -800, label: 'Drop 2 — East Gate' },
    ],
  },
  {
    id: 'collector', name: 'Collector', fixer: 'Mara Voss',
    hook: 'Mara: Four stashes hidden around the bay. Collect them all and the crew eats this week. Start driving.',
    reward: 2200, type: 'collect',
    startPoint: { x: -400, y: 400 },
    targets: [
      { x: 800, y: 800, label: 'Stash 1 of 4' },
      { x: -800, y: -800, label: 'Stash 2 of 4' },
      { x: 1200, y: 0, label: 'Stash 3 of 4' },
      { x: 0, y: -1200, label: 'Stash 4 of 4' },
    ],
  },
  {
    id: 'highway-heat', name: 'Highway Heat', fixer: 'Dante Cole',
    hook: 'Dante: The whole precinct is on you, Rook. Lose them and get to the north highway gate. Drive like you mean it.',
    reward: 4600, type: 'escape',
    startPoint: { x: 0, y: 800 },
    targets: [{ x: 1200, y: 1200, label: 'Reach the north highway gate' }],
  },
  {
    id: 'crescent-job', name: 'The Crescent Job', fixer: 'Mara Voss',
    hook: 'Mara: Last one. The docks crew took our money. Take it back — clear the dock, then get out before the precinct arrives.',
    reward: 6200, type: 'shootout',
    startPoint: { x: -400, y: -400 },
    targets: [
      { x: DOCKS.x, y: DOCKS.y, label: 'Clear the dock crew' },
      { x: 1200, y: -1200, label: 'Escape to the east gate' },
    ],
  },
];

export { MISSION_ARC };

export function startMission(state, index) {
  const def = MISSION_ARC[index];
  if (!def) return false;
  state.missionIndex = index;
  state.mission = {
    def, index, stage: 0, targetIndex: 0, hits: 0,
    startedAt: state.time, checkpoint: { x: state.player.x, y: state.player.y },
    dialogue: def.hook, dialogueUntil: state.time + 5,
    objective: def.targets[0].label,
  };
  state.missionMarker = def.startPoint;
  if (def.night) state.timeOfDay = 22.2;
  if (def.type === 'chase') spawnCourier(state);
  if (def.type === 'escape') setWantedHeat(state, 62);
  if (def.type === 'shootout') {
    spawnEnemies(state, def.targets[0].x, def.targets[0].y, 4, 130);
    // Health pickups near the shootout so the finale stays survivable.
    state.pickups.push({ x: def.targets[0].x + 90, y: def.targets[0].y + 60, kind: 'health' });
    state.pickups.push({ x: def.targets[0].x - 90, y: def.targets[0].y - 60, kind: 'health' });
    state.pickups.push({ x: def.targets[0].x + 40, y: def.targets[0].y - 110, kind: 'ammo' });
  }
  state.flashMessage(def.name + ' — ' + def.targets[0].label, 4);
  return true;
}

function spawnCourier(state) {
  const p = state.player;
  const heading = state.playerCar ? state.playerCar.angle : p.angle;
  const node = nearestNode(state.world, p.x + Math.cos(heading) * 420, p.y + Math.sin(heading) * 420);
  const courier = makeCar('courier', node.x, node.y, heading, 'courier');
  courier.cruise = 448;
  courier.route = [];
  courier.routeIndex = 0;
  courier.prevNode = null;
  state.courier = courier;
  state.cars.push(courier);
}

export function updateCourier(state, dt) {
  const c = state.courier;
  if (!c) return;
  if (!c.route || c.routeIndex >= c.route.length) {
    const from = nearestNode(state.world, c.x, c.y);
    // Pick a far random destination; never reverse at a junction.
    const dest = { x: (Math.floor(state.rng() * 7) - 3) * 400, y: (Math.floor(state.rng() * 7) - 3) * 400 };
    const route = findRoute(state.world, from, dest);
    if (route.length > 1 && c.prevNode) {
      const first = route[0];
      if (first.x === c.prevNode.x && first.y === c.prevNode.y) route.shift();
    }
    c.route = route;
    c.routeIndex = 0;
  }
  const wp = c.route[c.routeIndex];
  if (!wp) return;
  const dx = wp.x - c.x; const dy = wp.y - c.y;
  if (Math.hypot(dx, dy) < 26) {
    c.prevNode = nearestNode(state.world, c.x, c.y);
    c.routeIndex++;
    return;
  }
  const want = Math.atan2(dy, dx);
  let diff = want - c.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.4));
  driveCar(state, c, dt, 1, steer, false);
  if (c.speed > c.cruise) c.speed = c.cruise;
}

export function missionObjectiveText(state) {
  if (!state.mission) return state.nextMissionAt ? 'Drive to the yellow marker for the next job' : 'Free roam — explore Crescent Bay';
  return state.mission.def.name + ' — ' + state.mission.objective;
}

export function updateMission(state, dt) {
  const m = state.mission;
  if (!m) {
    // Next job becomes available after a breather; the marker shows where.
    if (state.missionIndex < MISSION_ARC.length - 1 && state.nextMissionAt && state.time >= state.nextMissionAt) {
      const next = MISSION_ARC[state.missionIndex + 1];
      state.missionMarker = next.startPoint;
      const px = state.playerCar ? state.playerCar.x : state.player.x;
      const py = state.playerCar ? state.playerCar.y : state.player.y;
      if (Math.hypot(next.startPoint.x - px, next.startPoint.y - py) < 50) {
        startMission(state, state.missionIndex + 1);
      }
    }
    return;
  }
  const def = m.def;
  const px = state.playerCar ? state.playerCar.x : state.player.x;
  const py = state.playerCar ? state.playerCar.y : state.player.y;

  if (def.timeLimit && state.time - m.startedAt > def.timeLimit) {
    failMission(state, 'Out of time.');
    return;
  }

  if (def.type === 'chase') {
    const c = state.courier;
    if (c) {
      const d = Math.hypot(c.x - px, c.y - py);
      const spd = state.playerCar ? Math.abs(state.playerCar.speed) : 0;
      if (d < CHASE_HIT_DISTANCE && spd > CHASE_HIT_MIN_SPEED && state.time - (m.lastHitAt || 0) > 0.8) {
        m.lastHitAt = state.time;
        m.hits += 1;
        c.cruise = Math.max(140, c.cruise * 0.55);
        c.cruiseLimit = c.cruise;
        state.flashMessage('Hit ' + m.hits + ' of ' + def.hitsNeeded + ' — he\'s slowing down!', 2);
        state.addSkid(c.x, c.y, c.angle);
        if (m.hits >= def.hitsNeeded) completeMission(state);
      }
      m.objective = 'Ram the courier — ' + m.hits + ' of ' + def.hitsNeeded + ' hits';
    }
    return;
  }

  if (def.type === 'shootout') {
    if (m.stage === 0) {
      const alive = state.enemies.filter((e) => e.health > 0).length;
      m.objective = 'Clear the dock crew — ' + alive + ' left';
      if (alive === 0) {
        m.stage = 1;
        m.targetIndex = 1;
        m.objective = def.targets[1].label;
        state.flashMessage('Dock clear — get out of there!', 3);
      }
      return;
    }
    // Stage 1: escape drive.
    const t = def.targets[1];
    if (Math.hypot(t.x - px, t.y - py) < GOTO_RADIUS) completeMission(state);
    return;
  }

  // goto / collect / escape / timed: sequential drive-through targets.
  const t = def.targets[m.targetIndex];
  if (!t) { completeMission(state); return; }
  if (Math.hypot(t.x - px, t.y - py) < GOTO_RADIUS) {
    m.targetIndex += 1;
    if (m.targetIndex >= def.targets.length) {
      completeMission(state);
    } else {
      m.objective = def.targets[m.targetIndex].label;
      state.flashMessage(def.targets[m.targetIndex].label, 3);
      if (state.audio && state.audio.pickup) state.audio.pickup();
    }
  }
}

function completeMission(state) {
  const m = state.mission;
  const reward = m.def.reward;
  state.player.cash += reward;
  state.completedMissions = state.completedMissions || [];
  state.completedMissions.push(m.def.id);
  state.flashMessage(m.def.name + ' complete — $' + reward, 4);
  if (state.audio && state.audio.pickup) state.audio.pickup();
  state.courier = null;
  state.mission = null;
  state.missionIndex = m.index;
  state.nextMissionAt = state.time + 5;
  state.missionMarker = null;
  state.autosave();
}

function failMission(state, reason) {
  const m = state.mission;
  state.flashMessage(reason + ' Restarting ' + m.def.name + ' from the checkpoint.', 4);
  const cp = m.checkpoint;
  state.player.x = cp.x; state.player.y = cp.y;
  state.player.health = 100;
  if (state.playerCar) { state.playerCar = null; state.player.inCar = null; }
  state.courier = null;
  state.enemies = [];
  const index = m.index;
  state.mission = null;
  startMission(state, index);
}
