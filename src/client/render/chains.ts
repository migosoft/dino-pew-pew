import { BRONTO_HEAD_LEN, BRONTO_NECK, BRONTO_TAIL, type ChainSegment } from './textures/brontosaurusArt';

/**
 * Species whose neck and tail are drawn as chains of short links, so they bend. Textures
 * (registered in textures/index.ts, palette = t0..t3 or wild):
 * - `<kind>_neck<i>_<palette>`, `<kind>_tail<i>_<palette>`, `<kind>_head_<palette>`: the links and the head;
 * - `<kind>_neck<i>_mask`, `<kind>_tail<i>_mask`, `<kind>_head_mask`, `<kind>_bodyMask_<pose>`:
 *   opaque black versions, stamped together into one shadow.
 */
export interface ChainSpec {
  /** Neck links from the shoulder pivot (`head.offset`); the head sits at the end. */
  neck: ChainSegment[];
  /** How far the head reaches past the last neck link. */
  headLen: number;
  /** Tail links from the tail root (`tail.offset`) to the tip. */
  tail: ChainSegment[];
}

export const CHAINS: Record<string, ChainSpec> = {
  brontosaurus: { neck: BRONTO_NECK, headLen: BRONTO_HEAD_LEN, tail: BRONTO_TAIL },
};

/** Total length of a chain of links. */
export function chainLength(segs: ChainSegment[]): number {
  return segs.reduce((sum, s) => sum + s.len, 0);
}
