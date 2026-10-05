import { BRONTO_HEAD_LEN, BRONTO_NECK, BRONTO_TAIL } from './textures/brontosaurusArt';
import { TRICERATOPS_TAIL } from './textures/dinoArt';
import { RAPTOR_TAIL } from './textures/raptorArt';
import { REX_TAIL } from './textures/trexArt';
import type { ChainSegment, ChainStyle } from './textures/chainArt';

/**
 * Species whose tail (and maybe neck) is drawn as a chain of short links, so it bends and
 * trails behind when the dino turns. Textures (registered in textures/index.ts for every
 * entry here; palette = t0..t3 or wild):
 * - `<kind>_tail<i>_<palette>`, `<kind>_neck<i>_<palette>`: the links;
 * - `<kind>_tail<i>_mask`, `<kind>_neck<i>_mask`, `<kind>_head_mask`, `<kind>_bodyMask_<pose>`:
 *   opaque black versions, stamped together into one shadow.
 */
export interface ChainSpec {
  /** Neck links from the shoulder pivot (`head.offset`), the head at the end. Without one the head is placed as usual. */
  neck?: { segs: ChainSegment[]; style: ChainStyle; headLen: number };
  /** Tail links from the tail root (`tail.offset`) to the tip. */
  tail: { segs: ChainSegment[]; style: ChainStyle };
}

export const CHAINS: Record<string, ChainSpec> = {
  brontosaurus: {
    neck: { segs: BRONTO_NECK, style: { marks: 'pair' }, headLen: BRONTO_HEAD_LEN },
    tail: { segs: BRONTO_TAIL, style: { marks: 'spot' } },
  },
  triceratops: { tail: { segs: TRICERATOPS_TAIL, style: { marks: 'none' } } },
  velociraptor: { tail: { segs: RAPTOR_TAIL, style: { marks: 'stripe', crest: true } } },
  trex: { tail: { segs: REX_TAIL, style: { marks: 'spot' } } },
};

/** Total length of a chain of links. */
export function chainLength(segs: ChainSegment[]): number {
  return segs.reduce((sum, s) => sum + s.len, 0);
}
