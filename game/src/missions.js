// Crescent Bay — the 12-mission story arc. Linear, same order. Objectives
// are conditions ("reach the marker", "escape the police"), never kill
// counts. A failed mission restarts from its stage 0. Each mission has a
// fixer, a spoken hook, a cash reward and a generous time limit.
import { S } from './state.js';
import { dist } from './random.js';
import { makeCar, driveToward } from './vehicles.js';
import { setHeat } from './police.js';
import { spawnEnemy, spawnAmmoPickup, spawnHealthPickup, spawnMoneyDrop } from './combat.js';
import { spawnArenaCrate } from './weapons.js';
import { sfx } from './audio.js';
import { autosave } from './save.js';

export const MISSIONS = [
  { id: 'm1', name: 'First Job', fixer: 'Mara', reward: 400, limit: 300,
    hook: 'Rook, easy money. Grab the package at the market, drop it downtown. No trouble, yeah?',
    stages: [
      { type: 'goto', label: 'Pick up the package at the market', x: 1800, y: 1400 },
      { type: 'goto', label: 'Deliver the package downtown', x: 2200, y: 1800 },
    ] },
  { id: 'm2', name: 'Tail Chase', fixer: 'Mara', reward: 700, limit: 300,
    hook: 'A courier is running my route. Ram his car four times and he will hand it over.',
    stages: [
      { type: 'chase', label: 'Ram the courier car 4 times', hits: 0, need: 4 },
    ] },
  { id: 'm3', name: 'Hot Wheels', fixer: 'Dex', reward: 900, limit: 240,
    hook: 'Three checkpoints, one clock. Club, marina, airport. Show me that car can fly.',
    stages: [
      { type: 'checkpoints', label: 'Hit the checkpoints: club, marina, airport',
        points: [{ x: 1000, y: 2200 }, { x: 2800, y: 1400 }, { x: 2600, y: 600 }], idx: 0 },
    ] },
  { id: 'm4', name: 'Dockside', fixer: 'Mara', reward: 1100, limit: 360,
    hook: 'Crate at the marina, bring it to the hideout. The docks are hot tonight, so keep moving.',
    stages: [
      { type: 'goto', label: 'Pick up the crate at the marina', x: 2800, y: 1800 },
      { type: 'goto', label: 'Deliver the crate to the hideout', x: 600, y: 600 },
    ] },
  { id: 'm5', name: 'Midnight Run', fixer: 'Dex', reward: 1400, limit: 300, night: true,
    hook: 'Night run. Club pickup, docks drop. Headlights on, mouth shut.',
    stages: [
      { type: 'goto', label: 'Pick up at the club', x: 1000, y: 2200 },
      { type: 'goto', label: 'Drop at the docks', x: 2600, y: 2600 },
    ] },
  { id: 'm6', name: 'Collector', fixer: 'Mara', reward: 1800, limit: 420,
    hook: 'Five drops stashed around the city. Collect them all, then come home.',
    stages: [
      { type: 'collect', label: 'Collect 5 money drops', total: 5, got: 0 },
      { type: 'goto', label: 'Return to the hideout', x: 600, y: 600 },
    ] },
  { id: 'm7', name: 'Highway Heat', fixer: 'Dex', reward: 4600, limit: 420,
    hook: 'Airport run, then the whole city is on you. Lose them. Spray Shop is your friend.',
    stages: [
      { type: 'goto', label: 'Drive to the airport', x: 2600, y: 600 },
      { type: 'escape', label: 'Escape the police' },
    ] },
  { id: 'm8', name: 'Crescent Job', fixer: 'Mara', reward: 6200, limit: 600,
    hook: 'The big one. Three guards at the yard. Deal with them, then vanish.',
    stages: [
      { type: 'shootout', label: 'Clear the yard', arena: { x: 2200, y: 1400 }, enemies: 3 },
      { type: 'escape', label: 'Escape the police' },
    ] },
  { id: 'm9', name: 'Sky Watch', fixer: 'Dex', reward: 2000, limit: 420,
    hook: 'The helicopter is up and it is watching you. Do not stop under that light. Get to the hideout.',
    stages: [
      { type: 'goto', label: 'Reach the hideout under the helicopter', x: 600, y: 600 },
    ] },
  { id: 'm10', name: 'Full Auto', fixer: 'Mara', reward: 2500, limit: 420,
    hook: 'Dockside shootout, five of them. There are weapon crates in the yard — take the good stuff.',
    stages: [
      { type: 'shootout', label: 'Clear the docks', arena: { x: 2600, y: 2600 }, enemies: 5, crates: true },
      { type: 'goto', label: 'Reach the exit marker', x: 2200, y: 2600 },
    ] },
  { id: 'm11', name: 'Tune-Up', fixer: 'Dex', reward: 3000, limit: 420,
    hook: 'Get the car tuned at the Fixer Garage first — buy at least one upgrade — then run three checkpoints.',
    stages: [
      { type: 'garage', label: 'Buy an upgrade at the Fixer Garage' },
      { type: 'checkpoints', label: 'Run 3 checkpoints in the upgraded car',
        points: [{ x: 600, y: 2200 }, { x: 2200, y: 600 }, { x: 2800, y: 1800 }], idx: 0 },
    ] },
  { id: 'm12', name: 'Bay Finale', fixer: 'Mara', reward: 8000, limit: 600,
    hook: 'The bank. Four guards, a helicopter, the whole city. Grab the loot and make the plane.',
    stages: [
      { type: 'shootout', label: 'Clear the bank', arena: { x: 1800, y: 1800 }, enemies: 4, crates: true, heli: true },
      { type: 'goto', label: 'Grab the loot at the bank', x: 1800, y: 1800 },
      { type: 'escape', label: 'Escape to the airport', x: 2600, y: 600 },
      { type: 'goto', label: 'Reach the plane', x: 2800, y: 600 },
    ] },
];

export function currentMissionDef() { return MISSIONS[S.missionIndex] || null; }

export function offerMission() {
  const def = currentMissionDef();
  if (!def) return;
  S.dialog = { fixer: def.fixer, text: def.hook, mission: def.id, kind: 'mission' };
}

export function acceptDialog() {
  const d = S.dialog;
  if (!d) return false;
  S.dialog = null;
  if (d.kind === 'mission') startMission(d.mission);
  return true;
}

function cloneStages(def) {
  return def.stages.map((s) => ({ ...s, points: s.points ? s.points.map((p) => ({ ...p })) : undefined }));
}

export function startMission(id) {
  const def = MISSIONS.find((m) => m.id === id);
  if (!def) return;
  S.mission = {
    id: def.id, name: def.name, fixer: def.fixer, reward: def.reward,
    timeLeft: def.limit, stageIndex: 0, stages: cloneStages(def),
    hitCooldown: 0, courierPoint: null,
  };
  S.missionTimeLeft = def.limit;
  S.flags = { ...S.flags, garageBought: false };
  if (def.night) S.dayTime = 23;
  if (def.id === 'm2') spawnCourier();
  if (def.id === 'm6') {
    const drops = [[600, 1800], [1800, 600], [2600, 1000], [1000, 2600], [2200, 2200]];
    for (const [x, y] of drops) spawnMoneyDrop(x, y);
  }
  // Wanted cover is set AFTER the mission starts (the mission start
  // itself adds heat; setting it before would be overwritten).
  if (def.id === 'm7') setHeat(58);
  if (def.id === 'm9') setHeat(58);
  if (def.id === 'm12') setHeat(74);
  sfx('mission');
}

function spawnCourier() {
  const car = makeCar(1800, 1000, 'sports', { angle: 0 });
  car.cruise = 380;
  car.route = null;
  car.routeDest = null;
  car.courier = true;
  S.cars.push(car);
  S.courier = car;
  S.mission.courierPoint = { x: 2600, y: 1000 };
}

export function updateCourier(dt) {
  const c = S.courier;
  if (!c || !S.mission || S.mission.id !== 'm2') return;
  // Courier loops around the city on the road graph.
  if (!S.mission.courierPoint || dist(c.x, c.y, S.mission.courierPoint.x, S.mission.courierPoint.y) < 90) {
    const jx = 200 + Math.floor(Math.random() * 8) * 400;
    const jy = 200 + Math.floor(Math.random() * 8) * 400;
    S.mission.courierPoint = { x: jx, y: jy };
  }
  driveToward(c, S.mission.courierPoint.x, S.mission.courierPoint.y, dt, c.cruise);
}

function setupShootout(stage) {
  const a = stage.arena;
  S.enemies = [];
  const offsets = [[-90, -70], [90, -60], [0, 90], [-110, 60], [110, 70]];
  for (let i = 0; i < stage.enemies; i++) {
    const o = offsets[i % offsets.length];
    spawnEnemy(a.x + o[0], a.y + o[1]);
  }
  spawnHealthPickup(a.x - 140, a.y + 120);
  spawnHealthPickup(a.x + 140, a.y - 120);
  spawnAmmoPickup(a.x, a.y + 150);
  if (stage.crates) {
    spawnArenaCrate(a.x - 120, a.y - 120, 'smg', 120);
    spawnArenaCrate(a.x + 120, a.y + 120, 'shotgun', 24);
    spawnAmmoPickup(a.x + 60, a.y - 140);
  }
}

export function stage() {
  if (!S.mission) return null;
  return S.mission.stages[S.mission.stageIndex] || null;
}

export function updateMissions(dt) {
  if (!S.mission) {
    // Offer the next mission when the player is free and no dialog is up.
    if (S.mode === 'playing' && !S.dialog && S.dialogCooldown <= 0 && currentMissionDef()) {
      offerMission();
    }
    return;
  }
  const m = S.mission;
  m.timeLeft -= dt;
  S.missionTimeLeft = m.timeLeft;
  if (m.timeLeft <= 0) { failMission('Out of time'); return; }
  const st = stage();
  if (!st) { completeMission(); return; }
  const p = S.player;
  if (st.type === 'goto') {
    if (dist(p.x, p.y, st.x, st.y) < 90) advanceStage();
  } else if (st.type === 'checkpoints') {
    const pt = st.points[st.idx];
    if (pt && dist(p.x, p.y, pt.x, pt.y) < 90) {
      st.idx++;
      sfx('pickup');
      if (st.idx >= st.points.length) advanceStage();
    }
  } else if (st.type === 'collect') {
    st.got = st.total - S.pickups.filter((pk) => pk.kind === 'money' && !pk.taken).length;
    if (st.got >= st.total) advanceStage();
  } else if (st.type === 'chase') {
    m.hitCooldown -= dt;
    const c = S.courier;
    if (c && p.inCar && dist(p.inCar.x, p.inCar.y, c.x, c.y) < 70 && Math.abs(p.inCar.speed) > 120 && m.hitCooldown <= 0) {
      m.hitCooldown = 1.0;
      st.hits += 1;
      c.cruise = Math.max(150, c.cruise * 0.55);
      sfx('crash');
      S.fx.push({ x: c.x, y: c.y, life: 0.5, kind: 'hit' });
      if (st.hits >= st.need) advanceStage();
    }
  } else if (st.type === 'escape') {
    if (S.heat <= 0) advanceStage();
    else if (st.x && dist(p.x, p.y, st.x, st.y) < 90 && S.heat <= 0) advanceStage();
  } else if (st.type === 'shootout') {
    if (!st.setup) { setupShootout(st); st.setup = true; }
    if (S.enemies.length === 0) advanceStage();
  } else if (st.type === 'garage') {
    if (S.flags.garageBought) advanceStage();
  }
}

function advanceStage() {
  S.mission.stageIndex++;
  sfx('pickup');
  if (S.mission.stageIndex >= S.mission.stages.length) completeMission();
}

export function completeMission() {
  const m = S.mission;
  S.player.cash += m.reward;
  S.completedMissions++;
  S.missionIndex++;
  S.mission = null;
  S.courier = null;
  S.enemies = [];
  S.dialogCooldown = 2;
  sfx('mission');
  S.fx.push({ x: S.player.x, y: S.player.y, life: 1.2, kind: 'pickup', text: `+$${m.reward}` });
  autosave();
  if (!currentMissionDef()) {
    S.dialog = { fixer: 'Mara', text: 'That is the whole story, Rook. Crescent Bay is yours now. Free roam — enjoy it.', kind: 'info' };
  }
}

export function failMission(reason) {
  const def = currentMissionDef();
  S.mission = null;
  S.courier = null;
  S.enemies = [];
  S.dialogCooldown = 1;
  S.dialog = { fixer: def ? def.fixer : 'Mara', text: `Mission failed — ${reason}. Shake it off, we go again.`, kind: 'info' };
  // Restart from stage 0 on the next offer.
  S.flags.garageBought = false;
}

export function restartAfterDeath() {
  const p = S.player;
  p.hp = 100;
  p.dead = false;
  p.x = 600; p.y = 800;
  p.inCar = null; p.onFoot = true;
  S.heat = 0; S.stars = 0;
  S.police = []; S.patrols = []; S.roadblocks = [];
  S.enemies = []; S.bullets = [];
  S.mission = null;
  S.dialogCooldown = 1;
  S.mode = 'playing';
}
