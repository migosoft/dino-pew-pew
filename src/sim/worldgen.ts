import { Tile, type FoodKind, type FoodSource, type Obstacle, type Vec2, type World } from './types';
import { FOOD, makeCarcass } from './systems/feeding';
import { fbm } from './noise';
import { makeRng, rand, randInt, randRange } from './rng';
import { indexObstacles, isWater, tileAt } from './world';

export interface WorldGenOptions {
  cols?: number;
  rows?: number;
  tileSize?: number;
  /** Lakes and rivers (default true). Unit tests that need dry ground turn them off. */
  water?: boolean;
  /** Number of base camps (default 4). */
  teams?: number;
}

/** Default map: 512 x 512 tiles of 16 px = 8192 px square (the client draws the ground in chunks). */
export const DEFAULT_TILES = 512;
/** Obstacle-free radius around each base camp. */
export const BASE_CLEAR = 140;
/** Water never comes closer than this to a base camp center. */
export const BASE_DRY = BASE_CLEAR + 60;
/** Minimum free gap between any two obstacles: wide enough for the biggest dino to pass. */
export const OBSTACLE_GAP = 48;
/** Old carcasses lying around at world creation. */
export const MIN_WORLD_CARCASSES = 6;
export const MAX_WORLD_CARCASSES = 10;
/** Ids for the initial carcasses (live carcasses use CARCASS_ID_BASE + n). */
const WORLD_CARCASS_ID_BASE = 900_000;

/** Distance of base camps from the map edge: 1/8 of the map, at least 260 px. */
function baseInset(width: number): number {
  return Math.round(Math.max(260, width * 0.125));
}

/**
 * Base camps for `teams` teams, spread out: 2 in opposite corners, 3 in a triangle around the
 * centre, 4 in the corners (diagonal opposites first, so the first two teams start far apart).
 */
export function baseSlots(width: number, height: number, teams = 4): Vec2[] {
  const a = baseInset(Math.min(width, height));
  if (teams === 3) {
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) / 2 - a;
    return [-90, 30, 150].map((deg) => ({ x: Math.round(cx + Math.cos((deg * Math.PI) / 180) * r), y: Math.round(cy + Math.sin((deg * Math.PI) / 180) * r) }));
  }
  const corners = [
    { x: a, y: a },
    { x: width - a, y: height - a },
    { x: width - a, y: a },
    { x: a, y: height - a },
  ];
  return corners.slice(0, teams === 2 ? 2 : 4);
}

/** Share of the map covered by lakes: deep cores, and the shallow rims around them. */
const LAKE_DEEP_SHARE = 0.08;
const LAKE_SHALLOW_SHARE = 0.05;
/** River current in the middle of the deep channel, px/s. It weakens toward the banks and over fords. */
export const RIVER_SPEED = 36;
/** Rivers are where the warped river noise is within these distances of 0.5. */
const RIVER_DEEP = 0.018;
const RIVER_WIDE = 0.036;

interface WaterLayer {
  /** Tile.Deep, Tile.Shallow, or 0 for land, per tile. */
  tiles: Uint8Array;
  /** River current per tile (vx, vy interleaved), px/s. Zero in lakes and on land. */
  flow: Float32Array;
}

/**
 * Water per tile. Lakes are blobs of a slow noise, cut at percentiles so every seed gets about
 * the same amount of lake. Rivers follow a contour line of a warped noise. Both have a shallow
 * rim around a deep core, and fords break the deep core of rivers so every dino can cross.
 * Rivers flow along their contour line (the noise gradient turned 90 degrees), so each river
 * runs one way along its whole length. Lakes are still water.
 */
function waterLayer(cols: number, rows: number, seed: number): WaterLayer {
  /** The warped river noise; its 0.5 contour is the middle of a river. */
  const riverNoise = (x: number, y: number) => {
    const wx = x + (fbm(x / 22, y / 22, seed + 505, 3) - 0.5) * 24;
    const wy = y + (fbm(x / 22, y / 22, seed + 515, 3) - 0.5) * 24;
    return fbm(wx / 90, wy / 90, seed + 606, 2);
  };
  const lake = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) lake[y * cols + x] = fbm(x / 34, y / 34, seed + 404, 4);
  const sorted = Float32Array.from(lake).sort();
  const deepAt = sorted[Math.floor(sorted.length * (1 - LAKE_DEEP_SHARE))];
  const shallowAt = sorted[Math.floor(sorted.length * (1 - LAKE_DEEP_SHARE - LAKE_SHALLOW_SHARE))];
  const out = new Uint8Array(cols * rows);
  const flow = new Float32Array(cols * rows * 2);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      let deep = lake[i] > deepAt;
      let shallow = lake[i] > shallowAt;
      const river = Math.abs(riverNoise(x, y) - 0.5);
      const ford = fbm(x / 10, y / 10, seed + 707, 2) > 0.66;
      // Where a river runs into a lake, the lake wins: still water.
      if (river < RIVER_WIDE && !shallow) {
        const gx = riverNoise(x + 0.5, y) - riverNoise(x - 0.5, y);
        const gy = riverNoise(x, y + 0.5) - riverNoise(x, y - 0.5);
        const g = Math.hypot(gx, gy);
        if (g > 0) {
          const v = RIVER_SPEED * Math.min(1, 1.6 * (1 - river / RIVER_WIDE)) * (ford ? 0.6 : 1);
          flow[i * 2] = (-gy / g) * v;
          flow[i * 2 + 1] = (gx / g) * v;
        }
      }
      if (river < RIVER_DEEP && !ford) deep = true;
      if (river < RIVER_WIDE) shallow = true;
      out[i] = deep ? Tile.Deep : shallow ? Tile.Shallow : 0;
    }
  }
  return { tiles: out, flow };
}

/** Deterministically build terrain and obstacles from a seed. */
export function generateWorld(seed: number, opts: WorldGenOptions = {}): World {
  const cols = opts.cols ?? DEFAULT_TILES;
  const rows = opts.rows ?? DEFAULT_TILES;
  const tileSize = opts.tileSize ?? 16;
  const width = cols * tileSize;
  const height = rows * tileSize;
  const rng = makeRng(seed ^ 0x9e3779b9);
  const bases = baseSlots(width, height, opts.teams ?? 4);

  const tiles = new Uint8Array(cols * rows);
  const water = (opts.water ?? true) ? waterLayer(cols, rows, seed) : null;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const moist = fbm(x / 18, y / 18, seed + 11);
      const lush = fbm(x / 9, y / 9, seed + 23, 3);
      let t: number = Tile.Grass;
      if (moist < 0.32) t = Tile.Dirt;
      else if (moist > 0.7) t = Tile.Mud;
      else if (lush > 0.62) t = Tile.Fern;
      else if (lush < 0.4) t = Tile.GrassDark;
      if (water && water.tiles[y * cols + x]) {
        // Base camps stay dry.
        const px = (x + 0.5) * tileSize;
        const py = (y + 0.5) * tileSize;
        const dry = bases.some((b) => (b.x - px) ** 2 + (b.y - py) ** 2 < BASE_DRY * BASE_DRY);
        if (dry) water.flow[(y * cols + x) * 2] = water.flow[(y * cols + x) * 2 + 1] = 0;
        else t = water.tiles[y * cols + x];
      }
      tiles[y * cols + x] = t;
    }
  }
  // Deep water always has a shallow rim: no deep tile touches land.
  if (water) {
    const isLand = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && tiles[y * cols + x] !== Tile.Deep && tiles[y * cols + x] !== Tile.Shallow;
    const rim: number[] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (tiles[y * cols + x] !== Tile.Deep) continue;
        let shore = false;
        for (let dy = -1; dy <= 1 && !shore; dy++) for (let dx = -1; dx <= 1; dx++) if (isLand(x + dx, y + dy)) shore = true;
        if (shore) rim.push(y * cols + x);
      }
    }
    for (const i of rim) tiles[i] = Tile.Shallow;
  }

  const nearBase = (x: number, y: number) => bases.some((b) => (b.x - x) ** 2 + (b.y - y) ** 2 < BASE_CLEAR * BASE_CLEAR);
  const obstacles: Obstacle[] = [];
  const world: World = {
    seed,
    tileSize,
    cols,
    rows,
    width,
    height,
    tiles,
    flow: water ? water.flow : null,
    obstacles,
    grid: [],
    gridCell: 64,
    gridCols: 0,
    gridRows: 0,
    bases,
    food: [],
  };
  /** Nothing stands in water: the circle's center and rim must all be on land. */
  const onLand = (x: number, y: number, r: number): boolean => {
    if (isWater(world, x, y)) return false;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (isWater(world, x + Math.cos(a) * (r + 4), y + Math.sin(a) * (r + 4))) return false;
    }
    return true;
  };
  let id = 1;
  const fits = (x: number, y: number, r: number): boolean => {
    for (const o of obstacles) {
      const min = o.r + r + OBSTACLE_GAP;
      if ((o.x - x) ** 2 + (o.y - y) ** 2 < min * min) return false;
    }
    return onLand(x, y, r);
  };

  // Boundary ring of boulders.
  const ringStep = 22;
  for (let p = 0; p < width; p += ringStep) {
    for (const [x, y] of [
      [p, 6],
      [p, height - 6],
    ]) {
      obstacles.push({ id: id++, kind: 'rock', x: x + randRange(rng, -3, 3), y, r: randRange(rng, 12, 16), variant: randInt(rng, 3), canopyR: 0 });
    }
  }
  for (let p = ringStep; p < height - ringStep; p += ringStep) {
    for (const [x, y] of [
      [6, p],
      [width - 6, p],
    ]) {
      obstacles.push({ id: id++, kind: 'rock', x, y: y + randRange(rng, -3, 3), r: randRange(rng, 12, 16), variant: randInt(rng, 3), canopyR: 0 });
    }
  }
  // Jittered-grid scatter; noise decides groves vs open plains.
  const cell = 56;
  for (let gy = 1; gy < Math.floor(height / cell) - 1; gy++) {
    for (let gx = 1; gx < Math.floor(width / cell) - 1; gx++) {
      const x = gx * cell + randRange(rng, 4, cell - 4);
      const y = gy * cell + randRange(rng, 4, cell - 4);
      if (nearBase(x, y)) continue;
      const grove = fbm(x / 260, y / 260, seed + 101, 3);
      const rocky = fbm(x / 200, y / 200, seed + 202, 3);
      const roll = rand(rng);
      if (roll < Math.max(0, (grove - 0.45) * 2.6)) {
        const r = randRange(rng, 4, 6);
        if (fits(x, y, r + 8)) obstacles.push({ id: id++, kind: 'tree', x, y, r, variant: randInt(rng, 3), canopyR: randRange(rng, 16, 24) });
      } else if (roll < 0.12 + Math.max(0, (rocky - 0.5) * 1.6)) {
        const big = rand(rng) < 0.35;
        const r = big ? randRange(rng, 12, 16) : randRange(rng, 6, 9);
        if (fits(x, y, r)) obstacles.push({ id: id++, kind: 'rock', x, y, r, variant: randInt(rng, 3), canopyR: 0 });
      }
    }
  }

  world.food = generateFood(rng, seed, world, bases);
  indexObstacles(world);
  return world;
}

function plant(id: number, kind: FoodKind, x: number, y: number, reach: number, variant: number): FoodSource {
  const t = FOOD[kind];
  return { id, kind, x, y, reach, food: t.maxFood, maxFood: t.maxFood, costPerHp: t.costPerHp, idle: 0, variant };
}

/**
 * Food sources: every tree, bushes on grass, fern patches on fern ground, and a few
 * old carcasses. Nothing grows inside base camps, so riders have to go out to eat.
 */
function generateFood(rng: ReturnType<typeof makeRng>, seed: number, world: World, bases: Vec2[]): FoodSource[] {
  const { width, height, obstacles } = world;
  const food: FoodSource[] = [];
  let id = 1;
  const dry = (x: number, y: number, r: number) =>
    !isWater(world, x, y) && [0, 1, 2, 3].every((k) => !isWater(world, x + Math.cos(k * 1.571) * r, y + Math.sin(k * 1.571) * r));
  const clearOf = (x: number, y: number, gap: number) =>
    dry(x, y, gap) &&
    obstacles.every((o) => (o.x - x) ** 2 + (o.y - y) ** 2 > (o.r + gap) ** 2) &&
    food.every((f) => (f.x - x) ** 2 + (f.y - y) ** 2 > (gap + 8) ** 2) &&
    bases.every((b) => (b.x - x) ** 2 + (b.y - y) ** 2 > (BASE_CLEAR + 10) ** 2);

  for (const o of obstacles) if (o.kind === 'tree') food.push(plant(id++, 'tree', o.x, o.y, o.r + 6, 0));

  const cell = 48;
  for (let gy = 1; gy < Math.floor(height / cell) - 1; gy++) {
    for (let gx = 1; gx < Math.floor(width / cell) - 1; gx++) {
      const x = gx * cell + randRange(rng, 6, cell - 6);
      const y = gy * cell + randRange(rng, 6, cell - 6);
      const t = tileAt(world, x, y);
      const lush = fbm(x / 150, y / 150, seed + 303, 3);
      const roll = rand(rng);
      if (t === Tile.Fern && roll < 0.45) {
        if (clearOf(x, y, 10)) food.push(plant(id++, 'fern', x, y, 9, randInt(rng, 2)));
      } else if ((t === Tile.Grass || t === Tile.GrassDark) && roll < 0.05 + Math.max(0, (lush - 0.5) * 0.6)) {
        if (clearOf(x, y, 10)) food.push(plant(id++, 'bush', x, y, 8, randInt(rng, 3)));
      }
    }
  }

  // A few old carcasses, spread out and away from the camps.
  const want = MIN_WORLD_CARCASSES + randInt(rng, MAX_WORLD_CARCASSES - MIN_WORLD_CARCASSES + 1);
  const carcasses: FoodSource[] = [];
  for (let attempt = 0; attempt < 400 && carcasses.length < want; attempt++) {
    const x = randRange(rng, 120, width - 120);
    const y = randRange(rng, 120, height - 120);
    if (bases.some((b) => (b.x - x) ** 2 + (b.y - y) ** 2 < 320 * 320)) continue;
    if (carcasses.some((c) => (c.x - x) ** 2 + (c.y - y) ** 2 < 260 * 260)) continue;
    if (!obstacles.every((o) => (o.x - x) ** 2 + (o.y - y) ** 2 > (o.r + 20) ** 2)) continue;
    if (!dry(x, y, 24)) continue;
    const roll = rand(rng);
    const species = roll < 0.4 ? 'triceratops' : roll < 0.72 ? 'velociraptor' : roll < 0.88 ? 'brontosaurus' : 'trex';
    carcasses.push(makeCarcass(WORLD_CARCASS_ID_BASE + carcasses.length, species, x, y, rand(rng) * Math.PI * 2));
  }
  return food.concat(carcasses);
}
