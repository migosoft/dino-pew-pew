// Core simulation types. Nothing in src/sim may import Phaser: the simulation
// must stay deterministic and runnable headless (tests, future netcode server).

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

export type Team = 'player' | 'enemy';

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

export interface AiState {
  mode: 'approach' | 'engage' | 'sidestep';
  timer: number;
  sideDir: number;
  stuckTime: number;
  aimOffset: Vec2;
  aimTimer: number;
  preferredRange: number;
}

export interface Dino {
  id: number;
  kind: string;
  team: Team;
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
  /** Multipliers applied by wave scaling. */
  damageMul: number;
  fireIntervalMul: number;
  /** Distance travelled, used to animate legs. */
  stride: number;
  ai?: AiState;
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
  spawn: Vec2;
}

export type GameEvent =
  | { type: 'shot'; dinoId: number; mount: number; x: number; y: number; angle: number }
  | { type: 'hit'; x: number; y: number; targetId: number }
  | { type: 'impact'; x: number; y: number }
  | { type: 'death'; dinoId: number; x: number; y: number; team: Team }
  | { type: 'waveStart'; wave: number }
  | { type: 'waveCleared'; wave: number }
  | { type: 'gameOver' };

export interface WaveState {
  number: number;
  phase: 'intermission' | 'active';
  timer: number;
}

export interface GameState {
  tick: number;
  rng: { s: number };
  world: World;
  dinos: Dino[];
  projectiles: Projectile[];
  events: GameEvent[];
  nextId: number;
  playerId: number;
  wave: WaveState;
  score: number;
  gameOver: boolean;
}

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
