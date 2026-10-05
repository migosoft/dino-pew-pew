import { describe, expect, it } from 'vitest';
import type { GameState, InputCommand, Vec2 } from '../../src/sim/types';
import { DT, Tile, WILD_TEAM } from '../../src/sim/types';
import { getDino, listDinos } from '../../src/sim/defs/dinos';
import { createMatch, step } from '../../src/sim/sim';
import { createDino } from '../../src/sim/world';
import { addPlayer, createTeam } from '../../src/sim/players';
import { spawnWild } from '../../src/sim/ecology';

/** Open ground with no obstacles or food, all of it `tile`. */
function arena(tile: number = Tile.Grass): GameState {
  const s = createMatch(12, { cols: 60, rows: 60, water: false });
  s.world.obstacles = [];
  s.world.grid = s.world.grid.map(() => []);
  s.food = [];
  s.world.tiles.fill(tile);
  return s;
}

/** A ridden T-Rex at (480, 480) facing east, plus a command builder. */
function trex(s: GameState) {
  const p = addPlayer(s, createTeam(s)!.id, 'trex', 'A');
  const d = s.dinos.find((o) => o.playerId === p.id)!;
  d.x = d.px = 480;
  d.y = d.py = 480;
  d.heading = d.pheading = 0;
  const cmd = (aim: Vec2, fire: boolean, ability = false, throttle = 0): Map<number, InputCommand> =>
    new Map([[p.id, { throttle, turn: 0, aimWorld: aim, fire, ability }]]);
  return { p, d, cmd };
}

describe('t-rex guns', () => {
  it('has two guns on its head armor and one on each shoulder', () => {
    const def = getDino('trex');
    expect(def.mounts.filter((m) => m.parent === 'head')).toHaveLength(2);
    expect(def.mounts.filter((m) => m.parent === 'body')).toHaveLength(2);
    expect(listDinos().map((d) => d.kind)).toContain('trex');
  });

  it('fires all four guns at a target ahead', () => {
    const s = arena();
    const { d, cmd } = trex(s);
    const def = getDino('trex');
    const fired = new Set<string>();
    for (let i = 0; i < 60; i++) {
      step(s, cmd({ x: 700, y: 480 }, true), DT);
      for (const e of s.events) if (e.type === 'shot' && e.dinoId === d.id) fired.add(def.mounts[e.mount].id);
    }
    expect([...fired].sort()).toEqual(['headGunL', 'headGunR', 'shoulderGunL', 'shoulderGunR']);
  });

  it('the head guns turn with the head', () => {
    const s = arena();
    const { d, cmd } = trex(s);
    // Aim off to the right: the head turns that way.
    for (let i = 0; i < 60; i++) step(s, cmd({ x: 700, y: 600 }, false), DT);
    expect(d.headYaw).toBeGreaterThan(0.3);
  });
});

describe('t-rex bite', () => {
  it('lunges and bites the nearest hostile in front, once, for heavy damage', () => {
    const s = arena();
    const { d, cmd } = trex(s);
    const bite = getDino('trex').ability!;
    const near = createDino(s, 'velociraptor', WILD_TEAM, 515, 480, 0);
    const far = createDino(s, 'velociraptor', WILD_TEAM, 528, 484, 0);
    const startX = d.x;
    let bites = 0;
    for (let i = 0; i < 40; i++) {
      d.meleeCooldown = 999;
      near.meleeCooldown = far.meleeCooldown = 999;
      step(s, cmd({ x: 700, y: 480 }, false, i === 0), DT);
      for (const e of s.events) if (e.type === 'bite' && e.dinoId === d.id) {
        bites++;
        expect(e.targetId).toBe(near.id);
      }
    }
    expect(bites).toBe(1);
    expect(near.maxHp - near.hp).toBeCloseTo(Math.min(near.maxHp, bite.damage), 5);
    expect(far.hp).toBe(far.maxHp);
    // The lunge carries it forward.
    expect(d.x - startX).toBeGreaterThan(15);
  });

  it('does not bite what is behind it, and waits 15 s to bite again', () => {
    const s = arena();
    const { d, cmd } = trex(s);
    const behind = createDino(s, 'triceratops', WILD_TEAM, 450, 480, 0);
    let bites = 0;
    for (let i = 0; i < 60; i++) {
      d.meleeCooldown = behind.meleeCooldown = 999;
      step(s, cmd({ x: 700, y: 480 }, false, true), DT);
      for (const e of s.events) if (e.type === 'bite') {
        bites++;
        expect(e.targetId).toBeNull();
      }
    }
    expect(bites).toBe(1);
    expect(behind.hp).toBe(behind.maxHp);
    expect(d.abilityCooldown).toBeGreaterThan(13);
  });

  it('does not bite a rider safe in its own camp', () => {
    const s = arena();
    const { d, cmd } = trex(s);
    const t2 = createTeam(s)!;
    const p2 = addPlayer(s, t2.id, 'velociraptor', 'B');
    const victim = s.dinos.find((o) => o.playerId === p2.id)!;
    const base = s.teams.find((t) => t.id === t2.id)!.base;
    victim.x = base.x;
    victim.y = base.y;
    d.x = base.x - 35;
    d.y = base.y;
    for (let i = 0; i < 30; i++) {
      d.meleeCooldown = 999;
      step(s, cmd({ x: base.x + 200, y: base.y }, false, i === 0), DT);
    }
    expect(victim.hp).toBe(victim.maxHp);
  });
});

describe('t-rex in water', () => {
  it('deep water slows it only a little', () => {
    const s = arena(Tile.Deep);
    const { d, cmd } = trex(s);
    d.x = d.px = 100;
    for (let i = 0; i < 240; i++) step(s, cmd({ x: 900, y: 480 }, false, false, 1), DT);
    const def = getDino('trex');
    expect(def.wadeSpeed).toBeGreaterThan(getDino('triceratops').wadeSpeed!);
    expect(d.speed).toBeCloseTo(def.maxSpeed * def.wadeSpeed!, 5);
  });

  it('a river slows it but does not carry it away', () => {
    const s = arena(Tile.Shallow);
    s.world.flow = new Float32Array(s.world.cols * s.world.rows * 2);
    for (let i = 0; i < s.world.cols * s.world.rows; i++) s.world.flow[i * 2 + 1] = 30;
    const { d, cmd } = trex(s);
    d.x = d.px = 100;
    for (let i = 0; i < 240; i++) step(s, cmd({ x: 900, y: 480 }, false, false, 1), DT);
    const def = getDino('trex');
    expect(d.speed).toBeCloseTo(def.maxSpeed * def.currentSlow!, 5);
    expect(d.y).toBeCloseTo(480, 5);
  });
});

describe('wild t-rex', () => {
  it('sometimes spawns as a wild carnivore', () => {
    const s = createMatch(3, { cols: 120, rows: 120 });
    for (let i = 0; i < 60; i++) spawnWild(s);
    expect(s.dinos.some((d) => d.kind === 'trex' && d.team === WILD_TEAM)).toBe(true);
  });
});
