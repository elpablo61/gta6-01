// Crescent Bay — the renderer. The static city layer is pre-rendered
// once (world.buildStaticLayer); each frame draws only the dynamic
// entities, the helicopter and its spotlight, night lighting, and
// effects. Camera follows the player.
import { S } from './state.js';
import { WORLD_SIZE } from './config.js';
import { drawStatic } from './world.js';
import { SPRAY_SHOP, GARAGE_POS } from './police.js';
import { drawHUD } from './hud.js';
import { clamp } from './random.js';

export function render(g, viewW, viewH) {
  const cam = S.camera;
  cam.x = clamp(S.player.x - viewW / 2, 0, WORLD_SIZE - viewW);
  cam.y = clamp(S.player.y - viewH / 2, 0, WORLD_SIZE - viewH);
  g.save();
  g.clearRect(0, 0, viewW, viewH);
  drawStatic(g, cam.x, cam.y, viewW, viewH);
  g.translate(-cam.x, -cam.y);

  // Spray Shop + Fixer Garage markers on the ground.
  drawZone(g, SPRAY_SHOP.x, SPRAY_SHOP.y, 150, '#3ac95a', 'SPRAY SHOP');
  drawZone(g, GARAGE_POS.x, GARAGE_POS.y, 130, '#e8a832', 'FIXER GARAGE');

  // Weapon crates.
  for (const c of S.crates) {
    if (c.taken) continue;
    g.fillStyle = '#8a6a2a';
    g.fillRect(c.x - 18, c.y - 14, 36, 28);
    g.strokeStyle = '#ffd23a';
    g.strokeRect(c.x - 18, c.y - 14, 36, 28);
    g.fillStyle = '#ffd23a';
    g.font = 'bold 11px sans-serif';
    g.textAlign = 'center';
    g.fillText(c.label, c.x, c.y - 20);
    g.textAlign = 'left';
  }
  // Pickups.
  for (const pk of S.pickups) {
    if (pk.taken) continue;
    g.fillStyle = pk.kind === 'health' ? '#ff5a5a' : pk.kind === 'ammo' ? '#ffd23a' : '#7ae87a';
    g.beginPath(); g.arc(pk.x, pk.y, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111';
    g.font = 'bold 13px sans-serif';
    g.textAlign = 'center';
    g.fillText(pk.kind === 'health' ? '+' : pk.kind === 'ammo' ? 'A' : '$', pk.x, pk.y + 5);
    g.textAlign = 'left';
  }
  // Mission marker.
  drawMissionMarker(g);
  // Pedestrians.
  for (const p of S.peds) {
    g.fillStyle = p.color;
    g.beginPath(); g.arc(p.x, p.y, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8c9a0';
    g.beginPath(); g.arc(p.x, p.y - 4, 5, 0, Math.PI * 2); g.fill();
  }
  // Cars.
  for (const car of S.cars) {
    if (car.hp <= 0 && !car.isPlayer) continue;
    drawCar(g, car);
  }
  // Foot police.
  for (const cop of S.police) {
    g.fillStyle = '#2a4a8a';
    g.beginPath(); g.arc(cop.x, cop.y, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d8d8e8';
    g.beginPath(); g.arc(cop.x, cop.y - 4, 5, 0, Math.PI * 2); g.fill();
  }
  // Roadblocks.
  for (const rb of S.roadblocks) {
    g.fillStyle = '#d83a3a';
    g.fillRect(rb.x - 30, rb.y - 8, 60, 16);
    g.fillStyle = '#fff';
    g.fillRect(rb.x - 30, rb.y - 8, 12, 16);
    g.fillRect(rb.x - 6, rb.y - 8, 12, 16);
    g.fillRect(rb.x + 18, rb.y - 8, 12, 16);
  }
  // Enemies.
  for (const e of S.enemies) {
    g.fillStyle = '#b03a3a';
    g.beginPath(); g.arc(e.x, e.y, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111';
    g.fillRect(e.x - 14, e.y - 24, 28, 5);
    g.fillStyle = '#ff5a5a';
    g.fillRect(e.x - 14, e.y - 24, 28 * Math.max(0, e.hp / 36), 5);
    // Gun direction.
    g.strokeStyle = '#111';
    g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(e.x + Math.cos(e.angle) * 22, e.y + Math.sin(e.angle) * 22); g.stroke();
  }
  // Player on foot.
  if (S.player.onFoot && !S.player.dead) {
    const p = S.player;
    g.fillStyle = '#e8b13a';
    g.beginPath(); g.arc(p.x, p.y, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a2a2a';
    g.beginPath(); g.arc(p.x, p.y - 5, 6, 0, Math.PI * 2); g.fill();
    // Aim line.
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.beginPath(); g.moveTo(p.x, p.y);
    g.lineTo(p.x + Math.cos(p.aimAngle || 0) * 40, p.y + Math.sin(p.aimAngle || 0) * 40); g.stroke();
  }
  // Bullets.
  g.fillStyle = '#ffe95a';
  for (const b of S.bullets) {
    g.beginPath(); g.arc(b.x, b.y, 3, 0, Math.PI * 2); g.fill();
  }
  // Helicopter + spotlight + shadow.
  drawHeli(g);
  // Effects.
  for (const fx of S.fx) {
    g.fillStyle = fx.kind === 'hit' ? '#ff5a3a' : fx.kind === 'pickup' ? '#7ae87a' : '#ffe95a';
    g.globalAlpha = Math.max(0, fx.life);
    g.beginPath(); g.arc(fx.x, fx.y, 10, 0, Math.PI * 2); g.fill();
    if (fx.text) {
      g.font = 'bold 20px sans-serif';
      g.fillText(fx.text, fx.x - 30, fx.y - 24);
    }
    g.globalAlpha = 1;
  }
  g.restore();

  // Night overlay + headlights + street-lamp pools.
  const night = nightFactor();
  if (night > 0) {
    g.fillStyle = `rgba(8,10,40,${0.45 * night})`;
    g.fillRect(0, 0, viewW, viewH);
    // Headlight cone for the player's car.
    if (S.player.inCar) {
      const car = S.player.inCar;
      const sx = car.x - cam.x, sy = car.y - cam.y;
      const grad = g.createRadialGradient(sx, sy, 10, sx, sy, 260);
      grad.addColorStop(0, 'rgba(255,240,180,0.35)');
      grad.addColorStop(1, 'rgba(255,240,180,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(sx, sy, 260, 0, Math.PI * 2); g.fill();
    }
  }
  drawHUD(g, viewW, viewH);
}

export function nightFactor() {
  const h = S.dayTime;
  if (h >= 20 || h < 5) return 1;
  if (h >= 18) return (h - 18) / 2;
  if (h < 7) return (7 - h) / 2;
  return 0;
}

function drawZone(g, x, y, r, color, label) {
  g.strokeStyle = color;
  g.lineWidth = 3;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  g.fillStyle = color;
  g.globalAlpha = 0.12;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  g.font = 'bold 16px sans-serif';
  g.textAlign = 'center';
  g.fillText(label, x, y - r - 8);
  g.textAlign = 'left';
}

function drawMissionMarker(g) {
  const st = S.mission ? S.mission.stages[S.mission.stageIndex] : null;
  if (!st) return;
  let x = null, y = null;
  if (st.type === 'goto') { x = st.x; y = st.y; }
  else if (st.type === 'checkpoints') { const pt = st.points[st.idx]; if (pt) { x = pt.x; y = pt.y; } }
  else if (st.type === 'shootout') { x = st.arena.x; y = st.arena.y; }
  else if (st.type === 'garage') { x = GARAGE_POS.x; y = GARAGE_POS.y; }
  else if (st.type === 'escape') { x = SPRAY_SHOP.x; y = SPRAY_SHOP.y; }
  else if (st.type === 'chase' && S.courier) { x = S.courier.x; y = S.courier.y; }
  else if (st.type === 'collect') {
    const drop = S.pickups.find((pk) => pk.kind === 'money' && !pk.taken);
    if (drop) { x = drop.x; y = drop.y; }
  }
  if (x === null) return;
  const pulse = 26 + Math.sin(S.time * 4) * 6;
  g.strokeStyle = '#ff4f4f';
  g.lineWidth = 4;
  g.beginPath(); g.arc(x, y, pulse, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#ff4f4f';
  g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
}

function drawCar(g, car) {
  g.save();
  g.translate(car.x, car.y);
  g.rotate(car.angle);
  // Shadow.
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(-car.len / 2 + 3, -car.wid / 2 + 4, car.len, car.wid);
  g.fillStyle = car.color;
  g.fillRect(-car.len / 2, -car.wid / 2, car.len, car.wid);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(-car.len / 4, -car.wid / 2 + 3, car.len / 2, car.wid - 6);
  // Windshield + headlights.
  g.fillStyle = '#cfe8ff';
  g.fillRect(car.len / 2 - 10, -car.wid / 2 + 3, 6, car.wid - 6);
  g.fillStyle = '#ffe95a';
  g.fillRect(car.len / 2 - 2, -car.wid / 2 + 1, 3, 5);
  g.fillRect(car.len / 2 - 2, car.wid / 2 - 6, 3, 5);
  if (car.isPolice) {
    g.fillStyle = '#fff';
    g.fillRect(-4, -car.wid / 2 + 2, 8, 6);
    g.fillStyle = (Math.floor(S.time * 4) % 2 === 0) ? '#ff3a3a' : '#3a6aff';
    g.fillRect(-6, -3, 12, 6);
  }
  if (car.hp < 100) {
    g.fillStyle = 'rgba(20,20,20,0.7)';
    g.fillRect(-car.len / 2, car.wid / 2 + 4, car.len, 4);
    g.fillStyle = '#d83a3a';
    g.fillRect(-car.len / 2, car.wid / 2 + 4, car.len * Math.max(0, car.hp / 100), 4);
  }
  g.restore();
}

function drawHeli(g) {
  const h = S.heli;
  if (!h || !h.active) return;
  // Ground shadow + spotlight cone on the ground.
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.ellipse(h.x, h.y, 46, 20, 0, 0, Math.PI * 2); g.fill();
  if (h.onPlayer && !h.retreating) {
    g.fillStyle = 'rgba(255,240,160,0.18)';
    g.beginPath(); g.arc(S.player.x, S.player.y, 150, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,240,160,0.5)';
    g.beginPath(); g.arc(S.player.x, S.player.y, 150, 0, Math.PI * 2); g.stroke();
  }
  // Body + rotor blur, drawn above the ground (offset up-left).
  const hx = h.x - 24, hy = h.y - 34;
  g.fillStyle = h.smoke ? '#555' : '#2a4a6a';
  g.beginPath(); g.ellipse(hx, hy, 34, 14, -0.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#cfe8ff';
  g.beginPath(); g.ellipse(hx + 12, hy - 2, 10, 6, -0.2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.lineWidth = 3;
  const ra = h.rotor;
  g.beginPath();
  g.moveTo(hx - Math.cos(ra) * 44, hy - Math.sin(ra) * 10);
  g.lineTo(hx + Math.cos(ra) * 44, hy + Math.sin(ra) * 10);
  g.stroke();
  if (h.smoke) {
    g.fillStyle = 'rgba(80,80,80,0.6)';
    g.beginPath(); g.arc(hx - 20, hy - 10, 10 + Math.sin(S.time * 5) * 3, 0, Math.PI * 2); g.fill();
  }
}
