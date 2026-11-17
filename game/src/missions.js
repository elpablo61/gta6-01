import { createVehicle } from './vehicles.js';
import { addWantedHeat, addCash, toast } from './player.js';
import { spawnRivalCrew } from './combat.js';
import { nearestNode, nodePos, nodeNeighbours } from './world.js';
import { autosave } from './save.js';

// The 8-mission arc: Rook, a driver new to Crescent Bay, runs jobs for fixer
// Vera Cross while rival Dario Kane tries to take the city. Each mission is
// Hook -> Objective -> Obstacle -> Resolution -> Reward; objectives are
// conditions, not kill counts, and a failed mission restarts from its
// checkpoint, never from the beginning.
const MISSION_ARC = [
  {
    id: 'm1-first-job', name: 'First Job', reward: 400,
    intro: ["Vera: Rook. You drive, I pay. Pick up my package at the Crescent Docks.",
            "Vera: Bring it to my garage in one piece. Don't make me regret hiring you."],
    outro: ["Vera: Clean run. You're hired, Rook. There's more work where that came from."],
    stages: [
      { kind: 'driveTo', at: 'docks', label: 'Pick up the package at the Crescent Docks' },
      { kind: 'driveTo', at: 'fixerGarage', label: 'Deliver the package to Vera\'s Garage' },
    ],
  },
  {
    id: 'm2-tail-chase', name: 'Tail Chase', reward: 500,
    intro: ["Vera: One of Kane's couriers is running my route. Ram his car off the road.",
            "Vera: Three good hits will do it. Don't let him reach the marina."],
    outro: ["Vera: Kane's boy is walking home. The route is ours again."],
    stages: [
      { kind: 'chase', at: 'marina', label: 'Ram the courier car (0/3 hits)' },
    ],
  },
  {
    id: 'm3-hot-wheels', name: 'Hot Wheels', reward: 550,
    intro: ["Vera: The precinct is watching my garage. Take a car and draw them off.",
            "Vera: Then lose them. Break line of sight, swap cars, or get a new paint job."],
    outro: ["Vera: Clean. The cops are chasing ghosts and we're back in business."],
    stages: [
      { kind: 'escape', label: 'Lose the police — get your wanted level to zero' },
    ],
  },
  {
    id: 'm4-dockside', name: 'Dockside Standoff', reward: 650,
    intro: ["Vera: Kane's crew is holding my shipment at the docks. Go take it back.",
            "Vera: They're armed. So are you. Make it quick, Rook."],
    outro: ["Vera: Shipment's safe. Kane just learned my name is not a suggestion."],
    stages: [
      { kind: 'driveTo', at: 'docks', label: 'Reach the Crescent Docks' },
      { kind: 'shootout', at: 'docks', count: 4, label: 'Clear out Kane\'s crew at the docks' },
    ],
  },
  {
    id: 'm5-midnight-run', name: 'Midnight Run', reward: 700,
    intro: ["Vera: A buyer at Crescent Plaza wants the goods in two and a half minutes.",
            "Vera: The clock is already running. Drive like you mean it."],
    outro: ["Vera: Right on time. That buyer will remember this. So will I."],
    stages: [
      { kind: 'timed', at: 'plaza', seconds: 150, label: 'Deliver to Crescent Plaza before time runs out' },
    ],
  },
  {
    id: 'm6-collector', name: 'The Collector', reward: 800,
    intro: ["Vera: A collector at Marina Point is holding something of mine.",
            "Vera: Pick it up. His friends will object — handle them."],
    outro: ["Vera: The collector sends his regards. And his money, which is better."],
    stages: [
      { kind: 'driveTo', at: 'marina', label: 'Reach Marina Point' },
      { kind: 'shootout', at: 'marina', count: 2, label: 'Deal with the collector\'s guards' },
      { kind: 'driveTo', at: 'fixerGarage', label: 'Bring the goods back to Vera\'s Garage' },
    ],
  },
  {
    id: 'm7-highway-heat', name: 'Highway Heat', reward: 900,
    intro: ["Vera: Kane's fastest courier is moving product across town. Stop him, then vanish.",
            "Vera: The cops will be all over this one. Lose them after."],
    outro: ["Vera: Two jobs in one and you made it look easy. Kane is furious. Good."],
    stages: [
      { kind: 'chase', at: 'bank', label: 'Ram the courier car (0/3 hits)' },
      { kind: 'escape', label: 'Lose the police — get your wanted level to zero' },
    ],
  },
  {
    id: 'm8-crescent-job', name: 'The Crescent Job', reward: 1500,
    intro: ["Vera: This is it, Rook. Bay Trust Bank. Kane's money, our retirement.",
            "Vera: Get in, grab the cash, get out — and don't get caught."],
    outro: ["Vera: We did it. Crescent Bay is ours now, Rook. All of it."],
    stages: [
      { kind: 'driveTo', at: 'bank', label: 'Reach Bay Trust Bank' },
      { kind: 'shootout', at: 'bank', count: 6, label: 'Hold the bank against Kane\'s crew' },
      { kind: 'driveTo', at: 'marina', label: 'Escape to Marina Point with the cash' },
      { kind: 'escape', label: 'Lose the police — get your wanted level to zero' },
    ],
  },
];

function missionById(id) {
  return MISSION_ARC.find((m) => m.id === id);
}

function nextMissionId(G) {
  const done = G.save?.missionsDone || [];
  return MISSION_ARC.find((m) => !done.includes(m.id))?.id || null;
}

function resolveTarget(G, at) {
  if (typeof at === 'string') {
    const lm = G.world.landmarks[at];
    return { x: lm.x, y: lm.y, name: lm.name };
  }
  return at;
}

function startMission(G, id) {
  const def = missionById(id);
  if (!def) return;
  G.mission = {
    def, stageI: 0, active: true, timer: 0,
    targetCar: null, targetHits: 0, hitCooldown: 0,
    stageSpawned: false, enemiesLeft: 0, package: false,
  };
  showDialogue(G, 'Vera Cross', def.intro);
  toast(G, `Mission: ${def.name} — $${def.reward}`);
  enterStage(G);
}

function enterStage(G) {
  const m = G.mission;
  if (!m || !m.active) return;
  const stage = m.def.stages[m.stageI];
  if (!stage) { completeMission(G); return; }
  m.stageSpawned = false;
  m.timer = stage.seconds || 0;
  if (stage.kind === 'escape') {
    addWantedHeat(G, 38, 'mission heat');
    toast(G, 'The police are on you — lose them!');
  }
  if (stage.kind === 'chase') {
    const t = resolveTarget(G, stage.at);
    const car = createVehicle('sports', t.x, t.y, G.rng.range(0, Math.PI * 2));
    car.traffic = false; car.chaseTarget = true;
    car.targetSpeed = car.topSpeed * 0.8;
    car.node = nearestNode(G.world, t.x, t.y).id;
    car.nextNode = null;
    G.cars.push(car);
    m.targetCar = car;
    m.targetHits = 0;
    toast(G, 'There he is — ram the courier!');
  }
  if (stage.kind === 'shootout') {
    const t = resolveTarget(G, stage.at);
    spawnRivalCrew(G, t.x, t.y, stage.count);
    m.stageSpawned = true;
    m.enemiesLeft = stage.count;
  }
}

function updateMission(G, dt) {
  const m = G.mission;
  const p = G.player;
  // No active mission: show the marker for the next job at Vera's garage.
  if (!m || !m.active) {
    const next = nextMissionId(G);
    if (next) {
      const g = G.world.landmarks.fixerGarage;
      G.missionMarker = { x: g.x, y: g.y, label: 'Next job: ' + missionById(next).name };
      const px = p.inCar ? p.inCar.x : p.x;
      const py = p.inCar ? p.inCar.y : p.y;
      // Walk/drive up to the fixer to start the next job (50 px so the
      // player spawning by the garage does not trigger it instantly).
      if (Math.hypot(px - g.x, py - g.y) < 50) startMission(G, next);
    } else {
      G.missionMarker = null;
    }
    return;
  }
  const stage = m.def.stages[m.stageI];
  if (!stage) { completeMission(G); return; }
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  let done = false;
  if (stage.kind === 'driveTo' || stage.kind === 'pickup' || stage.kind === 'timed') {
    const t = resolveTarget(G, stage.at);
    G.missionMarker = { x: t.x, y: t.y, label: stage.label };
    if (Math.hypot(px - t.x, py - t.y) < 70) {
      done = true;
      if (stage.kind === 'pickup' || m.stageI === 0 && m.def.id === 'm1-first-job') {
        m.package = true;
        toast(G, 'Package secured.');
      }
    }
    if (stage.kind === 'timed') {
      m.timer -= dt;
      if (m.timer <= 0 && !done) { failMission(G, 'Too slow — Vera gives you another shot.'); return; }
    }
  } else if (stage.kind === 'escape') {
    G.missionMarker = null;
    if (G.wanted.stars === 0) done = true;
  } else if (stage.kind === 'shootout') {
    const t = resolveTarget(G, stage.at);
    G.missionMarker = { x: t.x, y: t.y, label: stage.label };
    m.enemiesLeft = G.enemies.filter((e) => e.alive).length;
    if (m.stageSpawned && m.enemiesLeft === 0) done = true;
  } else if (stage.kind === 'chase') {
    const car = m.targetCar;
    if (!car || car.wrecked) {
      if (m.targetHits >= 3) done = true;
      else { failMission(G, 'The courier got away — Vera gives you another shot.'); return; }
    } else {
      G.missionMarker = { x: car.x, y: car.y, label: stage.label.replace('(0/3 hits)', `(${m.targetHits}/3 hits)`) };
      updateChaseTarget(G, car, dt);
      m.hitCooldown -= dt;
      if (p.inCar && m.hitCooldown <= 0 && Math.hypot(p.inCar.x - car.x, p.inCar.y - car.y) < 70) {
        // A ram is contact at speed. The old check (within 48 px AND a
        // 60 px/s speed difference) almost never fired: the bump code keeps
        // cars ~46 px apart, and a player tailing the courier at matched
        // speed still drives INTO it — that is a ram.
        if (Math.abs(p.inCar.speed) > 120) {
          m.targetHits++;
          m.hitCooldown = 1.0;
          car.speed *= 0.4;
          // Each hit cripples the courier for good: its cruising speed
          // drops, so the next hit is easier than the last. (Speed alone
          // recovers in about a second, which made 3 hits nearly impossible.)
          car.targetSpeed *= 0.55;
          car.damage = Math.min(100, car.damage + 30);
          toast(G, `Hit ${m.targetHits}/3!`);
          if (m.targetHits >= 3) { car.wrecked = true; done = true; }
        }
      }
    }
  }
  if (done) {
    m.stageI++;
    if (m.stageI >= m.def.stages.length) completeMission(G);
    else enterStage(G);
  }
}

function updateChaseTarget(G, car, dt) {
  const p = G.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  // Flee on the road graph: at each intersection pick the neighbour that
  // puts the most distance between the courier and the player.
  const target = car.nextNode != null ? nodePos(G.world, car.nextNode) : null;
  if (!target || Math.hypot(target.x - car.x, target.y - car.y) < 30) {
    const prev = car.node;
    car.node = car.nextNode != null ? car.nextNode : nearestNode(G.world, car.x, car.y).id;
    let best = null, bestD = -1;
    for (const nb of nodeNeighbours(car.node)) {
      // Do not reverse at an intersection: the courier keeps its flee run
      // going straight, instead of zigzagging in one small loop the player
      // can never close on. (A dead end still allows the reverse.)
      if (nb === prev) continue;
      const np = nodePos(G.world, nb);
      const d = Math.hypot(np.x - px, np.y - py);
      if (d > bestD) { bestD = d; best = nb; }
    }
    if (best == null) best = prev;
    car.nextNode = best;
    return;
  }
  const want = Math.atan2(target.y - car.y, target.x - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-2.6 * dt, Math.min(2.6 * dt, diff * 3 * dt));
  car.speed += (car.targetSpeed - car.speed) * Math.min(1, dt);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const c = { x: nx, y: ny };
  car.x = c.x; car.y = c.y;
}

function failMission(G, why) {
  toast(G, why);
  const id = G.mission.def.id;
  G.mission = null;
  // Restart from the checkpoint: the mission itself, not the whole arc.
  startMission(G, id);
}

function completeMission(G) {
  const m = G.mission;
  if (!m) return;
  const def = m.def;
  addCash(G, def.reward);
  G.save.missionsDone.push(def.id);
  G.mission = null;
  G.missionMarker = null;
  showDialogue(G, 'Vera Cross', def.outro);
  toast(G, `Mission complete: ${def.name} — +$${def.reward}`);
  autosave(G);
}

function onPlayerRespawn(G) {
  // A shootout the player died in re-spawns its crew; progress is kept.
  const m = G.mission;
  if (!m || !m.active) return;
  const stage = m.def.stages[m.stageI];
  if (stage && stage.kind === 'shootout' && G.enemies.length === 0) {
    const t = resolveTarget(G, stage.at);
    spawnRivalCrew(G, t.x, t.y, Math.max(1, stage.count - 1));
    m.enemiesLeft = G.enemies.length;
  }
}

// Dialogue box (DOM): a queue of lines, advanced by click / E / timeout.
function showDialogue(G, speaker, lines) {
  G.dialogue = { speaker, lines: [...lines], i: 0, t: 0 };
  renderDialogue(G);
}

function renderDialogue(G) {
  const box = document.getElementById('dialogue-box');
  if (!box) return;
  const d = G.dialogue;
  if (!d || d.i >= d.lines.length) { box.classList.add('hidden'); G.dialogue = null; return; }
  box.classList.remove('hidden');
  const name = document.getElementById('dialogue-name');
  const text = document.getElementById('dialogue-text');
  if (name) name.textContent = d.speaker;
  if (text) text.textContent = d.lines[d.i];
  d.t = 0;
}

function advanceDialogue(G) {
  const d = G.dialogue;
  if (!d) return;
  d.i++;
  renderDialogue(G);
}

function updateDialogue(G, dt) {
  const d = G.dialogue;
  if (!d) return;
  d.t += dt;
  if (d.t > 6) { d.i++; renderDialogue(G); }
}

export {
  MISSION_ARC, missionById, nextMissionId, startMission, updateMission,
  completeMission, failMission, onPlayerRespawn, showDialogue, advanceDialogue,
  updateDialogue, resolveTarget,
};
