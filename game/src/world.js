// Crescent Bay — the city itself: roads, districts, buildings, the
// junction graph and the BFS route finder. Deterministic from the seed.
// Roads sit at 200 + i*400 (i 0..7), 64 wide; junctions are the 8x8 grid
// points. Buildings live inside blocks, never on a road.
import { ROAD_COUNT, ROAD_SPACING, ROAD_START, WORLD_SIZE, DISTRICT_COLORS } from './config.js';
import { makeRng, clamp } from './random.js';

export const roads = [];
for (let i = 0; i < ROAD_COUNT; i++) roads.push(ROAD_START + i * ROAD_SPACING);

export let buildings = [];
export let staticLayer = null; // offscreen canvas, drawn once

export function districtAt(x, y) {
  if (x > 2900) return 'waterfront';
  if (y > 2400) return 'docks';
  if (x > 1600 && y > 1000 && y < 2400) return 'downtown';
  if (y < 1100) return 'north';
  return 'oldtown';
}

export function roadCoord(i) { return roads[i]; }
export function junction(i, j) { return { x: roads[i], y: roads[j] }; }
export function junctionIndex(i, j) { return j * ROAD_COUNT + i; } // row-major, consistent everywhere

export function nearestJunction(x, y) {
  let bi = 0, bj = 0, best = Infinity;
  for (let i = 0; i < ROAD_COUNT; i++) {
    for (let j = 0; j < ROAD_COUNT; j++) {
      const d = (roads[i] - x) ** 2 + (roads[j] - y) ** 2;
      if (d < best) { best = d; bi = i; bj = j; }
    }
  }
  return { i: bi, j: bj, x: roads[bi], y: roads[bj] };
}

// Nearest point on any road centreline (used for on-foot walk legs and
// off-road recovery). Never returns a point outside the world.
export function nearestRoadPoint(x, y) {
  let best = null, bestD = Infinity;
  for (const rx of roads) {
    const px = clamp(x, 0, WORLD_SIZE), py = clamp(y, 0, WORLD_SIZE);
    const cx = rx, cy = clamp(y, 0, WORLD_SIZE);
    const d = (cx - x) ** 2 + (cy - y) ** 2;
    if (d < bestD) { bestD = d; best = { x: cx, y: cy }; }
    const cx2 = clamp(x, 0, WORLD_SIZE), cy2 = rx;
    const d2 = (cx2 - x) ** 2 + (cy2 - y) ** 2;
    if (d2 < bestD) { bestD = d2; best = { x: cx2, y: cy2 }; }
  }
  return best;
}

export function onRoad(x, y, tol) {
  for (const r of roads) {
    if (Math.abs(x - r) <= tol || Math.abs(y - r) <= tol) return true;
  }
  return false;
}

// BFS over the junction graph. Returns waypoints INCLUDING the first
// junction (never cut diagonally across a block to the second one).
export function findRoute(fx, fy, tx, ty) {
  const from = nearestJunction(fx, fy);
  const to = nearestJunction(tx, ty);
  const start = junctionIndex(from.i, from.j);
  const goal = junctionIndex(to.i, to.j);
  const parent = new Array(ROAD_COUNT * ROAD_COUNT).fill(-1);
  const seen = new Array(ROAD_COUNT * ROAD_COUNT).fill(false);
  const queue = [start];
  seen[start] = true;
  while (queue.length) {
    const cur = queue.shift();
    if (cur === goal) break;
    const ci = cur % ROAD_COUNT, cj = Math.floor(cur / ROAD_COUNT);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || ni >= ROAD_COUNT || nj < 0 || nj >= ROAD_COUNT) continue;
      const n = junctionIndex(ni, nj);
      if (seen[n]) continue;
      seen[n] = true;
      parent[n] = cur;
      queue.push(n);
    }
  }
  if (!seen[goal]) return [{ x: roads[to.i], y: roads[to.j] }];
  const path = [];
  let cur = goal;
  while (cur !== -1) {
    path.unshift(cur);
    cur = parent[cur];
  }
  const pts = path.map((idx) => {
    const i = idx % ROAD_COUNT, j = Math.floor(idx / ROAD_COUNT);
    return { x: roads[i], y: roads[j] };
  });
  pts.push({ x: tx, y: ty });
  return pts;
}

export function generateWorld(seed) {
  const rng = makeRng(seed);
  buildings = [];
  const palette = {
    north: ['#c9a37e', '#b98d6d', '#d8b48f', '#a98a6a'],
    oldtown: ['#a5654f', '#8f5a44', '#b5714f', '#7d4f3d'],
    downtown: ['#6f7f9e', '#7d8aa8', '#5d6d8c', '#8b9bbd'],
    waterfront: ['#d8c08a', '#c9b078', '#e2cf9e'],
    docks: ['#7a7a72', '#8a8578', '#6b6b63'],
  };
  for (let bx = 0; bx < ROAD_COUNT - 1; bx++) {
    for (let by = 0; by < ROAD_COUNT - 1; by++) {
      const x0 = roads[bx] + 52, x1 = roads[bx + 1] - 52;
      const y0 = roads[by] + 52, y1 = roads[by + 1] - 52;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      // Beach / water on the east edge: no buildings past x 3060.
      if (cx > 3000) continue;
      const d = districtAt(cx, cy);
      const n = rng.chance(0.35) ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const w = rng.range(110, 200), h = rng.range(100, 180);
        const ox = n === 1 ? cx : cx + (k === 0 ? -80 : 80);
        const oy = n === 1 ? cy : cy + (k === 0 ? -70 : 70);
        buildings.push({
          x: ox - w / 2, y: oy - h / 2, w, h,
          color: rng.pick(palette[d]), district: d,
          hgt: d === 'downtown' ? rng.range(26, 46) : rng.range(10, 20),
        });
      }
    }
  }
  buildStaticLayer();
}

// Circle vs building rects: push the circle out, return the rect hit.
export function collideBuildings(x, y, r) {
  for (const b of buildings) {
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    const dx = x - nx, dy = y - ny;
    if (dx * dx + dy * dy < r * r) return b;
  }
  return null;
}

export function resolveCircle(pos, r) {
  const b = collideBuildings(pos.x, pos.y, r);
  if (!b) return null;
  const nx = clamp(pos.x, b.x, b.x + b.w);
  const ny = clamp(pos.y, b.y, b.y + b.h);
  let dx = pos.x - nx, dy = pos.y - ny;
  const d = Math.hypot(dx, dy) || 0.001;
  if (d < 0.001) { dx = 0; dy = -1; }
  else { dx /= d; dy /= d; }
  pos.x = nx + dx * r;
  pos.y = ny + dy * r;
  return b;
}

// Pre-rendered static layer (1600x1600 offscreen, drawn once) so the
// frame loop only draws dynamic entities. Full-city repaint every frame
// stalls software rendering.
export function buildStaticLayer() {
  const c = document.createElement('canvas');
  c.width = 1600; c.height = 1600;
  const g = c.getContext('2d');
  const s = 0.5; // world 3200 -> 1600
  g.fillStyle = '#5d7a52';
  g.fillRect(0, 0, 1600, 1600);
  // District ground.
  for (let bx = 0; bx < ROAD_COUNT - 1; bx++) {
    for (let by = 0; by < ROAD_COUNT - 1; by++) {
      const x0 = roads[bx] * s, y0 = roads[by] * s;
      const w = ROAD_SPACING * s, h = ROAD_SPACING * s;
      const d = districtAt((x0 + w / 2) / s, (y0 + h / 2) / s);
      g.fillStyle = DISTRICT_COLORS[d];
      g.fillRect(x0, y0, w, h);
    }
  }
  // Water + beach on the east edge.
  g.fillStyle = '#2f6fb2';
  g.fillRect(3060 * s, 0, (WORLD_SIZE - 3060) * s, 1600);
  g.fillStyle = '#e8d9a0';
  g.fillRect(2980 * s, 0, 80 * s, 1600);
  // Roads.
  g.fillStyle = '#3a3a40';
  for (const r of roads) {
    g.fillRect((r - 32) * s, 0, 64 * s, 1600);
    g.fillRect(0, (r - 32) * s, 1600, 64 * s);
  }
  // Lane dashes.
  g.fillStyle = '#c9c9a0';
  for (const r of roads) {
    for (let t = 0; t < WORLD_SIZE; t += 80) {
      g.fillRect((r - 2) * s, t * s, 4 * s, 34 * s);
      g.fillRect(t * s, (r - 2) * s, 34 * s, 4 * s);
    }
  }
  // Buildings, 2.5D: darker south/east sides, roof, blue-purple shadow
  // to the south-east (sun from the north-west).
  for (const b of buildings) {
    const x = b.x * s, y = b.y * s, w = b.w * s, h = b.h * s, hg = b.hgt * s;
    g.fillStyle = 'rgba(60,60,120,0.28)';
    g.fillRect(x + 8 * s, y + 10 * s, w, h);
    g.fillStyle = '#00000033';
    g.fillRect(x, y + h - hg * 0.4, w, hg * 0.4);
    g.fillStyle = b.color;
    g.fillRect(x, y, w, h - hg * 0.25);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fillRect(x, y, w, 4 * s);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.strokeRect(x, y, w, h);
  }
  // Marina / pier on the east edge.
  g.fillStyle = '#6b4f2e';
  g.fillRect(2960 * s, 1400 * s, 120 * s, 14 * s);
  g.fillStyle = '#8a6a3e';
  g.fillRect(2960 * s, 1560 * s, 120 * s, 14 * s);
  staticLayer = c;
}

export function drawStatic(g, camX, camY, viewW, viewH) {
  if (!staticLayer) return;
  // Static layer is 1600x1600 for a 3200 world: scale 0.5.
  g.drawImage(staticLayer, camX * 0.5, camY * 0.5, viewW * 0.5, viewH * 0.5, 0, 0, viewW, viewH);
}
