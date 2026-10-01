import type { Dino, GameState } from '../types';
import { getDino } from '../defs/dinos';
import { clamp } from '../math';
import { forEachObstacleNear } from '../world';
import { applyDamage } from './damage';

const BUMP_DAMAGE = 3;
const BUMP_MIN_SPEED = 35;

/** Push a dino out of rocks, tree trunks and the map edge. */
export function resolveObstacles(state: GameState, d: Dino): void {
  const { world } = state;
  const r = getDino(d.kind).radius;
  forEachObstacleNear(world, d.x, d.y, r + 4, (o) => {
    const dx = d.x - o.x;
    const dy = d.y - o.y;
    const min = o.r + r;
    const dd = dx * dx + dy * dy;
    if (dd < min * min) {
      const dist = Math.sqrt(dd) || 0.0001;
      const push = min - dist;
      d.x += (dx / dist) * push;
      d.y += (dy / dist) * push;
      // Scraping along a rock bleeds speed, hitting it head-on more so.
      const headOn = Math.abs((Math.cos(d.heading) * dx + Math.sin(d.heading) * dy) / dist);
      d.speed *= 1 - 0.25 * headOn;
    }
  });
  d.x = clamp(d.x, r, world.width - r);
  d.y = clamp(d.y, r, world.height - r);
}

/** Separate overlapping dinos; enemies ramming each other take a little damage. */
export function resolveDinoContacts(state: GameState): void {
  const ds = state.dinos;
  for (let i = 0; i < ds.length; i++) {
    const a = ds[i];
    if (!a.alive) continue;
    const ra = getDino(a.kind).radius;
    for (let j = i + 1; j < ds.length; j++) {
      const b = ds[j];
      if (!b.alive) continue;
      const rb = getDino(b.kind).radius;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = ra + rb;
      const dd = dx * dx + dy * dy;
      if (dd >= min * min) continue;
      const dist = Math.sqrt(dd) || 0.0001;
      const push = (min - dist) / 2;
      const nx = dx / dist;
      const ny = dy / dist;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      if (a.team !== b.team && Math.max(Math.abs(a.speed), Math.abs(b.speed)) > BUMP_MIN_SPEED) {
        if (a.bumpCooldown <= 0) applyDamage(state, a, BUMP_DAMAGE, b.id);
        if (b.bumpCooldown <= 0) applyDamage(state, b, BUMP_DAMAGE, a.id);
        a.bumpCooldown = b.bumpCooldown = 0.5;
      }
      a.speed *= 0.85;
      b.speed *= 0.85;
    }
  }
}
