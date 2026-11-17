import { GRID_LINES, ROAD_HALF, WORLD_HALF, WORLD_SEED, REPAINT_GARAGE, MARINA, DOCKS } from './config.js';
import { makeRng, pick, range, rangeInt } from './random.js';

// Crescent Bay: a seeded road grid. Roads are the graph every system shares:
// traffic drives it, police pursue along it, missions navigate it, pedestrians
// walk its sidewalks. Buildings fill the blocks between roads; the west edge
// is beach and open water.
export function createWorld(seed = WORLD_SEED) {
  const rng = makeRng(seed);
  const nodes = new Map();
  for (const gx of GRID_LINES) {
    for (const gy of GRID_LINES) {
      nodes.set(gx + ',' + gy, { x: gx, y: gy });
    }
  }
  const neighbours = (node) => {
    const out = [];
    for (const [dx, dy] of [[400, 0], [-400, 0], [0, 400], [0, -400]]) {
      const key = (node.x + dx) + ',' + (node.y + dy);
      if (nodes.has(key)) out.push(nodes.get(key));
    }
    return out;
  };

  const blockCenters = [];
  for (let i = 0; i < GRID_LINES.length - 1; i++) {
    for (let j = 0; j < GRID_LINES.length - 1; j++) {
      blockCenters.push({ x: (GRID_LINES[i] + GRID_LINES[i + 1]) / 2, y: (GRID_LINES[j] + GRID_LINES[j + 1]) / 2 });
    }
  }

  const parks = new Set();
  while (parks.size < 6) parks.add(Math.floor(rng() * blockCenters.length));

  const buildings = [];
  const shops = [];
  const districtPalettes = {
    downtown: ['#7d9bbd', '#5f7ea6', '#8fa8c4', '#6b8aa8'],
    brick: ['#a8624a', '#96604a', '#b07a52', '#8a5a44'],
    pastel: ['#d8b48f', '#c9a37e', '#e0c9a6', '#b98d6b'],
  };
  blockCenters.forEach((block, bi) => {
    if (parks.has(bi)) return;
    const dist = Math.abs(block.x) < 500 && Math.abs(block.y) < 500 ? 'downtown'
      : Math.abs(block.x) > 900 ? 'pastel' : 'brick';
    const palette = districtPalettes[dist];
    const count = dist === 'downtown' ? rangeInt(rng, 2, 3) : rangeInt(rng, 1, 3);
    for (let k = 0; k < count; k++) {
      const w = dist === 'downtown' ? range(rng, 120, 170) : range(rng, 90, 150);
      const d = dist === 'downtown' ? range(rng, 120, 170) : range(rng, 80, 130);
      const x = block.x + range(rng, -70, 70);
      const y = block.y + range(rng, -70, 70);
      const h = dist === 'downtown' ? rangeInt(rng, 3, 7) : rangeInt(rng, 1, 3);
      const color = pick(rng, palette);
      const b = { x, y, w, d, h, color, district: dist, neon: false };
      buildings.push(b);
      if (rng() < 0.22) { b.neon = true; b.neonColor = pick(rng, ['#ff5ad0', '#35e0ff', '#ffb02e', '#7dff6a']); shops.push(b); }
    }
  });

  // Keep the repaint garage, marina and docks clear of buildings.
  const clearNear = (cx, cy, r) => {
    for (let i = buildings.length - 1; i >= 0; i--) {
      const b = buildings[i];
      if (Math.abs(b.x - cx) < r && Math.abs(b.y - cy) < r) buildings.splice(i, 1);
    }
  };
  clearNear(REPAINT_GARAGE.x, REPAINT_GARAGE.y, 180);
  clearNear(MARINA.x, MARINA.y, 220);
  clearNear(DOCKS.x, DOCKS.y, 220);
  clearNear(0, 0, 200);

  const world = {
    seed, nodes, buildings, shops, parks: [...parks].map((i) => blockCenters[i]),
    bounds: { minX: -WORLD_HALF, maxX: WORLD_HALF, minY: -WORLD_HALF, maxY: WORLD_HALF },
    waterX: -1420, beachX: -1300,
  };
  return world;
}

export function nodeKey(x, y) { return x + ',' + y; }

export function nearestNode(world, x, y) {
  let best = null; let bestD = Infinity;
  for (const node of world.nodes.values()) {
    const d = (node.x - x) * (node.x - x) + (node.y - y) * (node.y - y);
    if (d < bestD) { bestD = d; best = node; }
  }
  return best;
}

export function nearestRoadPoint(world, x, y) {
  // Closest point on any road centreline (grid lines, clamped to the grid).
  let best = null; let bestD = Infinity;
  for (const gx of GRID_LINES) {
    const cx = Math.max(-1200, Math.min(1200, gx));
    const py = Math.max(-1200, Math.min(1200, y));
    const d = (cx - x) * (cx - x) + (py - y) * (py - y);
    if (d < bestD) { bestD = d; best = { x: cx, y: py }; }
  }
  for (const gy of GRID_LINES) {
    const px = Math.max(-1200, Math.min(1200, x));
    const cy = Math.max(-1200, Math.min(1200, gy));
    const d = (px - x) * (px - x) + (cy - y) * (cy - y);
    if (d < bestD) { bestD = d; best = { x: px, y: cy }; }
  }
  return best;
}

// Breadth-first route over the road graph. Returns an array of nodes from
// the start node's neighbour up to and including the goal node.
export function findRoute(world, from, to) {
  const start = nearestNode(world, from.x, from.y);
  const goal = nearestNode(world, to.x, to.y);
  if (start === goal) return [goal];
  const prev = new Map();
  const queue = [start];
  prev.set(nodeKey(start.x, start.y), null);
  while (queue.length) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const [dx, dy] of [[400, 0], [-400, 0], [0, 400], [0, -400]]) {
      const nk = nodeKey(cur.x + dx, cur.y + dy);
      const nb = world.nodes.get(nk);
      if (nb && !prev.has(nk)) { prev.set(nk, cur); queue.push(nb); }
    }
  }
  if (!prev.has(nodeKey(goal.x, goal.y))) return [goal];
  const path = [];
  let cur = goal;
  while (cur) { path.unshift(cur); cur = prev.get(nodeKey(cur.x, cur.y)); }
  return path.slice(1);
}

export function isOnRoad(x, y) {
  const onV = GRID_LINES.some((gx) => Math.abs(x - gx) <= ROAD_HALF + 14);
  const onH = GRID_LINES.some((gy) => Math.abs(y - gy) <= ROAD_HALF + 14);
  return (onV && Math.abs(y) <= 1260) || (onH && Math.abs(x) <= 1260);
}

export function pointInWater(world, x) { return x < world.waterX; }
export function pointInBeach(world, x) { return x >= world.waterX && x < world.beachX; }

// Circle vs building-rectangle collision; returns the pushed-out position.
export function collideBuildings(world, x, y, radius) {
  let nx = x; let ny = y;
  for (const b of world.buildings) {
    const hw = b.w / 2; const hd = b.d / 2;
    const cx = Math.max(b.x - hw, Math.min(nx, b.x + hw));
    const cy = Math.max(b.y - hd, Math.min(ny, b.y + hd));
    const dx = nx - cx; const dy = ny - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 > 0.001) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * radius;
        ny = cy + (dy / d) * radius;
      } else {
        ny = b.y - hd - radius;
      }
    }
  }
  return { x: nx, y: ny };
}

export function collideWorldBounds(world, x, y, radius) {
  return {
    x: Math.max(world.bounds.minX + radius, Math.min(world.bounds.maxX - radius, x)),
    y: Math.max(world.bounds.minY + radius, Math.min(world.bounds.maxY - radius, y)),
  };
}

export function randomRoadPoint(rng) {
  const gx = GRID_LINES[Math.floor(rng() * GRID_LINES.length)];
  const gy = GRID_LINES[Math.floor(rng() * GRID_LINES.length)];
  return { x: gx + (rng() - 0.5) * 40, y: gy + (rng() - 0.5) * 40 };
}
