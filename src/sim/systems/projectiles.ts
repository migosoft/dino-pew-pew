import type { GameState } from '../types';
import { getDino } from '../defs/dinos';
import { forEachObstacleNear } from '../world';
import { applyDamage } from './damage';
import { BASE_RADIUS } from '../players';

export function updateProjectiles(state: GameState, dt: number): void {
  const { world } = state;
  for (const p of state.projectiles) {
    if (!p.alive) continue;
    p.px = p.x;
    p.py = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.traveled += Math.hypot(p.vx, p.vy) * dt;

    if (p.traveled >= p.range || p.x < 0 || p.y < 0 || p.x > world.width || p.y > world.height) {
      p.alive = false;
      continue;
    }

    forEachObstacleNear(world, p.x, p.y, p.radius, (o) => {
      const rr = o.r + p.radius;
      if ((o.x - p.x) ** 2 + (o.y - p.y) ** 2 < rr * rr) {
        p.alive = false;
        state.events.push({ type: 'impact', projectileId: p.id, x: p.x, y: p.y });
        return true;
      }
    });
    if (!p.alive) continue;

    // Other teams' base camps are shielded: hostile shots fizzle at the edge.
    for (const t of state.teams) {
      if (t.id === p.team) continue;
      if ((t.base.x - p.x) ** 2 + (t.base.y - p.y) ** 2 < BASE_RADIUS * BASE_RADIUS) {
        p.alive = false;
        state.events.push({ type: 'impact', projectileId: p.id, x: p.x, y: p.y });
        break;
      }
    }
    if (!p.alive) continue;

    for (const d of state.dinos) {
      if (!d.alive || d.team === p.team) continue;
      const rr = getDino(d.kind).radius + p.radius;
      if ((d.x - p.x) ** 2 + (d.y - p.y) ** 2 < rr * rr) {
        p.alive = false;
        state.events.push({ type: 'hit', projectileId: p.id, x: p.x, y: p.y, targetId: d.id });
        applyDamage(state, d, p.damage, p.ownerId);
        break;
      }
    }
  }
  state.projectiles = state.projectiles.filter((p) => p.alive);
}
