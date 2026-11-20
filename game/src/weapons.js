// Crescent Bay — weapons: pistol, SMG, shotgun. Keys 1/2/3 select,
// Q cycles to the next owned weapon, switching is instant (no animation
// lock). Each weapon has its own ammo. Crates in the world grant weapons
// and ammo; walking over one picks it up.
import { S } from './state.js';
import { dist } from './random.js';
import { sfx } from './audio.js';

export const WEAPONS = {
  pistol: { name: 'Pistol', damage: 18, rate: 0.32, range: 520, pellets: 1, spread: 0.03, speed: 900 },
  smg: { name: 'SMG', damage: 10, rate: 0.09, range: 460, pellets: 1, spread: 0.08, speed: 950 },
  shotgun: { name: 'Shotgun', damage: 8, rate: 0.8, range: 300, pellets: 5, spread: 0.16, speed: 800 },
};

export function initWeapons() {
  S.weapons = {
    owned: { pistol: true, smg: false, shotgun: false },
    ammo: { pistol: 48, smg: 0, shotgun: 0 },
    current: 'pistol',
    cooldown: 0,
  };
}

export function currentWeapon() { return WEAPONS[S.weapons.current]; }
export function currentAmmo() { return S.weapons.ammo[S.weapons.current]; }

export function switchWeapon(key) {
  const w = S.weapons;
  if (key && w.owned[key]) { w.current = key; return true; }
  return false;
}

export function cycleWeapon() {
  const w = S.weapons;
  const order = ['pistol', 'smg', 'shotgun'];
  const i = order.indexOf(w.current);
  for (let k = 1; k <= 3; k++) {
    const next = order[(i + k) % 3];
    if (w.owned[next]) { w.current = next; return WEAPONS[next].name; }
  }
  return WEAPONS[w.current].name;
}

export function giveWeapon(key, ammo) {
  const w = S.weapons;
  const had = w.owned[key];
  w.owned[key] = true;
  w.ammo[key] = (w.ammo[key] || 0) + ammo;
  if (!had) w.current = key;
  return !had;
}

export function addAmmo(key, n) {
  S.weapons.ammo[key] = (S.weapons.ammo[key] || 0) + n;
}

// Weapon crates at fixed spots: gun store, docks, hideout, plus the
// m10/m12 shootout arenas (spawned by the mission).
export function spawnWorldCrates() {
  S.crates.push({ x: 1400, y: 1000, weapon: 'smg', ammo: 120, taken: false, label: 'SMG' });
  S.crates.push({ x: 2600, y: 2600, weapon: 'shotgun', ammo: 24, taken: false, label: 'Shotgun' });
  S.crates.push({ x: 700, y: 700, weapon: 'smg', ammo: 90, taken: false, label: 'SMG' });
}

export function spawnArenaCrate(x, y, weapon, ammo) {
  S.crates.push({ x, y, weapon, ammo, taken: false, label: WEAPONS[weapon].name, arena: true });
}

export function updateCrates(dt) {
  const p = S.player;
  for (const c of S.crates) {
    if (c.taken) continue;
    if (dist(p.x, p.y, c.x, c.y) < 46) {
      c.taken = true;
      giveWeapon(c.weapon, c.ammo);
      sfx('pickup');
      S.fx.push({ x: c.x, y: c.y, life: 0.8, kind: 'pickup', text: WEAPONS[c.weapon].name + '!' });
    }
  }
  S.crates = S.crates.filter((c) => !c.taken || c.arena);
}
