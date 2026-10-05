import { describe, expect, it } from 'vitest';
import type { DinoDef, FoodKind, FoodSource, GameState } from '../../src/sim/types';
import { getDino, registerDino } from '../../src/sim/defs/dinos';
import { createMatch, step } from '../../src/sim/sim';
import { generateWorld, MAX_WORLD_CARCASSES, MIN_WORLD_CARCASSES } from '../../src/sim/worldgen';
import { createDino } from '../../src/sim/world';
import { addPlayer, createTeam } from '../../src/sim/players';
import { applyDamage } from '../../src/sim/systems/damage';
import { CARCASS_DECAY_SECS, FOOD, REGROW_DELAY, addCarcassFor, canEat, feed, findFood, makeCarcass, updateFood } from '../../src/sim/systems/feeding';
import { foodNear } from '../../src/sim/spatial';
import { makeRng, randRange } from '../../src/sim/rng';

const DT = 1 / 60;

// Test-only small herbivore (no real one exists yet) to pin down the tree rule.
const SMALL_HERBIVORE: DinoDef = { ...getDino('triceratops'), kind: 'test-small-herbivore', size: 'small', mounts: [], head: undefined };
registerDino(SMALL_HERBIVORE);
const OMNIVORE: DinoDef = { ...getDino('triceratops'), kind: 'test-omnivore', diet: 'omnivore', mounts: [], head: undefined };
registerDino(OMNIVORE);

function plant(kind: FoodKind, x: number, y: number): FoodSource {
  const t = FOOD[kind];
  return { id: 1, kind, x, y, reach: 8, food: t.maxFood, maxFood: t.maxFood, costPerHp: t.costPerHp, idle: 0, variant: 0 };
}

/** An empty match with one hurt dino standing next to one food source. */
function scene(kind: string, food: FoodSource): { s: GameState; d: ReturnType<typeof createDino>; f: FoodSource } {
  const s = createMatch(5, { cols: 30, rows: 30 });
  s.world.obstacles = [];
  s.world.grid = s.world.grid.map(() => []);
  s.food = [food];
  const d = createDino(s, kind, 'wild', food.x + 6, food.y, 0);
  d.hp = 10;
  return { s, d, f: food };
}

describe('diet rules', () => {
  it('herbivores eat plants, carnivores eat carcasses', () => {
    const tri = getDino('triceratops');
    const raptor = getDino('velociraptor');
    for (const k of ['bush', 'fern', 'tree'] as FoodKind[]) {
      expect(canEat(tri, k)).toBe(true);
      expect(canEat(raptor, k)).toBe(false);
    }
    expect(canEat(tri, 'carcass')).toBe(false);
    expect(canEat(raptor, 'carcass')).toBe(true);
  });

  it('small herbivores cannot reach trees, only bushes and ferns', () => {
    expect(canEat(SMALL_HERBIVORE, 'tree')).toBe(false);
    expect(canEat(SMALL_HERBIVORE, 'bush')).toBe(true);
    expect(canEat(SMALL_HERBIVORE, 'fern')).toBe(true);
  });

  it('omnivores eat everything', () => {
    for (const k of ['bush', 'fern', 'tree', 'carcass'] as FoodKind[]) expect(canEat(OMNIVORE, k)).toBe(true);
  });

  it('every species declares a diet and size', () => {
    for (const kind of ['triceratops', 'velociraptor']) {
      expect(['herbivore', 'carnivore', 'omnivore']).toContain(getDino(kind).diet);
      expect(['small', 'large']).toContain(getDino(kind).size);
    }
  });
});

describe('eating', () => {
  it('a hurt herbivore standing at a bush heals and the bush depletes', () => {
    const { s, d, f } = scene('triceratops', plant('bush', 100, 100));
    feed(s, d, false, 1);
    expect(d.hp).toBeCloseTo(20, 5);
    expect(d.eating).toBe(true);
    expect(f.food).toBeCloseTo(FOOD.bush.maxFood - 10, 5);
  });

  it('a carnivore ignores plants but eats carcasses', () => {
    const a = scene('velociraptor', plant('bush', 100, 100));
    feed(a.s, a.d, false, 1);
    expect(a.d.hp).toBe(10);
    const b = scene('velociraptor', makeCarcass(5, 'triceratops', 100, 100, 0));
    feed(b.s, b.d, false, 1);
    expect(b.d.hp).toBeGreaterThan(10);
  });

  it('a small herbivore cannot eat from a tree', () => {
    const { s, d } = scene('test-small-herbivore', plant('tree', 100, 100));
    feed(s, d, false, 1);
    expect(d.hp).toBe(10);
  });

  it('carcasses deplete 4x slower per HP than plants', () => {
    const p = scene('triceratops', plant('bush', 100, 100));
    feed(p.s, p.d, false, 1);
    const c = scene('velociraptor', makeCarcass(5, 'triceratops', 100, 100, 0));
    feed(c.s, c.d, false, 1);
    const plantCost = (FOOD.bush.maxFood - p.f.food) / (p.d.hp - 10);
    const carcassCost = (c.f.maxFood - c.f.food) / (c.d.hp - 10);
    expect(plantCost / carcassCost).toBeCloseTo(4, 5);
    // A full large carcass heals far more in total than any plant.
    expect(c.f.maxFood / c.f.costPerHp).toBeGreaterThan(10 * (FOOD.tree.maxFood / FOOD.tree.costPerHp));
  });

  it('no eating while moving, firing, at full health, or out of reach', () => {
    const moving = scene('triceratops', plant('bush', 100, 100));
    moving.d.speed = 40;
    feed(moving.s, moving.d, false, 1);
    const firing = scene('triceratops', plant('bush', 100, 100));
    feed(firing.s, firing.d, true, 1);
    const full = scene('triceratops', plant('bush', 100, 100));
    full.d.hp = full.d.maxHp;
    feed(full.s, full.d, false, 1);
    const far = scene('triceratops', plant('bush', 100, 100));
    far.d.x += 60;
    feed(far.s, far.d, false, 1);
    expect([moving.d.hp, firing.d.hp, far.d.hp]).toEqual([10, 10, 10]);
    expect(full.f.food).toBe(FOOD.bush.maxFood);
  });

  it('plants regrow after a pause; empty carcasses vanish', () => {
    const p = scene('triceratops', plant('bush', 100, 100));
    p.f.food = 5;
    updateFood(p.s, REGROW_DELAY - 0.1);
    expect(p.f.food).toBe(5);
    updateFood(p.s, 10);
    expect(p.f.food).toBeGreaterThan(5);
    const c = scene('velociraptor', makeCarcass(5, 'velociraptor', 100, 100, 0));
    c.f.food = 0;
    updateFood(c.s, DT);
    expect(c.s.food).toHaveLength(0);
  });

  it('an untouched carcass rots away in CARCASS_DECAY_SECS', () => {
    const c = scene('velociraptor', makeCarcass(5, 'triceratops', 100, 100, 0));
    for (let i = 0; i < (CARCASS_DECAY_SECS / 2) * 60; i++) updateFood(c.s, DT);
    expect(c.s.food).toHaveLength(1);
    expect(c.f.food).toBeCloseTo(c.f.maxFood / 2, 0);
    for (let i = 0; i < (CARCASS_DECAY_SECS / 2) * 60 + 2; i++) updateFood(c.s, DT);
    expect(c.s.food).toHaveLength(0);
  });

  it('small species leave smaller carcasses', () => {
    expect(makeCarcass(1, 'velociraptor', 0, 0, 0).maxFood).toBeLessThan(makeCarcass(2, 'triceratops', 0, 0, 0).maxFood);
  });
});

describe('carcasses in the world', () => {
  it('a killed dino leaves a carcass of its species', () => {
    const s = createMatch(8);
    const p = addPlayer(s, createTeam(s)!.id, 'velociraptor', 'A');
    const d = s.dinos.find((x) => x.playerId === p.id)!;
    d.x = d.px = s.world.width / 2; // out of the safe zone
    d.y = d.py = s.world.height / 2;
    const before = s.food.filter((f) => f.kind === 'carcass').length;
    applyDamage(s, d, 999, -1);
    const carcasses = s.food.filter((f) => f.kind === 'carcass');
    expect(carcasses).toHaveLength(before + 1);
    expect(carcasses.at(-1)!.species).toBe('velociraptor');
  });

  it('the world starts with a handful of old carcasses and plenty of plants, none in base camps', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = generateWorld(seed);
      const n = w.food.filter((f) => f.kind === 'carcass').length;
      expect(n).toBeGreaterThanOrEqual(MIN_WORLD_CARCASSES);
      expect(n).toBeLessThanOrEqual(MAX_WORLD_CARCASSES);
      expect(w.food.filter((f) => f.kind === 'bush').length).toBeGreaterThan(40);
      expect(w.food.filter((f) => f.kind === 'fern').length).toBeGreaterThan(20);
      for (const b of w.bases) for (const f of w.food) expect(Math.hypot(f.x - b.x, f.y - b.y)).toBeGreaterThan(100);
    }
  });

  it('a rider standing still at food heals over time through the full step()', () => {
    const s = createMatch(8);
    const p = addPlayer(s, createTeam(s)!.id, 'triceratops', 'A');
    const d = s.dinos.find((x) => x.playerId === p.id)!;
    const bush = s.food.find((f) => f.kind === 'bush')!;
    d.x = d.px = bush.x + 10;
    d.y = d.py = bush.y;
    d.hp = 50;
    const idle = { throttle: 0, turn: 0, aimWorld: { x: 0, y: 0 }, fire: false };
    for (let i = 0; i < 120; i++) step(s, new Map([[p.id, idle]]), DT);
    expect(d.hp).toBeGreaterThan(65);
  });
});

describe('velociraptor', () => {
  it('is faster, smaller and has a weaker gun than the triceratops, firing to the front', () => {
    const r = getDino('velociraptor');
    const t = getDino('triceratops');
    expect(r.maxSpeed).toBeGreaterThan(t.maxSpeed * 1.4);
    expect(r.radius).toBeLessThan(t.radius);
    expect(r.mounts[0].baseAngle).toBe(0);
    expect(r.mounts[0].arcHalf + (r.head?.maxYaw ?? 0)).toBeLessThan(t.mounts[0].arcHalf + t.head!.maxYaw);
  });
});

describe('food grid', () => {
  /** The old linear scan that findFood replaced. */
  function bruteFindFood(s: GameState, d: ReturnType<typeof createDino>): FoodSource | undefined {
    const def = getDino(d.kind);
    let best: FoodSource | undefined;
    let bestD = Infinity;
    for (const f of s.food) {
      if (f.food <= 0 || !canEat(def, f.kind)) continue;
      const reach = f.reach + def.radius;
      const dd = (f.x - d.x) ** 2 + (f.y - d.y) ** 2;
      if (dd <= reach * reach && dd < bestD) {
        best = f;
        bestD = dd;
      }
    }
    return best;
  }

  it('finds the same food as a full scan, on a real world', () => {
    const s = createMatch(3);
    const rng = makeRng(9);
    const d = createDino(s, 'triceratops', 'wild', 0, 0, 0);
    const out: number[] = [];
    for (let k = 0; k < 2000; k++) {
      // Half the probes stand right next to a food source, the rest anywhere.
      const f = s.food[Math.floor(randRange(rng, 0, s.food.length))];
      d.x = k % 2 ? f.x + randRange(rng, -20, 20) : randRange(rng, 0, s.world.width);
      d.y = k % 2 ? f.y + randRange(rng, -20, 20) : randRange(rng, 0, s.world.height);
      expect(findFood(s, d)).toBe(bruteFindFood(s, d));
      const r = 300;
      const got = new Set(foodNear(s, d.x, d.y, r, out));
      s.food.forEach((g, i) => {
        if (Math.hypot(g.x - d.x, g.y - d.y) <= r) expect(got.has(i)).toBe(true);
      });
    }
  });

  it('sees carcasses as they appear and rot away', () => {
    const s = createMatch(3);
    const d = createDino(s, 'trex', 'wild', 1000, 1000, 0);
    d.hp = 10;
    const victim = createDino(s, 'velociraptor', 'wild', 1010, 1000, 0);
    s.food = s.food.filter((f) => f.kind !== 'carcass');
    expect(findFood(s, d)).toBeUndefined();
    const c = addCarcassFor(s, victim);
    expect(findFood(s, d)).toBe(c);
    c.food = 0;
    updateFood(s, DT);
    expect(findFood(s, d)).toBeUndefined();
  });
});
