const GAME_TITLE = 'Crescent Bay';
const WORLD_SEED = 20261117;
const SAVE_KEY = 'crescent-bay-save-v1';
const SAVE_VERSION = 1;

// World geometry: a road grid, a beach and open water on the east edge.
const ROAD_SPACING = 260;
const ROAD_W = 64;
const SIDEWALK_W = 18;
const GRID_N = 11; // intersections per side (0..10)
const ROAD0 = 100; // first road centre
const WORLD_W = 3400;
const WORLD_H = 2860;
const SAND_X0 = 2830;
const WATER_X0 = 2960;

// Fixed timestep: simulation always advances in 1/60 s steps.
const STEP = 1 / 60;

// Wanted heat: crimes add heat, stars are thresholds on it.
const WANTED_STAR_THRESHOLDS = [0, 12, 30, 55, 80];
const HEAT_MAX = 100;

// Player on foot.
const PLAYER_WALK_SPEED = 150;
const PLAYER_RUN_SPEED = 250;
const PLAYER_RADIUS = 14;
const PLAYER_HEALTH_MAX = 100;

// Vehicle types: top speed (px/s), acceleration, steering, colour identity.
const VEHICLE_TYPES = {
  sedan:   { topSpeed: 430, accel: 260, brake: 520, steer: 2.6, len: 52, wid: 26, color: '#3f7fbf', name: 'Sedan' },
  taxi:    { topSpeed: 420, accel: 250, brake: 520, steer: 2.6, len: 52, wid: 26, color: '#f2c200', name: 'Taxi' },
  truck:   { topSpeed: 330, accel: 170, brake: 380, steer: 1.9, len: 72, wid: 30, color: '#8a6f4d', name: 'Truck' },
  sports:  { topSpeed: 560, accel: 380, brake: 620, steer: 3.1, len: 54, wid: 26, color: '#e8352c', name: 'Sports' },
  police:  { topSpeed: 520, accel: 340, brake: 600, steer: 3.0, len: 54, wid: 26, color: '#1c2733', name: 'Patrol' },
};

// Traffic and pedestrian budgets (active agents near the player only).
const TRAFFIC_TARGET = 16;
const PED_TARGET = 26;
const DESPAWN_DIST = 1150;
const SPAWN_DIST = 900;

// Mission and economy.
const MISSION_REWARD_DEFAULT = 400;
const SPRAY_SHOP_COST = 50;
const RESPAWN_CASH_LOSS = 150;
const PISTOL_AMMO_MAX = 60;
const PICKUP_HEALTH = 35;

// Day cycle: one full game day lasts 8 real minutes; clock starts mid-morning.
const DAY_LENGTH_S = 480;
const CLOCK_START_H = 10.5;

export {
  GAME_TITLE, WORLD_SEED, SAVE_KEY, SAVE_VERSION,
  ROAD_SPACING, ROAD_W, SIDEWALK_W, GRID_N, ROAD0, WORLD_W, WORLD_H,
  SAND_X0, WATER_X0, STEP, WANTED_STAR_THRESHOLDS, HEAT_MAX,
  PLAYER_WALK_SPEED, PLAYER_RUN_SPEED, PLAYER_RADIUS, PLAYER_HEALTH_MAX,
  VEHICLE_TYPES, TRAFFIC_TARGET, PED_TARGET, DESPAWN_DIST, SPAWN_DIST,
  MISSION_REWARD_DEFAULT, SPRAY_SHOP_COST, RESPAWN_CASH_LOSS,
  PISTOL_AMMO_MAX, PICKUP_HEALTH, DAY_LENGTH_S, CLOCK_START_H,
};
