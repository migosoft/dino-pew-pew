import type { GameState, Structure, StructureKind, Team, TeamState, Vec2, WeaponDef } from './types';
import { angleTo } from './math';

/** Camp and tower balance knobs (see the camp siege spec). */
export const CAMP = {
  /** Camp area: respawn, shop and healing (BASE_RADIUS). */
  radius: 220,
  buildingRadius: 40,
  buildingHp: 3000,
  towers: 5,
  towerRing: 170,
  towerRadius: 14,
  towerHp: 400,
  /** Seconds until a destroyed tower stands again. */
  towerRebuild: 90,
  /** The force field over the building is up while at least this many towers stand. */
  fieldMinTowers: 3,
  healPerSec: 8,
  /** Seconds without damage before the camp heals you. */
  healDelay: 3,
  towerBounty: 60,
  campBounty: 300,
  /** Turret turn rate, rad/s. */
  towerTurnSpeed: 3,
  /** Radians of aim error under which the turret fires. */
  towerAimTolerance: 0.12,
  /** Barrel length: bolts start this far from the tower centre. */
  towerMuzzle: 12,
  /** Player spawn ring around the camp centre: inner and outer radius, and the fallback distance. */
  spawnMin: 60,
  spawnMax: 140,
  spawnFallback: 100,
} as const;

/** The tower turret: about 10 DPS. */
export const TOWER_GUN: WeaponDef = {
  id: 'towerGun',
  fireInterval: 0.4,
  projectileSpeed: 380,
  damage: 4,
  spread: 0.03,
  range: 280,
  projectileKind: 'bolt',
  projectileRadius: 2,
};

/** Default tower spots: evenly on a ring, the first facing `facing` (radians). */
export function towerRing(base: Vec2, facing: number): Vec2[] {
  return Array.from({ length: CAMP.towers }, (_, k) => {
    const a = facing + (k / CAMP.towers) * Math.PI * 2;
    return { x: Math.round(base.x + Math.cos(a) * CAMP.towerRing), y: Math.round(base.y + Math.sin(a) * CAMP.towerRing) };
  });
}

function makeStructure(state: GameState, team: Team, kind: StructureKind, x: number, y: number): Structure {
  const hp = kind === 'camp' ? CAMP.buildingHp : CAMP.towerHp;
  const centre = { x: state.world.width / 2, y: state.world.height / 2 };
  return {
    id: state.nextId++,
    team,
    kind,
    x,
    y,
    radius: kind === 'camp' ? CAMP.buildingRadius : CAMP.towerRadius,
    hp,
    maxHp: hp,
    angle: angleTo({ x, y }, centre),
    cooldown: 0,
    rebuildIn: 0,
    hitFlash: 0,
    target: null,
  };
}

/** Build a team's camp: the building at the base centre and its towers (map recipe spots, or a ring facing the centre). */
export function placeCamp(state: GameState, team: TeamState): void {
  const centre = { x: state.world.width / 2, y: state.world.height / 2 };
  const spots = state.world.towers?.[team.slot] ?? towerRing(team.base, angleTo(team.base, centre));
  state.structures.push(makeStructure(state, team.id, 'camp', team.base.x, team.base.y));
  for (const p of spots) state.structures.push(makeStructure(state, team.id, 'tower', p.x, p.y));
}

export function isStanding(s: Structure): boolean {
  return s.hp > 0;
}

export function campOf(state: GameState, team: Team): Structure | undefined {
  return state.structures.find((s) => s.team === team && s.kind === 'camp');
}

export function towersOf(state: GameState, team: Team): Structure[] {
  return state.structures.filter((s) => s.team === team && s.kind === 'tower');
}

export function standingTowers(state: GameState, team: Team): number {
  let n = 0;
  for (const s of state.structures) if (s.team === team && s.kind === 'tower' && s.hp > 0) n++;
  return n;
}

/** The force field over the camp building is up while enough towers stand. */
export function fieldUp(state: GameState, team: Team): boolean {
  return standingTowers(state, team) >= CAMP.fieldMinTowers;
}
