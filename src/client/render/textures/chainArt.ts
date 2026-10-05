import { checker, makeCanvas, outline, px } from './pixel';
import type { DinoPalette } from './dinoArt';

// Links of bendable necks and tails (see client/render/chains.ts). Each link is drawn on its
// own canvas, centered on its joint, and the links are chained together at runtime.

const OUTLINE = '#17110d';

/** One link of a bendable neck or tail: a capsule from its joint (0) to `len` along +x. */
export interface ChainSegment {
  len: number;
  /** Half-thickness at the joint and at the far end. */
  w0: number;
  w1: number;
}

/** Markings on each link: neck bands, a spine spot, raptor stripes (with a feather crest), or none. */
export interface ChainStyle {
  marks: 'pair' | 'spot' | 'stripe' | 'none';
  /** Team-colored feather accents along the spine (raptor). */
  crest?: boolean;
}

/** `n` links of length `len` tapering from half-thickness `root` to `tip` (`curve` > 1 thins out sooner). */
export function taperedChain(n: number, len: number, root: number, tip: number, curve = 1): ChainSegment[] {
  const w = (k: number) => tip + (1 - k / n) ** curve * (root - tip);
  return Array.from({ length: n }, (_, i) => ({ len, w0: w(i), w1: w(i + 1) }));
}

/** Shading of a long tapering strip (neck, tail): light along the upper-left edge. */
function hide(p: DinoPalette, ny: number, x: number, y: number): string {
  if (ny < -0.55) return p.light;
  if (ny < -0.2) return checker(x, y) ? p.light : p.base;
  if (ny > 0.6) return p.dark;
  if (ny > 0.35) return checker(x, y) ? p.dark : p.base;
  return p.base;
}

/**
 * One neck or tail link. Canvas center = its joint. The rounded cap behind the joint has no
 * outline: it sits on top of the previous link's end, so the chain looks like one smooth
 * piece wherever it bends.
 */
export function drawChainSegment(p: DinoPalette, seg: ChainSegment, style: ChainStyle): HTMLCanvasElement {
  const { len, w0, w1 } = seg;
  const wMax = Math.max(w0, w1);
  const W = 2 * Math.ceil(len + wMax + 3);
  const H = 2 * Math.ceil(wMax + 3);
  const c = makeCanvas(W, H);
  const cx = W / 2;
  const cy = H / 2;
  const inside = (x: number, y: number): number => {
    const lx = x + 0.5 - cx;
    const t = Math.min(1, Math.max(0, lx / len));
    const w = w0 + (w1 - w0) * t;
    return Math.hypot(lx - t * len, y + 0.5 - cy) <= w ? w : 0;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const w = inside(x, y);
      if (w) px(c, x, y, hide(p, (y + 0.5 - cy) / w, x, y));
    }
  }
  // Markings in the middle of the link.
  const mx = Math.floor(cx + len / 2);
  if (style.marks === 'pair') {
    px(c, mx, cy - 2, p.dark);
    px(c, mx, cy + 1, p.dark);
    px(c, mx + 1, cy - 1, p.dark);
  } else if (style.marks === 'spot' && w0 > 2) {
    px(c, mx, cy - 0.5, p.dark);
  } else if (style.marks === 'stripe') {
    for (let y = 0; y < H; y++) if (inside(mx, y) && y + 0.5 - cy < wMax * 0.6) px(c, mx, y, p.dark);
  }
  if (style.crest && w0 > 1.2) {
    px(c, mx - 1, cy - 1, p.frill);
    px(c, mx + 1, cy - 1, p.frillLight);
  }
  outline(c, OUTLINE);
  // Drop the outline around the back cap (it would show as a ring at every joint).
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const lx = x + 0.5 - cx;
      const d = Math.hypot(lx, y + 0.5 - cy);
      if (lx < 0.5 && d > w0 && d <= w0 + 1.8) c.ctx.clearRect(x, y, 1, 1);
    }
  }
  return c.canvas;
}
