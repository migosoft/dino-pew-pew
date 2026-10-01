import { Tile, type World } from '../../../sim/types';
import { valueNoise } from '../../../sim/noise';
import { checker, ellipse, hash2, line, litShade, makeCanvas, outline, px, rect, seededRandom } from './pixel';

const OUTLINE = '#17110d';

export const ROCK_SIZES = [6, 8, 10, 12, 14, 16];
export const CANOPY_SIZES = [16, 20, 24];

export function nearestSize(sizes: number[], r: number): number {
  let best = sizes[0];
  for (const s of sizes) if (Math.abs(s - r) < Math.abs(best - r)) best = s;
  return best;
}

/**
 * Pseudo-3D boulder: dark south-facing side and a lighter top face lifted a few pixels.
 * Canvas center = the rock's ground footprint center.
 */
export function drawRock(r: number, variant: number): HTMLCanvasElement {
  const size = r * 2 + 10;
  const c = makeCanvas(size, size);
  const cx = size / 2;
  const cy = size / 2;
  const rnd = seededRandom(r * 31 + variant * 977);
  const phases = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  const radiusAt = (a: number) => 1 + 0.1 * Math.sin(a * 3 + phases[0]) + 0.07 * Math.sin(a * 5 + phases[1]) + 0.05 * Math.sin(a * 2 + phases[2]);
  const lift = Math.max(2, Math.round(r / 4));
  const palettes = [
    ['#3a3631', '#5e5850', '#8a8378', '#b2aa9c'],
    ['#3b3328', '#655642', '#91805f', '#b8a581'],
    ['#33383a', '#535c60', '#7c878b', '#a5b0b2'],
  ];
  const [deep, side, top, hi] = palettes[variant % palettes.length];
  const blob = (oy: number, scale: number, shade: (nx: number, ny: number, x: number, y: number) => string) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - (cy + oy);
        const a = Math.atan2(dy, dx);
        const rr = r * scale * radiusAt(a);
        const d = Math.hypot(dx, dy * 1.12);
        if (d > rr) continue;
        px(c, x, y, shade(dx / rr, dy / rr, x, y));
      }
    }
  };
  // Side (the full footprint).
  blob(0, 1, (_nx, ny, x, y) => (ny > 0.35 ? deep : checker(x, y) && ny > 0.1 ? deep : side));
  // Top face, raised.
  blob(-lift, 0.86, (nx, ny, x, y) => litShade(nx, ny, x, y, side, top, hi));
  // Cracks and lichen.
  for (let i = 0; i < Math.max(1, r / 5); i++) {
    const sx = cx + (rnd() - 0.5) * r;
    const sy = cy - lift + (rnd() - 0.5) * r * 0.8;
    line(c, sx, sy, sx + (rnd() - 0.5) * 5, sy + rnd() * 3, side, 1);
  }
  if (variant === 1) px(c, cx - 2, cy - lift - 2, '#7c8a3a');
  outline(c, OUTLINE);
  return c.canvas;
}

export function drawTrunk(): HTMLCanvasElement {
  const c = makeCanvas(16, 16);
  // Roots
  line(c, 8, 8, 3, 11, '#4a3020', 1);
  line(c, 8, 8, 13, 11, '#4a3020', 1);
  line(c, 8, 8, 8, 13, '#4a3020', 1);
  ellipse(c, 8, 8, 4.5, 4.5, (nx, ny, x, y) => litShade(nx, ny, x, y, '#3a2416', '#5e3b22', '#86593a'));
  // Bark rings
  px(c, 7, 7, '#3a2416');
  px(c, 9, 9, '#3a2416');
  outline(c, OUTLINE);
  return c.canvas;
}

/** Tree canopies. 0: tree fern (radial fronds), 1: araucaria conifer, 2: cycad. */
export function drawCanopy(R: number, variant: number): HTMLCanvasElement {
  const size = R * 2 + 6;
  const c = makeCanvas(size, size);
  const cx = size / 2;
  const cy = size / 2;
  const rnd = seededRandom(R * 13 + variant * 101 + 7);
  if (variant === 1) {
    // Dense round conifer with clumpy foliage.
    ellipse(c, cx, cy, R, R, (nx, ny, x, y) => {
      const n = valueNoise(x / 3, y / 3, 5 + variant);
      const l = -nx * 0.5 - ny * 0.7 + (n - 0.5) * 0.9;
      if (nx * nx + ny * ny > 0.86 && n < 0.45) return null;
      if (l > 0.45) return '#6f9a3c';
      if (l > 0.1) return checker(x, y) ? '#4f7a2e' : '#6f9a3c';
      if (l > -0.35) return '#3d6326';
      return '#25421c';
    });
  } else {
    const fronds = variant === 0 ? 9 : 6;
    const [dark, mid, light] = variant === 0 ? ['#24461f', '#3f7a2e', '#79b04a'] : ['#3a4a1c', '#6a7e2a', '#a8b84a'];
    const start = rnd() * 6.28;
    for (let f = 0; f < fronds; f++) {
      const a = start + (f / fronds) * Math.PI * 2 + (rnd() - 0.5) * 0.3;
      const len = R * (0.82 + rnd() * 0.18);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      for (let t = 2; t < len; t += 1) {
        const x = cx + ca * t;
        const y = cy + sa * t;
        const leaf = Math.max(1, Math.round((variant === 0 ? 3.6 : 4.6) * Math.sin((t / len) * Math.PI)));
        for (let k = -leaf; k <= leaf; k++) {
          const lx = x - sa * k + ca * Math.abs(k) * 0.6;
          const ly = y + ca * k + sa * Math.abs(k) * 0.6;
          const lit = -ca * 0.5 - sa * 0.7 - k * 0.08;
          px(c, lx, ly, k === 0 ? dark : lit > 0.25 ? light : lit > -0.3 ? mid : dark);
        }
      }
    }
    ellipse(c, cx, cy, 2.5, 2.5, () => (variant === 0 ? '#5a3a20' : '#7a5a2a'));
  }
  outline(c, OUTLINE);
  return c.canvas;
}

const TILE_COLORS: Record<number, string[]> = {
  [Tile.Grass]: ['#4f7a34', '#5a873a', '#477030', '#66943f'],
  [Tile.GrassDark]: ['#3f6a2e', '#477532', '#365e29', '#4e7d36'],
  [Tile.Dirt]: ['#8a6e48', '#7d6340', '#967a52', '#705a3a'],
  [Tile.Mud]: ['#5a4a34', '#4e402e', '#64533b', '#463a2a'],
  [Tile.Fern]: ['#3e7330', '#4a8236', '#35662a', '#56903c'],
};

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Render the whole ground into one canvas, with organic tile borders and details. */
export function drawGround(world: World): HTMLCanvasElement {
  const { width, height, tileSize, cols, rows, tiles, seed } = world;
  const c = makeCanvas(width, height);
  const img = c.ctx.createImageData(width, height);
  const rgb: Record<number, [number, number, number][]> = {};
  for (const k of Object.keys(TILE_COLORS)) rgb[+k] = TILE_COLORS[+k].map(hexToRgb);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Wobble the lookup so tile borders look organic instead of square.
      const jx = (valueNoise(x / 7, y / 7, seed + 3) - 0.5) * 14;
      const jy = (valueNoise(x / 7, y / 7, seed + 4) - 0.5) * 14;
      const tx = Math.min(cols - 1, Math.max(0, Math.floor((x + jx) / tileSize)));
      const ty = Math.min(rows - 1, Math.max(0, Math.floor((y + jy) / tileSize)));
      const t = tiles[ty * cols + tx];
      const n = valueNoise(x / 3, y / 3, seed + 9) * 0.7 + hash2(x, y, seed) * 0.3;
      const shades = rgb[t];
      const col = shades[Math.min(3, Math.floor(n * 4))];
      const i = (y * width + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
    }
  }
  c.ctx.putImageData(img, 0, 0);

  // Ground details: grass tufts, ferns, pebbles, puddles, bones.
  const rnd = seededRandom(seed * 7 + 1);
  const count = Math.floor((width * height) / 260);
  for (let k = 0; k < count; k++) {
    const x = Math.floor(rnd() * width);
    const y = Math.floor(rnd() * height);
    const t = tiles[Math.floor(y / tileSize) * cols + Math.floor(x / tileSize)];
    const roll = rnd();
    if (t === Tile.Grass || t === Tile.GrassDark) {
      if (roll < 0.8) {
        px(c, x, y, '#86b452');
        px(c, x - 1, y - 1, '#86b452');
        px(c, x + 1, y - 1, '#6f9a44');
      } else if (roll < 0.86) {
        px(c, x, y, rnd() < 0.5 ? '#e8d24a' : '#e07a9a');
        px(c, x, y + 1, '#3a6020');
      }
    } else if (t === Tile.Fern) {
      if (roll < 0.6) {
        line(c, x, y, x + 3, y - 2, '#68a040', 1);
        line(c, x, y, x - 3, y - 2, '#68a040', 1);
        px(c, x, y - 2, '#2c5420');
      }
    } else if (t === Tile.Dirt) {
      if (roll < 0.5) {
        px(c, x, y, '#a89070');
        px(c, x + 1, y + 1, '#5a4630');
      } else if (roll < 0.53) {
        // Old bones bleached in the sun.
        line(c, x - 3, y, x + 3, y, '#e6dcc0', 1);
        for (let r = -2; r <= 2; r += 2) line(c, x + r, y - 2, x + r, y + 2, '#d4c8a8', 1);
      }
    } else if (t === Tile.Mud && roll < 0.35) {
      ellipse(c, x, y, 3 + rnd() * 3, 2 + rnd() * 1.5, (_nx, ny) => (ny < -0.3 ? '#5f7a86' : '#3e5562'));
    }
  }
  return c.canvas;
}

export function drawBolt(core: string, glow: string): HTMLCanvasElement {
  const c = makeCanvas(10, 10);
  rect(c, 1, 4, 6, 2, glow);
  rect(c, 4, 4, 4, 2, core);
  px(c, 8, 4, glow);
  px(c, 8, 5, glow);
  return c.canvas;
}

export function drawDot(r: number, color: string): HTMLCanvasElement {
  const s = Math.ceil(r * 2) + 1;
  const c = makeCanvas(s, s);
  ellipse(c, s / 2, s / 2, r, r, () => color);
  return c.canvas;
}

export function drawShadowEllipse(rx: number, ry: number): HTMLCanvasElement {
  const c = makeCanvas(Math.ceil(rx * 2) + 2, Math.ceil(ry * 2) + 2);
  ellipse(c, c.w / 2, c.h / 2, rx, ry, () => 'rgba(0,0,0,0.3)');
  return c.canvas;
}

export function drawMuzzleFlash(): HTMLCanvasElement {
  const c = makeCanvas(9, 9);
  for (const [x, y] of [
    [4, 1],
    [4, 7],
    [1, 4],
    [7, 4],
  ]) px(c, x, y, '#ffb030');
  rect(c, 3, 3, 3, 3, '#ffe28a');
  px(c, 4, 4, '#ffffff');
  return c.canvas;
}

export function drawScorch(): HTMLCanvasElement {
  const c = makeCanvas(28, 20);
  ellipse(c, 14, 10, 13, 9, (nx, ny, x, y) => {
    const d = nx * nx + ny * ny;
    if (d > 0.7 && hash2(x, y, 3) < 0.5) return null;
    return d < 0.35 ? 'rgba(20,14,8,0.55)' : 'rgba(20,14,8,0.3)';
  });
  return c.canvas;
}

export function drawReticle(): HTMLCanvasElement {
  const c = makeCanvas(13, 13);
  const w = '#f4f0e0';
  for (const [x, y, dx, dy] of [
    [6, 0, 0, 1],
    [6, 9, 0, 1],
    [0, 6, 1, 0],
    [9, 6, 1, 0],
  ]) {
    for (let k = 0; k < 4; k++) px(c, x + dx * k, y + dy * k, w);
  }
  px(c, 6, 6, '#ff5a3c');
  outline(c, OUTLINE);
  return c.canvas;
}

export function drawArrow(): HTMLCanvasElement {
  const c = makeCanvas(9, 9);
  for (let x = 0; x < 6; x++) {
    const h = Math.floor((6 - x) / 2);
    for (let y = -h; y <= h; y++) px(c, 7 - x, 4 + y, '#ff5a3c');
  }
  outline(c, OUTLINE);
  return c.canvas;
}

/** Team camp totem: wooden pole on a stone footing with a banner in the team color. */
export function drawTotem(banner: string, bannerLight: string): HTMLCanvasElement {
  const c = makeCanvas(14, 26);
  ellipse(c, 7, 22, 5, 3, (nx, ny, x, y) => litShade(nx, ny, x, y, '#3a3631', '#5e5850', '#8a8378'));
  rect(c, 6, 3, 2, 19, '#5e3b22');
  rect(c, 6, 3, 1, 19, '#86593a');
  // Banner hanging from a crossbar.
  rect(c, 3, 4, 8, 1, '#4a3020');
  for (let y = 5; y < 12; y++) {
    const w = y < 10 ? 6 : 6 - (y - 9) * 2;
    rect(c, 4 + (6 - w) / 2, y, w, 1, y < 7 ? bannerLight : banner);
  }
  // Skull on top.
  rect(c, 5, 0, 4, 3, '#efe4c2');
  px(c, 6, 1, '#17110d');
  px(c, 8, 1, '#17110d');
  outline(c, OUTLINE);
  return c.canvas;
}

/** Unclaimed campsite marker stone. */
export function drawCampStone(): HTMLCanvasElement {
  const c = makeCanvas(10, 8);
  ellipse(c, 5, 4, 4, 3, (nx, ny, x, y) => litShade(nx, ny, x, y, '#3a3631', '#5e5850', '#8a8378'));
  outline(c, OUTLINE);
  return c.canvas;
}
