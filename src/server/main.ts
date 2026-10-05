import path from 'node:path';
import { createAppServer } from './http';
import { Match } from './match';
import { TEAM_COUNTS, mapsFor, validSettings } from '../sim/maps';

const PORT = Number(process.env.PORT ?? 8080);
const STATIC_DIR = process.env.STATIC_DIR ?? path.resolve(process.cwd(), 'dist');
const SEED = process.env.SEED ? Number(process.env.SEED) : (Math.random() * 2 ** 31) >>> 0;

const presetTeams = process.env.TEAMS ? Number(process.env.TEAMS) : undefined;
const presetMap = process.env.MAP;
const preset = presetTeams !== undefined || presetMap ? validSettings(presetTeams ?? 2, presetMap ?? 'random') : undefined;
if (preset === null) {
  console.error(`Invalid TEAMS/MAP: TEAMS must be 2, 3 or 4, MAP "random" or a map for that many teams (${TEAM_COUNTS.map((n) => mapsFor(n).map((m) => m.id).join('/')).join(', ')})`);
  process.exit(1);
}
const match = new Match(SEED, { preset });
const { server } = createAppServer({
  staticDir: STATIC_DIR,
  onConnection: (ws) => match.connect(ws),
  api: { lobby: () => match.lobby() },
});

match.start();
server.listen(PORT, () => {
  console.log(`Dino Pew Pew server on http://0.0.0.0:${PORT} (static: ${STATIC_DIR}, world seed ${SEED}, ${preset ? `preset ${preset.teams} teams on ${preset.map}` : 'setup by first player'})`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    match.stop();
    server.close(() => process.exit(0));
  });
}
