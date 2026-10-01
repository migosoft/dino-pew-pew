// Low-level helpers for drawing pixel art into canvases at startup.

export interface PixCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

export function makeCanvas(w: number, h: number): PixCanvas {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx, w, h };
}

export function px(c: PixCanvas, x: number, y: number, color: string): void {
  c.ctx.fillStyle = color;
  c.ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
}

export function rect(c: PixCanvas, x: number, y: number, w: number, h: number, color: string): void {
  c.ctx.fillStyle = color;
  c.ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
}

/**
 * Fill an ellipse pixel by pixel. `shade` receives normalized coordinates
 * (nx, ny in -1..1) and returns a color or null to skip.
 */
export function ellipse(
  c: PixCanvas,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  shade: (nx: number, ny: number, x: number, y: number) => string | null,
): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const col = shade(nx, ny, x, y);
      if (col) px(c, x, y, col);
    }
  }
}

/** Thick line using a square brush. */
export function line(c: PixCanvas, x0: number, y0: number, x1: number, y1: number, color: string, thick = 1): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    rect(c, x - (thick - 1) / 2, y - (thick - 1) / 2, thick, thick, color);
  }
}

/** Ordered 2x2 dither: true on a checkerboard. */
export function checker(x: number, y: number): boolean {
  return ((x + y) & 1) === 0;
}

/** Pick a shade for a lit surface: light comes from the upper-left. */
export function litShade(nx: number, ny: number, x: number, y: number, dark: string, base: string, light: string): string {
  const l = -nx * 0.55 - ny * 0.75 + 0.15;
  const edge = nx * nx + ny * ny;
  if (edge > 0.82 && l < 0.2) return dark;
  if (l > 0.55) return light;
  if (l > 0.42) return checker(x, y) ? light : base;
  if (l < -0.45) return dark;
  if (l < -0.3) return checker(x, y) ? dark : base;
  return base;
}

/** Add a 1px outline around all opaque pixels. */
export function outline(c: PixCanvas, color: string): void {
  const img = c.ctx.getImageData(0, 0, c.w, c.h);
  const a = (x: number, y: number) => (x < 0 || y < 0 || x >= c.w || y >= c.h ? 0 : img.data[(y * c.w + x) * 4 + 3]);
  const marks: [number, number][] = [];
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (a(x, y) > 0) continue;
      if (a(x + 1, y) > 0 || a(x - 1, y) > 0 || a(x, y + 1) > 0 || a(x, y - 1) > 0) marks.push([x, y]);
    }
  }
  for (const [x, y] of marks) px(c, x, y, color);
}

/** Replace every opaque pixel with one flat color (for drop shadows). */
export function silhouette(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  c.ctx.drawImage(src, 0, 0);
  c.ctx.globalCompositeOperation = 'source-in';
  c.ctx.fillStyle = color;
  c.ctx.fillRect(0, 0, c.w, c.h);
  return c.canvas;
}

/**
 * Pre-render `n` rotations of a sprite (pivot = canvas center, art facing +x) using
 * nearest-neighbour sampling, laid out in a horizontal strip of square frames.
 */
export function rotationStrip(src: HTMLCanvasElement, n: number): { canvas: HTMLCanvasElement; size: number } {
  const sw = src.width;
  const sh = src.height;
  const size = Math.ceil(Math.hypot(sw, sh)) + 2;
  const out = makeCanvas(size * n, size);
  const sctx = src.getContext('2d')!;
  const sdata = sctx.getImageData(0, 0, sw, sh).data;
  const odata = out.ctx.createImageData(size * n, size);
  const scx = sw / 2;
  const scy = sh / 2;
  const half = size / 2;
  for (let f = 0; f < n; f++) {
    const a = (f / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - half;
        const dy = y + 0.5 - half;
        // inverse rotation into source space
        const sx = Math.floor(dx * c + dy * s + scx);
        const sy = Math.floor(-dx * s + dy * c + scy);
        if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue;
        const si = (sy * sw + sx) * 4;
        if (sdata[si + 3] === 0) continue;
        const oi = (y * size * n + f * size + x) * 4;
        odata.data[oi] = sdata[si];
        odata.data[oi + 1] = sdata[si + 1];
        odata.data[oi + 2] = sdata[si + 2];
        odata.data[oi + 3] = sdata[si + 3];
      }
    }
  }
  out.ctx.putImageData(odata, 0, 0);
  return { canvas: out.canvas, size };
}

/** Frame index in a rotation strip of `n` frames for a world angle. */
export function frameForAngle(angle: number, n: number): number {
  const f = Math.round((angle / (Math.PI * 2)) * n);
  return ((f % n) + n) % n;
}

/** Tiny deterministic hash for render-only randomness. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
