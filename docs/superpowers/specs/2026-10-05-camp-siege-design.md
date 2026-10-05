# Dinoriders: Camp Siege, Map Setup and an 8192 px World (design)

**Date:** 2026-10-05
**Status:** sections 1 and 2 were approved in chat. Sections 3 to 5 were written afterwards from the decisions made in chat and should be reviewed with the plan.
**Implementation plan:** [docs/superpowers/plans/2026-10-05-camp-siege.md](../plans/2026-10-05-camp-siege.md)

## Goal
Today the game is one world that never ends, and a base camp is just a safe zone. After this change it is played in **rounds**:
- Each team has a destructible **camp building**, defended by **5 towers** that can be destroyed separately.
- A team whose camp falls is eliminated, and the **last camp standing wins** the round.
- Players are no longer invincible inside their camp.
- The world is **8192 px** square, twice the side length of today's 4096 px.
- The first player on an empty server picks **2, 3 or 4 teams** and a **map**: RANDOM, or one of the fixed maps made for that team count. The first fixed map is **CROSSING**, for 2 teams.

## What the user decided
| Topic | Decision |
|---|---|
| Round end | The last camp standing wins. An eliminated team's riders can join a surviving team or spectate. The winner is shown for 15 s, then a new round starts. |
| Setup | The first player on an empty server picks the team count (2/3/4), then a map. RANDOM is always offered. Fixed maps exist per team count and fix the camp positions. |
| Next round | The same settings repeat until the server is empty. The next player to arrive then sets up from scratch. |
| Round start | Camps can't be damaged until **every** team has at least one rider. Then a 5 s countdown starts the round. |
| Empty team | During a round, a team with no players has its camp collapse after `TEAM_EMPTY_TIMEOUT` (30 s), which eliminates it. |
| Map size | Double the side: 8192 × 8192 px (512 × 512 tiles of 16 px). |
| Fixed map | Hand-designed layout. The first one, CROSSING (2 teams), is described below. |
| Camp ↔ towers | 5 towers. The camp's **force field is up while at least 3 towers stand**. It covers the **building only**. |
| Tower rebuild | A destroyed tower rebuilds after 90 s, unless its team is eliminated. |
| Tower targets | The nearest hostile rider, or an *aggressive* wild dino: a carnivore, or a herbivore that is charging. |
| Camp perks | Respawn point, shop, healing aura, and wild dinos avoid the camp. |

## 1. Setup, rounds and maps
- **Settings** `{ teams: 2 | 3 | 4, map: string }`. `map` is `'random'` or a fixed map id.
  - With settings unset (an empty server), the join screen shows **TEAMS: 2 / 3 / 4**, then **MAP: RANDOM** plus the fixed maps for that count.
  - The choice travels with the first `join` message. The first valid setup wins. If someone else's setup arrived first, a later client simply joins the round that exists (it gets an error if its chosen team slot doesn't exist there, and returns to the join screen).
  - The env vars `TEAMS=2..4` and `MAP=random|<id>` preset the settings and lock them: they are never reset.
  - When the last player leaves an unlocked server, the settings are cleared and the world is dropped.
- **Map registry** `src/sim/maps/`: `MAPS` (fixed recipes), `mapsFor(teams)`, `getMap(id)`, and `worldOptionsFor(map, teams, tiles)`. The server and the client both call `worldOptionsFor`, so the world each of them generates is identical.
- **Random map** with N teams: 2 camps in opposite corners, 3 in a triangle around the centre, 4 in the corners. The inset from the edge is 1/8 of the map (at least 260 px).
- **Phases** (`GameState.round.phase`):
  - `waiting`: all N camps stand but can't be damaged.
  - `countdown`: 5 s, starting once every team has a rider. If a team empties, it goes back to `waiting`.
  - `playing`: the round is on.
  - `over`: 15 s with a victory banner; structures can't be damaged.
- **Elimination:**
  - **Causes:** the camp's HP reaches 0, or the team is empty for 30 s during `playing`.
  - **Effects:** the team's riders die, its towers fall for good, and its riders can't respawn. The eliminated players get a panel: join a surviving team (pick a mount) or spectate with a free camera.
  - **Win:** when at most one team is left, the phase becomes `over` with that team as the winner (or no winner if none is left).
- **Next round:** the `Match` builds a fresh `GameState` with the same settings (RANDOM gets a new seed) and re-adds every connected player to the **same team slot** with the same mount and name. Money, upgrades and K/D reset. Each client gets a new `welcome` and rebuilds its scene.

## 2. Camp, towers and combat
All numbers live in `src/sim/camp.ts` (`CAMP`, `TOWER_GUN`):

| Knob | Value |
|---|---|
| Camp radius (safe area for the shop, respawn and healing) | 220 px (`BASE_RADIUS`) |
| Camp building radius / HP | 40 px / 3000 |
| Towers per camp / ring radius / tower radius / HP | 5 / 170 px / 14 px / 400 |
| Force field up while towers standing ≥ | 3 |
| Tower rebuild | 90 s |
| Tower gun | 4 damage every 0.4 s (10 DPS), 380 px/s, range 280, turret turns at 3 rad/s |
| Healing aura | +8 HP/s once you haven't been hit for 3 s, inside your own standing camp |
| Bounties | tower 60, camp (final blow) 300 |
| Countdown / intermission | 5 s / 15 s |

- **Structures** (`GameState.structures`) are solid circles: dinos are pushed out of them like rocks, and dinos can't spawn on them. A destroyed structure is not solid (rubble or ruins).
- **Damage:** hostile riders' bullets, melee, and the dash, whip, bite and leap landing. Wild dinos never damage structures. Same-team bullets fly through their own structures.
- **Force field:** while it is up, a hostile hit on the **camp building** is blocked (a `structureHit` event with `shielded: true`). Towers are never shielded.
- **No more safe zone:**
  - `applyDamage` no longer exempts dinos in their own base.
  - Projectiles no longer fizzle at camp edges.
  - The dash, whip and bite no longer skip dinos in their camp.
  - Wild carnivores still don't hunt riders inside their own camp, and wild dinos still steer around camps.
- **Kept perks:** you respawn in your camp (anywhere 60–140 px from the centre, clear of structures), the shop works only in your camp, and the healing aura.
- **Events:** `structureHit { structureId, x, y, shielded }`, `towerDown`, `towerUp`, `campDown`, `eliminated`, `roundWon`, `phase`. Towers fire normal projectiles with `shot` events, where `dinoId` = the structure id and `mount` = -1.

## 3. Art (client, procedural pixel art like the rest)
- **Camp building** (`drawCamp(pal, stage)`, about 96 × 88 px, top-down with a slight 3/4 tilt like the rocks and trees):
  - a round timber-and-stone stronghold with a hide roof in team colours and a palisade ring;
  - a team banner on a pole;
  - a glowing power crystal on the roof, the field generator (Dino Riders tech on a primitive camp).
- **Camp damage stages,** by HP fraction:
  - 0: intact (above 80%);
  - 1: scorch marks, torn banner (above 55%);
  - 2: roof holes, broken palisade gaps (above 30%);
  - 3: half the roof collapsed, charred beams (above 10%);
  - 4: near ruin, crystal cracked (above 0);
  - 5: a rubble ring with charred beams (destroyed).
  - Damage is drawn deterministically: a fixed set of holes and breaches, with each stage adding to the previous one.
  - Client effects: smoke from stage 2, fire from stage 3, and a flickering crystal at stage 4.
- **Tower** (`drawTowerBase(pal, stage)` about 32 × 44 px, plus a separate turret strip `drawTowerTurret(pal)` in 64 directions): a stone footing, a timber frame, a team-coloured pennant, and a small crystal.
  - Stages: 0 intact (above 60%), 1 cracked (above 25%), 2 heavily damaged and sparking (above 0), 3 rubble (destroyed; no turret drawn).
  - While a tower rebuilds, its rubble shows a scaffold outline and a progress pip.
- **Force field:** a translucent dome over the building in the team colour, with a hex shimmer and a slow pulse. It ripples where a hit was blocked. It shrinks and pops when it drops, and grows back when it returns.
- **Camp boundary:** a dotted team-colour circle at 220 px. The team totems stay, but the old marker stones go.
- **Preview:** `/?preview=camp` shows every stage for every team palette, towers included.

## 4. Rendering an 8192 px world
- **Ground in chunks** (`GroundChunks`, 256 px): only the chunks around the camera are drawn, within a per-frame time budget. Far chunks are evicted. Each chunk is drawn with the same `tileAt` lookup, plus a 4 px margin so shorelines line up across seams. Ground details are seeded per chunk, so redrawing a chunk gives the same result.
- **Obstacle, canopy and plant sprites** are grouped into 512 px buckets, and only the buckets near the camera are visible. The canopy fade loop visits only those buckets.
- **Wildlife:** `wildTarget(players, area)` scales today's numbers by `min(2.5, area / 4096²)`, so at most 275.

## 5. Protocol 4
- **`join`** gains `setup?`. A new **`switch { team, kind }`** message lets an eliminated rider join another team. `NEW_TEAM` is removed: the teams are fixed slots `team0..team{N-1}`.
- **`welcome`** gains `map`, `teams` and `tiles`.
- **Snapshots** carry `structures` (tuples, every snapshot), plus `round` (`{ phase, timer, winner }`), which is left out while unchanged. `TeamInfo` gains `eliminated`.
- **Lobby** (`/api/lobby`) gains `setup`, `maps` and `phase`, and loses `canCreateTeam`.

## Out of scope
More fixed maps (3- and 4-team) come later. The recipe format supports them. Also out of scope: client-side prediction, area-of-interest culling, sound, and a minimap.
