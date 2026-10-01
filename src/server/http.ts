import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export interface AppOptions {
  /** Directory with the built client (vite `dist/`). Missing directory = API/ws only (dev). */
  staticDir: string;
  /** Called for every accepted game socket. */
  onConnection: (ws: WebSocket, req: http.IncomingMessage) => void;
  /** Extra JSON API routes under /api/. */
  api?: Record<string, () => unknown>;
}

export interface AppServer {
  server: http.Server;
  wss: WebSocketServer;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function serveStatic(staticDir: string, urlPath: string, res: http.ServerResponse): void {
  const root = path.resolve(staticDir);
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.resolve(root, '.' + rel);
  // Never serve anything outside the static root.
  if (!file.startsWith(root + path.sep) && file !== root) return sendJson(res, 403, { error: 'forbidden' });
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(root, 'index.html'); // SPA fallback
  if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'not found' });
  const ext = path.extname(file);
  const immutable = rel.startsWith('/assets/');
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

/** One HTTP server: static client, small JSON API, and the game WebSocket on /ws. */
export function createAppServer(opts: AppOptions): AppServer {
  const api: Record<string, () => unknown> = { health: () => ({ ok: true }), ...opts.api };
  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method not allowed' });
    if (url.startsWith('/api/')) {
      const route = api[url.slice(5).split('?')[0]];
      return route ? sendJson(res, 200, route()) : sendJson(res, 404, { error: 'unknown api' });
    }
    serveStatic(opts.staticDir, url, res);
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    if ((req.url ?? '').split('?')[0] !== '/ws') return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => opts.onConnection(ws, req));
  });
  return { server, wss };
}
