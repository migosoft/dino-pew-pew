import { Tile, type Dino, type GameState, type Obstacle, type PlayerState, type Team, type TeamState, type World } from './types';
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

export function findDino(state: GameState, id: number): Dino | undefined {
  for (const d of state.dinos) if (d.id === id) return d;
  return undefined;
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

/** Visit each obstacle whose cell overlaps the circle (x, y, r). Return true from cb to stop. */
export function forEachObstacleNear(world: World, x: number, y: number, r: number, cb: (o: Obstacle) => boolean | void): void {
  const x0 = Math.max(0, Math.floor((x - r) / world.gridCell));
  const x1 = Math.min(world.gridCols - 1, Math.floor((x + r) / world.gridCell));
  const y0 = Math.max(0, Math.floor((y - r) / world.gridCell));
  const y1 = Math.min(world.gridRows - 1, Math.floor((y + r) / world.gridCell));
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
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const jx = (valueNoise(ix / 7, iy / 7, world.seed + 3) - 0.5) * TILE_WOBBLE;
  const jy = (valueNoise(ix / 7, iy / 7, world.seed + 4) - 0.5) * TILE_WOBBLE;
  const tx = Math.min(world.cols - 1, Math.max(0, Math.floor((ix + jx) / world.tileSize)));
  const ty = Math.min(world.rows - 1, Math.max(0, Math.floor((iy + jy) / world.tileSize)));
  return world.tiles[ty * world.cols + tx];
}

export function isWater(world: World, x: number, y: number): boolean {
  const t = tileAt(world, x, y);
  return t === Tile.Shallow || t === Tile.Deep;
}

export function isDeepWater(world: World, x: number, y: number): boolean {
  return tileAt(world, x, y) === Tile.Deep;
}
