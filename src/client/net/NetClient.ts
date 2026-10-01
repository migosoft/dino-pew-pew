import type { InputCommand } from '../../sim/types';
import { encodeInput, type ServerMsg, type WelcomeMsg } from '../../net/protocol';
import { Mirror } from './Mirror';

export type NetStatus = 'connecting' | 'joining' | 'playing' | 'closed';

export function gameSocketUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

/** WebSocket connection to the game server: join, stream inputs, collect snapshots. */
export class NetClient {
  readonly mirror = new Mirror();
  status: NetStatus = 'connecting';
  welcome: WelcomeMsg | null = null;
  error: string | null = null;
  onWelcome?: (w: WelcomeMsg) => void;
  private ws: WebSocket;
  private seq = 0;

  constructor(url: string, team: string, kind: string) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.status = 'joining';
      this.ws.send(JSON.stringify({ t: 'join', team, kind }));
    };
    this.ws.onmessage = (ev) => this.receive(JSON.parse(ev.data as string) as ServerMsg);
    this.ws.onclose = () => {
      this.status = 'closed';
    };
  }

  private receive(msg: ServerMsg): void {
    switch (msg.t) {
      case 'welcome':
        this.welcome = msg;
        this.status = 'playing';
        this.onWelcome?.(msg);
        break;
      case 'snap':
        this.mirror.push(msg, performance.now());
        break;
      case 'error':
        this.error = msg.message;
        this.ws.close();
        break;
    }
  }

  sendInput(cmd: InputCommand): void {
    if (this.status !== 'playing' || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(encodeInput(++this.seq, cmd));
  }

  close(): void {
    this.ws.close();
  }
}
