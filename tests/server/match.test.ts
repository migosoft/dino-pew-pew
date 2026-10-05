import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { createAppServer, type AppServer } from '../../src/server/http';
import { Match } from '../../src/server/match';
import { eliminateTeam } from '../../src/sim/rounds';
import { encodeInput, type ServerMsg, type SnapshotMsg, type WelcomeMsg } from '../../src/net/protocol';

let app: AppServer | null = null;
let match: Match | null = null;
const sockets: WebSocket[] = [];

async function startServer() {
  match = new Match(1234, { wildlife: false, tiles: 256 });
  const m = match;
  app = createAppServer({ staticDir: '/nonexistent', onConnection: (ws) => m.connect(ws), api: { lobby: () => m.lobby() } });
  await new Promise<void>((r) => app!.server.listen(0, '127.0.0.1', r));
  return `127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

/** How long to wait for a condition before failing. Generous: only a failing test ever waits this long. */
const WAIT_MS = 10000;

/** Poll until `cond` holds. Messages travel over real sockets, so their arrival time varies under load. */
async function until(cond: () => boolean, what: string, ms = WAIT_MS) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** A tiny test client that records every server message. */
async function client(host: string) {
  const ws = new WebSocket(`ws://${host}/ws`);
  sockets.push(ws);
  const msgs: ServerMsg[] = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  await new Promise((r, j) => (ws.once('open', r), ws.once('error', j)));
  const waitFor = async <T extends ServerMsg>(pred: (m: ServerMsg) => boolean): Promise<T> => {
    await until(() => msgs.some(pred), 'message');
    return msgs.find(pred) as T;
  };
  const snaps = () => msgs.filter((m): m is SnapshotMsg => m.t === 'snap');
  return { ws, msgs, snaps, waitFor, send: (o: unknown) => ws.send(typeof o === 'string' ? o : JSON.stringify(o)) };
}

/** Run the match manually (no real-time loop) so tests are fast and deterministic. */
async function ticks(n: number) {
  for (let i = 0; i < n; i++) match!.tick();
  await new Promise((r) => setTimeout(r, 20));
}

/** Keep ticking until `cond` holds: for effects of a client message, which reaches the server at an unknown time. */
async function tickUntil(cond: () => boolean, what: string) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > WAIT_MS) throw new Error(`timeout waiting for ${what}`);
    await ticks(3);
  }
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
    a.send({ t: 'join', team: 'team0', kind: 'triceratops', setup: { teams: 2, map: 'random' } });
    const wa = await a.waitFor<WelcomeMsg>((m) => m.t === 'welcome');
    expect(wa.seed).toBe(1234);

    const lobby = await (await fetch(`http://${host}/api/lobby`)).json();
    expect(lobby.teams).toHaveLength(2);

    const b = await client(host);
    b.send({ t: 'join', team: 'team1', kind: 'triceratops' });
    const wb = await b.waitFor<WelcomeMsg>((m) => m.t === 'welcome');
    const c = await client(host);
    c.send({ t: 'join', team: lobby.teams[0].id, kind: 'triceratops' });
    await c.waitFor((m) => m.t === 'welcome');

    await ticks(3);
    const snap = await a.waitFor<SnapshotMsg>((m) => m.t === 'snap');
    expect(snap.dinos).toHaveLength(3);
    expect(snap.teams).toHaveLength(2);
    const teamOf = (pid: number) => snap.players!.find((p) => p.id === pid)!.team;
    expect(teamOf(wa.playerId)).not.toBe(teamOf(wb.playerId));
    expect(snap.teams!.find((t) => t.id === lobby.teams[0].id)!.players).toBe(2);
  });

  it('applies inputs, acknowledges their sequence numbers and ignores stale ones', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: 'team0', kind: 'triceratops', setup: { teams: 2, map: 'random' } });
    const w = await a.waitFor<WelcomeMsg>((m) => m.t === 'welcome');
    const dino0 = match!.state!.dinos[0];
    const start = { x: dino0.x, y: dino0.y };
    a.send(encodeInput(5, { throttle: 1, turn: 0, aimWorld: { x: 0, y: 0 }, fire: false }));
    a.send(encodeInput(3, { throttle: -1, turn: 0, aimWorld: { x: 0, y: 0 }, fire: false })); // stale
    // Tick until the server has taken the input (delivery time varies under load).
    await tickUntil(() => a.msgs.some((m) => m.t === 'snap' && m.ack === 5), 'ack 5');
    await ticks(60);
    const d = match!.state!.dinos.find((x) => x.playerId === w.playerId)!;
    expect(Math.hypot(d.x - start.x, d.y - start.y)).toBeGreaterThan(20);
    // The stale seq 3 must never have overwritten the ack: once 5 is acknowledged, every later snapshot says 5.
    const acks = a.msgs.filter((m): m is SnapshotMsg => m.t === 'snap').map((m) => m.ack);
    expect(acks).not.toContain(3);
    expect(acks.slice(acks.indexOf(5)).every((x) => x === 5)).toBe(true);
    expect(acks.at(-1)).toBe(5);
  });

  it('applies queued inputs one per tick, so none is lost when two arrive between ticks', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: 'team0', kind: 'triceratops', setup: { teams: 2, map: 'random' } });
    await a.waitFor<WelcomeMsg>((m) => m.t === 'welcome');
    const session = () => [...(match as unknown as { sessions: Set<{ seq: number; ack: number; queue: unknown[] }> }).sessions][0];
    const cmd = (throttle: number) => ({ throttle, turn: 0, aimWorld: { x: 0, y: 0 }, fire: false });
    a.send(encodeInput(1, cmd(1)));
    a.send(encodeInput(2, cmd(0)));
    await until(() => session().seq === 2, 'both inputs to arrive');
    match!.tick();
    expect(session().ack).toBe(1);
    match!.tick();
    expect(session().ack).toBe(2);
    // A burst longer than the queue keeps only the newest inputs, so it can't add lasting delay.
    for (let i = 3; i <= 14; i++) a.send(encodeInput(i, cmd(1)));
    await until(() => session().seq === 14, 'the burst to arrive');
    expect(session().queue.length).toBe(6);
    match!.tick();
    expect(session().ack).toBe(9);
    await ticks(10);
    expect(session().ack).toBe(14);
    expect(session().queue.length).toBe(0);
  });

  it('rejects joins to unknown teams and species, and removes players who leave', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: 'team3', kind: 'triceratops', setup: { teams: 2, map: 'random' } });
    await a.waitFor((m) => m.t === 'error' && m.message === 'TEAM NO LONGER EXISTS');
    expect(match!.settings).toBeNull();
    a.send({ t: 'join', team: 'team0', kind: 'tyrannosaurus', setup: { teams: 2, map: 'random' } });
    await a.waitFor((m) => m.t === 'error' && m.message === 'UNKNOWN SPECIES');
    a.send({ t: 'join', team: 'team0', kind: 'triceratops', setup: { teams: 2, map: 'random' } });
    await a.waitFor((m) => m.t === 'welcome');
    expect(match!.state!.players).toHaveLength(1);
    a.ws.close();
    await until(() => match!.state === null, 'the server to drop the world');
  });

  it('sells upgrades over the socket and explains refusals', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: 'team0', kind: 'triceratops', setup: { teams: 2, map: 'random' } });
    const w = await a.waitFor<WelcomeMsg>((m) => m.t === 'welcome');
    a.send({ t: 'buy', stat: 'damage' });
    await a.waitFor((m) => m.t === 'notice' && m.message === 'NOT ENOUGH MONEY');
    match!.state!.players[0].money = 1000;
    a.send({ t: 'buy', stat: 'damage' });
    a.send({ t: 'buy', stat: 'teleport' }); // invalid stat: ignored
    const bought = (m: ServerMsg) => m.t === 'snap' && !!m.players?.some((p) => p.id === w.playerId && p.upgrades.damage === 1);
    await tickUntil(() => a.msgs.some(bought), 'the upgrade in a snapshot');
    const snap = a.msgs.find(bought) as SnapshotMsg;
    expect(snap.players![0].money).toBe(1000 - 60);
  });

  it('sends carcasses and players only when they change', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: 'team0', kind: 'triceratops', setup: { teams: 2, map: 'random' } });
    const w = await a.waitFor<WelcomeMsg>((m) => m.t === 'welcome');
    const worldCarcasses = match!.state!.food.filter((f) => f.kind === 'carcass');
    expect(w.carcasses.map((c) => c[0]).sort()).toEqual(worldCarcasses.map((f) => f.id).sort());
    await ticks(6);
    await until(() => a.snaps().length >= 2, 'two snapshots');
    const [first, second] = a.snaps();
    expect(first.players).toHaveLength(1);
    expect(first.carcasses).toHaveLength(worldCarcasses.length);
    expect(second.players).toBeUndefined();
    expect(second.teams).toBeUndefined();
    expect(second.carcasses).toHaveLength(0);
    // A carcass that is eaten up is reported gone.
    worldCarcasses[0].food = 0;
    await ticks(3);
    await until(() => a.snaps().length >= 3, 'a third snapshot');
    const third = a.snaps()[2];
    expect(third.gone).toEqual([worldCarcasses[0].id]);
  });

  it('the first join sets up the round; a second setup is ignored', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: 'team1', kind: 'triceratops', setup: { teams: 3, map: 'random' } });
    const wa = await a.waitFor<WelcomeMsg>((m) => m.t === 'welcome');
    expect([wa.teams, wa.map, wa.tiles]).toEqual([3, 'random', 256]);
    const b = await client(host);
    b.send({ t: 'join', team: 'team2', kind: 'triceratops', setup: { teams: 2, map: 'crossing' } });
    const wb = await b.waitFor<WelcomeMsg>((m) => m.t === 'welcome');
    expect(wb.teams).toBe(3);
    expect(match!.settings).toEqual({ teams: 3, map: 'random' });
  });

  it('refuses a join to a slot the running round does not have', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: 'team0', kind: 'triceratops', setup: { teams: 2, map: 'random' } });
    await a.waitFor((m) => m.t === 'welcome');
    const b = await client(host);
    b.send({ t: 'join', team: 'team2', kind: 'triceratops', setup: { teams: 3, map: 'random' } });
    const err = await b.waitFor((m) => m.t === 'error');
    expect((err as { message: string }).message).toBe('TEAM NO LONGER EXISTS');
    expect(match!.settings).toEqual({ teams: 2, map: 'random' });
    expect(match!.state!.players).toHaveLength(1);
  });

  it('refuses a join without a setup while the server has none', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: 'team0', kind: 'triceratops' });
    const err = await a.waitFor((m) => m.t === 'error');
    expect((err as { message: string }).message).toMatch(/CHOOSE/);
  });

  it('refuses a join to a team slot the setup does not have', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: 'team2', kind: 'triceratops', setup: { teams: 2, map: 'random' } });
    const err = await a.waitFor((m) => m.t === 'error');
    expect((err as { message: string }).message).toBe('TEAM NO LONGER EXISTS');
    expect(match!.settings).toBeNull();
    expect(match!.state).toBeNull();
  });

  it('starts a new round after the intermission and keeps everyone on their team', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: 'team0', kind: 'triceratops', setup: { teams: 2, map: 'random' } });
    const w1 = await a.waitFor<WelcomeMsg>((m) => m.t === 'welcome');
    const s1 = match!.state!;
    s1.round = { phase: 'over', timer: 0, winner: 'team0' };
    await ticks(1);
    await a.waitFor((m) => m.t === 'welcome' && m !== w1);
    const welcomes = a.msgs.filter((m) => m.t === 'welcome') as WelcomeMsg[];
    expect(welcomes).toHaveLength(2);
    expect(match!.state).not.toBe(s1);
    expect(welcomes[1].seed).not.toBe(w1.seed);
    const p = match!.state!.players.find((x) => x.id === welcomes[1].playerId)!;
    expect(p.team).toBe('team0');
    expect(p.money).toBe(0);
  });

  it('resets to no setup when the last player leaves', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: 'team0', kind: 'triceratops', setup: { teams: 2, map: 'random' } });
    await a.waitFor((m) => m.t === 'welcome');
    a.ws.close();
    await until(() => match!.state === null, 'the server to reset');
    expect(match!.settings).toBeNull();
    expect(match!.lobby().setup).toBeNull();
  });

  it('a preset never resets, and the lobby lists the maps', () => {
    const m = new Match(5, { wildlife: false, tiles: 256, preset: { teams: 4, map: 'random' } });
    expect(m.state!.teams).toHaveLength(4);
    expect(m.lobby().maps.map((x) => x.id)).toContain('crossing');
  });

  it('lets an eliminated rider switch teams', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: 'team0', kind: 'triceratops', setup: { teams: 3, map: 'random' } });
    const w = await a.waitFor<WelcomeMsg>((m) => m.t === 'welcome');
    const st = match!.state!;
    st.round.phase = 'playing';
    eliminateTeam(st, 'team0');
    a.send({ t: 'switch', team: 'team2', kind: 'trex' });
    await until(() => st.players.find((p) => p.id === w.playerId)!.team === 'team2', 'the switch');
    expect(st.players.find((p) => p.id === w.playerId)!.kind).toBe('trex');
  });

  it('refuses joins and switches into an eliminated team', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: 'team0', kind: 'triceratops', setup: { teams: 3, map: 'random' } });
    const w = await a.waitFor<WelcomeMsg>((m) => m.t === 'welcome');
    const st = match!.state!;
    st.round.phase = 'playing';
    eliminateTeam(st, 'team0');
    eliminateTeam(st, 'team2');
    const b = await client(host);
    b.send({ t: 'join', team: 'team2', kind: 'triceratops' });
    const err = await b.waitFor((m) => m.t === 'error');
    expect((err as { message: string }).message).toBe('THAT TEAM IS OUT');
    a.send({ t: 'switch', team: 'team2', kind: 'triceratops' });
    await a.waitFor((m) => m.t === 'notice' && m.message === 'THAT TEAM IS OUT');
    expect(st.players.find((p) => p.id === w.playerId)!.team).toBe('team0');
    expect(st.players).toHaveLength(1);
  });

  it('disconnects clients that flood messages', async () => {
    const host = await startServer();
    const a = await client(host);
    const closed = new Promise((r) => a.ws.once('close', r));
    for (let i = 0; i < 400; i++) a.send(encodeInput(i + 1, { throttle: 0, turn: 0, aimWorld: { x: 0, y: 0 }, fire: false }));
    await closed;
  });
});
