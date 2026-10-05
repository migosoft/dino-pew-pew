import { describe, expect, it } from 'vitest';
import type { Dino, GameState, InputCommand, Vec2 } from '../../src/sim/types';
import { DT, WILD_TEAM } from '../../src/sim/types';
import { getDino } from '../../src/sim/defs/dinos';
import { angleTo } from '../../src/sim/math';
import { createMatch, step } from '../../src/sim/sim';
import { createDino, indexObstacles } from '../../src/sim/world';
import { addPlayer, createTeam } from '../../src/sim/players';
import { makeWildAi } from '../../src/sim/ai';

/** Open ground with no obstacles or food. */
function arena(): GameState {
  const s = createMatch(11, { cols: 60, rows: 60, water: false }, { camps: false });
  s.world.obstacles = [];
  s.world.grid = s.world.grid.map(() => []);
  s.food = [];
  return s;
}

/** A rider of `kind` placed at (x, y) facing east, plus a command builder. */
function rider(s: GameState, kind: string, x: number, y: number) {
  const team = createTeam(s)!;
  const p = addPlayer(s, team.id, kind, 'A');
  const d = s.dinos.find((o) => o.playerId === p.id)!;
  d.x = d.px = x;
  d.y = d.py = y;
  d.heading = d.pheading = 0;
  const cmd = (aim: Vec2, ability: boolean): Map<number, InputCommand> => new Map([[p.id, { throttle: 0, turn: 0, aimWorld: aim, fire: false, ability }]]);
  return { d, team, cmd };
}

function run(s: GameState, ticks: number, inputs: () => Map<number, InputCommand>, each?: () => void): void {
  for (let i = 0; i < ticks; i++) {
    each?.();
    step(s, inputs(), DT);
  }
}

const abilityEvents = (s: GameState, id: number) => s.events.filter((e) => e.type === 'ability' && e.dinoId === id).length;

describe('velociraptor leap', () => {
  it('leaps toward the aim point, capped at its max range, and slams hostiles where it lands', () => {
    const s = arena();
    const { d, cmd } = rider(s, 'velociraptor', 400, 400);
    const leap = getDino('velociraptor').ability!;
    const land = { x: 400 + leap.maxRange!, y: 400 };
    const enemy = createDino(s, 'triceratops', 'team3', land.x + 4, land.y, Math.PI);
    const wildDino = createDino(s, 'triceratops', WILD_TEAM, land.x, land.y + 14, 0);
    const mate = createDino(s, 'triceratops', d.team, land.x, land.y - 14, 0);
    // Aim far beyond the max range.
    run(s, 1, () => cmd({ x: 900, y: 400 }, true));
    expect(d.abilityT).toBeGreaterThanOrEqual(0);
    run(s, Math.ceil(leap.duration / DT) + 1, () => cmd({ x: 900, y: 400 }, false), () => (enemy.meleeCooldown = wildDino.meleeCooldown = mate.meleeCooldown = 999));
    expect(d.abilityT).toBe(-1);
    expect(Math.hypot(d.x - 400, d.y - 400)).toBeGreaterThan(leap.maxRange! - 15);
    expect(Math.hypot(d.x - 400, d.y - 400)).toBeLessThan(leap.maxRange! + 15);
    expect(enemy.hp).toBeLessThanOrEqual(enemy.maxHp - leap.damage);
    expect(wildDino.hp).toBeLessThanOrEqual(wildDino.maxHp - leap.damage);
    expect(mate.hp).toBe(mate.maxHp);
  });

  it('passes over dinos in its way and lands short when aimed close', () => {
    const s = arena();
    const { d, cmd } = rider(s, 'velociraptor', 400, 400);
    const blocker = createDino(s, 'triceratops', WILD_TEAM, 425, 400, 0);
    run(s, 40, () => cmd({ x: 450, y: 400 }, true), () => (blocker.meleeCooldown = 999));
    // Landed beyond the blocker instead of being stopped by it.
    expect(d.x).toBeGreaterThan(blocker.x);
  });

  it('cannot be used again until its 15 s cooldown has run out', () => {
    const s = arena();
    const { d, cmd } = rider(s, 'velociraptor', 400, 400);
    const aim = () => ({ x: d.x + 80, y: d.y });
    let uses = 0;
    const hold = (seconds: number) => {
      for (let i = 0; i < Math.round(seconds / DT); i++) {
        step(s, cmd(aim(), true), DT);
        uses += abilityEvents(s, d.id);
      }
    };
    hold(14.5);
    expect(uses).toBe(1);
    expect(getDino('velociraptor').ability!.cooldown).toBe(15);
    hold(1);
    expect(uses).toBe(2);
  });

  it('does not hurt riders sheltering in their own base camp', () => {
    const s = arena();
    const other = createTeam(s)!;
    const { d, cmd } = rider(s, 'velociraptor', other.base.x - 60, other.base.y);
    const safe = createDino(s, 'triceratops', other.id, other.base.x, other.base.y, 0, 999);
    run(s, 40, () => cmd({ x: other.base.x, y: other.base.y }, true), () => (safe.meleeCooldown = 999));
    expect(Math.hypot(d.x - safe.x, d.y - safe.y)).toBeLessThan(40);
    expect(safe.hp).toBe(safe.maxHp);
  });
});

describe('triceratops dash', () => {
  it('charges straight ahead much faster than it can run', () => {
    const s = arena();
    const { d, cmd } = rider(s, 'triceratops', 400, 400);
    const dash = getDino('triceratops').ability!;
    run(s, Math.ceil(dash.duration / DT) + 1, () => cmd({ x: 400, y: 0 }, true));
    // The aim point does not steer the dash.
    expect(Math.abs(d.y - 400)).toBeLessThan(1);
    expect(d.x - 400).toBeGreaterThan(dash.speed! * dash.duration * 0.9);
    expect(d.abilityT).toBe(-1);
    expect(d.speed).toBeLessThanOrEqual(getDino('triceratops').maxSpeed);
  });

  it('rams each hostile in its path once and knocks it aside', () => {
    const s = arena();
    const { d, cmd } = rider(s, 'triceratops', 400, 400);
    const dash = getDino('triceratops').ability!;
    const victim = createDino(s, 'velociraptor', WILD_TEAM, 460, 400, Math.PI);
    const startX = victim.x;
    let hpAfterDash = 0;
    run(
      s,
      60,
      () => cmd({ x: 900, y: 400 }, true),
      () => {
        d.meleeCooldown = 999;
        victim.meleeCooldown = 999;
        if (d.abilityT >= 0) hpAfterDash = victim.hp;
      },
    );
    expect(victim.maxHp - hpAfterDash).toBe(dash.damage);
    expect(victim.hp).toBe(victim.maxHp - dash.damage);
    expect(victim.x).toBeGreaterThan(startX);
  });

  it('stops early against a rock', () => {
    const s = arena();
    const { d, cmd } = rider(s, 'triceratops', 400, 400);
    s.world.obstacles = [{ id: 1, kind: 'rock', x: 440, y: 400, r: 12, variant: 0, canopyR: 0 }];
    indexObstacles(s.world);
    run(s, 12, () => cmd({ x: 900, y: 400 }, true));
    expect(d.abilityT).toBe(-1);
    expect(d.x).toBeLessThan(440 - 12);
  });
});

describe('wild dinos', () => {
  /** Keep a provoked wild dino 80 px from a rider and facing it; count its ability uses. */
  function provoked(kind: string, seconds: number): number[] {
    const s = arena();
    const { d: target } = rider(s, 'triceratops', 600, 600);
    const w: Dino = createDino(s, kind, WILD_TEAM, 520, 600, 0);
    w.ai = makeWildAi(s);
    const uses: number[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      if (w.abilityT < 0) {
        w.x = w.px = target.x - 80;
        w.y = w.py = target.y;
        w.heading = angleTo(w, target);
        w.speed = 0;
      }
      w.lastAttacker = target.id;
      w.sinceHit = 0;
      target.x = 600;
      target.y = 600;
      target.hp = target.maxHp;
      w.hp = w.maxHp;
      step(s, new Map(), DT);
      if (abilityEvents(s, w.id)) uses.push(i * DT);
    }
    return uses;
  }

  it.each(['velociraptor', 'triceratops'])('a wild %s sometimes uses its ability on a target in range, under the cooldown', (kind) => {
    const uses = provoked(kind, 20);
    expect(uses.length).toBeGreaterThanOrEqual(1);
    expect(uses.length).toBeLessThanOrEqual(2);
    // Not instantly: it is a chance, not a reflex.
    expect(uses[0]).toBeGreaterThan(DT);
    if (uses.length === 2) expect(uses[1] - uses[0]).toBeGreaterThanOrEqual(15 - DT);
  });
});
