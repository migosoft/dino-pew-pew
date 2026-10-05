import { Tile, type Dino, type GameState, type Obstacle, type PlayerState, type Team, type TeamState, type Vec2, type World } from './types';
import { getDino } from './defs/dinos';
import { valueNoise } from './noise';

export function createDino(state: GameState, kind: string, team: Team, x: number, y: number, heading = 0, playerId: number | null = null): Dino {
  const def = getDino(kind);
  const d: Dino = {
    id: state.nextId++,
    kind,
    team,
    playerId,
    x,
    y,
    heading,
    speed: 0,
    headYaw: 0,
    mounts: def.mounts.map(() => ({ angle: 0, cooldown: 0 })),
    hp: def.hp,
    maxHp: def.hp,
    alive: true,
    hitFlash: 0,
    meleeCooldown: 0,
    abilityCooldown: 0,
    abilityT: -1,
    abilityFrom: { x, y },
    abilityTo: { x, y },
    abilityHit: [],
    lastAttacker: null,
    sinceHit: 999,
    damageMul: 1,
    fireIntervalMul: 1,
    rangeMul: 1,
    armor: 0,
    stride: 0,
    eating: false,
    px: x,
    py: y,
    pheading: heading,
  };
  state.dinos.push(d);
  return d;
}

/** id -> index into state.dinos, rebuilt when the array is replaced, grows or is compacted. */
interface DinoIndex {
  dinos: Dino[];
  count: number;
  at: Map<number, number>;
}
const dinoIndexes = new WeakMap<GameState, DinoIndex>();

function indexDinos(state: GameState): DinoIndex {
  const at = new Map<number, number>();
  state.dinos.forEach((d, i) => at.set(d.id, i));
  const ix = { dinos: state.dinos, count: state.dinos.length, at };
  dinoIndexes.set(state, ix);
  return ix;
}

/** Call after removing dinos from state.dinos in place (its length alone may not change). */
export function forgetDinoIndex(state: GameState): void {
  dinoIndexes.delete(state);
}

export function findDino(state: GameState, id: number): Dino | undefined {
  let ix = dinoIndexes.get(state);
  if (!ix || ix.dinos !== state.dinos || ix.count !== state.dinos.length) ix = indexDinos(state);
  const i = ix.at.get(id);
  if (i === undefined) return undefined;
  if (state.dinos[i]?.id === id) return state.dinos[i];
  // Stale index (the array changed without growing): rebuild once.
  const j = indexDinos(state).at.get(id);
  return j === undefined ? undefined : state.dinos[j];
}

export function findPlayer(state: GameState, id: number): PlayerState | undefined {
  for (const p of state.players) if (p.id === id) return p;
  return undefined;
}

export function findTeam(state: GameState, id: string): TeamState | undefined {
  for (const t of state.teams) if (t.id === id) return t;
  return undefined;
}

/** Build the obstacle spatial hash. */
export function indexObstacles(world: World): void {
  world.gridCols = Math.ceil(world.width / world.gridCell);
  world.gridRows = Math.ceil(world.height / world.gridCell);
  world.grid = Array.from({ length: world.gridCols * world.gridRows }, () => [] as number[]);
  world.obstacles.forEach((o, idx) => {
    const x0 = Math.max(0, Math.floor((o.x - o.r) / world.gridCell));
    const x1 = Math.min(world.gridCols - 1, Math.floor((o.x + o.r) / world.gridCell));
    const y0 = Math.max(0, Math.floor((o.y - o.r) / world.gridCell));
    const y1 = Math.min(world.gridRows - 1, Math.floor((o.y + o.r) / world.gridCell));
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) world.grid[gy * world.gridCols + gx].push(idx);
  });
}

/** Per world: the query number that last visited each obstacle (dedupes obstacles spanning several cells). */
const visits = new WeakMap<World, { marks: Uint32Array; query: number }>();
let visiting = false;

/** Visit each obstacle whose cell overlaps the circle (x, y, r). Return true from cb to stop. */
export function forEachObstacleNear(world: World, x: number, y: number, r: number, cb: (o: Obstacle) => boolean | void): void {
  const x0 = Math.max(0, Math.floor((x - r) / world.gridCell));
  const x1 = Math.min(world.gridCols - 1, Math.floor((x + r) / world.gridCell));
  const y0 = Math.max(0, Math.floor((y - r) / world.gridCell));
  const y1 = Math.min(world.gridRows - 1, Math.floor((y + r) / world.gridCell));
  // Within one cell nothing repeats. Nested calls (from inside cb) fall back to a Set.
  if (x0 === x1 && y0 === y1) {
    for (const idx of world.grid[y0 * world.gridCols + x0]) if (cb(world.obstacles[idx])) return;
    return;
  }
  if (visiting) {
    const seen = new Set<number>();
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        for (const idx of world.grid[gy * world.gridCols + gx]) {
          if (seen.has(idx)) continue;
          seen.add(idx);
          if (cb(world.obstacles[idx])) return;
        }
      }
    }
    return;
  }
  let v = visits.get(world);
  if (!v || v.marks.length < world.obstacles.length || v.query === 0xffffffff) {
    v = { marks: new Uint32Array(world.obstacles.length), query: 0 };
    visits.set(world, v);
  }
  const q = ++v.query;
  const marks = v.marks;
  visiting = true;
  try {
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        for (const idx of world.grid[gy * world.gridCols + gx]) {
          if (marks[idx] === q) continue;
          marks[idx] = q;
          if (cb(world.obstacles[idx])) return;
        }
      }
    }
  } finally {
    visiting = false;
  }
}

/** True if a circle at (x, y, r) overlaps no obstacle and stays inside the map. */
export function isFree(world: World, x: number, y: number, r: number): boolean {
  if (x < r || y < r || x > world.width - r || y > world.height - r) return false;
  let free = true;
  forEachObstacleNear(world, x, y, r, (o) => {
    const rr = o.r + r;
    const dx = o.x - x;
    const dy = o.y - y;
    if (dx * dx + dy * dy < rr * rr) {
      free = false;
      return true;
    }
  });
  return free;
}

/** True while a dino is in the air (mid-leap): it passes over rocks and other dinos. */
export function isAirborne(d: Dino): boolean {
  return d.abilityT >= 0 && getDino(d.kind).ability?.kind === 'leap';
}

/** Up to this many pixels, terrain borders are wobbled so they look organic instead of square. */
const TILE_WOBBLE = 14;

/**
 * Terrain under a world point. Tile borders are wobbled by noise; the ground texture uses
 * this same lookup, so the shoreline you see is the shoreline the simulation uses.
 */
export function tileAt(world: World, x: number, y: number): number {
  return world.tiles[tileIndexAt(world, x, y)];
}

/** Index of the tile under a world point, with the same wobbled borders as tileAt. */
export function tileIndexAt(world: World, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const jx = (valueNoise(ix / 7, iy / 7, world.seed + 3) - 0.5) * TILE_WOBBLE;
  const jy = (valueNoise(ix / 7, iy / 7, world.seed + 4) - 0.5) * TILE_WOBBLE;
  const tx = Math.min(world.cols - 1, Math.max(0, Math.floor((ix + jx) / world.tileSize)));
  const ty = Math.min(world.rows - 1, Math.max(0, Math.floor((iy + jy) / world.tileSize)));
  return ty * world.cols + tx;
}

export function isWater(world: World, x: number, y: number): boolean {
  const t = tileAt(world, x, y);
  return t === Tile.Shallow || t === Tile.Deep;
}

export function isDeepWater(world: World, x: number, y: number): boolean {
  return tileAt(world, x, y) === Tile.Deep;
}

const STILL: Vec2 = { x: 0, y: 0 };

/** River current at a world point, px/s (zero on land and in lakes). Do not modify the result. */
export function flowAt(world: World, x: number, y: number): Vec2 {
  if (!world.flow) return STILL;
  const i = tileIndexAt(world, x, y) * 2;
  const vx = world.flow[i];
  const vy = world.flow[i + 1];
  return vx === 0 && vy === 0 ? STILL : { x: vx, y: vy };
}

/** True in flowing river water. */
export function isRiver(world: World, x: number, y: number): boolean {
  const f = flowAt(world, x, y);
  return f.x * f.x + f.y * f.y > 1;
}
