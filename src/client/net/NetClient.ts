import type { InputCommand } from '../../sim/types';
import type { RoundSettings } from '../../sim/maps';
import type { UpgradeStat } from '../../sim/upgrades';
import { encodeInput, type CarcassTuple, type PlantTuple, type ServerMsg, type WelcomeMsg } from '../../net/protocol';
import { Mirror } from './Mirror';

export interface JoinRequest {
  team: string;
  kind: string;
  setup?: RoundSettings;
}

export interface NetOptions {
  /** Debug: add this much round-trip delay (half each way) to reproduce a remote server locally. */
  lagMs?: number;
}

export type NetStatus = 'connecting' | 'joining' | 'playing' | 'closed';

export function gameSocketUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

/** WebSocket connection to the game server: join, stream inputs, collect snapshots. */
export class NetClient {
  mirror = new Mirror();
  status: NetStatus = 'connecting';
  welcome: WelcomeMsg | null = null;
  error: string | null = null;
  onWelcome?: (w: WelcomeMsg) => void;
  private ws: WebSocket;
  private seq = 0;
  private plantUpdates: PlantTuple[] = [];
  private carcassUpdates: CarcassTuple[] = [];
  private carcassesGone: number[] = [];
  /** Server notices (e.g. refused purchases) not yet shown. */
  notices: string[] = [];
  /**
   * Smoothed time from sending an input to the first snapshot acknowledging it: the round trip
   * plus the wait for the server's tick and snapshot (up to ~65 ms of that is not network).
   */
  rttMs = 0;
  /** Smoothed deviation of snapshot arrival intervals from the server's 50 ms. */
  jitterMs = 0;
  private sentAt = new Float64Array(256);
  private lastAck = 0;
  private lastSnapAt = 0;
  private readonly lagMs: number;

  constructor(url: string, join: JoinRequest, opts: NetOptions = {}) {
    this.lagMs = Math.max(0, opts.lagMs ?? 0);
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.status = 'joining';
      this.send(JSON.stringify({ t: 'join', ...join }));
    };
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as ServerMsg;
      if (this.lagMs) setTimeout(() => this.receive(msg), this.lagMs / 2);
      else this.receive(msg);
    };
    this.ws.onclose = () => {
      this.status = 'closed';
    };
  }

  private receive(msg: ServerMsg): void {
    switch (msg.t) {
      case 'welcome':
        // A new round (or the first): fresh mirror and food queues, the old round's state is gone.
        this.mirror = new Mirror();
        this.plantUpdates = [...msg.plants];
        this.carcassUpdates = [...msg.carcasses];
        this.carcassesGone = [];
        this.welcome = msg;
        this.status = 'playing';
        this.onWelcome?.(msg);
        break;
      case 'snap': {
        const now = performance.now();
        if (msg.ack > this.lastAck) {
          this.lastAck = msg.ack;
          const sample = now - this.sentAt[msg.ack & 255];
          this.rttMs = this.rttMs ? this.rttMs + (sample - this.rttMs) * 0.1 : sample;
        }
        if (this.lastSnapAt) this.jitterMs += (Math.abs(now - this.lastSnapAt - 50) - this.jitterMs) * 0.1;
        this.lastSnapAt = now;
        this.mirror.push(msg, now);
        if (msg.plants.length) this.plantUpdates.push(...msg.plants);
        if (msg.carcasses.length) this.carcassUpdates.push(...msg.carcasses);
        if (msg.gone.length) this.carcassesGone.push(...msg.gone);
        break;
      }
      case 'notice':
        this.notices.push(msg.message);
        break;
      case 'error':
        this.error = msg.message;
        this.ws.close();
        break;
    }
  }

  /** Plant food levels received since the last call (applied immediately, not interpolated). */
  takePlantUpdates(): PlantTuple[] {
    const u = this.plantUpdates;
    this.plantUpdates = [];
    return u;
  }

  /** Carcasses that appeared or changed, and ids of those gone, since the last call. */
  takeCarcassUpdates(): { changed: CarcassTuple[]; gone: number[] } {
    const u = { changed: this.carcassUpdates, gone: this.carcassesGone };
    this.carcassUpdates = [];
    this.carcassesGone = [];
    return u;
  }

  /** Send one input; returns its seq, or 0 if it wasn't sent. */
  sendInput(cmd: InputCommand): number {
    if (this.status !== 'playing' || this.ws.readyState !== WebSocket.OPEN) return 0;
    this.seq++;
    this.sentAt[this.seq & 255] = performance.now();
    this.send(encodeInput(this.seq, cmd));
    return this.seq;
  }

  buy(stat: UpgradeStat): void {
    if (this.status === 'playing') this.send(JSON.stringify({ t: 'buy', stat }));
  }

  switchTeam(team: string, kind: string): void {
    if (this.status === 'playing') this.send(JSON.stringify({ t: 'switch', team, kind }));
  }

  private send(data: string): void {
    if (!this.lagMs) return this.ws.send(data);
    setTimeout(() => this.ws.readyState === WebSocket.OPEN && this.ws.send(data), this.lagMs / 2);
  }

  close(): void {
    this.ws.close();
  }
}
