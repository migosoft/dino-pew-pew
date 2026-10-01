import type { Dino, DinoDef, MountDef, Vec2 } from '../types';
import { angleDiff, angleTo, approach, clamp, localToWorld } from '../math';

/** A position plus the world angle its local +x axis points to. */
export interface Frame {
  x: number;
  y: number;
  angle: number;
}

export function bodyFrame(d: Dino): Frame {
  return { x: d.x, y: d.y, angle: d.heading };
}

export function headFrame(d: Dino, def: DinoDef): Frame {
  if (!def.head) return bodyFrame(d);
  const p = localToWorld(d, d.heading, def.head.offset);
  return { x: p.x, y: p.y, angle: d.heading + d.headYaw };
}

function parentFrame(d: Dino, def: DinoDef, m: MountDef): Frame {
  return m.parent === 'head' ? headFrame(d, def) : bodyFrame(d);
}

/** World pivot of mount `i`, with the barrel's actual world angle. */
export function mountFrame(d: Dino, def: DinoDef, i: number): Frame {
  const m = def.mounts[i];
  const parent = parentFrame(d, def, m);
  const p = localToWorld(parent, parent.angle, m.offset);
  return { x: p.x, y: p.y, angle: parent.angle + m.baseAngle + d.mounts[i].angle };
}

export function muzzlePoint(d: Dino, def: DinoDef, i: number): Vec2 {
  const f = mountFrame(d, def, i);
  return { x: f.x + Math.cos(f.angle) * def.mounts[i].muzzle, y: f.y + Math.sin(f.angle) * def.mounts[i].muzzle };
}

/**
 * Swing the head and every weapon towards `aim`, respecting each part's limits and turn speed.
 * Returns, per mount, how far (radians) the barrel still points away from the target.
 * A large error means the target lies outside what that mount can cover.
 */
export function updateAim(d: Dino, def: DinoDef, aim: Vec2, dt: number): number[] {
  if (def.head) {
    const pivot = localToWorld(d, d.heading, def.head.offset);
    const want = clamp(angleDiff(angleTo(pivot, aim), d.heading), -def.head.maxYaw, def.head.maxYaw);
    d.headYaw = approach(d.headYaw, want, def.head.yawSpeed * dt);
  }

  const errors: number[] = [];
  for (let i = 0; i < def.mounts.length; i++) {
    const m = def.mounts[i];
    const parent = parentFrame(d, def, m);
    const pivot = localToWorld(parent, parent.angle, m.offset);
    const want = clamp(angleDiff(angleTo(pivot, aim), parent.angle + m.baseAngle), -m.arcHalf, m.arcHalf);
    const st = d.mounts[i];
    st.angle = approach(st.angle, want, m.turnSpeed * dt);
    const barrel = parent.angle + m.baseAngle + st.angle;
    errors.push(Math.abs(angleDiff(angleTo(pivot, aim), barrel)));
  }
  return errors;
}

/**
 * Which mounts should fire: every mount roughly on target, or, if none can reach,
 * only the one closest to it (so a single forward gun still fires along its clamped
 * direction, while a broadside dino does not waste the off-side gun).
 */
export function selectFiringMounts(errors: number[], tolerance = 0.08): number[] {
  const onTarget: number[] = [];
  let best = -1;
  for (let i = 0; i < errors.length; i++) {
    if (errors[i] <= tolerance) onTarget.push(i);
    if (best < 0 || errors[i] < errors[best]) best = i;
  }
  if (onTarget.length > 0) return onTarget;
  return best >= 0 ? [best] : [];
}

/** Total world-angle range a mount can cover right now given body heading (for HUD/AI). */
export function mountCoverage(d: Dino, def: DinoDef, i: number): { center: number; half: number } {
  const m = def.mounts[i];
  const headHalf = m.parent === 'head' && def.head ? def.head.maxYaw : 0;
  return { center: d.heading + m.baseAngle, half: m.arcHalf + headHalf };
}
