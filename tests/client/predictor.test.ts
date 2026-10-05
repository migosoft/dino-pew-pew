import { describe, expect, it } from 'vitest';
import { DT, type Dino, type InputCommand } from '../../src/sim/types';
import { createMatch, step } from '../../src/sim/sim';
import { addPlayer, createTeam } from '../../src/sim/players';
import { decodeDino, decodeStructure, encodeDino, encodeStructure } from '../../src/net/protocol';
import { Predictor, SNAP_DISTANCE, stepDino } from '../../src/client/net/Predictor';
import { SMALL } from '../helpers';

/** A rider at its camp on the small map, and a scripted drive: full throttle, weaving left and right. */
function setup() {
  const s = createMatch(11, SMALL);
  const team = createTeam(s)!;
  const p = addPlayer(s, team.id, 'triceratops', 'A');
  const d = s.dinos.find((x) => x.playerId === p.id)!;
  const aim = { x: d.x + 300, y: d.y - 120 };
  const cmdAt = (i: number): InputCommand => ({ throttle: i % 90 < 70 ? 1 : -1, turn: Math.sign(Math.sin(i / 25)), aimWorld: aim, fire: false });
  const serverStep = (i: number) => step(s, new Map([[p.id, cmdAt(i)]]), DT);
  /** My dino as a client sees it in a snapshot (quantized). */
  const snapshotDino = () => decodeDino(encodeDino(s.dinos.find((x) => x.playerId === p.id)!));
  const structures = () => s.structures.map((x) => decodeStructure(encodeStructure(s, x)));
  return { s, d, cmdAt, serverStep, snapshotDino, structures };
}

const view = (d: Readonly<Dino>): Dino => ({ ...d, mounts: d.mounts.map((m) => ({ ...m })) });

describe('client prediction', () => {
  it('moves the rider exactly like the server does (same sim code, same order)', () => {
    const { s, d, cmdAt, serverStep } = setup();
    const local: Dino = view(d);
    let travelled = 0;
    for (let i = 0; i < 400; i++) {
      const x0 = local.x;
      const y0 = local.y;
      stepDino(s, local, cmdAt(i));
      serverStep(i);
      travelled += Math.sqrt((local.x - x0) ** 2 + (local.y - y0) ** 2);
      expect(local.x).toBe(d.x);
      expect(local.y).toBe(d.y);
      expect(local.heading).toBe(d.heading);
      expect(local.speed).toBe(d.speed);
      expect(local.headYaw).toBe(d.headYaw);
      expect(local.mounts.map((m) => m.angle)).toEqual(d.mounts.map((m) => m.angle));
    }
    expect(travelled).toBeGreaterThan(200);
  });

  it('replays the inputs the server has not applied yet on top of each snapshot', () => {
    const { s, cmdAt, serverStep, snapshotDino, structures } = setup();
    const pred = new Predictor(s.world);
    pred.setStructures(structures());
    pred.reconcile(snapshotDino(), 0);
    let seq = 0;
    const sent: InputCommand[] = [];
    // The client runs 8 inputs ahead of the server (the round trip), and a snapshot arrives every 3 ticks.
    const LEAD = 8;
    for (let i = 0; i < LEAD; i++) pred.advance(DT, () => cmdAt(i), (c) => (sent.push(c), ++seq));
    for (let tick = 0; tick < 240; tick++) {
      serverStep(tick);
      pred.advance(DT, () => cmdAt(tick + LEAD), (c) => (sent.push(c), ++seq));
      if ((tick + 1) % 3 === 0) {
        pred.setStructures(structures());
        pred.reconcile(snapshotDino(), tick + 1);
        // Where the server will be once it has applied every input sent so far.
        const ahead = view(s.dinos.find((x) => x.playerId !== null)!);
        for (let k = tick + 1; k < seq; k++) stepDino(s, ahead, sent[k]);
        const me = pred.current()!;
        // Equal up to the snapshot's quantization (0.1 px, 1 mrad).
        expect(Math.abs(me.x - ahead.x)).toBeLessThan(0.5);
        expect(Math.abs(me.y - ahead.y)).toBeLessThan(0.5);
        expect(Math.abs(me.heading - ahead.heading)).toBeLessThan(0.01);
      }
    }
  });

  it('glides over a small correction and snaps a large one', () => {
    const { s, snapshotDino } = setup();
    const still = (): InputCommand => ({ throttle: 0, turn: 0, aimWorld: { x: 0, y: 0 }, fire: false });
    const pred = new Predictor(s.world);
    const server = snapshotDino();
    pred.reconcile(server, 0);
    const v = view(server);
    pred.apply(v, DT);
    const x0 = v.x;

    // The server says we are 20 px further east: the drawn dino doesn't jump, it slides over.
    pred.reconcile({ ...server, x: server.x + 20 }, 0);
    const v1 = view(server);
    pred.apply(v1, DT);
    expect(Math.abs(v1.x - x0)).toBeLessThan(5);
    for (let i = 0; i < 60; i++) {
      pred.advance(DT, still, () => 0);
      pred.apply(v1, DT);
    }
    expect(v1.x).toBeCloseTo(server.x + 20, 1);
    expect(pred.lastError).toBeCloseTo(20, 5);

    // A correction beyond SNAP_DISTANCE (respawn-like) is shown at once.
    const far = server.x + 20 + SNAP_DISTANCE + 50;
    pred.reconcile({ ...server, x: far }, 0);
    const v2 = view(server);
    pred.apply(v2, DT);
    expect(v2.x).toBeCloseTo(far, 5);
  });

  it('shows the server state while an ability moves the dino', () => {
    const { s, snapshotDino } = setup();
    const pred = new Predictor(s.world);
    pred.reconcile(snapshotDino(), 0);
    expect(pred.predicting).toBe(true);
    pred.reconcile({ ...snapshotDino(), abilityT: 0.1 }, 0);
    expect(pred.predicting).toBe(false);
    expect(pred.current()).toBeNull();
    pred.reconcile(snapshotDino(), 0);
    expect(pred.predicting).toBe(true);
  });
});
