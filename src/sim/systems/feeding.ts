import type { Dino, DinoDef, FoodKind, FoodSource, GameState } from '../types';
import { getDino } from '../defs/dinos';

/** Per-kind food tuning. Carcasses hold more and cost 1/4 food per HP: a steady supply for carnivores. */
export const FOOD: Record<FoodKind, { maxFood: number; costPerHp: number; regrowPerSec: number }> = {
  fern: { maxFood: 25, costPerHp: 1, regrowPerSec: 1.2 },
  bush: { maxFood: 40, costPerHp: 1, regrowPerSec: 1.2 },
  tree: { maxFood: 80, costPerHp: 1, regrowPerSec: 1.2 },
  carcass: { maxFood: 240, costPerHp: 0.25, regrowPerSec: 0 },
};
/** Plants start regrowing after this long without being eaten. */
export const REGROW_DELAY = 5;
/** A dino must be (nearly) standing still to eat. */
export const EAT_MAX_SPEED = 12;
/** Carcasses of small species hold less food. */
export const SMALL_CARCASS_FRACTION = 0.6;
/** Carcass ids live in their own range so they never collide with world plant ids. */
export const CARCASS_ID_BASE = 1_000_000;
/** An untouched carcass rots away completely in this many seconds. */
export const CARCASS_DECAY_SECS = 120;

/** The diet rule, in one place: what a species can eat. */
export function canEat(def: DinoDef, kind: FoodKind): boolean {
  const plant = kind === 'bush' || kind === 'fern' || (kind === 'tree' && def.size === 'large');
  switch (def.diet) {
    case 'herbivore':
      return plant;
    case 'carnivore':
      return kind === 'carcass';
    case 'omnivore':
      return plant || kind === 'carcass';
  }
}

export function carcassReach(species: string): number {
  return getDino(species).radius + 2;
}

export function makeCarcass(id: number, species: string, x: number, y: number, heading: number): FoodSource {
  const small = getDino(species).size === 'small';
  const maxFood = FOOD.carcass.maxFood * (small ? SMALL_CARCASS_FRACTION : 1);
  return {
    id,
    kind: 'carcass',
    x,
    y,
    reach: carcassReach(species),
    food: maxFood,
    maxFood,
    costPerHp: FOOD.carcass.costPerHp,
    idle: 0,
    variant: 0,
    species,
    heading,
  };
}

/** Leave a carcass where a dino died. */
export function addCarcassFor(state: GameState, d: Dino): FoodSource {
  const c = makeCarcass(CARCASS_ID_BASE + state.nextId++, d.kind, d.x, d.y, d.heading);
  state.food.push(c);
  return c;
}

/** Nearest food this dino could eat right now (in reach, not empty), if any. */
export function findFood(state: GameState, d: Dino): FoodSource | undefined {
  const def = getDino(d.kind);
  let best: FoodSource | undefined;
  let bestD = Infinity;
  for (const f of state.food) {
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

/** A dino that is hurt, (nearly) still and not firing eats from the nearest eligible food. */
export function feed(state: GameState, d: Dino, firing: boolean, dt: number): void {
  d.eating = false;
  if (firing || d.hp >= d.maxHp || Math.abs(d.speed) > EAT_MAX_SPEED) return;
  const f = findFood(state, d);
  if (!f) return;
  const def = getDino(d.kind);
  const heal = Math.min(def.eatRate * dt, d.maxHp - d.hp, f.food / f.costPerHp);
  d.hp += heal;
  f.food -= heal * f.costPerHp;
  f.idle = 0;
  d.eating = true;
}

/** Plants regrow after a pause; carcasses rot, and eaten-up or rotten ones disappear. */
export function updateFood(state: GameState, dt: number): void {
  let gone = false;
  for (const f of state.food) {
    if (f.kind === 'carcass') {
      f.food -= (f.maxFood / CARCASS_DECAY_SECS) * dt;
      if (f.food <= 0) gone = true;
      continue;
    }
    f.idle += dt;
    if (f.idle >= REGROW_DELAY && f.food < f.maxFood) f.food = Math.min(f.maxFood, f.food + FOOD[f.kind].regrowPerSec * dt);
  }
  if (gone) state.food = state.food.filter((f) => f.kind !== 'carcass' || f.food > 0);
}
