# Camp Siege, Map Setup and 8192 px World: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Dinoriders' endless world into rounds. Each team has a destructible camp defended by 5 towers, the last camp standing wins, the world is 8192 px, and the first player picks 2, 3 or 4 teams and a map (RANDOM, or the hand-made 2-team map CROSSING).

**Architecture:**
- The sim (`src/sim`, pure and deterministic) gains:
  - **structures** (camp and towers) with a damage path, tower AI and a force-field rule;
  - a **round phase machine** (waiting → countdown → playing → over), with elimination;
  - **map recipes**, rasterized by `worldgen`.
- The server `Match` owns the **round settings**. It builds a fresh `GameState` per round and re-sends `welcome` to every client.
- The client restarts `GameScene` on each `welcome`. It draws the ground in **lazy 256 px chunks**, shows structures with **damage-stage sprites** and a force-field dome, and adds a setup step to the join screen.

**Tech stack:** TypeScript, Phaser 3 (client), Node + `ws` (server), vitest.

**Spec:** [docs/superpowers/specs/2026-10-05-camp-siege-design.md](../specs/2026-10-05-camp-siege-design.md). Read it first. Also read [docs/HANDOFF.md](../../HANDOFF.md), especially **Gotchas** and **Run and verify**.

## Global constraints
- `src/sim` must not import Phaser, and must stay deterministic: only `state.rng` or the seeded noise, never `Math.random`.
- `generateWorld` runs on both the server and the client, so it must stay deterministic for `(seed, options)`.
- All HUD text uses the 5×7 bitmap font: **uppercase only**. The available punctuation is `! - + . , : / ? ( ) = > < % # *`.
- Rule for new client-visible state: `GameState` (`types.ts`) → encode/decode in `protocol.ts` → a round-trip test in `tests/net/protocol.test.ts`.
- `PROTOCOL_VERSION` becomes **4**.
- Run vitest from `C:\…` with a capital drive letter. The lowercase `c:\` fails (see HANDOFF Gotchas).
- No Python on the machine. For scripted edits, write a `.cjs` file and run it with `node`, or use the Edit tool.
- Balance numbers come from the spec table. Keep them in `CAMP`, `TOWER_GUN` and `rounds.ts` constants. Never inline them.
- Commit after each task with a message that starts with the task title. End every commit message with the attribution line from the session's system reminder.

## Review focus
These are the failure modes most likely to bite players that no single task's happy-path tests cover. Each one gets a test in the task named.
1. **Two clients submit a setup at the same time.** The second must join the first one's round, not overwrite it. If its team slot doesn't exist, it gets an error and returns to the join screen. → Task 11, test "second setup is ignored".
2. **A player disconnects mid-round, leaving their team empty.** The camp collapses after 30 s and the round can end. If *everyone* leaves, the next arrival gets the setup screen. → Task 9 ("empty team collapses") and Task 11 ("server resets when empty").
3. **The camp is destroyed while its riders are mid-ability or mid-leap.** No crash, no respawn for the eliminated team, and dinos aren't left half-alive. → Task 9, "elimination kills riders mid-leap".
4. **Bullets from the camp's own team, fired from inside the camp,** must not hit their own towers or building. → Task 5, "friendly bullets pass through".
5. **A wild dino hit by a tower** (`lastAttacker` = a structure id that isn't a dino) must not crash the wild AI. → Task 7, "wild AI tolerates a tower attacker".

---

## Task 0: Preflight

**Files:** none.

- [ ] **Step 1:** Run `git status`. The working tree had uncommitted user work on 2026-10-05: the food grid in `spatial.ts`, `MAX_PLAYERS = 23`, and edits to `feeding.test.ts` and HANDOFF. If it is still uncommitted, **stop and ask the user** whether to commit it first. Don't fold it into this work.
- [ ] **Step 2:** Create a branch: `git checkout -b camp-siege`.
- [ ] **Step 3:** Run `npm test` and `npx tsc --noEmit`. Both must pass before you start. Write down the test count.

---

## Task 1: 8192 px world, N-team camp layout, wildlife scaling

**Files:**
- Create: `tests/helpers.ts`
- Modify: `src/sim/worldgen.ts` (`DEFAULT_TILES`, `baseInset`, `baseSlots`, `WorldGenOptions`, `generateWorld`)
- Modify: `src/sim/ecology.ts` (`wildTarget`, `populateWild`, `updateEcology`)
- Modify: every `tests/**/*.test.ts` that calls `createMatch(` or `generateWorld(` without a size
- Test: `tests/sim/world.test.ts`, `tests/sim/wild.test.ts`

**Interfaces:**
- Produces:
  - `WorldGenOptions.teams?: number` (default 4)
  - `baseSlots(width: number, height: number, teams?: number): Vec2[]`
  - `DEFAULT_TILES = 512`
  - `wildTarget(players: number, area?: number): number`
  - `SMALL` in `tests/helpers.ts`

- [ ] **Step 1: Add the test helper.** Existing tests keep today's 4096 px map, so they stay fast.

```ts
// tests/helpers.ts
/** Today's 4096 px map: unit tests that don't care about the map size use it to stay fast. */
export const SMALL = { cols: 256, rows: 256 } as const;
```

- [ ] **Step 2: Point the existing tests at `SMALL`.** Every `createMatch(<n>)` becomes `createMatch(<n>, SMALL)`, and `createMatch(<n>, undefined, …)` becomes `createMatch(<n>, SMALL, …)`. Calls that already pass `{ cols, rows … }` stay as they are. Add `import { SMALL } from '../helpers';` to each file you touch.
  - In `world.test.ts`, the two determinism tests use `generateWorld(123, SMALL)`, `generateWorld(1, SMALL)` and `generateWorld(2, SMALL)`.
  - Find the calls with: `grep -rn "createMatch([0-9]*)\|createMatch([0-9]*, undefined" tests`.
  - `match.test.ts` is handled in Task 11. Leave it alone.

- [ ] **Step 3: Write the failing tests** in `tests/sim/world.test.ts`. Replace the `'is 4096 px square …'` test, and add a `baseSlots` test:

```ts
import { DEFAULT_TILES, baseSlots } from '../../src/sim/worldgen';

it('is 8192 px square by default and leaves room for the biggest dino between any two obstacles', () => {
  const t0 = performance.now();
  const w = generateWorld(99);
  console.log(`generateWorld 8192 px: ${Math.round(performance.now() - t0)} ms`);
  expect(DEFAULT_TILES).toBe(512);
  expect([w.width, w.height]).toEqual([8192, 8192]);
  const inner = w.obstacles.filter((o) => o.x > 30 && o.y > 30 && o.x < w.width - 30 && o.y < w.height - 30);
  expect(inner.length).toBeGreaterThan(1200);
  // Smallest gap between any two obstacles (one expect: millions of expect calls are slow).
  let minGap = Infinity;
  for (let i = 0; i < inner.length; i++) {
    for (let j = i + 1; j < inner.length; j++) {
      const a = inner[i];
      const b = inner[j];
      if (Math.abs(a.x - b.x) > 100) continue;
      minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r);
    }
  }
  expect(minGap).toBeGreaterThanOrEqual(OBSTACLE_GAP - 1e-9);
});

describe('baseSlots', () => {
  const W = 8192;
  it('puts 2 camps in opposite corners, 1/8 in from the edge', () => {
    expect(baseSlots(W, W, 2)).toEqual([{ x: 1024, y: 1024 }, { x: 7168, y: 7168 }]);
  });
  it('spreads 3 camps evenly around the centre', () => {
    const s = baseSlots(W, W, 3);
    expect(s).toHaveLength(3);
    const d = (i: number, j: number) => Math.hypot(s[i].x - s[j].x, s[i].y - s[j].y);
    expect(Math.abs(d(0, 1) - d(1, 2))).toBeLessThan(2);
    expect(Math.abs(d(1, 2) - d(2, 0))).toBeLessThan(2);
    for (const b of s) expect(Math.min(b.x, b.y, W - b.x, W - b.y)).toBeGreaterThanOrEqual(1000);
  });
  it('puts 4 camps in the corners (diagonal pairs first)', () => {
    expect(baseSlots(W, W, 4)).toEqual([{ x: 1024, y: 1024 }, { x: 7168, y: 7168 }, { x: 7168, y: 1024 }, { x: 1024, y: 7168 }]);
  });
  it('keeps at least 260 px on tiny test maps', () => {
    expect(baseSlots(960, 960, 4)[0]).toEqual({ x: 260, y: 260 });
  });
});
```

Also update the `'has rocks and trees and four clear base camps'` test to use `generateWorld(99, SMALL)`, which still has 4 bases by default.

- [ ] **Step 4:** Run `npx vitest run tests/sim/world.test.ts`. Expect failures: `DEFAULT_TILES` is 256, and `baseSlots` has no `teams` parameter.

- [ ] **Step 5: Implement** in `src/sim/worldgen.ts`:

```ts
export interface WorldGenOptions {
  cols?: number;
  rows?: number;
  tileSize?: number;
  /** Lakes and rivers (default true). Unit tests that need dry ground turn them off. */
  water?: boolean;
  /** Number of base camps (default 4). */
  teams?: number;
}

/** Default map: 512 x 512 tiles of 16 px = 8192 px square (the client draws the ground in chunks). */
export const DEFAULT_TILES = 512;

/** Distance of base camps from the map edge: 1/8 of the map, at least 260 px. */
function baseInset(width: number): number {
  return Math.round(Math.max(260, width * 0.125));
}

/**
 * Base camps for `teams` teams, spread out: 2 in opposite corners, 3 in a triangle around the
 * centre, 4 in the corners (diagonal opposites first, so the first two teams start far apart).
 */
export function baseSlots(width: number, height: number, teams = 4): Vec2[] {
  const a = baseInset(Math.min(width, height));
  if (teams === 3) {
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) / 2 - a;
    return [-90, 30, 150].map((deg) => ({ x: Math.round(cx + Math.cos((deg * Math.PI) / 180) * r), y: Math.round(cy + Math.sin((deg * Math.PI) / 180) * r) }));
  }
  const corners = [
    { x: a, y: a },
    { x: width - a, y: height - a },
    { x: width - a, y: a },
    { x: a, y: height - a },
  ];
  return corners.slice(0, teams === 2 ? 2 : 4);
}
```

In `generateWorld`, use `const bases = baseSlots(width, height, opts.teams ?? 4);`.

Check the 3-team camps: the inset is 1024 and r = 3072, so the top camp is at y = 4096 − 3072 = 1024 and the lower two at y = 4096 + 1536 = 5632, x = 4096 ± 2660. All are at least 1024 px from every edge.

- [ ] **Step 6: Scale the wildlife** (`src/sim/ecology.ts`):

```ts
/** Wild population scales with the riders and with the map area (tuned on a 4096 px map; at most 2.5x that). */
export function wildTarget(players: number, area = 4096 * 4096): number {
  return Math.round(Math.min(110, 28 + 5 * players) * Math.min(2.5, area / (4096 * 4096)));
}
```

Both callers become `wildTarget(state.players.length, state.world.width * state.world.height)`.

Add to `tests/sim/wild.test.ts`:

```ts
import { wildTarget } from '../../src/sim/ecology';
it('scales the wild population with map area, capped at 2.5x', () => {
  expect(wildTarget(0)).toBe(28);
  expect(wildTarget(0, 8192 * 8192)).toBe(70);
  expect(wildTarget(100, 8192 * 8192)).toBe(275);
});
```

- [ ] **Step 7:** Run `npm test`. Everything must pass. Note the `generateWorld 8192 px` time from the log. If it is over 1500 ms, profile `generateWorld` (the scatter loops and `fits` are the suspects) before going on, because the client runs it too.
- [ ] **Step 8:** Commit: `Task 1: 8192 px world, N-team camp layout, wildlife scaled by area`.

---

## Task 2: Map recipes, CROSSING, recipe rasterization

**Files:**
- Create: `src/sim/maps/types.ts`, `src/sim/maps/crossing.ts`, `src/sim/maps/index.ts`
- Modify: `src/sim/worldgen.ts` (water from a recipe, symmetric scatter, zones), `src/sim/types.ts` (`World.towers`)
- Test: `tests/sim/maps.test.ts`

**Interfaces:**
- Consumes: `baseSlots`, `WorldGenOptions` (Task 1)
- Produces:
  - `MapRecipe`, `LakeDef`, `RiverDef`, `FordDef`, `ZoneDef`
  - `CROSSING`
  - `RANDOM_MAP = 'random'`, `TEAM_COUNTS = [2, 3, 4]`
  - `interface RoundSettings { teams: number; map: string }`
  - `interface MapInfo { id: string; name: string; teams: number }`
  - `getMap(id: string): MapRecipe | undefined`
  - `mapsFor(teams: number): MapInfo[]` (RANDOM first)
  - `validSettings(teams: unknown, map: unknown): RoundSettings | null`
  - `worldOptionsFor(map: string, teams: number, tiles?: number): WorldGenOptions`
  - `WorldGenOptions.map?: MapRecipe`
  - `World.towers: Vec2[][] | null`

**CROSSING layout** (8192 px, 2 teams, point-symmetric about the centre (4096, 4096)):
- Camps at (1024, 1024) and (7168, 7168).
- A **central lake** with radius 700, crossed by a **shallow causeway** along the camp-to-camp diagonal (three fords inside the lake). This is the direct route, open ground with no cover.
- **Two rivers** run from the lake out to the top-right and bottom-left corners, so the map splits into one half per camp. Each river has **two fords**, four in all. Water flows *out of* the lake.
- **Forest belts** sit along the rivers in each half, as flank cover. **Rock fields** guard each ford.
- The **camp surroundings are clear**.

- [ ] **Step 1: Recipe types** (`src/sim/maps/types.ts`):

```ts
import type { Vec2 } from '../types';

/** A round lake: deep inside r - rim, shallow out to r. Edges are wobbled by noise. */
export interface LakeDef {
  x: number;
  y: number;
  r: number;
  rim: number;
}

/** A river along a polyline, flowing from the first point to the last. Half-widths in px. */
export interface RiverDef {
  points: Vec2[];
  closed?: boolean;
  deep: number;
  wide: number;
}

/** A crossing: no deep water within r of (x, y). */
export interface FordDef {
  x: number;
  y: number;
  r: number;
}

/** Biases the obstacle scatter: more trees (forest), more rocks (rocks), or fewer of both (clear). */
export interface ZoneDef {
  kind: 'forest' | 'rocks' | 'clear';
  x: number;
  y: number;
  r: number;
  /** 0..1 at the centre, fading to 0 at r. */
  strength: number;
}

/** A hand-made map. Land types, exact shorelines and obstacles still come from seeded noise. */
export interface MapRecipe {
  id: string;
  /** Shown on the join screen (uppercase). */
  name: string;
  teams: number;
  /** Map size in 16 px tiles (square). */
  tiles: number;
  /** Fixed seed, so the map is the same every time. */
  seed: number;
  /** 'point': terrain, water and obstacles mirror through the map centre (fair for 2 teams). */
  symmetry: 'point' | 'none';
  /** Camp centres, one per team slot. */
  bases: Vec2[];
  /** Tower positions per team slot (5 each). */
  towers: Vec2[][];
  lakes: LakeDef[];
  rivers: RiverDef[];
  fords: FordDef[];
  zones: ZoneDef[];
}
```

- [ ] **Step 2: CROSSING** (`src/sim/maps/crossing.ts`):

```ts
import type { Vec2 } from '../types';
import type { MapRecipe } from './types';

const C = 4096;
const mirror = (p: Vec2): Vec2 => ({ x: 2 * C - p.x, y: 2 * C - p.y });

/** Five towers on a ring of 170 px around a camp, the first one facing `facingDeg`. */
function towerRing(base: Vec2, facingDeg: number): Vec2[] {
  return Array.from({ length: 5 }, (_, k) => {
    const a = ((facingDeg + k * 72) * Math.PI) / 180;
    return { x: Math.round(base.x + Math.cos(a) * 170), y: Math.round(base.y + Math.sin(a) * 170) };
  });
}

const CAMP_A = { x: 1024, y: 1024 };
const CAMP_B = mirror(CAMP_A);

/** River from the lake's north-east shore to the top-right corner, meandering a little. */
const RIVER_NE: Vec2[] = [
  { x: 4560, y: 3630 },
  { x: 5150, y: 3200 },
  { x: 5550, y: 2700 },
  { x: 6150, y: 2250 },
  { x: 6600, y: 1650 },
  { x: 7300, y: 1000 },
  { x: 8192, y: 300 },
];

/** Fords: two per river, plus a shallow causeway across the lake along the camp diagonal. */
const FORDS_NE = [
  { x: 5550, y: 2700, r: 130 },
  { x: 6600, y: 1650, r: 130 },
];

export const CROSSING: MapRecipe = {
  id: 'crossing',
  name: 'CROSSING',
  teams: 2,
  tiles: 512,
  seed: 0xc2055,
  symmetry: 'point',
  bases: [CAMP_A, CAMP_B],
  // Towers face the map centre.
  towers: [towerRing(CAMP_A, 45), towerRing(CAMP_B, 225)],
  lakes: [{ x: C, y: C, r: 700, rim: 110 }],
  rivers: [
    { points: RIVER_NE, deep: 60, wide: 120 },
    { points: RIVER_NE.map(mirror), deep: 60, wide: 120 },
  ],
  fords: [
    ...FORDS_NE,
    ...FORDS_NE.map((f) => ({ ...mirror(f), r: f.r })),
    // Causeway: overlapping fords along the camp diagonal, out past the lake's deep core (≤ ~675 px with wobble).
    { x: C - 450, y: C - 450, r: 180 },
    { x: C - 250, y: C - 250, r: 200 },
    { x: C, y: C, r: 230 },
    { x: C + 250, y: C + 250, r: 200 },
    { x: C + 450, y: C + 450, r: 180 },
  ],
  zones: [
    // Flank forests along the rivers, one pair per half.
    { kind: 'forest', x: 4900, y: 2050, r: 900, strength: 0.55 },
    { kind: 'forest', x: 2050, y: 4900, r: 900, strength: 0.55 },
    { kind: 'forest', ...mirror({ x: 4900, y: 2050 }), r: 900, strength: 0.55 },
    { kind: 'forest', ...mirror({ x: 2050, y: 4900 }), r: 900, strength: 0.55 },
    // Rocks for cover at every river ford, on both banks.
    ...[...FORDS_NE, ...FORDS_NE.map((f) => ({ ...mirror(f), r: f.r }))].map((f) => ({ kind: 'rocks' as const, x: f.x, y: f.y, r: 360, strength: 0.6 })),
    // Open killing ground around each camp.
    { kind: 'clear', ...CAMP_A, r: 700, strength: 0.8 },
    { kind: 'clear', ...CAMP_B, r: 700, strength: 0.8 },
  ],
};
```

- [ ] **Step 3: Registry** (`src/sim/maps/index.ts`):

```ts
import type { WorldGenOptions } from '../worldgen';
import { DEFAULT_TILES } from '../worldgen';
import type { MapRecipe } from './types';
import { CROSSING } from './crossing';

export type { MapRecipe } from './types';
export const RANDOM_MAP = 'random';
export const TEAM_COUNTS = [2, 3, 4];

/** What the first player on an empty server picks; repeated every round. */
export interface RoundSettings {
  teams: number;
  /** RANDOM_MAP or a fixed map id. */
  map: string;
}

export interface MapInfo {
  id: string;
  name: string;
  teams: number;
}

const MAPS: MapRecipe[] = [CROSSING];

export function getMap(id: string): MapRecipe | undefined {
  return MAPS.find((m) => m.id === id);
}

/** Maps offered for a team count: RANDOM first, then the fixed maps made for that count. */
export function mapsFor(teams: number): MapInfo[] {
  return [{ id: RANDOM_MAP, name: 'RANDOM', teams }, ...MAPS.filter((m) => m.teams === teams).map((m) => ({ id: m.id, name: m.name, teams: m.teams }))];
}

export function validSettings(teams: unknown, map: unknown): RoundSettings | null {
  if (typeof teams !== 'number' || !TEAM_COUNTS.includes(teams) || typeof map !== 'string') return null;
  if (map === RANDOM_MAP) return { teams, map };
  return getMap(map)?.teams === teams ? { teams, map } : null;
}

/** World options for a round. Server and client both call this, so they generate the same world. */
export function worldOptionsFor(map: string, teams: number, tiles = DEFAULT_TILES): WorldGenOptions {
  const recipe = getMap(map);
  if (recipe) return { cols: recipe.tiles, rows: recipe.tiles, teams: recipe.teams, map: recipe };
  return { cols: tiles, rows: tiles, teams };
}
```

- [ ] **Step 4: Write the failing tests** (`tests/sim/maps.test.ts`). This file generates CROSSING once at full size and reuses it.

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { Tile, type World } from '../../src/sim/types';
import { generateWorld } from '../../src/sim/worldgen';
import { CROSSING } from '../../src/sim/maps/crossing';
import { getMap, mapsFor, validSettings, worldOptionsFor } from '../../src/sim/maps';
import { flowAt, isWater } from '../../src/sim/world';

let w: World;
beforeAll(() => {
  w = generateWorld(CROSSING.seed, worldOptionsFor('crossing', 2));
});

/** Is there a path between two points over tiles that pass `ok` (4-connected flood fill)? */
function connected(world: World, a: { x: number; y: number }, b: { x: number; y: number }, ok: (t: number) => boolean): boolean {
  const { cols, rows, tileSize } = world;
  const start = Math.floor(a.y / tileSize) * cols + Math.floor(a.x / tileSize);
  const goal = Math.floor(b.y / tileSize) * cols + Math.floor(b.x / tileSize);
  const seen = new Uint8Array(cols * rows);
  const queue = [start];
  seen[start] = 1;
  while (queue.length) {
    const i = queue.pop()!;
    if (i === goal) return true;
    const x = i % cols;
    const y = (i / cols) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (seen[j] || !ok(world.tiles[j])) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return false;
}

describe('map registry', () => {
  it('offers RANDOM for every team count and CROSSING only for 2 teams', () => {
    expect(mapsFor(2).map((m) => m.id)).toEqual(['random', 'crossing']);
    expect(mapsFor(3).map((m) => m.id)).toEqual(['random']);
    expect(validSettings(2, 'crossing')).toEqual({ teams: 2, map: 'crossing' });
    expect(validSettings(4, 'crossing')).toBeNull();
    expect(validSettings(5, 'random')).toBeNull();
    expect(validSettings(3, 'nope')).toBeNull();
    expect(getMap('crossing')).toBe(CROSSING);
  });
});

describe('CROSSING', () => {
  it('uses the recipe camps and towers', () => {
    expect([w.width, w.height]).toEqual([8192, 8192]);
    expect(w.bases).toEqual(CROSSING.bases);
    expect(w.towers).toEqual(CROSSING.towers);
  });

  it('is deterministic', () => {
    const again = generateWorld(CROSSING.seed, worldOptionsFor('crossing', 2));
    expect(again.tiles).toEqual(w.tiles);
    expect(again.obstacles.length).toBe(w.obstacles.length);
  });

  it('is split in two by water, crossable only through fords and the causeway', () => {
    const land = (t: number) => t !== Tile.Shallow && t !== Tile.Deep;
    const notDeep = (t: number) => t !== Tile.Deep;
    const [a, b] = CROSSING.bases;
    expect(connected(w, a, b, land)).toBe(false);
    expect(connected(w, a, b, notDeep)).toBe(true);
  });

  it('mirrors water through the centre', () => {
    let same = 0;
    const n = w.cols * w.rows;
    for (let i = 0; i < n; i++) {
      const x = i % w.cols;
      const y = (i / w.cols) | 0;
      const m = (w.rows - 1 - y) * w.cols + (w.cols - 1 - x);
      const wet = (t: number) => (t === Tile.Deep ? 2 : t === Tile.Shallow ? 1 : 0);
      if (wet(w.tiles[i]) === wet(w.tiles[m])) same++;
    }
    expect(same / n).toBeGreaterThan(0.99);
  });

  it('mirrors obstacles through the centre', () => {
    const inner = w.obstacles.filter((o) => o.x > 40 && o.y > 40 && o.x < w.width - 40 && o.y < w.height - 40);
    expect(inner.length).toBeGreaterThan(800);
    const key = (x: number, y: number) => `${Math.round(x)},${Math.round(y)}`;
    const at = new Set(inner.map((o) => key(o.x, o.y)));
    const mirrored = inner.filter((o) => at.has(key(w.width - o.x, w.height - o.y))).length;
    expect(mirrored / inner.length).toBeGreaterThan(0.99);
  });

  it('rivers flow out of the lake; the lake is still', () => {
    const f = flowAt(w, 6150, 2250);
    expect(Math.hypot(f.x, f.y)).toBeGreaterThan(10);
    expect(f.x).toBeGreaterThan(0); // towards the top-right corner
    expect(f.y).toBeLessThan(0);
    expect(flowAt(w, 4096 + 300, 4096 - 300)).toEqual({ x: 0, y: 0 });
  });

  it('keeps camps dry and clear', () => {
    for (const b of w.bases) expect(isWater(w, b.x, b.y)).toBe(false);
  });
});
```

- [ ] **Step 5:** Run `npx vitest run tests/sim/maps.test.ts`. It fails: `World.towers` is missing and recipes are ignored.

- [ ] **Step 6: Implement the rasterization** in `src/sim/worldgen.ts`.
  1. Add `map?: MapRecipe` to `WorldGenOptions` (`import type { MapRecipe } from './maps/types';`). Add `towers: Vec2[][] | null` to `World` in `types.ts`.
  2. Add the helpers below, next to `waterLayer`:

```ts
/** Point symmetry: both mirror images evaluate their noise at the same canonical point. */
function canonical(recipe: MapRecipe | undefined, width: number, height: number, x: number, y: number): [number, number] {
  if (recipe?.symmetry !== 'point') return [x, y];
  const flip = x / width + y / height > 1 || (x / width + y / height === 1 && x > width / 2);
  return flip ? [width - x, height - y] : [x, y];
}

/** Distance from (x, y) to a polyline, and the unit direction of the nearest segment. */
function nearestOnRiver(r: RiverDef, x: number, y: number): { d: number; tx: number; ty: number } {
  let best = { d: Infinity, tx: 0, ty: 0 };
  const n = r.points.length;
  const segs = r.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = r.points[i];
    const b = r.points[(i + 1) % n];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / len2));
    const d = Math.hypot(x - (a.x + vx * t), y - (a.y + vy * t));
    if (d < best.d) {
      const len = Math.sqrt(len2);
      best = { d, tx: vx / len, ty: vy / len };
    }
  }
  return best;
}

/** Water from a recipe: lakes, rivers with a current along their line, fords. Edges wobble with noise. */
function recipeWater(m: MapRecipe, cols: number, rows: number, tileSize: number): WaterLayer {
  const width = cols * tileSize;
  const height = rows * tileSize;
  const tiles = new Uint8Array(cols * rows);
  const flow = new Float32Array(cols * rows * 2);
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const i = ty * cols + tx;
      const x = (tx + 0.5) * tileSize;
      const y = (ty + 0.5) * tileSize;
      const [cx, cy] = canonical(m, width, height, x, y);
      const wob = (fbm(cx / 180, cy / 180, m.seed + 31, 3) - 0.5) * 2;
      const ford = m.fords.some((f) => (f.x - x) ** 2 + (f.y - y) ** 2 < f.r * f.r);
      let deep = false;
      let shallow = false;
      let lake = false;
      for (const l of m.lakes) {
        const d = Math.hypot(x - l.x, y - l.y) + wob * l.r * 0.12;
        if (d >= l.r) continue;
        lake = shallow = true;
        if (d < l.r - l.rim && !ford) deep = true;
      }
      // Where a river runs into a lake, the lake wins: still water.
      if (!lake) {
        for (const r of m.rivers) {
          const hit = nearestOnRiver(r, x, y);
          const d = hit.d + wob * r.wide * 0.25;
          if (d >= r.wide) continue;
          shallow = true;
          if (d < r.deep && !ford) deep = true;
          const v = RIVER_SPEED * Math.min(1, 1.6 * (1 - d / r.wide)) * (ford ? 0.6 : 1);
          flow[i * 2] = hit.tx * v;
          flow[i * 2 + 1] = hit.ty * v;
          break;
        }
      }
      tiles[i] = deep ? Tile.Deep : shallow ? Tile.Shallow : 0;
    }
  }
  return { tiles, flow };
}

/** How strongly the recipe's zones of one kind apply at (x, y). */
function zoneAt(m: MapRecipe, kind: ZoneDef['kind'], x: number, y: number): number {
  let s = 0;
  for (const z of m.zones) if (z.kind === kind) s += z.strength * Math.max(0, 1 - Math.hypot(x - z.x, y - z.y) / z.r);
  return s;
}
```

  3. In `generateWorld`:
     - Set `const recipe = opts.map;`.
     - Bases: `const bases = recipe ? recipe.bases.map((b) => ({ ...b })) : baseSlots(width, height, opts.teams ?? 4);`.
     - Water: `const water = (opts.water ?? true) ? (recipe ? recipeWater(recipe, cols, rows, tileSize) : waterLayer(cols, rows, seed)) : null;`.
     - **Land tiles:** evaluate `moist` and `lush` at the canonical tile. Compute `const [ux, uy] = canonical(recipe, cols, rows, x + 0.5, y + 0.5);` and use `ux - 0.5`, `uy - 0.5` in place of `x`, `y` in the two `fbm` calls. Note that `canonical` takes the *tile* grid size here.
     - `world.towers = recipe ? recipe.towers.map((t) => t.map((p) => ({ ...p }))) : null`.
  4. **Obstacle scatter with a recipe:**
     - Compute `grove`/`rocky` at the canonical point.
     - Add the zones:

```ts
const [ux, uy] = canonical(recipe, width, height, x, y);
const clear = recipe ? zoneAt(recipe, 'clear', x, y) : 0;
const grove = recipe ? 0.4 + (fbm(ux / 260, uy / 260, seed + 101, 3) - 0.5) * 0.4 + zoneAt(recipe, 'forest', x, y) - clear : fbm(x / 260, y / 260, seed + 101, 3);
const rocky = recipe ? 0.45 + (fbm(ux / 200, uy / 200, seed + 202, 3) - 0.5) * 0.4 + zoneAt(recipe, 'rocks', x, y) - clear : fbm(x / 200, y / 200, seed + 202, 3);
```

     - Multiply the rock chance by `(1 - Math.min(1, clear))`: `roll < (0.12 + Math.max(0, (rocky - 0.5) * 1.6)) * (1 - Math.min(1, clear))`.
     - **Point symmetry:** skip candidates with `x / width + y / height > 1`. For every accepted candidate also compute the mirror `(width - x, height - y)`. Push **both** only if `fits` passes for both and the pair is at least `2r + OBSTACLE_GAP` apart. Otherwise push neither.
     - The `rng` draws must stay in the same order for both copies, so draw the variant and size **once** and reuse them for the mirror.
  5. **Food with a recipe and point symmetry:** in the bush/fern grid loop, do the same as for obstacles. Skip the far half, and push a mirrored plant (new `id`) when `clearOf` passes for both positions. Tree food still comes from the (already mirrored) trees. The initial carcasses stay as they are; they rot away.
  6. `nearBase` and the `BASE_DRY` check already use `bases`, so recipe camps get the same dry, clear ground.

- [ ] **Step 7:** Run `npx vitest run tests/sim/maps.test.ts`. All tests must pass. If the "split in two" test fails with `land` connected, a river end doesn't reach the map edge or the lake. Check that the river's first point lies inside the lake (radius 700 around the centre) and its last point lies on the map edge.
- [ ] **Step 8:** Run `npm test` (the random worlds must be unchanged: `world.test.ts` determinism still passes). Commit: `Task 2: map recipes and the CROSSING map`.

---

## Task 3: Camp structures and pre-made teams

**Files:**
- Create: `src/sim/camp.ts`
- Modify: `src/sim/types.ts`, `src/sim/players.ts` (`createTeam`, `BASE_RADIUS`), `src/sim/sim.ts` (`createMatch`), `src/sim/worldgen.ts` (`BASE_CLEAR`)
- Test: `tests/sim/camp.test.ts`

**Interfaces:**
- Produces (in `types.ts`):

```ts
export type StructureKind = 'camp' | 'tower';

/** A team's camp building or one of its defense towers. Solid while standing (hp > 0). */
export interface Structure {
  id: number;
  team: Team;
  kind: StructureKind;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  /** Turret direction, radians (towers). */
  angle: number;
  /** Seconds until the tower gun can fire again. */
  cooldown: number;
  /** Seconds until a destroyed tower stands again (0 while standing or for good). */
  rebuildIn: number;
  hitFlash: number;
  /** Dino the tower is aiming at. */
  target: number | null;
}

export type RoundPhase = 'waiting' | 'countdown' | 'playing' | 'over';

export interface RoundState {
  phase: RoundPhase;
  /** Seconds left in countdown / over. */
  timer: number;
  /** Winning team id once the round is over (null for a draw). */
  winner: Team | null;
}
```

  - `TeamState.eliminated: boolean`
  - `GameState.structures: Structure[]`, `GameState.round: RoundState`, `GameState.camps: boolean`
  - `camp.ts`: `CAMP`, `TOWER_GUN`, `towerRing(base, facing): Vec2[]`, `placeCamp(state, team)`, `isStanding(s)`, `campOf(state, team)`, `towersOf(state, team)`, `standingTowers(state, team)`, `fieldUp(state, team)`
  - `createMatch(seed, worldOpts?, { wildlife?, teams?, camps? })`

- [ ] **Step 1: Write the failing test** (`tests/sim/camp.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { createMatch } from '../../src/sim/sim';
import { CAMP, campOf, fieldUp, standingTowers, towersOf } from '../../src/sim/camp';
import { BASE_RADIUS } from '../../src/sim/players';
import { worldOptionsFor } from '../../src/sim/maps';
import { CROSSING } from '../../src/sim/maps/crossing';
import { SMALL } from '../helpers';

describe('camps', () => {
  it('creates the requested teams, each with a camp building and 5 towers', () => {
    const s = createMatch(1, { ...SMALL, teams: 3 }, { teams: 3 });
    expect(s.teams.map((t) => t.id)).toEqual(['team0', 'team1', 'team2']);
    expect(s.teams.every((t) => !t.eliminated)).toBe(true);
    for (const t of s.teams) {
      const camp = campOf(s, t.id)!;
      expect([camp.x, camp.y]).toEqual([t.base.x, t.base.y]);
      expect(camp.hp).toBe(CAMP.buildingHp);
      const towers = towersOf(s, t.id);
      expect(towers).toHaveLength(CAMP.towers);
      for (const tw of towers) expect(Math.abs(Math.hypot(tw.x - t.base.x, tw.y - t.base.y) - CAMP.towerRing)).toBeLessThan(1);
      expect(standingTowers(s, t.id)).toBe(5);
      expect(fieldUp(s, t.id)).toBe(true);
    }
    expect(s.round).toEqual({ phase: 'waiting', timer: 0, winner: null });
  });

  it('uses the fixed tower spots of a map recipe', () => {
    const s = createMatch(CROSSING.seed, worldOptionsFor('crossing', 2), { teams: 2 });
    expect(towersOf(s, 'team0').map((t) => ({ x: t.x, y: t.y }))).toEqual(CROSSING.towers[0]);
  });

  it('camp radius covers the tower ring', () => {
    expect(BASE_RADIUS).toBe(CAMP.radius);
    expect(CAMP.radius).toBeGreaterThan(CAMP.towerRing + CAMP.towerRadius);
  });

  it('can be turned off for legacy unit tests', () => {
    const s = createMatch(1, SMALL, { teams: 2, camps: false });
    expect(s.structures).toEqual([]);
  });
});
```

- [ ] **Step 2:** Run `npx vitest run tests/sim/camp.test.ts`. It fails: `camp.ts` doesn't exist.

- [ ] **Step 3: Implement `src/sim/camp.ts`:**

```ts
import type { GameState, Structure, StructureKind, Team, TeamState, Vec2, WeaponDef } from './types';
import { angleTo } from './math';

/** Camp and tower balance knobs (see the camp siege spec). */
export const CAMP = {
  /** Camp area: respawn, shop and healing (BASE_RADIUS). */
  radius: 220,
  buildingRadius: 40,
  buildingHp: 3000,
  towers: 5,
  towerRing: 170,
  towerRadius: 14,
  towerHp: 400,
  /** Seconds until a destroyed tower stands again. */
  towerRebuild: 90,
  /** The force field over the building is up while at least this many towers stand. */
  fieldMinTowers: 3,
  healPerSec: 8,
  /** Seconds without damage before the camp heals you. */
  healDelay: 3,
  towerBounty: 60,
  campBounty: 300,
  /** Turret turn rate, rad/s. */
  towerTurnSpeed: 3,
  /** Barrel length: bolts start this far from the tower centre. */
  towerMuzzle: 12,
} as const;

/** The tower turret: about 10 DPS. */
export const TOWER_GUN: WeaponDef = {
  id: 'towerGun',
  fireInterval: 0.4,
  projectileSpeed: 380,
  damage: 4,
  spread: 0.03,
  range: 280,
  projectileKind: 'bolt',
  projectileRadius: 2,
};

/** Default tower spots: evenly on a ring, the first facing `facing` (radians). */
export function towerRing(base: Vec2, facing: number): Vec2[] {
  return Array.from({ length: CAMP.towers }, (_, k) => {
    const a = facing + (k / CAMP.towers) * Math.PI * 2;
    return { x: Math.round(base.x + Math.cos(a) * CAMP.towerRing), y: Math.round(base.y + Math.sin(a) * CAMP.towerRing) };
  });
}

function makeStructure(state: GameState, team: Team, kind: StructureKind, x: number, y: number): Structure {
  const hp = kind === 'camp' ? CAMP.buildingHp : CAMP.towerHp;
  const centre = { x: state.world.width / 2, y: state.world.height / 2 };
  return {
    id: state.nextId++,
    team,
    kind,
    x,
    y,
    radius: kind === 'camp' ? CAMP.buildingRadius : CAMP.towerRadius,
    hp,
    maxHp: hp,
    angle: angleTo({ x, y }, centre),
    cooldown: 0,
    rebuildIn: 0,
    hitFlash: 0,
    target: null,
  };
}

/** Build a team's camp: the building at the base centre and its towers (map recipe spots, or a ring facing the centre). */
export function placeCamp(state: GameState, team: TeamState): void {
  const centre = { x: state.world.width / 2, y: state.world.height / 2 };
  const spots = state.world.towers?.[team.slot] ?? towerRing(team.base, angleTo(team.base, centre));
  state.structures.push(makeStructure(state, team.id, 'camp', team.base.x, team.base.y));
  for (const p of spots) state.structures.push(makeStructure(state, team.id, 'tower', p.x, p.y));
}

export function isStanding(s: Structure): boolean {
  return s.hp > 0;
}

export function campOf(state: GameState, team: Team): Structure | undefined {
  return state.structures.find((s) => s.team === team && s.kind === 'camp');
}

export function towersOf(state: GameState, team: Team): Structure[] {
  return state.structures.filter((s) => s.team === team && s.kind === 'tower');
}

export function standingTowers(state: GameState, team: Team): number {
  let n = 0;
  for (const s of state.structures) if (s.team === team && s.kind === 'tower' && s.hp > 0) n++;
  return n;
}

/** The force field over the camp building is up while enough towers stand. */
export function fieldUp(state: GameState, team: Team): boolean {
  return standingTowers(state, team) >= CAMP.fieldMinTowers;
}
```

- [ ] **Step 4: Wire it in.**
  - **`types.ts`:** add the types from **Interfaces**, plus `eliminated` on `TeamState`, and `structures`, `round` and `camps` on `GameState`.
  - **`players.ts`:**
    - `import { CAMP, placeCamp } from './camp';`
    - `export const BASE_RADIUS = CAMP.radius;` (keep the doc comment and say "camp area").
    - In `createTeam`: limit the loop to `state.world.bases.length` slots instead of `MAX_TEAMS`, and keep the `MAX_TEAMS` check. Create the team with `eliminated: false`, then `if (state.camps) placeCamp(state, team);`.
  - **`worldgen.ts`:** `BASE_CLEAR = 260` (it was 140, now camp radius + 40). `BASE_DRY` stays `BASE_CLEAR + 60`.
  - **`sim.ts`:**

```ts
export interface MatchOptions {
  /** Spawn and maintain wild dinosaurs (default false; the game server turns it on). */
  wildlife?: boolean;
  /** Create this many teams (with camps) right away. Default 0: tests add teams with createTeam. */
  teams?: number;
  /** Camps, towers and rounds (default true). Old unit tests about other systems turn them off. */
  camps?: boolean;
}

export function createMatch(seed: number, worldOpts?: WorldGenOptions, opts: MatchOptions = {}): GameState {
  const world = generateWorld(seed, worldOpts);
  const state: GameState = {
    tick: 0,
    rng: makeRng(seed),
    world,
    food: world.food.map((f) => ({ ...f })),
    dinos: [],
    projectiles: [],
    structures: [],
    events: [],
    nextId: 1,
    teams: [],
    players: [],
    wildlife: opts.wildlife ?? false,
    wildSpawnTimer: { t: 0 },
    camps: opts.camps ?? true,
    round: { phase: 'waiting', timer: 0, winner: null },
  };
  for (let i = 0; i < (opts.teams ?? 0); i++) createTeam(state);
  if (state.wildlife) populateWild(state);
  return state;
}
```

  Teams must exist before `populateWild`, so wild dinos don't spawn in camps. `spawnWild` uses `world.bases`, so this already holds.

- [ ] **Step 5:** Run `npx vitest run tests/sim/camp.test.ts`. It must pass.
- [ ] **Step 6:** Run `npm test`. Legacy tests that now fail **because a camp building or tower stands in the way** (a dino placed on a base, a projectile hitting a tower, …) and that aren't about camps get `camps: false` in their `createMatch` options, e.g. `createMatch(7, SMALL, { camps: false })`. Note in each test file's setup comment *why* camps are off. Fix the `teams.test.ts` slot test to use `s.world.bases.length`. Repeat until the suite is green.
- [ ] **Step 7:** Commit: `Task 3: camp buildings and towers, pre-made teams`.

---

## Task 4: Structures are solid, spawning avoids them

**Files:**
- Modify: `src/sim/systems/collision.ts` (`resolveObstacles`), `src/sim/players.ts` (`spawnPlayerDino`)
- Test: `tests/sim/camp.test.ts`

**Interfaces:**
- Consumes: `isStanding`, `CAMP` (Task 3)
- Produces: `structureBlocks(state, x, y, r): boolean` (exported from `collision.ts`)

- [ ] **Step 1: Write the failing tests** (append to `camp.test.ts`):

```ts
import { addPlayer } from '../../src/sim/players';
import { resolveObstacles, structureBlocks } from '../../src/sim/systems/collision';
import { getDino } from '../../src/sim/defs/dinos';

describe('solid structures', () => {
  it('pushes dinos out of a standing tower, not out of rubble', () => {
    const s = createMatch(2, SMALL, { teams: 2 });
    const p = addPlayer(s, 'team1', 'triceratops', 'A');
    const d = s.dinos.find((x) => x.playerId === p.id)!;
    const tower = towersOf(s, 'team0')[0];
    d.x = tower.x + 3;
    d.y = tower.y;
    resolveObstacles(s, d);
    expect(Math.hypot(d.x - tower.x, d.y - tower.y)).toBeGreaterThanOrEqual(tower.radius + getDino('triceratops').radius - 1e-6);
    tower.hp = 0;
    d.x = tower.x + 3;
    d.y = tower.y;
    resolveObstacles(s, d);
    expect(d.x).toBeCloseTo(tower.x + 3);
  });

  it('spawns riders in their camp but never on the building or a tower', () => {
    const s = createMatch(3, SMALL, { teams: 2 });
    for (let i = 0; i < 12; i++) {
      const p = addPlayer(s, 'team0', 'brontosaurus', `P${i}`);
      const d = s.dinos.find((x) => x.playerId === p.id)!;
      expect(structureBlocks(s, d.x, d.y, getDino('brontosaurus').radius)).toBe(false);
      expect(Math.hypot(d.x - s.teams[0].base.x, d.y - s.teams[0].base.y)).toBeLessThan(BASE_RADIUS);
    }
  });
});
```

- [ ] **Step 2:** Run the tests. They fail.

- [ ] **Step 3: Implement.** In `collision.ts`:

```ts
/** True if a circle overlaps a standing structure. */
export function structureBlocks(state: GameState, x: number, y: number, r: number): boolean {
  for (const s of state.structures) {
    if (s.hp <= 0) continue;
    const rr = s.radius + r;
    if ((s.x - x) ** 2 + (s.y - y) ** 2 < rr * rr) return true;
  }
  return false;
}
```

In `resolveObstacles`, after the `forEachObstacleNear` block and before the clamp, push the dino out of standing structures with the same code as for rocks:

```ts
  for (const s of state.structures) {
    if (s.hp <= 0) continue;
    const dx = d.x - s.x;
    const dy = d.y - s.y;
    const min = s.radius + r;
    const dd = dx * dx + dy * dy;
    if (dd >= min * min) continue;
    const dist = Math.sqrt(dd) || 0.0001;
    d.x += (dx / dist) * (min - dist);
    d.y += (dy / dist) * (min - dist);
    const headOn = Math.abs((Math.cos(d.heading) * dx + Math.sin(d.heading) * dy) / dist);
    d.speed *= 1 - 0.25 * headOn;
  }
```

At most 24 structures exist, so a linear loop is fine.

In `spawnPlayerDino`:
- spawn at `r = randRange(state.rng, 60, 140)` (it was `0 .. BASE_RADIUS * 0.6`);
- require `!structureBlocks(state, cx, cy, def.radius + 4)` in addition to `isFree`;
- raise the attempts to 40.

The old fallback was the base centre, which is now *inside the camp building*. Replace it: remember the first candidate that is `isFree` and clear of structures (even if crowded), and use it when no uncrowded spot turns up. Only if there is none at all, fall back to `team.base.x + 100, team.base.y` (between the building and the tower ring).

Import `structureBlocks` from `./systems/collision`. That module doesn't import `players`, so there is no import cycle.

- [ ] **Step 4:** Run `npm test`. It must be green.
- [ ] **Step 5:** Commit: `Task 4: structures are solid; riders spawn clear of them`.

---

## Task 5: Shooting structures, force field, no more safe zone

**Files:**
- Create: `src/sim/systems/structures.ts`, `src/sim/rounds.ts` (elimination only for now)
- Modify: `src/sim/systems/projectiles.ts`, `src/sim/systems/damage.ts`, `src/sim/types.ts` (events)
- Test: `tests/sim/siege.test.ts`; update `tests/sim/teams.test.ts` (the old safe-zone tests)

**Interfaces:**
- Consumes: `CAMP`, `fieldUp`, `isStanding`, `campOf` (Task 3)
- Produces:
  - Events, added to `GameEvent`:

```ts
  | { type: 'structureHit'; structureId: number; x: number; y: number; shielded: boolean }
  | { type: 'towerDown'; structureId: number; team: Team; by: number | null }
  | { type: 'towerUp'; structureId: number; team: Team }
  | { type: 'campDown'; team: Team; by: number | null }
  | { type: 'eliminated'; team: Team }
  | { type: 'roundWon'; team: Team | null }
  | { type: 'phase'; phase: RoundPhase }
```

  - `damageStructure(state, s, amount, sourceDinoId, x, y): 'hit' | 'shielded' | 'immune'`
  - `structureHitBy(state, x, y, r, team): Structure | undefined`
  - `structuresInArc(state, d, extra, dir, arc): Structure[]`
  - `rounds.ts`: `INTERMISSION = 15`, `liveTeams(state)`, `eliminateTeam(state, teamId)`
  - The `shot` event doc changes: `dinoId` is the structure id for tower shots, and `mount` is `-1` then.

- [ ] **Step 1: Write the failing tests** (`tests/sim/siege.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import type { GameState } from '../../src/sim/types';
import { createMatch } from '../../src/sim/sim';
import { addPlayer, isInOwnBase } from '../../src/sim/players';
import { CAMP, campOf, fieldUp, towersOf } from '../../src/sim/camp';
import { damageStructure } from '../../src/sim/systems/structures';
import { applyDamage } from '../../src/sim/systems/damage';
import { updateProjectiles } from '../../src/sim/systems/projectiles';
import { SMALL } from '../helpers';

function siege() {
  const s = createMatch(4, SMALL, { teams: 2 });
  const a = addPlayer(s, 'team0', 'triceratops', 'A');
  const b = addPlayer(s, 'team1', 'triceratops', 'B');
  const da = s.dinos.find((d) => d.playerId === a.id)!;
  const db = s.dinos.find((d) => d.playerId === b.id)!;
  s.round.phase = 'playing';
  return { s, a, b, da, db };
}

/** A bolt from `ownerId` placed right on top of (x, y), moving +x. */
function boltAt(s: GameState, ownerId: number, team: string, x: number, y: number) {
  s.projectiles.push({ id: s.nextId++, ownerId, team, x: x - 1, y, px: x - 1, py: y, vx: 60, vy: 0, traveled: 0, range: 500, damage: 50, radius: 2, kind: 'bolt', alive: true });
}

describe('siege', () => {
  it('structures cannot be damaged before the round is playing', () => {
    const { s, da } = siege();
    s.round.phase = 'waiting';
    const tower = towersOf(s, 'team1')[0];
    expect(damageStructure(s, tower, 100, da.id, tower.x, tower.y)).toBe('immune');
    expect(tower.hp).toBe(CAMP.towerHp);
  });

  it('hostile bullets damage towers; destroying one pays the shooter and starts the rebuild', () => {
    const { s, a, da } = siege();
    const tower = towersOf(s, 'team1')[0];
    tower.hp = 40;
    const money = a.money;
    boltAt(s, da.id, 'team0', tower.x - tower.radius, tower.y);
    updateProjectiles(s, 1 / 60);
    expect(tower.hp).toBe(0);
    expect(tower.rebuildIn).toBe(CAMP.towerRebuild);
    expect(a.money).toBe(money + CAMP.towerBounty);
    expect(s.events.some((e) => e.type === 'towerDown' && e.structureId === tower.id && e.by === a.id)).toBe(true);
  });

  it('friendly bullets pass through their own towers and building', () => {
    const { s, db } = siege();
    const tower = towersOf(s, 'team1')[0];
    boltAt(s, db.id, 'team1', tower.x, tower.y);
    updateProjectiles(s, 1 / 60);
    expect(tower.hp).toBe(CAMP.towerHp);
    expect(s.projectiles).toHaveLength(1);
  });

  it('the force field blocks hits on the building while 3 or more towers stand', () => {
    const { s, da } = siege();
    const camp = campOf(s, 'team1')!;
    expect(damageStructure(s, camp, 100, da.id, camp.x, camp.y)).toBe('shielded');
    expect(camp.hp).toBe(CAMP.buildingHp);
    const towers = towersOf(s, 'team1');
    towers[0].hp = towers[1].hp = 0;
    expect(fieldUp(s, 'team1')).toBe(true);
    towers[2].hp = 0;
    expect(fieldUp(s, 'team1')).toBe(false);
    expect(damageStructure(s, camp, 100, da.id, camp.x, camp.y)).toBe('hit');
    expect(camp.hp).toBe(CAMP.buildingHp - 100);
  });

  it('destroying the camp eliminates the team and ends a 2-team round', () => {
    const { s, a, da, db } = siege();
    for (const t of towersOf(s, 'team1')) t.hp = 0;
    const camp = campOf(s, 'team1')!;
    camp.hp = 10;
    damageStructure(s, camp, 50, da.id, camp.x, camp.y);
    const team1 = s.teams.find((t) => t.id === 'team1')!;
    expect(team1.eliminated).toBe(true);
    expect(db.alive).toBe(false);
    expect(s.round.phase).toBe('over');
    expect(s.round.winner).toBe('team0');
    expect(a.money).toBe(CAMP.campBounty);
    expect(s.events.map((e) => e.type)).toEqual(expect.arrayContaining(['campDown', 'eliminated', 'roundWon']));
  });

  it('riders in their own camp are no longer invincible, and shots no longer fizzle at the camp edge', () => {
    const { s, da, db } = siege();
    expect(isInOwnBase(s, db)).toBe(true);
    const hp = db.hp;
    applyDamage(s, db, 10, da.id);
    expect(db.hp).toBe(hp - 10);
    // A bolt inside the enemy camp (180 px out, clear of the towers) flies on instead of fizzling.
    const base = s.teams[1].base;
    boltAt(s, da.id, 'team0', base.x - 150, base.y - 100);
    updateProjectiles(s, 1 / 60);
    expect(s.projectiles.length).toBe(1);
  });
});
```

Delete or rewrite the old safe-zone tests in `teams.test.ts`: "riders in base are immune" and "hostile shots fizzle at the camp edge" (around line 82). Keep "spawns riders inside their own base".

- [ ] **Step 2:** Run `npx vitest run tests/sim/siege.test.ts`. It fails.

- [ ] **Step 3: Implement `src/sim/rounds.ts`** (Task 9 adds the phase machine):

```ts
import type { GameState, TeamState } from './types';
import { findTeam } from './world';
import { addCarcassFor } from './systems/feeding';

/** Seconds the result is shown before the next round. */
export const INTERMISSION = 15;

export function liveTeams(state: GameState): TeamState[] {
  return state.teams.filter((t) => !t.eliminated);
}

/**
 * Knock a team out: its structures fall for good, its riders die and can't respawn.
 * When at most one team is left in a playing round, the round is over.
 */
export function eliminateTeam(state: GameState, teamId: string): void {
  const team = findTeam(state, teamId);
  if (!team || team.eliminated) return;
  team.eliminated = true;
  for (const s of state.structures) {
    if (s.team !== teamId) continue;
    s.hp = 0;
    s.rebuildIn = 0;
    s.target = null;
  }
  for (const d of state.dinos) {
    if (!d.alive || d.team !== teamId) continue;
    d.alive = false;
    d.hp = 0;
    d.abilityT = -1;
    state.events.push({ type: 'death', dinoId: d.id, x: d.x, y: d.y, team: d.team });
    addCarcassFor(state, d);
  }
  for (const p of state.players) {
    if (p.team !== teamId) continue;
    p.dinoId = null;
    p.respawn = 0;
  }
  state.events.push({ type: 'eliminated', team: teamId });
  const live = liveTeams(state);
  if (state.round.phase === 'playing' && live.length <= 1) {
    const winner = live[0]?.id ?? null;
    state.round = { phase: 'over', timer: INTERMISSION, winner };
    state.events.push({ type: 'roundWon', team: winner });
    state.events.push({ type: 'phase', phase: 'over' });
  }
}
```

  Check that `addCarcassFor` is exported from `feeding.ts` (`damage.ts` already imports it).

- [ ] **Step 4: Implement `src/sim/systems/structures.ts`** (damage half; Task 7 adds the tower AI):

```ts
import type { Dino, GameState, PlayerState, Structure, Team } from '../types';
import { getDino } from '../defs/dinos';
import { angleDiff, angleTo } from '../math';
import { findDino, findPlayer } from '../world';
import { CAMP, fieldUp } from '../camp';
import { eliminateTeam } from '../rounds';

/** The rider whose dino dealt the damage (if it was a rider). */
function riderOf(state: GameState, sourceDinoId: number): PlayerState | undefined {
  const d = findDino(state, sourceDinoId);
  return d?.playerId != null ? findPlayer(state, d.playerId) : undefined;
}

function pay(state: GameState, p: PlayerState | undefined, amount: number, x: number, y: number): void {
  if (!p) return;
  p.money += amount;
  state.events.push({ type: 'bounty', playerId: p.id, amount, x, y });
}

/**
 * Damage a camp building or tower, hit at (x, y). Nothing happens outside a playing round,
 * and the camp building is shielded while its force field is up.
 */
export function damageStructure(state: GameState, s: Structure, amount: number, sourceDinoId: number, x: number, y: number): 'hit' | 'shielded' | 'immune' {
  if (s.hp <= 0) return 'immune';
  if (state.round.phase !== 'playing') {
    state.events.push({ type: 'structureHit', structureId: s.id, x, y, shielded: true });
    return 'immune';
  }
  if (s.kind === 'camp' && fieldUp(state, s.team)) {
    state.events.push({ type: 'structureHit', structureId: s.id, x, y, shielded: true });
    return 'shielded';
  }
  s.hp = Math.max(0, s.hp - amount);
  s.hitFlash = 0.12;
  state.events.push({ type: 'structureHit', structureId: s.id, x, y, shielded: false });
  if (s.hp > 0) return 'hit';
  const rider = riderOf(state, sourceDinoId);
  if (s.kind === 'tower') {
    s.rebuildIn = CAMP.towerRebuild;
    s.target = null;
    state.events.push({ type: 'towerDown', structureId: s.id, team: s.team, by: rider?.id ?? null });
    pay(state, rider, CAMP.towerBounty, s.x, s.y);
  } else {
    state.events.push({ type: 'campDown', team: s.team, by: rider?.id ?? null });
    pay(state, rider, CAMP.campBounty, s.x, s.y);
    eliminateTeam(state, s.team);
  }
  return 'hit';
}

/** The first standing structure of another team that a circle at (x, y, r) touches. */
export function structureHitBy(state: GameState, x: number, y: number, r: number, team: Team): Structure | undefined {
  for (const s of state.structures) {
    if (s.hp <= 0 || s.team === team) continue;
    const rr = s.radius + r;
    if ((s.x - x) ** 2 + (s.y - y) ** 2 < rr * rr) return s;
  }
  return undefined;
}

/**
 * Standing enemy structures within `extra` px of a dino's body, inside ±arc around `dir`,
 * nearest first. Wild dinos never attack structures (empty list).
 */
export function structuresInArc(state: GameState, d: Dino, extra: number, dir: number, arc: number): Structure[] {
  if (d.playerId === null) return [];
  const r = getDino(d.kind).radius;
  const out: { s: Structure; dist: number }[] = [];
  for (const s of state.structures) {
    if (s.hp <= 0 || s.team === d.team) continue;
    const dist = Math.hypot(s.x - d.x, s.y - d.y);
    if (dist > r + s.radius + extra) continue;
    if (arc < Math.PI && Math.abs(angleDiff(angleTo(d, s), dir)) > arc) continue;
    out.push({ s, dist });
  }
  return out.sort((a, b) => a.dist - b.dist).map((o) => o.s);
}
```

- [ ] **Step 5: Projectiles and damage.**
  - In `projectiles.ts`, delete the `// Other teams' base camps are shielded` loop and the `BASE_RADIUS` import. In their place, after the obstacle check, add:

```ts
    // Enemy camp buildings and towers stop the bolt (own-team structures let it through).
    const hitS = structureHitBy(state, p.x, p.y, p.radius, p.team);
    if (hitS) {
      p.alive = false;
      state.events.push({ type: 'impact', projectileId: p.id, x: p.x, y: p.y });
      damageStructure(state, hitS, p.damage, p.ownerId, p.x, p.y);
      continue;
    }
```

  - In `damage.ts`, remove `isInOwnBase(state, target)` from the guard (`if (!target.alive) return;`). Update the doc comment.
  - In `abilities.ts`, remove `|| isInOwnBase(state, b)` from `ram`, `whip` and `bite`, plus the import. Update their doc comments ("except those safe in their camp" goes away).
  - Fix the tests that relied on camp immunity: `trex.test.ts` ("camp immunity"), `abilities.test.ts` (`other` team camp test), `brontosaurus.test.ts` (`campTeam`). Change them to assert that the dino in its camp **is** hit now.

- [ ] **Step 6:** Run `npm test`. It must be green.
- [ ] **Step 7:** Commit: `Task 5: structures take damage, force field, camps no longer safe zones`.

---

## Task 6: Melee and abilities damage structures

**Files:**
- Modify: `src/sim/systems/melee.ts`, `src/sim/systems/abilities.ts`
- Test: `tests/sim/siege.test.ts`

**Interfaces:**
- Consumes: `structuresInArc`, `damageStructure` (Task 5)

- [ ] **Step 1: Write the failing tests** (append to `siege.test.ts`, reusing `siege()`):

```ts
import { updateMelee } from '../../src/sim/systems/melee';
import { tryStartAbility, updateAbility } from '../../src/sim/systems/abilities';
import { getDino } from '../../src/sim/defs/dinos';

describe('melee and abilities vs structures', () => {
  function faceTower(s: GameState, d: GameState['dinos'][number]) {
    const tower = towersOf(s, 'team1')[0];
    const r = getDino(d.kind).radius;
    d.x = tower.x - tower.radius - r - 2;
    d.y = tower.y;
    d.heading = 0;
    return tower;
  }

  it('a rider gores a tower in front of it', () => {
    const { s, da } = siege();
    const tower = faceTower(s, da);
    updateMelee(s, 1 / 60);
    expect(tower.hp).toBe(CAMP.towerHp - getDino('triceratops').melee.damage);
  });

  it('a triceratops dash rams a tower once', () => {
    const { s, da } = siege();
    const tower = faceTower(s, da);
    da.x -= 20;
    tryStartAbility(s, da, { throttle: 1, turn: 0, aimWorld: { x: tower.x, y: tower.y }, fire: false, ability: true });
    for (let i = 0; i < 30; i++) updateAbility(s, da, 1 / 60);
    expect(tower.hp).toBe(CAMP.towerHp - getDino('triceratops').ability!.damage);
  });

  it('wild dinos never damage structures', () => {
    const { s, da } = siege();
    da.playerId = null;
    const tower = faceTower(s, da);
    updateMelee(s, 1 / 60);
    expect(tower.hp).toBe(CAMP.towerHp);
  });
});
```

The dash test needs the dash to reach the tower within 0.5 s. If it doesn't, move the dino closer rather than changing the dash.

- [ ] **Step 2:** Run the tests. They fail.

- [ ] **Step 3: Implement.**
  - **`melee.ts`:** after the dino search loop, replace `if (!best) continue;` with:

```ts
    if (!best) {
      // Riders also hack at enemy camp buildings and towers right in front of them.
      const s = structuresInArc(state, a, def.melee.reach, a.heading, def.melee.arc)[0];
      if (!s) continue;
      a.meleeCooldown = def.melee.interval;
      const ang = angleTo(a, s);
      damageStructure(state, s, def.melee.damage * a.damageMul, a.id, s.x - Math.cos(ang) * s.radius, s.y - Math.sin(ang) * s.radius);
      continue;
    }
```

  - **`abilities.ts`:** after each dino loop add the structure hits. `d.abilityHit` may hold structure ids: they come from the same `nextId` sequence, so they never clash with dino ids.

```ts
  // ram (after its dino loop):
  for (const s of structuresInArc(state, d, ab.hitReach, d.heading, DASH_ARC)) {
    if (d.abilityHit.includes(s.id)) continue;
    d.abilityHit.push(s.id);
    damageStructure(state, s, ab.damage * d.damageMul, d.id, (d.x + s.x) / 2, (d.y + s.y) / 2);
  }
  // whip:
  for (const s of structuresInArc(state, d, ab.hitReach, back, ab.arc ?? Math.PI / 2)) {
    if (d.abilityHit.includes(s.id)) continue;
    d.abilityHit.push(s.id);
    damageStructure(state, s, ab.damage * d.damageMul, d.id, s.x, s.y);
  }
  // land (leap slam, all around):
  for (const s of structuresInArc(state, d, ab.hitReach, 0, Math.PI)) damageStructure(state, s, ab.damage * d.damageMul, d.id, s.x, s.y);
```

  In `bite`, change `if (!best) return;` to:

```ts
  if (!best) {
    const s = structuresInArc(state, d, jaw - def.radius + ab.hitReach, d.heading, ab.arc ?? Math.PI / 4)[0];
    if (s) damageStructure(state, s, ab.damage * d.damageMul, d.id, x, y);
    return;
  }
```

  `bite`'s miss event is already pushed with `targetId: null`. Leave it as is: the client draws the dust or sparks from `structureHit`.

- [ ] **Step 4:** Run `npm test`. It must be green.
- [ ] **Step 5:** Commit: `Task 6: melee and abilities damage enemy structures`.

---

## Task 7: Tower turrets and rebuilding

**Files:**
- Modify: `src/sim/systems/structures.ts` (add `updateStructures`), `src/sim/sim.ts` (call it)
- Test: `tests/sim/towers.test.ts`

**Interfaces:**
- Consumes: `TOWER_GUN`, `CAMP`, `dinosNear`, `buildDinoGrid`, `isAirborne`
- Produces: `updateStructures(state: GameState, dt: number): void`, `isAggressiveWild(d: Dino): boolean`

- [ ] **Step 1: Write the failing tests** (`tests/sim/towers.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { WILD_TEAM, type GameState } from '../../src/sim/types';
import { createMatch, step } from '../../src/sim/sim';
import { addPlayer } from '../../src/sim/players';
import { createDino } from '../../src/sim/world';
import { makeWildAi } from '../../src/sim/ai';
import { CAMP, TOWER_GUN, towersOf } from '../../src/sim/camp';
import { eliminateTeam } from '../../src/sim/rounds';
import { SMALL } from '../helpers';

const DT = 1 / 60;
const run = (s: GameState, sec: number) => {
  for (let i = 0; i < Math.round(sec * 60); i++) step(s, new Map(), DT);
};

function arena() {
  const s = createMatch(6, { ...SMALL, water: false }, { teams: 2 });
  // Both teams staffed (riders sit in their own camps), so no camp collapses for being empty.
  addPlayer(s, 'team0', 'triceratops', 'X');
  addPlayer(s, 'team1', 'triceratops', 'Y');
  s.round.phase = 'playing';
  const tower = towersOf(s, 'team1')[0];
  return { s, tower };
}

/** Put a dino 150 px from the tower, on the side away from the camp, standing still. */
function near(s: GameState, tower: { x: number; y: number }, d: { x: number; y: number; px: number; py: number }) {
  const base = s.teams[1].base;
  const a = Math.atan2(tower.y - base.y, tower.x - base.x);
  d.x = d.px = tower.x + Math.cos(a) * 150;
  d.y = d.py = tower.y + Math.sin(a) * 150;
}

describe('towers', () => {
  it('shoot an enemy rider in range', () => {
    const { s, tower } = arena();
    const p = addPlayer(s, 'team0', 'triceratops', 'A');
    const d = s.dinos.find((x) => x.playerId === p.id)!;
    near(s, tower, d);
    const hp = d.hp;
    run(s, 3);
    expect(d.hp).toBeLessThan(hp);
    expect(tower.target).toBe(d.id);
  });

  it('ignore their own riders and grazing herbivores, but shoot wild carnivores', () => {
    const { s, tower } = arena();
    const own = addPlayer(s, 'team1', 'triceratops', 'B');
    const od = s.dinos.find((x) => x.playerId === own.id)!;
    near(s, tower, od);
    const herb = createDino(s, 'triceratops', WILD_TEAM, 0, 0);
    herb.ai = makeWildAi(s);
    herb.ai.mode = 'graze';
    near(s, tower, herb);
    herb.x += 40;
    run(s, 1);
    expect(tower.target).toBeNull();
    const raptor = createDino(s, 'velociraptor', WILD_TEAM, 0, 0);
    raptor.ai = makeWildAi(s);
    near(s, tower, raptor);
    raptor.x -= 40;
    run(s, 0.5);
    expect(tower.target).toBe(raptor.id);
  });

  it('rebuild 90 s after being destroyed, unless the team is out', () => {
    const { s, tower } = arena();
    tower.hp = 0;
    tower.rebuildIn = CAMP.towerRebuild;
    run(s, CAMP.towerRebuild - 1);
    expect(tower.hp).toBe(0);
    run(s, 2);
    expect(tower.hp).toBe(CAMP.towerHp);
    const t2 = towersOf(s, 'team0')[0];
    eliminateTeam(s, 'team0');
    t2.rebuildIn = 1;
    run(s, 2);
    expect(t2.hp).toBe(0);
  });

  it('a destroyed tower does not fire', () => {
    const { s, tower } = arena();
    tower.hp = 0;
    tower.rebuildIn = 50;
    const p = addPlayer(s, 'team0', 'triceratops', 'A');
    near(s, tower, s.dinos.find((x) => x.playerId === p.id)!);
    run(s, 1);
    expect(s.projectiles.filter((q) => q.ownerId === tower.id)).toHaveLength(0);
  });

  it('wild AI tolerates a tower attacker', () => {
    const { s, tower } = arena();
    const herb = createDino(s, 'triceratops', WILD_TEAM, 0, 0);
    herb.ai = makeWildAi(s);
    herb.ai.mode = 'charge';
    near(s, tower, herb);
    expect(() => run(s, 10)).not.toThrow();
  });

  it('fires at about 10 DPS', () => {
    expect(TOWER_GUN.damage / TOWER_GUN.fireInterval).toBeCloseTo(10, 0);
  });
});
```

- [ ] **Step 2:** Run `npx vitest run tests/sim/towers.test.ts`. It fails: there is no `updateStructures`.

- [ ] **Step 3: Implement** (append to `structures.ts`, merging these imports with the ones from Task 5):

```ts
import { WILD_TEAM } from '../types';
import { TOWER_GUN } from '../camp';
import { clamp, wrapAngle } from '../math';
import { rand } from '../rng';
import { findTeam, isAirborne } from '../world';
import { buildDinoGrid, dinosNear } from '../spatial';

const near: number[] = [];

/** Wild dinos that go for riders: carnivores, and herbivores charging after being provoked. */
export function isAggressiveWild(d: Dino): boolean {
  return d.team === WILD_TEAM && (getDino(d.kind).diet === 'carnivore' || d.ai?.mode === 'charge');
}

/** Nearest enemy rider or aggressive wild dino in gun range. */
function towerTarget(state: GameState, s: Structure): Dino | undefined {
  let best: Dino | undefined;
  let bestD = TOWER_GUN.range * TOWER_GUN.range;
  for (const j of dinosNear(state, s.x, s.y, TOWER_GUN.range, near)) {
    const d = state.dinos[j];
    if (!d.alive || d.team === s.team || isAirborne(d)) continue;
    if (d.playerId === null && !isAggressiveWild(d)) continue;
    const dd = (d.x - s.x) ** 2 + (d.y - s.y) ** 2;
    if (dd >= bestD) continue;
    best = d;
    bestD = dd;
  }
  return best;
}

function fireTower(state: GameState, s: Structure): void {
  const angle = s.angle + (rand(state.rng) * 2 - 1) * TOWER_GUN.spread;
  const x = s.x + Math.cos(s.angle) * CAMP.towerMuzzle;
  const y = s.y + Math.sin(s.angle) * CAMP.towerMuzzle;
  const vx = Math.cos(angle) * TOWER_GUN.projectileSpeed;
  const vy = Math.sin(angle) * TOWER_GUN.projectileSpeed;
  const id = state.nextId++;
  state.projectiles.push({ id, ownerId: s.id, team: s.team, x, y, px: x, py: y, vx, vy, traveled: 0, range: TOWER_GUN.range, damage: TOWER_GUN.damage, radius: TOWER_GUN.projectileRadius, kind: 'bolt', alive: true });
  s.cooldown = TOWER_GUN.fireInterval;
  state.events.push({ type: 'shot', dinoId: s.id, mount: -1, projectileId: id, team: s.team, x, y, vx, vy, range: TOWER_GUN.range });
}

/** Hit flashes, tower rebuilds, and tower turrets tracking and shooting their nearest target. */
export function updateStructures(state: GameState, dt: number): void {
  buildDinoGrid(state);
  for (const s of state.structures) {
    s.hitFlash = Math.max(0, s.hitFlash - dt);
    if (s.kind !== 'tower') continue;
    if (s.hp <= 0) {
      if (s.rebuildIn <= 0 || findTeam(state, s.team)?.eliminated) continue;
      s.rebuildIn -= dt;
      if (s.rebuildIn <= 0) {
        s.rebuildIn = 0;
        s.hp = s.maxHp;
        state.events.push({ type: 'towerUp', structureId: s.id, team: s.team });
      }
      continue;
    }
    s.cooldown = Math.max(0, s.cooldown - dt);
    const target = towerTarget(state, s);
    s.target = target?.id ?? null;
    if (!target) continue;
    // Lead the target: aim where it will be when the bolt arrives.
    const t = Math.hypot(target.x - s.x, target.y - s.y) / TOWER_GUN.projectileSpeed;
    const aim = { x: target.x + Math.cos(target.heading) * target.speed * t, y: target.y + Math.sin(target.heading) * target.speed * t };
    const diff = angleDiff(angleTo(s, aim), s.angle);
    const turn = CAMP.towerTurnSpeed * dt;
    s.angle = wrapAngle(s.angle + clamp(diff, -turn, turn));
    if (Math.abs(diff) < 0.12 && s.cooldown <= 0) fireTower(state, s);
  }
}
```

In `sim.ts` `step`, call `updateStructures(state, dt);` right after `updateMelee(state, dt);` and before the obstacle re-resolve. The tower bolts then fly in the same tick's `updateProjectiles`.

When a tower shoots a wild dino, `applyDamage` sets `lastAttacker` to the tower's id. Check how `ai.ts` uses `lastAttacker`/`target` (`findDino(...)` can return `undefined`) and make sure every use handles `undefined`. The "tolerates a tower attacker" test covers this.

- [ ] **Step 4:** Run `npm test`. It must be green.
- [ ] **Step 5:** Commit: `Task 7: tower turrets and rebuilding`.

---

## Task 8: Camp perks: healing aura and the bigger camp

**Files:**
- Modify: `src/sim/players.ts` (`updatePlayers` → healing), `src/sim/ai.ts` (`avoidBases` comment only; it uses `BASE_RADIUS`)
- Test: `tests/sim/camp.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
import { step } from '../../src/sim/sim';
describe('healing aura', () => {
  it('heals riders in their standing camp once they have not been hit for 3 s', () => {
    const s = createMatch(8, SMALL, { teams: 2 });
    const p = addPlayer(s, 'team0', 'triceratops', 'A');
    const d = s.dinos.find((x) => x.playerId === p.id)!;
    d.hp = 50;
    d.sinceHit = 0;
    for (let i = 0; i < 120; i++) step(s, new Map(), 1 / 60);
    expect(d.hp).toBe(50);
    for (let i = 0; i < 120; i++) step(s, new Map(), 1 / 60);
    expect(d.hp).toBeGreaterThan(50 + CAMP.healPerSec * 0.9);
    campOf(s, 'team0')!.hp = 0;
    const before = d.hp;
    for (let i = 0; i < 60; i++) step(s, new Map(), 1 / 60);
    expect(d.hp).toBe(before);
  });
});
```

The test doesn't depend on round phases, because healing works in any phase.

- [ ] **Step 2:** Run the test. It fails.
- [ ] **Step 3: Implement** in `players.ts`:

```ts
/** Your own standing camp patches you up once nobody has hit you for a moment. */
function healInCamps(state: GameState, dt: number): void {
  if (!state.camps) return;
  for (const d of state.dinos) {
    if (!d.alive || d.playerId === null || d.hp >= d.maxHp || d.sinceHit < CAMP.healDelay) continue;
    const camp = campOf(state, d.team);
    if (!camp || camp.hp <= 0 || !isInOwnBase(state, d)) continue;
    d.hp = Math.min(d.maxHp, d.hp + CAMP.healPerSec * dt);
  }
}
```

  Call it at the end of `updatePlayers`. `sinceHit` grows in `step` after `updatePlayers`, which is fine.

- [ ] **Step 4:** Run `npm test`, then commit: `Task 8: healing aura in your own camp`.

---

## Task 9: Round phases, elimination by absence, switching teams

**Files:**
- Modify: `src/sim/rounds.ts` (phase machine, `switchTeam`), `src/sim/players.ts` (`updatePlayers`: no team dissolution, no respawn when eliminated), `src/sim/sim.ts` (call `updateRound`)
- Test: `tests/sim/rounds.test.ts`; rewrite the dissolve test in `tests/sim/teams.test.ts`

**Interfaces:**
- Produces:
  - `COUNTDOWN = 5`
  - `updateRound(state, dt): void`
  - `switchTeam(state, playerId, teamId, kind): 'ok' | 'not-eliminated' | 'bad-team'`

- [ ] **Step 1: Write the failing tests** (`tests/sim/rounds.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import type { GameState } from '../../src/sim/types';
import { createMatch, step } from '../../src/sim/sim';
import { RESPAWN_TIME, TEAM_EMPTY_TIMEOUT, addPlayer, removePlayer } from '../../src/sim/players';
import { COUNTDOWN, eliminateTeam, switchTeam } from '../../src/sim/rounds';
import { campOf } from '../../src/sim/camp';
import { tryStartAbility } from '../../src/sim/systems/abilities';
import { SMALL } from '../helpers';

const run = (s: GameState, sec: number) => {
  for (let i = 0; i < Math.round(sec * 60); i++) step(s, new Map(), 1 / 60);
};

describe('rounds', () => {
  it('waits until every team has a rider, then counts down and starts', () => {
    const s = createMatch(1, SMALL, { teams: 3 });
    addPlayer(s, 'team0', 'triceratops', 'A');
    addPlayer(s, 'team1', 'triceratops', 'B');
    run(s, 2);
    expect(s.round.phase).toBe('waiting');
    addPlayer(s, 'team2', 'triceratops', 'C');
    run(s, 0.1);
    expect(s.round.phase).toBe('countdown');
    run(s, COUNTDOWN);
    expect(s.round.phase).toBe('playing');
  });

  it('falls back to waiting if a team empties during the countdown', () => {
    const s = createMatch(1, SMALL, { teams: 2 });
    addPlayer(s, 'team0', 'triceratops', 'A');
    const b = addPlayer(s, 'team1', 'triceratops', 'B');
    run(s, 1);
    removePlayer(s, b.id);
    run(s, 0.1);
    expect(s.round.phase).toBe('waiting');
  });

  it('collapses the camp of a team that stays empty during the round', () => {
    const s = createMatch(1, SMALL, { teams: 2 });
    addPlayer(s, 'team0', 'triceratops', 'A');
    const b = addPlayer(s, 'team1', 'triceratops', 'B');
    run(s, COUNTDOWN + 0.5);
    removePlayer(s, b.id);
    run(s, TEAM_EMPTY_TIMEOUT - 1);
    expect(campOf(s, 'team1')!.hp).toBeGreaterThan(0);
    run(s, 2);
    expect(campOf(s, 'team1')!.hp).toBe(0);
    expect(s.round.phase).toBe('over');
    expect(s.round.winner).toBe('team0');
    // Teams no longer dissolve.
    expect(s.teams).toHaveLength(2);
  });

  it('keeps eliminated riders dead, until they switch to a surviving team', () => {
    const s = createMatch(1, SMALL, { teams: 3 });
    addPlayer(s, 'team0', 'triceratops', 'A');
    const b = addPlayer(s, 'team1', 'velociraptor', 'B');
    addPlayer(s, 'team2', 'triceratops', 'C');
    run(s, COUNTDOWN + 0.5);
    eliminateTeam(s, 'team1');
    run(s, RESPAWN_TIME + 1);
    expect(b.dinoId).toBeNull();
    expect(switchTeam(s, b.id, 'team1', 'trex')).toBe('bad-team');
    expect(switchTeam(s, b.id, 'team2', 'trex')).toBe('ok');
    run(s, RESPAWN_TIME + 0.1);
    const d = s.dinos.find((x) => x.playerId === b.id)!;
    expect(d.team).toBe('team2');
    expect(d.kind).toBe('trex');
  });

  it('a rider whose camp still stands cannot switch', () => {
    const s = createMatch(1, SMALL, { teams: 2 });
    const a = addPlayer(s, 'team0', 'triceratops', 'A');
    expect(switchTeam(s, a.id, 'team1', 'trex')).toBe('not-eliminated');
  });

  it('elimination kills riders mid-leap cleanly', () => {
    const s = createMatch(1, { ...SMALL, water: false }, { teams: 3 });
    const a = addPlayer(s, 'team1', 'velociraptor', 'A');
    addPlayer(s, 'team0', 'triceratops', 'B');
    addPlayer(s, 'team2', 'triceratops', 'C');
    run(s, COUNTDOWN + 0.5);
    const d = s.dinos.find((x) => x.playerId === a.id)!;
    tryStartAbility(s, d, { throttle: 1, turn: 0, aimWorld: { x: d.x + 100, y: d.y }, fire: false, ability: true });
    step(s, new Map(), 1 / 60);
    eliminateTeam(s, 'team1');
    expect(() => run(s, 2)).not.toThrow();
    expect(s.dinos.some((x) => x.playerId === a.id)).toBe(false);
    expect(s.round.phase).toBe('playing');
  });
});
```

Replace the `'dissolves a team after it has been empty …'` test in `teams.test.ts` with an assertion that the team stays: `expect(s.teams).toHaveLength(2)`.

- [ ] **Step 2:** Run the tests. They fail.

- [ ] **Step 3: Implement** (append to `rounds.ts`):

```ts
import { RESPAWN_TIME, TEAM_EMPTY_TIMEOUT } from './players';
import { findPlayer } from './world';

/** Seconds from "every team has a rider" to the start of the round. */
export const COUNTDOWN = 5;

function setPhase(state: GameState, phase: GameState['round']['phase'], timer: number): void {
  state.round.phase = phase;
  state.round.timer = timer;
  state.events.push({ type: 'phase', phase });
}

/** waiting → countdown → playing → over. Empty teams lose their camp during a round. */
export function updateRound(state: GameState, dt: number): void {
  if (!state.camps) return;
  const r = state.round;
  const staffed = state.teams.length >= 2 && state.teams.every((t) => state.players.some((p) => p.team === t.id));
  if (r.phase === 'waiting') {
    if (staffed) setPhase(state, 'countdown', COUNTDOWN);
  } else if (r.phase === 'countdown') {
    if (!staffed) return setPhase(state, 'waiting', 0);
    r.timer -= dt;
    if (r.timer <= 0) setPhase(state, 'playing', 0);
  } else if (r.phase === 'playing') {
    for (const t of state.teams) {
      // One elimination may end the round: then nobody else falls this tick.
      if (state.round.phase !== 'playing') break;
      if (t.eliminated || t.emptyFor < TEAM_EMPTY_TIMEOUT) continue;
      state.events.push({ type: 'campDown', team: t.id, by: null });
      eliminateTeam(state, t.id);
    }
  } else {
    r.timer = Math.max(0, r.timer - dt);
  }
}

/** An eliminated rider joins a surviving team (with a new mount) and respawns in its camp. */
export function switchTeam(state: GameState, playerId: number, teamId: string, kind: string): 'ok' | 'not-eliminated' | 'bad-team' {
  const p = findPlayer(state, playerId);
  if (!p || !findTeam(state, p.team)?.eliminated) return 'not-eliminated';
  const to = findTeam(state, teamId);
  if (!to || to.eliminated) return 'bad-team';
  p.team = to.id;
  p.kind = kind;
  p.dinoId = null;
  p.respawn = RESPAWN_TIME;
  to.emptyFor = 0;
  return 'ok';
}
```

  **Import cycle:** `players.ts` → `camp.ts` is fine, but if `players.ts` and `rounds.ts` import each other's *values* at module level, the ESM cycle can leave a binding undefined. They are used only inside functions, so the cycle is harmless. If tsx or vitest still reports `undefined`, move `RESPAWN_TIME` and `TEAM_EMPTY_TIMEOUT` into `camp.ts` and re-export them from `players.ts`.

  **`players.ts` `updatePlayers`:**

```ts
export function updatePlayers(state: GameState, dt: number): void {
  for (const p of state.players) {
    if (p.dinoId !== null || findTeam(state, p.team)?.eliminated) continue;
    p.respawn -= dt;
    if (p.respawn <= 0) spawnPlayerDino(state, p);
  }
  for (const t of state.teams) t.emptyFor = state.players.some((p) => p.team === t.id) ? 0 : t.emptyFor + dt;
  healInCamps(state, dt);
}
```

  Update the `TEAM_EMPTY_TIMEOUT` doc comment: "During a round, a team with no players loses its camp after this many seconds."

  **`sim.ts`:** call `updateRound(state, dt);` right after `updatePlayers(state, dt);`.

- [ ] **Step 4:** Run `npm test`. Fix legacy tests that ran long with 2 staffed teams and now see a round start (that is harmless) or an elimination (pass `camps: false` if the test isn't about rounds).
- [ ] **Step 5:** Commit: `Task 9: round phases, elimination of empty teams, switching teams`.

---

## Task 10: Protocol 4

**Files:**
- Modify: `src/net/protocol.ts`
- Test: `tests/net/protocol.test.ts`

**Interfaces:**
- Consumes: `RoundSettings`, `validSettings`, `MapInfo` (Task 2), `Structure`, `RoundState`, `fieldUp`
- Produces:

```ts
export const PROTOCOL_VERSION = 4;
export type ClientMsg =
  | { t: 'join'; team: string; kind: string; setup?: RoundSettings }
  | { t: 'switch'; team: string; kind: string }
  | { t: 'input'; seq: number; input: InputCommand }
  | { t: 'buy'; stat: UpgradeStat };
export type StructureTuple = [id: number, team: string, kind: 0 | 1, x: number, y: number, hp: number, maxHp: number, angle: number, flags: number, rebuildIn: number];
export interface StructureInfo { id: number; team: string; kind: StructureKind; x: number; y: number; hp: number; maxHp: number; angle: number; hitFlash: boolean; field: boolean; rebuildIn: number }
export interface RoundInfo { phase: RoundPhase; timer: number; winner: string | null }
export function encodeStructure(state: GameState, s: Structure): StructureTuple;
export function decodeStructure(t: StructureTuple): StructureInfo;
export function roundInfo(state: GameState): RoundInfo;
// TeamInfo gains: eliminated: boolean
// WelcomeMsg gains: map: string; teams: number; tiles: number
// SnapshotMsg gains: structures: StructureTuple[]; round?: RoundInfo
// SnapshotChanges gains: round?: RoundInfo | null
// LobbyInfo: { protocol, setup: RoundSettings | null, maps: MapInfo[], phase: RoundPhase | null, teams, canJoin, players, maxPlayers, species }  (canCreateTeam removed)
```

`NEW_TEAM` is **removed**.

- [ ] **Step 1: Write the failing tests** (append to `protocol.test.ts`). Its `createMatch(3)` calls already got `SMALL` in Task 1.

```ts
import { decodeStructure, encodeStructure, parseClientMsg, roundInfo, buildSnapshot, teamInfos, PROTOCOL_VERSION } from '../../src/net/protocol';
import { towersOf } from '../../src/sim/camp';

describe('protocol 4', () => {
  it('round-trips structures, including the force field flag', () => {
    const s = createMatch(3, SMALL, { teams: 2 });
    const tower = towersOf(s, 'team1')[0];
    tower.hp = 123.4;
    tower.angle = 1.234;
    tower.rebuildIn = 0;
    const back = decodeStructure(encodeStructure(s, tower));
    expect(back).toMatchObject({ id: tower.id, team: 'team1', kind: 'tower', x: tower.x, y: tower.y, hp: 124, maxHp: 400, field: false });
    expect(back.angle).toBeCloseTo(1.234, 2);
    const camp = s.structures.find((x) => x.kind === 'camp' && x.team === 'team1')!;
    expect(decodeStructure(encodeStructure(s, camp)).field).toBe(true);
  });

  it('puts structures and the round into snapshots, and marks eliminated teams', () => {
    const s = createMatch(3, SMALL, { teams: 2 });
    s.teams[1].eliminated = true;
    const snap = buildSnapshot(s, []);
    expect(snap.structures).toHaveLength(12);
    expect(snap.round).toEqual({ phase: 'waiting', timer: 0, winner: null });
    expect(teamInfos(s)[1].eliminated).toBe(true);
    expect(buildSnapshot(s, [], { round: null }).round).toBeUndefined();
    expect(roundInfo(s).phase).toBe('waiting');
  });

  it('parses join with a setup, and switch', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'join', team: 'team0', kind: 'trex', setup: { teams: 2, map: 'crossing' } }))).toEqual({ t: 'join', team: 'team0', kind: 'trex', setup: { teams: 2, map: 'crossing' } });
    expect(parseClientMsg(JSON.stringify({ t: 'join', team: 'team0', kind: 'trex', setup: { teams: 4, map: 'crossing' } }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'join', team: 'team0', kind: 'trex' }))).toEqual({ t: 'join', team: 'team0', kind: 'trex' });
    expect(parseClientMsg(JSON.stringify({ t: 'switch', team: 'team1', kind: 'velociraptor' }))).toEqual({ t: 'switch', team: 'team1', kind: 'velociraptor' });
    expect(parseClientMsg(JSON.stringify({ t: 'switch', team: 7, kind: 'x' }))).toBeNull();
    expect(PROTOCOL_VERSION).toBe(4);
  });
});
```

Fix the existing protocol tests' `createTeam` usage if needed: teams can still be created with `createTeam`.

- [ ] **Step 2:** Run the tests. They fail.

- [ ] **Step 3: Implement** in `protocol.ts`:
  - **`parseClientMsg` → `join`:** after the string checks:

```ts
    if (o.setup === undefined) return { t: 'join', team: o.team, kind: o.kind };
    const st = o.setup as Record<string, unknown> | null;
    const setup = st && typeof st === 'object' ? validSettings(st.teams, st.map) : null;
    return setup ? { t: 'join', team: o.team, kind: o.kind, setup } : null;
```

  - **`switch`:** same string checks as `join` (both are strings, at most 32 characters).
  - **Encoders:**

```ts
export function encodeStructure(state: GameState, s: Structure): StructureTuple {
  const field = s.kind === 'camp' && s.hp > 0 && fieldUp(state, s.team);
  return [s.id, s.team, s.kind === 'camp' ? 0 : 1, Math.round(s.x), Math.round(s.y), Math.ceil(s.hp), s.maxHp, q(s.angle, 1000), (s.hitFlash > 0 ? 1 : 0) | (field ? 2 : 0), Math.ceil(s.rebuildIn)];
}

export function decodeStructure(t: StructureTuple): StructureInfo {
  const [id, team, kind, x, y, hp, maxHp, angle, flags, rebuildIn] = t;
  return { id, team, kind: kind === 0 ? 'camp' : 'tower', x, y, hp, maxHp, angle: angle / 1000, hitFlash: (flags & 1) !== 0, field: (flags & 2) !== 0, rebuildIn };
}

export function roundInfo(state: GameState): RoundInfo {
  return { phase: state.round.phase, timer: Math.ceil(state.round.timer), winner: state.round.winner };
}
```

  - **`buildSnapshot`:**
    - add `structures: state.structures.map((s) => encodeStructure(state, s))`;
    - `const round = changes.round === undefined ? roundInfo(state) : changes.round;` then `...(round ? { round } : {})`.
  - **`teamInfos`:** add `eliminated: t.eliminated`.
  - **`WelcomeMsg`:** add the three fields, documented. **`LobbyInfo`:** change as listed. Remove `NEW_TEAM`.

- [ ] **Step 4:** Run `npx tsc --noEmit`. It reports every place that used `NEW_TEAM` or `canCreateTeam` (`match.ts`, `JoinScene.ts`). Those are fixed in Tasks 11 and 12, so tsc errors there are expected until then. Run `npx vitest run tests/net`. It must pass.
- [ ] **Step 5:** Commit: `Task 10: protocol 4 (structures, round, setup, switch)`.

---

## Task 11: Match: settings, rounds, carry-over, reset

**Files:**
- Modify: `src/server/match.ts`, `src/server/main.ts`
- Test: `tests/server/match.test.ts`

**Interfaces:**
- Consumes: everything above
- Produces:
  - `new Match(seed, { wildlife?, preset?: RoundSettings, tiles?: number })`
  - `match.state: GameState | null`
  - `match.settings: RoundSettings | null`
  - `match.tick()`, `match.lobby()`
  - Env: `TEAMS`, `MAP`

- [ ] **Step 1: Update the server tests' helpers and write the failing tests.**
  - In `startServer`, use `new Match(1234, { wildlife: false, tiles: 256 })`.
  - Change every existing `a.send({ t: 'join', team: NEW_TEAM, … })` to `a.send({ t: 'join', team: 'team0', kind: 'triceratops', setup: { teams: 2, map: 'random' } })`. The second client in the old "two players" test joins `'team1'`.
  - Drop the `NEW_TEAM` import.

  Then add:

```ts
  it('the first join sets up the round; a second setup is ignored', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: 'team1', kind: 'triceratops', setup: { teams: 3, map: 'random' } });
    const wa = await a.waitFor<WelcomeMsg>((m) => m.t === 'welcome');
    expect([wa.teams, wa.map, wa.tiles]).toEqual([3, 'random', 256]);
    const b = await client(host);
    b.send({ t: 'join', team: 'team2', kind: 'triceratops', setup: { teams: 2, map: 'crossing' } });
    const wb = await b.waitFor<WelcomeMsg>((m) => m.t === 'welcome');
    expect(wb.teams).toBe(3);
    expect(match!.settings).toEqual({ teams: 3, map: 'random' });
  });

  it('refuses a join without a setup while the server has none', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: 'team0', kind: 'triceratops' });
    const err = await a.waitFor((m) => m.t === 'error');
    expect((err as { message: string }).message).toMatch(/CHOOSE/);
  });

  it('starts a new round after the intermission and keeps everyone on their team', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: 'team0', kind: 'triceratops', setup: { teams: 2, map: 'random' } });
    const w1 = await a.waitFor<WelcomeMsg>((m) => m.t === 'welcome');
    const s1 = match!.state!;
    s1.round = { phase: 'over', timer: 0, winner: 'team0' };
    await ticks(1);
    const welcomes = a.msgs.filter((m) => m.t === 'welcome') as WelcomeMsg[];
    expect(welcomes).toHaveLength(2);
    expect(match!.state).not.toBe(s1);
    expect(welcomes[1].seed).not.toBe(w1.seed);
    const p = match!.state!.players.find((x) => x.id === welcomes[1].playerId)!;
    expect(p.team).toBe('team0');
    expect(p.money).toBe(0);
  });

  it('resets to no setup when the last player leaves', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: 'team0', kind: 'triceratops', setup: { teams: 2, map: 'random' } });
    await a.waitFor((m) => m.t === 'welcome');
    a.ws.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(match!.settings).toBeNull();
    expect(match!.state).toBeNull();
    expect(match!.lobby().setup).toBeNull();
  });

  it('a preset never resets, and the lobby lists the maps', () => {
    const m = new Match(5, { wildlife: false, tiles: 256, preset: { teams: 4, map: 'random' } });
    expect(m.state!.teams).toHaveLength(4);
    expect(m.lobby().maps.map((x) => x.id)).toContain('crossing');
  });

  it('lets an eliminated rider switch teams', async () => {
    const host = await startServer();
    const a = await client(host);
    a.send({ t: 'join', team: 'team0', kind: 'triceratops', setup: { teams: 3, map: 'random' } });
    const w = await a.waitFor<WelcomeMsg>((m) => m.t === 'welcome');
    const st = match!.state!;
    st.round.phase = 'playing';
    eliminateTeam(st, 'team0');
    a.send({ t: 'switch', team: 'team2', kind: 'trex' });
    await ticks(1);
    expect(st.players.find((p) => p.id === w.playerId)!.team).toBe('team2');
  });
```

  `import { eliminateTeam } from '../../src/sim/rounds';`.

- [ ] **Step 2:** Run `npx vitest run tests/server`. It fails.

- [ ] **Step 3: Implement `match.ts`.** These are the changes; the snapshot and session code is kept:

```ts
export interface MatchOptions {
  wildlife?: boolean;
  /** Fixed settings (env TEAMS/MAP): no setup screen, never reset. */
  preset?: RoundSettings;
  /** Size of random maps in tiles (tests use smaller maps). */
  tiles?: number;
}

/** The match a server process hosts: one round after another, with the settings the first player chose. */
export class Match {
  state: GameState | null = null;
  settings: RoundSettings | null;
  private readonly locked: boolean;
  private readonly wildlife: boolean;
  private readonly tiles: number;
  private readonly firstSeed: number;
  private readonly rng: RngState;
  private rounds = 0;
  // ...sessions, pending, sentPlants, sentCarcasses, sentPlayers, sentTeams as before, plus:
  private sentRound = '';

  constructor(seed: number, opts: MatchOptions = {}) {
    this.wildlife = opts.wildlife ?? true;
    this.tiles = opts.tiles ?? DEFAULT_TILES;
    this.firstSeed = seed;
    this.rng = makeRng(seed ^ 0x51ed);
    this.locked = !!opts.preset;
    this.settings = opts.preset ?? null;
    if (this.settings) this.startRound();
  }

  /** Build a fresh world for the current settings (a fixed map always uses its own seed). */
  private startRound(): void {
    const st = this.settings!;
    const recipe = getMap(st.map);
    const seed = recipe ? recipe.seed : this.rounds === 0 ? this.firstSeed : (rand(this.rng) * 2 ** 31) >>> 0;
    this.rounds++;
    this.state = createMatch(seed, worldOptionsFor(st.map, st.teams, this.tiles), { wildlife: this.wildlife, teams: st.teams });
    this.sentPlants = plantLevels(this.state);
    this.sentCarcasses.clear();
    this.sentPlayers = this.sentTeams = this.sentRound = '';
    this.pending = [];
  }

  /** Round over: same settings, new world. Everyone keeps their team slot, mount and name. */
  private nextRound(): void {
    const old = this.state!;
    this.startRound();
    const state = this.state!;
    for (const s of this.sessions) {
      if (s.playerId === null) continue;
      const p = findPlayer(old, s.playerId);
      if (!p) {
        s.playerId = null;
        continue;
      }
      const slot = findTeam(old, p.team)?.slot ?? 0;
      const team = state.teams.find((t) => t.slot === slot) ?? state.teams[0];
      s.playerId = addPlayer(state, team.id, p.kind, p.name).id;
      s.input = null;
      this.sendWelcome(s);
    }
  }

  private sendWelcome(s: Session): void {
    const state = this.state!;
    const st = this.settings!;
    const plants: PlantTuple[] = state.food.filter((f) => f.kind !== 'carcass' && f.food < f.maxFood).map((f) => [f.id, this.sentPlants.get(f.id) ?? Math.ceil(f.food)]);
    this.send(s, {
      t: 'welcome',
      protocol: PROTOCOL_VERSION,
      playerId: s.playerId!,
      seed: state.world.seed,
      map: st.map,
      teams: st.teams,
      tiles: state.world.cols,
      tick: state.tick,
      tickRate: TICK_RATE,
      plants,
      carcasses: carcassTuples(state),
    });
  }

  lobby(): LobbyInfo {
    const s = this.state;
    return {
      protocol: PROTOCOL_VERSION,
      setup: this.settings,
      maps: TEAM_COUNTS.flatMap((n) => mapsFor(n).filter((m) => m.id !== RANDOM_MAP)),
      phase: s?.round.phase ?? null,
      teams: s ? teamInfos(s) : [],
      canJoin: !s || s.players.length < MAX_PLAYERS,
      players: s?.players.length ?? 0,
      maxPlayers: MAX_PLAYERS,
      species: listDinos().map((d) => speciesInfo(d.kind)),
    };
  }

  tick(): void {
    const state = this.state;
    if (!state) return;
    // ...inputs + step + pending as before...
    if (state.round.phase === 'over' && state.round.timer <= 0) return this.nextRound();
    if (state.tick % SNAPSHOT_EVERY === 0) this.broadcast();
  }
```

  - **`broadcast`:** use `this.state!`. Add the round change detection exactly like `teams`: `const round = roundInfo(state); const roundJson = JSON.stringify(round);` pass `round: roundJson === this.sentRound ? null : round`, then `this.sentRound = roundJson`.
  - **`connect` → `close`:**

```ts
    ws.on('close', () => {
      this.sessions.delete(session);
      if (session.playerId !== null && this.state) removePlayer(this.state, session.playerId);
      // Everyone gone: the next player to arrive sets up the server again.
      if (!this.locked && ![...this.sessions].some((x) => x.playerId !== null)) {
        this.settings = null;
        this.state = null;
      }
    });
```

  - **`handle`:**
    - `input`, `buy` and `switch` all need `this.state` and `s.playerId`.
    - **`switch`:** validate the species with `listDinos()`, call `switchTeam`, and on failure send a notice: `'bad-team'` → `'THAT TEAM IS OUT'`, `'not-eliminated'` → `'YOUR CAMP STILL STANDS'`. On success set `this.sentPlayers = ''`.
    - **`join`:**

```ts
    if (s.playerId !== null) return;
    if (!this.settings) {
      if (!msg.setup) return this.send(s, { t: 'error', message: 'THE SERVER WAS RESET - CHOOSE AGAIN' });
      this.settings = msg.setup;
      this.startRound();
    }
    const state = this.state!;
    if (state.players.length >= MAX_PLAYERS) return this.send(s, { t: 'error', message: 'SERVER FULL' });
    if (!listDinos().some((d) => d.kind === msg.kind)) return this.send(s, { t: 'error', message: 'UNKNOWN SPECIES' });
    const team = findTeam(state, msg.team);
    if (!team) return this.send(s, { t: 'error', message: 'TEAM NO LONGER EXISTS' });
    if (team.eliminated) return this.send(s, { t: 'error', message: 'THAT TEAM IS OUT' });
    const player = addPlayer(state, team.id, msg.kind, `RIDER ${++this.nameCounter}`);
    s.playerId = player.id;
    this.sentPlayers = this.sentTeams = this.sentRound = '';
    this.sendWelcome(s);
```

  - The `seed` getter becomes `get seed(): number { return this.state?.world.seed ?? this.firstSeed; }` (keep it if anything uses it; `grep -rn "match.seed\|\.seed" src/server`).
  - Remove `createTeam`, `NEW_TEAM`, `isKnownTeam` and `MAX_TEAMS` from the imports if unused.

  **`main.ts`:**

```ts
const presetTeams = process.env.TEAMS ? Number(process.env.TEAMS) : undefined;
const presetMap = process.env.MAP;
const preset = presetTeams !== undefined || presetMap ? validSettings(presetTeams ?? 2, presetMap ?? 'random') : undefined;
if (preset === null) {
  console.error(`Invalid TEAMS/MAP: TEAMS must be 2, 3 or 4, MAP "random" or a map for that many teams (${TEAM_COUNTS.map((n) => mapsFor(n).map((m) => m.id).join('/')).join(', ')})`);
  process.exit(1);
}
const match = new Match(SEED, { preset });
```

  Log the preset in the startup line.

- [ ] **Step 4:** Run `npm test` and `npx tsc --noEmit`. Only client errors may remain (Task 12).
- [ ] **Step 5:** Commit: `Task 11: match setup, rounds and resets`.

---

## Task 12: Client plumbing: setup screen, round restarts, switching teams

**Files:**
- Modify: `src/client/net/NetClient.ts`, `src/client/net/Mirror.ts`, `src/client/scenes/GameScene.ts`, `src/client/scenes/JoinScene.ts`
- Create: `src/client/render/EliminatedPanel.ts`
- Test: `tests/net/mirror.test.ts` (structures and round)

**Interfaces:**
- Produces:
  - `interface JoinRequest { team: string; kind: string; setup?: RoundSettings }`
  - `new NetClient(url, join: JoinRequest)`
  - `net.mirror` (replaced on each `welcome`)
  - `net.switchTeam(team, kind)`
  - `mirror.round(): RoundInfo`
  - `mirror.structuresAt(tick): StructureInfo[]`
  - GameScene data: `{ join?: JoinRequest; net?: NetClient }`

- [ ] **Step 1: Write the failing Mirror test** (append to `tests/net/mirror.test.ts`):

```ts
import { buildSnapshot } from '../../src/net/protocol';
it('keeps the last round info and decodes structures', () => {
  const s = createMatch(9, SMALL, { teams: 2 });
  const m = new Mirror();
  m.push({ ...buildSnapshot(s, []), ack: 0 }, 0);
  expect(m.round().phase).toBe('waiting');
  s.tick = 3;
  m.push({ ...buildSnapshot(s, [], { round: null }), ack: 0 }, 50);
  expect(m.round().phase).toBe('waiting');
  expect(m.structuresAt(3)).toHaveLength(12);
  expect(m.structuresAt(3)[0].kind).toBe('camp');
});
```

- [ ] **Step 2:** Run the test. It fails.

- [ ] **Step 3: Mirror:**

```ts
  private lastRound: RoundInfo = { phase: 'waiting', timer: 0, winner: null };
  private structureCache = new WeakMap<SnapshotMsg, StructureInfo[]>();
  // in push(): if (snap.round) this.lastRound = snap.round;

  round(): RoundInfo {
    return this.lastRound;
  }

  /** Structures as of the newest snapshot at or before `tick` (they barely move: no interpolation). */
  structuresAt(tick: number): StructureInfo[] {
    let snap = this.snaps[0];
    for (const s of this.snaps) if (s.tick <= tick) snap = s;
    if (!snap) return [];
    let list = this.structureCache.get(snap);
    if (!list) {
      list = snap.structures.map(decodeStructure);
      this.structureCache.set(snap, list);
    }
    return list;
  }
```

- [ ] **Step 4: NetClient:**
  - The constructor takes `join: JoinRequest` and sends `{ t: 'join', ...join }`.
  - Make `mirror` a mutable `mirror = new Mirror();`.
  - On `welcome`:

```ts
      case 'welcome':
        // A new round (or the first): fresh mirror and food queues, the old round's state is gone.
        this.mirror = new Mirror();
        this.plantUpdates = [...msg.plants];
        this.carcassUpdates = [...msg.carcasses];
        this.carcassesGone = [];
        this.welcome = msg;
        this.status = 'playing';
        this.onWelcome?.(msg);
        break;
```

  - Add `switchTeam(team: string, kind: string): void { if (this.status === 'playing') this.ws.send(JSON.stringify({ t: 'switch', team, kind })); }`.

- [ ] **Step 5: GameScene restart on each round:**
  - Add a field `private restarting = false;`. Reset it in `init()`.
  - `create(data: { join?: JoinRequest; net?: NetClient })`:

```ts
    this.net = data.net ?? new NetClient(gameSocketUrl(), data.join!);
    this.net.onWelcome = () => {
      if (!this.world) return this.startWorld(this.net.welcome!);
      // New round: rebuild the whole scene on the same connection.
      this.restarting = true;
      this.scene.restart({ net: this.net });
    };
    if (this.net.welcome) this.startWorld(this.net.welcome);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (!this.restarting) this.net.close();
      this.worldView?.destroy();
      this.waterView?.destroy();
    });
```

  - In `startWorld`: `this.world = generateWorld(w.seed, worldOptionsFor(w.map, w.teams, w.tiles));`.
  - Replace every `this.net.mirror` access in `update` with a local `const mirror = this.net.mirror;` read at the top of `update` (most of them already are). That way a mirror swapped mid-frame can't mix rounds.

- [ ] **Step 6: JoinScene setup flow:**
  - `teamStep(lobby)`: if `lobby.setup === null`, go to `setupTeamsStep(lobby)` first.
  - `setupTeamsStep`: `menu('HOW MANY TEAMS?', [2, 3, 4].map((n) => ({ label: `${n} TEAMS`, tint: 0xf4f0e0, enabled: true, pick: () => this.setupMapStep(lobby, n) })))`, with the title `'YOU ARE THE FIRST RIDER - SET UP THE WORLD'`.
  - `setupMapStep(lobby, n)`: options from `mapsFor(n)` (import from `../../sim/maps`). Each pick sets `this.setup = { teams: n, map: m.id }` and calls `teamStep` with a synthetic lobby whose `teams` are `Array.from({ length: n }, (_, slot) => ({ id: `team${slot}`, slot, name: TEAM_NAMES[slot], base: { x: 0, y: 0 }, players: 0, eliminated: false }))`.
  - `teamStep`: list `lobby.teams` as `JOIN TEAM <NAME> (<players>)`. Eliminated teams are disabled with the label `TEAM <NAME> - OUT`. Remove the "FOUND A NEW TEAM" option. The footer shows the round: `MAP: <name>  TEAMS: <n>` (look the name up in `lobby.maps`, or `RANDOM`).
  - `speciesStep` starts the game with `this.scene.start('game', { join: { team: this.team, kind: s.kind, ...(this.setup ? { setup: this.setup } : {}) } })`.
  - Clear `this.setup = undefined` in `create`.

- [ ] **Step 7: Eliminated panel** (`src/client/render/EliminatedPanel.ts`). It's a small screen-space menu. When `me.team` is eliminated and the round is not `over`, it shows:

```
YOUR CAMP HAS FALLEN
1  JOIN TEAM GOLD
2  JOIN TEAM BLUE
S  SPECTATE
```

  After a team is picked, it shows the 4 mounts (same labels as the join screen). The pick calls `net.switchTeam(team, kind)` and hides the panel. `S` sets `spectating = true`.

  - Interface: `constructor(scene, onSwitch: (team: string, kind: string) => void)`, `update(me: PlayerInfo | undefined, teams: TeamInfo[], round: RoundInfo): void`, `get spectating(): boolean`, `get isOpen(): boolean`.
  - Keyboard: `ONE`..`FOUR` and `S`. Use `pixelText` and the `DEPTH.hud + 3` depth. It hides itself once `me.team` is no longer eliminated.
  - GameScene creates it in `startWorld`. While it is open, the player input is suppressed the same way as for the shop.
  - **Spectating:** `followCamera` gets a free-camera target. Keep `this.spectate = { x, y }`, starting at your old camp, and move it by `cmd.turn * 400 * dt` horizontally and `-cmd.throttle * 400 * dt` vertically from `playerInput.command()`. Show `SPECTATING - WASD TO LOOK AROUND` in the HUD hint line (Task 16).

- [ ] **Step 8:** Run `npx tsc --noEmit` (it must be clean now) and `npm test`.
- [ ] **Step 9: Manual smoke test:**
  1. Start `PORT=8091 npx tsx src/server/main.ts` together with `GAME_SERVER=http://localhost:8091 npx vite --port 5174` (see HANDOFF Gotchas: the Docker container may hold :8080).
  2. Open `http://localhost:5174`. You get TEAMS, then MAP, then TEAM, then MOUNT, and you are in the game.
  3. Open a second tab. It goes straight to the team list (setup already chosen).
  4. In the server console (or a `?debug` tab via `window.dinoriders`), there is no direct server handle. Instead, verify the restart with the unit test from Task 11, plus the end-to-end check in Task 17.
- [ ] **Step 10:** Commit: `Task 12: client setup screen, round restarts, eliminated panel`.

---

## Task 13: Ground in chunks, sprite culling

**Files:**
- Create: `src/client/render/GroundChunks.ts`
- Modify: `src/client/render/textures/worldArt.ts` (`drawGround` → `drawGroundChunk`), `src/client/render/WorldView.ts`, `src/client/render/FoodView.ts`, `src/client/scenes/GameScene.ts`

**Interfaces:**
- Produces:
  - `drawGroundChunk(world: World, x0: number, y0: number, w: number, h: number): HTMLCanvasElement`
  - `class GroundChunks { constructor(scene, world); update(view: Phaser.Geom.Rectangle): void; destroy(): void }`
  - `WorldView.update(player, view)`
  - `FoodView.cull(view)`

- [ ] **Step 1: `drawGroundChunk`.** Turn the body of `drawGround` into a function that draws one rectangle of the world:
  1. `const M = 4;` Build the terrain `map` for the expanded region `(x0 - M .. x0 + w + M) × (y0 - M .. y0 + h + M)` with `tileAt(world, x, y)`, clamped to the world. The neighbour tests (`near`) then see across chunk seams.
  2. `at(x, y)` takes **world** coordinates and indexes the expanded map.
  3. The pixel loop runs over the chunk's world pixels and writes to `img` at `(x - x0, y - y0)`.
  4. Ground details: `const rnd = seededRandom((seed * 7 + 1) ^ Math.imul(Math.floor(x0 / 256) + 1, 73856093) ^ Math.imul(Math.floor(y0 / 256) + 1, 19349663));`, `count = Math.floor((w * h) / 260)`, and positions `x = x0 + 2 + Math.floor(rnd() * (w - 4))` (likewise for y), so a detail is never cut by the seam. Every `px(c, x, y, …)` call in the detail code becomes `px(c, x - x0, y - y0, …)`.
  5. Delete `drawGround`. Its only caller was `WorldView`.

- [ ] **Step 2: `GroundChunks`:**

```ts
import Phaser from 'phaser';
import type { World } from '../../sim/types';
import { drawGroundChunk } from './textures/worldArt';
import { DEPTH } from './depth';

/** Ground chunk size in px: one takes about 10 ms to draw. */
export const CHUNK = 256;
/** Time per frame for drawing chunks ahead of the camera (chunks under the camera are always drawn at once). */
const FRAME_BUDGET_MS = 6;
/** Chunks this far outside the view (in chunks) are dropped. */
const KEEP = 3;

/** The 8192 px ground drawn lazily in chunks around the camera, since one texture that size won't fit on a GPU. */
export class GroundChunks {
  private live = new Map<number, Phaser.GameObjects.Image>();
  private readonly cols: number;
  private readonly rows: number;

  constructor(private scene: Phaser.Scene, private world: World) {
    this.cols = Math.ceil(world.width / CHUNK);
    this.rows = Math.ceil(world.height / CHUNK);
  }

  private key(i: number): string {
    return `ground_${this.world.seed}_${this.world.cols}_${i}`;
  }

  private draw(i: number): void {
    const cx = i % this.cols;
    const cy = Math.floor(i / this.cols);
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const w = Math.min(CHUNK, this.world.width - x0);
    const h = Math.min(CHUNK, this.world.height - y0);
    const key = this.key(i);
    if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, drawGroundChunk(this.world, x0, y0, w, h));
    this.live.set(i, this.scene.add.image(x0, y0, key).setOrigin(0, 0).setDepth(DEPTH.ground));
  }

  update(view: Phaser.Geom.Rectangle): void {
    const c0 = Math.max(0, Math.floor(view.x / CHUNK));
    const c1 = Math.min(this.cols - 1, Math.floor(view.right / CHUNK));
    const r0 = Math.max(0, Math.floor(view.y / CHUNK));
    const r1 = Math.min(this.rows - 1, Math.floor(view.bottom / CHUNK));
    // Under the camera: draw now, whatever it costs (no holes in the ground).
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (!this.live.has(r * this.cols + c)) this.draw(r * this.cols + c);
    // One chunk of margin all round, nearest first, within the frame budget.
    const t0 = performance.now();
    const cx = (c0 + c1) / 2;
    const cy = (r0 + r1) / 2;
    const want: number[] = [];
    for (let r = Math.max(0, r0 - 1); r <= Math.min(this.rows - 1, r1 + 1); r++) {
      for (let c = Math.max(0, c0 - 1); c <= Math.min(this.cols - 1, c1 + 1); c++) if (!this.live.has(r * this.cols + c)) want.push(r * this.cols + c);
    }
    want.sort((a, b) => Math.hypot((a % this.cols) - cx, Math.floor(a / this.cols) - cy) - Math.hypot((b % this.cols) - cx, Math.floor(b / this.cols) - cy));
    for (const i of want) {
      if (performance.now() - t0 > FRAME_BUDGET_MS) break;
      this.draw(i);
    }
    for (const [i, img] of this.live) {
      const c = i % this.cols;
      const r = Math.floor(i / this.cols);
      if (c >= c0 - KEEP && c <= c1 + KEEP && r >= r0 - KEEP && r <= r1 + KEEP) continue;
      img.destroy();
      this.scene.textures.remove(this.key(i));
      this.live.delete(i);
    }
  }

  destroy(): void {
    for (const [i, img] of this.live) {
      img.destroy();
      this.scene.textures.remove(this.key(i));
    }
    this.live.clear();
  }
}
```

- [ ] **Step 3: WorldView.**
  - Replace the single ground image with `this.ground = new GroundChunks(scene, world)`.
  - Bucket every obstacle image (rock, shadow, trunk, canopy shadow, canopy) into 512 px buckets: `private buckets = new Map<number, { images: Phaser.GameObjects.Image[]; canopies: Canopy[] }>()`, keyed `by * bucketCols + bx` from the obstacle's position. Create every image with `setVisible(false)`.
  - **`update(player, view)`:**
    1. `this.ground.update(view)`;
    2. work out the buckets that intersect `view` grown by 64 px;
    3. `setVisible(true)` on newly visible buckets and `false` on buckets that left (keep a `Set` of the visible ones);
    4. run the canopy fade loop **only over the visible buckets' canopies**.
  - `destroy()` calls `this.ground.destroy()`.
  - In `GameScene.update`, call `this.worldView.update(myDino, this.cameras.main.worldView)` **after** `followCamera` (so the view is current), and call it once in `startWorld` after the camera is placed.
- [ ] **Step 4: FoodView.** Bucket the plant sprites the same way (512 px), created invisible. Add `cull(view)`, called from `GameScene.update` next to `worldView.update`. Carcasses stay as they are: there are few of them.
- [ ] **Step 5: Verify in a browser.** Use the dev servers from Task 12, step 9. Then:
  1. Join, drive around with W, and watch for holes or seams at chunk borders. Seams should be invisible, so compare a shoreline that crosses a chunk border.
  2. Measure the CPU time per frame with the HANDOFF method (headless Edge, `prestep` → `postrender`, from **Run and verify**). The target is to be no worse than the 9.5 ms measured at 4096 px, or explain why. Record the numbers for Task 17.
  3. Check the load time from `welcome` to the first frame (`generateWorld` plus the first chunks). It should be under about 2 s.
- [ ] **Step 6:** Commit: `Task 13: ground drawn in chunks, obstacle and plant culling`.

---

## Task 14: Camp and tower art, `?preview=camp`

**Files:**
- Create: `src/client/render/textures/campArt.ts`, `src/client/render/structureStages.ts`
- Modify: `src/client/render/textures/index.ts`, `src/client/scenes/PreviewScene.ts`
- Test: `tests/client/structureStages.test.ts`

**Interfaces:**
- Produces:
  - `campStage(hp, maxHp): 0 | 1 | 2 | 3 | 4 | 5`, `towerStage(hp, maxHp): 0 | 1 | 2 | 3`
  - `drawCamp(p: DinoPalette, stage: number): HTMLCanvasElement` (96×96, building centre at (48, 52))
  - `drawTower(p: DinoPalette, stage: number): HTMLCanvasElement` (32×48, footing centre at (16, 40))
  - `drawTowerTurret(p: DinoPalette): HTMLCanvasElement` (20×20, barrel along +x)
  - `drawField(color: string): HTMLCanvasElement` (120×110)
  - `drawFieldRing(): HTMLCanvasElement`
  - Texture keys:
    - `camp_t<slot>_<stage>`, with stages 0–5;
    - `tower_t<slot>_<stage>`, with stages 0–3;
    - `towerTurret_t<slot>`, a strip of `DIRS` frames;
    - `field_t<slot>`;
    - `fieldRing`.

- [ ] **Step 1: Stage helpers with tests.** `structureStages.ts` must not import Phaser, so vitest can load it.

```ts
/** Camp building look by HP: 0 intact … 4 near ruin, 5 ruins. */
export function campStage(hp: number, maxHp: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (hp <= 0) return 5;
  const f = hp / maxHp;
  return f > 0.8 ? 0 : f > 0.55 ? 1 : f > 0.3 ? 2 : f > 0.1 ? 3 : 4;
}

/** Tower look by HP: 0 intact, 1 cracked, 2 wrecked, 3 rubble. */
export function towerStage(hp: number, maxHp: number): 0 | 1 | 2 | 3 {
  if (hp <= 0) return 3;
  const f = hp / maxHp;
  return f > 0.6 ? 0 : f > 0.25 ? 1 : 2;
}
```

```ts
// tests/client/structureStages.test.ts
import { describe, expect, it } from 'vitest';
import { campStage, towerStage } from '../../src/client/render/structureStages';
describe('structure damage stages', () => {
  it('map camp HP to six looks', () => {
    expect([3000, 2401, 2400, 1650, 900, 300, 1, 0].map((hp) => campStage(hp, 3000))).toEqual([0, 0, 1, 2, 3, 4, 4, 5]);
  });
  it('map tower HP to four looks', () => {
    expect([400, 241, 240, 100, 1, 0].map((hp) => towerStage(hp, 400))).toEqual([0, 0, 1, 2, 2, 3]);
  });
});
```

  Check the boundaries: 2400/3000 = 0.8 is not > 0.8 → stage 1; 1650 = 0.55 → stage 2; 900 = 0.3 → stage 3; 300 = 0.1 → stage 4.

  Run the test (`npx vitest run tests/client`), confirm it fails, implement, and confirm it passes.

- [ ] **Step 2: Draw the camp** (`campArt.ts`).
  - **Style:** match the existing art. Light comes from the upper-left (`litShade`), there's a 1 px dark outline (`outline(c, '#120c08')`), and colours are limited and taken from the team palette.
  - **Damage:** the layout is deterministic. One `seededRandom(9001)` table of hole positions is shared by every palette, and each stage adds damage on top of the previous one.

```ts
import { ellipse, line, litShade, makeCanvas, outline, px, rect, seededRandom, type PixCanvas } from './pixel';
import { METAL, METAL_DARK, METAL_LIGHT, type DinoPalette } from './dinoArt';

const STONE = ['#4a4640', '#6e685e', '#958d7f'] as const;
const WOOD = ['#3e2716', '#6b4226', '#9a6638'] as const;
const CHAR = '#1d1714';
const ASH = '#3a3430';
const EMBER = '#ff7a2a';
const CRYSTAL = ['#2a8fb0', '#7ff0ff', '#d8ffff'] as const;
const OUTLINE = '#120c08';

/** Darken (f < 1) or lighten (f > 1) a #rrggbb colour. */
function tint(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f))).toString(16).padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

const CX = 48;
const CY = 52;
/** Fixed damage layout shared by all palettes: where holes, scorches and breaches go. */
const HOLES = (() => {
  const rnd = seededRandom(9001);
  return Array.from({ length: 14 }, () => ({ a: rnd() * Math.PI * 2, d: 0.25 + rnd() * 0.6, s: 2 + Math.floor(rnd() * 4) }));
})();

function stake(c: PixCanvas, x: number, y: number, broken: boolean): void {
  if (broken) {
    rect(c, x - 1, y - 2, 3, 2, WOOD[0]);
    px(c, x, y - 3, CHAR);
    return;
  }
  rect(c, x - 1, y - 7, 3, 7, WOOD[1]);
  rect(c, x - 1, y - 7, 1, 7, WOOD[2]);
  px(c, x, y - 8, WOOD[2]);
}

/** Palisade stakes on an ellipse; `front` draws the half nearer the viewer (drawn after the hall). */
function palisade(c: PixCanvas, stage: number, front: boolean): void {
  for (let k = 0; k < 30; k++) {
    const a = (k / 30) * Math.PI * 2;
    const y = CY + 2 + Math.sin(a) * 36;
    if (front !== Math.sin(a) > 0) continue;
    // Gate gap facing south-east.
    if (k === 3 || k === 4) continue;
    const broken = (stage >= 2 && k % 7 === 2) || (stage >= 3 && k % 5 === 1) || (stage >= 4 && k % 3 === 0);
    stake(c, Math.round(CX + Math.cos(a) * 44), Math.round(y), broken);
  }
}

function crystal(c: PixCanvas, x: number, y: number, cracked: boolean): void {
  rect(c, x - 3, y + 4, 7, 2, METAL_DARK);
  rect(c, x - 2, y + 4, 5, 1, METAL);
  for (let dy = -5; dy <= 3; dy++) {
    const w = dy < 0 ? 3 + dy : 3 - Math.max(0, dy - 1);
    for (let dx = -Math.max(0, w - 1); dx <= Math.max(0, w - 1); dx++) px(c, x + dx, y + dy, dx < 0 ? CRYSTAL[2] : dx === 0 ? CRYSTAL[1] : CRYSTAL[0]);
  }
  if (cracked) {
    px(c, x, y - 2, CHAR);
    px(c, x + 1, y, CHAR);
    px(c, x, y + 1, CHAR);
  }
}

function banner(c: PixCanvas, p: DinoPalette, torn: boolean): void {
  const x = CX + 24;
  const y = CY - 30;
  line(c, x, y, x, y + 22, WOOD[1]);
  for (let r = 0; r < 7; r++) {
    const w = torn ? (r % 2 ? 5 : 8 - r) : 9;
    rect(c, x + 1, y + 1 + r, w, 1, r < 2 ? p.tunicLight : p.tunic);
  }
}

/** The team's camp: palisade, stone footing, round hall with a hide roof, field crystal, banner. */
export function drawCamp(p: DinoPalette, stage: number): HTMLCanvasElement {
  const c = makeCanvas(96, 96);
  if (stage >= 5) return drawRuins(c);
  palisade(c, stage, false);
  ellipse(c, CX, CY + 6, 31, 22, (nx, ny, x, y) => litShade(nx, ny, x, y, STONE[0], STONE[1], STONE[2]));
  const roofDark = tint(p.tunic, 0.6);
  ellipse(c, CX, CY - 3, 28, 21, (nx, ny, x, y) => {
    // Half the roof caved in from stage 3: charred beams over a dark interior.
    if (stage >= 3 && nx > 0.05 && ny < 0.3) return (x + y) % 5 === 0 ? WOOD[0] : x % 6 === 0 ? CHAR : '#24180f';
    // Radial seams between hide panels.
    const seam = Math.abs(Math.sin(Math.atan2(ny, nx) * 4)) < 0.12;
    return seam ? roofDark : litShade(nx, ny, x, y, roofDark, p.tunic, p.tunicLight);
  });
  // Timber ring at the roof edge.
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    px(c, Math.round(CX + Math.cos(a) * 28), Math.round(CY - 3 + Math.sin(a) * 21), k % 4 ? WOOD[1] : WOOD[2]);
  }
  // Door facing the viewer.
  rect(c, CX - 4, CY + 14, 8, 8, '#24180f');
  rect(c, CX - 4, CY + 14, 8, 1, WOOD[2]);
  if (stage < 4) crystal(c, CX, CY - 12, false);
  else crystal(c, CX - 1, CY - 10, true);
  if (stage < 4) banner(c, p, stage >= 1);
  // Damage that builds up stage by stage.
  HOLES.forEach((h, i) => {
    const x = Math.round(CX + Math.cos(h.a) * 26 * h.d);
    const y = Math.round(CY - 3 + Math.sin(h.a) * 19 * h.d);
    if (stage >= 1 && i < 4) ellipse(c, x, y, h.s, h.s - 1, (nx, ny, xx, yy) => ((xx + yy) % 2 ? 'rgba(20,14,10,0.55)' : null));
    if ((stage >= 2 && i >= 4 && i < 8) || (stage >= 4 && i >= 8)) {
      ellipse(c, x, y, h.s, h.s - 1, () => '#1a110b');
      px(c, x + h.s - 1, y, EMBER);
    }
  });
  if (stage >= 3) for (let k = 0; k < 18; k++) px(c, CX + 20 + (k * 7) % 14, CY + 10 + (k * 5) % 9, STONE[k % 3]);
  palisade(c, stage, true);
  outline(c, OUTLINE);
  return c.canvas;
}

/** What is left: a ring of rubble, crossed charred beams, ash and crystal shards. */
function drawRuins(c: PixCanvas): HTMLCanvasElement {
  ellipse(c, CX, CY + 4, 30, 21, (nx, ny, x, y) => ((x * 7 + y * 3) % 5 === 0 ? CHAR : ASH));
  const rnd = seededRandom(4242);
  for (let k = 0; k < 70; k++) {
    const a = rnd() * Math.PI * 2;
    const d = 0.8 + rnd() * 0.35;
    const x = Math.round(CX + Math.cos(a) * 30 * d);
    const y = Math.round(CY + 4 + Math.sin(a) * 21 * d);
    const s = 1 + Math.floor(rnd() * 3);
    ellipse(c, x, y, s, s, (nx, ny, xx, yy) => litShade(nx, ny, xx, yy, STONE[0], STONE[1], STONE[2]));
  }
  line(c, CX - 20, CY - 6, CX + 16, CY + 12, WOOD[0], 2);
  line(c, CX - 14, CY + 14, CX + 22, CY - 4, CHAR, 2);
  line(c, CX - 6, CY - 14, CX + 4, CY + 16, WOOD[0], 2);
  for (const [dx, dy] of [[-3, 2], [4, -1], [1, 5]]) px(c, CX + dx, CY + dy, CRYSTAL[1]);
  for (let k = 0; k < 8; k++) px(c, CX - 10 + k * 3, CY + 2 + (k % 3), EMBER);
  outline(c, OUTLINE);
  return c.canvas;
}
```

- [ ] **Step 3: Draw the tower, turret and field** (same file):

```ts
/** Defense tower: stone footing, timber frame, pennant. The turret is a separate rotating sprite on top (at y 18). */
export function drawTower(p: DinoPalette, stage: number): HTMLCanvasElement {
  const c = makeCanvas(32, 48);
  if (stage >= 3) {
    // Rubble.
    const rnd = seededRandom(77);
    for (let k = 0; k < 26; k++) {
      const x = Math.round(16 + (rnd() - 0.5) * 22);
      const y = Math.round(40 + (rnd() - 0.5) * 10);
      ellipse(c, x, y, 2, 1 + Math.floor(rnd() * 2), (nx, ny, xx, yy) => litShade(nx, ny, xx, yy, STONE[0], STONE[1], STONE[2]));
    }
    line(c, 7, 36, 24, 42, WOOD[0], 2);
    outline(c, OUTLINE);
    return c.canvas;
  }
  ellipse(c, 16, 40, 12, 6, (nx, ny, x, y) => litShade(nx, ny, x, y, STONE[0], STONE[1], STONE[2]));
  // Tapered stone body.
  for (let y = 20; y < 40; y++) {
    const half = 6 + Math.floor((y - 20) / 6);
    for (let x = 16 - half; x <= 16 + half; x++) px(c, x, y, x < 16 - half + 2 ? STONE[2] : x > 16 + half - 2 ? STONE[0] : (x + y) % 7 === 0 ? STONE[0] : STONE[1]);
  }
  // Timber platform the turret sits on.
  ellipse(c, 16, 18, 10, 5, (nx, ny, x, y) => litShade(nx, ny, x, y, WOOD[0], WOOD[1], WOOD[2]));
  // Pennant.
  line(c, 25, 4, 25, 18, WOOD[1]);
  for (let r = 0; r < 5; r++) rect(c, 26, 5 + r, 5 - r, 1, r < 2 ? p.tunicLight : p.tunic);
  if (stage >= 1) {
    line(c, 12, 24, 14, 30, CHAR);
    line(c, 14, 30, 13, 34, CHAR);
    line(c, 20, 27, 19, 33, CHAR);
  }
  if (stage >= 2) {
    // A chunk knocked out of the body, and the pennant gone.
    c.ctx.clearRect(18, 21, 5, 6);
    c.ctx.clearRect(25, 4, 7, 6);
    px(c, 18, 27, EMBER);
  }
  outline(c, OUTLINE);
  return c.canvas;
}

/** Tower turret seen from above, barrel along +x (rotated by rotationStrip). */
export function drawTowerTurret(p: DinoPalette): HTMLCanvasElement {
  const c = makeCanvas(20, 20);
  ellipse(c, 10, 10, 5, 5, (nx, ny, x, y) => litShade(nx, ny, x, y, METAL_DARK, METAL, METAL_LIGHT));
  rect(c, 12, 9, 7, 2, METAL);
  rect(c, 12, 9, 7, 1, METAL_LIGHT);
  rect(c, 18, 9, 1, 2, METAL_DARK);
  rect(c, 8, 8, 2, 4, p.tunic);
  outline(c, OUTLINE);
  return c.canvas;
}

/** Force field dome over the camp building: faint fill, hex shimmer, brighter rim. */
export function drawField(color: string): HTMLCanvasElement {
  const c = makeCanvas(120, 110);
  const n = parseInt(color.slice(1), 16);
  const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  ellipse(c, 60, 56, 56, 50, (nx, ny, x, y) => {
    const r = nx * nx + ny * ny;
    if (r > 0.86) return `rgba(${rgb},0.55)`;
    const hex = (x + Math.floor(y / 2)) % 8 === 0 || y % 7 === 0;
    if (hex) return `rgba(${rgb},${(0.12 + r * 0.2).toFixed(2)})`;
    // Highlight on the upper-left of the dome.
    if (nx < -0.3 && ny < -0.3 && r < 0.5) return 'rgba(255,255,255,0.10)';
    return `rgba(${rgb},0.05)`;
  });
  return c.canvas;
}

/** White ripple ring, tinted and scaled up where the field blocks a hit. */
export function drawFieldRing(): HTMLCanvasElement {
  const c = makeCanvas(16, 16);
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    px(c, Math.round(8 + Math.cos(a) * 6), Math.round(8 + Math.sin(a) * 6), '#ffffff');
  }
  return c.canvas;
}
```

- [ ] **Step 4: Register the textures** in `textures/index.ts`, inside the palette loop, for team palettes only (`key !== 'wild'`):

```ts
    if (key !== 'wild') {
      for (let st = 0; st <= 5; st++) addImage(scene, `camp_${key}_${st}`, drawCamp(pal, st));
      for (let st = 0; st <= 3; st++) addImage(scene, `tower_${key}_${st}`, drawTower(pal, st));
      addStrip(scene, `towerTurret_${key}`, drawTowerTurret(pal), DIRS);
      addImage(scene, `field_${key}`, drawField(pal.tunicLight));
    }
```

  After the loop, add `addImage(scene, 'fieldRing', drawFieldRing());`. Remove `campStone` (no longer used after Task 15) once `WorldView` stops using it.

- [ ] **Step 5: Preview.** In `PreviewScene.create`, if `kind === 'camp'`, draw a sheet and return:
  - one row per team palette (`t0`..`t3`);
  - columns: `camp_<pal>_0..5` at 110 px spacing, then `tower_<pal>_0..3` at 40 px spacing, with the turret (`towerTurret_<pal>`, frame `frameForAngle(0.5, DIRS)`) on stages 0–2 at the tower's y − 22;
  - `field_<pal>` over the stage-0 camp at alpha 0.8;
  - label each column with its stage number (`pixelText`).
  - Keep `&zoom` and `&focus` working (cell size 110 × 120).
- [ ] **Step 6: Look at it.**
  1. Take a headless Edge screenshot of `http://localhost:5174/?preview=camp&zoom=2`, plus `&focus=0,0`. The command is in HANDOFF **Run and verify**.
  2. Read the PNG. Check that the damage clearly gets worse from stage to stage, that the building reads as a camp (palisade, hall, crystal, banner), that team colours are recognizable, and that the outline is clean.
  3. Iterate on the art until it looks right. Expect several rounds. Keep the sizes fixed, since Task 15 relies on them.
  4. Show the screenshot to the user before continuing, because the user asked for a "nice looking" camp.
- [ ] **Step 7:** Commit: `Task 14: camp and tower art with damage stages`.

---

## Task 15: Structures in the game: views, force field, effects

**Files:**
- Create: `src/client/render/StructureViews.ts`
- Modify: `src/client/render/WorldView.ts` (camp boundary), `src/client/render/Effects.ts` (`smoke`, `fire`, `rubble`), `src/client/scenes/GameScene.ts` (wire-up, events), `src/client/net/Mirror.ts` (nothing beyond Task 12)

**Interfaces:**
- Consumes: `StructureInfo` (Task 10), `campStage`/`towerStage` and the textures (Task 14)
- Produces: `class StructureViews { constructor(scene, fx: Effects); update(list: StructureInfo[], teams: TeamInfo[], now: number, view: Phaser.Geom.Rectangle): void; shieldHit(x: number, y: number, structureId: number): void; destroy(): void }`

- [ ] **Step 1: Effects.** Add these, following the existing emitter style:
  - `smoke(x, y)`: a new emitter `smokeFx` using the `dust` texture, tint `0x5a5550`, rising (`speedY: { min: -26, max: -14 }`, `speedX: { min: -6, max: 6 }`), lifespan 1200–2000, scale 1 → 3, alpha 0.5 → 0, depth `DEPTH.fx - 2`;
  - `fire(x, y)`: the `spark` texture, tints `[0xffe066, 0xff7a2a, 0xe0503c]`, `speedY: { min: -40, max: -20 }`, lifespan 250–500;
  - `rubble(x, y)`: a burst of `dust` (16) and `sparks` (12), plus a camera shake if on screen.
- [ ] **Step 2: StructureViews.** Keep one entry per structure id.

```ts
interface Entry {
  base: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  turret?: Phaser.GameObjects.Image;
  field?: Phaser.GameObjects.Image;
  stage: number;
  fieldOn: boolean;
  /** Next time (ms) this structure puffs smoke or fire. */
  nextFx: number;
}
```

  `update` steps:
  1. Palette key `p = paletteKey(s.team, teams)`.
  2. Stage = `campStage`/`towerStage` of `s.hp`/`s.maxHp`.
  3. **Camp entry:**
     - the base image `camp_<p>_<stage>` sits at `(s.x, s.y - 4)` with origin (0.5, 52/96) and depth `DEPTH.world + s.y + 20`;
     - the shadow is a `'shadow'` image scaled to 84 × 40 at `(s.x + 4, s.y + 6)`, depth `DEPTH.shadow`;
     - the field image `field_<p>` sits at `(s.x, s.y - 10)`, depth `DEPTH.world + s.y + 40`, and is visible while `s.field`. Its alpha pulses: `0.55 + 0.15 * Math.sin(now / 400)`.
  4. **Tower entry:**
     - the base `tower_<p>_<stage>` has origin (0.5, 40/48) at `(s.x, s.y)`, depth `DEPTH.world + s.y`;
     - the turret `towerTurret_<p>` sits at `(s.x, s.y - 22)`, depth `DEPTH.world + s.y + 1`, frame `frameForAngle(s.angle, DIRS)`, and is visible only while `stage < 3`;
     - while rubble with `s.rebuildIn > 0`, draw a 1 px progress bar in a shared `Graphics` (depth `DEPTH.overlay`) under the rubble: `width = 20 * (1 - s.rebuildIn / CAMP.towerRebuild)`.
  5. **Stage changes:** swap the texture. When the stage goes **up** to 5 (camp) or 3 (tower), call `fx.rubble(s.x, s.y)`.
  6. **Field changes:** when the field turns off, tween the dome's scale 1 → 1.15 and alpha → 0 over 300 ms, then hide it. When it turns on, set scale 0.6 and tween to 1 over 400 ms.
  7. **Hit flash:** `setTintFill(0xffffff)` on the base while `s.hitFlash`, `clearTint()` otherwise.
  8. **Smoke and fire** (only for structures inside `view` grown by 80 px), every 220 ms:
     - camp stage ≥ 2: `fx.smoke` at 2 roof points;
     - camp stage ≥ 3: also `fx.fire`;
     - camp stage 5: smoke only, every 600 ms;
     - tower stage 2: `fx.hit` sparks every 700 ms.

  - `shieldHit(x, y, id)` adds a `fieldRing` image at `(x, y)` tinted with the structure's team colour, tweened to scale 3 and alpha 0 over 350 ms.
  - Before `stage 0` exists for a structure, don't create it twice: create entries lazily in `update`, and destroy entries whose ids vanished (a new round rebuilds the scene anyway).
  - `CAMP` is imported from `../../sim/camp`.

- [ ] **Step 3: WorldView camp markings.**
  - Remove the 12 `campStone` images per base and the `updateBases` claim logic. Teams exist from the start now.
  - **New `updateBases(teams)`:** draw once per team (keyed by slot):
    - the team-colour dotted circle at `BASE_RADIUS` (the same 96-dot code, at the new 220 px radius);
    - the 0.08 fill;
    - 6 totems at `BASE_RADIUS - 10`.
  - When a team becomes eliminated, set the circle's alpha to 0.3 and tint the totems grey (`0x777777`).
  - Remove the `drawCampStone` registration from `textures/index.ts`.
- [ ] **Step 4: GameScene wiring.**
  - In `startWorld`, create `this.structures = new StructureViews(this, this.fx)`.
  - In `update`, after the dinos: `this.structures.update(mirror.structuresAt(rt), teams, time, this.cameras.main.worldView)`.
  - **`handleEvent`:**
    - `structureHit`: if `e.shielded`, call `this.structures.shieldHit(e.x, e.y, e.structureId)`; otherwise `this.fx.hit(e.x, e.y)`.
    - `towerDown`: `this.fx.death(x, y)`, using the structure's position from `mirror.structuresAt(rt)`.
    - `campDown`: a big camera shake (`cam.shake(400, 0.01)`) if the camp is on screen.
    - `towerDown`, `towerUp`, `campDown`, `eliminated` and `roundWon` go to the HUD feed (Task 16).
  - **Shot muzzle flash:** tower shots arrive as `shot` with `mount === -1`. `fx.muzzle(e.x, e.y)` already works.
  - **Shop zone:** `this.inBase` uses `BASE_RADIUS`, which is already 220.
- [ ] **Step 5: Verify in a browser.**
  1. Start a 2-team RANDOM round with two tabs, one per team. With only one tab the round stays `waiting`, and the structures show the shield ripple when shot (expected).
  2. With two tabs (team0 and team1), wait for `playing`, drive a Triceratops to the enemy camp, and shoot a tower until it falls. Check the stage swaps, rubble burst, rebuild bar, turret tracking and the tower's shots.
  3. Destroy 3 towers. The field should drop, and shooting the building should now bring it through stages 1–5 with smoke and fire.
  4. Take screenshots of each stage. A CDP autopilot is the practical way to do this (HANDOFF **Driving the game**). Set the target to the enemy camp from `scene.net.mirror.structuresAt(...)`.
- [ ] **Step 6:** Commit: `Task 15: camps and towers in the game, force field and damage effects`.

---

## Task 16: HUD: camp status, round banners, spectating, enemy camp arrows

**Files:**
- Modify: `src/client/render/Hud.ts`, `src/client/scenes/GameScene.ts`

**Interfaces:**
- Consumes: `RoundInfo`, `StructureInfo`, `EliminatedPanel.spectating`
- Produces: `HudModel` gains `structures: StructureInfo[]; round: RoundInfo; spectating: boolean`; `Hud.addLine(text: string, tint: number): void`

- [ ] **Step 1: Zone line.** Replace `'SAFE ZONE - E: SHOP'` with `'YOUR CAMP - E: SHOP'`. When the rider is healing (in camp, `d.hp < d.maxHp`), add `'  HEALING'`.
- [ ] **Step 2: Camp status strip** (top centre, under the zone line, y = 16). For each team (`m.teams`, sorted by slot), in a cell 66 px wide centred as a group:
  - the team name in the team colour (`pixelText`, reuse up to 4 BitmapTexts);
  - the camp HP bar (40 × 3, dark backing; team colour fill, red below 30%);
  - 5 tower pips (3 × 3; filled = standing, outline only = rubble);
  - a small field marker (a 2 px light-blue square) while the camp's field is up;
  - eliminated teams drawn at alpha 0.35 with `OUT` in place of the bar.
  - The data comes from `m.structures`: the camp (`kind === 'camp'`) and the towers of each team.
- [ ] **Step 3: Round banner** (`this.center`, the same object as the respawn text; respawn wins when both apply):
  - `waiting`: `WAITING FOR RIDERS`, and on the line below `EVERY TEAM NEEDS A RIDER - CAMPS ARE PROTECTED`.
  - `countdown`: `ROUND STARTS IN <timer>`.
  - `over`: `TEAM <NAME> WINS` in the winner's colour, or `DRAW`, and below `NEXT ROUND IN <timer>`.
  - When your own team is eliminated and the round isn't over: `YOUR CAMP HAS FALLEN` (the panel from Task 12 shows the options).
  - Use a second BitmapText for the sub-line (scale 1).
- [ ] **Step 4: Feed lines.** Add `addLine(text, tint)`, which has the same behaviour as `addKill` (top right, fades). In `GameScene.handleEvent`:
  - `towerDown` → `${killerName ?? 'SOMEONE'} DESTROYED A ${TEAM} TOWER`;
  - `towerUp` → `${TEAM} TOWER REBUILT`;
  - `campDown` → `${TEAM} CAMP DESTROYED`, or `${TEAM} CAMP ABANDONED` when `by === null`;
  - `eliminated` → `TEAM ${TEAM} IS OUT`;
  - `roundWon` → nothing (the banner covers it).
  - Team names come from `teams.find((t) => t.id === e.team)?.name`.
- [ ] **Step 5: Enemy camp arrows.** In `edgeArrows`, add one arrow per **live enemy camp** (team colour, the same `place()` helper), shown whenever that camp is off screen. Keep a separate pool of `campArrows`.
- [ ] **Step 6: Spectating.** When `m.spectating`, the hint line shows `SPECTATING - WASD TO LOOK AROUND`, and the stats block shows `SPECTATING` instead of money.
- [ ] **Step 7:** Pass the new model fields from `GameScene.update`: `structures: mirror.structuresAt(rt)`, `round: mirror.round()`, `spectating: this.eliminatedPanel.spectating`.
- [ ] **Step 8: Verify** in the browser with two tabs. Check the banners in each phase, the strip updating as towers fall, the feed lines, and the arrows pointing at the enemy camp from your own camp. Take a screenshot.
- [ ] **Step 9:** Commit: `Task 16: HUD for camps, rounds and spectating`.

---

## Task 17: End-to-end check, benchmark, docs

**Files:**
- Modify: `README.md`, `docs/HANDOFF.md`
- Optional (recommended by HANDOFF): commit the CDP driver as `scripts/e2e/siege.mjs` if it came out clean

- [ ] **Step 1: Full round over CDP** (HANDOFF **Driving the game**). Start the server with `TEAMS=2 MAP=crossing` (preset, so no setup clicks) and open two Edge instances on `/?debug`.
  1. Instance A joins team0 (keys `1`, then `1`), and instance B joins team1.
  2. A's autopilot drives to team1's camp via a ford, kills 3 towers, then the camp. To keep the test short, B stays idle in its camp, and it is fine to set `CAMP` HP lower **only in a scratch copy**. Better: just run the autopilot longer.
  3. Check that both clients get the `over` banner, then a new `welcome` 15 s later, a rebuilt scene, both players on their old teams, and money at 0.
  4. Check the frame time (`prestep` → `postrender`) on CROSSING and on a RANDOM 8192 map. Record both.
- [ ] **Step 2: Setup flow without a preset.**
  1. Fresh server, tab 1: setup 3 teams / RANDOM. Tab 2 sees 3 teams and no setup screen.
  2. Close both tabs and reopen one. The setup screen is back.
- [ ] **Step 3: Server benchmark.** Re-run the capacity benchmark from HANDOFF **Capacity**: 16 bots on 2 teams on CROSSING, plus 16 bots on 4 teams on RANDOM 8192, firing nonstop, with wildlife. Record the tick time and the compressed snapshot size. The wild population is now up to 2.5× larger, so expect bigger snapshots than the table shows. If the tick time goes over 8 ms, look at `updateStructures` and the larger `wildTarget` first.
- [ ] **Step 4: Docs.**
  - **README:** the goal of the game, setup (TEAMS/MAP env vars), camps, towers and the field, and the controls (unchanged).
  - **HANDOFF:**
    - a new "Latest session: camp siege" section (what changed, the balance knobs `CAMP`/`TOWER_GUN`/`COUNTDOWN`/`INTERMISSION`/`wildTarget`, the measurements from steps 1 and 3);
    - update **What the game is**, **Architecture** (rounds, `Match.state` can be null), **Where things live** (new rows: maps and recipes, structures, rounds, ground chunks), **Known limitations** (remove item 9 "bigger maps need chunked ground"; add "only one fixed map, CROSSING (2 teams)" and "no minimap on an 8192 px world"), and the commit table;
    - test count.
- [ ] **Step 5:** Run `npm test` and `npm run build`. Both must pass. Commit: `Task 17: docs and measurements for camp siege`.
- [ ] **Step 6:** Use `superpowers:finishing-a-development-branch` to decide how to integrate (merge to `master`, push). Don't push without asking the user.
