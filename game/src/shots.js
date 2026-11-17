import { STEP } from './config.js';
import { nearestNode, nodePos, bfsPath, nearestRoadPoint } from './world.js';
import { addWantedHeat } from './player.js';
import { startMission, MISSION_ARC, resolveTarget } from './missions.js';
import { updateTraffic } from './traffic.js';
import { updatePedestrians } from './pedestrians.js';

// Screenshot poses: each one plays the REAL game from a fresh seeded world
// with a scripted autopilot driving the same inputs a human would (keys,
// mouse, E to enter a car). No entity is ever hand-placed: police, traffic
// and pedestrians all arrive through the normal spawn systems. Scenario
// parameters (time of day, wanted heat from earlier off-screen crimes, which
// mission is running) are the pose definition — the frame itself is a state
// the real game can reach.
const SHOT_STEPS = { cover: 460, mission: 2400, night: 460, start: 900 };

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
  // Cover / night: steal the sports car by the garage, then drive east to
  // the waterfront road and south along the beach while the police chase.
  const car = nearestParkedSports(G);
  if (!p.inCar) {
    if (car && Math.hypot(car.x - p.x, car.y - p.y) < 60) {
      inp.pressed.KeyE = true;
      return;
    }
    if (car) { walkToward(G, car.x, car.y); return; }
  }
  driveToward(G, 2700, G.world.roadY(10), 320, true);
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
    driveToward(G, t.x - 60, t.y, 320, true);
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

// Is a point on a road (within 45 px of a road centre line)? Used to prefer
// parked cars the autopilot can actually drive away from.
function isOnRoad(x, y) {
  const rx = (x - 100) % 260, ry = (y - 100) % 260;
  const dx = Math.min(rx, 260 - rx), dy = Math.min(ry, 260 - ry);
  return dx < 45 || dy < 45;
}

function nearestParkedSports(G) {
  // Prefer a sports car parked ON a road (not one deep inside a parking-lot
  // block the autopilot cannot drive out of); fall back to the nearest
  // parked car of any type.
  let best = null, bestD = 1e9, bestAny = null, bestAnyD = 1e9;
  for (const car of G.cars) {
    if (car.wrecked || !car.parked) continue;
    const d = Math.hypot(car.x - G.player.x, car.y - G.player.y);
    if (isOnRoad(car.x, car.y) && d < bestAnyD) { bestAny = car; bestAnyD = d; }
    if (car.type === 'sports' && isOnRoad(car.x, car.y) && d < bestD) { best = car; bestD = d; }
  }
  if (best || bestAny) return best || bestAny;
  for (const car of G.cars) {
    if (car.wrecked || !car.parked) continue;
    const d = Math.hypot(car.x - G.player.x, car.y - G.player.y);
    if (d < bestAnyD) { bestAny = car; bestAnyD = d; }
  }
  return bestAny;
}

// For a chase: the nearest sports car on a road; failing that, the parked
// car with the highest top speed (nearest on a tie) — the courier runs at
// 448, so only a sports car (560) or a patrol car (520) can catch it.
function nearestFastParked(G) {
  const px = G.player.x, py = G.player.y;
  let best = null, bestD = 1e9;
  for (const car of G.cars) {
    if (car.wrecked || !car.parked || car.type !== 'sports') continue;
    if (!isOnRoad(car.x, car.y)) continue;
    const d = Math.hypot(car.x - px, car.y - py);
    if (d < bestD) { best = car; bestD = d; }
  }
  if (best) return best;
  let bestTop = -1; bestD = 1e9; best = null;
  for (const car of G.cars) {
    if (car.wrecked || !car.parked || !isOnRoad(car.x, car.y)) continue;
    const d = Math.hypot(car.x - px, car.y - py);
    if (car.topSpeed > bestTop || (car.topSpeed === bestTop && d < bestD)) { best = car; bestTop = car.topSpeed; bestD = d; }
  }
  if (best) return best;
  bestTop = -1; bestD = 1e9; best = null;
  for (const car of G.cars) {
    if (car.wrecked || !car.parked) continue;
    const d = Math.hypot(car.x - px, car.y - py);
    if (car.topSpeed > bestTop || (car.topSpeed === bestTop && d < bestD)) { best = car; bestTop = car.topSpeed; bestD = d; }
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

// Walk on foot toward a point. The route follows the road graph to the
// target's nearest road point, and only the final leg walks straight at the
// target — so the player approaches a parking-lot car from the road, not
// straight through the block it sits in (which used to oscillate against a
// building forever when player and car shared a node).
function walkToward(G, tx, ty) {
  const p = G.player;
  const rp = nearestRoadPoint(G.world, tx, ty).point;
  // Final leg: at the road point, the target is a short straight walk
  // through the open parking lot.
  if (Math.hypot(rp.x - p.x, rp.y - p.y) < 40) { walkDirect(G, tx, ty); return; }
  const to = nearestNode(G.world, rp.x, rp.y).id;
  if (!G.walkPath || G.walkTarget !== to || G.walkDestX !== tx || G.walkDestY !== ty) {
    const from = nearestNode(G.world, p.x, p.y).id;
    G.walkPath = bfsPath(from, to);
    G.walkI = 1;
    G.walkTarget = to;
    G.walkDestX = tx; G.walkDestY = ty;
  }
  // Waypoints: the BFS nodes, then the road point itself as the last hop.
  const n = G.walkPath.length;
  let wp = G.walkI < n - 1 ? nodePos(G.world, G.walkPath[G.walkI]) : rp;
  if (Math.hypot(wp.x - p.x, wp.y - p.y) < 40 && G.walkI < n - 1) {
    G.walkI++;
    wp = nodePos(G.world, G.walkPath[Math.min(G.walkI, n - 1)]);
  }
  walkDirect(G, wp.x, wp.y);
}

// Walk straight at a point, sidestepping for a second when a building blocks
// the way. Used for the final leg, where the target may sit slightly off a
// road (a parked car in a lot, an enemy on a sidewalk).
function walkDirect(G, tx, ty) {  const p = G.player;
  const dx = tx - p.x, dy = ty - p.y;
  const inp = G.input;
  // If blocked by a building, sidestep perpendicular for a second instead
  // of walking into the wall forever.
  const moved = Math.hypot(p.x - (G.walkLastX ?? p.x), p.y - (G.walkLastY ?? p.y));
  if (G.walkSideT > 0) {
    G.walkSideT -= STEP;
    inp.right = G.walkSide > 0; inp.left = G.walkSide < 0;
    inp.down = true;
  } else {
    inp.right = dx > 12; inp.left = dx < -12;
    inp.down = dy > 12; inp.up = dy < -12;
    inp.sprint = Math.hypot(dx, dy) > 120;
    G.walkStuckAcc = (moved < 1.5 ? (G.walkStuckAcc || 0) + STEP : 0);
    if (G.walkStuckAcc > 0.8) {
      G.walkStuckAcc = 0;
      G.walkSideT = 1.0;
      G.walkSide = Math.abs(dx) > Math.abs(dy) ? (dy > 0 ? 1 : -1) : (dx > 0 ? 1 : -1);
    }
  }
  G.walkLastX = p.x; G.walkLastY = p.y;
}

// Drive the player's car toward a point using the road graph. The path is
// kept across steps (recomputed only for a new target) so the waypoint never
// flips behind the car mid-turn; the car slows for turns and caps its speed.
// `cruise` is the autopilot's top cruising speed (default 320, a safe speed
// for the road graph; a chase passes 520 to outrun the courier's 448).
// `exact` means the target is a fixed point (a landmark): on the final node
// the car heads for the point itself, not the node. It must stay false for
// a moving target (the courier) — steering at a moving point on the last
// node makes the car spin instead of following the road graph.
function driveToward(G, tx, ty, cruise = 320, exact = false) {
  const p = G.player;
  const car = p.inCar;
  const inp = G.input;
  if (!car) return;
  const to = nearestNode(G.world, tx, ty).id;
  if (!G.autoPath || G.autoTarget !== to) {
    const from = nearestNode(G.world, car.x, car.y).id;
    G.autoPath = bfsPath(from, to);
    G.autoI = 1;
    G.autoTarget = to;
  }
  let wp = G.autoPath.length > 1
    ? nodePos(G.world, G.autoPath[Math.min(G.autoI, G.autoPath.length - 1)])
    : { x: tx, y: ty };
  if (Math.hypot(wp.x - car.x, wp.y - car.y) < 70 && G.autoI < G.autoPath.length - 1) {
    G.autoI++;
    wp = nodePos(G.world, G.autoPath[Math.min(G.autoI, G.autoPath.length - 1)]);
  }
  // On the final node, head for the actual target, not the node itself —
  // but only for a fixed point. A landmark can sit ~100 px past the last
  // intersection (the marina is on the sand east of it), and targeting the
  // node strands the car there oscillating around it forever.
  if (exact && G.autoI >= G.autoPath.length - 1
    && Math.hypot(wp.x - car.x, wp.y - car.y) < 70) {
    wp = { x: tx, y: ty };
  }
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
  steerCarToward(G, wp.x, wp.y, cruise);
}

export { runShot, SHOT_STEPS, autopilotStep, driveToward, walkToward, missionAutopilot };

// Generic mission driver for playtests (not a pose): completes whatever
// mission is active by following its stages — drive to the target, ram the
// courier, shoot the crew, or lose the cops via the Spray Shop. Used by the
// automated playtest to prove every shipped mission finishes end-to-end.
function missionAutopilot(G) {
  const inp = G.input;
  const p = G.player;
  inp.up = inp.down = inp.left = inp.right = false;
  inp.sprint = false; inp.handbrake = false; inp.fire = false;
  const m = G.mission;
  if (!m || !m.active) {
    // No mission: drive to Vera's garage to pick up the next job.
    const g = G.world.landmarks.fixerGarage;
    if (!p.inCar) {
      const car = nearestParkedSports(G);
      if (car && Math.hypot(car.x - p.x, car.y - p.y) < 60) { inp.pressed.KeyE = true; return; }
      if (car) { walkToward(G, car.x, car.y); return; }
    }
    driveToward(G, g.x, g.y, 320, true);
    return;
  }
  const stage = m.def.stages[m.stageI];
  if (!stage) return;
  if (stage.kind === 'shootout') {
    if (p.inCar) { inp.pressed.KeyE = true; return; }
    const e = nearestEnemy(G);
    if (!e) return;
    const cam = G.camera;
    inp.mouseX = e.x - cam.x;
    inp.mouseY = e.y - cam.y;
    inp.fire = true;
    const strafe = Math.sin(G.time * 2) > 0;
    inp.left = strafe; inp.right = !strafe;
    return;
  }
  if (stage.kind === 'escape') {
    // Lose the heat at the Spray Shop (a repaint clears the wanted level).
    const s = G.world.landmarks.sprayShop;
    if (!p.inCar) {
      const car = nearestParkedSports(G);
      if (car && Math.hypot(car.x - p.x, car.y - p.y) < 60) { inp.pressed.KeyE = true; return; }
      if (car) { walkToward(G, car.x, car.y); return; }
      return;
    }
    if (p.cash < 50) {
      // Broke: hide instead — drive to the far corner and lay low.
      driveToward(G, 620, 620, 320, true);
      return;
    }
    driveToward(G, s.x, s.y, 320, true);
    return;
  }
  if (stage.kind === 'chase') {
    const car = m.targetCar;
    if (!car) return;
    // A chase needs a fast car: a truck (330) or sedan (430) can never
    // catch a courier running at 448. Ditch a slow car when a faster one
    // is parked somewhere — but keep it if it is the best available, or
    // the driver would exit and re-enter the same car forever.
    if (p.inCar && p.inCar.topSpeed < 480) {
      const faster = nearestFastParked(G);
      if (faster && faster.topSpeed > p.inCar.topSpeed + 40) { inp.pressed.KeyE = true; return; }
    }
    if (!p.inCar) {
      const pc = nearestFastParked(G);
      if (pc && Math.hypot(pc.x - p.x, pc.y - p.y) < 60) { inp.pressed.KeyE = true; return; }
      if (pc) { walkToward(G, pc.x, pc.y); return; }
      return;
    }
    // Close in: steer straight at the courier only when it is roughly
    // ahead (a ram run); otherwise stay on the road graph, or the car cuts
    // a corner through a building, loses all speed, and spins in place.
    // Cruise at 520: the courier runs at 448, so the default 320 cruise
    // could never catch it.
    const d = Math.hypot(car.x - p.inCar.x, car.y - p.inCar.y);
    if (d < 150) {
      const want = Math.atan2(car.y - p.inCar.y, car.x - p.inCar.x);
      let diff = want - p.inCar.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < 0.6) steerCarToward(G, car.x, car.y, 520);
      else driveToward(G, car.x, car.y, 520);
    } else {
      driveToward(G, car.x, car.y, 520);
    }
    return;
  }
  // driveTo / pickup / timed: drive to the stage target on the road graph.
  const t = resolveTarget(G, stage.at);
  if (!p.inCar) {
    const car = nearestParkedSports(G);
    if (car && Math.hypot(car.x - p.x, car.y - p.y) < 60) { inp.pressed.KeyE = true; return; }
    if (car) { walkToward(G, car.x, car.y); return; }
  }
  driveToward(G, t.x, t.y, 320, true);
}

// Steer the player's car toward a point: throttle, brake for sharp turns,
// handbrake when very sideways. Shared by driveToward and the chase driver.
// `cruise` caps the speed the autopilot holds on a straight (default 320).
function steerCarToward(G, wx, wy, cruise = 320) {
  const car = G.player.inCar;
  const inp = G.input;
  if (!car) return;
  const want = Math.atan2(wy - car.y, wx - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) > 0.9) {
    inp.down = Math.abs(car.speed) > 60;
    inp.handbrake = Math.abs(car.speed) > 200;
  } else {
    inp.up = Math.abs(car.speed) < cruise;
  }
  inp.left = diff > 0.12;
  inp.right = diff < -0.12;
}
