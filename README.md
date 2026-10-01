# Dinoriders

Top-down pixel-retro arena shooter: ride an armed Triceratops through a randomly generated
prehistoric world and survive waves of enemy riders.

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

**Controls:** W/S throttle, A/D turn, mouse aims, left click (or Space) fires.

## How it's built

- `src/sim/` — deterministic, Phaser-free simulation (fixed 60 Hz `step()`, seeded RNG).
  Player and AI both drive dinos through the same `InputCommand`, so remote players can be
  added later by feeding their commands into `step()`.
- `src/render/`, `src/scenes/` — Phaser presentation. All art is generated in code at boot
  (`src/render/textures/`), pre-rotated into 64 directions to keep pixels crisp.

## Adding a dinosaur

Dinos are data in [src/sim/defs/dinos.ts](src/sim/defs/dinos.ts). Each weapon `MountDef` says
where it sits (`parent: 'body' | 'head'`, `offset`), its rest direction (`baseAngle`) and how
far it can swivel (`arcHalf`). Projectiles always leave along the barrel's real direction.
A Diplodocus with broadside guns would be two body mounts at `baseAngle` ±90°; see the
test-only definition in [tests/sim/aiming.test.ts](tests/sim/aiming.test.ts). New species also
need sprites drawn in `src/render/textures/` under the keys `<kind>_body_<team>_<pose>`,
`<kind>_shadow_<pose>` and (if it has a head) `<kind>_head_<team>`.
