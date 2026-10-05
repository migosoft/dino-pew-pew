import type { Dino, DinoDef, InputCommand, World } from '../types';
import { getDino } from '../defs/dinos';
import { approach, clamp } from '../math';
import { flowAt, isAirborne, isDeepWater } from '../world';

/** Fraction of top speed kept in deep water by species that don't set `wadeSpeed`. */
export const DEFAULT_WADE_SPEED = 0.6;
/** Fraction of top speed kept in a river current by species that don't set `currentSlow`. */
export const DEFAULT_CURRENT_SLOW = 0.75;

/**
 * Top-speed factor for a dino at its position: deep water slows it to its wadeSpeed (shallow
 * water doesn't), and a river current slows it further by its currentSlow.
 */
export function terrainSpeedFactor(world: World, d: Dino, def: DinoDef = getDino(d.kind)): number {
  const wade = isDeepWater(world, d.x, d.y) ? (def.wadeSpeed ?? DEFAULT_WADE_SPEED) : 1;
  const f = flowAt(world, d.x, d.y);
  const river = f.x * f.x + f.y * f.y > 1 ? (def.currentSlow ?? DEFAULT_CURRENT_SLOW) : 1;
  return wade * river;
}

/** A river carries dinos that set `currentDrift` along with it (not while they are in the air). */
export function applyCurrent(world: World, d: Dino, dt: number, def: DinoDef = getDino(d.kind)): void {
  const drift = def.currentDrift ?? 0;
  if (drift <= 0 || isAirborne(d)) return;
  const f = flowAt(world, d.x, d.y);
  d.x += f.x * drift * dt;
  d.y += f.y * drift * dt;
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
