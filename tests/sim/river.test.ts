import { describe, expect, it } from 'vitest';
import type { GameState, InputCommand } from '../../src/sim/types';
import { DT, Tile } from '../../src/sim/types';
import { getDino } from '../../src/sim/defs/dinos';
import { createMatch, step } from '../../src/sim/sim';
import { addPlayer, createTeam } from '../../src/sim/players';
import { BASE_DRY, RIVER_SPEED, generateWorld } from '../../src/sim/worldgen';
import { flowAt, isRiver } from '../../src/sim/world';
import { tryStartAbility } from '../../src/sim/systems/abilities';
import { SMALL } from '../helpers';

/** A dry, empty map that is one big river flowing south (+y) at `speed` px/s. */
function river(speed: number, tile: number = Tile.Shallow): GameState {
  const s = createMatch(4, { cols: 60, rows: 60, water: false });
  s.world.obstacles = [];
  s.world.grid = s.world.grid.map(() => []);
  s.food = [];
  s.world.tiles.fill(tile);
  s.world.flow = new Float32Array(s.world.cols * s.world.rows * 2);
  for (let i = 0; i < s.world.cols * s.world.rows; i++) s.world.flow[i * 2 + 1] = speed;
  return s;
}

function rider(s: GameState, kind: string) {
  const p = addPlayer(s, createTeam(s)!.id, kind, 'A');
  const d = s.dinos.find((o) => o.playerId === p.id)!;
  d.x = d.px = 480;
  d.y = d.py = 300;
  d.heading = 0;
  return { p, d };
}

const idle: InputCommand = { throttle: 0, turn: 0, aimWorld: { x: 900, y: 300 }, fire: false };

describe('river currents', () => {
  it('flow only in rivers: never in lakes, on land or near camps, and the same for every run', () => {
    const w = generateWorld(7, SMALL);
    const again = generateWorld(7, SMALL);
    expect(again.flow).toEqual(w.flow);
    let rivers = 0;
    for (let i = 0; i < w.cols * w.rows; i++) {
      const fx = w.flow![i * 2];
      const fy = w.flow![i * 2 + 1];
      const v = Math.hypot(fx, fy);
      if (v === 0) continue;
      rivers++;
      expect(v).toBeLessThanOrEqual(RIVER_SPEED + 1e-3);
      const t = w.tiles[i];
      expect(t === Tile.Shallow || t === Tile.Deep).toBe(true);
      const x = ((i % w.cols) + 0.5) * w.tileSize;
      const y = (Math.floor(i / w.cols) + 0.5) * w.tileSize;
      for (const b of w.bases) expect(Math.hypot(b.x - x, b.y - y)).toBeGreaterThan(BASE_DRY - 1);
    }
    // Rivers cover a few percent of the map.
    expect(rivers / (w.cols * w.rows)).toBeGreaterThan(0.02);
    // Some water is still (lakes).
    let still = 0;
    for (let i = 0; i < w.cols * w.rows; i++) if (w.tiles[i] === Tile.Deep && w.flow![i * 2] === 0 && w.flow![i * 2 + 1] === 0) still++;
    expect(still).toBeGreaterThan(0);
  });

  it('a river flows one way along its length', () => {
    const w = generateWorld(7, SMALL);
    let same = 0;
    let opposite = 0;
    for (let y = 0; y < w.rows; y++) {
      for (let x = 0; x < w.cols - 1; x++) {
        const i = (y * w.cols + x) * 2;
        const j = i + 2;
        if (Math.hypot(w.flow![i], w.flow![i + 1]) < 5 || Math.hypot(w.flow![j], w.flow![j + 1]) < 5) continue;
        if (w.flow![i] * w.flow![j] + w.flow![i + 1] * w.flow![j + 1] > 0) same++;
        else opposite++;
      }
    }
    expect(same).toBeGreaterThan(100);
    expect(opposite / (same + opposite)).toBeLessThan(0.01);
  });

  it('flowAt and isRiver read the flow field', () => {
    const s = river(30);
    expect(flowAt(s.world, 100, 100)).toEqual({ x: 0, y: 30 });
    expect(isRiver(s.world, 100, 100)).toBe(true);
    s.world.flow = null;
    expect(isRiver(s.world, 100, 100)).toBe(false);
  });

  it('sweeps a raptor downstream, but not a triceratops or a brontosaurus', () => {
    for (const [kind, swept] of [
      ['velociraptor', true],
      ['triceratops', false],
      ['brontosaurus', false],
    ] as const) {
      const s = river(30);
      const { p, d } = rider(s, kind);
      for (let i = 0; i < 60; i++) step(s, new Map([[p.id, idle]]), DT);
      if (swept) expect(d.y - 300).toBeCloseTo(30 * getDino(kind).currentDrift!, 0);
      else expect(d.y).toBeCloseTo(300, 5);
      expect(d.x).toBeCloseTo(480, 5);
    }
  });

  it('slows the raptor down, but not the triceratops or the brontosaurus', () => {
    const top = (kind: string, flow: number) => {
      const s = river(flow);
      const { p, d } = rider(s, kind);
      d.x = d.px = 100;
      const cmd: InputCommand = { ...idle, throttle: 1 };
      for (let i = 0; i < 240; i++) step(s, new Map([[p.id, cmd]]), DT);
      return d.speed;
    };
    expect(top('velociraptor', 30)).toBeCloseTo(getDino('velociraptor').maxSpeed * getDino('velociraptor').currentSlow!, 5);
    expect(top('triceratops', 30)).toBeCloseTo(getDino('triceratops').maxSpeed, 5);
    expect(top('brontosaurus', 30)).toBeCloseTo(getDino('brontosaurus').maxSpeed, 5);
    // In a deep river both slowdowns add up.
    const s = river(30, Tile.Deep);
    const { p, d } = rider(s, 'velociraptor');
    d.x = d.px = 100;
    for (let i = 0; i < 240; i++) step(s, new Map([[p.id, { ...idle, throttle: 1 }]]), DT);
    const def = getDino('velociraptor');
    expect(d.speed).toBeCloseTo(def.maxSpeed * def.wadeSpeed! * def.currentSlow!, 5);
  });

  it('a leaping raptor is not carried by the current', () => {
    const s = river(30);
    const { p, d } = rider(s, 'velociraptor');
    tryStartAbility(s, d, { ...idle, aimWorld: { x: 580, y: 300 }, ability: true });
    // Mid-leap the position follows the leap path only.
    for (let i = 0; i < 20; i++) step(s, new Map([[p.id, idle]]), DT);
    expect(d.y).toBeCloseTo(300, 5);
  });
});
