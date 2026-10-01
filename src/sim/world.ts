import type { Dino, GameState, Obstacle, Team, World } from './types';
import { getDino } from './defs/dinos';

export function createDino(state: GameState, kind: string, team: Team, x: number, y: number, heading = 0): Dino {
  const def = getDino(kind);
  const d: Dino = {
    id: state.nextId++,
    kind,
    team,
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
    bumpCooldown: 0,
    damageMul: 1,
    fireIntervalMul: 1,
    stride: 0,
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

export function getPlayer(state: GameState): Dino | undefined {
  return findDino(state, state.playerId);
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
