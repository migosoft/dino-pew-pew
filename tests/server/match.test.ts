import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { createAppServer, type AppServer } from '../../src/server/http';
import { Match } from '../../src/server/match';
import { NEW_TEAM, encodeInput, type ServerMsg, type SnapshotMsg, type WelcomeMsg } from '../../src/net/protocol';

let app: AppServer | null = null;
let match: Match | null = null;
const sockets: WebSocket[] = [];

async function startServer() {
  match = new Match(1234, { wildlife: false });
  const m = match;
  app = createAppServer({ staticDir: '/nonexistent', onConnection: (ws) => m.connect(ws), api: { lobby: () => m.lobby() } });
  await new Promise<void>((r) => app!.server.listen(0, '127.0.0.1', r));
  return `127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

/** A tiny test client that records every server message. */
async function client(host: string) {
  const ws = new WebSocket(`ws://${host}/ws`);
  sockets.push(ws);
  const msgs: ServerMsg[] = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  await new Promise((r, j) => (ws.once('open', r), ws.once('error', j)));
  const waitFor = async <T extends ServerMsg>(pred: (m: ServerMsg) => boolean, ms = 2000): Promise<T> => {
    const t0 = Date.now();
    for (;;) {
      const found = msgs.find(pred);
      if (found) return found as T;
      if (Date.now() - t0 > ms) throw new Error('timeout waiting for message');
      await new Promise((r) => setTimeout(r, 5));
    }
  };
  return { ws, msgs, waitFor, send: (o: unknown) => ws.send(typeof o === 'string' ? o : JSON.stringify(o)) };
}

/** Run the match manually (no real-time loop) so tests are fast and deterministic. */
async function ticks(n: number) {
  for (let i = 0; i < n; i++) match!.tick();
  await new Promise((r) => setTimeout(r, 20));
}

afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  if (app) {
    app.wss.close();
    await new Promise((r) => app!.server.close(r));
  }
  app = null;
  match = null;
});

describe('game server', () => {
  it('lets two clients join opposing teams and see each other in snapshots', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: NEW_TEAM, kind: 'triceratops' });
    const wa = await a.waitFor<WelcomeMsg>((m) => m.t === 'welcome');
    expect(wa.seed).toBe(1234);

    const lobby = await (await fetch(`http://${host}/api/lobby`)).json();
    expect(lobby.teams).toHaveLength(1);
    expect(lobby.canCreateTeam).toBe(true);

    const b = await client(host);
    b.send({ t: 'join', team: NEW_TEAM, kind: 'triceratops' });
    const wb = await b.waitFor<WelcomeMsg>((m) => m.t === 'welcome');
    const c = await client(host);
    c.send({ t: 'join', team: lobby.teams[0].id, kind: 'triceratops' });
    await c.waitFor((m) => m.t === 'welcome');

    await ticks(3);
    const snap = await a.waitFor<SnapshotMsg>((m) => m.t === 'snap');
    expect(snap.dinos).toHaveLength(3);
    expect(snap.teams).toHaveLength(2);
    const teamOf = (pid: number) => snap.players.find((p) => p.id === pid)!.team;
    expect(teamOf(wa.playerId)).not.toBe(teamOf(wb.playerId));
    expect(snap.teams.find((t) => t.id === lobby.teams[0].id)!.players).toBe(2);
  });

  it('applies inputs, acknowledges their sequence numbers and ignores stale ones', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: NEW_TEAM, kind: 'triceratops' });
    const w = await a.waitFor<WelcomeMsg>((m) => m.t === 'welcome');
    const dino0 = match!.state.dinos[0];
    const start = { x: dino0.x, y: dino0.y };
    a.send(encodeInput(5, { throttle: 1, turn: 0, aimWorld: { x: 0, y: 0 }, fire: false }));
    a.send(encodeInput(3, { throttle: -1, turn: 0, aimWorld: { x: 0, y: 0 }, fire: false })); // stale
    await new Promise((r) => setTimeout(r, 30));
    await ticks(60);
    const d = match!.state.dinos.find((x) => x.playerId === w.playerId)!;
    expect(Math.hypot(d.x - start.x, d.y - start.y)).toBeGreaterThan(20);
    const snaps = a.msgs.filter((m): m is SnapshotMsg => m.t === 'snap');
    expect(snaps.at(-1)!.ack).toBe(5);
  });

  it('rejects joins to unknown teams and species, and removes players who leave', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: 'team3', kind: 'triceratops' });
    await a.waitFor((m) => m.t === 'error');
    a.send({ t: 'join', team: NEW_TEAM, kind: 'tyrannosaurus' });
    await a.waitFor((m) => m.t === 'error' && m.message === 'UNKNOWN SPECIES');
    a.send({ t: 'join', team: NEW_TEAM, kind: 'triceratops' });
    await a.waitFor((m) => m.t === 'welcome');
    expect(match!.state.players).toHaveLength(1);
    a.ws.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(match!.state.players).toHaveLength(0);
    expect(match!.state.dinos).toHaveLength(0);
  });

  it('sells upgrades over the socket and explains refusals', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: NEW_TEAM, kind: 'triceratops' });
    const w = await a.waitFor<WelcomeMsg>((m) => m.t === 'welcome');
    a.send({ t: 'buy', stat: 'damage' });
    await a.waitFor((m) => m.t === 'notice' && m.message === 'NOT ENOUGH MONEY');
    match!.state.players[0].money = 1000;
    a.send({ t: 'buy', stat: 'damage' });
    a.send({ t: 'buy', stat: 'teleport' }); // invalid stat: ignored
    await new Promise((r) => setTimeout(r, 30));
    await ticks(3);
    const snap = await a.waitFor<SnapshotMsg>((m) => m.t === 'snap' && m.players.some((p) => p.id === w.playerId && p.upgrades.damage === 1));
    expect(snap.players[0].money).toBe(1000 - 60);
  });

  it('disconnects clients that flood messages', async () => {
    const host = await startServer();
    const a = await client(host);
    const closed = new Promise((r) => a.ws.once('close', r));
    for (let i = 0; i < 400; i++) a.send(encodeInput(i + 1, { throttle: 0, turn: 0, aimWorld: { x: 0, y: 0 }, fire: false }));
    await closed;
  });
});
