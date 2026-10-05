import { describe, expect, it } from 'vitest';
import type { GameState } from '../../src/sim/types';
import { createMatch, step } from '../../src/sim/sim';
import { RESPAWN_TIME, TEAM_EMPTY_TIMEOUT, addPlayer, removePlayer } from '../../src/sim/players';
import { COUNTDOWN, eliminateTeam, switchTeam } from '../../src/sim/rounds';
import { campOf } from '../../src/sim/camp';
import { tryStartAbility } from '../../src/sim/systems/abilities';
import { isAirborne } from '../../src/sim/world';
import { SMALL } from '../helpers';

const run = (s: GameState, sec: number) => {
  for (let i = 0; i < Math.round(sec * 60); i++) step(s, new Map(), 1 / 60);
};

describe('rounds', () => {
  it('waits until every team has a rider, then counts down and starts', () => {
    const s = createMatch(1, SMALL, { teams: 3 });
    addPlayer(s, 'team0', 'triceratops', 'A');
    addPlayer(s, 'team1', 'triceratops', 'B');
    run(s, 2);
    expect(s.round.phase).toBe('waiting');
    addPlayer(s, 'team2', 'triceratops', 'C');
    run(s, 0.1);
    expect(s.round.phase).toBe('countdown');
    run(s, COUNTDOWN);
    expect(s.round.phase).toBe('playing');
  });

  it('falls back to waiting if a team empties during the countdown', () => {
    const s = createMatch(1, SMALL, { teams: 2 });
    addPlayer(s, 'team0', 'triceratops', 'A');
    const b = addPlayer(s, 'team1', 'triceratops', 'B');
    run(s, 1);
    removePlayer(s, b.id);
    run(s, 0.1);
    expect(s.round.phase).toBe('waiting');
  });

  it('collapses the camp of a team that stays empty during the round', () => {
    const s = createMatch(1, SMALL, { teams: 2 });
    addPlayer(s, 'team0', 'triceratops', 'A');
    const b = addPlayer(s, 'team1', 'triceratops', 'B');
    run(s, COUNTDOWN + 0.5);
    removePlayer(s, b.id);
    run(s, TEAM_EMPTY_TIMEOUT - 1);
    expect(campOf(s, 'team1')!.hp).toBeGreaterThan(0);
    run(s, 2);
    expect(campOf(s, 'team1')!.hp).toBe(0);
    expect(s.round.phase).toBe('over');
    expect(s.round.winner).toBe('team0');
    // Teams no longer dissolve.
    expect(s.teams).toHaveLength(2);
  });

  it('keeps eliminated riders dead, until they switch to a surviving team', () => {
    const s = createMatch(1, SMALL, { teams: 3 });
    addPlayer(s, 'team0', 'triceratops', 'A');
    const b = addPlayer(s, 'team1', 'velociraptor', 'B');
    addPlayer(s, 'team2', 'triceratops', 'C');
    run(s, COUNTDOWN + 0.5);
    eliminateTeam(s, 'team1');
    run(s, RESPAWN_TIME + 1);
    expect(b.dinoId).toBeNull();
    expect(s.dinos.some((x) => x.playerId === b.id && x.alive)).toBe(false);
    expect(switchTeam(s, b.id, 'team1', 'trex')).toBe('bad-team');
    expect(switchTeam(s, b.id, 'team2', 'trex')).toBe('ok');
    run(s, RESPAWN_TIME + 0.1);
    const d = s.dinos.find((x) => x.playerId === b.id)!;
    expect(d.team).toBe('team2');
    expect(d.kind).toBe('trex');
  });

  it('a rider whose camp still stands cannot switch', () => {
    const s = createMatch(1, SMALL, { teams: 2 });
    const a = addPlayer(s, 'team0', 'triceratops', 'A');
    expect(switchTeam(s, a.id, 'team1', 'trex')).toBe('not-eliminated');
  });

  it('elimination kills riders mid-leap cleanly', () => {
    const s = createMatch(1, { ...SMALL, water: false }, { teams: 3 });
    const a = addPlayer(s, 'team1', 'velociraptor', 'A');
    addPlayer(s, 'team0', 'triceratops', 'B');
    addPlayer(s, 'team2', 'triceratops', 'C');
    run(s, COUNTDOWN + 0.5);
    const d = s.dinos.find((x) => x.playerId === a.id)!;
    tryStartAbility(s, d, { throttle: 1, turn: 0, aimWorld: { x: d.x + 100, y: d.y }, fire: false, ability: true });
    step(s, new Map(), 1 / 60);
    expect(isAirborne(d)).toBe(true);
    eliminateTeam(s, 'team1');
    expect(isAirborne(d)).toBe(false);
    expect(d.alive).toBe(false);
    expect(d.hp).toBe(0);
    expect(() => run(s, 2)).not.toThrow();
    expect(s.dinos.some((x) => x.playerId === a.id && x.alive)).toBe(false);
    expect(a.dinoId).toBeNull();
    expect(s.round.phase).toBe('playing');
  });
});
