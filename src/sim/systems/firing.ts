import type { Dino, GameState } from '../types';
import { getDino } from '../defs/dinos';
import { getWeapon } from '../defs/weapons';
import { randRange } from '../rng';
import { mountFrame, muzzlePoint } from './aiming';

/** Fire the given mounts if off cooldown. Projectiles follow the barrel, not the cursor. */
export function fireMounts(state: GameState, d: Dino, mounts: number[]): void {
  const def = getDino(d.kind);
  for (const i of mounts) {
    const st = d.mounts[i];
    if (st.cooldown > 0) continue;
    const w = getWeapon(def.mounts[i].weapon);
    const barrel = mountFrame(d, def, i).angle;
    const angle = barrel + randRange(state.rng, -w.spread, w.spread);
    const muzzle = muzzlePoint(d, def, i);
    const id = state.nextId++;
    const vx = Math.cos(angle) * w.projectileSpeed;
    const vy = Math.sin(angle) * w.projectileSpeed;
    state.projectiles.push({
      id,
      ownerId: d.id,
      team: d.team,
      x: muzzle.x,
      y: muzzle.y,
      px: muzzle.x,
      py: muzzle.y,
      vx,
      vy,
      traveled: 0,
      range: w.range * d.rangeMul,
      damage: w.damage * d.damageMul,
      radius: w.projectileRadius,
      kind: w.projectileKind,
      alive: true,
    });
    st.cooldown = w.fireInterval * d.fireIntervalMul;
    state.events.push({ type: 'shot', dinoId: d.id, mount: i, projectileId: id, team: d.team, x: muzzle.x, y: muzzle.y, vx, vy, range: w.range * d.rangeMul });
  }
}
