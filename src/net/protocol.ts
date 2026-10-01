// Wire protocol shared by the game server and the browser client (JSON over WebSocket).
// The server is authoritative: clients send inputs, the server sends snapshots.
// Inputs carry a sequence number that snapshots acknowledge, so client-side
// prediction/reconciliation can be added later without changing the protocol shape.

import type { Dino, GameEvent, GameState, InputCommand, Vec2 } from '../sim/types';
import { getDino } from '../sim/defs/dinos';
import { findTeam } from '../sim/world';
import { clamp } from '../sim/math';
import { teamName } from '../sim/players';

export const PROTOCOL_VERSION = 2;
/** The server broadcasts a snapshot every N simulation ticks (60 Hz / 3 = 20 Hz). */
export const SNAPSHOT_EVERY = 3;
export const NEW_TEAM = 'new';

// ---------------------------------------------------------------- client -> server

export type ClientMsg =
  | { t: 'join'; team: string; kind: string }
  | { t: 'input'; seq: number; input: InputCommand };

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
  if (o.t === 'join') {
    if (typeof o.team !== 'string' || typeof o.kind !== 'string' || o.team.length > 32 || o.kind.length > 32) return null;
    return { t: 'join', team: o.team, kind: o.kind };
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
      },
    };
  }
  return null;
}

export function encodeInput(seq: number, c: InputCommand): string {
  return JSON.stringify({ t: 'input', seq, th: c.throttle, tu: c.turn, ax: Math.round(c.aimWorld.x), ay: Math.round(c.aimWorld.y), f: c.fire ? 1 : 0 });
}

// ---------------------------------------------------------------- server -> client

export interface TeamInfo {
  id: string;
  slot: number;
  name: string;
  base: Vec2;
  players: number;
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
}

export interface SpeciesInfo {
  kind: string;
  hp: number;
  speed: number;
}

export interface LobbyInfo {
  protocol: number;
  teams: TeamInfo[];
  canCreateTeam: boolean;
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
  flash: number,
  stride: number,
];

export interface SnapshotMsg {
  t: 'snap';
  tick: number;
  /** Last input sequence number the server applied for the receiving player. */
  ack: number;
  dinos: DinoTuple[];
  players: PlayerInfo[];
  teams: TeamInfo[];
  events: TimedEvent[];
}

export interface ErrorMsg {
  t: 'error';
  message: string;
}

export type ServerMsg = WelcomeMsg | SnapshotMsg | ErrorMsg;

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
    d.hitFlash > 0 ? 1 : 0,
    q(d.stride, 10),
  ];
}

/** Rebuild a render-ready Dino from a tuple. Server-only fields get neutral values. */
export function decodeDino(t: DinoTuple): Dino {
  const [id, kind, team, playerId, x, y, heading, speed, headYaw, mounts, hp, maxHp, flash, stride] = t;
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
    hitFlash: flash ? 0.1 : 0,
    bumpCooldown: 0,
    damageMul: 1,
    fireIntervalMul: 1,
    stride: stride / 10,
    px: 0,
    py: 0,
    pheading: 0,
  };
  d.px = d.x;
  d.py = d.y;
  d.pheading = d.heading;
  return d;
}

export function teamInfos(state: GameState): TeamInfo[] {
  return state.teams.map((t) => ({
    id: t.id,
    slot: t.slot,
    name: teamName(t),
    base: t.base,
    players: state.players.filter((p) => p.team === t.id).length,
  }));
}

export function playerInfos(state: GameState): PlayerInfo[] {
  return state.players.map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team,
    kind: p.kind,
    dinoId: p.dinoId,
    respawn: Math.max(0, Math.round(p.respawn * 10) / 10),
    kills: p.kills,
    deaths: p.deaths,
  }));
}

/** Snapshot body without the per-recipient `ack`. */
export function buildSnapshot(state: GameState, events: TimedEvent[]): Omit<SnapshotMsg, 'ack'> {
  return {
    t: 'snap',
    tick: state.tick,
    dinos: state.dinos.filter((d) => d.alive).map(encodeDino),
    players: playerInfos(state),
    teams: teamInfos(state),
    events,
  };
}

export function speciesInfo(kind: string): SpeciesInfo {
  const d = getDino(kind);
  return { kind: d.kind, hp: d.hp, speed: d.maxSpeed };
}

export function isKnownTeam(state: GameState, id: string): boolean {
  return findTeam(state, id) !== undefined;
}
