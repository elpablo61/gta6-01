import { PLAYER_MAX_HEALTH } from './config.js';
import { missionObjectiveText } from './missions.js';

// All gameplay HUD is drawn on the canvas: wanted stars, health, cash,
// minimap, objective banner, speed and ammo — sized to stay readable when
// the screenshot is shrunk to a fifth of its size.
export function drawHud(state, ctx, view) {
  const w = view.w; const h = view.h;
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // Wanted stars, top-left, 38px each.
  const stars = state.wantedStars;
  for (let i = 0; i < 5; i++) {
    const x = 28 + i * 44; const y = 40;
    drawStar(ctx, x, y, 19, i < stars);
  }

  // Health bar, thick, under the stars.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(20, 66, 220, 18);
  ctx.fillStyle = state.player.health > 35 ? '#37d67a' : '#e23b2e';
  ctx.fillRect(22, 68, 216 * (state.player.health / PLAYER_MAX_HEALTH), 14);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 66, 220, 18);

  // Cash, top-right above the minimap.
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4;
  ctx.textAlign = 'right';
  ctx.fillText('$' + Math.floor(state.player.cash), w - 24, 34);
  ctx.shadowBlur = 0;

  // Minimap, 200x200, top-right.
  drawMinimap(state, ctx, w - 224, 48, 200, 200);

  // Objective banner, bottom-left, 28px bold on a dark scrim.
  const objective = missionObjectiveText(state);
  ctx.font = 'bold 28px system-ui, sans-serif';
  const tw = ctx.measureText(objective).width;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(16, h - 66, tw + 28, 46);
  ctx.fillStyle = '#ffd94d';
  ctx.textAlign = 'left';
  ctx.fillText(objective, 30, h - 34);

  // Speed + ammo, bottom-right.
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.textAlign = 'right';
  if (state.playerCar) {
    const mph = Math.round(Math.abs(state.playerCar.speed) * 0.12);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(mph + ' mph', w - 24, h - 34);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Ammo ' + state.player.ammo, w - 24, h - 34);
  }

  // Clock + day/night, top-centre.
  const hour = Math.floor(state.timeOfDay) % 24;
  const minute = Math.floor((state.timeOfDay % 1) * 60);
  const clock = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  const dayNight = hour >= 6 && hour < 19 ? 'DAY' : 'NIGHT';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(clock + '  ' + dayNight, w / 2, 34);

  // Flash message, centre-top.
  if (state.flashUntil > state.time && state.flashText) {
    ctx.font = 'bold 24px system-ui, sans-serif';
    const fw = ctx.measureText(state.flashText).width;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(w / 2 - fw / 2 - 16, 52, fw + 32, 40);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(state.flashText, w / 2, 80);
  }

  // Fixer dialogue box, bottom-centre.
  if (state.mission && state.mission.dialogue && state.time < state.mission.dialogueUntil) {
    const lines = wrapText(ctx, state.mission.dialogue, w - 360);
    const boxH = 34 + lines.length * 26;
    ctx.fillStyle = 'rgba(8,10,18,0.88)';
    ctx.fillRect(w / 2 - 320, h - 190, 640, boxH);
    ctx.strokeStyle = '#ffd94d'; ctx.lineWidth = 3;
    ctx.strokeRect(w / 2 - 320, h - 190, 640, boxH);
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = '#ffd94d';
    ctx.textAlign = 'left';
    ctx.fillText(state.mission.def.fixer + '  •  ' + state.mission.def.name, w / 2 - 300, h - 190 + 30);
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    lines.forEach((line, i) => ctx.fillText(line, w / 2 - 300, h - 190 + 62 + i * 26));
  }

  // FPS + debug overlay (toggle with F3 in the main loop).
  if (state.showDebug) {
    ctx.font = '16px monospace';
    ctx.fillStyle = '#7dff6a';
    ctx.textAlign = 'left';
    ctx.fillText('FPS ' + Math.round(state.fps) + '  cars ' + state.cars.length + '  peds ' + state.peds.length + '  heat ' + Math.round(state.wantedHeat), 20, h - 84);
  }
  ctx.restore();
}

function drawStar(ctx, x, y, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(ang) * rad;
    const py = y + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? '#ffcf2e' : 'rgba(20,20,20,0.75)';
  ctx.fill();
  ctx.strokeStyle = filled ? '#ff5a2e' : 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawMinimap(state, ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8,12,20,0.82)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  const scale = w / 3400;
  const toMap = (wx, wy) => [x + (wx + 1700) * scale, y + (wy + 1700) * scale];
  // Water + beach.
  ctx.fillStyle = '#2f7fc9';
  ctx.fillRect(x, y, (state.world.waterX + 1700) * scale, h);
  // Roads.
  ctx.strokeStyle = '#c9c9c9';
  ctx.lineWidth = 3;
  for (const gx of [-1200, -800, -400, 0, 400, 800, 1200]) {
    const [mx] = toMap(gx, 0);
    ctx.beginPath(); ctx.moveTo(mx, y); ctx.lineTo(mx, y + h); ctx.stroke();
    const [, my] = toMap(0, gx);
    ctx.beginPath(); ctx.moveTo(x, my); ctx.lineTo(x + w, my); ctx.stroke();
  }
  // Mission marker (yellow diamond) or next-job marker.
  const marker = state.mission ? state.mission.def.targets[state.mission.targetIndex] || state.mission.def.targets[0]
    : state.missionMarker;
  if (marker) {
    const [mx, my] = toMap(marker.x, marker.y);
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath();
    ctx.moveTo(mx, my - 9); ctx.lineTo(mx + 9, my); ctx.lineTo(mx, my + 9); ctx.lineTo(mx - 9, my);
    ctx.closePath(); ctx.fill();
  }
  // Police dots (red).
  ctx.fillStyle = '#ff2e2e';
  for (const pc of state.policeCars) {
    const [mx, my] = toMap(pc.x, pc.y);
    ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fill();
  }
  for (const cop of state.cops) {
    const [mx, my] = toMap(cop.x, cop.y);
    ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill();
  }
  // Player arrow (white).
  const px = state.playerCar ? state.playerCar.x : state.player.x;
  const py = state.playerCar ? state.playerCar.y : state.player.y;
  const [mx, my] = toMap(px, py);
  const ang = state.playerCar ? state.playerCar.angle : state.player.angle;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(mx + Math.cos(ang) * 10, my + Math.sin(ang) * 10);
  ctx.lineTo(mx + Math.cos(ang + 2.5) * 8, my + Math.sin(ang + 2.5) * 8);
  ctx.lineTo(mx + Math.cos(ang - 2.5) * 8, my + Math.sin(ang - 2.5) * 8);
  ctx.closePath(); ctx.fill();
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? cur + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = word;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}
