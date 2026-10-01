import { describe, expect, it } from 'vitest';
import type { DinoDef, GameState, InputCommand } from '../../src/sim/types';
import { DEG, angleDiff, wrapAngle } from '../../src/sim/math';
import { getDino, registerDino } from '../../src/sim/defs/dinos';
import { createMatch, step } from '../../src/sim/sim';
import { addPlayer, createTeam } from '../../src/sim/players';
import { createDino } from '../../src/sim/world';
import { mountFrame, selectFiringMounts, updateAim } from '../../src/sim/systems/aiming';
import { fireMounts } from '../../src/sim/systems/firing';

// A test-only broadside dino: two back mounts facing left and right, no head.
const SIDE_DINO: DinoDef = {
  kind: 'test-diplodocus',
  radius: 14,
  maxSpeed: 40,
  reverseSpeed: 20,
  accel: 60,
  decel: 100,
  turnRate: 1,
  turnPenaltyAtSpeed: 0,
  hp: 200,
  mounts: [
    { id: 'left', parent: 'body', offset: { x: 0, y: -4 }, baseAngle: -Math.PI / 2, arcHalf: 30 * DEG, turnSpeed: 4, weapon: 'hornCannon', muzzle: 8 },
    { id: 'right', parent: 'body', offset: { x: 0, y: 4 }, baseAngle: Math.PI / 2, arcHalf: 30 * DEG, turnSpeed: 4, weapon: 'hornCannon', muzzle: 8 },
  ],
};
registerDino(SIDE_DINO);

function emptyGame(): GameState {
  const s = createMatch(1, { cols: 20, rows: 20 });
  s.world.obstacles = [];
  s.world.grid = s.world.grid.map(() => []);
  s.dinos = [];
  return s;
}

function settleAim(s: GameState, id: number, aim: { x: number; y: number }, seconds = 2) {
  const d = s.dinos.find((x) => x.id === id)!;
  let errors: number[] = [];
  for (let t = 0; t < seconds * 60; t++) errors = updateAim(d, getDino(d.kind), aim, 1 / 60);
  return { d, errors };
}

describe('triceratops aiming', () => {
  it('covers about +-35 degrees forward (head 25 + weapon 10)', () => {
    const s = emptyGame();
    const d = createDino(s, 'triceratops', 'player', 160, 160, 0);
    // Target 30 degrees to the right, far away: reachable.
    const { errors } = settleAim(s, d.id, { x: 160 + Math.cos(30 * DEG) * 400, y: 160 + Math.sin(30 * DEG) * 400 });
    expect(errors[0]).toBeLessThan(2 * DEG);
    const barrel = mountFrame(d, getDino('triceratops'), 0).angle;
    expect(barrel).toBeCloseTo(30 * DEG, 1);
  });

  it('clamps the shot forward when the cursor is behind the dino', () => {
    const s = emptyGame();
    const d = createDino(s, 'triceratops', 'player', 160, 160, 0);
    settleAim(s, d.id, { x: 160 - 100, y: 160 + 30 });
    const barrel = mountFrame(d, getDino('triceratops'), 0).angle;
    expect(Math.abs(wrapAngle(barrel))).toBeLessThanOrEqual(35 * DEG + 1e-6);
    expect(barrel).toBeGreaterThan(30 * DEG); // swung fully to the side nearest the cursor
  });

  it('fires projectiles along the barrel, not toward the cursor', () => {
    const s = emptyGame();
    const d = createDino(s, 'triceratops', 'player', 160, 160, 0);
    const behind = { x: 60, y: 160 };
    const { errors } = settleAim(s, d.id, behind);
    fireMounts(s, d, selectFiringMounts(errors));
    expect(s.projectiles).toHaveLength(1);
    const p = s.projectiles[0];
    const shotAngle = Math.atan2(p.vy, p.vx);
    const barrel = mountFrame(d, getDino('triceratops'), 0).angle;
    expect(Math.abs(angleDiff(shotAngle, barrel))).toBeLessThanOrEqual(0.03 + 1e-9); // within spread
    expect(p.vx).toBeGreaterThan(0); // forward, even though the cursor is behind
  });

  it('turns limited by turn speed (no instant snap)', () => {
    const s = emptyGame();
    const d = createDino(s, 'triceratops', 'player', 160, 160, 0);
    updateAim(d, getDino('triceratops'), { x: 160, y: 400 }, 1 / 60);
    expect(d.headYaw).toBeCloseTo(2.8 / 60, 5);
  });
});

describe('broadside dino aiming', () => {
  it('only the right-side mount fires at a target on the right', () => {
    const s = emptyGame();
    const d = createDino(s, 'test-diplodocus', 'player', 160, 160, 0);
    const { errors } = settleAim(s, d.id, { x: 170, y: 400 });
    expect(selectFiringMounts(errors)).toEqual([1]);
  });

  it('cannot fire forward: barrels stay within their side arcs', () => {
    const s = emptyGame();
    const d = createDino(s, 'test-diplodocus', 'player', 160, 160, 0);
    const { errors } = settleAim(s, d.id, { x: 600, y: 160 });
    const def = getDino('test-diplodocus');
    const left = mountFrame(d, def, 0).angle;
    const right = mountFrame(d, def, 1).angle;
    expect(left).toBeCloseTo(-60 * DEG, 5);
    expect(right).toBeCloseTo(60 * DEG, 5);
    expect(Math.min(...errors)).toBeGreaterThan(50 * DEG);
    expect(selectFiringMounts(errors)).toHaveLength(1);
  });
});

describe('simulation step', () => {
  it('moves a rider forward with throttle and is deterministic', () => {
    const run = () => {
      const s = createMatch(42);
      const team = createTeam(s)!;
      const p = addPlayer(s, team.id, 'triceratops', 'A');
      const cmd: InputCommand = { throttle: 1, turn: 0.3, aimWorld: { x: 0, y: 0 }, fire: true };
      const inputs = new Map([[p.id, cmd]]);
      const start = { ...s.dinos[0] };
      for (let i = 0; i < 300; i++) step(s, inputs, 1 / 60);
      const d = s.dinos.find((x) => x.playerId === p.id)!;
      return { x: d.x, y: d.y, moved: Math.hypot(d.x - start.x, d.y - start.y), rng: s.rng.s, shots: s.tick };
    };
    const a = run();
    expect(a).toEqual(run());
    expect(a.moved).toBeGreaterThan(50);
  });
});
