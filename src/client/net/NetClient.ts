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

  constructor(url: string, join: JoinRequest) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.status = 'joining';
      this.ws.send(JSON.stringify({ t: 'join', ...join }));
    };
    this.ws.onmessage = (ev) => this.receive(JSON.parse(ev.data as string) as ServerMsg);
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
      case 'snap':
        this.mirror.push(msg, performance.now());
        if (msg.plants.length) this.plantUpdates.push(...msg.plants);
        if (msg.carcasses.length) this.carcassUpdates.push(...msg.carcasses);
        if (msg.gone.length) this.carcassesGone.push(...msg.gone);
        break;
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

  sendInput(cmd: InputCommand): void {
    if (this.status !== 'playing' || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(encodeInput(++this.seq, cmd));
  }

  buy(stat: UpgradeStat): void {
    if (this.status === 'playing') this.ws.send(JSON.stringify({ t: 'buy', stat }));
  }

  switchTeam(team: string, kind: string): void {
    if (this.status === 'playing') this.ws.send(JSON.stringify({ t: 'switch', team, kind }));
  }

  close(): void {
    this.ws.close();
  }
}
