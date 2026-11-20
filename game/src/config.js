// Crescent Bay — shared tuning constants. One clear job: every magic
// number the rest of the game agrees on lives here.
export const WORLD_SIZE = 3200;
export const ROAD_COUNT = 8;
export const ROAD_SPACING = 400;
export const ROAD_START = 200;
export const ROAD_WIDTH = 64;
export const ROAD_HALF = 32;
export const ON_ROAD_TOL = 42;
export const RNG_SEED = 20261118;
export const SHOT_SEED = 7;

// Wanted: heat 0-100, stars at these thresholds.
export const STAR_THRESHOLDS = [0, 12, 30, 52, 74, 92];
// Heat decays only while no police is within this range for this long.
export const HIDE_RANGE = 450;
export const HIDE_SECONDS = 3;
// Spray Shop: radius and heat drain per second.
export const SPRAY_RADIUS = 150;
export const SPRAY_DRAIN = 50;

// Player on foot.
export const WALK_SPEED = 230;
export const SPRINT_SPEED = 330;
export const PLAYER_HP = 100;

// Car physics.
export const SHARP_TURN = 0.9; // |angle diff| above this: stop and rotate in place
export const WAYPOINT_ACCEPT = 70;
export const WALL_DAMAGE_TICK = 0.5;
export const WALL_DAMAGE = 4;
export const COLLISION_DAMAGE = 3; // per second per car

// Combat.
export const ENEMY_HP = 36;
export const PISTOL_DAMAGE = 18;

// District ground colours.
export const DISTRICT_COLORS = {
  north: '#7fae7a',
  oldtown: '#b98a5e',
  downtown: '#8d9bb5',
  waterfront: '#e0c98f',
  docks: '#9a9a92',
};
