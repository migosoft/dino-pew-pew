import type { Dino } from '../../sim/types';
import { getDino } from '../../sim/defs/dinos';
import { CHAINS, chainLength } from './chains';

/** Handy visual reference points of a dino, derived from its definition. */
export function geometry(d: Dino): { mouth: number } {
  const def = getDino(d.kind);
  const neck = CHAINS[d.kind]?.neck;
  // A chained neck puts the mouth far out in front of the shoulders.
  if (neck) return { mouth: (def.head?.offset.x ?? def.radius) + chainLength(neck.segs) + neck.headLen * 0.8 };
  return { mouth: (def.head?.offset.x ?? def.radius) + def.radius * 0.6 };
}
