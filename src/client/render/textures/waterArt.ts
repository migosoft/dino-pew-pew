import { ellipse, hash2, makeCanvas, px } from './pixel';

// Small sprites for the living water: wave crests, fish shadows, ripple rings, foam and droplets.

/** Radius (px) of the ripple ring texture; WaterView scales it. */
export const RIPPLE_R = 8;
/** Radius of the foam ring under a dino in deep water; DinoView scales it. */
export const FOAM_R = 12;
export const WAVE_VARIANTS = 3;

/** A thin 1px ring, broken up a little so it doesn't look drawn with a compass. */
function ring(r: number, color: string, gaps: number, seed: number): HTMLCanvasElement {
  const size = Math.ceil(r * 2) + 3;
  const c = makeCanvas(size, size);
  const cx = size / 2;
  for (let k = 0; k < Math.ceil(r * 8); k++) {
    const a = (k / Math.ceil(r * 8)) * Math.PI * 2;
    if (hash2(k, 0, seed) < gaps) continue;
    px(c, cx + Math.cos(a) * r, cx + Math.sin(a) * r, color);
  }
  return c.canvas;
}

export function drawRipple(): HTMLCanvasElement {
  return ring(RIPPLE_R, 'rgba(225,245,240,0.9)', 0.12, 7);
}

/** Foam where the water meets a wading dino's body. */
export function drawFoamRing(): HTMLCanvasElement {
  const size = FOAM_R * 2 + 3;
  const c = makeCanvas(size, size);
  const cx = size / 2;
  ellipse(c, cx, cx, FOAM_R, FOAM_R, (nx, ny, x, y) => {
    const d = Math.hypot(nx, ny);
    if (d < 0.78) return null;
    return hash2(x, y, 5) < 0.6 ? 'rgba(230,248,244,0.75)' : 'rgba(170,215,215,0.5)';
  });
  return c.canvas;
}

/** Little wave crests: a light top edge over a darker trough. `deep` crests are bluer. */
export function drawWave(variant: number, deep: boolean): HTMLCanvasElement {
  const w = 5 + variant * 2;
  const c = makeCanvas(w, 3);
  const [crest, trough] = deep ? ['#7fb8cc', '#1f4a62'] : ['#a6dccb', '#3f7f72'];
  for (let x = 0; x < w; x++) {
    // An arc: higher in the middle.
    const y = Math.abs(x - (w - 1) / 2) > w / 3 ? 1 : 0;
    px(c, x, y, crest);
    if (x > 0 && x < w - 1) px(c, x, y + 1, trough);
  }
  return c.canvas;
}

/** A streak of running water along a river, facing +x: bright in the middle, fading at both ends. */
export function drawCurrentStreak(variant: number, deep: boolean): HTMLCanvasElement {
  const w = 6 + variant * 3;
  const c = makeCanvas(w, 2);
  const [hi, lo] = deep ? ['#8cc4d6', '#2a5a72'] : ['#b4e4d4', '#4a8a7c'];
  for (let x = 0; x < w; x++) {
    const mid = Math.abs(x - (w - 1) / 2) < w / 4;
    px(c, x, 0, mid ? hi : lo);
    if (x > 1 && x < w - 2 && hash2(x, variant, 9) < 0.5) px(c, x, 1, lo);
  }
  return c.canvas;
}

/** Dark fish shadow seen through the water, facing +x. `frame` flips the tail. */
export function drawFish(frame: 0 | 1, big: boolean): HTMLCanvasElement {
  const c = makeCanvas(16, 10);
  const cx = 8;
  const cy = 5;
  const col = 'rgba(8,24,34,0.55)';
  const len = big ? 4.5 : 3.5;
  ellipse(c, cx + 1, cy, len, big ? 1.8 : 1.4, () => col);
  // Tail fin, bent to one side or the other.
  const bend = frame === 0 ? -1 : 1;
  px(c, cx - len, cy + bend * 0.5, col);
  px(c, cx - len - 1, cy - 1 + bend, col);
  px(c, cx - len - 1, cy + 1 + bend, col);
  px(c, cx - len - 2, cy - 1 + bend, col);
  px(c, cx - len - 2, cy + 1 + bend, col);
  return c.canvas;
}

export function drawDroplet(): HTMLCanvasElement {
  const c = makeCanvas(2, 2);
  px(c, 0, 0, '#e6f6f4');
  px(c, 1, 1, '#9fd2d8');
  px(c, 1, 0, '#cdeeee');
  return c.canvas;
}
