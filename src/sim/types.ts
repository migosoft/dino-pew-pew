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
  /** Trigger the species ability (raptor leap, triceratops dash). */
  ability?: boolean;
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
  /** Drawn below the body (a long neck growing out from under the shoulders). Visual only. */
  under?: boolean;
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

/**
 * Active ability on a cooldown: a leap toward the aim point, a straight dash, or a tail whip
 * that sweeps the area behind the dino. All of them deal damage on impact.
 */
export interface AbilityDef {
  kind: 'leap' | 'dash' | 'whip';
  /** Seconds between uses. */
  cooldown: number;
  /** Seconds the ability controls movement. */
  duration: number;
  damage: number;
  /** Leap: min and max distance to the landing point. */
  minRange?: number;
  maxRange?: number;
  /** Dash: pixels per second. */
  speed?: number;
  /** Extra distance beyond touching (sum of radii) at which the impact hits. */
  hitReach: number;
  /** Whip: half-angle around the tail direction that the swing covers, radians. */
  arc?: number;
  /** Whip: how far each struck dino is shoved. */
  knockback?: number;
}

/** A tail drawn as its own bendable links (it trails behind turns, sways and whips). Visual, plus the whip origin. */
export interface TailDef {
  /** Tail root in body-local space (x = forward, so negative = behind). */
  offset: Vec2;
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
  /** All mounts fire together on every trigger pull, each along its own barrel. */
  volley?: boolean;
  /**
   * 'side': a trigger pull fires every mount whose arc holds the aim point, so only the
   * guns on the side of the cursor shoot (broadside platforms).
   */
  fireMode?: 'side';
  ability?: AbilityDef;
  tail?: TailDef;
  /** Where the rider sits, body-local (visual only; default just behind the center). */
  seat?: Vec2;
  /** Fraction of maxSpeed kept in deep water (default 0.6). Big dinos wade better. */
  wadeSpeed?: number;
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
  /** Seconds until the ability can be used again. */
  abilityCooldown: number;
  /** Seconds into the running ability, or -1 when none is running. */
  abilityT: number;
  /** Leap path (start and landing point). */
  abilityFrom: Vec2;
  abilityTo: Vec2;
  /** Dinos already struck by the running dash. */
  abilityHit: number[];
  /** Who damaged this dino last (wild AI reacts to it). */
  lastAttacker: number | null;
  /** Seconds since last damaged. */
  sinceHit: number;
  /** Riderless dinos think for themselves. */
  ai?: WildAi;
  /** Stat multipliers (upgrades). */
  damageMul: number;
  fireIntervalMul: number;
  rangeMul: number;
  /** Fraction of incoming damage absorbed (0..1). */
  armor: number;
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
  /** Wading water: no slowdown. */
  Shallow: 5,
  /** Deep water: dinos slow down to their wadeSpeed. */
  Deep: 6,
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
  | { type: 'ability'; dinoId: number; kind: AbilityDef['kind']; x: number; y: number }
  | { type: 'slam'; dinoId: number; x: number; y: number }
  | { type: 'whip'; dinoId: number; x: number; y: number }
  | { type: 'impact'; projectileId: number; x: number; y: number }
  | { type: 'death'; dinoId: number; x: number; y: number; team: Team }
  | { type: 'kill'; killer: number | null; victim: number | null; victimKind: string }
  | { type: 'spawn'; playerId: number; dinoId: number }
  | { type: 'bounty'; playerId: number; amount: number; x: number; y: number };

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
  /** Earned from kills; kept across deaths. */
  money: number;
  /** Bought in the base camp; lost on death. */
  upgrades: { damage: number; range: number; fireRate: number; armor: number };
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
