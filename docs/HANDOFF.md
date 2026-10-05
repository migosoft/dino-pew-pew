# Dinoriders: Handoff

**Status (2026-10-05, after the performance pass):** every requested feature is implemented. All 115 tests pass and the type-check is clean. Everything is committed on `master`. The performance commits are **not pushed yet**; phase 9 and earlier are on `origin` (github.com/migosoft/dino-pew-pew).
- The performance pass is described under [Performance pass](#performance-pass-2026-10-05). The deferred findings are in the [Performance backlog](#performance-backlog).
- The phase 9 art changes (including the T-Rex carcass, 9g) were checked in headless Chrome screenshots of `/?preview` and of the carcass art. The walk cadence has **not** been watched in a running game yet.
- The Docker image on :8080 has **not** been rebuilt since Phase 6. Run `docker compose up --build -d` when the user wants it.

See [Latest session](#latest-session-phase-9-tuning).

This document gives the state of the project, how it fits together, and what to watch out for. For how to play and run it, see [README.md](../README.md). The design history is in [docs/superpowers/specs/](superpowers/specs/).

## What the game is
A top-down pixel-art multiplayer shooter. Players ride armed dinosaurs in one persistent world that never ends.
- Opening the URL shows a join screen: join an existing team or found a new one (up to 4 teams), then pick a mount.
- Each team has a base camp. You respawn there, nobody can hurt you inside it, and its shop is there.
- Riderless **wild dinosaurs** (Triceratops, Velociraptor, Brontosaurus and T-Rex) roam the world. They are a threat, a source of money, and they leave carcasses that carnivores eat.
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
| "Phase 6" | 6: armored Velociraptor with twin side guns, right-click abilities (raptor leap, triceratops dash) |
| `a3fb0c0` | 7: 3072 px map, lakes and rivers, wading, Brontosaurus with weapons platform and tail whip, living water |
| `01beb93` | 7a: Brontosaurus 1.5× bigger (`BRONTO_SCALE`), obstacle gap 48 px |
| `a4cc299` | 7b: Brontosaurus neck and tail bend (chained links), stamped shadow that follows |
| `fef0130` | 7c: chained, trailing tails for Triceratops and Velociraptor too |
| `fde6dfe` | 8a: 4096 px map, larger wild population, raptor `wadeSpeed` 0.25 |
| `8f04025` | 8b: river currents in the sim (flow field, `currentSlow`, `currentDrift`) |
| `e4cbfa6` | 8c: river visuals (streaks downstream, drifting ripples, fish only in lakes) |
| `e2c128c` | 8d: T-Rex sim (head and shoulder guns, bite ability, wild carnivore) |
| `eb9d41e` | 8e: T-Rex art, bite animation and effect, carcass |
| `74b2636` | README and handoff for Phase 8 |
| `7030ea7` | 9a: Brontosaurus `broadsideGun` damage 6 → 8 |
| `d4e3dcd` | 9b: smaller water splash where bullets land |
| `8088c44` | 9c: heavier gait, stride length grows with body size |
| `c744432` | 9d: T-Rex 1.2× bigger (`REX_SCALE`) |
| `7e61066` | 9e: Brontosaurus carcass drawn at `BRONTO_SCALE` |
| `27c0772` | 9f: leaner Brontosaurus body, neck, head and tail |
| `bcb4d07` | handoff for Phase 9 |
| `6115184` | 9g: T-Rex carcass at living size (`REX_CARCASS_SCALE`) |
| `570c784` | handoff update, end of phase 9 |
| `72fad3b` | perf: carcasses rot away (`CARCASS_DECAY_SECS`) |
| `ca85b0b` | perf: protocol 3 (carcass deltas, players/teams only on change), WebSocket compression |
| `8834437` | perf: shared dino grid (`spatial.ts`), id index for `findDino`, no `Set` per obstacle query |
| `6ef8412` | perf: client culling, chain shadows redrawn only on change, snapshots decoded once |
| (latest) | handoff: performance pass and backlog |

## Performance pass (2026-10-05)
**What changed:**
1. **Carcasses rot away** in `CARCASS_DECAY_SECS` (120 s, `feeding.ts`), including the old carcasses placed at world creation. This is a small gameplay change: before, a carcass stayed until it was eaten, so over a 20-minute match about 700 piled up. Each snapshot carried every one of them, and the food scans got slower.
2. **Protocol 3** (`protocol.ts`, `match.ts`):
   - `welcome` carries all carcasses. Each snapshot then carries only new or changed ones (`carcasses`) and the ids of gone ones (`gone`). `Match.sentCarcasses` holds what was last sent; the client applies the changes in `FoodView.upsertCarcasses`/`removeCarcasses`.
   - `players` and `teams` are left out of a snapshot while unchanged. `Mirror` keeps the last ones received. `respawn` is sent in whole seconds, so the list changes once a second while someone waits. Any join forces a full resend.
   - `perMessageDeflate` is on in `http.ts` (threshold 1 KB, level 3).
3. **Shared dino grid** (`src/sim/spatial.ts`): `buildDinoGrid` (128 px cells) is rebuilt before each pass, and `dinosNear` returns candidate indices **in `state.dinos` order**, so ties and first-hit rules come out the same. Used by melee, dino contacts, projectile hits, `findPrey` and `wantsWhip`.
   - Queries widen their radius by `SLACK` (48 px) for dinos that moved since the build.
   - If the array, its length or the tick changed since the build, a query falls back to every dino.
   - `findDino` uses an id index (`world.ts`). After compacting `state.dinos` in place, call `forgetDinoIndex`.
   - `forEachObstacleNear` dedupes with visit stamps instead of a new `Set` per call.
4. **Client** (`DinoView.ts`, `Mirror.ts`, `Effects.ts`, `WorldView.ts`, `Hud.ts`):
   - Dinos more than `CULL_MARGIN` (200 px) outside the camera are hidden and skip their update.
   - The stamped chain shadow (a RenderTexture) is redrawn only when a stamp's frame or offset changes (`ChainParts.drawn`).
   - `Mirror.dinosAt` interpolates into **reused objects**, one per dino id. Read them during the frame; don't keep them, except per id as `DinoView.lastView` does.
   - Scorch marks are a ring of 64 reused images.
   - Canopy alpha snaps to its target, and the HUD overlay skips off-screen dinos.

**Measured:**
- **Sim** (16 bot riders plus wildlife, 6 simulated minutes): a tick went from about 3.7–4.2 ms to about 2.1 ms. The end state was identical before and after the grid change. A typical snapshot is about 8 KB (2.5 KB compressed); before, it was 18 KB and growing.
- **Client** (headless Edge with software rendering, one rider, seed 7): CPU per frame went from about 36 ms (25 fps) to about 9.5 ms (60 fps). The frame time was measured between Phaser's `prestep` and `postrender` game events. On a real GPU the gain will be different.

## Latest session: phase 9 (tuning)
**What was done** (small tuning requests, one commit each):
1. **Brontosaurus broadside guns:** `broadsideGun` damage 6 → 8 (`weapons.ts`). One side now does about 46 DPS, close to the Triceratops (about 47); a side arc plus the rear gun, where they overlap, about 66. The T-Rex is about 72 with all four guns on target.
2. **Bullet splash in water:** spent bolts call `splash(x, y, 3, 2)` in `GameScene` (it was size 6 with 6 droplets). `WaterView.splash` takes an optional droplet count; the other splashes (dash, leap, whip, bite) are unchanged.
3. **Heavier gait** (`DinoView.ts`): the leg pose changes every `strideLen(radius)` px, which is `STRIDE_PER_POSE · (radius / STRIDE_RADIUS)^0.75`. That gives Velociraptor 7 (unchanged), Triceratops about 10, T-Rex about 14 and Brontosaurus about 16. The walking tail sway uses the same stride, so it stays in step. Footstep rings in water (`WaterView.trackDinos`) still use their own step length, `radius · 0.9`.
4. **T-Rex 1.2× bigger:** `REX_SCALE` in `trexArt.ts` works like `BRONTO_SCALE`: canvas sizes `2 · r(28)` and `2 · r(22)` (kept even so the pivot stays on the pixel grid), every coordinate scaled, 1 px details kept at 1 px, gun sprites unscaled. In `dinos.ts`: radius 15 → 18, head (17, 0), tail (−13, 0), seat (11, 0), head guns (5, ±10), shoulder guns (5, ±16). **Keep the two in step** when resizing.
5. **Brontosaurus carcass at living size:** `drawBrontosaurusCarcass` (`foodArt.ts`) is laid out in design pixels and drawn at `BRONTO_SCALE` through `X`/`Y`/`thick` helpers. It is about 140 px long, against about 146 px for the living animal (it was 92 px).
6. **Leaner Brontosaurus** (`brontosaurusArt.ts`): torso half-width 12.5 → 10.2 design px (same length), shoulders 5.6 × 5.8, legs at ±9/±9.5 with slightly smaller feet, neck root 4.0 (tip 2.2), tail root 5.0, a narrower head. The platform and gun mounts did not move, so the pods hang a little further past the flanks. The hitbox radius stays 22.
7. **T-Rex carcass at living size:** `drawTrexCarcass` uses the same `X`/`Y`/`thick` helpers at `REX_CARCASS_SCALE` (`REX_SCALE · 1.45`, because its layout was shorter than the living art). It is about 92 px long, against about 89 px for the living T-Rex (it was 52 px). The Triceratops (about 50 vs 45 px) and Velociraptor (about 29 vs 35 px) carcasses were measured and are close enough, so they were left alone.

**Still open:**
- **Balance after 9a:** with 220 HP and wide side arcs, the Brontosaurus may now be the strongest mount. Watch it in play.

**How the art was checked:** a throwaway page in the project root (`_artcheck.html`, deleted afterwards) imported the draw functions from `/src/...` through the Vite dev server. It and `/?preview=<kind>&zoom=2&focus=row,col` were captured with `chrome.exe --headless=new --virtual-time-budget=6000 --screenshot=...`. For before/after shots, `git stash` the change, shoot, then `git stash pop`.

## Phase 8
**What was done** (the user supplied a Dino Riders T-Rex image, the cover of a French *Pif* magazine):
1. **Map 4096 px** (`DEFAULT_TILES = 256`). It is still one ground texture: 4096 is the safe single-texture limit, so going bigger needs the ground split into chunk textures (`WorldView`/`drawGround`).
   - `generateWorld` takes about 120–170 ms in Node (it was about 100 ms at 3072 px).
   - `wildTarget` is now `min(110, 28 + 5·players)`.
2. **Velociraptor `wadeSpeed` 0.25** (it was 0.4).
3. **River currents** (sim):
   - `waterLayer` (`worldgen.ts`) also returns a flow field, `World.flow`: a `Float32Array` holding (vx, vy) per tile in px/s, `null` with `water: false`.
     - **Direction:** the river noise gradient turned 90°. A river is the 0.5 contour of that noise, so each river flows one way along its whole length.
     - **Speed:** `RIVER_SPEED` (36 px/s) in the middle of the channel. It fades toward the banks and drops to 60% over fords.
     - **No current** in lakes (where a river meets a lake, the lake wins) or within `BASE_DRY` of a camp. Rivers cover about 12% of the map.
   - **Lookups** in `world.ts`: `flowAt` and `isRiver` use `tileIndexAt` (the same wobbled borders as `tileAt`).
   - **Per-species fields on `DinoDef`:**
     - `currentSlow`: the top-speed factor in a river (default 0.75). Triceratops and Brontosaurus 1, T-Rex 0.8, raptor 0.6.
     - `currentDrift`: the share of the flow added to the position each tick (default 0). Raptor 0.8.
   - **Movement:** `terrainSpeedFactor` multiplies the wade factor by the current factor, so the dash and the bite lunge slow down in rivers too. `applyCurrent` (`movement.ts`) runs every tick in `sim.ts` and is skipped mid-leap.
   - **AI and spawning:** calm wild dinos with `currentDrift` (raptors) steer around rivers (`clearHeading`). Wild dinos never spawn in rivers. In a 2-minute headless run, wild raptors spent 0.1% of their time in rivers.
4. **River visuals** (`WaterView.ts`):
   - Wave points in a river become **streaks** (`current_<v>_<deep|shallow>`, `drawCurrentStreak` in `waterArt.ts`). Each one runs `STREAK_RUN` px downstream at 1.3× the current, fades in and out, then starts over. A streak that would run onto the bank isn't drawn.
   - Ripples drift with the current.
   - Fish live only in still deep water (lakes).
5. **T-Rex** (`trex` in `dinos.ts`):
   - **Stats:** carnivore, radius 15 (18 since phase 9d, with all T-Rex sizes scaled by `REX_SCALE`), 170 HP, speed 66, bounty 35, `wadeSpeed` 0.75.
   - **Size:** its art is about 55% as long (about 60% since phase 9d) as the Brontosaurus's (real animals: 12 m vs 22 m).
   - **Guns:**
     - `headGunL`/`headGunR`: parent `head`, at (4, ±8), the two ends of the barrel across the head harness. Weapon `rexHeadGun`: 4 damage every 0.22 s.
     - `shoulderGunL`/`shoulderGunR`: parent `body`, at (4, ±13). Weapon `rexShoulderCannon`: 8 damage every 0.45 s.
     - Default fire mode: each gun fires when it is on target.
   - **Bite** (`kind: 'bite'` in `abilities.ts`):
     - For the first half of its 0.35 s it lunges forward at 140 px/s (scaled by the terrain) and controls the movement.
     - At the half-way point the jaws close on the **one** nearest hostile in front (±35°, within `head.offset.x` + its radius + `hitReach` 14): 55 damage and a 10 px shove. Dinos in their own camp and airborne dinos are exempt.
     - It emits a `bite` event `{ dinoId, targetId | null, x, y }`. Events go to the client as JSON, so the protocol needed no change.
     - Wild T-Rexes bite targets they hunt (`wantsAbility`, `BITE_ABILITY_ARC`).
   - **Wild:** 1 in 4 wild carnivores (`CARNIVORES` in `ecology.ts`), and about 12% of the initial carcasses.
   - **Art** (`textures/trexArt.ts`), following the box art:
     - mottled hide, red eyes;
     - head harness with the barrel across the head and a red power cell;
     - vented grey shoulder frames carrying red cannon pods;
     - a chest platform with a ladder, shin plates, and the saddle on the neck (`seat` (9, 0)).
     - The tail is `REX_TAIL` (6 links) in `CHAINS`, so it bends and trails, and the shadow is stamped from masks.
   - **Bite animation:** the head pushes forward up to `BITE_REACH` (5 px) and shows the open-jaw frame `trex_headBite_<palette>` (`DinoView`). `Effects.bite` shows sparks and blood that fade out, or dust on a miss. The camera shakes when you are the one bitten.
   - **Elsewhere:** the HUD shows `BITE READY`/`BITE IN 12`; the join screen lists it as `T-REX`; `drawTrexCarcass` is in `foodArt.ts`.
6. **Tests:**
   - `tests/sim/river.test.ts` covers the flow field (deterministic, only in rivers, one way along a river), drift and slowdown per species, and no drift mid-leap.
   - `tests/sim/trex.test.ts` covers the guns, the bite (single target, front only, cooldown, camp immunity), water and river speed, and wild spawning.
   - The vitest `testTimeout` is now 20 s (`vite.config.ts`), because several tests generate the full 4096 px map more than once. The suite runs in 3 s on an idle machine and 13 s or more under load.
7. **Verification:**
   - Art at `/?preview=trex`, compared at the same zoom with `/?preview=brontosaurus`.
   - In the game over CDP (driver in the session scratchpad, not committed), seed 777:
     - A raptor idling in a 25–30 px/s current drifted at 21–24 px/s, and at full throttle in a deep river made 17.7 px/s (118 × 0.25 × 0.6).
     - A T-Rex in a deep river made about 41 px/s, against an expected 39.6.
     - All four guns fired; the bite splashed and the HUD went to `BITE IN 15`.
   - **Frame rate:** headless Edge showed 38–45 fps here, about the same as the previous commit measured the same way (36–54). The machine was under load, so this is not a 60 fps figure. The water rendering takes under 1 ms per frame.

**Balance knobs (phase 8):**
- `RIVER_SPEED` and the river widths (`RIVER_DEEP`, `RIVER_WIDE`) in `worldgen.ts`.
- `currentSlow`, `currentDrift` and `wadeSpeed` per species.
- The T-Rex `ability`, plus the `rexHeadGun` and `rexShoulderCannon` weapons.
- `CARNIVORES` (T-Rex share) and `wildTarget` in `ecology.ts`.

## Phase 7 and follow-ups
**What was done** (the user supplied a Dino Riders box image of an armored Brontosaurus). Phase 7 is described first, then the follow-ups (7a–7c) in item 8.
1. **Bigger map with water.**
   - The default map is now 192×192 tiles = **3072 px** (`DEFAULT_TILES` in `worldgen.ts`). Base camps sit at about 1/8 of the map from the edge (`baseInset`, at least 260 px, so small test maps are unchanged).
   - New tiles `Tile.Shallow` and `Tile.Deep`, made by `waterLayer`:
     - **Lakes** are cut from a slow noise at percentiles (`LAKE_DEEP_SHARE`, `LAKE_SHALLOW_SHARE`), so every seed gets about the same amount of lake.
     - **Rivers** follow a contour line of a warped noise. **Fords** break up their deep core.
     - About 25% of each map is water. Everything within `BASE_DRY` of a camp is dry.
   - **`tileAt(world, x, y)`** (`world.ts`) is the one terrain lookup, with the organic border wobble. The ground texture (`drawGround`) uses it too, so the shoreline you see is the one the sim uses. Use `isWater` / `isDeepWater` rather than indexing `world.tiles` directly.
   - **Obstacles are spread out:** the scatter cell is 56, and any two obstacles are at least `OBSTACLE_GAP` (48 px) apart, wide enough for the Brontosaurus. Nothing (rocks, trees, plants, carcasses) is placed in water.
   - `WorldGenOptions.water: false` turns water off. The ability and Brontosaurus tests use it for dry arenas.
2. **Wading.**
   - `moveDino` takes a `speedCap`. `sim.ts` passes `terrainSpeedFactor`: `wadeSpeed` in deep water (default 0.6), 1 elsewhere.
   - Per species: raptor 0.4, triceratops 0.7, brontosaurus 0.9. Shallow water has no effect, and the speed above the cap bleeds off at `decel`.
   - A dash is scaled the same way. A leap is airborne and ignores water.
   - Calm wild dinos (wander, graze) steer around deep water (`clearHeading` in `ai.ts`). In a 2-minute headless run they spent 0.1% of their time in deep water, which covers 10% of the map.
3. **Brontosaurus** (`dinos.ts`): 220 HP, speed 50, radius 22, bounty 40, a wild herbivore 1 time in 4. Its art is drawn at `BRONTO_SCALE` (1.5) in `brontosaurusArt.ts`, and the sizes in `dinos.ts` (radius, head, tail, seat, mounts, whip reach) use the same factor, so change them together.
   - The neck, head and tail are drawn as chains of links that bend (see item 8). `HeadDef.under` keeps the neck below the body.
   - **`seat`** puts the rider sprite in the cockpit dome.
   - **Weapons platform:** four `broadsideGun` mounts (±90°, two per flank) and a rear `tailGun` (180°).
     - **`fireMode: 'side'`**: `selectSideMounts` (`aiming.ts`) fires every mount whose arc holds the cursor. Cursor on the left: the left pair fires; behind: the tail gun; straight ahead: nothing.
     - `ArcIndicator` dims the wedges that are not live.
   - **Tail whip** (`kind: 'whip'`): the dino keeps walking while it runs. At half-way it hits each hostile within ±80° of the tail direction once: 22 damage and a 20 px shove, camp immunity as for the dash. It emits a `whip` event.
     - Wild Brontosaurs whip at hostiles right behind them (`wantsWhip` in `ai.ts`, checked on top of whatever `decide` returned).
4. **Living water** (`src/client/render/WaterView.ts`), all client-side:
   - Wave crests are pre-scattered over the water in 96 px cells, and only the visible cells are drawn from a sprite pool.
   - Fish shadows live in deep water near the camera. Their number scales with how much deep water is in view. They turn back at the edge of deep water and dart away from dinos and fresh ripples.
   - Ripples: one per footstep (alternating feet, sized by radius), a V wake behind dinos moving through deep water, slow rings around dinos standing in it.
   - Splashes for leap landings, dashes and whips in water, and for bolts that run out of range over water (`Mirror.takeSpent`).
   - `DinoView.update(d, wading)` hides the shadow in deep water (fainter in the shallows) and shows a foam ring.
5. **Sprite sheets** (`rotationStrip`) now wrap into rows at 4096 px, because the Brontosaurus frames would make a single strip too wide for some GPUs.
6. **Tests:** `tests/sim/water.test.ts` covers wade speeds, the gradual slowdown, water coverage, dry camps and nothing in water. `tests/sim/brontosaurus.test.ts` covers side fire, the whip and wild whips. `world.test.ts` covers the map size and obstacle gap.
7. **Verification:**
   - The art was reviewed with `/?preview=brontosaurus`. `PreviewScene` cells now scale with the species' radius.
   - The game was driven over CDP: a Brontosaurus wading into a lake, firing its left pods and whipping; a raptor in the shallows. Frame rate stayed at 60 fps.
   - `drawGround` for 3072 px takes about 1.3 s in headless Edge.
8. **Follow-ups (7a–7c), client-side art and animation only:**
   - **7a: bigger Brontosaurus.** Its art is laid out in design pixels and drawn at `BRONTO_SCALE` (1.5) in `brontosaurusArt.ts`, so it is redrawn rather than upscaled. The sizes in `dinos.ts` use the same factor: radius 22, `head.offset` 18, `tail.offset` −19, seat, mounts (±20 px on the flanks, rear gun at −22), whip `hitReach` 32. Change them together. `OBSTACLE_GAP` grew to 48 px (more than its 44 px diameter).
   - **7b–7c: bending necks and tails** (`src/client/render/chains.ts`, drawn by `DinoView.updateChain`):
     - `CHAINS` lists the species with chained parts. The Brontosaurus has a neck of 5 links plus the head, and a tail of 7. The Triceratops tail has 3 links and the Velociraptor tail 4; their heads are placed as before. Body sprites of chained species no longer include a tail.
     - **Neck:** it starts at `head.offset`. The head yaw is spread over the links, so the neck curves toward where the head looks.
     - **Tail:** it starts at `TailDef.offset` (now set for all three species).
       - **Follow-through:** each link eases toward the direction of the link before it (`TRAIL_RATE` = 20/s), so a turning dino's tail swings round behind it, tip last. The state is per `DinoView` (`trail`), timed with `performance.now()`.
       - On top of that, a walking sway travels down the tail as a wave (`TAIL_SWAY`, `SWAY_WAVE`), and the whip swings it with a lag toward the tip (`WHIP_SWING`, `WHIP_LAG`).
       - Mid-leap the tail rises and spreads with the body.
     - **Links** are capsule sprites centered on their joint (`drawChainSegment` in `textures/chainArt.ts`, markings per species via `ChainStyle`: neck bands, spine spots, raptor stripes and feather crest). `taperedChain` builds a tapering list of links. A link's back cap has no outline and each link draws over the one before it, so the joints don't show.
     - **Shadow:** chained species have no `<kind>_shadow_<pose>` texture. Opaque masks (`<kind>_bodyMask_<pose>`, `<kind>_head_mask`, `<kind>_neck<i>_mask`, `<kind>_tail<i>_mask`) are stamped into one `RenderTexture` per dino each frame and shown at shadow strength. It follows every bend, doesn't darken where pieces overlap, shrinks mid-leap and hides in deep water.
     - `/?preview=brontosaurus&yaw=0.7&whip=0.3` turns every head and freezes a whip. The follow-through only shows in motion.
     - **The sim is unchanged:** `head.offset` is still the neck pivot, aiming uses the body mounts, and collision is one circle.
   - **Mouth position:** `geometry(d).mouth` puts the eating effect at the end of a chained neck. Feeding in the sim still measures from the body, so a Brontosaurus's leaves can pop up a bit away from the bush.

**Balance knobs:**
- `wadeSpeed` per species.
- `LAKE_*_SHARE` and the river widths in `waterLayer`.
- `OBSTACLE_GAP`.
- The Brontosaurus `ability` and `broadsideGun`/`tailGun` values.
- `wildTarget` in `ecology.ts` (now `min(70, 18 + 4·players)`).

## Phase 6
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

## Phase 5
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
- Every 3rd tick it broadcasts a snapshot, 20 per second. A snapshot holds:
  - dino tuples (every live dino);
  - players and teams, left out while unchanged;
  - events stamped with their tick;
  - carcasses that appeared or changed, plus `gone` ids;
  - the plant food levels that changed since the last snapshot.
- The `welcome` message carries all carcasses and every plant that isn't full.

**Client:**
- It never runs the sim. It regenerates the terrain from the world seed it gets in `welcome`.
- It renders about 100 ms in the past (`Mirror`, `INTERP_TICKS = 6`), interpolating between snapshots.
- Projectiles are simulated on the client from their `shot` events, since they fly straight, and removed on `hit`/`impact` events.

**AI and players share one interface:** riders send an `InputCommand` (throttle, turn, aim point, fire). Wild dinos produce the same command from `computeWildCommand` in `src/sim/ai.ts`. Movement, eating and melee are shared systems.

**Prepared for client-side prediction, not built:** inputs carry a `seq`, and each snapshot carries `ack`, the last `seq` the server applied for that player.

## Where things live
| You want to… | Look at |
|---|---|
| Add or tune a species | `src/sim/defs/dinos.ts`, `src/sim/defs/weapons.ts`. Sprites go in `src/client/render/textures/` and are registered in `textures/index.ts` under the keys `<kind>_body_<palette>_<pose>`, `<kind>_shadow_<pose>`, `<kind>_head_<palette>`, where palette is `t0`..`t3` or `wild`. A species in `CHAINS` uses masks instead of `_shadow_` (see the next row). The `bodyAndHead` helper in `textures/index.ts` registers body, head and masks together. Also add the species to the `HERBIVORES`/`CARNIVORES` lists in `ecology.ts` and to `CARCASS_KINDS`/`drawCarcass` in `foodArt.ts` (`FoodView` falls back to Triceratops art). |
| Give a species a bending tail or neck | Set `tail` (and `head`) offsets in `dinos.ts`. Define its links with `taperedChain` next to its art, add it to `CHAINS` in `src/client/render/chains.ts` (link textures and masks then register automatically), and leave the tail out of the body sprite. Tune the motion with `TRAIL_RATE`, `TAIL_SWAY`, `SWAY_WAVE`, `WHIP_*` in `DinoView.ts`. |
| Give a species rider armor | Register `<kind>_armor_<palette>` (body overlay) and/or `<kind>_headArmor_<palette>` (head overlay) for `t0`..`t3` in `textures/index.ts`. `DinoView` shows them on ridden dinos whenever the textures exist. The Triceratops versions are in `dinoArt.ts`. Open `/?preview` (or `/?preview=velociraptor&zoom=3&focus=row,col`) to see every palette and heading. |
| Give a species an ability | `ability` on the `DinoDef` (`kind: 'leap' \| 'dash' \| 'whip' \| 'bite'`). The logic is in `src/sim/systems/abilities.ts`, wild use in `wantsAbility`/`wantsWhip` (`ai.ts`), and the leap and whip rendering in `DinoView`. A new kind needs a branch in `updateAbility`. |
| Fire all guns at once | `volley: true` on the `DinoDef` (used by both species' twin side guns). `fireMode: 'side'` (Brontosaurus) fires every mount whose arc holds the cursor (`selectSideMounts`). Without either, only the mounts that are on target fire (`selectFiringMounts`). |
| Tune river currents | `RIVER_SPEED`, `RIVER_DEEP`, `RIVER_WIDE` and the flow computation in `waterLayer` (`worldgen.ts`). The lookups are `flowAt` and `isRiver` (`world.ts`). Per species: `currentSlow` and `currentDrift`, applied in `terrainSpeedFactor` and `applyCurrent` (`movement.ts`). Streak visuals: `drawStreak` in `WaterView.ts`. |
| Tune water and terrain | `waterLayer`, `OBSTACLE_GAP` and `DEFAULT_TILES` in `src/sim/worldgen.ts`, and `wadeSpeed` per species. The terrain lookup is `tileAt` in `world.ts`. Water visuals: `WaterView.ts`, `waterArt.ts`, and the water colors in `drawGround` (`worldArt.ts`). |
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
npm test             # 115 tests, about 3 s (longer under load)
npm run build        # tsc + vite (dist/) + esbuild server bundle (dist-server/server.cjs)
docker compose up --build -d   # production, http://localhost:8080
```
**Environment variables:** `PORT` (default 8080), `STATIC_DIR` (default `./dist`), `SEED` (fixed world seed; random otherwise).

**Browser testing:**
- Adding `?debug` to the URL exposes `window.dinoriders = { scene, net }`.
- No browser driver is in the repo, and playwright is not installed. What worked in the latest session:
  - **Static screenshots:** `msedge --headless=new --disable-gpu --window-size=1728,1080 --virtual-time-budget=8000 --user-data-dir=<tmp> --screenshot=<out.png> "http://localhost:5173/?preview"`. Edge is at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.
  - **Edge sometimes writes no screenshot** when its stderr goes to `/dev/null`, or when the `--user-data-dir` is new or still in use. Pipe stderr instead (`2>&1 | tail -1`), use a fresh directory per run, and check that the file exists.
  - **The screenshot file can appear a few seconds after the command returns.** Poll for it before deciding the run failed.
  - **Headless Edge leaves processes behind.** `kill()` on the CDP-driven Edge only stops the parent. After many runs, dozens of leftover processes slowed the machine and dropped the in-game fps from about 45 to 13. Stop them by their `--user-data-dir` (`Get-CimInstance Win32_Process` filtered on the command line) after each run.
  - **Driving the game:** a small Node script (not committed; it lived in the session scratchpad):
    1. Start Edge with `--remote-debugging-port` and connect over CDP using the repo's `ws` package (`createRequire` on the repo's `package.json`).
    2. Open `/?debug`, wait about 2.5 s, press `1` (found a team), then the mount key (`1` Triceratops, `2` Velociraptor, `3` Brontosaurus).
    3. Replace `window.dinoriders.scene.playerInput.command` with an autopilot. Phase 7's autopilot looked for the nearest `Tile.Deep` in `scene.world.tiles`, drove there, then circled at throttle 0.6, firing to the left and using the ability.
    4. Read your own dino from `[...scene.dinoViews.values()].map(v => v.lastView)` (speed, position), then call `Page.captureScreenshot`. The fps is in `scene.game.loop.actualFps`.
    5. Headless fps is capped at 60, so measure CPU per frame instead. Note `performance.now()` on `scene.game.events` `'prestep'` and again on `'postrender'`. Replacing `game.step` doesn't work, because the loop holds a bound copy.
  - Right after Vite starts, the first page load is slow, so `window.dinoriders` may not exist yet. Retry, or wait longer before pressing keys.
  - OS mouse cursors never appear in screenshots. Check `document.querySelector('canvas').style.cursor` instead.
  - Committing such a driver as `scripts/e2e/` would be a good next step.

## Gotchas
- **Windows path case and vitest:** running vitest from `c:\…` (lowercase drive letter) fails with "Cannot read properties of undefined (reading 'config')". Run it from `C:\…`.
- **Docker port mapping on Windows:** right after a local dev server on :8080 is killed, Docker can start the container without publishing the port, and `docker compose ps` shows `8080/tcp` with no `0.0.0.0:`. Fix: `docker compose down`, wait a few seconds, then `up -d`.
- **The user's Docker container usually holds :8080**, so `npm run dev` then fails with EADDRINUSE on the server side, and Vite silently proxies to the old container. For a dev check, leave the container alone and run `PORT=8091 npx tsx src/server/main.ts` together with `GAME_SERVER=http://localhost:8091 npx vite --port 5174`.
- **No Python** on this machine. Use Node one-liners or the edit tools for scripted file edits.
- **`tsx` without watch** (as started manually in a terminal) does not reload server code. `npm run dev` uses `tsx watch`. After a change to world generation, restart the server: the client regenerates the world from the seed with the *new* code, and a stale server would simulate a different map.
- **Scripted edits from the agent's Bash tool:** heredocs and `node -e '…'` with nested quotes, backticks or `\|` broke several times, either failing with "unexpected EOF" or mangling the text. Write the edit script to a file with the Write tool and run `node file.cjs`, or use the Edit tool.
- **World generation is client-side too:** `generateWorld` runs on both server and client, so it must stay deterministic and fast (about 30 ms; `drawGround` about 1.3 s at 3072 px).
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
8. **Brontosaurus feeding reach:** the sim measures food distance from the body center, but the head is about 65 px ahead. A reach based on the neck would make eating look right (`canEat`/`feed` in `feeding.ts`, `geometry.ts`).
9. **Bigger maps need chunked ground textures.** 4096 px is one canvas, the safe single-texture limit.
10. **Collision is one circle per dino.** The Brontosaurus's long neck and tail pass through rocks and other dinos, and its tail whip uses a reach around the body center.
11. **Docker image is stale.** Rebuild with `docker compose up --build -d` (watch out for the Windows port-mapping gotcha above).
12. **Untested by unit tests:** client rendering (water, chains, shadows) is only checked by screenshots.

## Performance backlog
These were found in the performance review of 2026-10-05 but not done. They are roughly in order of payoff within each group, and line numbers are from that date.

**Simulation** (after the grid, the food scans are the biggest cost in a profile):
- **Food grid** for `nearestFood` (`ai.ts`) and `findFood` (`feeding.ts`). Both scan all ~1000 food entries for each dino that is grazing, foraging or hurt. Plants never move, so the grid only needs carcasses added and removed.
- `clearHeading` (`ai.ts`): hoist the `[16, 32]` and `[24, 48]` arrays, cache the chosen heading for a few ticks, and use a per-tile "wet" bitmap instead of noise lookups per probe.
- Look up `tileIndexAt` once per dino per tick: `terrainSpeedFactor` and `applyCurrent` (`movement.ts`) call it 2–3 times. Have `flowAt` return through out-parameters instead of a new object.
- Ability hit scans (`abilities.ts`: ram, whip, bite, land): use `dinosNear`, test distance first, and make `abilityHit` a Set.
- Smaller per-tick allocations: `updateAim` builds an `errors` array; volley species `map` their mounts every tick (`sim.ts`); `updatePlayers` runs `players.some` per team.
- `isInOwnBase` and `findTeam` run a linear team lookup before the distance test in several places.

**Network:**
- Area-of-interest culling: send each client only the dinos near its camera. Today every client gets every dino.
- Send `kind` and `team` as small integers (a table in `welcome`), and send `maxHp` only when a dino first appears.
- Quantize events: shot events carry full-precision floats and a `team` that could be derived from `dinoId`.
- Clients send input at 60 Hz even when it hasn't changed. Send it on change, plus a ~10 Hz keepalive.

**Client, per frame:**
- Depth sorting: Phaser re-sorts the whole display list (about 4700 objects) whenever any depth changes. Put static and flat objects (ground, water, shadows, decals, HUD) in their own Layers, and call `setDepth` only when the value changes.
- `WaterView`:
  - Precompute each wave point's texture key, speed and rotation, and the length of each river streak, instead of calling `isWet` per streak per frame.
  - Pool fish images.
  - Pre-filter dinos and ripples before the fish loop (it is O(fish × dinos)).
- `wadingOf` runs twice per dino per frame (`GameScene.syncDinoViews` and `WaterView`). Compute it once and pass it along.
- `ArcIndicator` and the base rings in `WorldView` are Graphics redrawn every frame. Turn the static rings and dotted rims into textures.
- Pool projectile sprites, muzzle flashes, feed bits and float texts. Skip effects outside the camera.
- `Mirror.takeEvents` and `projectilesAt` allocate every frame. Return early when nothing is due, and reuse the output objects.
- Pool `DinoView`s by kind and palette instead of creating and destroying them as wild dinos come and go.

**Client, at join and boot:**
- `drawGround` (`worldArt.ts`) builds the 4096×4096 ground texture synchronously on every join, and `WorldView.destroy` removes it even for the same seed.
  - Keep it across rejoins.
  - Hoist the per-pixel closures.
  - Build it in a worker or in chunks.
- The `WaterView` constructor scans the whole map on a 11 px grid. Skip tiles with no water.
- `generateTextures`: build mask strips from the already rotated strips instead of rotating the masks again, and skip `rider_wild`, which is never used.

**Scaling past one match:** run one match per `worker_thread` or process, and build and compress snapshots off the tick thread. A rewrite in another language (Go was asked about) would not help one match much: a tick is about 2 ms of its 16.7 ms budget. It would also mean keeping a second copy of `src/sim`, which the client also uses for world generation and terrain lookups.
