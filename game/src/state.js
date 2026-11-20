// Crescent Bay — the shared run state. Every module reads the same
// object S, so there is exactly one place where a new run begins and
// one place where the shape of a run is declared. Nothing here draws
// or simulates; it only holds the numbers the other modules agree on.
//
// resetRunState() restores a fresh run. It deliberately keeps the
// seed, the autopilot flag and the screenshot pose: the boot code sets
// those from the URL before the first game starts, and a new game must
// not forget them.
import { RNG_SEED } from './config.js';

function freshPlayer() {
  return {
    x: 600, y: 800, vx: 0, vy: 0, angle: 0, aimAngle: 0, speed: 0,
    hp: 100, cash: 0, dead: false, onFoot: true, inCar: null,
    lastDamageAt: -99,
  };
}

function freshFlags() {
  return { gunshot: false, holdDialog: false, patrolLoop: null, patrolIdx: 0, garageBought: false };
}

function freshAuto() {
  return { walkTarget: null, walkRoute: null, walkIdx: 0, shootTimer: 0 };
}

function freshStats() {
  return { carsStolen: 0, shotsFired: 0, garageBuys: 0, radioCycles: 0, heliHits: 0 };
}

export const S = {
  seed: RNG_SEED,
  time: 0,
  dayTime: 10, // morning by default; missions may move it to night
  mode: 'title', // title | playing | paused | over
  paused: false,
  autopilot: false,
  shotMode: null,
  startedAt: 0,
  activeSlot: 0,

  player: freshPlayer(),
  camera: { x: 0, y: 0 },

  // World entities.
  cars: [],
  peds: [],
  police: [], // foot police
  patrols: [], // police cars
  roadblocks: [],
  enemies: [],
  bullets: [],
  pickups: [],
  crates: [],
  fx: [],

  // Wanted system.
  heat: 0,
  stars: 0,
  hideTimer: 0,
  heli: null, // created by the helicopter module when wanted is high

  // Combat / radio (weapons is built by initWeapons()).
  weapons: null,
  radioStation: 0,

  // Story.
  mission: null,
  missionIndex: 0,
  completedMissions: 0,
  missionTimeLeft: 0,
  courier: null,

  // Dialogs.
  dialog: null,
  dialogCooldown: 0,

  flags: freshFlags(),
  auto: freshAuto(),
  stats: freshStats(),
  overReason: null, // CAUGHT | DOWN, shown on the game-over screen
};

export function resetRunState() {
  S.time = 0;
  S.dayTime = 10;
  S.mode = 'playing';
  S.paused = false;
  S.startedAt = 0;
  S.player = freshPlayer();
  S.camera = { x: 0, y: 0 };
  S.cars = [];
  S.peds = [];
  S.police = [];
  S.patrols = [];
  S.roadblocks = [];
  S.enemies = [];
  S.bullets = [];
  S.pickups = [];
  S.crates = [];
  S.fx = [];
  S.heat = 0;
  S.stars = 0;
  S.hideTimer = 0;
  S.heli = null;
  S.mission = null;
  S.missionIndex = 0;
  S.completedMissions = 0;
  S.missionTimeLeft = 0;
  S.courier = null;
  S.dialog = null;
  S.dialogCooldown = 0;
  S.radioStation = 0;
  S.flags = freshFlags();
  S.auto = freshAuto();
  S.stats = freshStats();
  S.overReason = null;
}
