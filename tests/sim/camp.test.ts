import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/sim/sim';
import { CAMP, campOf, fieldUp, standingTowers, towersOf } from '../../src/sim/camp';
import { BASE_RADIUS, addPlayer } from '../../src/sim/players';
import { resolveObstacles, structureBlocks } from '../../src/sim/systems/collision';
import { getDino } from '../../src/sim/defs/dinos';
import { worldOptionsFor } from '../../src/sim/maps';
import { CROSSING } from '../../src/sim/maps/crossing';
import { SMALL } from '../helpers';

describe('camps', () => {
  it('creates the requested teams, each with a camp building and 5 towers', () => {
    const s = createMatch(1, { ...SMALL, teams: 3 }, { teams: 3 });
    expect(s.teams.map((t) => t.id)).toEqual(['team0', 'team1', 'team2']);
    expect(s.teams.every((t) => !t.eliminated)).toBe(true);
    for (const t of s.teams) {
      const camp = campOf(s, t.id)!;
      expect([camp.x, camp.y]).toEqual([t.base.x, t.base.y]);
      expect(camp.hp).toBe(CAMP.buildingHp);
      const towers = towersOf(s, t.id);
      expect(towers).toHaveLength(CAMP.towers);
      for (const tw of towers) expect(Math.abs(Math.hypot(tw.x - t.base.x, tw.y - t.base.y) - CAMP.towerRing)).toBeLessThan(1);
      expect(standingTowers(s, t.id)).toBe(5);
      expect(fieldUp(s, t.id)).toBe(true);
    }
    expect(s.round).toEqual({ phase: 'waiting', timer: 0, winner: null });
  });

  it('uses the fixed tower spots of a map recipe', () => {
    const s = createMatch(CROSSING.seed, worldOptionsFor('crossing', 2), { teams: 2 });
    expect(towersOf(s, 'team0').map((t) => ({ x: t.x, y: t.y }))).toEqual(CROSSING.towers[0]);
  });

  it('camp radius covers the tower ring', () => {
    expect(BASE_RADIUS).toBe(CAMP.radius);
    expect(CAMP.radius).toBeGreaterThan(CAMP.towerRing + CAMP.towerRadius);
  });

  it('can be turned off for legacy unit tests', () => {
    const s = createMatch(1, SMALL, { teams: 2, camps: false });
    expect(s.structures).toEqual([]);
  });
});

describe('solid structures', () => {
  it('pushes dinos out of a standing tower, not out of rubble', () => {
    const s = createMatch(2, SMALL, { teams: 2 });
    const p = addPlayer(s, 'team1', 'triceratops', 'A');
    const d = s.dinos.find((x) => x.playerId === p.id)!;
    const tower = towersOf(s, 'team0')[0];
    d.x = tower.x + 3;
    d.y = tower.y;
    resolveObstacles(s, d);
    expect(Math.hypot(d.x - tower.x, d.y - tower.y)).toBeGreaterThanOrEqual(tower.radius + getDino('triceratops').radius - 1e-6);
    tower.hp = 0;
    d.x = tower.x + 3;
    d.y = tower.y;
    resolveObstacles(s, d);
    expect(d.x).toBeCloseTo(tower.x + 3);
  });

  it('spawns riders in their camp but never on the building or a tower', () => {
    const s = createMatch(3, SMALL, { teams: 2 });
    for (let i = 0; i < 12; i++) {
      const p = addPlayer(s, 'team0', 'brontosaurus', `P${i}`);
      const d = s.dinos.find((x) => x.playerId === p.id)!;
      expect(structureBlocks(s, d.x, d.y, getDino('brontosaurus').radius)).toBe(false);
      expect(Math.hypot(d.x - s.teams[0].base.x, d.y - s.teams[0].base.y)).toBeLessThan(BASE_RADIUS);
    }
  });
});

describe('healing aura', () => {
  it('heals riders in their standing camp once they have not been hit for 3 s', () => {
    const s = createMatch(8, SMALL, { teams: 2 });
    const p = addPlayer(s, 'team0', 'triceratops', 'A');
    const d = s.dinos.find((x) => x.playerId === p.id)!;
    d.hp = 50;
    d.sinceHit = 0;
    for (let i = 0; i < 120; i++) step(s, new Map(), 1 / 60);
    expect(d.hp).toBe(50);
    for (let i = 0; i < 120; i++) step(s, new Map(), 1 / 60);
    expect(d.hp).toBeGreaterThan(50 + CAMP.healPerSec * 0.9);
    campOf(s, 'team0')!.hp = 0;
    const before = d.hp;
    for (let i = 0; i < 60; i++) step(s, new Map(), 1 / 60);
    expect(d.hp).toBe(before);
  });
});
