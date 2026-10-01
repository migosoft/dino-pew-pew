import { describe, expect, it } from 'vitest';
import type { Dino, GameState } from '../../src/sim/types';
import { WILD_TEAM } from '../../src/sim/types';
import { getDino } from '../../src/sim/defs/dinos';
import { getWeapon } from '../../src/sim/defs/weapons';
import { createMatch, step } from '../../src/sim/sim';
import { createDino } from '../../src/sim/world';
import { RESPAWN_TIME, addPlayer, createTeam } from '../../src/sim/players';
import { applyDamage } from '../../src/sim/systems/damage';
import { fireMounts } from '../../src/sim/systems/firing';
import {
  MAX_UPGRADE_LEVEL,
  RIDER_BOUNTY_BASE,
  RIDER_BOUNTY_PER_LEVEL,
  buyUpgrade,
  upgradeCost,
} from '../../src/sim/upgrades';

function setup() {
  const s = createMatch(31);
  const red = createTeam(s)!;
  const blue = createTeam(s)!;
  const a = addPlayer(s, red.id, 'triceratops', 'A');
  const b = addPlayer(s, blue.id, 'triceratops', 'B');
  const dino = (pid: number) => s.dinos.find((d) => d.playerId === pid)!;
  return { s, red, blue, a, b, dino };
}

function toOpenGround(s: GameState, d: Dino, dx = 0) {
  d.x = d.px = s.world.width / 2 + dx;
  d.y = d.py = s.world.height / 2;
}

describe('bounties', () => {
  it('killing a wild dino pays its species bounty to the rider', () => {
    const { s, a, dino } = setup();
    const w = createDino(s, 'velociraptor', WILD_TEAM, 500, 500, 0, null);
    applyDamage(s, w, 999, dino(a.id).id);
    expect(a.money).toBe(getDino('velociraptor').bounty);
    expect(s.events.some((e) => e.type === 'bounty' && e.playerId === a.id)).toBe(true);
  });

  it('an enemy rider is worth more the more upgrades it carried, and loses them on death', () => {
    const { s, a, b, dino } = setup();
    b.upgrades = { damage: 2, range: 1, fireRate: 0, armor: 1 };
    const victim = dino(b.id);
    toOpenGround(s, victim);
    victim.armor = 0;
    applyDamage(s, victim, 999, dino(a.id).id);
    expect(a.money).toBe(RIDER_BOUNTY_BASE + 4 * RIDER_BOUNTY_PER_LEVEL);
    expect(b.upgrades).toEqual({ damage: 0, range: 0, fireRate: 0, armor: 0 });
  });

  it('money survives death; a fresh dino after respawn has base stats', () => {
    const { s, b, dino } = setup();
    b.money = 500;
    expect(buyUpgrade(s, b.id, 'damage')).toBe('ok');
    const d = dino(b.id);
    expect(d.damageMul).toBeCloseTo(1.15);
    toOpenGround(s, d);
    applyDamage(s, d, 999, -1);
    for (let i = 0; i < (RESPAWN_TIME + 0.2) * 60; i++) step(s, new Map(), 1 / 60);
    expect(b.money).toBe(500 - upgradeCost('damage', 0));
    expect(dino(b.id).damageMul).toBe(1);
  });
});

describe('shop', () => {
  it('costs grow per level', () => {
    expect(upgradeCost('range', 0)).toBe(40);
    expect(upgradeCost('range', 1)).toBe(64);
    expect(upgradeCost('damage', 2)).toBeGreaterThan(upgradeCost('damage', 1));
  });

  it('only sells inside your own base camp, with enough money, up to the level cap', () => {
    const { s, a, dino } = setup();
    expect(buyUpgrade(s, a.id, 'armor')).toBe('no-money');
    a.money = 100_000;
    toOpenGround(s, dino(a.id));
    expect(buyUpgrade(s, a.id, 'armor')).toBe('not-in-base');
    const base = s.teams.find((t) => t.id === a.team)!.base;
    dino(a.id).x = base.x;
    dino(a.id).y = base.y;
    for (let i = 0; i < MAX_UPGRADE_LEVEL; i++) expect(buyUpgrade(s, a.id, 'armor')).toBe('ok');
    expect(buyUpgrade(s, a.id, 'armor')).toBe('max-level');
    expect(a.upgrades.armor).toBe(MAX_UPGRADE_LEVEL);
  });

  it('upgrades change real combat numbers', () => {
    const { s, a, b, dino } = setup();
    a.money = 100_000;
    for (const stat of ['damage', 'range', 'fireRate'] as const) for (let i = 0; i < 2; i++) buyUpgrade(s, a.id, stat);
    const d = dino(a.id);
    fireMounts(s, d, [0]);
    const p = s.projectiles.at(-1)!;
    const w = getWeapon('hornCannon');
    expect(p.damage).toBeCloseTo(w.damage * 1.3);
    expect(p.range).toBeCloseTo(w.range * 1.24);
    expect(d.mounts[0].cooldown).toBeCloseTo(w.fireInterval * 0.88 ** 2);

    // Armor absorbs part of incoming damage.
    b.money = 100_000;
    for (let i = 0; i < 3; i++) buyUpgrade(s, b.id, 'armor');
    const tb = dino(b.id);
    toOpenGround(s, tb);
    applyDamage(s, tb, 50, d.id);
    expect(tb.hp).toBeCloseTo(100 - 50 * (1 - 0.24));
  });
});
