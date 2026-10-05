import { describe, expect, it } from 'vitest';
import { bannerFor, campStatus, eventLine, zoneLine } from '../../src/client/render/hudModel';
import type { RoundInfo, StructureInfo, TeamInfo } from '../../src/net/protocol';

const teams: TeamInfo[] = [
  { id: 'b', slot: 1, name: 'RED', base: { x: 0, y: 0 }, players: 1, eliminated: false },
  { id: 'a', slot: 0, name: 'GREEN', base: { x: 0, y: 0 }, players: 1, eliminated: false },
];
let nextId = 1;
const st = (team: string, kind: 'camp' | 'tower', hp: number, extra: Partial<StructureInfo> = {}): StructureInfo => ({
  id: nextId++, team, kind, x: 0, y: 0, hp, maxHp: kind === 'camp' ? 3000 : 400, angle: 0, hitFlash: false, field: false, rebuildIn: 0, ...extra,
});
const round = (phase: RoundInfo['phase'], timer = 0, winner: string | null = null): RoundInfo => ({ phase, timer, winner });
const input = (o: Partial<Parameters<typeof bannerFor>[0]> = {}) => ({
  round: round('playing'), teams, meTeam: 'a', dead: false, respawn: 0, spectating: false, ...o,
});

describe('zone line', () => {
  it('names the camp and the shop, adds HEALING when hurt', () => {
    expect(zoneLine(false, false)).toBe('');
    expect(zoneLine(true, false)).toBe('YOUR CAMP - E: SHOP');
    expect(zoneLine(true, true)).toBe('YOUR CAMP - E: SHOP  HEALING');
  });
});

describe('camp status', () => {
  it('sorts by slot and reads camp hp, standing towers and the field', () => {
    const s = [
      st('b', 'camp', 3000), st('a', 'camp', 1500, { field: true }),
      ...[400, 0, 400, 0, 400].map((hp) => st('a', 'tower', hp)),
    ];
    const c = campStatus(s, teams);
    expect(c.map((x) => x.name)).toEqual(['GREEN', 'RED']);
    expect(c[0].hpFrac).toBe(0.5);
    expect(c[0].towers).toEqual([true, false, true, false, true]);
    expect(c[0].field).toBe(true);
    expect(c[1].towers).toEqual([false, false, false, false, false]);
    expect(c[1].field).toBe(false);
  });
  it('marks an eliminated team', () => {
    const c = campStatus([st('a', 'camp', 0)], [{ ...teams[1], eliminated: true }]);
    expect(c[0].eliminated).toBe(true);
    expect(c[0].hpFrac).toBe(0);
  });
});

describe('round banner', () => {
  it('waiting and countdown', () => {
    expect(bannerFor(input({ round: round('waiting') }))).toMatchObject({ text: 'WAITING FOR RIDERS', sub: 'EVERY TEAM NEEDS A RIDER - CAMPS ARE PROTECTED' });
    expect(bannerFor(input({ round: round('countdown', 7) })).text).toBe('ROUND STARTS IN 7');
  });
  it('playing shows nothing', () => {
    expect(bannerFor(input())).toEqual({ text: '', sub: '', winner: null });
  });
  it('over names the winner or a draw', () => {
    expect(bannerFor(input({ round: round('over', 12, 'b') }))).toEqual({ text: 'TEAM RED WINS', sub: 'NEXT ROUND IN 12', winner: 'b' });
    expect(bannerFor(input({ round: round('over', 3) }))).toEqual({ text: 'DRAW', sub: 'NEXT ROUND IN 3', winner: null });
  });
  it('respawn beats the round banner', () => {
    expect(bannerFor(input({ round: round('countdown', 5), dead: true, respawn: 2.2 })).text).toBe('RESPAWN IN 3');
  });
  it('an eliminated rider gets no centre text (the elimination panel says it), never the respawn countdown', () => {
    const t = [{ ...teams[1], eliminated: true }, teams[0]];
    expect(bannerFor(input({ teams: t, dead: true, respawn: 1 })).text).toBe('');
    // But when the round is over the winner banner takes over.
    expect(bannerFor(input({ teams: t, dead: true, round: round('over', 9, 'b') })).text).toBe('TEAM RED WINS');
  });
  it('a spectator sees the round banner but not the fallen text', () => {
    const t = [{ ...teams[1], eliminated: true }, teams[0]];
    expect(bannerFor(input({ teams: t, dead: true, spectating: true })).text).toBe('');
    expect(bannerFor(input({ teams: t, dead: true, spectating: true, round: round('countdown', 4) })).text).toBe('ROUND STARTS IN 4');
  });
});

describe('feed lines', () => {
  const ev = (e: Parameters<typeof eventLine>[0]) => eventLine(e, 'KIM', teams);
  it('tower down, up, camp down, eliminated', () => {
    expect(ev({ type: 'towerDown', structureId: 1, team: 'b', by: 1 })?.text).toBe('KIM DESTROYED A RED TOWER');
    expect(eventLine({ type: 'towerDown', structureId: 1, team: 'b', by: null }, undefined, teams)?.text).toBe('SOMEONE DESTROYED A RED TOWER');
    expect(ev({ type: 'towerUp', structureId: 1, team: 'a' })?.text).toBe('GREEN TOWER REBUILT');
    expect(ev({ type: 'campDown', team: 'b', by: 1 })?.text).toBe('RED CAMP DESTROYED');
    expect(ev({ type: 'campDown', team: 'b', by: null })?.text).toBe('RED CAMP ABANDONED');
    expect(ev({ type: 'eliminated', team: 'a' })?.text).toBe('TEAM GREEN IS OUT');
  });
  it('round won and unrelated events add nothing', () => {
    expect(ev({ type: 'roundWon', team: 'a' })).toBeNull();
    expect(ev({ type: 'phase', phase: 'over' })).toBeNull();
  });
});

describe('camp status clamp', () => {
  it('keeps the hp fraction within 0..1', () => {
    expect(campStatus([st('a', 'camp', 5000)], teams)[0].hpFrac).toBe(1);
  });
});
