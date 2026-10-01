// mulberry32: tiny, fast, seedable. State lives in plain data so GameState stays serializable.

export interface RngState {
  s: number;
}

export function makeRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

/** Uniform float in [0, 1). */
export function rand(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(r: RngState, lo: number, hi: number): number {
  return lo + (hi - lo) * rand(r);
}

export function randInt(r: RngState, n: number): number {
  return Math.floor(rand(r) * n);
}
