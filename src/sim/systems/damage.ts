import type { Dino, GameState } from '../types';
import { findDino } from '../world';
import { onPlayerDinoDeath } from '../players';
import { addCarcassFor } from './feeding';

/** Deal damage from `sourceDinoId` (may already be dead/gone). */
export function applyDamage(state: GameState, target: Dino, amount: number, sourceDinoId: number): void {
  if (!target.alive) return;
  target.hp -= amount * (1 - target.armor);
  target.hitFlash = 0.12;
  target.lastAttacker = sourceDinoId;
  target.sinceHit = 0;
  if (target.hp > 0) return;
  target.hp = 0;
  target.alive = false;
  state.events.push({ type: 'death', dinoId: target.id, x: target.x, y: target.y, team: target.team });
  addCarcassFor(state, target);
  const tower = state.structures.find((s) => s.id === sourceDinoId && s.kind === 'tower');
  onPlayerDinoDeath(state, target, findDino(state, sourceDinoId), tower?.team);
}
