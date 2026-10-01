import type { GameState } from './types';
import { getDino } from './defs/dinos';
import { angleTo } from './math';
import { rand, randRange } from './rng';
import { createDino, getPlayer, isFree } from './world';
import { makeAiState } from './ai';

export const FIRST_WAVE_DELAY = 4;
export const WAVE_INTERMISSION = 4;
export const WAVE_CLEAR_SCORE = 250;
export const WAVE_CLEAR_HEAL = 25;
const MAX_ENEMIES = 12;

export function enemiesForWave(n: number): number {
  return Math.min(MAX_ENEMIES, 2 + n);
}

function spawnWave(state: GameState): void {
  const n = state.wave.number;
  const player = getPlayer(state);
  const cx = player ? player.x : state.world.spawn.x;
  const cy = player ? player.y : state.world.spawn.y;
  const count = enemiesForWave(n);
  const def = getDino('triceratops');
  for (let k = 0; k < count; k++) {
    // Just outside the view, inside the map, on free ground.
    for (let attempt = 0; attempt < 60; attempt++) {
      const a = rand(state.rng) * Math.PI * 2;
      const r = randRange(state.rng, 300, 420);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (!isFree(state.world, x, y, def.radius + 8)) continue;
      if (state.dinos.some((d) => (d.x - x) ** 2 + (d.y - y) ** 2 < 40 * 40)) continue;
      const e = createDino(state, 'triceratops', 'enemy', x, y, angleTo({ x, y }, { x: cx, y: cy }));
      e.maxHp = e.hp = Math.round(40 * (1 + 0.15 * (n - 1)));
      // Enemies hit softer and fire slower than the player; both ramp up each wave.
      e.damageMul = 0.5 * (1 + 0.06 * (n - 1));
      e.fireIntervalMul = Math.max(3, 6.5 - 0.35 * (n - 1));
      e.ai = makeAiState(state);
      break;
    }
  }
}

export function updateWaves(state: GameState, dt: number): void {
  const w = state.wave;
  if (state.gameOver) return;
  if (w.phase === 'intermission') {
    w.timer -= dt;
    if (w.timer <= 0) {
      w.number++;
      w.phase = 'active';
      spawnWave(state);
      state.events.push({ type: 'waveStart', wave: w.number });
    }
    return;
  }
  const enemiesLeft = state.dinos.some((d) => d.alive && d.team === 'enemy');
  if (!enemiesLeft) {
    state.events.push({ type: 'waveCleared', wave: w.number });
    state.score += WAVE_CLEAR_SCORE * w.number;
    const player = getPlayer(state);
    if (player) player.hp = Math.min(player.maxHp, player.hp + WAVE_CLEAR_HEAL);
    w.phase = 'intermission';
    w.timer = WAVE_INTERMISSION;
  }
}
