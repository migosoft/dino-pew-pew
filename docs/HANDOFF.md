# Dinoriders: Handoff

**Status (2026-10-01, end of session):** every requested feature is implemented. All 69 tests pass, and the type-check and build are clean. Phases 0–5 are committed on `master`. Phase 5 (dino-claw cursor and armored Triceratops) has been checked in a browser, but the Docker image has **not** been rebuilt with it yet. See [Latest session](#latest-session-phase-5).

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
| `4efb5c5` | handoff document |
| "Phase 5" (latest) | 5: dino-claw menu cursor, armored Triceratops with twin side cannons, `?preview` art sheet |

## Latest session: phase 5
**First action next session:** run `docker compose up --build -d` so the container on :8080 runs the phase 5 code. Until then it serves the phase 4 build.

**What was done:**
1. **Menu cursor bug.** `index.html` sets `canvas { cursor: none }` for the in-game reticle, so the lobby pointer was only visible over menu items.
   - `JoinScene` now sets a pixel-art dino-claw cursor as the default, and a gold variant over menu items and the shop rows.
   - `GameScene.create` resets it to `'none'`. Phaser's default cursor is global across scenes.
   - The art is `drawClawCursor` in `worldArt.ts`, a hand-drawn `CLAW_MAP` scaled to 32×32. The CSS value comes from `src/client/cursor.ts` (`clawCursor(hover)`).
2. **Armored Triceratops, based on the Dino Riders box art the user supplied** (a Triceratops with Hammerhead and Sidewinder).
   - Ridden Triceratops wear a boxy riveted howdah with team-color trim and struts to both flanks (`drawTriceratopsSaddleArmor`).
   - They also wear a face plate and a team-colored frill shield (`drawTriceratopsHeadArmor`).
   - A heavy cannon hangs on each flank (`drawSideCannon`). Wild Triceratops are unarmored.
   - The **horn cannon was removed**.
   - The mounts are now `sideCannonL` and `sideCannonR`: parent `body`, offset `(2, ±13)`, `arcHalf` 35°, muzzle 15.
   - The weapon `sideCannon` does 7 damage every 0.30 s, so total DPS is the same as the old gun.
   - The new `DinoDef.volley: true` makes both cannons fire together on every trigger pull (`sim.ts`). The shots converge on the aim point.
   - Armor is cosmetic for now: HP and the armor upgrade are unchanged.
   - `DinoView` draws the armor overlays generically for any species that has the textures. The rider faces the mean direction of all guns.
3. **Art preview page:** `/?preview` (`PreviewScene`) shows every team palette plus wild × 8 headings, and both claw cursors.
   - Options: `?preview=velociraptor`, `&zoom=4&focus=row,col`.
   - Use it to review sprite work, and take screenshots with headless Edge (see Browser testing).
4. Tests: `tests/sim/triceratops.test.ts` checks the two converging shots from opposite flanks and the shared cooldown.

**Next step the user announced:** they will provide a similar box-art image for the **Velociraptor**, to model its armor and weapons the same way.
- To do it: add `drawRaptor…Armor` functions in `raptorArt.ts` and register `velociraptor_armor_<pal>`/`velociraptor_headArmor_<pal>` for `t0`..`t3` in `textures/index.ts`. `DinoView` needs no changes.
- Adjust `mounts` (and `volley` if it gets several guns) in `dinos.ts`.
- `tests/sim/feeding.test.ts` asserts that the raptor's gun coverage is smaller than the Triceratops'. Keep that in mind when changing raptor arcs.
- Process that worked well this session: plan first, with mockups for the user. Then iterate the art with `?preview` screenshots before wiring up the sim, and check in the game at the end.

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
| Give a species rider armor | Register `<kind>_armor_<palette>` (body overlay) and/or `<kind>_headArmor_<palette>` (head overlay) for `t0`..`t3` in `textures/index.ts`. `DinoView` shows them on ridden dinos whenever the textures exist. The Triceratops versions are in `dinoArt.ts`. Open `/?preview` (or `/?preview=velociraptor&zoom=3&focus=row,col`) to see every palette and heading. |
| Fire all guns at once | `volley: true` on the `DinoDef` (used by the Triceratops' two side cannons). Without it, only the mounts that are on target fire (`selectFiringMounts`). |
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
npm test             # 69 tests, about 1 s
npm run build        # tsc + vite (dist/) + esbuild server bundle (dist-server/server.cjs)
docker compose up --build -d   # production, http://localhost:8080
```
**Environment variables:** `PORT` (default 8080), `STATIC_DIR` (default `./dist`), `SEED` (fixed world seed; random otherwise).

**Browser testing:**
- Adding `?debug` to the URL exposes `window.dinoriders = { scene, net }`.
- No browser driver is in the repo, and playwright is not installed. What worked in the latest session:
  - **Static screenshots:** `msedge --headless=new --disable-gpu --window-size=1728,1080 --virtual-time-budget=8000 --user-data-dir=<tmp> --screenshot=<out.png> "http://localhost:5173/?preview"`. Edge is at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.
  - **Driving the game:** a small Node script started Edge with `--remote-debugging-port`, connected over CDP using the repo's `ws` package, pressed `1` and `1` (found a team, pick Triceratops), replaced `window.dinoriders.scene.playerInput.command` with an autopilot (aim ahead, fire), and called `Page.captureScreenshot`.
  - OS mouse cursors never appear in screenshots. Check `document.querySelector('canvas').style.cursor` instead.
  - Committing such a driver as `scripts/e2e/` would be a good next step.

## Gotchas
- **Windows path case and vitest:** running vitest from `c:\…` (lowercase drive letter) fails with "Cannot read properties of undefined (reading 'config')". Run it from `C:\…`.
- **Docker port mapping on Windows:** right after a local dev server on :8080 is killed, Docker can start the container without publishing the port, and `docker compose ps` shows `8080/tcp` with no `0.0.0.0:`. Fix: `docker compose down`, wait a few seconds, then `up -d`.
- **The user's Docker container usually holds :8080**, so `npm run dev` then fails with EADDRINUSE on the server side, and Vite silently proxies to the old container. For a dev check, leave the container alone and run `PORT=8091 npx tsx src/server/main.ts` together with `GAME_SERVER=http://localhost:8091 npx vite --port 5174`.
- **No Python** on this machine. Use Node one-liners or the edit tools for scripted file edits.
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
