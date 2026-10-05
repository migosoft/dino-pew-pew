import type { Dino, GameState } from '../types';
import { getDino } from '../defs/dinos';
import { clamp } from '../math';
import { forEachObstacleNear, isAirborne } from '../world';
import { buildDinoGrid, dinosNear, maxDinoRadius } from '../spatial';

const near: number[] = [];

/** True if a circle overlaps a standing structure. */
export function structureBlocks(state: GameState, x: number, y: number, r: number): boolean {
  for (const s of state.structures) {
    if (s.hp <= 0) continue;
    const rr = s.radius + r;
    if ((s.x - x) ** 2 + (s.y - y) ** 2 < rr * rr) return true;
  }
  return false;
}

/** Push a dino out of rocks, tree trunks, standing structures and the map edge. */
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
  for (const s of state.structures) {
    if (s.hp <= 0) continue;
    const dx = d.x - s.x;
    const dy = d.y - s.y;
    const min = s.radius + r;
    const dd = dx * dx + dy * dy;
    if (dd >= min * min) continue;
    const dist = Math.sqrt(dd) || 0.0001;
    d.x += (dx / dist) * (min - dist);
    d.y += (dy / dist) * (min - dist);
    const headOn = Math.abs((Math.cos(d.heading) * dx + Math.sin(d.heading) * dy) / dist);
    d.speed *= 1 - 0.25 * headOn;
  }
  d.x = clamp(d.x, r, world.width - r);
  d.y = clamp(d.y, r, world.height - r);
}

/** Separate overlapping dinos (damage from contact is handled by melee). Leaping dinos pass over. */
export function resolveDinoContacts(state: GameState): void {
  const ds = state.dinos;
  buildDinoGrid(state);
  for (let i = 0; i < ds.length; i++) {
    const a = ds[i];
    if (!a.alive || isAirborne(a)) continue;
    const ra = getDino(a.kind).radius;
    for (const j of dinosNear(state, a.x, a.y, ra + maxDinoRadius(), near)) {
      if (j <= i) continue;
      const b = ds[j];
      if (!b.alive || isAirborne(b)) continue;
      const rb = getDino(b.kind).radius;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = ra + rb;
      const dd = dx * dx + dy * dy;
      if (dd >= min * min) continue;
      const dist = Math.sqrt(dd) || 0.0001;
      // Heavier (bigger) dinos get shoved less.
      const share = rb / (ra + rb);
      const overlap = min - dist;
      const nx = dx / dist;
      const ny = dy / dist;
      a.x -= nx * overlap * share;
      a.y -= ny * overlap * share;
      b.x += nx * overlap * (1 - share);
      b.y += ny * overlap * (1 - share);
      a.speed *= 0.85;
      b.speed *= 0.85;
    }
  }
}
