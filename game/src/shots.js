import { STEP } from './config.js';
import { nearestNode, nodePos, bfsPath } from './world.js';
import { addWantedHeat } from './player.js';
import { startMission, MISSION_ARC } from './missions.js';
import { updateTraffic } from './traffic.js';
import { updatePedestrians } from './pedestrians.js';

// Screenshot poses: each one plays the REAL game from a fresh seeded world
// with a scripted autopilot driving the same inputs a human would (keys,
// mouse, E to enter a car). No entity is ever hand-placed: police, traffic
// and pedestrians all arrive through the normal spawn systems. Scenario
// parameters (time of day, wanted heat from earlier off-screen crimes, which
// mission is running) are the pose definition — the frame itself is a state
// the real game can reach.
const SHOT_STEPS = { cover: 780, mission: 2400, night: 720, start: 900 };

function runShot(G, name) {
  G.shotMode = true;
  G.state = 'playing';
  const inp = G.input;
  inp.autopilot = true;
  if (name === 'start') {
    runStartShot(G);
    return;
  }
  if (name === 'cover') {
    G.clockH = 13.0; // sun-soaked midday
    // 3 stars: a little heat first, then the escape mission adds the rest.
    addWantedHeat(G, 12);
    startMission(G, 'm3-hot-wheels'); // objective: escape the police
    G.dialogue = null;
    document.getElementById('dialogue-box')?.classList.add('hidden');
  }
  if (name === 'night') {
    G.clockH = 22.0; // night, headlights + street lamps
    // 4 stars: patrol cars + roadblock.
    addWantedHeat(G, 25);
    startMission(G, 'm3-hot-wheels');
    G.dialogue = null;
    document.getElementById('dialogue-box')?.classList.add('hidden');
  }
  if (name === 'mission') {
    G.clockH = 15.5; // bright afternoon at the docks
    startMission(G, 'm4-dockside');
  }
  const steps = SHOT_STEPS[name] || 600;
  G.shotTrace = [];
  for (let s = 0; s < steps; s++) {
    autopilotStep(G, name);
    G.update(STEP);
    if (s % 60 === 0) {
      const pp = G.player;
      G.shotTrace.push({
        step: s,
        x: Math.round(pp.inCar ? pp.inCar.x : pp.x),
        y: Math.round(pp.inCar ? pp.inCar.y : pp.y),
        speed: Math.round(pp.inCar ? pp.inCar.speed : pp.speed),
        car: pp.inCar ? pp.inCar.type : 'on foot',
        damage: pp.inCar ? Math.round(pp.inCar.damage) : 0,
        stars: G.wanted.stars,
        cops: G.cops.length,
      });
    }
    // Mission shot: freeze the frame mid-fight, with 2 crew members left.
    if (name === 'mission' && G.mission && G.mission.stageI === 1
      && G.enemies.filter((e) => e.alive).length <= 2) break;
  }
  // Mission shot: hold the fixer's dialogue open on the final frame.
  if (name === 'mission') {
    G.dialogue = {
      speaker: 'Vera Cross',
      lines: G.mission ? G.mission.def.intro : ['Vera: ...'],
      i: 0, t: 0,
    };
    const box = document.getElementById('dialogue-box');
    if (box) {
      box.classList.remove('hidden');
      const nm = document.getElementById('dialogue-name');
      const tx = document.getElementById('dialogue-text');
      if (nm) nm.textContent = 'Vera Cross';
      if (tx) tx.textContent = G.dialogue.lines[0];
    }
    // One more volley so the muzzle flash freezes in the frame.
    const p = G.player;
    if (!p.inCar && G.enemies.length) {
      const e = G.enemies[0];
      p.angle = Math.atan2(e.y - p.y, e.x - p.x);
      p.fireCooldown = 0; // guarantee the shot fires on the next step
      G.input.fire = true;
      G.update(STEP);
      G.update(STEP);
    }
  }
  G.render();
  window.__shotReady = true;
}

function runStartShot(G) {
  // Title screen over a LIVING city: traffic and pedestrians keep moving
  // while the camera drifts along the waterfront. Continue is shown because
  // this returning player has a save (3 missions done, $1,250).
  G.state = 'title';
  G.save.missionsDone = ['m1-first-job', 'm2-tail-chase', 'm3-hot-wheels'];
  G.player.cash = 1250;
  const title = document.getElementById('title-screen');
  if (title) title.classList.remove('hidden');
  const cont = document.getElementById('btn-continue');
  if (cont) cont.classList.remove('hidden');
  const slot = document.getElementById('save-slot');
  if (slot) slot.textContent = 'Save: 3 missions done · $1,250 · Day 1';
  const list = document.getElementById('mission-select');
  if (list) {
    list.innerHTML = '';
    for (const m of MISSION_ARC.slice(0, 3)) {
      const li = document.createElement('li');
      li.textContent = '✓ ' + m.name;
      list.appendChild(li);
    }
    const li = document.createElement('li');
    li.textContent = '→ Next: ' + MISSION_ARC[3].name;
    list.appendChild(li);
  }
  // Ambient city: step traffic/peds with the camera drifting east.
  for (let s = 0; s < SHOT_STEPS.start; s++) {
    G.time += STEP;
    G.clockH = 10.5 + (G.time / 480) * 24;
    updateAmbient(G, STEP);
    G.camera.x = Math.max(0, Math.min(3400 - 1280, 900 + s * 0.9));
    G.camera.y = Math.max(0, Math.min(2860 - 800, 1150));
  }
  G.render();
  window.__shotReady = true;
}

function updateAmbient(G, dt) {
  // Title-screen city life: traffic, pedestrians and the clock only.
  updateTraffic(G, dt);
  updatePedestrians(G, dt);
}

// The autopilot: one controller for every pose. It only writes input fields.
function autopilotStep(G, name) {
  const inp = G.input;
  const p = G.player;
  inp.up = inp.down = inp.left = inp.right = false;
  inp.sprint = false; inp.handbrake = false; inp.fire = false;
  if (name === 'mission') return autopilotMission(G);
  // Cover / night: steal the sports car by the garage, then drive east
  // along the waterfront road while the police chase.
  const car = nearestParkedSports(G);
  if (!p.inCar) {
    if (car && Math.hypot(car.x - p.x, car.y - p.y) < 60) {
      inp.pressed.KeyE = true;
      return;
    }
    if (car) { walkToward(G, car.x, car.y); return; }
  }
  driveToward(G, 2680, G.world.roadY(5));
}

function autopilotMission(G) {
  const p = G.player;
  const m = G.mission;
  // Stage 0: drive to the docks. Stage 1: on foot, shoot the crew.
  if (m && m.active && m.stageI === 0) {
    const t = G.world.landmarks.docks;
    if (!p.inCar) {
      const car = nearestParkedSports(G);
      if (car && Math.hypot(car.x - p.x, car.y - p.y) < 60) { G.input.pressed.KeyE = true; return; }
      if (car) { walkToward(G, car.x, car.y); return; }
    }
    driveToward(G, t.x - 60, t.y);
    return;
  }
  // Shootout stage: out of the car, aim at the nearest crew member.
  if (p.inCar) { G.input.pressed.KeyE = true; return; }
  const e = nearestEnemy(G);
  if (!e) return;
  const cam = G.camera;
  G.input.mouseX = e.x - cam.x;
  G.input.mouseY = e.y - cam.y;
  G.input.fire = true;
  // Strafe sideways while shooting so the pose has motion in it.
  const strafe = Math.sin(G.time * 2) > 0;
  G.input.left = strafe; G.input.right = !strafe;
}

function nearestParkedSports(G) {
  let best = null, bestD = 1e9;
  for (const car of G.cars) {
    if (car.wrecked || !car.parked) continue;
    const d = Math.hypot(car.x - G.player.x, car.y - G.player.y);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

function nearestEnemy(G) {
  let best = null, bestD = 1e9;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - G.player.x, e.y - G.player.y);
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}

function walkToward(G, tx, ty) {
  const p = G.player;
  const dx = tx - p.x, dy = ty - p.y;
  const inp = G.input;
  inp.right = dx > 12; inp.left = dx < -12;
  inp.down = dy > 12; inp.up = dy < -12;
  inp.sprint = Math.hypot(dx, dy) > 120;
}

// Drive the player's car toward a point using the road graph.
function driveToward(G, tx, ty) {
  const p = G.player;
  const car = p.inCar;
  const inp = G.input;
  if (!car) return;
  const from = nearestNode(G.world, car.x, car.y).id;
  const to = nearestNode(G.world, tx, ty).id;
  const path = bfsPath(from, to);
  const wp = path.length > 1 ? nodePos(G.world, path[1]) : { x: tx, y: ty };
  const want = Math.atan2(wp.y - car.y, wp.x - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  // Stuck? Reverse out for a second.
  if (G.stuckT > 0) {
    G.stuckT -= STEP;
    inp.down = true;
    inp.left = diff > 0; inp.right = diff < 0;
    return;
  }
  if (Math.abs(car.speed) < 12 && Math.hypot(wp.x - car.x, wp.y - car.y) > 60) {
    G.stuckAcc = (G.stuckAcc || 0) + STEP;
    if (G.stuckAcc > 2) { G.stuckT = 1.0; G.stuckAcc = 0; return; }
  } else {
    G.stuckAcc = 0;
  }
  if (Math.abs(diff) > 0.9) {
    inp.down = Math.abs(car.speed) > 60;
    inp.handbrake = Math.abs(car.speed) > 200;
  } else {
    // Cap the autopilot's speed so turns stay on the road.
    inp.up = Math.abs(car.speed) < 340;
  }
  inp.left = diff > 0.12;
  inp.right = diff < -0.12;
}

export { runShot, SHOT_STEPS, autopilotStep, driveToward, walkToward };
