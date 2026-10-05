import type { WebSocket } from 'ws';
import type { GameState, InputCommand } from '../sim/types';
import { DT, TICK_RATE } from '../sim/types';
import { createMatch, step } from '../sim/sim';
import { listDinos } from '../sim/defs/dinos';
import { MAX_PLAYERS, addPlayer, removePlayer } from '../sim/players';
import { switchTeam } from '../sim/rounds';
import { findPlayer, findTeam } from '../sim/world';
import { RANDOM_MAP, TEAM_COUNTS, getMap, mapsFor, worldOptionsFor, type RoundSettings } from '../sim/maps';
import { DEFAULT_TILES } from '../sim/worldgen';
import { makeRng, rand, type RngState } from '../sim/rng';
import { buyUpgrade } from '../sim/upgrades';
import {
  PROTOCOL_VERSION,
  SNAPSHOT_EVERY,
  buildSnapshot,
  carcassTuples,
  encodeCarcass,
  parseClientMsg,
  plantLevels,
  playerInfos,
  roundInfo,
  speciesInfo,
  teamInfos,
  type CarcassTuple,
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

export interface MatchOptions {
  wildlife?: boolean;
  /** Fixed settings (env TEAMS/MAP): no setup screen, never reset. */
  preset?: RoundSettings;
  /** Size of random maps in tiles (tests use smaller maps). */
  tiles?: number;
}

/** The match a server process hosts: one round after another, with the settings the first player chose. */
export class Match {
  state: GameState | null = null;
  settings: RoundSettings | null;
  private readonly locked: boolean;
  private readonly wildlife: boolean;
  private readonly tiles: number;
  private readonly firstSeed: number;
  private readonly rng: RngState;
  private rounds = 0;
  private sessions = new Set<Session>();
  private pending: TimedEvent[] = [];
  /** Plant food levels as last broadcast, to send only changes. */
  private sentPlants = new Map<number, number>();
  /** Carcass food levels as last broadcast, to send only new, changed and gone carcasses. */
  private sentCarcasses = new Map<number, number>();
  /** Players, teams and round as last broadcast (JSON), to leave them out while unchanged. */
  private sentPlayers = '';
  private sentTeams = '';
  private sentRound = '';
  private nameCounter = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTime = 0;
  private acc = 0;

  constructor(seed: number, opts: MatchOptions = {}) {
    this.wildlife = opts.wildlife ?? true;
    this.tiles = opts.tiles ?? DEFAULT_TILES;
    this.firstSeed = seed;
    this.rng = makeRng(seed ^ 0x51ed);
    this.locked = !!opts.preset;
    this.settings = opts.preset ?? null;
    if (this.settings) this.startRound();
  }

  /** Build a fresh world for the current settings (a fixed map always uses its own seed). */
  private startRound(): void {
    const st = this.settings!;
    const recipe = getMap(st.map);
    const seed = recipe ? recipe.seed : this.rounds === 0 ? this.firstSeed : (rand(this.rng) * 2 ** 31) >>> 0;
    this.rounds++;
    this.state = createMatch(seed, worldOptionsFor(st.map, st.teams, this.tiles), { wildlife: this.wildlife, teams: st.teams });
    this.sentPlants = plantLevels(this.state);
    this.sentCarcasses.clear();
    this.sentPlayers = this.sentTeams = this.sentRound = '';
    this.pending = [];
  }

  /** Round over: same settings, new world. Everyone keeps their team slot, mount and name. */
  private nextRound(): void {
    const old = this.state!;
    this.startRound();
    const state = this.state!;
    for (const s of this.sessions) {
      if (s.playerId === null) continue;
      const p = findPlayer(old, s.playerId);
      if (!p) {
        s.playerId = null;
        continue;
      }
      const slot = findTeam(old, p.team)?.slot ?? 0;
      const team = state.teams.find((t) => t.slot === slot) ?? state.teams[0];
      s.playerId = addPlayer(state, team.id, p.kind, p.name).id;
      s.input = null;
      this.sendWelcome(s);
    }
  }

  private sendWelcome(s: Session): void {
    const state = this.state!;
    const st = this.settings!;
    // New clients regenerate full plants from the seed; tell them which ones are already eaten.
    const plants: PlantTuple[] = state.food.filter((f) => f.kind !== 'carcass' && f.food < f.maxFood).map((f) => [f.id, this.sentPlants.get(f.id) ?? Math.ceil(f.food)]);
    this.send(s, {
      t: 'welcome',
      protocol: PROTOCOL_VERSION,
      playerId: s.playerId!,
      seed: state.world.seed,
      map: st.map,
      teams: st.teams,
      tiles: state.world.cols,
      tick: state.tick,
      tickRate: TICK_RATE,
      plants,
      carcasses: carcassTuples(state),
    });
  }

  lobby(): LobbyInfo {
    const s = this.state;
    return {
      protocol: PROTOCOL_VERSION,
      setup: this.settings,
      maps: TEAM_COUNTS.flatMap((n) => mapsFor(n).filter((m) => m.id !== RANDOM_MAP)),
      phase: s?.round.phase ?? null,
      teams: s ? teamInfos(s) : [],
      canJoin: !s || s.players.length < MAX_PLAYERS,
      players: s?.players.length ?? 0,
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
    const state = this.state;
    if (!state) return;
    const inputs = new Map<number, InputCommand>();
    for (const s of this.sessions) if (s.playerId !== null && s.input) inputs.set(s.playerId, s.input);
    step(state, inputs, DT);
    const tick = state.tick;
    for (const e of state.events) this.pending.push({ ...e, tick });
    if (state.round.phase === 'over' && state.round.timer <= 0) return this.nextRound();
    if (tick % SNAPSHOT_EVERY === 0) this.broadcast();
  }

  private broadcast(): void {
    const state = this.state!;
    const changed: PlantTuple[] = [];
    for (const [id, food] of plantLevels(state)) {
      if (this.sentPlants.get(id) === food) continue;
      this.sentPlants.set(id, food);
      changed.push([id, food]);
    }
    const carcasses: CarcassTuple[] = [];
    const live = new Set<number>();
    for (const f of state.food) {
      if (f.kind !== 'carcass') continue;
      live.add(f.id);
      const food = Math.ceil(f.food);
      if (this.sentCarcasses.get(f.id) === food) continue;
      this.sentCarcasses.set(f.id, food);
      carcasses.push(encodeCarcass(f));
    }
    const gone: number[] = [];
    for (const id of this.sentCarcasses.keys()) {
      if (live.has(id)) continue;
      this.sentCarcasses.delete(id);
      gone.push(id);
    }
    const players = playerInfos(state);
    const teams = teamInfos(state);
    const round = roundInfo(state);
    const playersJson = JSON.stringify(players);
    const teamsJson = JSON.stringify(teams);
    const roundJson = JSON.stringify(round);
    const body = JSON.stringify(
      buildSnapshot(state, this.pending, {
        plants: changed,
        carcasses,
        gone,
        players: playersJson === this.sentPlayers ? null : players,
        teams: teamsJson === this.sentTeams ? null : teams,
        round: roundJson === this.sentRound ? null : round,
      }),
    );
    this.sentPlayers = playersJson;
    this.sentTeams = teamsJson;
    this.sentRound = roundJson;
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
      if (session.playerId !== null && this.state) removePlayer(this.state, session.playerId);
      // Everyone gone: the next player to arrive sets up the server again.
      if (!this.locked && ![...this.sessions].some((x) => x.playerId !== null)) {
        this.settings = null;
        this.state = null;
      }
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
      if (!this.state || s.playerId === null) return;
      const result = buyUpgrade(this.state, s.playerId, msg.stat);
      const why: Record<string, string> = { 'not-in-base': 'SHOP ONLY IN YOUR BASE CAMP', 'max-level': 'ALREADY AT MAX LEVEL', 'no-money': 'NOT ENOUGH MONEY', 'no-dino': 'WAIT UNTIL YOU RESPAWN' };
      if (result !== 'ok') this.send(s, { t: 'notice', message: why[result] });
      return;
    }
    if (msg.t === 'switch') {
      if (!this.state || s.playerId === null) return;
      if (!listDinos().some((d) => d.kind === msg.kind)) return this.send(s, { t: 'notice', message: 'UNKNOWN SPECIES' });
      const result = switchTeam(this.state, s.playerId, msg.team, msg.kind);
      if (result === 'bad-team') return this.send(s, { t: 'notice', message: 'THAT TEAM IS OUT' });
      if (result === 'not-eliminated') return this.send(s, { t: 'notice', message: 'YOUR CAMP STILL STANDS' });
      this.sentPlayers = '';
      return;
    }
    // join
    if (s.playerId !== null) return;
    const setup = this.settings ?? msg.setup;
    if (!setup) return this.send(s, { t: 'error', message: 'THE SERVER WAS RESET - CHOOSE AGAIN' });
    if (!listDinos().some((d) => d.kind === msg.kind)) return this.send(s, { t: 'error', message: 'UNKNOWN SPECIES' });
    // First valid setup wins: validate the join before it fixes the server's settings.
    if (!Array.from({ length: setup.teams }, (_, i) => `team${i}`).includes(msg.team)) return this.send(s, { t: 'error', message: 'TEAM NO LONGER EXISTS' });
    if (!this.settings) {
      this.settings = setup;
      this.startRound();
    }
    const state = this.state!;
    if (state.players.length >= MAX_PLAYERS) return this.send(s, { t: 'error', message: 'SERVER FULL' });
    const team = findTeam(state, msg.team);
    if (!team) return this.send(s, { t: 'error', message: 'TEAM NO LONGER EXISTS' });
    if (team.eliminated) return this.send(s, { t: 'error', message: 'THAT TEAM IS OUT' });
    const player = addPlayer(state, team.id, msg.kind, `RIDER ${++this.nameCounter}`);
    s.playerId = player.id;
    // The newcomer needs the full players, teams and round in its first snapshot.
    this.sentPlayers = this.sentTeams = this.sentRound = '';
    this.sendWelcome(s);
  }
}
