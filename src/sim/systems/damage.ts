import type { Dino, GameState } from '../types';

export const KILL_SCORE = 100;

export function applyDamage(state: GameState, target: Dino, amount: number, sourceId: number): void {
  if (!target.alive) return;
  target.hp -= amount;
  target.hitFlash = 0.12;
  if (target.hp > 0) return;
  target.hp = 0;
  target.alive = false;
  state.events.push({ type: 'death', dinoId: target.id, x: target.x, y: target.y, team: target.team });
  if (target.team === 'enemy' && sourceId === state.playerId) state.score += KILL_SCORE;
  if (target.id === state.playerId && !state.gameOver) {
    state.gameOver = true;
    state.events.push({ type: 'gameOver' });
  }
}
