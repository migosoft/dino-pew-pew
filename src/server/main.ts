import path from 'node:path';
import { createAppServer } from './http';

const PORT = Number(process.env.PORT ?? 8080);
const STATIC_DIR = process.env.STATIC_DIR ?? path.resolve(process.cwd(), 'dist');

const { server } = createAppServer({
  staticDir: STATIC_DIR,
  onConnection: (ws) => {
    ws.send(JSON.stringify({ type: 'hello', protocol: 1 }));
  },
});

server.listen(PORT, () => {
  console.log(`Dinoriders server on http://0.0.0.0:${PORT} (static: ${STATIC_DIR})`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
