import { describe, expect, it } from 'vitest';
import type { GameState } from '../../src/sim/types';
import { createMatch } from '../../src/sim/sim';
import { addPlayer, isInOwnBase } from '../../src/sim/players';
import { CAMP, campOf, fieldUp, towersOf } from '../../src/sim/camp';
import { damageStructure } from '../../src/sim/systems/structures';
import { applyDamage } from '../../src/sim/systems/damage';
import { updateProjectiles } from '../../src/sim/systems/projectiles';
import { updateMelee } from '../../src/sim/systems/melee';
import { tryStartAbility, updateAbility } from '../../src/sim/systems/abilities';
import { getDino } from '../../src/sim/defs/dinos';
import { SMALL } from '../helpers';

function siege() {
  const s = createMatch(4, SMALL, { teams: 2 });
  const a = addPlayer(s, 'team0', 'triceratops', 'A');
  const b = addPlayer(s, 'team1', 'triceratops', 'B');
  const da = s.dinos.find((d) => d.playerId === a.id)!;
  const db = s.dinos.find((d) => d.playerId === b.id)!;
  s.round.phase = 'playing';
  return { s, a, b, da, db };
}

/** A bolt from `ownerId` placed right on top of (x, y), moving +x. */
function boltAt(s: GameState, ownerId: number, team: string, x: number, y: number) {
  s.projectiles.push({ id: s.nextId++, ownerId, team, x: x - 1, y, px: x - 1, py: y, vx: 60, vy: 0, traveled: 0, range: 500, damage: 50, radius: 2, kind: 'bolt', alive: true });
}

describe('siege', () => {
  it('structures cannot be damaged before the round is playing', () => {
    const { s, da } = siege();
    s.round.phase = 'waiting';
    const tower = towersOf(s, 'team1')[0];
    expect(damageStructure(s, tower, 100, da.id, tower.x, tower.y)).toBe('immune');
    expect(tower.hp).toBe(CAMP.towerHp);
    expect(s.events.some((e) => e.type === 'structureHit' && e.structureId === tower.id && !e.shielded)).toBe(true);
  });

  it('hostile bullets damage towers; destroying one pays the shooter and starts the rebuild', () => {
    const { s, a, da } = siege();
    const tower = towersOf(s, 'team1')[0];
    tower.hp = 40;
    const money = a.money;
    boltAt(s, da.id, 'team0', tower.x - tower.radius, tower.y);
    updateProjectiles(s, 1 / 60);
    expect(tower.hp).toBe(0);
    expect(tower.rebuildIn).toBe(CAMP.towerRebuild);
    expect(a.money).toBe(money + CAMP.towerBounty);
    expect(s.events.some((e) => e.type === 'towerDown' && e.structureId === tower.id && e.by === a.id)).toBe(true);
  });

  it('friendly bullets pass through their own towers and building', () => {
    const { s, db } = siege();
    const tower = towersOf(s, 'team1')[0];
    const camp = campOf(s, 'team1')!;
    boltAt(s, db.id, 'team1', tower.x, tower.y);
    boltAt(s, db.id, 'team1', camp.x, camp.y);
    updateProjectiles(s, 1 / 60);
    expect(tower.hp).toBe(CAMP.towerHp);
    expect(camp.hp).toBe(CAMP.buildingHp);
    expect(s.projectiles).toHaveLength(2);
  });

  it('the force field blocks hits on the building while 3 or more towers stand', () => {
    const { s, da } = siege();
    const camp = campOf(s, 'team1')!;
    expect(damageStructure(s, camp, 100, da.id, camp.x, camp.y)).toBe('shielded');
    expect(camp.hp).toBe(CAMP.buildingHp);
    const towers = towersOf(s, 'team1');
    towers[0].hp = towers[1].hp = 0;
    expect(fieldUp(s, 'team1')).toBe(true);
    towers[2].hp = 0;
    expect(fieldUp(s, 'team1')).toBe(false);
    expect(damageStructure(s, camp, 100, da.id, camp.x, camp.y)).toBe('hit');
    expect(camp.hp).toBe(CAMP.buildingHp - 100);
  });

  it('destroying the camp eliminates the team and ends a 2-team round', () => {
    const { s, a, da, db } = siege();
    for (const t of towersOf(s, 'team1')) t.hp = 0;
    const camp = campOf(s, 'team1')!;
    camp.hp = 10;
    damageStructure(s, camp, 50, da.id, camp.x, camp.y);
    const team1 = s.teams.find((t) => t.id === 'team1')!;
    expect(team1.eliminated).toBe(true);
    expect(db.alive).toBe(false);
    expect(s.round.phase).toBe('over');
    expect(s.round.winner).toBe('team0');
    expect(a.money).toBe(CAMP.campBounty);
    expect(s.events.map((e) => e.type)).toEqual(expect.arrayContaining(['campDown', 'eliminated', 'roundWon']));
  });

  it('riders in their own camp are no longer invincible, and shots no longer fizzle at the camp edge', () => {
    const { s, da, db } = siege();
    expect(isInOwnBase(s, db)).toBe(true);
    const hp = db.hp;
    applyDamage(s, db, 10, da.id);
    expect(db.hp).toBe(hp - 10);
    // A bolt inside the enemy camp (180 px out, clear of the towers) flies on instead of fizzling.
    const base = s.teams[1].base;
    boltAt(s, da.id, 'team0', base.x - 150, base.y - 100);
    updateProjectiles(s, 1 / 60);
    expect(s.projectiles.length).toBe(1);
  });
});

describe('melee and abilities vs structures', () => {
  function faceTower(s: GameState, d: GameState['dinos'][number]) {
    const tower = towersOf(s, 'team1')[0];
    const r = getDino(d.kind).radius;
    d.x = tower.x - tower.radius - r - 2;
    d.y = tower.y;
    d.heading = 0;
    return tower;
  }

  it('a rider gores a tower in front of it', () => {
    const { s, da } = siege();
    const tower = faceTower(s, da);
    updateMelee(s, 1 / 60);
    expect(tower.hp).toBe(CAMP.towerHp - getDino('triceratops').melee.damage);
  });

  it('a triceratops dash rams a tower once', () => {
    const { s, da } = siege();
    const tower = faceTower(s, da);
    da.x -= 20;
    tryStartAbility(s, da, { throttle: 1, turn: 0, aimWorld: { x: tower.x, y: tower.y }, fire: false, ability: true });
    for (let i = 0; i < 30; i++) updateAbility(s, da, 1 / 60);
    expect(tower.hp).toBe(CAMP.towerHp - getDino('triceratops').ability!.damage);
  });

  it('wild dinos never damage structures', () => {
    const { s, da } = siege();
    da.playerId = null;
    const tower = faceTower(s, da);
    updateMelee(s, 1 / 60);
    expect(tower.hp).toBe(CAMP.towerHp);
  });
});
