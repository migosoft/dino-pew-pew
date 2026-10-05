import type { Dino, GameState } from '../types';
import { WILD_TEAM } from '../types';
import { getDino } from '../defs/dinos';
import { angleDiff, angleTo } from '../math';
import { applyDamage } from './damage';
import { isAirborne } from '../world';
import { damageStructure, structuresInArc } from './structures';
import { buildDinoGrid, dinosNear, maxDinoRadius } from '../spatial';

const near: number[] = [];

/**
 * Who may attack whom. Riders fight other teams and wild dinos; wild dinos fight riders;
 * among wild dinos only carnivores attack herbivores (hunting), or anyone attacks back.
 */
export function isHostile(a: Dino, b: Dino): boolean {
  if (a.team !== WILD_TEAM || b.team !== WILD_TEAM) return a.team !== b.team;
  if (a.lastAttacker === b.id) return true;
  return getDino(a.kind).diet === 'carnivore' && getDino(b.kind).diet === 'herbivore';
}

/** Every dino strikes the nearest hostile right in front of it when its attack is ready (not while leaping). */
export function updateMelee(state: GameState, dt: number): void {
  buildDinoGrid(state);
  for (const a of state.dinos) {
    if (!a.alive) continue;
    a.meleeCooldown = Math.max(0, a.meleeCooldown - dt);
    if (a.meleeCooldown > 0 || isAirborne(a)) continue;
    const def = getDino(a.kind);
    let best: Dino | undefined;
    let bestD = Infinity;
    for (const j of dinosNear(state, a.x, a.y, def.radius + maxDinoRadius() + def.melee.reach, near)) {
      const b = state.dinos[j];
      if (b === a || !b.alive) continue;
      const dd = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      if (dd >= bestD) continue;
      const reach = def.radius + getDino(b.kind).radius + def.melee.reach;
      if (dd > reach * reach || isAirborne(b) || !isHostile(a, b)) continue;
      if (Math.abs(angleDiff(angleTo(a, b), a.heading)) > def.melee.arc) continue;
      best = b;
      bestD = dd;
    }
    if (!best) {
      // Riders also hack at enemy camp buildings and towers right in front of them.
      const s = structuresInArc(state, a, def.melee.reach, a.heading, def.melee.arc)[0];
      if (!s) continue;
      a.meleeCooldown = def.melee.interval;
      const ang = angleTo(a, s);
      damageStructure(state, s, def.melee.damage * a.damageMul, a.id, s.x - Math.cos(ang) * s.radius, s.y - Math.sin(ang) * s.radius);
      continue;
    }
    a.meleeCooldown = def.melee.interval;
    const x = (a.x + best.x) / 2;
    const y = (a.y + best.y) / 2;
    state.events.push({ type: 'melee', attackerId: a.id, targetId: best.id, x, y });
    applyDamage(state, best, def.melee.damage * a.damageMul, a.id);
  }
}
