import type { Dino, InputCommand } from '../types';
import { getDino } from '../defs/dinos';
import { approach, clamp } from '../math';

/** Tank-style steering: throttle drives speed along the heading, turn rotates the body. */
export function moveDino(d: Dino, cmd: InputCommand, dt: number): void {
  const def = getDino(d.kind);
  const throttle = clamp(cmd.throttle, -1, 1);
  const target = throttle >= 0 ? throttle * def.maxSpeed : throttle * def.reverseSpeed;
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
