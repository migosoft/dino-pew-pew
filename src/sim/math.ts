import type { Vec2 } from './types';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = a % TAU;
  if (a <= -Math.PI) a += TAU;
  else if (a > Math.PI) a -= TAU;
  return a;
}

/** Signed shortest rotation from `from` to `to`. */
export function angleDiff(to: number, from: number): number {
  return wrapAngle(to - from);
}

/** Move `current` towards `target` by at most `maxDelta`. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

export function angleTo(from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/** Rotate a local vector by `angle` and add it to `origin`. */
export function localToWorld(origin: Vec2, angle: number, local: Vec2): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: origin.x + local.x * c - local.y * s, y: origin.y + local.x * s + local.y * c };
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDiff(b, a) * t;
}
