import { describe, expect, it } from 'vitest';
import { WILD_TEAM, type GameState } from '../../src/sim/types';
import { createMatch, step } from '../../src/sim/sim';
import { addPlayer } from '../../src/sim/players';
import { createDino } from '../../src/sim/world';
import { makeWildAi } from '../../src/sim/ai';
import { CAMP, towersOf } from '../../src/sim/camp';
import { eliminateTeam } from '../../src/sim/rounds';
import { SMALL } from '../helpers';

const DT = 1 / 60;
const run = (s: GameState, sec: number) => {
  for (let i = 0; i < Math.round(sec * 60); i++) step(s, new Map(), DT);
};

function arena() {
  const s = createMatch(6, { ...SMALL, water: false }, { teams: 2 });
  // Both teams staffed (riders sit in their own camps), so no camp collapses for being empty.
  addPlayer(s, 'team0', 'triceratops', 'X');
  addPlayer(s, 'team1', 'triceratops', 'Y');
  s.round.phase = 'playing';
  const tower = towersOf(s, 'team1')[0];
  return { s, tower };
}

/** Put a dino 150 px from the tower, on the side away from the camp, standing still. */
function near(s: GameState, tower: { x: number; y: number }, d: { x: number; y: number; px: number; py: number }) {
  const base = s.teams[1].base;
  const a = Math.atan2(tower.y - base.y, tower.x - base.x);
  d.x = d.px = tower.x + Math.cos(a) * 150;
  d.y = d.py = tower.y + Math.sin(a) * 150;
}

describe('towers', () => {
  it('shoot an enemy rider in range at about 10 DPS', () => {
    const { s, tower } = arena();
    const p = addPlayer(s, 'team0', 'triceratops', 'A');
    const d = s.dinos.find((x) => x.playerId === p.id)!;
    near(s, tower, d);
    const hp = d.hp;
    run(s, 3);
    expect(d.hp).toBeLessThan(hp);
    expect(tower.target).toBe(d.id);
    const dps = (hp - d.hp) / 3;
    expect(dps).toBeGreaterThan(4);
    expect(dps).toBeLessThan(14);
  });

  it('ignore their own riders and grazing herbivores, but shoot wild carnivores', () => {
    const { s, tower } = arena();
    const own = addPlayer(s, 'team1', 'triceratops', 'B');
    const od = s.dinos.find((x) => x.playerId === own.id)!;
    near(s, tower, od);
    od.meleeCooldown = 999;
    const herb = createDino(s, 'triceratops', WILD_TEAM, 0, 0);
    herb.ai = makeWildAi(s);
    herb.ai.mode = 'graze';
    near(s, tower, herb);
    herb.x += 40;
    herb.meleeCooldown = 999;
    run(s, 1);
    expect(tower.target).toBeNull();
    const raptor = createDino(s, 'velociraptor', WILD_TEAM, 0, 0);
    raptor.ai = makeWildAi(s);
    near(s, tower, raptor);
    raptor.x -= 40;
    let targeted = false;
    for (let i = 0; i < 30; i++) {
      step(s, new Map(), DT);
      if (tower.target === raptor.id) targeted = true;
    }
    expect(targeted).toBe(true);
  });

  it('rebuild 90 s after being destroyed, unless the team is out', () => {
    const { s, tower } = arena();
    tower.hp = 0;
    tower.rebuildIn = CAMP.towerRebuild;
    run(s, CAMP.towerRebuild - 1);
    expect(tower.hp).toBe(0);
    run(s, 2);
    expect(tower.hp).toBe(CAMP.towerHp);
    const t2 = towersOf(s, 'team0')[0];
    eliminateTeam(s, 'team0');
    t2.rebuildIn = 1;
    run(s, 2);
    expect(t2.hp).toBe(0);
  });

  it('a destroyed tower does not fire', () => {
    const { s, tower } = arena();
    tower.hp = 0;
    tower.rebuildIn = 50;
    const p = addPlayer(s, 'team0', 'triceratops', 'A');
    near(s, tower, s.dinos.find((x) => x.playerId === p.id)!);
    run(s, 1);
    expect(s.projectiles.filter((q) => q.ownerId === tower.id)).toHaveLength(0);
  });

  it('wild AI tolerates a tower attacker', () => {
    const { s, tower } = arena();
    const raptor = createDino(s, 'velociraptor', WILD_TEAM, 0, 0);
    raptor.ai = makeWildAi(s);
    near(s, tower, raptor);
    expect(() => run(s, 3)).not.toThrow();
    expect(raptor.lastAttacker === tower.id || raptor.hp < raptor.maxHp).toBe(true);
  });
});
