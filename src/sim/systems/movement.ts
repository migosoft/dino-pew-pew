import type { Dino, DinoDef, InputCommand, World } from '../types';
import { getDino } from '../defs/dinos';
import { approach, clamp } from '../math';
import { isDeepWater } from '../world';

/** Fraction of top speed kept in deep water by species that don't set `wadeSpeed`. */
export const DEFAULT_WADE_SPEED = 0.6;

/** Top-speed factor for a dino at its position: deep water slows it to its wadeSpeed, shallow water doesn't. */
export function terrainSpeedFactor(world: World, d: Dino, def: DinoDef = getDino(d.kind)): number {
  return isDeepWater(world, d.x, d.y) ? (def.wadeSpeed ?? DEFAULT_WADE_SPEED) : 1;
}

/**
 * Tank-style steering: throttle drives speed along the heading, turn rotates the body.
 * `speedCap` scales the top speed (terrain); speed above it bleeds off at the normal decel.
 */
export function moveDino(d: Dino, cmd: InputCommand, dt: number, speedCap = 1): void {
  const def = getDino(d.kind);
  const throttle = clamp(cmd.throttle, -1, 1);
  const target = (throttle >= 0 ? throttle * def.maxSpeed : throttle * def.reverseSpeed) * speedCap;
  const rate = Math.abs(target) > Math.abs(d.speed) && Math.sign(target) !== -Math.sign(d.speed) ? def.accel : def.decel;
  d.speed = approach(d.speed, target, rate * dt);

  const speedFrac = Math.abs(d.speed) / def.maxSpeed;
  const turnRate = def.turnRate * (1 - def.turnPenaltyAtSpeed * speedFrac);
  d.heading += clamp(cmd.turn, -1, 1) * turnRate * dt;

  const step = d.speed * dt;
  d.x += Math.cos(d.heading) * step;
  d.y += Math.sin(d.heading) * step;
  d.stride += Math.abs(step);
}
