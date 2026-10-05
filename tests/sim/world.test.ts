import { describe, expect, it } from 'vitest';
import type { InputCommand } from '../../src/sim/types';
import { generateWorld } from '../../src/sim/worldgen';
import { createMatch } from '../../src/sim/sim';
import { addPlayer, createTeam } from '../../src/sim/players';
import { BASE_CLEAR, DEFAULT_TILES, OBSTACLE_GAP, baseSlots } from '../../src/sim/worldgen';
import { getDino } from '../../src/sim/defs/dinos';
import { isFree } from '../../src/sim/world';
import { moveDino } from '../../src/sim/systems/movement';
import { resolveObstacles } from '../../src/sim/systems/collision';
import { updateProjectiles } from '../../src/sim/systems/projectiles';
import { SMALL } from '../helpers';

describe('world generation', () => {
  it('is deterministic for a seed', () => {
    const a = generateWorld(123, SMALL);
    const b = generateWorld(123, SMALL);
    expect(a.tiles).toEqual(b.tiles);
    expect(a.obstacles).toEqual(b.obstacles);
  });

  it('differs between seeds', () => {
    expect(generateWorld(1, SMALL).obstacles).not.toEqual(generateWorld(2, SMALL).obstacles);
  });

  it('has rocks and trees and four clear base camps', () => {
    const w = generateWorld(99, SMALL);
    expect(w.obstacles.some((o) => o.kind === 'rock')).toBe(true);
    expect(w.obstacles.some((o) => o.kind === 'tree')).toBe(true);
    expect(w.bases).toHaveLength(4);
    for (const b of w.bases) expect(isFree(w, b.x, b.y, BASE_CLEAR - 30)).toBe(true);
  });

  it('is 8192 px square by default and leaves room for the biggest dino between any two obstacles', () => {
    const t0 = performance.now();
    const w = generateWorld(99);
    console.log(`generateWorld 8192 px: ${Math.round(performance.now() - t0)} ms`);
    expect(DEFAULT_TILES).toBe(512);
    expect([w.width, w.height]).toEqual([8192, 8192]);
    const inner = w.obstacles.filter((o) => o.x > 30 && o.y > 30 && o.x < w.width - 30 && o.y < w.height - 30);
    expect(inner.length).toBeGreaterThan(1200);
    // Smallest gap between any two obstacles (one expect: millions of expect calls are slow).
    let minGap = Infinity;
    for (let i = 0; i < inner.length; i++) {
      for (let j = i + 1; j < inner.length; j++) {
        const a = inner[i];
        const b = inner[j];
        if (Math.abs(a.x - b.x) > 100) continue;
        minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r);
      }
    }
    expect(minGap).toBeGreaterThanOrEqual(OBSTACLE_GAP - 1e-9);
    expect(OBSTACLE_GAP).toBeGreaterThan(2 * getDino('brontosaurus').radius);
  });
});

describe('baseSlots', () => {
  const W = 8192;
  it('puts 2 camps in opposite corners, 1/8 in from the edge', () => {
    expect(baseSlots(W, W, 2)).toEqual([{ x: 1024, y: 1024 }, { x: 7168, y: 7168 }]);
  });
  it('spreads 3 camps evenly around the centre', () => {
    const s = baseSlots(W, W, 3);
    expect(s).toHaveLength(3);
    const d = (i: number, j: number) => Math.hypot(s[i].x - s[j].x, s[i].y - s[j].y);
    expect(Math.abs(d(0, 1) - d(1, 2))).toBeLessThan(2);
    expect(Math.abs(d(1, 2) - d(2, 0))).toBeLessThan(2);
    for (const b of s) expect(Math.min(b.x, b.y, W - b.x, W - b.y)).toBeGreaterThanOrEqual(1000);
  });
  it('puts 4 camps in the corners (diagonal pairs first)', () => {
    expect(baseSlots(W, W, 4)).toEqual([{ x: 1024, y: 1024 }, { x: 7168, y: 7168 }, { x: 7168, y: 1024 }, { x: 1024, y: 7168 }]);
  });
  it('keeps at least 260 px on tiny test maps', () => {
    expect(baseSlots(960, 960, 4)[0]).toEqual({ x: 260, y: 260 });
  });
});

describe('collisions', () => {
  function gameWithRockAhead() {
    const s = createMatch(5, SMALL);
    addPlayer(s, createTeam(s)!.id, 'triceratops', 'A');
    const p = s.dinos[0];
    const rock = { id: 999, kind: 'rock' as const, x: p.x + 60, y: p.y, r: 12, variant: 0, canopyR: 0 };
    s.world.obstacles = [rock];
    s.world.grid = s.world.grid.map(() => []);
    s.world.grid[Math.floor(rock.y / 64) * s.world.gridCols + Math.floor(rock.x / 64)].push(0);
    p.heading = 0;
    return { s, p, rock };
  }

  it('dinos cannot drive through rocks', () => {
    const { s, p, rock } = gameWithRockAhead();
    const cmd: InputCommand = { throttle: 1, turn: 0, aimWorld: { x: 0, y: 0 }, fire: false };
    for (let i = 0; i < 180; i++) {
      moveDino(p, cmd, 1 / 60);
      resolveObstacles(s, p);
    }
    expect(Math.hypot(p.x - rock.x, p.y - rock.y)).toBeGreaterThanOrEqual(rock.r + 11 - 1e-6);
    expect(p.x).toBeLessThan(rock.x);
  });

  it('projectiles are stopped by rocks', () => {
    const { s, p, rock } = gameWithRockAhead();
    s.projectiles.push({ id: 1, ownerId: p.id, team: p.team, x: p.x + 20, y: p.y, px: 0, py: 0, vx: 270, vy: 0, traveled: 0, range: 300, damage: 10, radius: 2, kind: 'bolt', alive: true });
    for (let i = 0; i < 30; i++) updateProjectiles(s, 1 / 60);
    expect(s.projectiles).toHaveLength(0);
    expect(rock).toBeDefined();
  });
});
