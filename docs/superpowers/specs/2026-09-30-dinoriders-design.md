# Dinoriders — v1 Design & Plan

## Context
A new game (the folder `c:\Users\Goll\Desktop\Dinoriders` is empty) inspired by *Dinoriders*: riders on armed dinosaurs fight in a prehistoric world. The user wants the following:
- Keyboard steering and mouse aiming/shooting, with a fixed top-down camera and a pixel-retro look (pseudo-3D is allowed).
- **Projectiles fire along the direction the weapon is actually pointing.** Where a weapon is mounted limits where it can aim, e.g. a Triceratops fires forward with a little head turn, and a Diplodocus has a back mount that fires only sideways. Each weapon also turns a little.
- A randomly generated world with rocks and trees.
- Triceratops first; other dinos added later.

Decisions confirmed with the user:
- **Opponents:** single-player against AI riders. The architecture must allow online multiplayer later.
- **Tech:** TypeScript + Phaser 3, built with Vite.
- **Art:** pixel sprites generated in code at startup. Real sprite sheets can replace them later.
- **Game loop:** survival against waves of enemies, with HP, a score and game over/restart.

On approval, this design is also saved as `docs/superpowers/specs/2026-09-30-dinoriders-design.md`, and the project gets `git init` plus a first commit.

## Architecture (key decision)
The game is split into **Simulation** (pure TS, no Phaser) and **Presentation** (Phaser). This split is what makes multiplayer possible later:
- **Fixed-tick sim:** 60 Hz, `step(state, commandsByEntity) → state`. It uses a seeded RNG (mulberry32) and does its own circle-vs-circle / circle-vs-AABB collision, not Phaser Arcade. This keeps it deterministic, so it can run later on a Node server.
- **Same input for everyone:** the player and the AI produce the same `InputCommand { throttle: -1..1, turn: -1..1, aimWorld: {x,y}, fire: boolean }`. For networking, we would later just send these commands.
- **Renderer reads, never writes:** it reads sim state and interpolates between ticks.

## Core mechanics
**Movement (tank-style):** W/S changes speed forward and back. A/D turns the body. Each dino has its own acceleration, max speed and turn rate. A Triceratops is heavy: slow to turn and fast when charging straight.

**Mount/aim system (data-driven, the heart of the request):**
```ts
DinoDef { id, radius, maxSpeed, accel, turnRate, hp,
  head?: { offset, maxYaw, yawSpeed },           // articulated part
  mounts: MountDef[] }
MountDef { id, parent: 'body' | 'head', offset: Vec2 /*local*/,
  baseAngle /*local, 0 = forward*/, arcHalf, turnSpeed, weapon: WeaponId }
WeaponDef { fireInterval, projectileSpeed, damage, spread, range, projectileKind }
```
Each tick, per dino:
1. Convert the aim target into the dino's local frame.
2. The head, if present, turns toward the target, limited by `maxYaw` and `yawSpeed`.
3. Each weapon rotates toward the target relative to its parent part, limited to `baseAngle ± arcHalf` and `turnSpeed`.
4. When firing, the projectile spawns at the weapon's world muzzle position and flies along the **weapon's actual world angle** plus a little random `spread`. It does not fly toward the cursor.

This produces the requested behaviour:
- **Triceratops:** head ±25° and a horn-mounted cannon ±10°, giving about ±35° of forward fire.
- **Future Diplodocus:** two back mounts at +90° and −90°, each ±30°, with no head turn, so only broadside fire.
- Adding a new dino means adding a new `DinoDef`; no code changes are needed.

**Showing the limits:** the renderer draws a faint firing-arc wedge and a dotted line along each weapon's real direction, so the player can see where shots will actually go. There is also a mouse reticle.

**Combat:**
- Projectiles move each tick and are destroyed by rocks and tree trunks or when they reach max range.
- A hit damages a dino with a hit flash. At 0 HP the dino dies with a small puff effect.
- A dino hitting another dino costs both of them a little HP. Triceratops ramming is a later feature, not v1.

## World generation (seeded)
- **Map:** 96×96 tiles of 16 px. Ground types are grass, dirt, fern and mud, blended using value noise.
- **Obstacles:** rocks (big and small, block movement and projectiles) and trees (the trunk blocks; the canopy only covers from view). They are scattered with jittered-grid/Poisson sampling and density controlled by noise. Trees cluster into groves.
- **Open areas:** there is a clear zone around the player spawn, and the map edge is bounded by a ring of rocks.

## Pixel-retro / pseudo-3D presentation
- **Pixel-perfect rendering:** internal resolution 480×270, integer zoom to fit the window, `pixelArt: true`, `roundPixels`, camera follows the player with slight lerp.
- **Generated sprites:** BootScene draws the textures with Phaser `Graphics` / canvas into textures:
  - dino body, head and rider;
  - weapon;
  - rocks and trees (trunk and canopy);
  - ground tiles and projectile.
  - Rotating pixel art freely looks muddy, so each part is **pre-rendered in 16 or 32 directions with nearest-neighbour rotation**, and the frame is picked by angle.
- **Pseudo-3D:**
  - drop shadows under dinos, rocks and projectiles;
  - sprites drawn in order of their y position;
  - tree canopies on a layer above the dinos, turning semi-transparent when the player is underneath;
  - rocks drawn with a lighter top face and a darker south face.

## AI
The AI is a simple per-enemy state machine that outputs an `InputCommand`:
- **Approach:** head toward the player while steering around obstacles (sample a few directions ahead and pick the clearest).
- **Engage:** turn the body so that a mount's firing arc covers the player, then fire while the target is within the arc and range. It reuses the mount definitions, so a future Diplodocus AI would naturally fight broadside.
- **Reposition:** when blocked or taking damage, sidestep.

## Waves & HUD
- **WaveDirector (in sim):** wave *n* spawns `2 + n` enemy Triceratops just outside the camera view. Their HP and fire rate increase slightly each wave. The next wave starts a few seconds after the current one is cleared.
- **Scoring:** the score goes up for kills and waves cleared.
- **HUD:** HP bar, wave number, score and enemies left.
- **Game over:** a GameOverScene shows the score. R restarts with a new seed.

## File layout
```
package.json, tsconfig.json, vite.config.ts, index.html
src/main.ts                     Phaser game config
src/sim/                        (no Phaser imports)
  types.ts  math.ts  rng.ts  noise.ts
  defs/dinos.ts  defs/weapons.ts
  world.ts        GameState, entity creation
  worldgen.ts     terrain + obstacles
  systems/movement.ts  aiming.ts  firing.ts  projectiles.ts  collision.ts  damage.ts
  ai.ts  waves.ts
  sim.ts          step(): runs systems in order
src/input/playerInput.ts        keyboard + mouse → InputCommand
src/render/textures/            procedural pixel sprites (dino, rider, weapon, rock, tree, tiles, fx)
src/render/                     WorldView, DinoView, ProjectileView, ArcIndicator, Hud
src/scenes/  BootScene.ts  GameScene.ts  GameOverScene.ts
tests/sim/                      Vitest unit tests
```

## Implementation order
1. Scaffold Vite + TS + Phaser + Vitest, and add `npm run dev|build|test`.
2. Sim basics: math, rng, types, the Triceratops definition, movement, collision. Add tests.
3. Aiming and firing system: head yaw, mount clamping, muzzle position, projectiles. Test it with a Triceratops and a test-only side-mounted definition to prove the Diplodocus pattern works.
4. World generation, with a determinism test (same seed gives the same map).
5. Generated textures, rendering of the world and dinos, direction-frame sprites, pseudo-3D layering.
6. Player input, camera, reticle and arc indicators. The game can be driven and fired at this point.
7. AI, damage/death and the wave director.
8. HUD, game-over and restart; tune the game feel.

## Verification
- `npm test` runs the Vitest unit tests. They cover:
  - angle clamping and head-plus-mount aim resolution: a target behind a Triceratops gives a clamped forward shot, and the side-mount definition fires only broadside;
  - that projectiles fly along the weapon's direction rather than toward the cursor;
  - collisions;
  - that world generation is deterministic.
- `npm run build` must type-check cleanly.
- `npm run dev`, then play in the browser and check that:
  - steering works and the dino is blocked by rocks and trunks;
  - putting the cursor behind the dino still fires shots within the forward arc;
  - canopies fade when you're under them;
  - enemies approach, aim and fire;
  - waves escalate;
  - game over and restart work;
  - pixels stay crisp at every window size.
