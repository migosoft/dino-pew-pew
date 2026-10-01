import type { GameState, InputCommand } from './types';
import { getDino } from './defs/dinos';
import { makeRng } from './rng';
import { generateWorld, type WorldGenOptions } from './worldgen';
import { createDino } from './world';
import { computeAiCommand } from './ai';
import { FIRST_WAVE_DELAY, updateWaves } from './waves';
import { moveDino } from './systems/movement';
import { resolveDinoContacts, resolveObstacles } from './systems/collision';
import { selectFiringMounts, updateAim } from './systems/aiming';
import { fireMounts } from './systems/firing';
import { updateProjectiles } from './systems/projectiles';

export function createGame(seed: number, worldOpts?: WorldGenOptions): GameState {
  const world = generateWorld(seed, worldOpts);
  const state: GameState = {
    tick: 0,
    rng: makeRng(seed),
    world,
    dinos: [],
    projectiles: [],
    events: [],
    nextId: 1,
    playerId: 0,
    wave: { number: 0, phase: 'intermission', timer: FIRST_WAVE_DELAY },
    score: 0,
    gameOver: false,
  };
  const player = createDino(state, 'triceratops', 'player', world.spawn.x, world.spawn.y, -Math.PI / 2);
  state.playerId = player.id;
  return state;
}

/**
 * Advance the simulation one fixed tick. `commands` holds input for human-controlled
 * dinos keyed by dino id (today: the local player; later: remote players). Dinos with
 * AI state compute their own command. Events from this tick are left in state.events.
 */
export function step(state: GameState, commands: Map<number, InputCommand>, dt: number): void {
  state.events = [];
  state.tick++;

  for (const d of state.dinos) {
    if (!d.alive) continue;
    d.px = d.x;
    d.py = d.y;
    d.pheading = d.heading;
    d.hitFlash = Math.max(0, d.hitFlash - dt);
    d.bumpCooldown = Math.max(0, d.bumpCooldown - dt);
    for (const m of d.mounts) m.cooldown = Math.max(0, m.cooldown - dt);

    const cmd = d.ai ? computeAiCommand(state, d, dt) : commands.get(d.id);
    if (!cmd) continue;

    moveDino(d, cmd, dt);
    resolveObstacles(state, d);
    const errors = updateAim(d, getDino(d.kind), cmd.aimWorld, dt);
    if (cmd.fire) fireMounts(state, d, selectFiringMounts(errors));
  }

  resolveDinoContacts(state);
  for (const d of state.dinos) if (d.alive) resolveObstacles(state, d);
  updateProjectiles(state, dt);
  // Dead enemies leave the sim (renderer reacts to the death event); the player stays for the game-over view.
  state.dinos = state.dinos.filter((d) => d.alive || d.id === state.playerId);
  updateWaves(state, dt);
}
