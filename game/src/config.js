const GAME_TITLE = 'Crescent Bay';
const WORLD_SEED = 20261117;
const WORLD_HALF = 1600;
const ROAD_HALF = 56;
const GRID_LINES = [-1200, -800, -400, 0, 400, 800, 1200];
const SAVE_KEY = 'crescent-bay-save-v1';
const SAVE_VERSION = 3;

const CAR_TYPES = {
  sedan:   { name: 'Sedan',   topSpeed: 340, accel: 300, turn: 2.6, length: 64, width: 30, colors: ['#c94f3d', '#3d6fc9', '#d8d3c8', '#5a7d5a'] },
  taxi:    { name: 'Taxi',    topSpeed: 350, accel: 310, turn: 2.6, length: 64, width: 30, colors: ['#f2c230'] },
  truck:   { name: 'Truck',   topSpeed: 285, accel: 220, turn: 2.0, length: 92, width: 34, colors: ['#8a7f72', '#4f6b7a', '#a35a2e'] },
  sports:  { name: 'Sports',  topSpeed: 520, accel: 420, turn: 3.1, length: 66, width: 30, colors: ['#e8b400', '#d92b2b', '#1f9d8a'] },
  police:  { name: 'Patrol',  topSpeed: 480, accel: 380, turn: 3.0, length: 66, width: 30, colors: ['#20242c'] },
  courier: { name: 'Courier', topSpeed: 448, accel: 360, turn: 2.9, length: 64, width: 30, colors: ['#7a4fd0'] },
};

const WANTED_STAR_THRESHOLDS = [15, 35, 55, 75, 90];
const WANTED_HEAT_MAX = 100;
const HEAT_PER_CAR_THEFT = 18;
const HEAT_PER_SHOT = 6;
const HEAT_PER_PED_HIT = 22;
const HEAT_PER_COP_KILL = 30;
const HEAT_DECAY_PER_SEC = 3.5;
const HEAT_DECAY_HIDDEN_PER_SEC = 7;
const HEAT_DECAY_GARAGE_PER_SEC = 26;

const PLAYER_WALK_SPEED = 235;
const PLAYER_SPRINT_SPEED = 340;
const PLAYER_RADIUS = 15;
const PLAYER_MAX_HEALTH = 100;
const PISTOL_DAMAGE = 34;
const PISTOL_RANGE = 520;
const PISTOL_FIRE_INTERVAL = 0.24;

const MISSION_TRIGGER_RADIUS = 50;
const GOTO_RADIUS = 72;
const CHASE_HIT_DISTANCE = 70;
const CHASE_HIT_MIN_SPEED = 120;

const REPAINT_GARAGE = { x: 200, y: -1000, w: 150, h: 110 };
const MARINA = { x: -1360, y: 300 };
const DOCKS = { x: -1360, y: -600 };
const HIGHWAY_Y = 1200;

export {
  GAME_TITLE, WORLD_SEED, WORLD_HALF, ROAD_HALF, GRID_LINES, SAVE_KEY, SAVE_VERSION,
  CAR_TYPES, WANTED_STAR_THRESHOLDS, WANTED_HEAT_MAX,
  HEAT_PER_CAR_THEFT, HEAT_PER_SHOT, HEAT_PER_PED_HIT, HEAT_PER_COP_KILL,
  HEAT_DECAY_PER_SEC, HEAT_DECAY_HIDDEN_PER_SEC, HEAT_DECAY_GARAGE_PER_SEC,
  PLAYER_WALK_SPEED, PLAYER_SPRINT_SPEED, PLAYER_RADIUS, PLAYER_MAX_HEALTH,
  PISTOL_DAMAGE, PISTOL_RANGE, PISTOL_FIRE_INTERVAL,
  MISSION_TRIGGER_RADIUS, GOTO_RADIUS, CHASE_HIT_DISTANCE, CHASE_HIT_MIN_SPEED,
  REPAINT_GARAGE, MARINA, DOCKS, HIGHWAY_Y,
};
