import type { Dino, GameState } from '../types';
import { WILD_TEAM } from '../types';
import { getDino } from '../defs/dinos';
import { angleDiff, angleTo } from '../math';
import { applyDamage } from './damage';

/**
 * Who may attack whom. Riders fight other teams and wild dinos; wild dinos fight riders;
 * among wild dinos only carnivores attack herbivores (hunting), or anyone attacks back.
 */
export function isHostile(a: Dino, b: Dino): boolean {
  if (a.team !== WILD_TEAM || b.team !== WILD_TEAM) return a.team !== b.team;
  if (a.lastAttacker === b.id) return true;
  return getDino(a.kind).diet === 'carnivore' && getDino(b.kind).diet === 'herbivore';
}

/** Every dino strikes the nearest hostile right in front of it when its attack is ready. */
export function updateMelee(state: GameState, dt: number): void {
  for (const a of state.dinos) {
    if (!a.alive) continue;
    a.meleeCooldown = Math.max(0, a.meleeCooldown - dt);
    if (a.meleeCooldown > 0) continue;
    const def = getDino(a.kind);
    let best: Dino | undefined;
    let bestD = Infinity;
    for (const b of state.dinos) {
      if (b === a || !b.alive || !isHostile(a, b)) continue;
      const reach = def.radius + getDino(b.kind).radius + def.melee.reach;
      const dd = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      if (dd > reach * reach || dd >= bestD) continue;
      if (Math.abs(angleDiff(angleTo(a, b), a.heading)) > def.melee.arc) continue;
      best = b;
      bestD = dd;
    }
    if (!best) continue;
    a.meleeCooldown = def.melee.interval;
    const x = (a.x + best.x) / 2;
    const y = (a.y + best.y) / 2;
    state.events.push({ type: 'melee', attackerId: a.id, targetId: best.id, x, y });
    applyDamage(state, best, def.melee.damage * a.damageMul, a.id);
  }
}
