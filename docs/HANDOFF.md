# Dinoriders: Handoff

**Status (2026-10-01, end of session):** every requested feature is implemented. All 82 tests pass, and the type-check and build are clean. Phases 0–6 are committed on `master`. Phase 6 (armored Velociraptor with twin side guns, raptor leap, triceratops dash) has been checked in a browser, and the Docker image on :8080 has been rebuilt with it. See [Latest session](#latest-session-phase-6).

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
| "Phase 5" | 5: dino-claw menu cursor, armored Triceratops with twin side cannons, `?preview` art sheet |
| "Phase 6" (latest) | 6: armored Velociraptor with twin side guns, right-click abilities (raptor leap, triceratops dash) |

## Latest session: phase 6
**What was done** (based on a second Dino Riders box image the user supplied: a Deinonychus ridden by Antor):
1. **Armored Velociraptor.**
   - Ridden raptors wear a small riveted metal saddle with team-color trim and struts to both flanks (`drawRaptorSaddleArmor`), plus a silver face mask with a grille (`drawRaptorHeadArmor`). Wild raptors are unarmored.
   - The head-mounted dart launcher was **removed**. A small gun (`drawRaptorSideGun`, with a red power cell) now hangs on each flank.
   - Mounts `sideGunL` and `sideGunR`: parent `body`, offset `(1, ±8)`, `arcHalf` 25°, muzzle 8, `volley: true`.
   - The weapon `raptorSideGun` does 3 damage every 0.26 s. Two guns give about 23 DPS, the same as the old dart.
   - The gunmetal colors (`METAL*`, `RIVET`) are now exported from `dinoArt.ts` and shared.
2. **Abilities on right click, with a 15 s cooldown** (`DinoDef.ability`, code in `src/sim/systems/abilities.ts`).
   - **Velociraptor leap** (`kind: 'leap'`): it jumps toward the aim point, 30–110 px away, in 0.45 s.
     - While airborne (`isAirborne` in `world.ts`), it skips rock push-out, dino contact and melee, both as attacker and as target. Projectiles still hit it.
     - On landing it deals 18 damage to every hostile within its radius + their radius + 8 px.
   - **Triceratops dash** (`kind: 'dash'`): 0.4 s at 260 px/s along its heading, which ignores steering.
     - It deals 20 damage once to each hostile it touches in front of it (±70°) and shoves it 12 px. Dinos in their own base camp are neither hurt nor shoved.
     - A head-on rock ends the dash early.
   - The rider can still aim and fire during either ability.
   - **Wild dinos** use their ability on a target they are hunting or charging, when it is in range and ahead. Each tick has a 1.5% chance, about once a second on average, and the same 15 s cooldown applies (`wantsAbility` in `ai.ts`).
3. **Protocol.**
   - `InputCommand.ability` (optional) is sent as `ab: 0|1`.
   - `DinoTuple` has two new trailing fields: `abilityPhase` (0, or a progress of 1..1000) and `abilityCd` (tenths of a second).
   - New events: `ability` (take-off dust) and `slam` (leap landing: dust ring, sparks, shake). Dash hits reuse the `melee` event.
4. **Client.**
   - Mid-leap, `DinoView` raises every part by up to 10 px, scales it up to 1.15× (the part offsets too) and draws it above the y-sort. The shadow stays on the ground and shrinks.
   - Dashing dinos leave a dust trail (`GameScene`).
   - The HUD stats show `JUMP READY`/`JUMP IN 12` (or `DASH …`). Write it as `IN 12`, because `12S` reads as `125` in the 5x7 font.
   - The join screen and the README list the new control.
5. **Tests.**
   - `tests/sim/raptor.test.ts` covers the volley.
   - `tests/sim/abilities.test.ts` covers:
     - leap range, landing damage and friendly fire;
     - passing over dinos;
     - the cooldown, and base immunity;
     - dash distance, single hit and the rock stop;
     - wild dinos using abilities occasionally.
   - `tests/net/protocol.test.ts` covers the new input and tuple fields round-trip.
6. **Verification.** The art was reviewed with `?preview=velociraptor`. The game was driven with the CDP approach under Browser testing: two bolts per shot, a leap, a dash with its dust trail, and the HUD cooldown. The driver script was not committed.

**Balance knobs:**
- The `ability` entries in `dinos.ts`: damage, range, speed, cooldown.
- `ABILITY_CHANCE` and the range/arc checks in `wantsAbility` (`ai.ts`).
- `DASH_ARC` and `DASH_KNOCKBACK` in `abilities.ts`.

## Phase 5 (previous session)
- **Dino-claw menu cursor.**
  - `JoinScene` sets the default cursor; `GameScene.create` resets it to `'none'`, because the cursor is global across scenes.
  - The art is `drawClawCursor` (`worldArt.ts`), and the CSS value comes from `src/client/cursor.ts`.
- **Armored Triceratops** from the user's box art:
  - a howdah (`drawTriceratopsSaddleArmor`) and head armor;
  - two flank cannons (`sideCannonL`/`sideCannonR`, `sideCannon`: 7 damage every 0.30 s) firing as a `volley`;
  - the horn cannon was removed;
  - the armor is cosmetic only.
- **Art preview page** `/?preview` (`PreviewScene`): every palette × 8 headings. Options: `?preview=velociraptor`, `&zoom=4&focus=row,col`.
- **Process that worked well:**
  1. Plan first.
  2. Iterate the art with `?preview` screenshots before wiring up the sim.
  3. Check in the game at the end.

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
| Give a species an ability | `ability` on the `DinoDef` (`kind: 'leap' \| 'dash'`). The logic is in `src/sim/systems/abilities.ts`, wild use in `wantsAbility` (`ai.ts`), and the leap rendering in `DinoView`. A new kind needs a branch in `updateAbility`. |
| Fire all guns at once | `volley: true` on the `DinoDef` (used by both species' twin side guns). Without it, only the mounts that are on target fire (`selectFiringMounts`). |
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
npm test             # 82 tests, about 1.5 s
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
