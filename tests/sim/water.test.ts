import { describe, expect, it } from 'vitest';
import type { GameState, InputCommand } from '../../src/sim/types';
import { DT, Tile } from '../../src/sim/types';
import { getDino } from '../../src/sim/defs/dinos';
import { createMatch, step } from '../../src/sim/sim';
import { addPlayer, createTeam } from '../../src/sim/players';
import { generateWorld } from '../../src/sim/worldgen';
import { isDeepWater, isWater } from '../../src/sim/world';
import { SMALL } from '../helpers';

/** A dry, empty map whose tiles we paint by hand. */
function pool(tile: number): GameState {
  const s = createMatch(4, { cols: 60, rows: 60, water: false });
  s.world.obstacles = [];
  s.world.grid = s.world.grid.map(() => []);
  s.food = [];
  s.world.tiles.fill(tile);
  return s;
}

/** Top speed a rider of `kind` reaches driving full ahead on uniform terrain. */
function topSpeed(kind: string, tile: number): number {
  const s = pool(tile);
  const p = addPlayer(s, createTeam(s)!.id, kind, 'A');
  const d = s.dinos.find((o) => o.playerId === p.id)!;
  d.x = d.px = 200;
  d.y = d.py = 480;
  d.heading = 0;
  const cmd: InputCommand = { throttle: 1, turn: 0, aimWorld: { x: 900, y: 480 }, fire: false };
  for (let i = 0; i < 240; i++) step(s, new Map([[p.id, cmd]]), DT);
  return d.speed;
}

describe('water', () => {
  it('shallow water does not slow anyone down', () => {
    for (const kind of ['velociraptor', 'triceratops', 'brontosaurus']) {
      expect(topSpeed(kind, Tile.Shallow)).toBeCloseTo(getDino(kind).maxSpeed, 5);
    }
  });

  it('deep water slows each species to its wade speed', () => {
    for (const kind of ['velociraptor', 'triceratops', 'brontosaurus']) {
      const def = getDino(kind);
      expect(topSpeed(kind, Tile.Deep)).toBeCloseTo(def.maxSpeed * def.wadeSpeed!, 5);
    }
  });

  it('slows small dinos down more than big ones', () => {
    const lost = (kind: string) => 1 - topSpeed(kind, Tile.Deep) / getDino(kind).maxSpeed;
    expect(lost('velociraptor')).toBeGreaterThan(lost('triceratops'));
    expect(lost('triceratops')).toBeGreaterThan(lost('brontosaurus'));
  });

  it('a dino running into deep water slows down gradually', () => {
    const s = pool(Tile.Grass);
    // Deep water from x = 320 on.
    for (let y = 0; y < s.world.rows; y++) for (let x = 20; x < s.world.cols; x++) s.world.tiles[y * s.world.cols + x] = Tile.Deep;
    const p = addPlayer(s, createTeam(s)!.id, 'velociraptor', 'A');
    const d = s.dinos.find((o) => o.playerId === p.id)!;
    d.x = d.px = 150;
    d.y = d.py = 480;
    d.heading = 0;
    const cmd: InputCommand = { throttle: 1, turn: 0, aimWorld: { x: 900, y: 480 }, fire: false };
    const speeds: number[] = [];
    for (let i = 0; i < 300; i++) {
      step(s, new Map([[p.id, cmd]]), DT);
      if (isDeepWater(s.world, d.x, d.y)) speeds.push(d.speed);
    }
    const def = getDino('velociraptor');
    // Drops in steps no bigger than its deceleration allows, down to its wade speed.
    for (let i = 1; i < speeds.length; i++) expect(speeds[i - 1] - speeds[i]).toBeLessThanOrEqual(def.decel * DT + 1e-6);
    expect(speeds.at(-1)).toBeCloseTo(def.maxSpeed * def.wadeSpeed!, 5);
  });
});

describe('lakes and rivers', () => {
  it('every map has deep and shallow water, the same for the same seed', () => {
    for (const seed of [1, 2, 3, 42]) {
      const w = generateWorld(seed, SMALL);
      const deep = w.tiles.filter((t) => t === Tile.Deep).length / w.tiles.length;
      const shallow = w.tiles.filter((t) => t === Tile.Shallow).length / w.tiles.length;
      expect(deep).toBeGreaterThan(0.05);
      expect(shallow).toBeGreaterThan(0.05);
      expect(deep + shallow).toBeLessThan(0.4);
      expect(generateWorld(seed, SMALL).tiles).toEqual(w.tiles);
    }
  });

  it('rims all deep water with shallows', () => {
    const w = generateWorld(2, SMALL);
    const wet = (t: number) => t === Tile.Deep || t === Tile.Shallow;
    for (let y = 1; y < w.rows - 1; y++) {
      for (let x = 1; x < w.cols - 1; x++) {
        if (w.tiles[y * w.cols + x] !== Tile.Deep) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) expect(wet(w.tiles[(y + dy) * w.cols + x + dx])).toBe(true);
      }
    }
  });

  it('keeps the base camps dry', () => {
    const w = generateWorld(5, SMALL);
    for (const b of w.bases) {
      for (let a = 0; a < Math.PI * 2; a += 0.2) {
        for (let r = 0; r < 160; r += 10) expect(isWater(w, b.x + Math.cos(a) * r, b.y + Math.sin(a) * r)).toBe(false);
      }
    }
  });

  it('puts no rock, tree, plant or carcass in the water', () => {
    for (const seed of [1, 7]) {
      const w = generateWorld(seed, SMALL);
      const ring = (o: { x: number; y: number }) => o.x < 20 || o.y < 20 || o.x > w.width - 20 || o.y > w.height - 20;
      for (const o of w.obstacles) if (!ring(o)) expect(isWater(w, o.x, o.y)).toBe(false);
      for (const f of w.food) expect(isWater(w, f.x, f.y)).toBe(false);
    }
  });

});
