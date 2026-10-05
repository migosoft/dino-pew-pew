import { describe, expect, it } from 'vitest';
import { createMatch } from '../../src/sim/sim';
import { addPlayer, createTeam } from '../../src/sim/players';
import { carcassTuples, decodeDino, encodeDino, encodeInput, parseClientMsg, decodeStructure, encodeStructure, roundInfo, buildSnapshot, teamInfos, PROTOCOL_VERSION } from '../../src/net/protocol';
import { towersOf } from '../../src/sim/camp';
import { makeCarcass } from '../../src/sim/systems/feeding';
import { SMALL } from '../helpers';

describe('dino codec', () => {
  it('round-trips every field the client renders (within quantization)', () => {
    const s = createMatch(3, SMALL);
    const p = addPlayer(s, createTeam(s)!.id, 'triceratops', 'A');
    const d = s.dinos[0];
    Object.assign(d, { x: 123.456, y: 789.01, heading: -2.3456, speed: 33.33, headYaw: 0.321, hp: 57.4, hitFlash: 0.05, stride: 42.42, eating: true });
    d.mounts[0].angle = -0.1234;
    const back = decodeDino(JSON.parse(JSON.stringify(encodeDino(d))));
    expect(back.id).toBe(d.id);
    expect(back.kind).toBe(d.kind);
    expect(back.team).toBe(d.team);
    expect(back.playerId).toBe(p.id);
    expect(back.x).toBeCloseTo(d.x, 1);
    expect(back.y).toBeCloseTo(d.y, 1);
    expect(back.heading).toBeCloseTo(d.heading, 2);
    expect(back.speed).toBeCloseTo(d.speed, 1);
    expect(back.headYaw).toBeCloseTo(d.headYaw, 2);
    expect(back.mounts[0].angle).toBeCloseTo(-0.1234, 2);
    expect(back.hp).toBe(58);
    expect(back.maxHp).toBe(d.maxHp);
    expect(back.hitFlash).toBeGreaterThan(0);
    expect(back.stride).toBeCloseTo(d.stride, 1);
    expect(back.eating).toBe(true);
    d.eating = false;
    d.hitFlash = 0;
    const plain = decodeDino(encodeDino(d));
    expect([plain.eating, plain.hitFlash]).toEqual([false, 0]);
    expect(plain.abilityT).toBe(-1);
  });

  it('round-trips the ability progress and cooldown', () => {
    const s = createMatch(3, SMALL);
    addPlayer(s, createTeam(s)!.id, 'velociraptor', 'A');
    const d = s.dinos[0];
    d.abilityT = 0.2;
    d.abilityCooldown = 12.34;
    const back = decodeDino(JSON.parse(JSON.stringify(encodeDino(d))));
    expect(back.abilityT).toBeCloseTo(0.2, 2);
    expect(back.abilityCooldown).toBeCloseTo(12.4, 5);
    d.abilityT = 0;
    expect(decodeDino(encodeDino(d)).abilityT).toBeGreaterThanOrEqual(0);
  });

  it('encodes carcasses with species, heading and food', () => {
    const s = createMatch(3, SMALL);
    s.food = [makeCarcass(77, 'velociraptor', 10.4, 20.6, 1.234)];
    const [t] = carcassTuples(s);
    expect(t[0]).toBe(77);
    expect(t[1]).toBe('velociraptor');
    expect([t[2], t[3]]).toEqual([10, 21]);
    expect(t[4] / 100).toBeCloseTo(1.23, 2);
    expect(t[5]).toBe(t[6]);
  });
});

describe('client message validation', () => {
  it('accepts and clamps a valid input', () => {
    const m = parseClientMsg(encodeInput(7, { throttle: 1, turn: -1, aimWorld: { x: 10, y: 20 }, fire: true, ability: true }));
    expect(m).toEqual({ t: 'input', seq: 7, input: { throttle: 1, turn: -1, aimWorld: { x: 10, y: 20 }, fire: true, ability: true } });
    const plain = parseClientMsg(encodeInput(8, { throttle: 0, turn: 0, aimWorld: { x: 0, y: 0 }, fire: false }));
    expect(plain && plain.t === 'input' && plain.input.ability).toBe(false);
    const wild = parseClientMsg(JSON.stringify({ t: 'input', seq: 1, th: 99, tu: -99, ax: 1e12, ay: 0, f: 1 }));
    expect(wild && wild.t === 'input' && wild.input.throttle).toBe(1);
    expect(wild && wild.t === 'input' && wild.input.turn).toBe(-1);
  });

  it('rejects malformed or hostile messages', () => {
    for (const raw of ['nope', 'null', '[]', '{"t":"input","seq":"1"}', '{"t":"input","seq":1,"th":NaN}', '{"t":"teleport"}', JSON.stringify({ t: 'join', team: 'x'.repeat(100), kind: 'triceratops' })]) {
      expect(parseClientMsg(raw)).toBeNull();
    }
  });
});

describe('protocol 4', () => {
  it('round-trips structures, including the force field flag', () => {
    const s = createMatch(3, SMALL, { teams: 2 });
    const tower = towersOf(s, 'team1')[0];
    tower.hp = 123.4;
    tower.angle = 1.234;
    tower.rebuildIn = 0;
    const back = decodeStructure(encodeStructure(s, tower));
    expect(back).toMatchObject({ id: tower.id, team: 'team1', kind: 'tower', x: tower.x, y: tower.y, hp: 124, maxHp: 400, field: false });
    expect(back.angle).toBeCloseTo(1.234, 2);
    const camp = s.structures.find((x) => x.kind === 'camp' && x.team === 'team1')!;
    expect(decodeStructure(encodeStructure(s, camp)).field).toBe(true);
  });

  it('puts structures and the round into snapshots, and marks eliminated teams', () => {
    const s = createMatch(3, SMALL, { teams: 2 });
    s.teams[1].eliminated = true;
    const snap = buildSnapshot(s, []);
    expect(snap.structures).toHaveLength(12);
    expect(snap.round).toEqual({ phase: 'waiting', timer: 0, winner: null });
    expect(teamInfos(s)[1].eliminated).toBe(true);
    expect(buildSnapshot(s, [], { round: null }).round).toBeUndefined();
    expect(roundInfo(s).phase).toBe('waiting');
  });

  it('parses join with a setup, and switch', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'join', team: 'team0', kind: 'trex', setup: { teams: 2, map: 'crossing' } }))).toEqual({ t: 'join', team: 'team0', kind: 'trex', setup: { teams: 2, map: 'crossing' } });
    expect(parseClientMsg(JSON.stringify({ t: 'join', team: 'team0', kind: 'trex', setup: { teams: 4, map: 'crossing' } }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'join', team: 'team0', kind: 'trex' }))).toEqual({ t: 'join', team: 'team0', kind: 'trex' });
    expect(parseClientMsg(JSON.stringify({ t: 'switch', team: 'team1', kind: 'velociraptor' }))).toEqual({ t: 'switch', team: 'team1', kind: 'velociraptor' });
    expect(parseClientMsg(JSON.stringify({ t: 'switch', team: 7, kind: 'x' }))).toBeNull();
    expect(PROTOCOL_VERSION).toBe(4);
  });
});
