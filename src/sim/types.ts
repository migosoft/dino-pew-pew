// Core simulation types. Nothing in src/sim may import Phaser: the simulation
// is authoritative on the game server and must stay deterministic and headless.

export interface Vec2 {
  x: number;
  y: number;
}

/** Per-tick intent of a rider. Player input and AI both produce this. */
export interface InputCommand {
  /** -1 (reverse) .. 1 (full ahead) */
  throttle: number;
  /** -1 (counter-clockwise) .. 1 (clockwise) */
  turn: number;
  /** Point in world space the rider wants to shoot at. */
  aimWorld: Vec2;
  fire: boolean;
}

/** A rider team id (see TeamState), or WILD_TEAM for riderless wild dinosaurs. */
export type Team = string;
export const WILD_TEAM = 'wild';

/** An articulated head that can yaw relative to the body (e.g. Triceratops). */
export interface HeadDef {
  /** Neck pivot in body-local space (x = forward). */
  offset: Vec2;
  /** Max yaw either side of straight ahead, radians. */
  maxYaw: number;
  /** Radians per second. */
  yawSpeed: number;
}

/** Where a weapon sits on a dino and which way it can point. */
export interface MountDef {
  id: string;
  parent: 'body' | 'head';
  /** Pivot in the parent's local space (x = parent forward, y = parent right). */
  offset: Vec2;
  /** Rest direction relative to the parent, radians (0 = forward, +PI/2 = right side). */
  baseAngle: number;
  /** Max swivel either side of baseAngle, radians. */
  arcHalf: number;
  /** Radians per second. */
  turnSpeed: number;
  weapon: string;
  /** Distance from pivot to muzzle along the barrel. */
  muzzle: number;
}

/** Every species is one of these; omnivores eat everything. */
export type Diet = 'herbivore' | 'carnivore' | 'omnivore';
/** Small species cannot reach tree foliage and leave smaller carcasses. */
export type BodySize = 'small' | 'large';

/** Natural attack (horns, claws, jaws): automatic against a hostile right in front. */
export interface MeleeDef {
  damage: number;
  /** Extra distance beyond touching (sum of radii). */
  reach: number;
  /** Half-angle in front of the body, radians. */
  arc: number;
  /** Seconds between strikes. */
  interval: number;
}

export interface DinoDef {
  kind: string;
  melee: MeleeDef;
  diet: Diet;
  size: BodySize;
  /** HP regained per second while eating. */
  eatRate: number;
  /** Base money paid for killing one (economy). */
  bounty: number;
  radius: number;
  maxSpeed: number;
  reverseSpeed: number;
  accel: number;
  decel: number;
  /** Radians per second at standstill. */
  turnRate: number;
  /** Fraction of turnRate lost at full speed (heavy dinos turn worse when charging). */
  turnPenaltyAtSpeed: number;
  hp: number;
  head?: HeadDef;
  mounts: MountDef[];
}

export interface WeaponDef {
  id: string;
  /** Seconds between shots. */
  fireInterval: number;
  projectileSpeed: number;
  damage: number;
  /** Random deviation either side, radians. */
  spread: number;
  range: number;
  projectileKind: 'bolt';
  projectileRadius: number;
}

export interface MountState {
  /** Current swivel relative to baseAngle, radians, within +-arcHalf. */
  angle: number;
  /** Seconds until the weapon can fire again. */
  cooldown: number;
}

export interface WildAi {
  mode: 'wander' | 'graze' | 'forage' | 'flee' | 'charge' | 'hunt';
  /** Dino being chased or fled from. */
  target: number | null;
  /** Seconds left in the current mode/decision. */
  timer: number;
  wanderHeading: number;
  sideDir: number;
  stuckTime: number;
}

export interface Dino {
  id: number;
  kind: string;
  team: Team;
  /** Rider's player id, or null for a riderless dino. */
  playerId: number | null;
  x: number;
  y: number;
  /** World heading, radians. 0 = +x (east), +PI/2 = +y (south). */
  heading: number;
  speed: number;
  /** Head yaw relative to body, radians. */
  headYaw: number;
  mounts: MountState[];
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Seconds the hit flash remains visible. */
  hitFlash: number;
  meleeCooldown: number;
  /** Who damaged this dino last (wild AI reacts to it). */
  lastAttacker: number | null;
  /** Seconds since last damaged. */
  sinceHit: number;
  /** Riderless dinos think for themselves. */
  ai?: WildAi;
  /** Stat multipliers (upgrades). */
  damageMul: number;
  fireIntervalMul: number;
  /** Distance travelled, used to animate legs. */
  stride: number;
  /** True while standing at food and healing (this tick). */
  eating: boolean;
  // Previous-tick values, for render interpolation.
  px: number;
  py: number;
  pheading: number;
}

export interface Projectile {
  id: number;
  ownerId: number;
  team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  traveled: number;
  range: number;
  damage: number;
  radius: number;
  kind: 'bolt';
  alive: boolean;
  px: number;
  py: number;
}

export type ObstacleKind = 'rock' | 'tree';

export type FoodKind = 'tree' | 'bush' | 'fern' | 'carcass';

/** Something a dino can eat by standing next to it. Plants regrow; carcasses don't. */
export interface FoodSource {
  id: number;
  kind: FoodKind;
  x: number;
  y: number;
  /** How close (beyond the eater's radius) a dino must stand to eat. */
  reach: number;
  food: number;
  maxFood: number;
  /** Food units consumed per HP healed (carcasses are far more nourishing). */
  costPerHp: number;
  /** Seconds since last eaten (plants regrow after a pause). */
  idle: number;
  /** Visual variant (plants) or species (carcasses). */
  variant: number;
  species?: string;
  heading?: number;
}

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  x: number;
  y: number;
  /** Blocking radius (rock body or tree trunk). */
  r: number;
  /** Visual variant index. */
  variant: number;
  /** Tree canopy radius (visual only). */
  canopyR: number;
}

export const Tile = {
  Grass: 0,
  GrassDark: 1,
  Dirt: 2,
  Mud: 3,
  Fern: 4,
} as const;

export interface World {
  seed: number;
  tileSize: number;
  cols: number;
  rows: number;
  width: number;
  height: number;
  tiles: Uint8Array;
  obstacles: Obstacle[];
  /** Spatial hash: cell index -> obstacle indices. */
  grid: number[][];
  gridCell: number;
  gridCols: number;
  gridRows: number;
  /** Team base camp centers, one per possible team slot (kept clear of obstacles). */
  bases: Vec2[];
  /** Initial food sources (plants + a few old carcasses); the match copies these into state.food. */
  food: FoodSource[];
}

export type GameEvent =
  | {
      type: 'shot';
      dinoId: number;
      mount: number;
      projectileId: number;
      team: Team;
      x: number;
      y: number;
      vx: number;
      vy: number;
      range: number;
    }
  | { type: 'hit'; projectileId: number; x: number; y: number; targetId: number }
  | { type: 'melee'; attackerId: number; targetId: number; x: number; y: number }
  | { type: 'impact'; projectileId: number; x: number; y: number }
  | { type: 'death'; dinoId: number; x: number; y: number; team: Team }
  | { type: 'kill'; killer: number | null; victim: number | null; victimKind: string }
  | { type: 'spawn'; playerId: number; dinoId: number };

export interface TeamState {
  id: Team;
  /** Index into the base slots and team color palettes (0..MAX_TEAMS-1). */
  slot: number;
  base: Vec2;
  /** Seconds the team has had no players; it dissolves after a timeout. */
  emptyFor: number;
}

export interface PlayerState {
  id: number;
  name: string;
  team: Team;
  kind: string;
  /** The rider's current dino, or null while waiting to respawn. */
  dinoId: number | null;
  respawn: number;
  kills: number;
  deaths: number;
}

export interface GameState {
  tick: number;
  rng: { s: number };
  world: World;
  dinos: Dino[];
  projectiles: Projectile[];
  events: GameEvent[];
  nextId: number;
  teams: TeamState[];
  players: PlayerState[];
  food: FoodSource[];
  /** Wild dinosaurs roam and respawn (off in most unit tests). */
  wildlife: boolean;
  wildSpawnTimer: { t: number };
}

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
