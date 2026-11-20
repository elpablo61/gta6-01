// Crescent Bay — the HUD, drawn on canvas: wanted stars (large),
// objective banner (bold over a dark scrim, lower-left), minimap
// (upper-right), thick health bar, big cash / speed / ammo, radio
// station with animated equalizer. DOM overlays (title, pause,
// game-over, mission dialog) live in index.html and are updated here.
import { S } from './state.js';
import { WORLD_SIZE } from './config.js';
import { stationName, radioEqBars } from './radio.js';
import { currentWeapon, currentAmmo } from './weapons.js';
import { stage } from './missions.js';
import { SPRAY_SHOP, GARAGE_POS, HIDEOUT } from './police.js';

export function drawHUD(g, viewW, viewH) {
  const p = S.player;
  // Wanted stars, top-left, >=36px.
  g.font = 'bold 36px sans-serif';
  for (let i = 0; i < 5; i++) {
    g.fillStyle = i < S.stars ? '#ffd23a' : 'rgba(255,255,255,0.25)';
    g.fillText('★', 16 + i * 40, 48);
  }
  // Health bar, thick, under the stars.
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(16, 60, 220, 22);
  g.fillStyle = p.hp > 50 ? '#3ac95a' : p.hp > 25 ? '#e8a832' : '#d83a3a';
  g.fillRect(18, 62, 216 * Math.max(0, p.hp / 100), 18);
  g.fillStyle = '#fff';
  g.font = 'bold 14px sans-serif';
  g.fillText(`HP ${Math.ceil(p.hp)}`, 22, 77);
  // Cash, big, top-left under health.
  g.font = 'bold 28px sans-serif';
  g.fillStyle = '#7ae87a';
  g.fillText(`$${p.cash}`, 16, 118);
  // Weapon + ammo, big.
  if (S.weapons) {
    g.font = 'bold 22px sans-serif';
    g.fillStyle = '#fff';
    g.fillText(`${currentWeapon().name}  ${currentAmmo()}`, 16, 148);
  }
  // Speed, bottom-right, big.
  const speed = p.inCar ? Math.abs(Math.round(p.inCar.speed * 0.28)) : 0;
  g.font = 'bold 30px sans-serif';
  g.fillStyle = '#fff';
  g.fillText(`${speed} mph`, viewW - 150, viewH - 24);
  // Radio station + equalizer, top-center.
  g.font = 'bold 18px sans-serif';
  g.fillStyle = 'rgba(0,0,0,0.5)';
  const label = `♪ ${stationName()}`;
  const tw = g.measureText(label).width;
  g.fillRect(viewW / 2 - tw / 2 - 14, 10, tw + 28 + 70, 30);
  g.fillStyle = '#ffd23a';
  g.fillText(label, viewW / 2 - tw / 2, 32);
  const bars = radioEqBars();
  bars.forEach((b, i) => {
    const h = 6 + b * 16;
    g.fillStyle = '#7ae87a';
    g.fillRect(viewW / 2 + tw / 2 + 6 + i * 12, 34 - h, 8, h);
  });
  // Objective banner, lower-left, bold over a dark scrim.
  const st = stage();
  const objective = S.mission
    ? `${S.mission.name}: ${st ? st.label : ''}${S.missionTimeLeft > 0 ? `  (${Math.ceil(S.missionTimeLeft)}s)` : ''}`
    : S.completedMissions >= 12 ? 'Story complete — free roam' : 'Free roam — drive to the next job';
  g.font = 'bold 28px sans-serif';
  const ow = g.measureText(objective).width;
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(14, viewH - 66, ow + 28, 44);
  g.fillStyle = '#fff';
  g.fillText(objective, 28, viewH - 34);
  drawMinimap(g, viewW);
}

function drawMinimap(g, viewW) {
  const size = 190;
  const x0 = viewW - size - 14, y0 = 14;
  const k = size / WORLD_SIZE;
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(x0 - 4, y0 - 4, size + 8, size + 8);
  g.fillStyle = '#3a3a40';
  g.fillRect(x0, y0, size, size);
  // Roads on the minimap.
  g.fillStyle = '#8a8a92';
  for (let i = 0; i < 8; i++) {
    const r = (200 + i * 400) * k;
    g.fillRect(x0, y0 + r - 2, size, 4);
    g.fillRect(x0 + r - 2, y0, 4, size);
  }
  // Water east edge.
  g.fillStyle = '#2f6fb2';
  g.fillRect(x0 + 3060 * k, y0, size - 3060 * k, size);
  const dot = (x, y, color, r) => {
    g.fillStyle = color;
    g.beginPath(); g.arc(x0 + x * k, y0 + y * k, r, 0, Math.PI * 2); g.fill();
  };
  dot(SPRAY_SHOP.x, SPRAY_SHOP.y, '#3ac95a', 5);
  dot(GARAGE_POS.x, GARAGE_POS.y, '#e8a832', 5);
  dot(HIDEOUT.x, HIDEOUT.y, '#ffd23a', 4);
  const st = stage();
  if (st) {
    if (st.type === 'goto') dot(st.x, st.y, '#ff4f4f', 7);
    else if (st.type === 'checkpoints') { const pt = st.points[st.idx]; if (pt) dot(pt.x, pt.y, '#ff4f4f', 7); }
    else if (st.type === 'shootout') dot(st.arena.x, st.arena.y, '#ff4f4f', 7);
    else if (st.type === 'escape') dot(SPRAY_SHOP.x, SPRAY_SHOP.y, '#ff4f4f', 7);
    else if (st.type === 'garage') dot(GARAGE_POS.x, GARAGE_POS.y, '#ff4f4f', 7);
  }
  if (S.courier) dot(S.courier.x, S.courier.y, '#ff8a3a', 6);
  dot(S.player.x, S.player.y, '#fff', 5);
  g.strokeStyle = '#fff';
  g.strokeRect(x0, y0, size, size);
}

// DOM overlays.
export function showDialog() {
  const el = document.getElementById('mission-dialog');
  if (!el) return;
  if (S.dialog) {
    el.style.display = 'block';
    el.querySelector('.dialog-fixer').textContent = S.dialog.fixer;
    el.querySelector('.dialog-text').textContent = S.dialog.text;
    el.querySelector('.dialog-accept').style.display = S.dialog.kind === 'mission' ? 'inline-block' : 'none';
  } else el.style.display = 'none';
}

export function showTitle() {
  const el = document.getElementById('title-screen');
  if (el) el.style.display = S.mode === 'title' ? 'flex' : 'none';
}
export function showPause() {
  const el = document.getElementById('pause-menu');
  if (el) el.style.display = S.mode === 'paused' ? 'flex' : 'none';
}
export function showGameOver() {
  const el = document.getElementById('game-over-screen');
  if (!el) return;
  el.style.display = S.mode === 'over' ? 'flex' : 'none';
  if (S.mode === 'over') {
    el.querySelector('.over-title').textContent = S.overReason === 'CAUGHT' ? 'CAUGHT' : 'DOWN';
    el.querySelector('.over-sub').textContent = S.overReason === 'CAUGHT'
      ? 'The police took Rook in. The job goes again.'
      : 'Rook went down. The job goes again.';
  }
}
