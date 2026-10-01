import type { Dino } from '../../sim/types';
import { getDino } from '../../sim/defs/dinos';

/** Handy visual reference points of a dino, derived from its definition. */
export function geometry(d: Dino): { mouth: number } {
  const def = getDino(d.kind);
  return { mouth: (def.head?.offset.x ?? def.radius) + def.radius * 0.6 };
}
