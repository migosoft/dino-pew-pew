# Dino Pew Pew: Handoff

**Status (2026-10-05):** everything is on `master` and pushed (`origin/master` = `fbd0b56`, the merge of PR #1, the camp siege). All 191 tests pass, `tsc` is clean and `npm run build` passes. There are no open branches; `origin/camp-siege` is merged and can be deleted. After that merge, the game was renamed from "Dinoriders" to **Dino Pew Pew**, after the repo `migosoft/dino-pew-pew` (see the naming gotcha).

This document is for whoever picks the project up next. It covers the current state, the decisions that are still open, how the code fits together, and what to watch out for. How to play is in [README.md](../README.md). The design history is in [docs/superpowers/specs/](superpowers/specs/) and the implementation plans are in [docs/superpowers/plans/](superpowers/plans/). Older per-phase notes are in git history (`git log -- docs/HANDOFF.md`).

## Start here
1. **Open decisions** (the user hasn't ruled on these yet):
   - **Camp balance.** A lone rider almost certainly can't take a camp with the current numbers. Crossing CROSSING takes about 2 minutes at Triceratops speed, and riders die to wild dinos on the way. A 400 HP tower takes about 8.5 s of a Triceratops's 47 DPS, while the tower deals 10 DPS back. A destroyed tower rebuilds in 90 s. In the browser, a full round (3 towers, then the building, the win banner and the restart) was only played to the end with HP lowered in a scratch copy of the server. Knobs: `CAMP` and `TOWER_GUN` in `src/sim/camp.ts`.
   - **Brontosaurus strength.** With 220 HP and wide side arcs, it may be the strongest mount since its broadside damage went from 6 to 8. Watch it in play.
   - **Wild raptors** are strong: riders crossing the map without shooting back died 2–3 times in tests (`HUNT_RANGE`, raptor `melee`, `wildTarget`).
2. **Likely next task:** `docs/TASK-https-deploy.md` (untracked, written by the user) describes serving the game over HTTPS with Caddy and Let's Encrypt on an Oracle Cloud VM (`dino-pew-pew.duckdns.org`). The client already switches to `wss://` on HTTPS pages.
3. **The Docker image on :8080 is stale.** It serves protocol 3, so a current client can't join it. Rebuild with `docker compose up --build -d` when the user wants it (see the port-mapping gotcha).

## What the game is
A top-down pixel-art multiplayer shooter. Players ride armed dinosaurs on an 8192 px map and play in **rounds**: each team defends its camp and tries to destroy the others'. The last camp standing wins.
- **Setup:** the first player on an empty server picks 2, 3 or 4 teams and a map: RANDOM, or a fixed map for that team count (so far only **CROSSING**, 2 teams). Later players pick a team slot, then a mount. The env vars `TEAMS`/`MAP` preset the settings and lock them.
- **Camps:** each team has a building (3000 HP) and 5 towers (400 HP). The towers shoot hostile riders and aggressive wild dinos. A force field blocks hits on the building while at least 3 towers stand. A destroyed tower rebuilds after 90 s unless its team is out.
- **Rounds:** `waiting` (camps can't be damaged until every team has a rider) → `countdown` (5 s) → `playing` → `over` (15 s banner) → a fresh world with the same settings. Everyone keeps their team slot, mount and name; money, upgrades and K/D reset. A team is out when its building falls, or when it has been empty for 30 s during play. Its riders can join a surviving team or spectate.
- **Your camp** is your respawn point and shop, and it heals you while its building stands. It is not a safe zone.
- **Mounts:** Triceratops (dash), Velociraptor (leap), Brontosaurus (tail whip, side-firing platform), T-Rex (bite). Right click uses the ability (15 s cooldown).
- **Wild dinosaurs** of all four species roam the world. They are a threat and a source of money, and they leave carcasses.
- **Diets:** standing still next to the right food heals you. Herbivores eat bushes and ferns, only large herbivores also eat trees, and carnivores eat carcasses. Carcasses rot after 120 s.
- **Water:** lakes and rivers. Deep water slows you (`wadeSpeed`), and rivers have currents that push light dinos (`currentDrift`).
- **Money and upgrades:** kills pay money, which you spend in your camp on damage, range, fire rate and armor. You keep money when you die but lose upgrades.

## Architecture
```
src/sim/     authoritative game logic: pure TS, no Phaser, deterministic (seeded RNG, fixed 60 Hz step)
             maps/ (fixed map recipes), camp.ts + systems/structures.ts (camps, towers), rounds.ts (phases)
src/net/     protocol.ts: message types, validation of client input, compact snapshot encoding (protocol 4)
src/server/  http.ts (static files + /api + /ws upgrade), match.ts (game loop, sessions, rounds), main.ts
src/client/  Phaser 3 browser client: join/setup screen, interpolated rendering, HUD, procedural pixel art
tests/       vitest: sim/, net/, server/ (real WebSockets on port 0), client/ (pure HUD logic only)
```
**Server:**
- `Match` hosts one round after another. It holds `settings` (`{ teams, map }`) and `state`.
  - **`Match.state` is null** while an unlocked server has no settings. Code that touches it must check.
  - The first valid `join` that carries a `setup` builds the world (`startRound`). When the last player leaves an unlocked server, both go back to null.
- When the `over` timer runs out, `nextRound` builds a fresh `GameState` (RANDOM gets a new seed; a fixed map always uses its own) and re-adds every connected player. Each client gets a new `welcome`, and `GameScene` restarts itself on the same connection. Building an 8192 px world takes 0.3–0.8 s and blocks the tick loop once per round.
- Each client's inputs wait in a queue (at most 6, oldest dropped), and every tick applies one. With no input waiting, the last one repeats. Snapshots `ack` the seq applied on the latest tick.
- `Match` calls `step(state, inputsByPlayerId, DT)` at 60 Hz. Every 3rd tick (20/s) it broadcasts a snapshot holding:
  - every live dino;
  - players and teams, left out while unchanged;
  - events, stamped with their tick;
  - carcass changes plus `gone` ids, and plant levels that changed;
  - every structure;
  - the round (`{ phase, timer, winner }`), left out while unchanged.
- `welcome` carries all carcasses, every plant that isn't full, and `map`, `teams` and `tiles`, so the client can call `worldOptionsFor` and regenerate the same world.

**Client:**
- It regenerates the terrain from the seed and the map settings.
- **Prediction (`Predictor.ts`):** the client runs the sim for one thing only, its own rider's driving and aim.
  - Every 60 Hz step samples one input, sends it and moves a local copy with `stepDino`. That is `driveDino`, `updateAim` and the second obstacle pass, in the same order as `step()`.
  - Each snapshot resets the copy to the server's state at `ack` and replays the newer inputs.
  - The visible difference glides away over about 100 ms. Corrections over 160 px jump.
  - Not predicted: running abilities (the server's state is shown), pushes, knockback and firing.
- The ground is drawn in 256 px chunks around the camera within a per-frame budget (`GroundChunks`). Obstacles, canopies and plants sit in 512 px buckets, and only those near the camera are visible (`BucketGrid`).
- It renders about 100 ms in the past, interpolating between snapshots (`Mirror`, `INTERP_TICKS = 6`).
- Projectiles are simulated from their `shot` events (they fly straight) and removed on `hit`/`impact`. Tower shots are `shot` events with `dinoId` = the structure id and `mount` = −1.

**AI and players share one interface:** riders send an `InputCommand` (throttle, turn, aim point, fire, ability). Wild dinos produce the same command from `computeWildCommand` (`ai.ts`). Movement, eating, melee and abilities are shared systems.


**Rule for new client-visible state:** add it to `GameState` (`src/sim/types.ts`), then to the encode/decode in `protocol.ts`, then to a round-trip test in `tests/net/protocol.test.ts`.

## Where things live
| You want to… | Look at |
|---|---|
| Tune camps and towers | `CAMP` and `TOWER_GUN` in `src/sim/camp.ts`: HP, radii, field threshold, rebuild time, healing, bounties, turret, spawn ring. Damage, force field and tower AI: `systems/structures.ts` (`damageStructure`, `structureHitBy`, `updateStructures`). Healing: `healInCamps` (`players.ts`). |
| Change rounds | `src/sim/rounds.ts`: `COUNTDOWN`, `INTERMISSION`, `updateRound`, `setPhase`, `eliminateTeam`, `switchTeam`. `TEAM_EMPTY_TIMEOUT` is in `players.ts`. Restarts and setup: `Match` (`startRound`, `nextRound`, the `join` branch of `handle`). Client: `JoinScene` (setup steps), `EliminatedPanel`, banners in `hudModel.ts`. |
| Add or change a fixed map | `src/sim/maps/`: a `MapRecipe` (`types.ts`: camp and tower spots, lakes, rivers, fords, zones, symmetry, its own seed), like `crossing.ts`, registered in `MAPS` (`index.ts`). `worldOptionsFor(map, teams, tiles)` is called by both the server and the client. Tests: `tests/sim/maps.test.ts`. |
| Tune the random map | `src/sim/worldgen.ts`: `DEFAULT_TILES` (512), `baseSlots`/`baseInset` (camp positions), `waterLayer` (`LAKE_*_SHARE`, `RIVER_SPEED`, `RIVER_DEEP`, `RIVER_WIDE`), `OBSTACLE_GAP`. The terrain lookup is `tileAt` (`world.ts`); use `isWater`/`isDeepWater`/`flowAt`/`isRiver` rather than indexing tiles. |
| Add or tune a species | `src/sim/defs/dinos.ts`, `defs/weapons.ts`. Sprites go in `src/client/render/textures/`, registered in `textures/index.ts` (`<kind>_body_<palette>_<pose>`, `<kind>_head_<palette>`, palette `t0`..`t3` or `wild`). Also add it to `HERBIVORES`/`CARNIVORES` (`ecology.ts`) and `CARCASS_KINDS`/`drawCarcass` (`foodArt.ts`). The Brontosaurus and T-Rex are drawn at `BRONTO_SCALE`/`REX_SCALE`, and their sizes in `dinos.ts` use the same factor: **change them together**. |
| Bending necks and tails | `src/client/render/chains.ts` (`CHAINS`, `taperedChain`). Motion: `TRAIL_RATE`, `TAIL_SWAY`, `SWAY_WAVE`, `WHIP_*` in `DinoView.ts`. Chained species have no `_shadow_` texture: their shadow is stamped from masks. The sim still uses one circle per dino. |
| Rider armor | `<kind>_armor_<palette>` and `<kind>_headArmor_<palette>` in `textures/index.ts`; `DinoView` shows them on ridden dinos. |
| Abilities | `ability` on the `DinoDef` (`leap`, `dash`, `whip`, `bite`), logic in `systems/abilities.ts`, wild use in `wantsAbility`/`wantsWhip` (`ai.ts`), rendering in `DinoView`. |
| Firing rules | `volley: true` fires all mounts together; `fireMode: 'side'` (Brontosaurus) fires every mount whose arc holds the cursor (`selectSideMounts`); otherwise only on-target mounts fire. Aim limits: `MountDef`, `HeadDef.maxYaw`, `systems/aiming.ts`. |
| Diets and food | `canEat` and the `FOOD` table in `systems/feeding.ts`; `CARCASS_DECAY_SECS`. |
| Wild population and behaviour | `src/sim/ecology.ts`: `wildTarget(players, area)` = `min(110, 28 + 5·players) × min(2.5, area / 4096²)`, so up to 275. Also `src/sim/ai.ts` (`HUNT_RANGE`, `PROVOKED_TIME`, …). |
| Economy | `src/sim/upgrades.ts`, and `bounty` per species. |
| Teams, respawn, player cap | `src/sim/players.ts`: `MAX_TEAMS`, `MAX_PLAYERS` (23), `BASE_RADIUS` (= `CAMP.radius`), `RESPAWN_TIME`. |
| Camp and tower art | `textures/campArt.ts` (`drawCamp`, `drawTowerBase`, `drawTowerTurret`), `structureStages.ts` (HP → damage stage), `StructureViews.ts` (sprites, force field, smoke, fire, rebuild scaffold). Preview: `/?preview=camp`. |
| Ground drawing | `GroundChunks.ts` (`FRAME_BUDGET_MS`, `KEEP`), `drawGroundChunk` and `CHUNK` in `worldArt.ts` (per-chunk seeds, `DETAIL_INSET`), `BucketGrid.ts`. |
| Water visuals | `WaterView.ts`, `waterArt.ts`. |
| HUD and UI | `Hud.ts`, `hudModel.ts` (pure, unit-tested), `ShopPanel.ts`, `EliminatedPanel.ts`, `scenes/JoinScene.ts`. All text uses the 5×7 bitmap font in `textures/font.ts`: **uppercase only**, and every glyph you need must exist there. Write cooldowns as `IN 12`, because `12S` reads as `125`. |
| A new message type | `src/net/protocol.ts` (types, and validation in `parseClientMsg`), then `Match.handle`, then `NetClient.receive`. |

## Run and verify
```
npm install
npm run dev          # server :8080 (tsx watch) + Vite :5173 (proxies /api and /ws); play at :5173
npm test             # 191 tests, about 5 s (longer under load)
npm run build        # tsc + vite (dist/) + esbuild server bundle (dist-server/server.cjs)
docker compose up --build -d   # production, http://localhost:8080
```
**Production over HTTPS** (Caddy + Let's Encrypt on the Oracle VM): see [DEPLOY.md](DEPLOY.md).

**Environment variables:**
- `PORT` (default 8080), `STATIC_DIR` (default `./dist`).
- `SEED`: the world seed of the first RANDOM round (random if unset).
- `TEAMS` (2–4) and `MAP` (`random` or a map id such as `crossing`): either one presets and locks the round settings, so nobody sees the setup screen. `TEAMS=2 MAP=crossing` is the quickest setup for browser checks.

**Browser testing.** There is no browser driver in the repo (playwright isn't installed). What works on this machine:
- **`?debug`** exposes `window.dinoriders = { scene, net }`. It also shows a bottom-left line: `RTT` (input to its first ack, including up to ~65 ms of tick and snapshot wait), snapshot `JIT`ter, `FPS`, the last prediction correction `ERR` in px, and `PRED`/`SERVER`. **`?debug&lag=N`** adds N ms of round trip in the client, to try a remote server's latency locally. `/?preview` (and `?preview=<kind>`, `?preview=camp`, `&zoom=N&focus=row,col`) shows the art sheets.
- **Screenshots:** `msedge --headless=new --disable-gpu --window-size=1728,1080 --virtual-time-budget=8000 --user-data-dir=<fresh tmp dir> --screenshot=<out.png> "<url>"`. Edge is at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.
  - Pipe stderr (`2>&1 | tail -1`); with stderr sent to `/dev/null`, Edge sometimes writes nothing.
  - Use a new `--user-data-dir` per run.
  - The file can appear a few seconds after the command returns, so poll for it.
- **Driving the game:** a small Node script, which has never been committed:
  1. Start Edge with `--remote-debugging-port` and talk CDP over the repo's `ws` package (`createRequire` on the repo's `package.json`).
  2. Open `/?debug` and wait until `window.dinoriders` exists. The first load after Vite starts is slow.
  3. Press the team key, then the mount key.
  4. Replace `scene.playerInput.command` with an autopilot. A round restart replaces `playerInput`, so re-install it after each `welcome`.
  5. Read your dino from `[...scene.dinoViews.values()].map(v => v.lastView)` and enemy structures from `scene.net.mirror.structuresAt(...)`. Take shots with `Page.captureScreenshot`.
- **Frame time:** headless fps is capped at 60, so measure CPU per frame instead: `performance.now()` on `scene.game.events` `'prestep'` and `'postrender'`. Replacing `game.step` doesn't work, because the loop holds a bound copy.
- **Timing a round restart:** listen on `scene.net.ws` with `addEventListener('message')`. Page timers are blocked while the client rebuilds the world.
- **Clean up:** headless Edge leaves processes behind. Kill them by their `--user-data-dir` (`Get-CimInstance Win32_Process`, filtered on the command line). Dozens of leftovers once dropped the in-game fps from about 45 to 13.
- OS mouse cursors never appear in screenshots; check `document.querySelector('canvas').style.cursor` instead.
- Committing a driver as `scripts/e2e/` would be a good next step. It only makes sense once a round can finish with the real HP values, or with a test-only override.

## Gotchas
- **Naming:** the game is **Dino Pew Pew**. That name appears in the page title, the join screen, the server log, the README and `package.json` (`dino-pew-pew`). Deployment uses `dino-pew-pew` everywhere: the Docker Compose project, service and image (both compose files set `name: dino-pew-pew`), the `Caddyfile` proxy target `dino-pew-pew:8080`, and the VM clone at `~/dino-pew-pew`. If you rename the service, change the `Caddyfile` in the same change. Two identifiers still use the old name: the local folder `Dinoriders` and the debug handle `window.dinoriders`. The older specs and plans keep the old name as history. Comments about "Dino Riders box art" refer to the toy line the art is based on.
- **vitest and the drive letter:** running vitest from `c:\…` (lowercase) fails with "Cannot read properties of undefined (reading 'config')". Run it from `C:\…`.
- **The user's Docker container usually holds :8080**, so `npm run dev` fails with EADDRINUSE on the server, and Vite silently proxies to the old container. Since the Compose project was renamed to `dino-pew-pew`, a container started before the rename belongs to the old project `dinoriders`: stop it once with `docker compose -p dinoriders down` before `docker compose up`. Otherwise, leave the container alone and run `PORT=8090 npx tsx src/server/main.ts` together with `GAME_SERVER=http://localhost:8090 npx vite --port 5174`.
- **Docker port mapping on Windows:** right after a local server on :8080 is killed, Docker can start the container without publishing the port (`docker compose ps` shows `8080/tcp` with no `0.0.0.0:`). Run `docker compose down`, wait a few seconds, then `up -d`.
- **Rider movement runs on both server and client** (`driveDino`, `stepDino` in `Predictor.ts`). If you change what `step()` does to a ridden dino's position, heading or aim, or the order it does it in, change `stepDino` too. `tests/client/predictor.test.ts` checks that the two agree exactly.
- **World generation runs on both server and client**, so it must stay deterministic for `(seed, options)`: only `state.rng` or the seeded noise, never `Math.random`, and no engine-sensitive maths such as `Math.hypot` (use `Math.sqrt(dx*dx + dy*dy)`). After changing world generation, restart a non-watch server, or it simulates a different map than the clients draw.
- **`src/sim` must not import Phaser.**
- **Tests use the small map:** `SMALL` (4096 px) from `tests/helpers.ts` keeps unit tests fast. Building the full 8192 px world takes about 0.3 s in Node, much longer under load; `testTimeout` and `hookTimeout` are 20 s.
- **Server tests wait on conditions, never on fixed sleeps** (`until`, `tickUntil`, `waitFor` in `tests/server/match.test.ts`). Fixed 20–50 ms sleeps failed intermittently under CPU load.
- **Unit tests run without wildlife:** `createMatch(seed, worldOpts, { wildlife })` defaults to none. `{ camps: false }` leaves camps out, for tests that put dinos where a camp building would stand.
- **Ids:** dinos and structures share `state.nextId`. Plants use ids from 1 up, the initial carcasses 900000 and up, and later carcasses `CARCASS_ID_BASE + nextId` (1000000 and up). After compacting `state.dinos` in place, call `forgetDinoIndex`.
- **`Mirror.dinosAt` returns reused objects**, one per dino id. Read them during the frame and don't keep them.
- **K/D** counts only rider-vs-rider kills. Tower kills show in the feed as `<TEAM> TOWER > victim`.
- **No Python** on this machine. For scripted edits, write a `.cjs` file and run it with `node`, or use the edit tools. Heredocs and `node -e` with nested quotes have mangled text before.
- **No `gh` CLI.** PR #1 was opened through the GitHub REST API with the token from `git credential fill` (never print it). Alternatively, `winget install GitHub.cli`.

## Measurements (2026-10-05, this machine, after the camp siege)
- **Client frame time** (headless Edge with software rendering, one rider driving for 90 s): CROSSING mean 3.0 ms (p99 5.9); RANDOM 8192 mean 3.3 ms (p99 10.4), at 60 fps. With two Edge instances plus Vite and the server on the same machine, there were single 130–190 ms spikes that were not traced. Drawing a ground chunk causes the p99 spikes.
- **Round restart:** 15.6 s from the `over` snapshot to the next `welcome` (the intermission plus the world build). The client rebuilt the scene within 0.9 s.
- **Server** (the real `Match` with 16 bots firing nonstop, wildlife on, 4 simulated minutes):

  | Setup | Dinos alive | Tick mean / p99 | Snapshot compressed mean / max |
  |---|---|---|---|
  | 2 teams, CROSSING | 89 | 1.17 / 3.0 ms | 2.9 / 4.1 KB |
  | 4 teams, RANDOM 8192 | 91 | 1.25 / 3.1 ms | 3.2 / 4.4 KB |
  | 2 teams, CROSSING, wildlife at its target | 168 | 1.06 / 2.3 ms | 5.3 / 8.1 KB |
  | 4 teams, RANDOM 8192, wildlife at its target | 165 | 1.20 / 2.6 ms | 5.5 / 8.1 KB |

- **Capacity:** server CPU is not the limit (a tick is about 1–2 ms of its 16.7 ms budget). Upload bandwidth is, because every player gets every dino. Before the siege, 16 players needed about 6 Mbit/s of upload; now that the wild population can reach 275, snapshots are about twice as large. A home connection carries roughly 16 players; a hosted server many more. Raising `MAX_PLAYERS` past 23 is safe on the server side, but test with real players first. For 50 or more, add area-of-interest culling.
- **Steering latency** (headless Edge, `?lag=150`, CROSSING): from key down to a visible turn, 10 ms with prediction and 366 ms without (`predictor.apply` disabled). The correction readout stayed at 0 px while driving freely.
- **Not tested:** more than 2 real browsers on separate machines, over a real network.

## Known limitations
1. **Prediction covers driving and aiming only.** Shots, hits, ability starts and pushes from other dinos still show one round trip (plus the 100 ms interpolation) late. Your own shots are drawn leaving your predicted position.
2. **No player names:** players get `RIDER n`. The join screen has no text input.
3. **Internet use** needs TLS in front of the server (see `docs/TASK-https-deploy.md`). There are no accounts and no persistence: a restart creates a new world.
4. **No sound.**
5. **Only one fixed map, CROSSING (2 teams).** The recipe format supports 3- and 4-team maps, but none exist yet, so 3 and 4 teams always play RANDOM.
6. **No minimap** on the 8192 px world. Edge arrows point to enemy camps, and the HUD strip shows camp status.
7. **No browser end-to-end test in `npm test`.** Rendering is only checked by screenshots. The pure HUD logic (`hudModel.ts`, `structureStages.ts`) has unit tests.
8. **One collision circle per dino:** the Brontosaurus's neck and tail pass through rocks and other dinos. Its feeding reach is also measured from the body centre, about 65 px behind its head.
9. **Omnivores** are supported by the rules, but no omnivore species exists.
10. **Small UI rough edges:**
    - the force-field dome is faint on grass;
    - "YOUR CAMP HAS FALLEN" shows through the semi-transparent eliminated panel;
    - the spectator hint says `1-4 TO JOIN` even with 2 or 3 teams;
    - the rebuild scaffold draws above nearby dinos.

## Performance backlog
Roughly in order of payoff within each group.

**Network:**
- **Area-of-interest culling:** send each client only the dinos near its camera. This matters more now that wildlife can reach 275.
- Send `kind` and `team` as small integers (a table in `welcome`), and `maxHp` only when a dino first appears.
- Quantize event floats, and drop the `team` field from shot events (it can be derived).
- Inputs must stay at one per tick, because prediction replays them step by step. To save messages, batch 2–3 of them per message instead.

**Client, per frame:**
- Draw ground chunks in a worker or an `OffscreenCanvas`, to remove the p99 spikes. Chunks are also redrawn after every round restart.
- Depth sorting: Phaser re-sorts the whole display list whenever any depth changes. Put static and flat objects in their own Layers, and call `setDepth` only on change.
- `WaterView`:
  - precompute wave keys and speeds, and streak lengths;
  - pool fish images;
  - pre-filter dinos before the fish loop.
- Compute `wadingOf` once per dino per frame (it runs twice today).
- Pool projectile sprites, effects and `DinoView`s, and skip off-screen effects.
- Avoid per-frame allocations in `Mirror.takeEvents`/`projectilesAt`, `StructureViews` and `GroundChunks`.
- `ArcIndicator` and the camp rings are Graphics redrawn every frame; turn the static parts into textures.

**Simulation:**
- `clearHeading` (`ai.ts`): hoist its probe arrays, cache the heading for a few ticks, and use a per-tile "wet" bitmap.
- Look up `tileIndexAt` once per dino per tick (`movement.ts`), and have `flowAt` return through out-parameters.
- Ability hit scans: use `dinosNear`, and make `abilityHit` a Set.

**Boot:** the `WaterView` constructor scans the whole map on an 11 px grid; skip tiles with no water. `generateTextures` re-rotates masks it could take from the already-rotated strips.

**Scaling past one match:** run one match per `worker_thread` or process. A rewrite in another language would not help one match much, and it would mean keeping a second copy of `src/sim`, which the client also uses.
