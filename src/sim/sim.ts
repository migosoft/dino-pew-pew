import type { GameState, InputCommand } from './types';
import { getDino } from './defs/dinos';
import { makeRng } from './rng';
import { generateWorld, type WorldGenOptions } from './worldgen';
import { createTeam, updatePlayers } from './players';
import { applyCurrent, moveDino, terrainSpeedFactor } from './systems/movement';
import { resolveDinoContacts, resolveObstacles } from './systems/collision';
import { selectFiringMounts, selectSideMounts, updateAim } from './systems/aiming';
import { fireMounts } from './systems/firing';
import { updateProjectiles } from './systems/projectiles';
import { feed, updateFood } from './systems/feeding';
import { updateMelee } from './systems/melee';
import { updateStructures } from './systems/structures';
import { tryStartAbility, updateAbility } from './systems/abilities';
import { forgetDinoIndex, isAirborne } from './world';
import { computeWildCommand } from './ai';
import { populateWild, updateEcology } from './ecology';
import { buildDinoGrid } from './spatial';

export interface MatchOptions {
  /** Spawn and maintain wild dinosaurs (default false; the game server turns it on). */
  wildlife?: boolean;
  /** Create this many teams (with camps) right away. Default 0: tests add teams with createTeam. */
  teams?: number;
  /** Camps, towers and rounds (default true). Old unit tests about other systems turn them off. */
  camps?: boolean;
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

/**
 * Advance the simulation one fixed tick. `inputs` holds the latest command per
 * player id; ridden dinos without input coast. Events from this tick are left in
 * state.events.
 */
export function step(state: GameState, inputs: Map<number, InputCommand>, dt: number): void {
  state.events = [];
  state.tick++;
  updatePlayers(state, dt);
  // For the wild AI's neighbour searches below.
  buildDinoGrid(state);

  for (const d of state.dinos) {
    if (!d.alive) continue;
    d.px = d.x;
    d.py = d.y;
    d.pheading = d.heading;
    d.hitFlash = Math.max(0, d.hitFlash - dt);
    d.sinceHit += dt;
    d.abilityCooldown = Math.max(0, d.abilityCooldown - dt);
    for (const m of d.mounts) m.cooldown = Math.max(0, m.cooldown - dt);

    const cmd = d.playerId !== null ? inputs.get(d.playerId) : d.ai ? computeWildCommand(state, d, dt) : undefined;
    // A running leap or dash steers the dino by itself; the rider can still aim and fire.
    const busy = updateAbility(state, d, dt);
    // Rivers sweep small dinos along, whatever they are doing (a leap is in the air).
    applyCurrent(state.world, d, dt);
    if (!cmd) {
      // No input (e.g. connection hiccup): roll to a stop.
      if (!busy) {
        moveDino(d, { throttle: 0, turn: 0, aimWorld: d, fire: false }, dt, terrainSpeedFactor(state.world, d));
        resolveObstacles(state, d);
      }
      feed(state, d, false, dt);
      continue;
    }

    if (!busy) {
      moveDino(d, cmd, dt, terrainSpeedFactor(state.world, d));
      resolveObstacles(state, d);
      tryStartAbility(state, d, cmd);
    }
    const def = getDino(d.kind);
    const errors = updateAim(d, def, cmd.aimWorld, dt);
    // Only riders operate the mounted weapons.
    const firing = cmd.fire && d.playerId !== null;
    if (firing) {
      const mounts = def.volley ? def.mounts.map((_, i) => i) : def.fireMode === 'side' ? selectSideMounts(d, def, cmd.aimWorld) : selectFiringMounts(errors);
      fireMounts(state, d, mounts);
    }
    feed(state, d, firing, dt);
  }

  resolveDinoContacts(state);
  updateMelee(state, dt);
  updateStructures(state, dt);
  for (const d of state.dinos) if (d.alive && !isAirborne(d)) resolveObstacles(state, d);
  updateProjectiles(state, dt);
  updateFood(state, dt);
  let n = 0;
  for (const d of state.dinos) if (d.alive) state.dinos[n++] = d;
  if (n < state.dinos.length) {
    state.dinos.length = n;
    forgetDinoIndex(state);
  }
  if (state.wildlife) updateEcology(state, dt, state.wildSpawnTimer);
}
