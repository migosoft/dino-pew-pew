import { describe, expect, it } from 'vitest';
import { DT } from '../../src/sim/types';
import { createMatch, step } from '../../src/sim/sim';
import { addPlayer, createTeam } from '../../src/sim/players';
import { SNAPSHOT_EVERY, buildSnapshot, type SnapshotMsg, type TimedEvent } from '../../src/net/protocol';
import { INTERP_TICKS, Mirror } from '../../src/client/net/Mirror';

/** Run a server-side match and feed its snapshots into a client mirror with fake timing. */
function simulate(ticks: number) {
  const s = createMatch(9);
  const p = addPlayer(s, createTeam(s)!.id, 'triceratops', 'A');
  const mirror = new Mirror();
  const inputs = new Map([[p.id, { throttle: 1, turn: 0.2, aimWorld: { x: 0, y: 0 }, fire: true }]]);
  let pending: TimedEvent[] = [];
  const truth = new Map<number, { x: number; y: number }>();
  for (let i = 0; i < ticks; i++) {
    step(s, inputs, DT);
    for (const e of s.events) pending.push({ ...e, tick: s.tick });
    truth.set(s.tick, { x: s.dinos[0].x, y: s.dinos[0].y });
    if (s.tick % SNAPSHOT_EVERY === 0) {
      const snap = { ...buildSnapshot(s, pending), ack: 0 } as SnapshotMsg;
      mirror.push(JSON.parse(JSON.stringify(snap)), (s.tick / 60) * 1000);
      pending = [];
    }
  }
  return { s, mirror, truth };
}

describe('client mirror', () => {
  it('renders INTERP_TICKS behind the server clock', () => {
    const { s, mirror } = simulate(120);
    expect(mirror.renderTick((s.tick / 60) * 1000)).toBeCloseTo(s.tick - INTERP_TICKS, 5);
  });

  it('interpolates dino positions between snapshots to match the server', () => {
    const { mirror, truth } = simulate(120);
    for (const tick of [100, 101, 102, 104.5]) {
      const d = mirror.dinosAt(tick)[0];
      const exact = truth.get(Math.floor(tick))!;
      expect(Math.hypot(d.x - exact.x, d.y - exact.y)).toBeLessThan(1.5);
    }
  });

  it('spawns projectiles from shot events and moves them like the server', () => {
    const { s, mirror } = simulate(90);
    mirror.takeEvents(s.tick);
    const local = mirror.projectilesAt(s.tick);
    expect(local.length).toBeGreaterThan(0);
    for (const p of local) {
      const server = s.projectiles.find((sp) => sp.id === p.id);
      if (!server) continue; // already removed server-side this tick
      expect(Math.hypot(p.x - server.x, p.y - server.y)).toBeLessThan(0.5);
    }
  });
});
