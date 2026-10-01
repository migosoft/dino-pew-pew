import { describe, expect, it } from 'vitest';
import { createMatch } from '../../src/sim/sim';
import { addPlayer, createTeam } from '../../src/sim/players';
import { decodeDino, encodeDino, encodeInput, parseClientMsg } from '../../src/net/protocol';

describe('dino codec', () => {
  it('round-trips every field the client renders (within quantization)', () => {
    const s = createMatch(3);
    const p = addPlayer(s, createTeam(s)!.id, 'triceratops', 'A');
    const d = s.dinos[0];
    Object.assign(d, { x: 123.456, y: 789.01, heading: -2.3456, speed: 33.33, headYaw: 0.321, hp: 57.4, hitFlash: 0.05, stride: 42.42 });
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
  });
});

describe('client message validation', () => {
  it('accepts and clamps a valid input', () => {
    const m = parseClientMsg(encodeInput(7, { throttle: 1, turn: -1, aimWorld: { x: 10, y: 20 }, fire: true }));
    expect(m).toEqual({ t: 'input', seq: 7, input: { throttle: 1, turn: -1, aimWorld: { x: 10, y: 20 }, fire: true } });
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
