import type { GameState } from './types';
import { listDinos } from './defs/dinos';

// Uniform grid over the dinos, so "who is near me" checks visit a few cells instead
// of every dino. Built from current positions; dinos keep moving a little after a
// build (a tick's movement, pushes, knockback), so queries widen their radius by
// SLACK. Results are dino indices in ascending order: the same order as a loop over
// state.dinos, so nearest-first ties and first-hit rules come out unchanged.

const CELL = 128;
/** Extra query radius for dinos that moved since the grid was built. */
const SLACK = 48;

interface DinoGrid {
  cols: number;
  rows: number;
  /** cellStart[c]..cellStart[c + 1] index into `items` for cell c. */
  cellStart: Int32Array;
  items: Int32Array;
  cellOf: Int32Array;
  /** What the grid was built from: queries fall back to a full scan if any of these changed. */
  dinos: GameState['dinos'] | null;
  count: number;
  tick: number;
}

const grids = new WeakMap<GameState, DinoGrid>();

let maxRadius = 0;
/** Largest body radius of any species (for queries that add the other dino's radius). */
export function maxDinoRadius(): number {
  if (!maxRadius) for (const d of listDinos()) maxRadius = Math.max(maxRadius, d.radius);
  return maxRadius;
}

/** (Re)build the grid from current positions. Call before a pass of queries. */
export function buildDinoGrid(state: GameState): void {
  const { width, height } = state.world;
  const cols = Math.max(1, Math.ceil(width / CELL));
  const rows = Math.max(1, Math.ceil(height / CELL));
  let g = grids.get(state);
  if (!g || g.cols !== cols || g.rows !== rows) {
    g = { cols, rows, cellStart: new Int32Array(cols * rows + 1), items: new Int32Array(0), cellOf: new Int32Array(0), dinos: null, count: 0, tick: -1 };
    grids.set(state, g);
  }
  const ds = state.dinos;
  const n = ds.length;
  if (g.items.length < n) {
    g.items = new Int32Array(n * 2);
    g.cellOf = new Int32Array(n * 2);
  }
  const { cellStart, items, cellOf } = g;
  cellStart.fill(0);
  for (let i = 0; i < n; i++) {
    const d = ds[i];
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(d.x / CELL)));
    const cy = Math.min(rows - 1, Math.max(0, Math.floor(d.y / CELL)));
    const c = cy * cols + cx;
    cellOf[i] = c;
    cellStart[c + 1]++;
  }
  for (let c = 0; c < cols * rows; c++) cellStart[c + 1] += cellStart[c];
  // Fill in index order, so every cell lists its dinos ascending.
  const next = cellStart.slice(0, cols * rows);
  for (let i = 0; i < n; i++) items[next[cellOf[i]]++] = i;
  g.dinos = ds;
  g.count = n;
  g.tick = state.tick;
}

/**
 * Indices (into state.dinos, ascending) of dinos that may lie within `r` of (x, y).
 * Candidates only: callers still test the exact distance. Reuses and returns `out`.
 */
export function dinosNear(state: GameState, x: number, y: number, r: number, out: number[]): number[] {
  out.length = 0;
  const g = grids.get(state);
  if (!g || g.dinos !== state.dinos || g.count !== state.dinos.length || g.tick !== state.tick) {
    for (let i = 0; i < state.dinos.length; i++) out.push(i);
    return out;
  }
  const rr = r + SLACK;
  const x0 = Math.max(0, Math.floor((x - rr) / CELL));
  const x1 = Math.min(g.cols - 1, Math.floor((x + rr) / CELL));
  const y0 = Math.max(0, Math.floor((y - rr) / CELL));
  const y1 = Math.min(g.rows - 1, Math.floor((y + rr) / CELL));
  let cells = 0;
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const c = cy * g.cols + cx;
      const end = g.cellStart[c + 1];
      if (end > g.cellStart[c]) cells++;
      for (let k = g.cellStart[c]; k < end; k++) out.push(g.items[k]);
    }
  }
  if (cells > 1) out.sort((a, b) => a - b);
  return out;
}
