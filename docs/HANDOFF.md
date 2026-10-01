# Dinoriders: Handoff

**Status (2026-10-01):** every requested feature is implemented and committed on `master`. All 66 tests pass, and the type-check and build are clean. The Docker image has been verified with real browsers.

This document gives the state of the project, how it fits together, and what to watch out for. For how to play and run it, see [README.md](../README.md). The design history is in [docs/superpowers/specs/](superpowers/specs/).

## What the game is
A top-down pixel-art multiplayer shooter. Players ride armed dinosaurs in one persistent world that never ends.
- Opening the URL shows a join screen: join an existing team or found a new one (up to 4 teams), then pick a mount.
- Each team has a base camp. You respawn there, nobody can hurt you inside it, and its shop is there.
- Riderless **wild dinosaurs** (Triceratops and Velociraptor) roam the world. They are a threat, a source of money, and they leave carcasses that carnivores eat.
- **Diets:** standing still next to the right food heals you.
  - Herbivores eat bushes and ferns; only large herbivores also eat trees.
  - Carnivores eat carcasses.
- **Money and upgrades:** kills pay money, spent in your base camp on damage, range, fire rate and armor. You keep your money when you die but lose your upgrades.

## Commit history (one commit per phase)
| Commit | Phase |
|---|---|
| `7bfb5f3` | v1: single-player wave shooter (superseded) |
| `61089fd` | 0: Node server and Docker image |
| `29dfa2c` | 1: persistent multiplayer (teams, bases, respawn, protocol, join screen) |
| `9cd2de4` | 2: Velociraptor, diets, feeding, carcasses |
| `ffc799e` | 3: melee attacks and wild dinosaurs |
| `6c9228c` | 4: money, upgrades, base camp shop |

## Architecture
```
src/sim/     authoritative game logic: pure TS, no Phaser, deterministic (seeded RNG, fixed 60 Hz step)
src/net/     protocol.ts: message types, validation of client input, compact snapshot encoding
src/server/  http.ts (static files + /api + /ws upgrade), match.ts (game loop, sessions), main.ts
src/client/  Phaser 3 browser client: join screen, interpolated rendering, HUD, procedural art
tests/       vitest: sim/, net/, server/ (the server tests open real WebSockets on port 0)
```
**Server:**
- `Match` calls `step(state, inputsByPlayerId, DT)` at 60 Hz.
- Every 3rd tick it broadcasts a snapshot, 20 per second. A snapshot holds dino tuples, players, teams, events stamped with their tick, all carcasses, and the plant food levels that changed since the last snapshot.

**Client:**
- It never runs the sim. It regenerates the terrain from the world seed it gets in `welcome`.
- It renders about 100 ms in the past (`Mirror`, `INTERP_TICKS = 6`), interpolating between snapshots.
- Projectiles are simulated on the client from their `shot` events, since they fly straight, and removed on `hit`/`impact` events.

**AI and players share one interface:** riders send an `InputCommand` (throttle, turn, aim point, fire). Wild dinos produce the same command from `computeWildCommand` in `src/sim/ai.ts`. Movement, eating and melee are shared systems.

**Prepared for client-side prediction, not built:** inputs carry a `seq`, and each snapshot carries `ack`, the last `seq` the server applied for that player.

## Where things live
| You want to… | Look at |
|---|---|
| Add or tune a species | `src/sim/defs/dinos.ts`, `src/sim/defs/weapons.ts`. Sprites go in `src/client/render/textures/` and are registered in `textures/index.ts` under the keys `<kind>_body_<palette>_<pose>`, `<kind>_shadow_<pose>`, `<kind>_head_<palette>`, where palette is `t0`..`t3` or `wild`. Also add the species to the `HERBIVORES`/`CARNIVORES` lists in `ecology.ts` and to `drawCarcass` (`FoodView` falls back to Triceratops art). |
| Change the diet rule | `canEat` in `src/sim/systems/feeding.ts`. Food amounts and regrowth are in the `FOOD` table in the same file. |
| Tune weapon aim limits | `MountDef` (`baseAngle`, `arcHalf`), `HeadDef.maxYaw`. The aim maths is in `systems/aiming.ts`. |
| Tune wild population or behaviour | `src/sim/ecology.ts` (`wildTarget`, spawn rules), `src/sim/ai.ts` (`HUNT_RANGE`, `PROVOKED_TIME`, …) |
| Tune the economy | `src/sim/upgrades.ts` (costs, effect per level, rider bounty), and `bounty` per species in `dinos.ts` |
| Change teams, bases or respawn | `src/sim/players.ts` (`MAX_TEAMS`, `BASE_RADIUS`, `RESPAWN_TIME`, `TEAM_EMPTY_TIMEOUT`), base positions in `worldgen.ts` (`baseSlots`) |
| Add a message type | `src/net/protocol.ts` (types, plus validation in `parseClientMsg`), then `Match.handle`, then `NetClient.receive` |
| Change HUD or UI | `src/client/render/Hud.ts`, `ShopPanel.ts`, `scenes/JoinScene.ts`. All text uses the 5x7 bitmap font in `textures/font.ts`: **uppercase only**, and any glyph you need must be defined there. |

**Rule for new state:** a field that clients must see goes into `GameState` in `src/sim/types.ts`, then into the matching encode/decode in `protocol.ts`, then into a round-trip check in `tests/net/protocol.test.ts`.

## Run and verify
```
npm install
npm run dev          # server :8080 (tsx watch) + Vite :5173 (proxies /api and /ws); play at :5173
npm test             # 66 tests, about 1 s
npm run build        # tsc + vite (dist/) + esbuild server bundle (dist-server/server.cjs)
docker compose up --build -d   # production, http://localhost:8080
```
**Environment variables:** `PORT` (default 8080), `STATIC_DIR` (default `./dist`), `SEED` (fixed world seed; random otherwise).

**Browser testing:**
- Adding `?debug` to the URL exposes `window.dinoriders = { scene, net }`.
- The playwright-core drivers used during development were in a session scratchpad and are **not** in the repo. They worked by replacing `scene.playerInput.command` with an autopilot. Committing a small `scripts/e2e/` driver would be a good next step.

## Gotchas
- **Windows path case and vitest:** running vitest from `c:\…` (lowercase drive letter) fails with "Cannot read properties of undefined (reading 'config')". Run it from `C:\…`.
- **Docker port mapping on Windows:** right after a local dev server on :8080 is killed, Docker can start the container without publishing the port, and `docker compose ps` shows `8080/tcp` with no `0.0.0.0:`. Fix: `docker compose down`, wait a few seconds, then `up -d`.
- **`tsx` without watch** (as started manually in a terminal) does not reload server code. `npm run dev` uses `tsx watch`.
- **Unit tests run without wildlife:** `createMatch(seed, worldOpts, { wildlife })` defaults to no wild dinos so tests stay predictable. The server turns it on (`new Match(seed)`), and tests opt in with `{ wildlife: true }` or `new Match(seed, { wildlife: false })`.
- **Object IDs:**
  - Plants use IDs from 1 up.
  - The first carcasses on the map use 900000 and up.
  - Carcasses created during play use `CARCASS_ID_BASE + nextId` (1000000 and up).
- **K/D** counts only rider-vs-rider kills. Killing a wild dino pays money but doesn't count as a kill.

## Known limitations and suggested next steps
1. **Balance:** wild raptors are strong. In tests, riders crossing the map without shooting back died 2–3 times. Look at `HUNT_RANGE`, the raptor `melee` values and `wildTarget` before adding content.
2. **No client-side prediction:** your own dino reacts one round trip late. That's fine on a LAN, sluggish above about 80 ms. The protocol already carries `seq`/`ack`.
3. **No player names:** players get automatic names (`RIDER n`). The join screen has no text input.
4. **Internet use** needs a TLS reverse proxy that forwards WebSocket upgrades. There are no accounts and no persistence: a server restart creates a new world.
5. **No sound** at all.
6. **No committed browser end-to-end test.** The protocol and `Match` are covered by tests, but rendering is only checked by hand and screenshots.
7. **Omnivores** are supported by the rules but no omnivore species exists yet. A small herbivore exists only as a test definition.
