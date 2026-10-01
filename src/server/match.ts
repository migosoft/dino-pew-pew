import type { WebSocket } from 'ws';
import type { GameState, InputCommand } from '../sim/types';
import { DT, TICK_RATE } from '../sim/types';
import { createMatch, step } from '../sim/sim';
import { listDinos } from '../sim/defs/dinos';
import { MAX_PLAYERS, MAX_TEAMS, addPlayer, createTeam, removePlayer } from '../sim/players';
import { buyUpgrade } from '../sim/upgrades';
import {
  NEW_TEAM,
  PROTOCOL_VERSION,
  SNAPSHOT_EVERY,
  buildSnapshot,
  isKnownTeam,
  parseClientMsg,
  plantLevels,
  speciesInfo,
  teamInfos,
  type LobbyInfo,
  type PlantTuple,
  type ServerMsg,
  type TimedEvent,
} from '../net/protocol';

/** Max messages a client may send per second before being cut off. */
const MAX_MSGS_PER_SEC = 150;
/** Skip snapshots to clients whose socket buffer is backed up (slow connection). */
const MAX_BUFFERED_BYTES = 512 * 1024;
const MAX_CATCHUP_TICKS = 10;

interface Session {
  ws: WebSocket;
  playerId: number | null;
  input: InputCommand | null;
  seq: number;
  msgWindowStart: number;
  msgCount: number;
}

/** The one persistent match a server process hosts. */
export class Match {
  readonly state: GameState;
  readonly seed: number;
  private sessions = new Set<Session>();
  private pending: TimedEvent[] = [];
  /** Plant food levels as last broadcast, to send only changes. */
  private sentPlants = new Map<number, number>();
  private nameCounter = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTime = 0;
  private acc = 0;

  constructor(seed: number, { wildlife = true }: { wildlife?: boolean } = {}) {
    this.seed = seed;
    this.state = createMatch(seed, undefined, { wildlife });
    this.sentPlants = plantLevels(this.state);
  }

  lobby(): LobbyInfo {
    const s = this.state;
    return {
      protocol: PROTOCOL_VERSION,
      teams: teamInfos(s),
      canCreateTeam: s.teams.length < MAX_TEAMS,
      canJoin: s.players.length < MAX_PLAYERS,
      players: s.players.length,
      maxPlayers: MAX_PLAYERS,
      species: listDinos().map((d) => speciesInfo(d.kind)),
    };
  }

  start(): void {
    if (this.timer) return;
    this.lastTime = performance.now();
    // Node timers are coarse (≈15 ms on Windows); the accumulator keeps the tick rate exact.
    this.timer = setInterval(() => this.pump(), 1000 / TICK_RATE / 2);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const s of this.sessions) s.ws.close();
  }

  private pump(): void {
    const now = performance.now();
    this.acc += (now - this.lastTime) / 1000;
    this.lastTime = now;
    let n = 0;
    while (this.acc >= DT && n < MAX_CATCHUP_TICKS) {
      this.tick();
      this.acc -= DT;
      n++;
    }
    if (n === MAX_CATCHUP_TICKS) this.acc = 0;
  }

  /** Advance one tick; broadcast a snapshot every SNAPSHOT_EVERY ticks. Public for tests. */
  tick(): void {
    const inputs = new Map<number, InputCommand>();
    for (const s of this.sessions) if (s.playerId !== null && s.input) inputs.set(s.playerId, s.input);
    step(this.state, inputs, DT);
    const tick = this.state.tick;
    for (const e of this.state.events) this.pending.push({ ...e, tick });
    if (tick % SNAPSHOT_EVERY === 0) this.broadcast();
  }

  private broadcast(): void {
    const changed: PlantTuple[] = [];
    for (const [id, food] of plantLevels(this.state)) {
      if (this.sentPlants.get(id) === food) continue;
      this.sentPlants.set(id, food);
      changed.push([id, food]);
    }
    const body = JSON.stringify(buildSnapshot(this.state, this.pending, changed));
    this.pending = [];
    // Splice the per-recipient ack into the shared body instead of re-serializing.
    const rest = body.slice(1);
    for (const s of this.sessions) {
      if (s.playerId === null || s.ws.readyState !== s.ws.OPEN) continue;
      if (s.ws.bufferedAmount > MAX_BUFFERED_BYTES) continue;
      s.ws.send(`{"ack":${s.seq},${rest}`);
    }
  }

  connect(ws: WebSocket): void {
    const session: Session = { ws, playerId: null, input: null, seq: 0, msgWindowStart: Date.now(), msgCount: 0 };
    this.sessions.add(session);
    ws.on('message', (data, isBinary) => {
      if (isBinary) return ws.close(1003, 'binary not supported');
      const now = Date.now();
      if (now - session.msgWindowStart > 1000) {
        session.msgWindowStart = now;
        session.msgCount = 0;
      }
      if (++session.msgCount > MAX_MSGS_PER_SEC) return ws.close(1008, 'rate limit');
      this.handle(session, data.toString());
    });
    ws.on('close', () => {
      this.sessions.delete(session);
      if (session.playerId !== null) removePlayer(this.state, session.playerId);
    });
    ws.on('error', () => ws.close());
  }

  private send(s: Session, msg: ServerMsg): void {
    if (s.ws.readyState === s.ws.OPEN) s.ws.send(JSON.stringify(msg));
  }

  private handle(s: Session, raw: string): void {
    const msg = parseClientMsg(raw);
    if (!msg) return;
    if (msg.t === 'input') {
      if (s.playerId === null || msg.seq <= s.seq) return; // stale or out of order
      s.seq = msg.seq;
      s.input = msg.input;
      return;
    }
    if (msg.t === 'buy') {
      if (s.playerId === null) return;
      const result = buyUpgrade(this.state, s.playerId, msg.stat);
      const why: Record<string, string> = { 'not-in-base': 'SHOP ONLY IN YOUR BASE CAMP', 'max-level': 'ALREADY AT MAX LEVEL', 'no-money': 'NOT ENOUGH MONEY', 'no-dino': 'WAIT UNTIL YOU RESPAWN' };
      if (result !== 'ok') this.send(s, { t: 'notice', message: why[result] });
      return;
    }
    // join
    if (s.playerId !== null) return;
    const state = this.state;
    if (state.players.length >= MAX_PLAYERS) return this.send(s, { t: 'error', message: 'SERVER FULL' });
    if (!listDinos().some((d) => d.kind === msg.kind)) return this.send(s, { t: 'error', message: 'UNKNOWN SPECIES' });
    let teamId = msg.team;
    if (teamId === NEW_TEAM) {
      const team = createTeam(state);
      if (!team) return this.send(s, { t: 'error', message: 'ALL TEAM SLOTS TAKEN' });
      teamId = team.id;
    } else if (!isKnownTeam(state, teamId)) {
      return this.send(s, { t: 'error', message: 'TEAM NO LONGER EXISTS' });
    }
    const player = addPlayer(state, teamId, msg.kind, `RIDER ${++this.nameCounter}`);
    s.playerId = player.id;
    // New clients regenerate full plants from the seed; tell them which ones are already eaten.
    const plants: PlantTuple[] = state.food.filter((f) => f.kind !== 'carcass' && f.food < f.maxFood).map((f) => [f.id, this.sentPlants.get(f.id) ?? Math.ceil(f.food)]);
    this.send(s, { t: 'welcome', protocol: PROTOCOL_VERSION, playerId: player.id, seed: this.seed, tick: state.tick, tickRate: TICK_RATE, plants });
  }
}
