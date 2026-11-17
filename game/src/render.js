import { GRID_LINES, ROAD_HALF, REPAINT_GARAGE } from './config.js';

// Camera, 2.5D extruded buildings, day/night lighting, particles and skid
// marks. One sun direction everywhere: from the north-west, so shadows
// fall to the south-east and are hue-shifted cold, never just black.
export function createCamera() {
  return { x: 0, y: 0, zoom: 1 };
}

export function renderWorld(state, ctx, view) {
  const cam = state.camera;
  const w = view.w; const h = view.h;
  const focusX = state.playerCar ? state.playerCar.x : state.player.x;
  const focusY = state.playerCar ? state.playerCar.y : state.player.y;
  cam.x += (focusX - cam.x) * 0.12;
  cam.y += (focusY - cam.y) * 0.12;
  const scale = cam.zoom;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.translate(w / 2 - cam.x * scale, h / 2 - cam.y * scale);
  ctx.scale(scale, scale);

  const vx0 = cam.x - w / 2 - 80; const vx1 = cam.x + w / 2 + 80;
  const vy0 = cam.y - h / 2 - 80; const vy1 = cam.y + h / 2 + 80;

  drawGround(state, ctx, vx0, vx1, vy0, vy1);
  drawRoads(state, ctx, vx0, vx1, vy0, vy1);
  drawParks(state, ctx, vx0, vx1, vy0, vy1);
  drawGarage(state, ctx);
  drawMissionMarker(state, ctx);
  drawPickups(state, ctx);
  drawSkids(state, ctx);
  drawPeds(state, ctx, vx0, vx1, vy0, vy1);
  drawCars(state, ctx, vx0, vx1, vy0, vy1);
  drawEnemies(state, ctx);
  drawCops(state, ctx);
  drawPlayer(state, ctx);
  drawBullets(state, ctx);
  drawParticles(state, ctx);
  ctx.restore();

  applyLighting(state, ctx, w, h);
}

function drawGround(state, ctx, vx0, vx1, vy0, vy1) {
  // Grass base.
  ctx.fillStyle = '#7fae62';
  ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  // Beach sand, then open water to the west.
  ctx.fillStyle = '#e8d5a0';
  ctx.fillRect(state.world.waterX, vy0, state.world.beachX - state.world.waterX, vy1 - vy0);
  ctx.fillStyle = '#2f7fc9';
  ctx.fillRect(vx0, vy0, state.world.waterX - vx0, vy1 - vy0);
  // Water shimmer lines.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  for (let y = Math.floor(vy0 / 90) * 90; y < vy1; y += 90) {
    ctx.beginPath();
    ctx.moveTo(state.world.waterX - 260, y + Math.sin(state.time * 0.8 + y) * 6);
    ctx.lineTo(state.world.waterX - 40, y + Math.sin(state.time * 0.8 + y) * 6);
    ctx.stroke();
  }
}

function drawRoads(state, ctx, vx0, vx1, vy0, vy1) {
  ctx.fillStyle = '#5d5a55';
  for (const gx of GRID_LINES) {
    if (gx > vx0 - 80 && gx < vx1 + 80) ctx.fillRect(gx - ROAD_HALF, -1260, ROAD_HALF * 2, 2520);
    if (gx > vy0 - 80 && gx < vy1 + 80) ctx.fillRect(-1260, gx - ROAD_HALF, 2520, ROAD_HALF * 2);
  }
  // Sidewalks: lighter strips along each road.
  ctx.fillStyle = '#b8b2a4';
  for (const gx of GRID_LINES) {
    if (gx > vx0 - 90 && gx < vx1 + 90) {
      ctx.fillRect(gx - ROAD_HALF - 16, -1260, 16, 2520);
      ctx.fillRect(gx + ROAD_HALF, -1260, 16, 2520);
    }
    if (gx > vy0 - 90 && gx < vy1 + 90) {
      ctx.fillRect(-1260, gx - ROAD_HALF - 16, 2520, 16);
      ctx.fillRect(-1260, gx + ROAD_HALF, 2520, 16);
    }
  }
  // Centre dashes.
  ctx.strokeStyle = '#f2d54b';
  ctx.lineWidth = 4;
  ctx.setLineDash([26, 30]);
  for (const gx of GRID_LINES) {
    if (gx > vx0 - 80 && gx < vx1 + 80) {
      ctx.beginPath(); ctx.moveTo(gx, -1260); ctx.lineTo(gx, 1260); ctx.stroke();
    }
    if (gx > vy0 - 80 && gx < vy1 + 80) {
      ctx.beginPath(); ctx.moveTo(-1260, gx); ctx.lineTo(1260, gx); ctx.stroke();
    }
  }
  ctx.setLineDash([]);
}

function drawParks(state, ctx, vx0, vx1, vy0, vy1) {
  for (const park of state.world.parks) {
    if (park.x < vx0 - 200 || park.x > vx1 + 200 || park.y < vy0 - 200 || park.y > vy1 + 200) continue;
    ctx.fillStyle = '#5da24e';
    ctx.fillRect(park.x - 170, park.y - 170, 340, 340);
    ctx.fillStyle = '#3f7d33';
    for (let i = 0; i < 5; i++) {
      const tx = park.x - 120 + ((i * 53) % 240);
      const ty = park.y - 110 + ((i * 97) % 220);
      ctx.beginPath(); ctx.arc(tx, ty, 22, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#8a6f4d';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(park.x - 170, park.y); ctx.lineTo(park.x + 170, park.y); ctx.stroke();
  }
}

function drawGarage(state, ctx) {
  const g = REPAINT_GARAGE;
  ctx.fillStyle = '#3a3f4a';
  ctx.fillRect(g.x - g.w / 2, g.y - g.h / 2, g.w, g.h);
  ctx.strokeStyle = '#ffd94d';
  ctx.lineWidth = 4;
  ctx.strokeRect(g.x - g.w / 2, g.y - g.h / 2, g.w, g.h);
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SPRAY SHOP', g.x, g.y + 6);
}

function drawMissionMarker(state, ctx) {
  const marker = state.mission
    ? state.mission.def.targets[state.mission.targetIndex]
    : state.missionMarker;
  if (!marker) return;
  const pulse = 1 + Math.sin(state.time * 4) * 0.12;
  ctx.save();
  ctx.translate(marker.x, marker.y);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = 'rgba(255,217,77,0.25)';
  ctx.beginPath(); ctx.arc(0, 0, 64, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffd94d';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(0, 0, 52, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffd94d';
  ctx.beginPath();
  ctx.moveTo(0, -18); ctx.lineTo(16, 0); ctx.lineTo(0, 18); ctx.lineTo(-16, 0);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawPickups(state, ctx) {
  for (const pk of state.pickups) {
    ctx.save();
    ctx.translate(pk.x, pk.y);
    ctx.fillStyle = pk.kind === 'health' ? '#37d67a' : '#ffd94d';
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#10240f';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pk.kind === 'health' ? '+' : 'A', 0, 6);
    ctx.restore();
  }
}

function drawSkids(state, ctx) {
  ctx.strokeStyle = 'rgba(20,18,16,0.55)';
  ctx.lineWidth = 5;
  for (const s of state.skids) {
    ctx.beginPath();
    ctx.moveTo(s.x - Math.cos(s.angle) * 26, s.y - Math.sin(s.angle) * 26);
    ctx.lineTo(s.x + Math.cos(s.angle) * 26, s.y + Math.sin(s.angle) * 26);
    ctx.stroke();
  }
}

function drawBuildings(state, ctx, vx0, vx1, vy0, vy1) {
  for (const b of state.world.buildings) {
    if (b.x < vx0 - 200 || b.x > vx1 + 200 || b.y < vy0 - 200 || b.y > vy1 + 200) continue;
    const h = b.h;
    const sx = 14 + h * 4; const sy = 10 + h * 3;
    // Fallen shadow, south-east, cold hue.
    ctx.fillStyle = 'rgba(40,50,90,0.30)';
    ctx.fillRect(b.x - b.w / 2 + sx, b.y - b.d / 2 + sy, b.w, b.d);
    // South + east faces, darker.
    ctx.fillStyle = shade(b.color, -34);
    ctx.fillRect(b.x - b.w / 2, b.y + b.d / 2 - 4, b.w, 12 + h * 2);
    ctx.fillRect(b.x + b.w / 2 - 4, b.y - b.d / 2, 12 + h * 2, b.d);
    // Roof.
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x - b.w / 2, b.y - b.d / 2, b.w, b.d);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x - b.w / 2, b.y - b.d / 2, b.w, b.d);
    // Windows on the roof face.
    ctx.fillStyle = 'rgba(20,30,50,0.55)';
    const cols = Math.max(2, Math.floor(b.w / 34));
    const rows = Math.max(2, Math.floor(b.d / 34));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        ctx.fillRect(b.x - b.w / 2 + 12 + i * ((b.w - 24) / cols), b.y - b.d / 2 + 12 + j * ((b.d - 24) / rows), 12, 10);
      }
    }
    // Warm highlight on the north-west edge.
    ctx.fillStyle = 'rgba(255,240,200,0.35)';
    ctx.fillRect(b.x - b.w / 2, b.y - b.d / 2, b.w, 5);
    ctx.fillRect(b.x - b.w / 2, b.y - b.d / 2, 5, b.d);
    if (b.neon) {
      ctx.fillStyle = b.neonColor;
      ctx.fillRect(b.x - b.w / 2, b.y + b.d / 2 - 2, b.w, 7);
    }
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function drawCars(state, ctx, vx0, vx1, vy0, vy1) {
  const cars = state.cars.slice().sort((a, b) => a.y - b.y);
  for (const car of cars) {
    if (car.x < vx0 - 120 || car.x > vx1 + 120 || car.y < vy0 - 120 || car.y > vy1 + 120) continue;
    drawOneCar(state, ctx, car, car === state.playerCar);
  }
  // Buildings are drawn after cars so their extruded faces overlap correctly
  // at the south edge; cars in front of a building still read clearly.
  drawBuildings(state, ctx, vx0, vx1, vy0, vy1);
}

function drawOneCar(state, ctx, car, isPlayer) {
  ctx.save();
  ctx.translate(car.x, car.y);
  if (isPlayer) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, 0, car.length * 0.72, car.width * 0.85, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#ffd94d';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, car.length * 0.62, car.width * 0.72, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(30,40,80,0.30)';
  ctx.fillRect(-car.length / 2 + 8, -car.width / 2 + 8, car.length, car.width);
  // Wheels.
  ctx.fillStyle = '#14161a';
  const wl = car.length * 0.32; const ww = 8;
  ctx.fillRect(-wl, -car.width / 2 - 3, 20, ww);
  ctx.fillRect(-wl, car.width / 2 - 5, 20, ww);
  ctx.fillRect(wl - 8, -car.width / 2 - 3, 20, ww);
  ctx.fillRect(wl - 8, car.width / 2 - 5, 20, ww);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -car.length / 2, -car.width / 2, car.length, car.width, 9);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Cabin + windshield.
  ctx.fillStyle = 'rgba(20,28,44,0.85)';
  roundRect(ctx, -car.length * 0.18, -car.width * 0.36, car.length * 0.34, car.width * 0.72, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(140,190,230,0.5)';
  ctx.fillRect(car.length * 0.16, -car.width * 0.36, 6, car.width * 0.72);
  // Headlights at night.
  if (isNight(state)) {
    ctx.fillStyle = 'rgba(255,244,180,0.9)';
    ctx.beginPath(); ctx.arc(car.length / 2, -car.width / 2 + 6, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(car.length / 2, car.width / 2 - 6, 4, 0, Math.PI * 2); ctx.fill();
    const grad = ctx.createRadialGradient(car.length / 2 + 90, 0, 8, car.length / 2 + 90, 0, 130);
    grad.addColorStop(0, 'rgba(255,244,180,0.28)');
    grad.addColorStop(1, 'rgba(255,244,180,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.ellipse(car.length / 2 + 90, 0, 130, 55, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Police light bar — the ONLY red/blue flashing in the game.
  if (car.type === 'police') {
    const phase = Math.floor(state.time * 6 + car.sirenPhase) % 2;
    ctx.fillStyle = phase === 0 ? '#ff2e2e' : '#2e6bff';
    ctx.fillRect(-8, -car.width / 2 + 2, 16, 10);
    ctx.fillStyle = phase === 0 ? '#2e6bff' : '#ff2e2e';
    ctx.fillRect(-8, car.width / 2 - 12, 16, 10);
  }
  // Player direction arrow.
  if (isPlayer) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(car.length / 2 + 16, 0);
    ctx.lineTo(car.length / 2 + 2, -8);
    ctx.lineTo(car.length / 2 + 2, 8);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawPeds(state, ctx, vx0, vx1, vy0, vy1) {
  for (const ped of state.peds) {
    if (ped.x < vx0 || ped.x > vx1 || ped.y < vy0 || ped.y > vy1) continue;
    const bob = Math.sin(ped.bob) * 2;
    ctx.fillStyle = 'rgba(30,40,80,0.25)';
    ctx.beginPath(); ctx.ellipse(ped.x + 4, ped.y + 5, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath(); ctx.arc(ped.x, ped.y + bob, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath(); ctx.arc(ped.x, ped.y + bob - 4, 5, 0, Math.PI * 2); ctx.fill();
    if (ped.fleeing) {
      ctx.strokeStyle = '#ff5a2e';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ped.x - 12, ped.y - 16); ctx.lineTo(ped.x + 12, ped.y - 16); ctx.stroke();
    }
  }
}

function drawEnemies(state, ctx) {
  for (const e of state.enemies) {
    if (e.health <= 0) continue;
    ctx.fillStyle = 'rgba(30,40,80,0.25)';
    ctx.beginPath(); ctx.ellipse(e.x + 4, e.y + 6, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a1f1f';
    ctx.beginPath(); ctx.arc(e.x, e.y, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ff2e2e'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath(); ctx.arc(e.x, e.y - 4, 5, 0, Math.PI * 2); ctx.fill();
    // Health bar.
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(e.x - 16, e.y - 26, 32, 6);
    ctx.fillStyle = '#ff5a4e';
    ctx.fillRect(e.x - 16, e.y - 26, 32 * (e.health / 50), 6);
  }
}

function drawCops(state, ctx) {
  for (const cop of state.cops) {
    ctx.fillStyle = 'rgba(30,40,80,0.25)';
    ctx.beginPath(); ctx.ellipse(cop.x + 4, cop.y + 6, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1d2f55';
    ctx.beginPath(); ctx.arc(cop.x, cop.y, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath(); ctx.arc(cop.x, cop.y - 4, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1d2f55';
    ctx.fillRect(cop.x - 7, cop.y - 12, 14, 5);
  }
}

function drawPlayer(state, ctx) {
  const p = state.player;
  if (state.playerCar || p.health <= 0) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(30,40,80,0.25)';
  ctx.beginPath(); ctx.ellipse(4, 6, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
  // White outline so Rook is findable in the busiest frame.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#e8b400';
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2c89b';
  ctx.beginPath(); ctx.arc(0, -4, 5, 0, Math.PI * 2); ctx.fill();
  // Pistol direction.
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(Math.cos(p.aimAngle) * 10, Math.sin(p.aimAngle) * 10);
  ctx.lineTo(Math.cos(p.aimAngle) * 24, Math.sin(p.aimAngle) * 24);
  ctx.stroke();
  ctx.restore();
}

function drawBullets(state, ctx) {
  for (const b of state.bullets) {
    ctx.strokeStyle = b.owner === 'player' ? '#fff3b0' : '#ff8a5a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawParticles(state, ctx) {
  for (const pt of state.particles) {
    const a = Math.max(0, pt.life / pt.maxLife);
    if (pt.kind === 'smoke') {
      ctx.fillStyle = 'rgba(120,120,120,' + (a * 0.55) + ')';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * (1.6 - a * 0.6), 0, Math.PI * 2); ctx.fill();
    } else if (pt.kind === 'flash') {
      ctx.fillStyle = 'rgba(255,243,176,' + a + ')';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * a + 4, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * a, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

export function isNight(state) {
  const hour = state.timeOfDay % 24;
  return hour < 6 || hour >= 19;
}

function applyLighting(state, ctx, w, h) {
  const hour = state.timeOfDay % 24;
  let dark = 0;
  if (hour >= 19 || hour < 5) dark = 0.42;
  else if (hour >= 17) dark = 0.22;
  else if (hour < 6) dark = 0.3;
  if (dark <= 0) return;
  ctx.save();
  ctx.fillStyle = 'rgba(8,12,40,' + dark + ')';
  ctx.fillRect(0, 0, w, h);
  // Pools of street light along the roads at night.
  if (dark > 0.3) {
    ctx.globalCompositeOperation = 'lighter';
    const cam = state.camera;
    for (const gx of GRID_LINES) {
      for (const gy of GRID_LINES) {
        const sx = (gx - cam.x) + w / 2;
        const sy = (gy - cam.y) + h / 2;
        if (sx < -80 || sx > w + 80 || sy < -80 || sy > h + 80) continue;
        const grad = ctx.createRadialGradient(sx, sy, 6, sx, sy, 120);
        grad.addColorStop(0, 'rgba(255,220,130,0.20)');
        grad.addColorStop(1, 'rgba(255,220,130,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(sx, sy, 120, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
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
