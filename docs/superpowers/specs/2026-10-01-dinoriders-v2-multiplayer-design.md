# Dinoriders v2: Persistent Multiplayer World, Diets, Economy, Velociraptor, Docker

## Context
v1 (commit `7bfb5f3`) is a single-player wave shooter. It already has:
- a deterministic, Phaser-free sim (`src/sim/`, `step(state, commands, dt)`);
- the player and AI sharing one `InputCommand`;
- data-driven `DinoDef`/`MountDef`;
- procedural pixel art.

The user wants it to become a **permanent, always-on multiplayer match**. One Docker container hosts both the web page and the game server. Opening the URL joins the running match, and the joining screen lets you pick an existing team or found a new opposing team.

On top of that:
- species with diets (herbivore or carnivore, omnivore later), eating to heal, carcasses;
- a Velociraptor;
- money from kills, spent on weapon and armor upgrades.

Decisions confirmed with the user (after a feasibility review):
- **PvPvE:** teams of riders fight each other. Instead of AI riders and waves, **wild dinosaurs without riders** roam the world. They are a threat, a bounty, and food for carnivores once killed.
- **Death:** respawn at your team base after a few seconds. You keep your money but **lose your upgrades**.
- **Shop:** only inside your own **team base** (a safe zone). The world keeps running.
- **Network:** LAN/local first, with no client-side prediction. The protocol is still shaped so prediction can be added later: input sequence numbers, server ticks and acknowledgements.
- **Food:** everything depletes; carcasses deplete much more slowly than plants. Small herbivores cannot eat from trees, only bushes and ferns.
- **Docker:** one image runs the Node server, which serves the static game and the WebSocket on a single port.

**Dropped from v1 on purpose:** waves, game over, intermission, and offline single-player. Playing alone still works: you are just alone in the persistent world with the wild dinos.

## Feasibility notes (flagged to the user)
- **Load is fine:** about 16 players, about 40 wild dinos and a few hundred projectiles at 60 Hz on the server is trivial. Bandwidth at 20 Hz snapshots is a few KB/s per client.
- **Internet play:** without prediction your own dino reacts one round trip late. That's unnoticeable on a LAN and sluggish above about 80 ms. The protocol prepares for prediction, but it is not built now.
- **No accounts:** anyone with the URL can join. The server validates and clamps all client input. Internet exposure needs a TLS reverse proxy (documented, not built).
- **Build order matters:** the network foundation comes first, so the diet, economy and raptor features are written multiplayer-aware once rather than rewritten.

## Architecture
```
src/sim/      shared, deterministic game logic (unchanged principle; now multi-team)
src/net/      shared protocol: message types, snapshot (de)serialization
src/server/   Node: http static (dist/) + ws, match loop, lobby, player sessions
src/client/   Phaser app (today's src/render, scenes, input) + NetClient
```
**Server** (`ws` package):
- `Match` owns a `GameState` and calls `step()` 60 times a second with the latest input per connected player.
- It broadcasts a **snapshot 20 times a second**. A snapshot holds:
  - the server tick;
  - per-player `lastInputSeq`;
  - dinos (id, kind, team, x, y, heading, speed, headYaw, mount angles, hp, flags);
  - food-source changes;
  - this period's events (shots, hits, deaths, feeds).
- Projectiles travel in straight lines, so they are sent once as spawn events and the client moves them itself.
- The world isn't sent. The **seed** goes out at join and the client regenerates the identical terrain.

**Client:**
- `NetClient` sends `{seq, input}` every client tick (rate-limited to 60 Hz).
- It keeps a ~100 ms interpolation buffer, and renders all dinos, its own included, from interpolated snapshots.
- Every view class (`DinoView`, `WorldView`, …) is reused. They switch from reading the local `GameState` to reading a client-side mirror of the same shape.

**Dev:** `npm run dev` runs Vite and the server (via `tsx watch`) together. Vite proxies `/ws` and `/api`.
**Prod:** the server is bundled with esbuild into `dist-server/`.

## 1. Multi-team sim (`src/sim/`)
**Teams:**
- `Team` becomes a team id string, plus the reserved `'wild'`.
- `GameState` gains:
  - `teams: TeamState[]` (id, colorIndex, base position);
  - `players: Map<playerId, PlayerState>` (dinoId, kind, money, upgrades, respawnTimer, kills).
- There are at most 4 teams, with bases at fixed spots near the four corners. An empty team dissolves after 30 s.

**Bases:**
- A **base** is a circular safe zone (radius ~90). Inside your own base you take no damage, and enemy riders' projectiles vanish at the edge of the zone.
- Bases are kept clear of obstacles at generation. The map grows to 128×128 tiles (2048 px) to fit 4 bases.

**Lifecycle:**
- `addPlayer(state, team, kind)` spawns at the team's base.
- `removePlayer` removes the player and their dino.
- When a player's dino dies it leaves a carcass, a respawn timer of 4 s starts, and the upgrades reset.
- The v1 waves and game over go away: `waves.ts` is replaced by `ecology.ts`.

**Riders vs. wild:**
- A `Dino` gets `ridden: boolean`. Wild dinos don't use their weapon mounts.
- Every `DinoDef` gains a **natural melee attack** `melee: { damage, reach, arc, interval }`: the Triceratops gores, the raptor claws.
- Melee triggers automatically on a hostile in front and in reach, for both ridden and wild dinos. This replaces the old bump damage.

## 2. Diets & feeding (`src/sim/systems/feeding.ts`)
**New `DinoDef` fields:**
- required: `diet: 'herbivore'|'carnivore'|'omnivore'` and `size: 'small'|'large'`;
- also `eatRate` and `bounty`.

**Eligibility:** one rule, `canEat(def, source)`:
- herbivore: bush, fern, and tree only if large;
- carnivore: carcass;
- omnivore: all of these.

**`FoodSource`** (`GameState.food`):
```ts
{ id, kind: 'tree'|'bush'|'fern'|'carcass', x, y, reach, food, maxFood, regrowPerSec, costPerHp, species?, heading? }
```

**Placement:**
- World generation adds:
  - tree food at each trunk;
  - scattered **bushes** on grass (no collision);
  - **fern patches** on fern tiles;
  - **6–10 random carcasses**, spread apart and away from the bases.
- Every death, wild or ridden, adds a carcass of that species (small species hold 60% as much food).

**Numbers:**
| Source | Food (max) | Regrows | Food used per HP healed |
|---|---|---|---|
| Fern | 25 | 1.2/s (after 5 s untouched) | 1.0 |
| Bush | 40 | 1.2/s (after 5 s untouched) | 1.0 |
| Tree | 80 | 1.2/s (after 5 s untouched) | 1.0 |
| Carcass | 240 | never | 0.25 |

So a carcass lasts about 4× longer per food unit than a plant, and is removed when empty.

**Eating rule:** a dino eats from the nearest eligible source when:
- its HP is below max;
- it is within `reach + radius` of that source;
- its speed is under 12;
- it is not firing.

It heals `eatRate`/s and emits a `feed` event.

## 3. Wild dinosaurs (`src/sim/ecology.ts`, `src/sim/ai.ts`)
**Population:** a target of `12 + 3 × playerCount`, capped at 45, split about 70% herbivores and 30% carnivores. Missing dinos spawn off-camera from all players and away from bases, at a rate of about 1 every 2 s.

**AI behaviour** (one function per diet; all of them output an `InputCommand`):
- **Wild herbivore:**
  - wanders and grazes, eating normally;
  - when damaged by someone, it **flees** if small and **charges** the attacker with its melee attack if large;
  - it calms down after 6 s.
- **Wild carnivore:**
  - wanders;
  - hunts the nearest non-wild dino, or small wild herbivore, within 180 px, using melee;
  - forages at carcasses when hurt.
- **Shared:** the v1 obstacle steering (`clearHeading`) is reused.

**Bounties:** money for a kill goes to the killer: wild Triceratops 25, wild raptor 20, enemy rider `40 + 10 × the victim's upgrade levels`.

## 4. Economy & base shop (`src/sim/upgrades.ts`)
**Per-player upgrades:** `upgrades: {damage, range, fireRate, armor}`, levels 0–5.

**Costs:** `cost = base × 1.6^level`, with base costs damage 60, range 40, rate 70, armor 60.

**Applying upgrades:** `applyUpgrades(dino, upgrades)` sets:
- `damageMul = 1 + 0.15L`;
- new `rangeMul = 1 + 0.12L`;
- `fireIntervalMul = 0.88^L`;
- new `armor = 0.08L` (max 40%; incoming damage × (1 − armor)).

**Buying:** `buyUpgrade(state, playerId, stat)` works only while the player's dino is inside its own base. The client sends `{type:'buy', stat}` and the server validates it.

## 5. Velociraptor (`src/sim/defs/`)
**Stats:**
- small carnivore: radius 7, maxSpeed 118, accel 230, turnRate 3.6, turn penalty 0.2, HP 60;
- head `maxYaw` 15°;
- claw melee: damage 6, interval 0.5 s.

**Weapon:** a `raptorDart` mount on the head, `arcHalf` 15°, giving about ±30° forward. Damage 5, interval 0.22 s, speed 300, range 210.

**Triceratops:** keeps its stats, plus diet herbivore, size large, and a gore melee attack (damage 10, interval 0.8 s).

## 6. Client UI (`src/client/`)
**Join screen** (`JoinScene`):
1. Fetches `GET /api/lobby`, which returns the teams with player counts and colors, plus whether a new team is allowed.
2. You pick **"Join TEAM n"** or **"Found a new team"**.
3. Then you pick the **species** with stat cards (Triceratops: herbivore, tough; Raptor: carnivore, fast).
4. It connects the WebSocket, and the server answers with your ids and the seed.

Players get auto-generated names such as "RIDER 7".

**Art:**
- 4 team palettes plus 1 natural "wild" palette replace player/enemy. Textures are generated per palette, and wild dinos are drawn without a rider or weapon.
- New raptor art: body (two leg poses), head and dart launcher.
- New `foodArt.ts`: bushes and fern patches in 3 depletion stages, and per-species carcasses in 3 stages (fresh → meat on ribs → bones).
- Base camp art: a ring of totems or stones, with a ground tint in the team color.

**HUD:**
- HP, money, upgrades, "EATING", "SAFE ZONE / SHOP [E]", and a death/respawn countdown;
- an arrow pointing to your base;
- a kill feed;
- Tab shows the scoreboard (team kills).

**Shop panel:** `ShopScene` overlay, opened with E inside your own base while the world keeps running. It shows the 4 upgrades with level pips and cost, uses the existing `pixelText`, and supports clicking or keys 1–4.

## 7. Docker
- **`Dockerfile`**, multi-stage:
  - build stage: `node:22-alpine`, `npm ci`, `npm test`, `npm run build` (Vite client plus the esbuild server bundle);
  - runtime stage: `node:22-alpine` with `dist/`, `dist-server/` and production dependencies only (`ws`), running as a non-root user.
- **Single port:** `EXPOSE 8080`, with a `HEALTHCHECK` on `/api/health`.
- **`docker-compose.yml`:** `8080:8080` with `restart: unless-stopped`.
- **`.dockerignore`.**
- **README:** run instructions, LAN play ("open http://<host-ip>:8080"), and a note on putting a TLS reverse proxy in front for the internet.

## Implementation sequence
The order follows the dependencies. Every phase ends with tests passing, the game running in Docker, and a commit, so there is always a working, deployable build.

| # | Phase | Why here | Done when |
|---|---|---|---|
| 0 | **Server skeleton + Docker** | Removes deployment risk first; every later phase is tested in the container. | `docker compose up` serves the v1 game on :8080; `/api/health` is OK; a WebSocket connection is accepted. |
| 1 | **Multiplayer core** | Everything else depends on the networked state. | Two browsers on opposing teams shoot each other; a third joins an existing team; respawn works. |
| 2 | **Velociraptor + diets & feeding** | The raptor is the first carnivore, which carcass feeding needs. Diets are pure sim plus art. | You can pick the raptor; a herbivore heals at bushes and a raptor at carcasses; kills leave carcasses; 6–10 random carcasses on the map. |
| 3 | **Melee + wild dinosaurs** | Needs both species and food (foraging AI). | The population stays at its target; herbivores graze, flee or charge; raptors hunt riders. |
| 4 | **Economy + base shop** | Needs kills of wild dinos and riders to earn money. | Bounties paid; purchases in base only; upgrades lost on death. |

**Phase 0 details:**
- Move the Phaser code to `src/client/` (only the import paths change).
- Add `src/server/main.ts`: a `node:http` server for `dist/` with SPA fallback, `/api/health`, and the `ws` upgrade on `/ws`.
- Add an esbuild bundle step, the `Dockerfile` and the compose file.
- Dev script: Vite and the server running together, with a Vite proxy for `/ws` and `/api`.
- The game itself is unchanged in this phase.

**Phase 1 order inside the phase:**
1. Make the sim multi-team (bases, players, respawn, safe zone), test-first.
2. Add the `src/net` protocol with encode/decode tests.
3. Server `Match` loop and lobby, plus the server integration test.
4. Client `NetClient`, interpolation mirror, and the views reading the mirror.
5. Join screen and team palettes.

**Making it efficient:**
- **Parallel art work:** in phase 2, the raptor art, food art (bushes, ferns, carcasses) and base-camp art are independent files. They can be written by parallel subagents while I do the sim logic, and come back together at registration in `textures/index.ts`.
- **Shared view code:** the views read only a state-shaped mirror, so phases 2–4 add data fields once in `src/sim`. The client automatically shows them after a matching addition to the snapshot codec. A single codec test checks that every sim field round-trips.
- **Waves code goes away:** v1's waves, game over and title intro are removed in phase 1 rather than ported.

## Tests
**Sim** (`tests/sim/`):
- the existing aiming and world tests, kept;
- multi-team rules: friendly fire off, base safe zone, respawn resets upgrades;
- `canEat` matrix, including a test-only small herbivore against a tree;
- feeding heal and depletion, carcasses being 4× slower, regrowth, no eating while moving or firing;
- a dead dino leaves a carcass; the world has 6–10 random carcasses;
- economy: costs, refusal outside the base or without enough money, the level cap, upgrade effects;
- ecology keeps the population at its target;
- the raptor is faster and has a smaller hitbox.

**Server integration** (`tests/server/`):
- start the server on port 0, connect two `ws` clients, join different teams;
- check that snapshots contain both players;
- check that shots from A damage B and that inputs are clamped;
- check that a leaving player is removed.

## Verification
1. `npm test` and `npm run build` must pass cleanly.
2. Headless Chrome via the `playwright-core` driver (scratchpad `drive.mjs`):
   - **two pages** join opposing teams; one shoots the other; check health, kill feed and respawn;
   - a third page joins an existing team;
   - feeding: a herbivore at a bush, a raptor at a carcass;
   - shop purchase in base;
   - screenshots of every new art piece; no console errors.
3. `docker compose up --build -d`, then:
   - `curl localhost:8080/api/health` and the page load;
   - the two-page browser test runs against port 8080.
