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

**Controls:** W/S throttle, A/D turn, mouse aims, left click (or Space) fires, right click uses
your mount's ability (15 s cooldown), E opens the shop (in your base camp), hold Tab for scores.

## Gameplay

- **Mounts:**
  - Triceratops: herbivore, tough, armored, a heavy cannon on each flank.
  - Velociraptor: carnivore, fast, small, a light gun on each side of its metal saddle.
  - Brontosaurus: herbivore, huge, slow and very tough. It carries a weapons platform on its
    back, with a glass cockpit dome, two red gun pods on each flank and a turret at the rear.
  - T-Rex: carnivore, big and strong, between the Triceratops and the Brontosaurus in size. Its
    head armor carries a gun barrel across the head with a gun at each end, and each armored
    shoulder carries a cannon.

  Triceratops and Velociraptor fire both guns together, along their barrels, within the arc
  the mount allows. The T-Rex fires each gun that is on target; its head guns turn with its
  head. The Brontosaurus fires only the guns on the side of the cursor: left,
  right or behind. Nothing fires straight ahead, because its neck is in the way.
- **Abilities (right click, 15 s cooldown):**
  - The Velociraptor leaps toward the cursor, over rocks and dinos, and slams down on whoever
    is below.
  - The Triceratops dashes straight ahead and rams everything in its path.
  - The Brontosaurus sweeps its tail through everything behind it, and shoves it away.
  - The T-Rex lunges forward and bites the nearest dino in front of it, for heavy damage.

  Wild dinos use them too, now and then. Every dino also has a natural melee attack (horns,
  claws, stamping feet, jaws) against whatever is right in front of it.
- **Water:** lakes and winding rivers cross the 4096 px world.
  - Shallow water, at the shores and at fords, doesn't slow anyone down.
  - Deep water slows small dinos a lot and big ones only a little: the Velociraptor keeps 25% of
    its speed, the Triceratops 70%, the T-Rex 75%, the Brontosaurus 90%. A leap passes over it.
  - **Rivers flow.** The four-legged giants (Triceratops, Brontosaurus) don't notice the current.
    It slows the T-Rex (80% of its speed) and the Velociraptor (60%), and it carries the
    Velociraptor downstream. In a deep river a raptor crawls and gets swept away.
  - Calm wild dinos walk around lakes (and wild raptors around rivers); hunting or fleeing ones
    wade straight in.
  - The water has little waves, streaks that run downstream in rivers, fish shadows in the
    lakes that dart away, and every footstep leaves a ripple.
- **Wild dinosaurs** without riders roam the world (more when more riders are online).
  Herbivores graze and charge (or flee from) attackers; raptors hunt riders outside their camp.
- **Eating heals:** stand still next to food. Herbivores eat bushes and ferns — and trees, if
  they are large; carnivores eat carcasses. Plants regrow; carcasses don't, but they last about
  4x longer. Every kill leaves a carcass, and a few old ones lie around the world.
- **Money:** kills pay a bounty (wild dinos by species; enemy riders more the more upgrades they
  carried). Spend it in your base camp on damage, range, fire rate and armor. You keep your money
  when you die, but lose your upgrades.

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
The Brontosaurus is the example for broadside guns: body mounts at `baseAngle` ±90° and 180°,
with `fireMode: 'side'` so that only the guns whose arc holds the cursor fire. `wadeSpeed` sets
how much speed a species keeps in deep water, `currentSlow` how much it keeps in a river, and
`currentDrift` how much of the current carries it along. New species also need sprites drawn in
`src/client/render/textures/` under the keys `<kind>_body_<palette>_<pose>`, `<kind>_shadow_<pose>`
and (if it has a head) `<kind>_head_<palette>` (palette = `t0`..`t3`). A long neck and tail can
bend: list the species in [src/client/render/chains.ts](src/client/render/chains.ts) and draw each
link of them as its own sprite (see the Brontosaurus).
