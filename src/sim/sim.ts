import type { GameState, InputCommand } from './types';
import { getDino } from './defs/dinos';
import { makeRng } from './rng';
import { generateWorld, type WorldGenOptions } from './worldgen';
import { updatePlayers } from './players';
import { moveDino } from './systems/movement';
import { resolveDinoContacts, resolveObstacles } from './systems/collision';
import { selectFiringMounts, updateAim } from './systems/aiming';
import { fireMounts } from './systems/firing';
import { updateProjectiles } from './systems/projectiles';
import { feed, updateFood } from './systems/feeding';
import { updateMelee } from './systems/melee';
import { computeWildCommand } from './ai';
import { populateWild, updateEcology } from './ecology';

export interface MatchOptions {
  /** Spawn and maintain wild dinosaurs (default false; the game server turns it on). */
  wildlife?: boolean;
}

/** A fresh, empty persistent match. Teams and players are added as people join. */
export function createMatch(seed: number, worldOpts?: WorldGenOptions, opts: MatchOptions = {}): GameState {
  const world = generateWorld(seed, worldOpts);
  const state: GameState = {
    tick: 0,
    rng: makeRng(seed),
    world,
    food: world.food.map((f) => ({ ...f })),
    dinos: [],
    projectiles: [],
    events: [],
    nextId: 1,
    teams: [],
    players: [],
    wildlife: opts.wildlife ?? false,
    wildSpawnTimer: { t: 0 },
  };
  if (state.wildlife) populateWild(state);
  return state;
}

/**
 * Advance the simulation one fixed tick. `inputs` holds the latest command per
 * player id; ridden dinos without input coast. Events from this tick are left in
 * state.events.
 */
export function step(state: GameState, inputs: Map<number, InputCommand>, dt: number): void {
  state.events = [];
  state.tick++;
  updatePlayers(state, dt);

  for (const d of state.dinos) {
    if (!d.alive) continue;
    d.px = d.x;
    d.py = d.y;
    d.pheading = d.heading;
    d.hitFlash = Math.max(0, d.hitFlash - dt);
    d.sinceHit += dt;
    for (const m of d.mounts) m.cooldown = Math.max(0, m.cooldown - dt);

    const cmd = d.playerId !== null ? inputs.get(d.playerId) : d.ai ? computeWildCommand(state, d, dt) : undefined;
    if (!cmd) {
      // No input (e.g. connection hiccup): roll to a stop.
      moveDino(d, { throttle: 0, turn: 0, aimWorld: d, fire: false }, dt);
      resolveObstacles(state, d);
      feed(state, d, false, dt);
      continue;
    }

    moveDino(d, cmd, dt);
    resolveObstacles(state, d);
    const errors = updateAim(d, getDino(d.kind), cmd.aimWorld, dt);
    // Only riders operate the mounted weapons.
    const firing = cmd.fire && d.playerId !== null;
    if (firing) fireMounts(state, d, selectFiringMounts(errors));
    feed(state, d, firing, dt);
  }

  resolveDinoContacts(state);
  updateMelee(state, dt);
  for (const d of state.dinos) if (d.alive) resolveObstacles(state, d);
  updateProjectiles(state, dt);
  updateFood(state, dt);
  state.dinos = state.dinos.filter((d) => d.alive);
  if (state.wildlife) updateEcology(state, dt, state.wildSpawnTimer);
}
