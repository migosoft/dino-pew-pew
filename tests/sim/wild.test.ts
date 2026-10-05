import { describe, expect, it } from 'vitest';
import type { Dino, GameState, InputCommand } from '../../src/sim/types';
import { WILD_TEAM } from '../../src/sim/types';
import { getDino } from '../../src/sim/defs/dinos';
import { createMatch, step } from '../../src/sim/sim';
import { createDino } from '../../src/sim/world';
import { addPlayer, createTeam } from '../../src/sim/players';
import { applyDamage } from '../../src/sim/systems/damage';
import { isHostile, updateMelee } from '../../src/sim/systems/melee';
import { makeWildAi } from '../../src/sim/ai';
import { SPAWN_AWAY_FROM_RIDERS, wildTarget } from '../../src/sim/ecology';
import { BASE_CLEAR } from '../../src/sim/worldgen';
import { SMALL } from '../helpers';

const DT = 1 / 60;
const run = (s: GameState, seconds: number, inputs = new Map<number, InputCommand>()) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) step(s, inputs, DT);
};

/** Open ground with no obstacles or food, for controlled behaviour tests. */
function arena(): GameState {
  const s = createMatch(11, { cols: 60, rows: 60 });
  s.world.obstacles = [];
  s.world.grid = s.world.grid.map(() => []);
  s.food = [];
  return s;
}

function wild(s: GameState, kind: string, x: number, y: number, heading = 0): Dino {
  const d = createDino(s, kind, WILD_TEAM, x, y, heading, null);
  d.ai = makeWildAi(s);
  return d;
}

describe('melee', () => {
  it('strikes a hostile directly in front, on a cooldown', () => {
    const s = arena();
    const a = createDino(s, 'triceratops', 'team0', 400, 400, 0);
    const b = createDino(s, 'triceratops', 'team1', 400 + 24, 400, Math.PI);
    updateMelee(s, DT);
    const hpAfterFirst = b.hp;
    expect(hpAfterFirst).toBe(b.maxHp - getDino('triceratops').melee.damage);
    updateMelee(s, DT);
    expect(b.hp).toBe(hpAfterFirst); // a is on cooldown (b struck a back)
    expect(a.hp).toBeLessThan(a.maxHp);
  });

  it('does not strike sideways, behind, or teammates', () => {
    const s = arena();
    const a = createDino(s, 'triceratops', 'team0', 400, 400, 0);
    const side = createDino(s, 'triceratops', 'team1', 400, 424, 0);
    const mate = createDino(s, 'triceratops', 'team0', 424, 400, 0);
    updateMelee(s, DT);
    expect(side.hp).toBe(side.maxHp);
    expect(mate.hp).toBe(mate.maxHp);
    expect(a.meleeCooldown).toBe(0);
  });

  it('hostility: riders vs everyone else; wild carnivores hunt wild herbivores, not each other', () => {
    const s = arena();
    const rider = createDino(s, 'triceratops', 'team0', 0, 0, 0, 1);
    const herb = wild(s, 'triceratops', 100, 0);
    const raptor = wild(s, 'velociraptor', 200, 0);
    const raptor2 = wild(s, 'velociraptor', 300, 0);
    expect(isHostile(rider, herb)).toBe(true);
    expect(isHostile(raptor, rider)).toBe(true);
    expect(isHostile(raptor, herb)).toBe(true);
    expect(isHostile(herb, raptor)).toBe(false);
    expect(isHostile(raptor, raptor2)).toBe(false);
    raptor.lastAttacker = raptor2.id;
    expect(isHostile(raptor, raptor2)).toBe(true); // hits back
  });
});

describe('wild dinosaurs', () => {
  it('populate the world on match start, away from base camps, and never fire weapons', () => {
    const s = createMatch(21, SMALL, { wildlife: true });
    const w = s.dinos.filter((d) => d.team === WILD_TEAM);
    expect(w.length).toBe(wildTarget(0));
    expect(w.filter((d) => getDino(d.kind).diet === 'herbivore').length).toBeGreaterThan(w.length / 2);
    for (const d of w) for (const b of s.world.bases) expect(Math.hypot(d.x - b.x, d.y - b.y)).toBeGreaterThan(BASE_CLEAR);
    run(s, 10);
    expect(s.projectiles).toHaveLength(0);
    expect(s.events.some((e) => e.type === 'shot')).toBe(false);
  });

  it('top up toward a target that grows with players, spawning away from riders', () => {
    const s = createMatch(22, SMALL, { wildlife: true });
    const t0 = createTeam(s)!;
    const players = [1, 2, 3].map((i) => addPlayer(s, t0.id, 'triceratops', `P${i}`));
    run(s, 30);
    const w = s.dinos.filter((d) => d.team === WILD_TEAM);
    expect(w.length).toBeGreaterThan(wildTarget(0));
    expect(w.length).toBeLessThanOrEqual(wildTarget(players.length));
    // Freshly spawned ones (last few) are not right next to riders.
    const riders = s.dinos.filter((d) => d.playerId !== null);
    for (const d of w.slice(-3)) for (const r of riders) expect(Math.hypot(d.x - r.x, d.y - r.y)).toBeGreaterThan(SPAWN_AWAY_FROM_RIDERS - 200);
  });

  it('a large wild herbivore charges whoever shot it', () => {
    const s = arena();
    const rider = createDino(s, 'velociraptor', 'team0', 300, 400, 0, 99);
    const tri = wild(s, 'triceratops', 420, 400, Math.PI / 2);
    applyDamage(s, tri, 5, rider.id);
    const before = Math.hypot(tri.x - rider.x, tri.y - rider.y);
    run(s, 2);
    expect(tri.ai!.mode).toBe('charge');
    expect(Math.hypot(tri.x - rider.x, tri.y - rider.y)).toBeLessThan(before - 40);
  });

  it('a badly hurt wild herbivore flees instead (as small herbivores always do)', () => {
    const s = arena();
    const rider = createDino(s, 'triceratops', 'team0', 300, 400, 0, 99);
    const tri = wild(s, 'triceratops', 420, 400, Math.PI / 2);
    tri.hp = tri.maxHp * 0.2;
    applyDamage(s, tri, 5, rider.id);
    const before = Math.hypot(tri.x - rider.x, tri.y - rider.y);
    run(s, 2);
    expect(tri.ai!.mode).toBe('flee');
    expect(Math.hypot(tri.x - rider.x, tri.y - rider.y)).toBeGreaterThan(before + 40);
  });

  it('wild raptors hunt a nearby rider and wound it with their claws', () => {
    const s = arena();
    const t = createTeam(s)!;
    const p = addPlayer(s, t.id, 'triceratops', 'A');
    const rider = s.dinos.find((d) => d.playerId === p.id)!;
    rider.x = rider.px = 600;
    rider.y = rider.py = 600;
    const raptor = wild(s, 'velociraptor', 700, 600, Math.PI);
    run(s, 4);
    expect(raptor.ai!.mode).toBe('hunt');
    expect(rider.hp).toBeLessThan(rider.maxHp);
  });

  it('wild raptors ignore riders sheltering in their base camp', () => {
    const s = arena();
    const t = createTeam(s)!;
    const p = addPlayer(s, t.id, 'triceratops', 'A');
    const rider = s.dinos.find((d) => d.playerId === p.id)!;
    rider.x = rider.px = t.base.x;
    rider.y = rider.py = t.base.y;
    const raptor = wild(s, 'velociraptor', t.base.x + 150, t.base.y, Math.PI);
    run(s, 5);
    expect(rider.hp).toBe(rider.maxHp);
    expect(Math.hypot(raptor.x - t.base.x, raptor.y - t.base.y)).toBeGreaterThan(90);
  });

  it('hurt wild carnivores go and eat at a carcass', () => {
    const s = arena();
    const raptor = wild(s, 'velociraptor', 600, 600, 0);
    raptor.hp = 20;
    s.food.push({ id: 5, kind: 'carcass', x: 700, y: 640, reach: 13, food: 240, maxFood: 240, costPerHp: 0.25, idle: 0, variant: 0, species: 'triceratops', heading: 0 });
    run(s, 8);
    expect(raptor.hp).toBeGreaterThan(40);
  });

  it('scales the wild population with map area, capped at 2.5x', () => {
    expect(wildTarget(0)).toBe(28);
    expect(wildTarget(0, 8192 * 8192)).toBe(70);
    expect(wildTarget(100, 8192 * 8192)).toBe(275);
  });
});
