import { beforeAll, describe, expect, it } from 'vitest';
import { Tile, type World } from '../../src/sim/types';
import { BASE_CLEAR, generateWorld } from '../../src/sim/worldgen';
import { CROSSING } from '../../src/sim/maps/crossing';
import { getMap, mapsFor, validSettings, worldOptionsFor } from '../../src/sim/maps';
import { flowAt, isFree, isWater } from '../../src/sim/world';

let w: World;
beforeAll(() => {
  w = generateWorld(CROSSING.seed, worldOptionsFor('crossing', 2));
});

/** Is there a path between two points over tiles that pass `ok` (4-connected flood fill)? */
function connected(world: World, a: { x: number; y: number }, b: { x: number; y: number }, ok: (t: number) => boolean): boolean {
  const { cols, rows, tileSize } = world;
  const start = Math.floor(a.y / tileSize) * cols + Math.floor(a.x / tileSize);
  const goal = Math.floor(b.y / tileSize) * cols + Math.floor(b.x / tileSize);
  const seen = new Uint8Array(cols * rows);
  const queue = [start];
  seen[start] = 1;
  while (queue.length) {
    const i = queue.pop()!;
    if (i === goal) return true;
    const x = i % cols;
    const y = (i / cols) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (seen[j] || !ok(world.tiles[j])) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return false;
}

describe('map registry', () => {
  it('offers RANDOM for every team count and CROSSING only for 2 teams', () => {
    expect(mapsFor(2).map((m) => m.id)).toEqual(['random', 'crossing']);
    expect(mapsFor(3).map((m) => m.id)).toEqual(['random']);
    expect(validSettings(2, 'crossing')).toEqual({ teams: 2, map: 'crossing' });
    expect(validSettings(4, 'crossing')).toBeNull();
    expect(validSettings(5, 'random')).toBeNull();
    expect(validSettings(3, 'nope')).toBeNull();
    expect(getMap('crossing')).toBe(CROSSING);
  });
});

describe('CROSSING', () => {
  it('uses the recipe camps and towers', () => {
    expect([w.width, w.height]).toEqual([8192, 8192]);
    expect(w.bases).toEqual(CROSSING.bases);
    expect(w.towers).toEqual(CROSSING.towers);
  });

  it('is deterministic', () => {
    const again = generateWorld(CROSSING.seed, worldOptionsFor('crossing', 2));
    expect(again.tiles).toEqual(w.tiles);
    expect(again.obstacles.length).toBe(w.obstacles.length);
  });

  it('is split in two by water, crossable only through fords and the causeway', () => {
    const land = (t: number) => t !== Tile.Shallow && t !== Tile.Deep;
    const notDeep = (t: number) => t !== Tile.Deep;
    const [a, b] = CROSSING.bases;
    expect(connected(w, a, b, land)).toBe(false);
    expect(connected(w, a, b, notDeep)).toBe(true);
  });

  it('mirrors water through the centre', () => {
    let same = 0;
    const n = w.cols * w.rows;
    for (let i = 0; i < n; i++) {
      const x = i % w.cols;
      const y = (i / w.cols) | 0;
      const m = (w.rows - 1 - y) * w.cols + (w.cols - 1 - x);
      const wet = (t: number) => (t === Tile.Deep ? 2 : t === Tile.Shallow ? 1 : 0);
      if (wet(w.tiles[i]) === wet(w.tiles[m])) same++;
    }
    expect(same / n).toBeGreaterThan(0.99);
  });

  it('mirrors obstacles through the centre', () => {
    const inner = w.obstacles.filter((o) => o.x > 40 && o.y > 40 && o.x < w.width - 40 && o.y < w.height - 40);
    expect(inner.length).toBeGreaterThan(800);
    const key = (x: number, y: number) => `${Math.round(x)},${Math.round(y)}`;
    const at = new Set(inner.map((o) => key(o.x, o.y)));
    const mirrored = inner.filter((o) => at.has(key(w.width - o.x, w.height - o.y))).length;
    expect(mirrored / inner.length).toBeGreaterThan(0.99);
  });

  it('rivers flow out of the lake; the lake is still', () => {
    const f = flowAt(w, 6150, 2250);
    expect(Math.hypot(f.x, f.y)).toBeGreaterThan(10);
    expect(f.x).toBeGreaterThan(0); // towards the top-right corner
    expect(f.y).toBeLessThan(0);
    expect(flowAt(w, 4096 + 300, 4096 - 300)).toEqual({ x: 0, y: 0 });
  });

  it('keeps camps dry and clear', () => {
    for (const b of w.bases) {
      expect(isWater(w, b.x, b.y)).toBe(false);
      expect(isFree(w, b.x, b.y, BASE_CLEAR)).toBe(true);
    }
  });
});
