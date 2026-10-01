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

export interface DinoDef {
  kind: string;
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
  bumpCooldown: number;
  /** Stat multipliers (upgrades). */
  damageMul: number;
  fireIntervalMul: number;
  /** Distance travelled, used to animate legs. */
  stride: number;
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
}

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
