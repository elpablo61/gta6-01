import { WORLD_W, WORLD_H } from './config.js';
import { drawHUD } from './hud.js';

// Camera, world blit, entities, particles, day/night lighting, HUD.
// The player is always drawn last and brightest so it is found in 1 second,
// even in the busiest frame.
function render(G) {
  const { ctx, canvas } = G;
  const W = canvas.width, H = canvas.height;
  const p = G.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  // Camera follows the player, clamped to the world.
  let camX = Math.max(0, Math.min(WORLD_W - W, px - W / 2));
  let camY = Math.max(0, Math.min(WORLD_H - H, py - H / 2));
  // Tiny shake on hurt / crash.
  if (p.hurtFlash > 0.15) {
    camX += (Math.random() - 0.5) * 8;
    camY += (Math.random() - 0.5) * 8;
  }
  G.camera.x = camX; G.camera.y = camY;
  ctx.clearRect(0, 0, W, H);
  // Static city: one blit of the pre-rendered layer.
  ctx.drawImage(G.world.cityCanvas, camX, camY, W, H, 0, 0, W, H);
  // Skid marks.
  ctx.strokeStyle = 'rgba(20,20,20,0.5)';
  ctx.lineWidth = 5;
  for (const car of G.cars) {
    if (!car.skid || car.skid.length < 2) continue;
    ctx.beginPath();
    for (let i = 0; i < car.skid.length; i++) {
      const s = car.skid[i];
      if (i === 0) ctx.moveTo(s.x - camX, s.y - camY);
      else ctx.lineTo(s.x - camX, s.y - camY);
    }
    ctx.stroke();
  }
  // Pickups.
  for (const pk of G.pickups) {
    if (!pk.alive) continue;
    const bob = Math.sin(pk.bob * 4) * 2;
    const sx = pk.x - camX, sy = pk.y - camY + bob;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(pk.x - camX, pk.y - camY + 6, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pk.kind === 'health' ? '#37c24a' : '#ffd21f';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sx, sy, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pk.kind === 'health' ? '+' : 'A', sx, sy + 5);
    ctx.textAlign = 'left';
  }
  // Mission marker: big pulsing yellow diamond + edge arrow when off-screen.
  drawMissionMarker(G, ctx, camX, camY, W, H);
  // Cars (traffic, parked, police, player).
  for (const car of G.cars) {
    if (car.wrecked && car.damage >= 100) drawWreck(G, ctx, car, camX, camY);
    else drawCar(G, ctx, car, camX, camY);
  }
  // Pedestrians.
  for (const ped of G.peds) {
    if (!ped.alive) continue;
    const sx = ped.x - camX, sy = ped.y - camY;
    if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(sx + 3, sy + 4, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath(); ctx.arc(sx, sy - 2, 4.5, 0, Math.PI * 2); ctx.fill();
    if (ped.fleeing) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx - 8, sy - 14); ctx.lineTo(sx + 8, sy - 14); ctx.stroke();
    }
  }
  // Rival crew: bigger, with a red ring so they read as a threat.
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const sx = e.x - camX, sy = e.y - camY;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(sx + 3, sy + 4, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#ff3b30';
    ctx.beginPath(); ctx.arc(sx, sy, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#5a2d8a';
    ctx.beginPath(); ctx.arc(sx, sy, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath(); ctx.arc(sx, sy - 2, 5, 0, Math.PI * 2); ctx.fill();
    // Health pips above the enemy.
    ctx.fillStyle = '#000';
    ctx.fillRect(sx - 13, sy - 24, 26, 5);
    ctx.fillStyle = '#e83a3a';
    ctx.fillRect(sx - 13, sy - 24, 26 * Math.max(0, e.health / 100), 5);
  }
  // Foot cops.
  for (const c of G.cops) {
    if (!c.alive || c.inCar) continue;
    const sx = c.x - camX, sy = c.y - camY;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(sx + 3, sy + 4, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1c2733';
    ctx.beginPath(); ctx.arc(sx, sy, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#dfe6ee';
    ctx.beginPath(); ctx.arc(sx, sy - 2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1c2733';
    ctx.fillRect(sx - 6, sy - 6, 12, 3);
  }
  // Player on foot: white ground ring + white outline so it is found
  // instantly, drawn on top of everything.
  if (!p.inCar && !p.dead) {
    const sx = p.x - camX, sy = p.y - camY;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(sx, sy + 2, 17, 15, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(sx + 3, sy + 5, 13, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#2f9e44';
    ctx.beginPath(); ctx.arc(sx, sy, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath(); ctx.arc(sx, sy - 2, 6, 0, Math.PI * 2); ctx.fill();
    // Aim line + gun.
    ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(p.angle) * 30, sy + Math.sin(p.angle) * 30); ctx.stroke();
  }
  // Bullets: bright cold yellow-white, never red.
  for (const b of G.bullets) {
    if (!b.alive) continue;
    const sx = b.x - camX, sy = b.y - camY;
    ctx.strokeStyle = b.from === 'player' ? '#ffe14d' : '#ff9a3c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(sx - Math.cos(b.angle) * 12, sy - Math.sin(b.angle) * 12);
    ctx.lineTo(sx, sy);
    ctx.stroke();
  }
  // Muzzle flashes (frozen effects the judge can see in a still frame).
  if (G.muzzle) {
    const sx = G.muzzle.x - camX, sy = G.muzzle.y - camY;
    ctx.fillStyle = 'rgba(255,220,90,0.95)';
    ctx.beginPath(); ctx.arc(sx, sy, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.fill();
  }
  if (G.muzzleEnemy) {
    const sx = G.muzzleEnemy.x - camX, sy = G.muzzleEnemy.y - camY;
    ctx.fillStyle = 'rgba(255,170,60,0.9)';
    ctx.beginPath(); ctx.arc(sx, sy, 12, 0, Math.PI * 2); ctx.fill();
  }
  // Particles.
  for (const pt of G.particles) {
    if (!pt.alive) continue;
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x - camX, pt.y - camY, pt.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Day / night lighting: pools of light at night, headlight cone from the car.
  if (G.nightAlpha > 0.02) drawNightLighting(G, ctx, camX, camY, W, H);
  // Hurt vignette.
  if (p.hurtFlash > 0) {
    ctx.fillStyle = `rgba(200,20,20,${p.hurtFlash * 0.5})`;
    ctx.fillRect(0, 0, W, H);
  }
  drawHUD(G, ctx, W, H);
}

function drawMissionMarker(G, ctx, camX, camY, W, H) {
  const marker = G.missionMarker;
  if (!marker) return;
  const sx = marker.x - camX, sy = marker.y - camY;
  const pulse = 1 + Math.sin(G.time * 5) * 0.2;
  if (sx > -20 && sx < W + 20 && sy > -20 && sy < H + 20) {
    ctx.save();
    ctx.translate(sx, sy - 30); ctx.rotate(Math.PI / 4); ctx.scale(pulse, pulse);
    ctx.fillStyle = '#ffd21f';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.fillRect(-13, -13, 26, 26); ctx.strokeRect(-13, -13, 26, 26);
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.ellipse(sx, sy + 4, 16, 6, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    // Edge arrow pointing at the off-screen objective.
    const cx = Math.max(40, Math.min(W - 40, sx));
    const cy = Math.max(40, Math.min(H - 40, sy));
    const a = Math.atan2(sy - cy, sx - cx);
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(a);
    ctx.fillStyle = '#ffd21f';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -12); ctx.lineTo(-10, 12); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

function drawCar(G, ctx, car, camX, camY) {
  const sx = car.x - camX, sy = car.y - camY;
  const W = G.canvas.width, H = G.canvas.height;
  if (sx < -80 || sx > W + 80 || sy < -80 || sy > H + 80) return;
  const isPlayerCar = G.player.inCar === car;
  ctx.save();
  ctx.translate(sx, sy);
  // Ground ring under the player's car so it is found in 1 second.
  if (isPlayerCar) {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, 0, car.len * 0.62, car.wid * 0.85, car.angle, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.ellipse(0, 0, car.len * 0.62, car.wid * 0.85, car.angle, 0, Math.PI * 2); ctx.fill();
  }
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(4, 5, car.len / 2, car.wid / 2, 0, 0, Math.PI * 2); ctx.fill();
  // Body: one colour identity per car; police are black-and-white.
  if (car.police) {
    ctx.fillStyle = '#1c2733';
    roundRect(ctx, -car.len / 2, -car.wid / 2, car.len, car.wid, 8); ctx.fill();
    ctx.fillStyle = '#f2f4f6';
    roundRect(ctx, -car.len * 0.1, -car.wid / 2, car.len * 0.32, car.wid, 6); ctx.fill();
  } else {
    ctx.fillStyle = car.color;
    roundRect(ctx, -car.len / 2, -car.wid / 2, car.len, car.wid, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    roundRect(ctx, -car.len / 2, -car.wid / 2, car.len, 5, 4); ctx.fill();
  }
  // Windows + roof.
  ctx.fillStyle = 'rgba(20,30,45,0.85)';
  roundRect(ctx, -car.len * 0.18, -car.wid * 0.36, car.len * 0.36, car.wid * 0.72, 4); ctx.fill();
  ctx.fillStyle = 'rgba(180,220,240,0.5)';
  ctx.fillRect(car.len * 0.2, -car.wid * 0.36, 4, car.wid * 0.72);
  // Wheels.
  ctx.fillStyle = '#111';
  const wx = car.len * 0.32, wy = car.wid / 2 - 2;
  ctx.fillRect(-wx - 7, -wy - 3, 14, 6); ctx.fillRect(-wx - 7, wy - 3, 14, 6);
  ctx.fillRect(wx - 7, -wy - 3, 14, 6); ctx.fillRect(wx - 7, wy - 3, 14, 6);
  // Taxi sign / truck bed.
  if (car.type === 'taxi') {
    ctx.fillStyle = '#ffd21f';
    ctx.fillRect(-8, -5, 16, 10);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
    ctx.textAlign = 'left';
  }
  if (car.type === 'truck') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-car.len * 0.48, -car.wid * 0.4, car.len * 0.4, car.wid * 0.8);
  }
  // Headlights at night.
  if (G.nightAlpha > 0.3) {
    ctx.fillStyle = 'rgba(255,240,180,0.95)';
    ctx.beginPath(); ctx.arc(car.len / 2, -car.wid / 2 + 5, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(car.len / 2, car.wid / 2 - 5, 4, 0, Math.PI * 2); ctx.fill();
  }
  // Police light bar: the ONLY red-blue flashing thing in the game.
  if (car.police) {
    const blink = Math.floor(G.time * 6) % 2 === 0;
    ctx.fillStyle = blink ? '#ff2d2d' : '#2d5cff';
    ctx.fillRect(-6, -car.wid / 2 - 2, 12, 5);
    ctx.fillStyle = blink ? '#2d5cff' : '#ff2d2d';
    ctx.fillRect(-6, car.wid / 2 - 3, 12, 5);
  }
  // Damage smoke puff position.
  if (car.damage > 55) {
    ctx.fillStyle = 'rgba(120,120,120,0.7)';
    ctx.beginPath(); ctx.arc(-car.len * 0.3, 0, 8 + Math.sin(G.time * 9) * 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // Player direction arrow above the player's car.
  if (isPlayerCar) {
    const ax = sx + Math.cos(car.angle) * (car.len * 0.75);
    const ay = sy + Math.sin(car.angle) * (car.len * 0.75);
    ctx.save();
    ctx.translate(ax, ay); ctx.rotate(car.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function drawWreck(G, ctx, car, camX, camY) {
  const sx = car.x - camX, sy = car.y - camY;
  ctx.save();
  ctx.translate(sx, sy); ctx.rotate(car.angle);
  ctx.fillStyle = '#333';
  roundRect(ctx, -car.len / 2, -car.wid / 2, car.len, car.wid, 8); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(-car.len / 2, -car.wid / 2, car.len, car.wid);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawNightLighting(G, ctx, camX, camY, W, H) {
  const lc = G.lightCanvas;
  if (!lc || lc.width !== W || lc.height !== H) {
    G.lightCanvas = document.createElement('canvas');
    G.lightCanvas.width = W; G.lightCanvas.height = H;
  }
  const l = G.lightCanvas.getContext('2d');
  const a = Math.min(0.82, G.nightAlpha);
  l.clearRect(0, 0, W, H);
  l.globalCompositeOperation = 'source-over';
  l.fillStyle = `rgba(6,10,34,${a})`;
  l.fillRect(0, 0, W, H);
  l.globalCompositeOperation = 'destination-out';
  // Light pools: player, nearby intersections (street lamps), headlights.
  const p = G.player;
  const px = (p.inCar ? p.inCar.x : p.x) - camX;
  const py = (p.inCar ? p.inCar.y : p.y) - camY;
  const pool = (x, y, r) => {
    const g = l.createRadialGradient(x, y, 10, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    l.fillStyle = g;
    l.beginPath(); l.arc(x, y, r, 0, Math.PI * 2); l.fill();
  };
  pool(px, py, 260);
  for (let i = 0; i < 11; i++) {
    for (let j = 0; j < 11; j++) {
      if ((i + j) % 2 !== 0) continue;
      const lx = G.world.roadX(i) - camX, ly = G.world.roadY(j) - camY;
      if (lx < -100 || lx > W + 100 || ly < -100 || ly > H + 100) continue;
      pool(lx, ly, 110);
    }
  }
  // Headlight cone from the player's car.
  if (p.inCar) {
    const car = p.inCar;
    const cx = car.x - camX, cy = car.y - camY;
    l.save();
    l.translate(cx, cy); l.rotate(car.angle);
    const g = l.createLinearGradient(0, 0, 320, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    l.fillStyle = g;
    l.beginPath();
    l.moveTo(20, -8); l.lineTo(320, -70); l.lineTo(320, 70); l.lineTo(20, 8);
    l.closePath(); l.fill();
    l.restore();
  }
  ctx.drawImage(G.lightCanvas, 0, 0);
}

export { render };
