import type { Dino } from '../../sim/types';
import { getDino } from '../../sim/defs/dinos';
import { CHAINS, chainLength } from './chains';

/** Handy visual reference points of a dino, derived from its definition. */
export function geometry(d: Dino): { mouth: number } {
  const def = getDino(d.kind);
  const chain = CHAINS[d.kind];
  // A chained neck puts the mouth far out in front of the shoulders.
  if (chain) return { mouth: (def.head?.offset.x ?? def.radius) + chainLength(chain.neck) + chain.headLen * 0.8 };
  return { mouth: (def.head?.offset.x ?? def.radius) + def.radius * 0.6 };
}
