import { describe, expect, it } from 'vitest';
import { createMatch } from '../../src/sim/sim';
import { CAMP, campOf, fieldUp, standingTowers, towersOf } from '../../src/sim/camp';
import { BASE_RADIUS } from '../../src/sim/players';
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
