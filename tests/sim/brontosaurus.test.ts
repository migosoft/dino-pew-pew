import { describe, expect, it } from 'vitest';
import type { GameState, InputCommand, Vec2 } from '../../src/sim/types';
import { DT, WILD_TEAM } from '../../src/sim/types';
import { getDino } from '../../src/sim/defs/dinos';
import { createMatch, step } from '../../src/sim/sim';
import { createDino } from '../../src/sim/world';
import { addPlayer, createTeam } from '../../src/sim/players';
import { makeWildAi } from '../../src/sim/ai';

/** Open dry ground with no obstacles or food. */
function arena(): GameState {
  const s = createMatch(12, { cols: 60, rows: 60, water: false }, { camps: false });
  s.world.obstacles = [];
  s.world.grid = s.world.grid.map(() => []);
  s.food = [];
  return s;
}

/** A ridden Brontosaurus at (480, 480) facing east, plus a command builder. */
function bronto(s: GameState) {
  const p = addPlayer(s, createTeam(s)!.id, 'brontosaurus', 'A');
  const d = s.dinos.find((o) => o.playerId === p.id)!;
  d.x = d.px = 480;
  d.y = d.py = 480;
  d.heading = d.pheading = 0;
  const cmd = (aim: Vec2, fire: boolean, ability = false): Map<number, InputCommand> =>
    new Map([[p.id, { throttle: 0, turn: 0, aimWorld: aim, fire, ability }]]);
  return { d, cmd };
}

/** Mount ids that fired during `ticks` with the cursor at `aim`. */
function firedMounts(aim: Vec2, ticks = 30): string[] {
  const s = arena();
  const { d, cmd } = bronto(s);
  const def = getDino('brontosaurus');
  const fired = new Set<string>();
  for (let i = 0; i < ticks; i++) {
    step(s, cmd(aim, true), DT);
    for (const e of s.events) if (e.type === 'shot' && e.dinoId === d.id) fired.add(def.mounts[e.mount].id);
  }
  return [...fired].sort();
}

describe('brontosaurus weapons platform', () => {
  it('has two guns on each flank and one at the rear', () => {
    const def = getDino('brontosaurus');
    expect(def.mounts.filter((m) => m.baseAngle < 0)).toHaveLength(2);
    expect(def.mounts.filter((m) => m.baseAngle > 0 && m.baseAngle < Math.PI)).toHaveLength(2);
    expect(def.mounts.filter((m) => m.baseAngle === Math.PI)).toHaveLength(1);
  });

  it('fires only the guns on the side of the cursor', () => {
    // Facing east: north (-y) is its left, south is its right, west is behind it.
    expect(firedMounts({ x: 480, y: 300 })).toEqual(['broadsideL1', 'broadsideL2']);
    expect(firedMounts({ x: 480, y: 660 })).toEqual(['broadsideR1', 'broadsideR2']);
    expect(firedMounts({ x: 300, y: 480 })).toEqual(['tailGun']);
  });

  it('fires nothing at a cursor straight ahead', () => {
    expect(firedMounts({ x: 700, y: 480 })).toEqual([]);
  });
});

describe('brontosaurus tail whip', () => {
  it('hits and shoves a hostile behind it, once', () => {
    const s = arena();
    const { d, cmd } = bronto(s);
    const whip = getDino('brontosaurus').ability!;
    const enemy = createDino(s, 'velociraptor', WILD_TEAM, 440, 480, 0);
    const before = enemy.x;
    let hits = 0;
    for (let i = 0; i < 40; i++) {
      enemy.meleeCooldown = 999;
      step(s, cmd({ x: 480, y: 300 }, false, i === 0), DT);
      hits += s.events.filter((e) => e.type === 'melee' && e.attackerId === d.id).length;
      if (i === 0) expect(s.events.some((e) => e.type === 'ability' && e.kind === 'whip')).toBe(true);
    }
    expect(hits).toBe(1);
    expect(enemy.maxHp - enemy.hp).toBeCloseTo(whip.damage, 5);
    expect(enemy.x).toBeLessThan(before - whip.knockback! + 1);
    expect(d.abilityT).toBe(-1);
    expect(d.abilityCooldown).toBeGreaterThan(whip.cooldown - 1);
  });

  it('misses a hostile in front of it, but whips dinos in their own camp', () => {
    const s = arena();
    const { d, cmd } = bronto(s);
    const ahead = createDino(s, 'velociraptor', WILD_TEAM, 520, 480, Math.PI);
    const campTeam = createTeam(s)!;
    const camper = createDino(s, 'velociraptor', campTeam.id, campTeam.base.x, campTeam.base.y, 0);
    // Put the brontosaurus with its tail right next to the camper.
    for (let i = 0; i < 40; i++) {
      ahead.meleeCooldown = camper.meleeCooldown = 999;
      if (i === 0) {
        d.x = d.px = campTeam.base.x + 40;
        d.y = d.py = campTeam.base.y;
        ahead.x = d.x + 40;
        ahead.y = d.y;
      }
      step(s, cmd({ x: d.x, y: d.y - 200 }, false, i === 0), DT);
    }
    expect(ahead.hp).toBe(ahead.maxHp);
    expect(camper.hp).toBeLessThan(camper.maxHp);
  });

  it('wild brontosaurs whip at hostiles behind them now and then', () => {
    const s = arena();
    const wild = createDino(s, 'brontosaurus', WILD_TEAM, 480, 480, 0);
    wild.ai = makeWildAi(s);
    const p = addPlayer(s, createTeam(s)!.id, 'velociraptor', 'A');
    const r = s.dinos.find((o) => o.playerId === p.id)!;
    let whips = 0;
    for (let i = 0; i < 60 * 20; i++) {
      // Keep the raptor parked right behind its tail.
      r.x = r.px = wild.x - Math.cos(wild.heading) * 38;
      r.y = r.py = wild.y - Math.sin(wild.heading) * 38;
      r.hp = r.maxHp;
      r.meleeCooldown = 999;
      step(s, new Map([[p.id, { throttle: 0, turn: 0, aimWorld: wild, fire: false }]]), DT);
      whips += s.events.filter((e) => e.type === 'whip' && e.dinoId === wild.id).length;
    }
    expect(whips).toBeGreaterThanOrEqual(1);
    expect(whips).toBeLessThanOrEqual(2);
  });
});
