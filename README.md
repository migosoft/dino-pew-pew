# Dinoriders

Top-down pixel-retro multiplayer shooter: ride an armed dinosaur through a persistent,
randomly generated prehistoric world. Open the URL, join an existing team or found a new one
(up to 4 teams), and fight the other teams' riders. Each team has a base camp: you respawn
there and nobody can hurt you inside it.

```
npm install
npm run dev     # game server (:8080) + Vite (:5173, proxies /api and /ws) — play at http://localhost:5173
npm test        # unit + server tests
npm run build   # type-check, client bundle in dist/, server bundle in dist-server/
npm start       # run the production server (serves dist/ on :8080)
```

### Docker

```
docker compose up --build -d    # play at http://localhost:8080 (LAN: http://<host-ip>:8080)
```

One container runs one Node process that serves the game page and the game WebSocket (`/ws`)
on port 8080; `/api/health` backs the container health check. For play over the internet, put a
TLS reverse proxy (e.g. Caddy or nginx) in front and forward WebSocket upgrades.

**Controls:** W/S throttle, A/D turn, mouse aims, left click (or Space) fires, hold Tab for scores.

## How it's built

- `src/sim/` — deterministic, Phaser-free simulation (fixed 60 Hz `step()`, seeded RNG).
  Runs only on the server, which is authoritative.
- `src/net/` — wire protocol shared by server and client: input/join validation, compact
  snapshot encoding. Inputs carry sequence numbers that snapshots acknowledge (ready for
  client-side prediction later).
- `src/server/` — one Node process: static files, `/api/health`, `/api/lobby`, and the
  `/ws` game socket. `Match` steps the world at 60 Hz and broadcasts snapshots at 20 Hz.
- `src/client/` — Phaser client. Regenerates the terrain from the world seed, renders the
  server state ~100 ms in the past (interpolated), simulates straight-flying projectiles from
  their spawn events. All art is generated in code at boot, pre-rotated into 64 directions.

Add `?debug` to the URL to expose `window.dinoriders` (client state) for debugging.

## Adding a dinosaur

Dinos are data in [src/sim/defs/dinos.ts](src/sim/defs/dinos.ts). Each weapon `MountDef` says
where it sits (`parent: 'body' | 'head'`, `offset`), its rest direction (`baseAngle`) and how
far it can swivel (`arcHalf`). Projectiles always leave along the barrel's real direction.
A Diplodocus with broadside guns would be two body mounts at `baseAngle` ±90°; see the
test-only definition in [tests/sim/aiming.test.ts](tests/sim/aiming.test.ts). New species also
need sprites drawn in `src/client/render/textures/` under the keys `<kind>_body_<palette>_<pose>`,
`<kind>_shadow_<pose>` and (if it has a head) `<kind>_head_<palette>` (palette = `t0`..`t3`).
