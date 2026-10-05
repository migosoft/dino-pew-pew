import { describe, expect, it } from 'vitest';
import type { GameState, InputCommand } from '../../src/sim/types';
import { createMatch, step } from '../../src/sim/sim';
import {
  BASE_RADIUS,
  MAX_TEAMS,
  RESPAWN_TIME,
  TEAM_EMPTY_TIMEOUT,
  addPlayer,
  createTeam,
  isInOwnBase,
  removePlayer,
} from '../../src/sim/players';
import { applyDamage } from '../../src/sim/systems/damage';
import { updateProjectiles } from '../../src/sim/systems/projectiles';
import { SMALL } from '../helpers';

const DT = 1 / 60;

function run(s: GameState, seconds: number, inputs = new Map<number, InputCommand>()) {
  for (let i = 0; i < Math.round(seconds * 60); i++) step(s, inputs, DT);
}

function setup() {
  const s = createMatch(77, SMALL);
  const red = createTeam(s)!;
  const blue = createTeam(s)!;
  const a = addPlayer(s, red.id, 'triceratops', 'A');
  const b = addPlayer(s, blue.id, 'triceratops', 'B');
  const da = s.dinos.find((d) => d.playerId === a.id)!;
  const db = s.dinos.find((d) => d.playerId === b.id)!;
  return { s, red, blue, a, b, da, db };
}

/** Move a dino to open ground between the bases. */
function toMidfield(s: GameState, id: number, dx = 0) {
  const d = s.dinos.find((x) => x.id === id)!;
  d.x = d.px = s.world.width / 2 + dx;
  d.y = d.py = s.world.height / 2;
  return d;
}

describe('teams', () => {
  it('assigns separate base camps, up to the team limit', () => {
    const s = createMatch(1, SMALL);
    const teams = Array.from({ length: MAX_TEAMS }, () => createTeam(s)!);
    expect(new Set(teams.map((t) => t.slot)).size).toBe(MAX_TEAMS);
    expect(createTeam(s)).toBeNull();
  });

  it('spawns riders inside their own base', () => {
    const { s, da, db } = setup();
    expect(isInOwnBase(s, da)).toBe(true);
    expect(isInOwnBase(s, db)).toBe(true);
  });

  it('dissolves a team after it has been empty for a while, freeing the slot', () => {
    const { s, a, red } = setup();
    removePlayer(s, a.id);
    expect(s.dinos.some((d) => d.playerId === a.id)).toBe(false);
    run(s, TEAM_EMPTY_TIMEOUT + 1);
    expect(s.teams.some((t) => t.id === red.id)).toBe(false);
    expect(createTeam(s)!.slot).toBe(red.slot);
  });
});

describe('combat between teams', () => {
  it('no friendly fire: projectiles pass through teammates', () => {
    const { s, red } = setup();
    const c = addPlayer(s, red.id, 'triceratops', 'C');
    const dc = toMidfield(s, s.dinos.find((d) => d.playerId === c.id)!.id);
    s.projectiles.push({ id: 999, ownerId: -1, team: red.id, x: dc.x - 20, y: dc.y, px: 0, py: 0, vx: 270, vy: 0, traveled: 0, range: 300, damage: 50, radius: 2, kind: 'bolt', alive: true });
    for (let i = 0; i < 20; i++) updateProjectiles(s, DT);
    expect(dc.hp).toBe(dc.maxHp);
  });

  it('base camps are safe zones: no damage, hostile shots fizzle at the edge', () => {
    const { s, red, db } = setup();
    applyDamage(s, s.dinos.find((d) => d.team === red.id)!, 50, db.id);
    expect(s.dinos.find((d) => d.team === red.id)!.hp).toBe(100);
    // Fire a blue bolt straight at the red base center from outside.
    const base = red.base;
    s.projectiles.push({ id: 998, ownerId: db.id, team: db.team, x: base.x + BASE_RADIUS + 20, y: base.y, px: 0, py: 0, vx: -270, vy: 0, traveled: 0, range: 300, damage: 50, radius: 2, kind: 'bolt', alive: true });
    for (let i = 0; i < 10 && s.projectiles.length; i++) updateProjectiles(s, DT);
    expect(s.projectiles).toHaveLength(0);
    expect(s.events.some((e) => e.type === 'impact')).toBe(true);
  });

  it('a kill credits the killer, and the victim respawns at base after the delay', () => {
    const { s, a, b, da, db } = setup();
    toMidfield(s, da.id);
    toMidfield(s, db.id, 60);
    applyDamage(s, da, 1000, db.id);
    expect(a.dinoId).toBeNull();
    expect(a.deaths).toBe(1);
    expect(b.kills).toBe(1);
    run(s, RESPAWN_TIME + 0.1);
    expect(a.dinoId).not.toBeNull();
    const fresh = s.dinos.find((d) => d.id === a.dinoId)!;
    expect(fresh.hp).toBe(fresh.maxHp);
    expect(isInOwnBase(s, fresh)).toBe(true);
  });

  it('a rider shooting an enemy in the open damages it', () => {
    const { s, a, da, db } = setup();
    const shooter = toMidfield(s, da.id);
    shooter.heading = 0;
    const target = toMidfield(s, db.id, 80);
    const inputs = new Map<number, InputCommand>([[a.id, { throttle: 0, turn: 0, aimWorld: { x: target.x, y: target.y }, fire: true }]]);
    run(s, 1.5, inputs);
    expect(target.hp).toBeLessThan(target.maxHp);
  });
});
