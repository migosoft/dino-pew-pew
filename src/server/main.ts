import path from 'node:path';
import { createAppServer } from './http';
import { Match } from './match';

const PORT = Number(process.env.PORT ?? 8080);
const STATIC_DIR = process.env.STATIC_DIR ?? path.resolve(process.cwd(), 'dist');
const SEED = process.env.SEED ? Number(process.env.SEED) : (Math.random() * 2 ** 31) >>> 0;

const match = new Match(SEED);
const { server } = createAppServer({
  staticDir: STATIC_DIR,
  onConnection: (ws) => match.connect(ws),
  api: { lobby: () => match.lobby() },
});

match.start();
server.listen(PORT, () => {
  console.log(`Dinoriders server on http://0.0.0.0:${PORT} (static: ${STATIC_DIR}, world seed ${SEED})`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    match.stop();
    server.close(() => process.exit(0));
  });
}
