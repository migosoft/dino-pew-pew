import { Tile, type World } from '../../../sim/types';
import { valueNoise } from '../../../sim/noise';
import { tileAt } from '../../../sim/world';
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
  // Shallow water: clear, with the sandy bottom showing through.
  [Tile.Shallow]: ['#5a9c8c', '#64a694', '#528f82', '#6eae9a'],
  [Tile.Deep]: ['#2a5a74', '#2d5f7a', '#285470', '#31667f'],
};
/** Deep water right next to the shallows is a little lighter (the bottom slopes down). */
const DEEP_EDGE = ['#356e86', '#38738b', '#326882', '#3c788f'];
const FOAM = '#cfe8df';
const WET_SAND = '#5e5038';

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const isWet = (t: number) => t === Tile.Shallow || t === Tile.Deep;

/**
 * Render one rectangle of the ground (world px x0..x0+w, y0..y0+h) with organic tile borders,
 * shorelines and details. The terrain is sampled a margin beyond the rectangle so neighbour tests
 * see across chunk seams, and details are inset and seeded per chunk so none is cut by a seam.
 */
export function drawGroundChunk(world: World, x0: number, y0: number, w: number, h: number): HTMLCanvasElement {
  const { seed } = world;
  const M = 4;
  const c = makeCanvas(w, h);
  const img = c.ctx.createImageData(w, h);
  const rgb: Record<number, [number, number, number][]> = {};
  for (const k of Object.keys(TILE_COLORS)) rgb[+k] = TILE_COLORS[+k].map(hexToRgb);
  const deepEdge = DEEP_EDGE.map(hexToRgb);
  const foam = hexToRgb(FOAM);
  const wetSand = hexToRgb(WET_SAND);
  // Terrain per pixel of the expanded region, with the same wobbled lookup the simulation uses.
  const mw = w + M * 2;
  const mh = h + M * 2;
  const map = new Uint8Array(mw * mh);
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const wx = Math.min(world.width - 1, Math.max(0, x0 - M + x));
      const wy = Math.min(world.height - 1, Math.max(0, y0 - M + y));
      map[y * mw + x] = tileAt(world, wx, wy);
    }
  }
  /** Terrain at world coordinates (within the expanded region). */
  const at = (x: number, y: number) => map[Math.min(mh - 1, Math.max(0, y - y0 + M)) * mw + Math.min(mw - 1, Math.max(0, x - x0 + M))];
  const near = (x: number, y: number, r: number, test: (t: number) => boolean) =>
    test(at(x - r, y)) || test(at(x + r, y)) || test(at(x, y - r)) || test(at(x, y + r));

  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const t = at(x, y);
      const n = valueNoise(x / 3, y / 3, seed + 9) * 0.7 + hash2(x, y, seed) * 0.3;
      const shade = Math.min(3, Math.floor(n * 4));
      let col = rgb[t][shade];
      if (t === Tile.Deep && (near(x, y, 2, (o) => o === Tile.Shallow) || near(x, y, 4, (o) => o === Tile.Shallow))) col = deepEdge[shade];
      else if (isWet(t) && near(x, y, 1, (o) => !isWet(o))) col = foam;
      else if (!isWet(t) && near(x, y, 2, isWet)) col = wetSand;
      const i = ((y - y0) * w + (x - x0)) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
    }
  }
  c.ctx.putImageData(img, 0, 0);

  // Ground details: grass tufts, ferns, pebbles, puddles, bones, stones on the river bed.
  const rnd = seededRandom((seed * 7 + 1) ^ Math.imul(Math.floor(x0 / 256) + 1, 73856093) ^ Math.imul(Math.floor(y0 / 256) + 1, 19349663));
  const count = Math.floor((w * h) / 260);
  for (let k = 0; k < count; k++) {
    const x = x0 + 2 + Math.floor(rnd() * (w - 4));
    const y = y0 + 2 + Math.floor(rnd() * (h - 4));
    const t = at(x, y);
    const roll = rnd();
    // Keep land details off the shoreline.
    if (!isWet(t) && near(x, y, 3, isWet)) continue;
    if (t === Tile.Grass || t === Tile.GrassDark) {
      if (roll < 0.8) {
        px(c, x - x0, y - y0, '#86b452');
        px(c, x - x0 - 1, y - y0 - 1, '#86b452');
        px(c, x - x0 + 1, y - y0 - 1, '#6f9a44');
      } else if (roll < 0.86) {
        px(c, x - x0, y - y0, rnd() < 0.5 ? '#e8d24a' : '#e07a9a');
        px(c, x - x0, y - y0 + 1, '#3a6020');
      }
    } else if (t === Tile.Fern) {
      if (roll < 0.6) {
        line(c, x - x0, y - y0, x - x0 + 3, y - y0 - 2, '#68a040', 1);
        line(c, x - x0, y - y0, x - x0 - 3, y - y0 - 2, '#68a040', 1);
        px(c, x - x0, y - y0 - 2, '#2c5420');
      }
    } else if (t === Tile.Dirt) {
      if (roll < 0.5) {
        px(c, x - x0, y - y0, '#a89070');
        px(c, x - x0 + 1, y - y0 + 1, '#5a4630');
      } else if (roll < 0.53) {
        // Old bones bleached in the sun.
        line(c, x - x0 - 3, y - y0, x - x0 + 3, y - y0, '#e6dcc0', 1);
        for (let r = -2; r <= 2; r += 2) line(c, x - x0 + r, y - y0 - 2, x - x0 + r, y - y0 + 2, '#d4c8a8', 1);
      }
    } else if (t === Tile.Mud && roll < 0.35) {
      ellipse(c, x - x0, y - y0, 3 + rnd() * 3, 2 + rnd() * 1.5, (_nx, ny) => (ny < -0.3 ? '#5f7a86' : '#3e5562'));
    } else if (t === Tile.Shallow && roll < 0.3 && !near(x, y, 2, (o) => o !== Tile.Shallow)) {
      // Pebbles on the bottom.
      px(c, x - x0, y - y0, roll < 0.15 ? '#4a7f72' : '#86b8a4');
      if (roll < 0.08) px(c, x - x0 + 1, y - y0, '#4a7f72');
    }
  }
  // Reeds along the shores. Same chunk seed and an inset so a clump (up to 4 px wide, 5 px tall) stays inside the chunk.
  for (let k = 0; k < count / 6; k++) {
    const x = x0 + 4 + Math.floor(rnd() * (w - 8));
    const y = y0 + 5 + Math.floor(rnd() * (h - 10));
    if (at(x, y) !== Tile.Shallow || !near(x, y, 4, (o) => !isWet(o))) continue;
    for (let r = 0; r < 4; r++) {
      const rx = x + Math.round((rnd() - 0.5) * 6);
      const ry = y + Math.round((rnd() - 0.5) * 4);
      line(c, rx - x0, ry - y0, rx - x0 + (rnd() < 0.5 ? -1 : 1), ry - y0 - 3, '#5e8a3a', 1);
      px(c, rx - x0, ry - y0 - 3, '#8ab452');
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

/** Hand-drawn claw: b/d = talon light/dark, l/g/G = scaly foot light/base/dark. */
const CLAW_MAP = [
  'b...............',
  'bb....b.........',
  '.bd....bb.......',
  '.bd.....bd......',
  '..bd....bd......',
  '..bdd...bd..b...',
  '...bd..bdd..bd..',
  '....bdgllg.bdd..',
  'b...gglllggbd...',
  'bb.gllllgggG....',
  '.bdglllgggGG....',
  '..bdggggggGG....',
  '...ggggggGGG....',
  '....gggGGGG.....',
  '.....GGGG.......',
];

/**
 * Mouse cursor for menus: a dino foot with three hooked talons pointing up-left.
 * Drawn at 16x16 and doubled (32x32 is the largest cursor every OS accepts).
 * The tip of the front talon is the hotspot, at (2, 2) after scaling.
 */
export function drawClawCursor(hover: boolean): HTMLCanvasElement {
  const c = makeCanvas(16, 16);
  const colors: Record<string, string> = {
    b: hover ? '#ffe066' : '#efe4c2',
    d: hover ? '#d0a030' : '#b5a57c',
    l: '#7aa951',
    g: '#4d7c3c',
    G: '#2b4a2c',
  };
  // Offset by one pixel so the outline fits around the talon tip.
  CLAW_MAP.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && px(c, x + 1, y + 1, colors[ch])));
  outline(c, OUTLINE);
  const big = makeCanvas(32, 32);
  big.ctx.drawImage(c.canvas, 0, 0, 32, 32);
  return big.canvas;
}
