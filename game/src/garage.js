// Crescent Bay — the Fixer Garage: real upgrades for the player's
// CURRENT car, stored per car. Drive into the garage zone and press E
// (or the menu button) to open the upgrade menu (a DOM overlay that
// pauses the world). Prices rise per level. Paint is visual only and
// separate from the Spray Shop, which only clears heat.
import { S } from './state.js';
import { dist } from './random.js';
import { GARAGE_POS } from './police.js';
import { sfx } from './audio.js';

export const UPGRADES = {
  engine: { name: 'Engine', max: 3, prices: [800, 1500, 2500], desc: '+top speed each level' },
  armor: { name: 'Armor', max: 3, prices: [600, 1100, 1800], desc: 'damage resistance' },
  tires: { name: 'Tires', max: 2, prices: [500, 900], desc: 'better handling and turning' },
  brakes: { name: 'Brakes', max: 2, prices: [400, 800], desc: 'shorter stopping distance' },
};
export const PAINTS = [
  { name: 'Crimson', color: '#c93a3a', price: 200 },
  { name: 'Ocean', color: '#3a7ac9', price: 200 },
  { name: 'Lime', color: '#7ac93a', price: 200 },
  { name: 'Gold', color: '#c9a44f', price: 250 },
  { name: 'Violet', color: '#8a4fc9', price: 250 },
  { name: 'Midnight', color: '#222228', price: 300 },
];

export function nearGarage() {
  return dist(S.player.x, S.player.y, GARAGE_POS.x, GARAGE_POS.y) < 130;
}

export function cheapestUpgrade() {
  const car = S.player.inCar;
  if (!car) return null;
  let best = null;
  for (const key of Object.keys(UPGRADES)) {
    const lvl = car.upgrades[key] || 0;
    const def = UPGRADES[key];
    if (lvl < def.max) {
      const price = def.prices[lvl];
      if (!best || price < best.price) best = { key, price, level: lvl };
    }
  }
  return best;
}

export function buyUpgrade(key) {
  const car = S.player.inCar;
  if (!car) return false;
  const def = UPGRADES[key];
  if (!def) return false;
  const lvl = car.upgrades[key] || 0;
  if (lvl >= def.max) return false;
  const price = def.prices[lvl];
  if (S.player.cash < price) return false;
  S.player.cash -= price;
  car.upgrades[key] = lvl + 1;
  S.stats.garageBuys += 1;
  S.flags.garageBought = true;
  sfx('pickup');
  return true;
}

export function buyCheapestUpgrade() {
  const best = cheapestUpgrade();
  if (!best) return false;
  return buyUpgrade(best.key);
}

export function buyPaint(i) {
  const car = S.player.inCar;
  if (!car) return false;
  const paint = PAINTS[i];
  if (!paint || S.player.cash < paint.price) return false;
  S.player.cash -= paint.price;
  car.paint = paint.color;
  car.color = paint.color;
  sfx('pickup');
  return true;
}

// DOM overlay. The menu pauses the world while open.
let menuEl = null;

export function buildGarageMenu() {
  menuEl = document.getElementById('garage-menu');
  if (!menuEl) return;
  menuEl.querySelector('.garage-close').addEventListener('click', closeGarageMenu);
}

export function openGarageMenu() {
  if (!menuEl || !S.player.inCar) return;
  S.paused = true;
  renderGarageMenu();
  menuEl.style.display = 'block';
}

export function closeGarageMenu() {
  if (!menuEl) return;
  menuEl.style.display = 'none';
  S.paused = false;
}

export function garageMenuOpen() {
  return menuEl && menuEl.style.display === 'block';
}

export function renderGarageMenu() {
  if (!menuEl) return;
  const car = S.player.inCar;
  const body = menuEl.querySelector('.garage-body');
  let html = `<p>Cash: $${S.player.cash}</p>`;
  for (const key of Object.keys(UPGRADES)) {
    const def = UPGRADES[key];
    const lvl = car ? car.upgrades[key] || 0 : 0;
    const price = lvl < def.max ? def.prices[lvl] : null;
    html += `<div class="garage-row"><span>${def.name} Lv ${lvl}/${def.max} — ${def.desc}</span>` +
      (price !== null
        ? `<button data-upgrade="${key}">Buy $${price}</button>`
        : `<span>MAX</span>`) + `</div>`;
  }
  html += `<p>Paint (visual only):</p><div class="garage-paints">`;
  PAINTS.forEach((p, i) => {
    html += `<button data-paint="${i}" style="background:${p.color}">${p.name} $${p.price}</button>`;
  });
  html += `</div>`;
  body.innerHTML = html;
  body.querySelectorAll('[data-upgrade]').forEach((b) => {
    b.addEventListener('click', () => { buyUpgrade(b.dataset.upgrade); renderGarageMenu(); });
  });
  body.querySelectorAll('[data-paint]').forEach((b) => {
    b.addEventListener('click', () => { buyPaint(Number(b.dataset.paint)); renderGarageMenu(); });
  });
}
