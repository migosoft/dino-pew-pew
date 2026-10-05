import { checker, ellipse, line, litShade, makeCanvas, outline, px, rect, seededRandom, type PixCanvas } from './pixel';
import { METAL, METAL_DARK, METAL_LIGHT, type DinoPalette } from './dinoArt';

const STONE = ['#4a4640', '#6e685e', '#958d7f'] as const;
const WOOD = ['#3e2716', '#6b4226', '#9a6638'] as const;
const CHAR = '#1d1714';
const ASH = '#3a3430';
const EMBER = '#ff7a2a';
const CRYSTAL = ['#2a8fb0', '#7ff0ff', '#d8ffff'] as const;
const OUTLINE = '#120c08';
const PANEL = '#23272d';
const DECK = ['#28331f', '#3a4a2e', '#52663f'] as const;
const GLASS = ['#0a2e36', '#14606a', '#33b5b0', '#bffff2'] as const;
const ROOF = '#4a525c';
const GLOW = '#5ff6ff';
const AMBER = '#ff9a3a';
const SOLAR = ['#14213d', '#2c4a7c'] as const;

const CX = 48;
/** Fixed damage layout shared by all palettes: where scorches and breaches go on the roofs. */
const HOLES = (() => {
  const rnd = seededRandom(9001);
  return Array.from({ length: 14 }, () => ({ a: rnd() * Math.PI * 2, d: 0.35 + rnd() * 0.6, s: 2 + Math.floor(rnd() * 3) }));
})();

type Pt = [number, number];

function inPoly(pts: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Fill a polygon pixel by pixel (pixel centres inside it). */
function poly(c: PixCanvas, pts: Pt[], shade: (x: number, y: number) => string | null): void {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y < Math.ceil(Math.max(...ys)); y++) {
    for (let x = Math.floor(Math.min(...xs)); x < Math.ceil(Math.max(...xs)); x++) {
      if (!inPoly(pts, x + 0.5, y + 0.5)) continue;
      const col = shade(x, y);
      if (col) px(c, x, y, col);
    }
  }
}

/**
 * A convex footprint (clockwise on screen) raised `h` pixels: the walls facing the viewer, then
 * the roof. `wall` gets the face's lighting (-1 shadowed .. 1 lit from the left) and how far
 * below the roof edge the pixel is.
 */
function prism(
  c: PixCanvas,
  pts: Pt[],
  h: number,
  roof: (x: number, y: number) => string | null,
  wall: (lit: number, v: number, x: number, y: number) => string | null,
): void {
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (dx >= 0) return;
    const lit = -dy / Math.hypot(dx, dy);
    poly(c, [a, b, [b[0], b[1] - h], [a[0], a[1] - h]], (x, y) => wall(lit, y + 0.5 - (a[1] - h + (dy * (x + 0.5 - a[0])) / dx), x, y));
  });
  poly(c, pts.map(([x, y]) => [x, y - h] as Pt), roof);
}

const litWall = (lit: number, dark: string, base: string, light: string) => (lit > 0.3 ? light : lit < -0.3 ? dark : base);

/** The rock plinth the base stands on: stone cliff faces under a mossy concrete apron. */
function plinth(c: PixCanvas): void {
  prism(
    c,
    [[8, 54], [22, 44], [74, 44], [88, 54], [88, 66], [74, 76], [22, 76], [8, 66]],
    7,
    (x, y) => ((x * 3 + y * 5) % 11 === 0 || x % 9 === 0 || y % 6 === 0 ? DECK[0] : (x + y) % 13 === 0 ? DECK[2] : DECK[1]),
    (lit, v, x) => {
      if (v < 1.2) return DECK[2];
      const row = Math.floor(v / 3);
      if (v % 3 < 1 || (x + row * 4) % 7 === 0) return STONE[0];
      return litWall(lit, STONE[0], STONE[1], STONE[2]);
    },
  );
}

/** Hangar wing: armoured box with a lit bay, a team stripe and a turret on the roof. */
function wing(c: PixCanvas, p: DinoPalette, x0: number, caved: boolean): void {
  const x1 = x0 + 22;
  prism(
    c,
    [[x0, 47], [x1, 47], [x1, 63], [x0, 63]],
    15,
    (x, y) => {
      if (caved) return (x + y) % 5 === 0 ? WOOD[0] : x % 6 === 0 ? METAL_DARK : '#141210';
      if (y === 47) return p.tunic;
      if (x === x0 || x === x1 - 1 || y === 32) return METAL_LIGHT;
      // Two recessed roof hatches.
      if (y >= 35 && y <= 44 && ((x >= x0 + 3 && x <= x0 + 9) || (x >= x0 + 12 && x <= x1 - 4))) return y === 35 || y % 2 === 0 ? METAL_DARK : PANEL;
      return ROOF;
    },
    (lit, v, x) => {
      if (v < 1) return METAL_LIGHT;
      // Bay opening with a cyan strip light above it.
      if (x >= x0 + 3 && x <= x1 - 4 && v >= 3) return caved ? CHAR : v < 4 ? GLOW : v > 12 ? METAL_DARK : PANEL;
      if (v > 13) return METAL_DARK;
      return litWall(lit, METAL_DARK, METAL, METAL_LIGHT);
    },
  );
  if (caved) {
    line(c, x0 + 2, 34, x1 - 3, 44, WOOD[0], 2);
    line(c, x0 + 4, 45, x1 - 2, 36, METAL_DARK);
    return;
  }
  // Roof turret, gun pointing outwards.
  const left = x0 < CX;
  const tx = x0 + (left ? 5 : 16);
  ellipse(c, tx, 39, 3, 2, (nx, ny, x, y) => litShade(nx, ny, x, y, METAL_DARK, METAL, METAL_LIGHT));
  line(c, tx, 38, tx + (left ? -4 : 4), 36, METAL_DARK);
  px(c, tx, 41, AMBER);
}

/** Rear module: solar panels, an antenna with a red beacon, and the team flag. */
function rearModule(c: PixCanvas, p: DinoPalette, stage: number): void {
  prism(
    c,
    [[34, 32], [62, 32], [62, 42], [34, 42]],
    20,
    (x, y) => {
      if (x === 34 || x === 61 || y === 12) return METAL_LIGHT;
      if (x >= 44 && x <= 59 && y >= 14 && y <= 20) return x % 4 === 0 || y === 17 ? SOLAR[1] : SOLAR[0];
      return x < 44 && y % 3 === 0 ? METAL_DARK : '#3f5a3a';
    },
    (lit, v) => (v < 1 ? METAL_LIGHT : v < 2 ? GLOW : litWall(lit, METAL_DARK, METAL, METAL_LIGHT)),
  );
  line(c, 38, 14, 38, 2, METAL_LIGHT);
  line(c, 40, 15, 40, 7, METAL);
  px(c, 38, 1, stage >= 2 ? CHAR : '#ff3030');
  if (stage >= 4) return;
  const torn = stage >= 1;
  for (let r = 0; r < 6; r++) {
    const w = torn ? (r % 2 ? 4 : 7 - r) : 8;
    rect(c, 39, 2 + r, w, 1, r < 2 ? p.tunicLight : p.tunic);
  }
}

/** Octagonal command core: dark armour with circuit traces, a team-coloured deck rim and crest. */
function core(c: PixCanvas, p: DinoPalette): void {
  const deck: Pt[] = [[33, 33], [39, 28], [57, 28], [63, 33], [63, 44], [57, 49], [39, 49], [33, 44]];
  prism(
    c,
    [[32, 50], [39, 45], [57, 45], [64, 50], [64, 62], [57, 67], [39, 67], [32, 62]],
    18,
    (x, y) => {
      if (!inPoly(deck, x + 0.5, y + 0.5)) return p.tunic;
      return (x + y) % 6 === 0 || x % 8 === 0 ? DECK[0] : DECK[1];
    },
    (lit, v, x, y) => {
      if (v < 1) return p.tunicLight;
      if (v > 16) return METAL_DARK;
      // Circuit traces: amber on the lit face, cyan screens on the shaded one.
      if (lit > 0.3 && (v === 6 || (v > 6 && v < 12 && x % 4 === 1)) && x % 2 === 0) return AMBER;
      if (lit < -0.3 && v >= 4 && v <= 10 && (x + y) % 3 !== 0) return v < 5 ? GLOW : '#1e5a6a';
      return litWall(lit, PANEL, METAL_DARK, METAL);
    },
  );
  // Team crest with a gear on the front face.
  rect(c, 42, 52, 12, 10, METAL_DARK);
  rect(c, 43, 53, 10, 8, p.tunic);
  rect(c, 43, 53, 10, 1, p.tunicLight);
  ellipse(c, 48, 57, 3, 3, (nx, ny) => (nx * nx + ny * ny < 0.3 ? METAL_DARK : METAL_LIGHT));
  for (const [dx, dy] of [[0, -4], [0, 3], [-4, 0], [3, 0]]) px(c, 48 + dx, 57 + dy, METAL_LIGHT);
}

/** Geodesic glass dome on the core, on a metal collar with cyan lights. */
function dome(c: PixCanvas, cracked: boolean, scorched: boolean): void {
  ellipse(c, CX, 39, 15, 8, (nx, ny, x, y) => (ny > 0.6 && x % 5 === 0 ? GLOW : litShade(nx, ny, x, y, PANEL, METAL_DARK, METAL)));
  const glass = (nx: number, ny: number, x: number, y: number): string => {
    // A triangle lattice reads as the geodesic frame.
    const frame = (x * 2 + y) % 10 === 0 || (x * 2 - y + 100) % 10 === 0 || (y + 2) % 10 === 0;
    const l = -nx * 0.6 - ny * 0.6;
    if (frame) return l > 0.2 ? GLASS[3] : GLASS[2];
    if (scorched && (x * 7 + y * 3) % 9 === 0) return CHAR;
    if (l > 0.75) return GLASS[3];
    if (l > 0.5) return GLASS[2];
    if (l > 0.3) return checker(x, y) ? GLASS[2] : GLASS[1];
    if (nx * nx + ny * ny > 0.8) return GLASS[0];
    return GLASS[1];
  };
  ellipse(c, CX, 37, 13, 13, (nx, ny, x, y) => (ny > 0 ? null : glass(nx, ny, x, y)));
  ellipse(c, CX, 37, 13, 5, (nx, ny, x, y) => (ny <= 0 ? null : glass(nx, ny * 0.4, x, y)));
  if (cracked) {
    line(c, CX - 2, 27, CX + 1, 32, CHAR);
    line(c, CX + 1, 32, CX - 1, 36, CHAR);
    line(c, CX + 1, 32, CX + 6, 34, CHAR);
    ellipse(c, CX + 4, 30, 2, 2, () => '#08161a');
  }
}

/** The team's base: a rock plinth, two hangar wings, a command core under a glass dome. */
export function drawCamp(p: DinoPalette, stage: number): HTMLCanvasElement {
  const c = makeCanvas(96, 96);
  if (stage >= 5) return drawRuins(c);
  plinth(c);
  rearModule(c, p, stage);
  wing(c, p, 10, false);
  wing(c, p, 64, stage >= 3);
  core(c, p);
  // Damage that builds up stage by stage.
  HOLES.forEach((h, i) => {
    const x = Math.round(CX + Math.cos(h.a) * 36 * h.d);
    const y = Math.round(40 + Math.sin(h.a) * 10 * h.d);
    if (stage >= 1 && i < 4) ellipse(c, x, y, h.s, h.s - 1, (nx, ny, xx, yy) => (nx * nx + ny * ny < 0.45 ? 'rgba(20,14,10,0.8)' : (xx + yy) % 2 ? 'rgba(20,14,10,0.55)' : null));
    if ((stage >= 2 && i >= 4 && i < 8) || (stage >= 4 && i >= 8)) {
      ellipse(c, x, y, h.s, h.s - 1, () => '#1a110b');
      px(c, x + h.s - 1, y, EMBER);
    }
  });
  // Drawn after the damage so no hole swallows it; same spot at every stage, cracked from stage 4.
  dome(c, stage >= 4, stage >= 2);
  if (stage >= 3) for (let k = 0; k < 18; k++) px(c, 66 + ((k * 7) % 18), 64 + ((k * 5) % 7), k % 2 ? METAL : STONE[k % 3]);
  outline(c, OUTLINE);
  return c.canvas;
}

/** What is left: the scorched plinth, twisted plating, charred beams and dome shards. */
function drawRuins(c: PixCanvas): HTMLCanvasElement {
  plinth(c);
  ellipse(c, CX, 52, 34, 13, (_nx, _ny, x, y) => ((x * 7 + y * 3) % 5 === 0 ? CHAR : ASH));
  const rnd = seededRandom(4242);
  for (let k = 0; k < 60; k++) {
    const a = rnd() * Math.PI * 2;
    const d = 0.5 + rnd() * 0.5;
    const x = Math.round(CX + Math.cos(a) * 34 * d);
    const y = Math.round(52 + Math.sin(a) * 13 * d);
    const s = 1 + Math.floor(rnd() * 3);
    const [dark, base, light] = k % 3 ? [METAL_DARK, METAL, METAL_LIGHT] : STONE;
    ellipse(c, x, y, s, s, (nx, ny, xx, yy) => litShade(nx, ny, xx, yy, dark, base, light));
  }
  line(c, CX - 22, 44, CX + 16, 60, METAL_DARK, 2);
  line(c, CX - 14, 60, CX + 22, 46, CHAR, 2);
  line(c, CX - 4, 40, CX + 4, 62, WOOD[0], 2);
  for (const [dx, dy] of [[-3, 2], [4, -1], [1, 5], [-8, -2], [9, 4]]) px(c, CX + dx, 50 + dy, GLASS[2]);
  for (let k = 0; k < 8; k++) px(c, CX - 10 + k * 3, 52 + (k % 3), EMBER);
  outline(c, OUTLINE);
  return c.canvas;
}

/** Small crystal on the tower body, below the turret. */
function miniCrystal(c: PixCanvas, x: number, y: number): void {
  ellipse(c, x, y, 4, 4, () => 'rgba(127,240,255,0.35)');
  rect(c, x - 1, y - 2, 3, 5, CRYSTAL[0]);
  rect(c, x - 1, y - 2, 1, 4, CRYSTAL[2]);
  rect(c, x, y - 3, 1, 1, CRYSTAL[1]);
  rect(c, x, y - 1, 1, 3, CRYSTAL[1]);
  rect(c, x - 1, y + 3, 3, 1, METAL_DARK);
}

/** Defense tower: stone footing, timber frame, pennant. The turret is a separate rotating sprite on top (at y 18). */
export function drawTowerBase(p: DinoPalette, stage: number): HTMLCanvasElement {
  const c = makeCanvas(32, 48);
  if (stage >= 3) {
    // Rubble.
    const rnd = seededRandom(77);
    for (let k = 0; k < 26; k++) {
      const x = Math.round(16 + (rnd() - 0.5) * 22);
      const y = Math.round(40 + (rnd() - 0.5) * 10);
      ellipse(c, x, y, 2, 1 + Math.floor(rnd() * 2), (nx, ny, xx, yy) => litShade(nx, ny, xx, yy, STONE[0], STONE[1], STONE[2]));
    }
    line(c, 7, 36, 24, 42, WOOD[0], 2);
    outline(c, OUTLINE);
    return c.canvas;
  }
  ellipse(c, 16, 40, 12, 6, (nx, ny, x, y) => litShade(nx, ny, x, y, STONE[0], STONE[1], STONE[2]));
  // Tapered stone body.
  for (let y = 20; y < 40; y++) {
    const half = 6 + Math.floor((y - 20) / 6);
    for (let x = 16 - half; x <= 16 + half; x++) px(c, x, y, x < 16 - half + 2 ? STONE[2] : x > 16 + half - 2 ? STONE[0] : (x + y) % 7 === 0 ? STONE[0] : STONE[1]);
  }
  // Timber platform the turret sits on.
  ellipse(c, 16, 18, 10, 5, (nx, ny, x, y) => litShade(nx, ny, x, y, WOOD[0], WOOD[1], WOOD[2]));
  miniCrystal(c, 16, 33);
  // Pennant.
  line(c, 25, 4, 25, 18, WOOD[1]);
  for (let r = 0; r < 5; r++) rect(c, 26, 5 + r, 5 - r, 1, r < 2 ? p.tunicLight : p.tunic);
  if (stage >= 1) {
    line(c, 12, 24, 14, 30, CHAR);
    line(c, 14, 30, 13, 34, CHAR);
    line(c, 20, 27, 19, 33, CHAR);
  }
  if (stage >= 2) {
    // A chunk knocked out of the body, and the pennant gone.
    c.ctx.clearRect(18, 21, 5, 6);
    c.ctx.clearRect(25, 4, 7, 6);
    px(c, 18, 27, EMBER);
    px(c, 20, 28, EMBER);
    px(c, 17, 24, '#ffd27a');
    line(c, 10, 22, 12, 28, CHAR);
    line(c, 22, 30, 21, 36, CHAR);
  }
  outline(c, OUTLINE);
  return c.canvas;
}

/** Tower turret seen from above, barrel along +x (rotated by rotationStrip). */
export function drawTowerTurret(p: DinoPalette): HTMLCanvasElement {
  const c = makeCanvas(20, 20);
  ellipse(c, 10, 10, 5, 5, (nx, ny, x, y) => litShade(nx, ny, x, y, METAL_DARK, METAL, METAL_LIGHT));
  rect(c, 12, 9, 7, 2, METAL);
  rect(c, 12, 9, 7, 1, METAL_LIGHT);
  rect(c, 18, 9, 1, 2, METAL_DARK);
  rect(c, 8, 8, 2, 4, p.tunic);
  outline(c, OUTLINE);
  return c.canvas;
}

/** Hex-cell energy sphere over the camp: near-clear centre, cells brightening towards a glowing rim. */
export function drawField(color: string): HTMLCanvasElement {
  const W = 128;
  const H = 120;
  const cx = 64;
  const cy = 60;
  const rx = 56;
  const ry = 52;
  const c = makeCanvas(W, H);
  const n = parseInt(color.slice(1), 16);
  /** The team colour pushed towards white by `f`, at alpha `a`. */
  const col = (f: number, a: number) => {
    const ch = (s: number) => Math.round(((n >> s) & 255) * (1 - f) + 255 * f);
    return `rgba(${ch(16)},${ch(8)},${ch(0)},${a.toFixed(2)})`;
  };
  const SQ3 = Math.sqrt(3);
  const mod = (a: number, m: number) => a - Math.floor(a / m) * m;
  /** Distance to the nearest hex cell edge: 0 on an edge, 0.5 at a cell centre. */
  const hexEdge = (u: number, v: number) => {
    const ax = mod(u, 1) - 0.5;
    const ay = mod(v, SQ3) - SQ3 / 2;
    const bx = mod(u - 0.5, 1) - 0.5;
    const by = mod(v - SQ3 / 2, SQ3) - SQ3 / 2;
    const [qx, qy] = ax * ax + ay * ay < bx * bx + by * by ? [Math.abs(ax), Math.abs(ay)] : [Math.abs(bx), Math.abs(by)];
    return 0.5 - Math.max(qx, qx * 0.5 + qy * (SQ3 / 2));
  };
  const rnd = seededRandom(5150);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const d = Math.hypot(nx, ny);
      const spark = rnd();
      if (d > 1.12) continue;
      if (d > 1) {
        // Soft outer glow.
        px(c, x, y, col(0.2, 0.4 * ((1.12 - d) / 0.12) ** 2));
        continue;
      }
      if (d > 0.95) {
        px(c, x, y, col(d > 0.975 ? 0.75 : 0.45, 1));
        continue;
      }
      // Bend the grid over a sphere so the cells shrink towards the rim.
      const k = d > 0.001 ? Math.asin(d) / d : 1;
      const edge = hexEdge(nx * k * 3.2 + 0.25, ny * k * 3.2);
      if (edge < 0.055 * (1 + 1.6 * d * d)) {
        px(c, x, y, col(0.35 + 0.3 * d, 0.12 + 0.8 * d ** 3));
        continue;
      }
      if (d > 0.45 && spark < 0.006 + 0.03 * d ** 4) {
        px(c, x, y, col(0.85, 0.9));
        continue;
      }
      // Highlight arc on the upper left.
      if (d > 0.84 && nx < -0.2 && ny < -0.2) {
        px(c, x, y, col(0.6, 0.35));
        continue;
      }
      px(c, x, y, col(0.1, 0.02 + 0.3 * d ** 6));
    }
  }
  return c.canvas;
}

/** White ripple ring, tinted and scaled up where the field blocks a hit. */
export function drawFieldRing(): HTMLCanvasElement {
  const c = makeCanvas(16, 16);
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    px(c, Math.round(8 + Math.cos(a) * 6), Math.round(8 + Math.sin(a) * 6), '#ffffff');
  }
  return c.canvas;
}
