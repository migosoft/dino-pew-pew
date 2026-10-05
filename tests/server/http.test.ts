import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { createAppServer, type AppServer } from '../../src/server/http';

let app: AppServer;
let base = '';
let dir = '';

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dinoriders-static-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Dinoriders</title>');
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log(1)');
  app = createAppServer({ staticDir: dir, onConnection: (ws) => ws.send(JSON.stringify({ type: 'hello' })) });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  base = `127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  app.wss.close();
  await new Promise((r) => app.server.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('app server', () => {
  it('reports health', async () => {
    const res = await fetch(`http://${base}/api/health`);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('serves static files with caching, and falls back to index.html', async () => {
    const js = await fetch(`http://${base}/assets/app.js`);
    expect(js.headers.get('content-type')).toContain('javascript');
    expect(js.headers.get('cache-control')).toContain('immutable');
    const page = await fetch(`http://${base}/some/route`);
    expect(await page.text()).toContain('Dinoriders');
  });

  it('refuses path traversal', async () => {
    const res = await fetch(`http://${base}/..%2f..%2fetc%2fpasswd`);
    expect(await res.text()).not.toContain('root:');
  });

  it('accepts game websockets on /ws', async () => {
    const ws = new WebSocket(`ws://${base}/ws`);
    const msg = await new Promise<string>((resolve, reject) => {
      ws.once('message', (d) => resolve(d.toString()));
      ws.once('error', reject);
    });
    expect(JSON.parse(msg).type).toBe('hello');
    expect(ws.extensions).toContain('permessage-deflate');
    ws.close();
  });
});
