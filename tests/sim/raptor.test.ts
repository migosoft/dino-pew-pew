import { describe, expect, it } from 'vitest';
import { DT, type InputCommand } from '../../src/sim/types';
import { getDino } from '../../src/sim/defs/dinos';
import { getWeapon } from '../../src/sim/defs/weapons';
import { createMatch, step } from '../../src/sim/sim';
import { addPlayer, createTeam } from '../../src/sim/players';

function setup() {
  const s = createMatch(7);
  const team = createTeam(s)!;
  const p = addPlayer(s, team.id, 'velociraptor', 'A');
  const d = s.dinos.find((x) => x.playerId === p.id)!;
  // Open ground, facing east.
  d.x = d.px = s.world.width / 2;
  d.y = d.py = s.world.height / 2;
  d.heading = d.pheading = 0;
  const aimAhead = { x: d.x + 120, y: d.y };
  const cmd = (fire: boolean): Map<number, InputCommand> => new Map([[p.id, { throttle: 0, turn: 0, aimWorld: aimAhead, fire }]]);
  return { s, d, cmd };
}

describe('armored velociraptor', () => {
  it('carries a small gun on each side of its saddle that fire as a volley', () => {
    const def = getDino('velociraptor');
    expect(def.volley).toBe(true);
    expect(def.mounts).toHaveLength(2);
    expect(def.mounts.every((m) => m.parent === 'body' && m.weapon === 'raptorSideGun')).toBe(true);
    expect(Math.sign(def.mounts[0].offset.y)).toBe(-Math.sign(def.mounts[1].offset.y));
    // Smaller than the triceratops' cannons.
    expect(getWeapon('raptorSideGun').damage).toBeLessThan(getWeapon('sideCannon').damage);
    expect(Math.abs(def.mounts[0].offset.y)).toBeLessThan(Math.abs(getDino('triceratops').mounts[0].offset.y));
  });

  it('fires two converging projectiles per trigger pull, from opposite flanks', () => {
    const { s, d, cmd } = setup();
    for (let i = 0; i < 30; i++) step(s, cmd(false), DT);
    const before = s.projectiles.length;
    step(s, cmd(true), DT);
    const shots = s.projectiles.slice(before);
    expect(shots).toHaveLength(2);

    const [left, right] = [...shots].sort((a, b) => a.y - b.y);
    expect(left.y).toBeLessThan(d.y - 5);
    expect(right.y).toBeGreaterThan(d.y + 5);
    expect(left.vx).toBeGreaterThan(0);
    expect(right.vx).toBeGreaterThan(0);
    expect(left.vy).toBeGreaterThan(0);
    expect(right.vy).toBeLessThan(0);
  });

  it('both guns share one cooldown', () => {
    const { s, cmd } = setup();
    const interval = getWeapon('raptorSideGun').fireInterval;
    let shots = 0;
    const hold = (ticks: number) => {
      for (let i = 0; i < ticks; i++) {
        step(s, cmd(true), DT);
        shots += s.events.filter((e) => e.type === 'shot').length;
      }
    };
    hold(Math.floor(interval / DT) - 1);
    expect(shots).toBe(2);
    hold(3);
    expect(shots).toBe(4);
  });
});
