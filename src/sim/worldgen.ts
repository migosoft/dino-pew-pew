import { Tile, type Obstacle, type World } from './types';
import { fbm } from './noise';
import { makeRng, rand, randInt, randRange } from './rng';
import { indexObstacles } from './world';

export interface WorldGenOptions {
  cols?: number;
  rows?: number;
  tileSize?: number;
}

const SPAWN_CLEAR = 120;

/** Deterministically build terrain and obstacles from a seed. */
export function generateWorld(seed: number, opts: WorldGenOptions = {}): World {
  const cols = opts.cols ?? 96;
  const rows = opts.rows ?? 96;
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

  const spawn = { x: width / 2, y: height / 2 };
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
      if ((x - spawn.x) ** 2 + (y - spawn.y) ** 2 < SPAWN_CLEAR * SPAWN_CLEAR) continue;
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
    spawn,
  };
  indexObstacles(world);
  return world;
}
