import type { GameState } from './types';
import { WILD_TEAM } from './types';
import { getDino } from './defs/dinos';
import { rand, randRange } from './rng';
import { createDino, isDeepWater, isFree } from './world';
import { BASE_CLEAR } from './worldgen';
import { makeWildAi } from './ai';

/** Wild population scales with the number of riders (sized for the 3072 px map). */
export function wildTarget(players: number): number {
  return Math.min(70, 18 + 4 * players);
}
/** Fraction of the wild population that are herbivores. */
export const HERBIVORE_SHARE = 0.7;
/** Seconds between wild spawns while below target. */
export const WILD_SPAWN_INTERVAL = 2;
/** Wild dinos never appear this close to a rider (so they don't pop up on screen). */
export const SPAWN_AWAY_FROM_RIDERS = 340;

/** Herbivore species, listed by how often they appear: about 1 in 4 is a Brontosaurus. */
const HERBIVORES = ['triceratops', 'triceratops', 'triceratops', 'brontosaurus'];
const CARNIVORES = ['velociraptor'];

/** Spawn one wild dino of the needed diet somewhere unseen. Returns false if no spot was found. */
export function spawnWild(state: GameState): boolean {
  const wild = state.dinos.filter((d) => d.alive && d.team === WILD_TEAM);
  const herbs = wild.filter((d) => getDino(d.kind).diet === 'herbivore').length;
  const wantHerb = herbs < Math.round((wild.length + 1) * HERBIVORE_SHARE);
  const pool = wantHerb ? HERBIVORES : CARNIVORES;
  const kind = pool[Math.floor(rand(state.rng) * pool.length)];
  const def = getDino(kind);
  const riders = state.dinos.filter((d) => d.alive && d.playerId !== null);
  const { width, height, bases } = state.world;
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = randRange(state.rng, 120, width - 120);
    const y = randRange(state.rng, 120, height - 120);
    if (!isFree(state.world, x, y, def.radius + 6) || isDeepWater(state.world, x, y)) continue;
    if (bases.some((b) => (b.x - x) ** 2 + (b.y - y) ** 2 < (BASE_CLEAR + 80) ** 2)) continue;
    if (riders.some((r) => (r.x - x) ** 2 + (r.y - y) ** 2 < SPAWN_AWAY_FROM_RIDERS ** 2)) continue;
    if (wild.some((w) => (w.x - x) ** 2 + (w.y - y) ** 2 < 50 * 50)) continue;
    const d = createDino(state, kind, WILD_TEAM, x, y, rand(state.rng) * Math.PI * 2, null);
    d.ai = makeWildAi(state);
    return true;
  }
  return false;
}

/** Fill the world up to its wild population target at once (match start). */
export function populateWild(state: GameState): void {
  const target = wildTarget(state.players.length);
  for (let i = 0; i < target; i++) if (!spawnWild(state)) break;
}

/** Top up the wild population gradually. */
export function updateEcology(state: GameState, dt: number, timer: { t: number }): void {
  timer.t -= dt;
  if (timer.t > 0) return;
  timer.t = WILD_SPAWN_INTERVAL;
  const wild = state.dinos.filter((d) => d.alive && d.team === WILD_TEAM).length;
  if (wild < wildTarget(state.players.length)) spawnWild(state);
}
