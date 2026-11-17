import {
  ROAD_SPACING, ROAD_W, SIDEWALK_W, GRID_N, ROAD0, WORLD_W, WORLD_H,
  SAND_X0, WATER_X0,
} from './config.js';
import { makeRng } from './random.js';

// Build the deterministic city of Crescent Bay: road grid, extruded buildings,
// districts, parks, beach + water, road graph, landmarks and parked cars.
function buildWorld(seed) {
  const rng = makeRng(seed);
  const roadX = (i) => ROAD0 + i * ROAD_SPACING;
  const roadY = (j) => ROAD0 + j * ROAD_SPACING;
  const world = {
    seed, rng,
    roadX, roadY,
    buildings: [], parks: [], trees: [], parkedSpots: [],
    landmarks: {}, blockKind: {},
  };

  // Districts: downtown core (tall blue glass), suburbs (warm brick houses),
  // industrial south-west (grey warehouses), waterfront east (sand + low).
  const districtAt = (i, j) => {
    if (i >= 9) return 'waterfront';
    if (i >= 4 && i <= 6 && j >= 4 && j <= 6) return 'downtown';
    if (i <= 2 && j >= 8) return 'industrial';
    if (i >= 7 && j <= 2) return 'marina';
    return 'suburb';
  };

  const PALETTES = {
    downtown: ['#5d7ea6', '#6f8fb0', '#4e6d94', '#7d9bb8', '#5a6f8a'],
    suburb: ['#c98d5f', '#b97f52', '#d9a06b', '#a86f4a', '#c07a4e'],
    industrial: ['#8d8d84', '#7a7a72', '#9a938a', '#6f6f66'],
    waterfront: ['#d9b380', '#cfa878', '#e0c090', '#c49a68'],
    marina: ['#7fa3b8', '#8fb0c2', '#6d93a8'],
  };

  // One block = the square between four roads. Fill it with buildings, a park,
  // a parking lot or a plaza. Buildings keep a margin from the sidewalk.
  const inset = ROAD_W / 2 + SIDEWALK_W + 6;
  for (let i = 0; i < GRID_N - 1; i++) {
    for (let j = 0; j < GRID_N - 1; j++) {
      const x0 = roadX(i) + inset, y0 = roadY(j) + inset;
      const x1 = roadX(i + 1) - inset, y1 = roadY(j + 1) - inset;
      const d = districtAt(i, j);
      const roll = rng.next();
      let kind = 'buildings';
      if (roll < 0.10) kind = 'park';
      else if (roll < 0.17) kind = 'parking';
      else if (roll < 0.21) kind = 'plaza';
      world.blockKind[`${i},${j}`] = kind;
      if (kind === 'park') {
        world.parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        const nTrees = rng.int(4, 8);
        for (let t = 0; t < nTrees; t++) {
          world.trees.push({ x: rng.range(x0 + 14, x1 - 14), y: rng.range(y0 + 14, y1 - 14), r: rng.range(9, 15) });
        }
        continue;
      }
      if (kind === 'parking') {
        const n = rng.int(3, 6);
        for (let k = 0; k < n; k++) {
          world.parkedSpots.push({
            x: rng.range(x0 + 20, x1 - 20), y: rng.range(y0 + 20, y1 - 20),
            angle: rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]),
            type: rng.pick(['sedan', 'sedan', 'taxi', 'truck', 'sports']),
          });
        }
        continue;
      }
      if (kind === 'plaza') continue;
      // Buildings: 1 big or 2 small, heights by district.
      const palette = PALETTES[d];
      const hMax = d === 'downtown' ? 34 : d === 'industrial' ? 14 : d === 'waterfront' ? 10 : 12;
      const hMin = d === 'downtown' ? 16 : 6;
      const bw = (x1 - x0), bh = (y1 - y0);
      if (rng.chance(0.45) && bw > 90 && bh > 90) {
        const w2 = bw * rng.range(0.38, 0.5), h2 = bh * rng.range(0.38, 0.5);
        world.buildings.push({ x: x0, y: y0, w: w2, h: h2, hgt: rng.range(hMin, hMax), color: rng.pick(palette), district: d });
        world.buildings.push({ x: x1 - w2, y: y1 - h2, w: w2, h: h2, hgt: rng.range(hMin, hMax), color: rng.pick(palette), district: d });
      } else {
        world.buildings.push({
          x: x0 + rng.range(0, bw * 0.2), y: y0 + rng.range(0, bh * 0.2),
          w: bw * rng.range(0.6, 0.85), h: bh * rng.range(0.6, 0.85),
          hgt: rng.range(hMin, hMax), color: rng.pick(palette), district: d,
        });
      }
    }
  }

  // Landmarks (fixed nodes so missions and the save always agree).
  const nodePos = (i, j) => ({ x: roadX(i), y: roadY(j) });
  world.landmarks = {
    fixerGarage: { ...nodePos(2, 5), name: "Vera's Garage" },
    docks: { x: SAND_X0 - 40, y: roadY(3), name: 'Crescent Docks' },
    bank: { ...nodePos(5, 5), name: 'Bay Trust Bank' },
    sprayShop: { ...nodePos(8, 8), name: 'Spray Shop' },
    hospital: { ...nodePos(3, 8), name: 'St. Marina Hospital' },
    policeStation: { ...nodePos(6, 2), name: 'Crescent Precinct' },
    marina: { x: SAND_X0 - 30, y: roadY(8), name: 'Marina Point' },
    plaza: { ...nodePos(5, 8), name: 'Crescent Plaza' },
  };

  // Roadside parked cars (stealable) along a few streets — never right by
  // the fixer garage, so the opening sports car is the obvious first car.
  const gx = world.landmarks.fixerGarage.x, gy = world.landmarks.fixerGarage.y;
  for (let k = 0; k < 14; k++) {
    const i = rng.int(0, GRID_N - 1), j = rng.int(0, GRID_N - 1);
    const horizontal = rng.chance(0.5);
    const off = (rng.chance(0.5) ? 1 : -1) * (ROAD_W / 2 - 14);
    const sx = horizontal ? roadX(i) + rng.range(-90, 90) : roadX(i) + off;
    const sy = horizontal ? roadY(j) + off : roadY(j) + rng.range(-90, 90);
    if (Math.hypot(sx - gx, sy - gy) < 170) continue;
    world.parkedSpots.push({
      x: sx, y: sy,
      angle: horizontal ? (off > 0 ? 0 : Math.PI) : (off > 0 ? Math.PI / 2 : -Math.PI / 2),
      type: rng.pick(['sedan', 'sedan', 'taxi', 'sports', 'sedan', 'truck']),
    });
  }
  // The player's opening sports car, parked by the fixer garage.
  world.parkedSpots.push({ x: roadX(2) + 46, y: roadY(5) + 30, angle: Math.PI / 2, type: 'sports' });

  // Fast collision lookup: buildings bucketed by block.
  world.buildingBuckets = new Map();
  for (const b of world.buildings) {
    const bi = Math.max(0, Math.min(GRID_N - 2, Math.floor((b.x - ROAD0) / ROAD_SPACING)));
    const bj = Math.max(0, Math.min(GRID_N - 2, Math.floor((b.y - ROAD0) / ROAD_SPACING)));
    const key = `${bi},${bj}`;
    if (!world.buildingBuckets.has(key)) world.buildingBuckets.set(key, []);
    world.buildingBuckets.get(key).push(b);
  }
  world.cityCanvas = renderCityLayer(world);
  world.minimapCanvas = renderMinimapLayer(world);
  return world;
}

// Circle vs buildings + water + world bounds. Returns a corrected position.
function collideCircle(world, x, y, r) {
  let nx = x, ny = y;
  nx = Math.max(r, Math.min(WORLD_W - r, nx));
  ny = Math.max(r, Math.min(WORLD_H - r, ny));
  // Water is solid: the player cannot swim.
  if (nx > WATER_X0 - r) nx = WATER_X0 - r;
  const bi = Math.max(0, Math.min(GRID_N - 2, Math.floor((nx - ROAD0) / ROAD_SPACING)));
  const bj = Math.max(0, Math.min(GRID_N - 2, Math.floor((ny - ROAD0) / ROAD_SPACING)));
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const list = world.buildingBuckets.get(`${bi + di},${bj + dj}`);
      if (!list) continue;
      for (const b of list) {
        const cx = Math.max(b.x, Math.min(nx, b.x + b.w));
        const cy = Math.max(b.y, Math.min(ny, b.y + b.h));
        const dx = nx - cx, dy = ny - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r) {
          if (d2 > 0.01) {
            const d = Math.sqrt(d2);
            nx = cx + (dx / d) * r; ny = cy + (dy / d) * r;
          } else {
            ny = b.y - r; // pushed out the top; rare degenerate case
          }
        }
      }
    }
  }
  return { x: nx, y: ny, hit: nx !== x || ny !== y };
}

function pointInBuilding(world, x, y) {
  const bi = Math.max(0, Math.min(GRID_N - 2, Math.floor((x - ROAD0) / ROAD_SPACING)));
  const bj = Math.max(0, Math.min(GRID_N - 2, Math.floor((y - ROAD0) / ROAD_SPACING)));
  const list = world.buildingBuckets.get(`${bi},${bj}`) || [];
  return list.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
}

// Road graph: nodes are intersections, edges to the four neighbours.
function nearestNode(world, x, y) {
  const i = Math.max(0, Math.min(GRID_N - 1, Math.round((x - ROAD0) / ROAD_SPACING)));
  const j = Math.max(0, Math.min(GRID_N - 1, Math.round((y - ROAD0) / ROAD_SPACING)));
  return { i, j, id: j * GRID_N + i };
}

function nodePos(world, id) {
  const i = id % GRID_N, j = Math.floor(id / GRID_N);
  return { x: world.roadX(i), y: world.roadY(j), i, j };
}

function nodeNeighbours(id) {
  const i = id % GRID_N, j = Math.floor(id / GRID_N);
  const out = [];
  if (i > 0) out.push(id - 1);
  if (i < GRID_N - 1) out.push(id + 1);
  if (j > 0) out.push(id - GRID_N);
  if (j < GRID_N - 1) out.push(id + GRID_N);
  return out;
}

// Breadth-first path on the road graph (shortest in intersections).
function bfsPath(fromId, toId) {
  if (fromId === toId) return [fromId];
  const prev = new Map([[fromId, -1]]);
  const queue = [fromId];
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of nodeNeighbours(cur)) {
      if (prev.has(nb)) continue;
      prev.set(nb, cur);
      if (nb === toId) {
        const path = [toId];
        let p = cur;
        while (p !== -1) { path.unshift(p); p = prev.get(p); }
        return path;
      }
      queue.push(nb);
    }
  }
  return [fromId];
}

// Pre-render the whole static city once to an off-screen canvas (one blit/frame).
function renderCityLayer(world) {
  const c = document.createElement('canvas');
  c.width = WORLD_W; c.height = WORLD_H;
  const g = c.getContext('2d');
  // Ground: warm neutral lawn/concrete.
  g.fillStyle = '#cbb98f'; g.fillRect(0, 0, WORLD_W, WORLD_H);
  // Sand, then water on the east edge.
  g.fillStyle = '#e3c98f'; g.fillRect(SAND_X0, 0, WATER_X0 - SAND_X0, WORLD_H);
  const water = g.createLinearGradient(WATER_X0, 0, WORLD_W, 0);
  water.addColorStop(0, '#3fa7c9'); water.addColorStop(1, '#1d7fb0');
  g.fillStyle = water; g.fillRect(WATER_X0, 0, WORLD_W - WATER_X0, WORLD_H);
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3;
  for (let y = 40; y < WORLD_H; y += 130) {
    g.beginPath(); g.moveTo(WATER_X0 + 18, y); g.quadraticCurveTo(WATER_X0 + 90, y + 22, WATER_X0 + 170, y + 6); g.stroke();
  }
  // Parks.
  for (const p of world.parks) {
    g.fillStyle = '#7fae62'; g.fillRect(p.x, p.y, p.w, p.h);
    g.fillStyle = '#6d9e52';
    g.fillRect(p.x + 8, p.y + 8, p.w - 16, p.h - 16);
  }
  // Roads: warm grey asphalt + sidewalks + centre dashes.
  g.fillStyle = '#8f8a80';
  for (let i = 0; i < GRID_N; i++) {
    g.fillRect(world.roadX(i) - ROAD_W / 2, 0, ROAD_W, WORLD_H);
    g.fillRect(0, world.roadY(i) - ROAD_W / 2, WORLD_W, ROAD_W);
  }
  g.fillStyle = '#b5ac9c';
  for (let i = 0; i < GRID_N; i++) {
    g.fillRect(world.roadX(i) - ROAD_W / 2 - SIDEWALK_W, 0, SIDEWALK_W, WORLD_H);
    g.fillRect(world.roadX(i) + ROAD_W / 2, 0, SIDEWALK_W, WORLD_H);
    g.fillRect(0, world.roadY(i) - ROAD_W / 2 - SIDEWALK_W, WORLD_W, SIDEWALK_W);
    g.fillRect(0, world.roadY(i) + ROAD_W / 2, WORLD_W, SIDEWALK_W);
  }
  g.strokeStyle = '#e8ddc0'; g.lineWidth = 3; g.setLineDash([26, 30]);
  for (let i = 0; i < GRID_N; i++) {
    g.beginPath(); g.moveTo(world.roadX(i), 0); g.lineTo(world.roadX(i), WORLD_H); g.stroke();
    g.beginPath(); g.moveTo(0, world.roadY(i)); g.lineTo(WORLD_W, world.roadY(i)); g.stroke();
  }
  g.setLineDash([]);
  // Trees.
  for (const t of world.trees) {
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath(); g.ellipse(t.x + 6, t.y + 7, t.r, t.r * 0.8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4e8a3f';
    g.beginPath(); g.arc(t.x, t.y, t.r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#67a854';
    g.beginPath(); g.arc(t.x - 3, t.y - 3, t.r * 0.55, 0, Math.PI * 2); g.fill();
  }
  // Buildings: extruded 2.5D — shadow to the south-east, dark south + east
  // faces, bright roof. Sun comes from the north-west, everywhere.
  for (const b of world.buildings) {
    const dx = b.hgt * 0.45, dy = b.hgt * 0.55;
    g.fillStyle = 'rgba(20,20,40,0.22)';
    g.fillRect(b.x + dx, b.y + dy, b.w, b.h);
    g.fillStyle = shade(b.color, -34); // south face
    g.beginPath();
    g.moveTo(b.x, b.y + b.h); g.lineTo(b.x + b.w, b.y + b.h);
    g.lineTo(b.x + b.w + dx, b.y + b.h + dy); g.lineTo(b.x + dx, b.y + b.h + dy);
    g.closePath(); g.fill();
    g.fillStyle = shade(b.color, -22); // east face
    g.beginPath();
    g.moveTo(b.x + b.w, b.y); g.lineTo(b.x + b.w + dx, b.y + dy);
    g.lineTo(b.x + b.w + dx, b.y + b.h + dy); g.lineTo(b.x + b.w, b.y + b.h);
    g.closePath(); g.fill();
    g.fillStyle = shade(b.color, 14); // roof, warm highlight north-west
    g.fillRect(b.x, b.y, b.w, b.h);
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(b.x, b.y, b.w, 4);
    // Roof details: vents / skylights.
    g.fillStyle = shade(b.color, -12);
    const vx = b.x + b.w * 0.22, vy = b.y + b.h * 0.22;
    g.fillRect(vx, vy, Math.max(6, b.w * 0.16), Math.max(6, b.h * 0.16));
    g.fillRect(b.x + b.w * 0.6, b.y + b.h * 0.6, Math.max(6, b.w * 0.14), Math.max(6, b.h * 0.14));
  }
  return c;
}

// Small pre-rendered minimap: roads bright on a dark panel.
function renderMinimapLayer(world) {
  const c = document.createElement('canvas');
  c.width = 200; c.height = 170;
  const g = c.getContext('2d');
  const sx = 200 / WORLD_W, sy = 170 / WORLD_H;
  g.fillStyle = '#20242c'; g.fillRect(0, 0, 200, 170);
  g.fillStyle = '#2f7fb0'; g.fillRect(WATER_X0 * sx, 0, (WORLD_W - WATER_X0) * sx, 170);
  g.fillStyle = '#e3c98f'; g.fillRect(SAND_X0 * sx, 0, (WATER_X0 - SAND_X0) * sx, 170);
  g.fillStyle = '#7fae62';
  for (const p of world.parks) g.fillRect(p.x * sx, p.y * sy, p.w * sx, p.h * sy);
  g.strokeStyle = '#d8d2c2'; g.lineWidth = 3;
  for (let i = 0; i < GRID_N; i++) {
    g.beginPath(); g.moveTo(world.roadX(i) * sx, 0); g.lineTo(world.roadX(i) * sx, 170); g.stroke();
    g.beginPath(); g.moveTo(0, world.roadY(i) * sy); g.lineTo(200, world.roadY(i) * sy); g.stroke();
  }
  return c;
}

// Shift a hex colour's lightness by amt (-100..100).
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, r + amt));
  gg = Math.max(0, Math.min(255, gg + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r},${gg},${b})`;
}

// Nearest point on any road centre line (roads are axis-aligned), and how
// far off-road the point is. Used to snap spawns onto roads and to recover
// vehicles that get pushed into a block.
function nearestRoadPoint(world, x, y) {
  let best = { x, y }, bestD = 1e9;
  for (let i = 0; i < GRID_N; i++) {
    const rx = world.roadX(i);
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y }; }
    const ry = world.roadY(i);
    const d2 = Math.abs(y - ry);
    if (d2 < bestD) { bestD = d2; best = { x, y: ry }; }
  }
  return { point: best, dist: bestD };
}

export { buildWorld, collideCircle, pointInBuilding, nearestNode, nodePos, nodeNeighbours, bfsPath, shade, nearestRoadPoint };
