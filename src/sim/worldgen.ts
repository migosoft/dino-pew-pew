import { Tile, type FoodKind, type FoodSource, type Obstacle, type Vec2, type World } from './types';
import { FOOD, makeCarcass } from './systems/feeding';
import { fbm } from './noise';
import { makeRng, rand, randInt, randRange } from './rng';
import { indexObstacles } from './world';

export interface WorldGenOptions {
  cols?: number;
  rows?: number;
  tileSize?: number;
}

/** Obstacle-free radius around each base camp. */
export const BASE_CLEAR = 140;
/** Old carcasses lying around at world creation. */
export const MIN_WORLD_CARCASSES = 6;
export const MAX_WORLD_CARCASSES = 10;
/** Ids for the initial carcasses (live carcasses use CARCASS_ID_BASE + n). */
const WORLD_CARCASS_ID_BASE = 900_000;
/** Distance of base camps from the map edge. */
const BASE_INSET = 260;

/** Base slots: diagonal opposites first so the first two teams start far apart. */
export function baseSlots(width: number, height: number): Vec2[] {
  const a = BASE_INSET;
  return [
    { x: a, y: a },
    { x: width - a, y: height - a },
    { x: width - a, y: a },
    { x: a, y: height - a },
  ];
}

/** Deterministically build terrain and obstacles from a seed. */
export function generateWorld(seed: number, opts: WorldGenOptions = {}): World {
  const cols = opts.cols ?? 128;
  const rows = opts.rows ?? 128;
  const tileSize = opts.tileSize ?? 16;
  const width = cols * tileSize;
  const height = rows * tileSize;
  const rng = makeRng(seed ^ 0x9e3779b9);

  const tiles = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const moist = fbm(x / 18, y / 18, seed + 11);
      const lush = fbm(x / 9, y / 9, seed + 23, 3);
      let t: number = Tile.Grass;
      if (moist < 0.32) t = Tile.Dirt;
      else if (moist > 0.7) t = Tile.Mud;
      else if (lush > 0.62) t = Tile.Fern;
      else if (lush < 0.4) t = Tile.GrassDark;
      tiles[y * cols + x] = t;
    }
  }

  const bases = baseSlots(width, height);
  const nearBase = (x: number, y: number) => bases.some((b) => (b.x - x) ** 2 + (b.y - y) ** 2 < BASE_CLEAR * BASE_CLEAR);
  const obstacles: Obstacle[] = [];
  let id = 1;
  const fits = (x: number, y: number, r: number): boolean => {
    for (const o of obstacles) {
      const min = o.r + r + 6;
      if ((o.x - x) ** 2 + (o.y - y) ** 2 < min * min) return false;
    }
    return true;
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
  const cell = 40;
  for (let gy = 1; gy < Math.floor(height / cell) - 1; gy++) {
    for (let gx = 1; gx < Math.floor(width / cell) - 1; gx++) {
      const x = gx * cell + randRange(rng, 4, cell - 4);
      const y = gy * cell + randRange(rng, 4, cell - 4);
      if (nearBase(x, y)) continue;
      const grove = fbm(x / 260, y / 260, seed + 101, 3);
      const rocky = fbm(x / 200, y / 200, seed + 202, 3);
      const roll = rand(rng);
      if (roll < Math.max(0, (grove - 0.48) * 2.2)) {
        const r = randRange(rng, 4, 6);
        if (fits(x, y, r + 8)) obstacles.push({ id: id++, kind: 'tree', x, y, r, variant: randInt(rng, 3), canopyR: randRange(rng, 16, 24) });
      } else if (roll < 0.1 + Math.max(0, (rocky - 0.5) * 1.4)) {
        const big = rand(rng) < 0.35;
        const r = big ? randRange(rng, 12, 16) : randRange(rng, 6, 9);
        if (fits(x, y, r)) obstacles.push({ id: id++, kind: 'rock', x, y, r, variant: randInt(rng, 3), canopyR: 0 });
      }
    }
  }

  const food = generateFood(rng, seed, width, height, cols, tileSize, tiles, obstacles, bases);

  const world: World = {
    seed,
    tileSize,
    cols,
    rows,
    width,
    height,
    tiles,
    obstacles,
    grid: [],
    gridCell: 64,
    gridCols: 0,
    gridRows: 0,
    bases,
    food,
  };
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
function generateFood(
  rng: ReturnType<typeof makeRng>,
  seed: number,
  width: number,
  height: number,
  cols: number,
  tileSize: number,
  tiles: Uint8Array,
  obstacles: Obstacle[],
  bases: Vec2[],
): FoodSource[] {
  const food: FoodSource[] = [];
  let id = 1;
  const clearOf = (x: number, y: number, gap: number) =>
    obstacles.every((o) => (o.x - x) ** 2 + (o.y - y) ** 2 > (o.r + gap) ** 2) &&
    food.every((f) => (f.x - x) ** 2 + (f.y - y) ** 2 > (gap + 8) ** 2) &&
    bases.every((b) => (b.x - x) ** 2 + (b.y - y) ** 2 > (BASE_CLEAR + 10) ** 2);

  for (const o of obstacles) if (o.kind === 'tree') food.push(plant(id++, 'tree', o.x, o.y, o.r + 6, 0));

  const cell = 48;
  for (let gy = 1; gy < Math.floor(height / cell) - 1; gy++) {
    for (let gx = 1; gx < Math.floor(width / cell) - 1; gx++) {
      const x = gx * cell + randRange(rng, 6, cell - 6);
      const y = gy * cell + randRange(rng, 6, cell - 6);
      const t = tiles[Math.floor(y / tileSize) * cols + Math.floor(x / tileSize)];
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
    const species = rand(rng) < 0.5 ? 'triceratops' : 'velociraptor';
    carcasses.push(makeCarcass(WORLD_CARCASS_ID_BASE + carcasses.length, species, x, y, rand(rng) * Math.PI * 2));
  }
  return food.concat(carcasses);
}
