// Wire protocol shared by the game server and the browser client (JSON over WebSocket).
// The server is authoritative: clients send inputs, the server sends snapshots.
// Inputs carry a sequence number that snapshots acknowledge (the input applied on the
// latest tick), which client-side prediction uses to replay the inputs still in flight.

import type { Dino, FoodSource, GameEvent, GameState, InputCommand, RoundPhase, Structure, StructureKind, Vec2 } from '../sim/types';
import { validSettings, type MapInfo, type RoundSettings } from '../sim/maps';
import { fieldUp } from '../sim/camp';
import { getDino } from '../sim/defs/dinos';
import { findTeam } from '../sim/world';
import { clamp } from '../sim/math';
import { teamName } from '../sim/players';
import { UPGRADE_STATS, type UpgradeStat, type Upgrades } from '../sim/upgrades';

export const PROTOCOL_VERSION = 4;
/** The server broadcasts a snapshot every N simulation ticks (60 Hz / 3 = 20 Hz). */
export const SNAPSHOT_EVERY = 3;

// ---------------------------------------------------------------- client -> server

export type ClientMsg =
  | { t: 'join'; team: string; kind: string; setup?: RoundSettings }
  | { t: 'switch'; team: string; kind: string }
  | { t: 'input'; seq: number; input: InputCommand }
  | { t: 'buy'; stat: UpgradeStat };

/** Validate and clamp an untrusted client message. Returns null for anything malformed. */
export function parseClientMsg(raw: string): ClientMsg | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null) return null;
  const o = m as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  if (o.t === 'join' || o.t === 'switch') {
    if (typeof o.team !== 'string' || typeof o.kind !== 'string' || o.team.length > 32 || o.kind.length > 32) return null;
    if (o.t === 'switch') return { t: 'switch', team: o.team, kind: o.kind };
    if (o.setup === undefined) return { t: 'join', team: o.team, kind: o.kind };
    const st = o.setup as Record<string, unknown> | null;
    const setup = st && typeof st === 'object' ? validSettings(st.teams, st.map) : null;
    return setup ? { t: 'join', team: o.team, kind: o.kind, setup } : null;
  }
  if (o.t === 'buy') {
    return UPGRADE_STATS.includes(o.stat as UpgradeStat) ? { t: 'buy', stat: o.stat as UpgradeStat } : null;
  }
  if (o.t === 'input') {
    const seq = num(o.seq);
    const th = num(o.th);
    const tu = num(o.tu);
    const ax = num(o.ax);
    const ay = num(o.ay);
    if (seq === null || th === null || tu === null || ax === null || ay === null) return null;
    return {
      t: 'input',
      seq: Math.floor(seq),
      input: {
        throttle: clamp(th, -1, 1),
        turn: clamp(tu, -1, 1),
        aimWorld: { x: clamp(ax, -1e5, 1e5), y: clamp(ay, -1e5, 1e5) },
        fire: o.f === 1 || o.f === true,
        ability: o.ab === 1 || o.ab === true,
      },
    };
  }
  return null;
}

export function encodeInput(seq: number, c: InputCommand): string {
  return JSON.stringify({ t: 'input', seq, th: c.throttle, tu: c.turn, ax: Math.round(c.aimWorld.x), ay: Math.round(c.aimWorld.y), f: c.fire ? 1 : 0, ab: c.ability ? 1 : 0 });
}

// ---------------------------------------------------------------- server -> client

export interface TeamInfo {
  id: string;
  slot: number;
  name: string;
  base: Vec2;
  players: number;
  /** True once the team's camp is destroyed and it has no riders left. */
  eliminated: boolean;
}

export interface PlayerInfo {
  id: number;
  name: string;
  team: string;
  kind: string;
  dinoId: number | null;
  respawn: number;
  kills: number;
  deaths: number;
  money: number;
  upgrades: Upgrades;
}

export interface SpeciesInfo {
  kind: string;
  diet: string;
  hp: number;
  speed: number;
}

export interface LobbyInfo {
  protocol: number;
  /** The running round's settings, or null while the server is empty (the first player picks them). */
  setup: RoundSettings | null;
  /** Maps offered for each team count. */
  maps: MapInfo[];
  phase: RoundPhase | null;
  teams: TeamInfo[];
  canJoin: boolean;
  players: number;
  maxPlayers: number;
  species: SpeciesInfo[];
}

export type TimedEvent = GameEvent & { tick: number };

export interface WelcomeMsg {
  t: 'welcome';
  protocol: number;
  playerId: number;
  seed: number;
  tick: number;
  tickRate: number;
  /** Current food of every plant that is not full. */
  plants: PlantTuple[];
  /** Every carcass in the world right now (snapshots then send only changes). */
  carcasses: CarcassTuple[];
  /** Id of the map recipe the round is played on. */
  map: string;
  /** Number of teams in this round. */
  teams: number;
  /** World size in tiles (the world is square). */
  tiles: number;
}

/** Compact dino encoding: positions in 1/10 px, angles in milliradians. */
export type DinoTuple = [
  id: number,
  kind: string,
  team: string,
  playerId: number,
  x: number,
  y: number,
  heading: number,
  speed: number,
  headYaw: number,
  mounts: number[],
  hp: number,
  maxHp: number,
  /** bit 0: hit flash, bit 1: eating */
  flags: number,
  stride: number,
  /** Progress of the running ability, 1..1000 (0 when none is running). */
  abilityPhase: number,
  /** Ability cooldown in 1/10 s. */
  abilityCd: number,
];

/** A carcass as sent to clients (they appear and vanish at runtime). */
export type CarcassTuple = [id: number, species: string, x: number, y: number, heading: number, food: number, maxFood: number];
/** Remaining food of a world plant (plants are generated client-side from the seed). */
export type PlantTuple = [id: number, food: number];
/** A camp or tower. kind 0 = camp, 1 = tower. flags bit 0: hit flash, bit 1: force field up. */
export type StructureTuple = [id: number, team: string, kind: 0 | 1, x: number, y: number, hp: number, maxHp: number, angle: number, flags: number, rebuildIn: number];

export interface StructureInfo {
  id: number;
  team: string;
  kind: StructureKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  angle: number;
  hitFlash: boolean;
  field: boolean;
  rebuildIn: number;
}

export interface RoundInfo {
  phase: RoundPhase;
  timer: number;
  winner: string | null;
}

export interface SnapshotMsg {
  t: 'snap';
  tick: number;
  /** Last input sequence number the server applied for the receiving player. */
  ack: number;
  dinos: DinoTuple[];
  /** Left out when unchanged since the previous snapshot. */
  players?: PlayerInfo[];
  /** Left out when unchanged since the previous snapshot. */
  teams?: TeamInfo[];
  events: TimedEvent[];
  /** Carcasses that appeared or whose (rounded) food changed since the previous snapshot. */
  carcasses: CarcassTuple[];
  /** Ids of carcasses eaten up or rotted away since the previous snapshot. */
  gone: number[];
  /** Plants whose (rounded) food level changed since the previous snapshot. */
  plants: PlantTuple[];
  /** Every camp and tower. */
  structures: StructureTuple[];
  /** Left out when unchanged since the previous snapshot. */
  round?: RoundInfo;
}

/** Fatal: the connection is closed after this. */
export interface ErrorMsg {
  t: 'error';
  message: string;
}

/** Informational (e.g. a refused purchase). */
export interface NoticeMsg {
  t: 'notice';
  message: string;
}

export type ServerMsg = WelcomeMsg | SnapshotMsg | ErrorMsg | NoticeMsg;

const q = (v: number, s: number) => Math.round(v * s);

export function encodeDino(d: Dino): DinoTuple {
  return [
    d.id,
    d.kind,
    d.team,
    d.playerId ?? -1,
    q(d.x, 10),
    q(d.y, 10),
    q(d.heading, 1000),
    q(d.speed, 10),
    q(d.headYaw, 1000),
    d.mounts.map((m) => q(m.angle, 1000)),
    Math.ceil(d.hp),
    d.maxHp,
    (d.hitFlash > 0 ? 1 : 0) | (d.eating ? 2 : 0),
    q(d.stride, 10),
    abilityPhase(d),
    Math.ceil(d.abilityCooldown * 10),
  ];
}

function abilityDuration(kind: string): number {
  return getDino(kind).ability?.duration ?? 1;
}

function abilityPhase(d: Dino): number {
  if (d.abilityT < 0) return 0;
  return clamp(Math.round((d.abilityT / abilityDuration(d.kind)) * 1000), 1, 1000);
}

/** Rebuild a render-ready Dino from a tuple. Server-only fields get neutral values. */
export function decodeDino(t: DinoTuple): Dino {
  const [id, kind, team, playerId, x, y, heading, speed, headYaw, mounts, hp, maxHp, flags, stride, phase, abilityCd] = t;
  const d: Dino = {
    id,
    kind,
    team,
    playerId: playerId < 0 ? null : playerId,
    x: x / 10,
    y: y / 10,
    heading: heading / 1000,
    speed: speed / 10,
    headYaw: headYaw / 1000,
    mounts: mounts.map((a) => ({ angle: a / 1000, cooldown: 0 })),
    hp,
    maxHp,
    alive: true,
    hitFlash: flags & 1 ? 0.1 : 0,
    meleeCooldown: 0,
    abilityCooldown: abilityCd / 10,
    abilityT: phase > 0 ? (phase / 1000) * abilityDuration(kind) : -1,
    abilityFrom: { x: 0, y: 0 },
    abilityTo: { x: 0, y: 0 },
    abilityHit: [],
    lastAttacker: null,
    sinceHit: 999,
    damageMul: 1,
    fireIntervalMul: 1,
    rangeMul: 1,
    armor: 0,
    stride: stride / 10,
    eating: (flags & 2) !== 0,
    px: 0,
    py: 0,
    pheading: 0,
  };
  d.px = d.x;
  d.py = d.y;
  d.pheading = d.heading;
  return d;
}

export function encodeStructure(state: GameState, s: Structure): StructureTuple {
  const field = s.kind === 'camp' && s.hp > 0 && fieldUp(state, s.team);
  return [s.id, s.team, s.kind === 'camp' ? 0 : 1, Math.round(s.x), Math.round(s.y), Math.ceil(s.hp), s.maxHp, q(s.angle, 1000), (s.hitFlash > 0 ? 1 : 0) | (field ? 2 : 0), Math.ceil(s.rebuildIn)];
}

export function decodeStructure(t: StructureTuple): StructureInfo {
  const [id, team, kind, x, y, hp, maxHp, angle, flags, rebuildIn] = t;
  return { id, team, kind: kind === 0 ? 'camp' : 'tower', x, y, hp, maxHp, angle: angle / 1000, hitFlash: (flags & 1) !== 0, field: (flags & 2) !== 0, rebuildIn };
}

export function roundInfo(state: GameState): RoundInfo {
  return { phase: state.round.phase, timer: Math.ceil(state.round.timer), winner: state.round.winner };
}

export function teamInfos(state: GameState): TeamInfo[] {
  return state.teams.map((t) => ({
    id: t.id,
    slot: t.slot,
    name: teamName(t),
    base: t.base,
    players: state.players.filter((p) => p.team === t.id).length,
    eliminated: t.eliminated,
  }));
}

export function playerInfos(state: GameState): PlayerInfo[] {
  return state.players.map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team,
    kind: p.kind,
    dinoId: p.dinoId,
    // Whole seconds: the list then changes once a second while someone waits, not every tick.
    respawn: Math.max(0, Math.ceil(p.respawn)),
    kills: p.kills,
    deaths: p.deaths,
    money: p.money,
    upgrades: { ...p.upgrades },
  }));
}

export function encodeCarcass(f: FoodSource): CarcassTuple {
  return [f.id, f.species ?? '', q(f.x, 1), q(f.y, 1), q(f.heading ?? 0, 100), Math.ceil(f.food), Math.round(f.maxFood)];
}

export function carcassTuples(state: GameState): CarcassTuple[] {
  return state.food.filter((f) => f.kind === 'carcass').map(encodeCarcass);
}

/** Rounded food level of every plant, for change detection. */
export function plantLevels(state: GameState): Map<number, number> {
  const m = new Map<number, number>();
  for (const f of state.food) if (f.kind !== 'carcass') m.set(f.id, Math.ceil(f.food));
  return m;
}

/** What changed since the previous snapshot. Anything not given is sent in full (players, teams, carcasses) or empty. */
export interface SnapshotChanges {
  plants?: PlantTuple[];
  carcasses?: CarcassTuple[];
  gone?: number[];
  /** null: unchanged, left out of the snapshot. */
  players?: PlayerInfo[] | null;
  teams?: TeamInfo[] | null;
  /** null: unchanged, left out of the snapshot. */
  round?: RoundInfo | null;
}

/** Snapshot body without the per-recipient `ack`. */
export function buildSnapshot(state: GameState, events: TimedEvent[], changes: SnapshotChanges = {}): Omit<SnapshotMsg, 'ack'> {
  const players = changes.players === undefined ? playerInfos(state) : changes.players;
  const teams = changes.teams === undefined ? teamInfos(state) : changes.teams;
  const round = changes.round === undefined ? roundInfo(state) : changes.round;
  return {
    t: 'snap',
    tick: state.tick,
    dinos: state.dinos.filter((d) => d.alive).map(encodeDino),
    ...(players ? { players } : {}),
    ...(teams ? { teams } : {}),
    events,
    carcasses: changes.carcasses ?? carcassTuples(state),
    gone: changes.gone ?? [],
    plants: changes.plants ?? [],
    structures: state.structures.map((s) => encodeStructure(state, s)),
    ...(round ? { round } : {}),
  };
}

export function speciesInfo(kind: string): SpeciesInfo {
  const d = getDino(kind);
  return { kind: d.kind, diet: d.diet, hp: d.hp, speed: d.maxSpeed };
}

export function isKnownTeam(state: GameState, id: string): boolean {
  return findTeam(state, id) !== undefined;
}
