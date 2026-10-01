import { checker, ellipse, hash2, line, litShade, makeCanvas, outline, px, rect, seededRandom, type PixCanvas } from './pixel';

// Procedural food sources: edible shrubs, fern patches and carcasses.
// Same conventions as worldArt: light from the upper-left, 1px dark outline, crisp pixels.

/** Food stage by remaining food fraction: 0 = full, 1 = half eaten, 2 = nearly gone. */
export type FoodStage = 0 | 1 | 2;
/** Species with carcass art. */
export const CARCASS_KINDS = ['triceratops', 'velociraptor', 'brontosaurus'] as const;
export type CarcassKind = (typeof CARCASS_KINDS)[number];

export const BUSH_VARIANTS = 3;
export const FERN_VARIANTS = 2;

const OUTLINE = '#17110d';
const FERN_OUTLINE = '#223a1a';

const STEM_DARK = '#3a2416';
const STEM = '#5e3b22';
const STEM_LIGHT = '#86593a';

const HIDE_DARK = '#3a3226';
const HIDE = '#5a5038';
const HIDE_LIGHT = '#7a6c4c';
const BELLY = '#8a7c5a';
const MEAT_DARK = '#5a1410';
const MEAT = '#7a1e1a';
const MEAT_LIGHT = '#a8322a';
const BONE = '#efe4c2';
const BONE_DARK = '#b5a57c';
const BONE_HI = '#fff6dc';
const SOCKET = '#2a2018';
const BEAK = '#3a3430';
const POOL = '#3e0f0c';
const POOL_EDGE = '#561510';

/** Fraction of fronds/clumps that survive at each stage. */
const BUSH_KEEP = [1, 0.55, 0.2];
const FERN_KEEP = [1, 0.5, 0.25];

function wrap(v: number, n: number): number {
  return ((Math.floor(v) % n) + n) % n;
}

/** Pick which of `n` parts survive: the `frac` share with the lowest random keys. Always keeps one. */
function survivors(n: number, frac: number, keys: number[]): boolean[] {
  const order = keys.map((k, i) => [k, i]).sort((a, b) => a[0] - b[0]);
  const keepN = Math.max(1, Math.round(n * frac));
  const alive: boolean[] = new Array(n).fill(false);
  for (let r = 0; r < keepN; r++) alive[order[r][1]] = true;
  return alive;
}

// ---------------------------------------------------------------------------
// Bushes
// ---------------------------------------------------------------------------

/** Cycad-style pinnate frond radiating from (cx, cy). `gap` drops leaflet pixels (browsed look). */
function cycadFrond(
  c: PixCanvas,
  cx: number,
  cy: number,
  a: number,
  len: number,
  width: number,
  pal: [string, string, string],
  gap: number,
  seed: number,
): void {
  const [dark, mid, light] = pal;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  for (let t = 1.5; t < len; t += 0.5) {
    const x = cx + ca * t;
    const y = cy + sa * t;
    const leaf = Math.max(0, Math.round(width * Math.sin((t / len) * Math.PI)));
    for (let k = -leaf; k <= leaf; k++) {
      const lx = x - sa * k + ca * Math.abs(k) * 0.5;
      const ly = y + ca * k + sa * Math.abs(k) * 0.5;
      if (k !== 0 && gap > 0 && hash2(Math.floor(lx), Math.floor(ly), seed) < gap) continue;
      const lit = -ca * 0.5 - sa * 0.7 - k * 0.12;
      px(c, lx, ly, k === 0 ? dark : lit > 0.25 ? light : lit > -0.3 ? mid : dark);
    }
  }
}

/** Bare, browsed stem: brown rachis with a few leaf-scar stubs. */
function bareStem(c: PixCanvas, cx: number, cy: number, a: number, len: number): void {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  line(c, cx + ca * 1.5, cy + sa * 1.5, cx + ca * len, cy + sa * len, STEM, 1);
  for (let t = 2.5; t < len - 0.5; t += 2) {
    const side = (Math.round(t) & 2) === 0 ? 1 : -1;
    px(c, cx + ca * t - sa * side, cy + sa * t + ca * side, STEM_DARK);
  }
  px(c, cx + ca * len, cy + sa * len, STEM_LIGHT);
}

/** Leafy prehistoric shrub (cycad/horsetail-like). About 14-18px across. Canvas center = plant center. */
export function drawBush(variant: number, stage: FoodStage): HTMLCanvasElement {
  const v = wrap(variant, BUSH_VARIANTS);
  const c = makeCanvas(22, 22);
  const cx = 11;
  const cy = 11;
  const rnd = seededRandom(1009 + v * 7919);
  const keep = BUSH_KEEP[stage];

  if (v === 0) {
    // Dark green cycad: stiff pinnate fronds around a stout trunk nub.
    const n = 8;
    const start = rnd() * 6.28;
    const fronds = Array.from({ length: n }, (_, i) => ({
      a: start + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.35,
      len: 6.4 + rnd() * 1.4,
      key: rnd(),
    }));
    const alive = survivors(
      n,
      keep,
      fronds.map((f) => f.key),
    );
    const pal: [string, string, string] = ['#1f3d1c', '#356b2a', '#5e9a3e'];
    fronds.forEach((f, i) => {
      if (!alive[i]) bareStem(c, cx, cy, f.a, stage === 1 ? f.len * 0.75 : 3.5);
    });
    fronds.forEach((f, i) => {
      if (!alive[i]) return;
      const len = stage === 2 ? f.len * 0.7 : f.len;
      cycadFrond(c, cx, cy, f.a, len, 1.6, pal, stage === 0 ? 0 : stage === 1 ? 0.25 : 0.4, 11 + i);
    });
    ellipse(c, cx, cy, 2.3, 2.3, (nx, ny, x, y) => litShade(nx, ny, x, y, STEM_DARK, STEM, STEM_LIGHT));
    px(c, cx - 1, cy - 1, '#a8b84a');
  } else if (v === 1) {
    // Yellow-green horsetail clump: jointed stems with whorls and little cones at the tips.
    const n = 13;
    const start = rnd() * 6.28;
    const stems = Array.from({ length: n }, (_, i) => ({
      a: start + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.4,
      len: 5 + rnd() * 3,
      key: rnd(),
    }));
    const alive = survivors(
      n,
      keep,
      stems.map((s) => s.key),
    );
    const STALK = '#8aa83a';
    const STALK_LIGHT = '#b4c85a';
    const NODE = '#4e6a22';
    const CONE = '#a08440';
    ellipse(c, cx, cy, 2, 2, () => '#3e5a1e');
    stems.forEach((s, i) => {
      const ca = Math.cos(s.a);
      const sa = Math.sin(s.a);
      if (!alive[i]) {
        // Chewed stub.
        line(c, cx + ca, cy + sa, cx + ca * 2.8, cy + sa * 2.8, '#8a7a3a', 1);
        px(c, cx + ca * 3, cy + sa * 3, '#5a4a22');
        return;
      }
      const len = stage === 2 ? s.len * 0.7 : s.len;
      for (let t = 1; t <= len; t += 0.5) {
        const x = cx + ca * t;
        const y = cy + sa * t;
        const node = Math.abs(t - Math.round(t)) < 0.01 && Math.round(t) % 2 === 0;
        const lit = -ca * 0.5 - sa * 0.7;
        px(c, x, y, node ? NODE : lit > 0 ? STALK_LIGHT : STALK);
        if (node && t < len - 1) {
          // Whorl of needle leaves.
          const thin = stage > 0 && hash2(Math.floor(x), Math.floor(y), 5 + i) < 0.4;
          if (!thin) {
            px(c, x - sa, y + ca, STALK);
            px(c, x + sa, y - ca, STALK_LIGHT);
          }
        }
      }
      px(c, cx + ca * (len + 0.6), cy + sa * (len + 0.6), CONE);
    });
  } else {
    // Rounded berry shrub: leaf clumps on brown twigs, dotted with red berries.
    const ring = 7;
    const start = rnd() * 6.28;
    const clumps = Array.from({ length: ring + 1 }, (_, i) => {
      const center = i === ring;
      const a = start + (i / ring) * Math.PI * 2 + (rnd() - 0.5) * 0.3;
      const d = center ? 0 : 4 + rnd() * 0.8;
      return {
        x: cx + Math.cos(a) * d,
        y: cy + Math.sin(a) * d,
        r: center ? 3.2 : 2.6 + rnd() * 0.5,
        key: center ? 0.5 * rnd() : rnd(),
        berries: [rnd(), rnd(), rnd(), rnd()],
      };
    });
    const alive = survivors(
      clumps.length,
      keep,
      clumps.map((k) => k.key),
    );
    // Twigs show through where clumps were eaten.
    for (const k of clumps) {
      if (k.x === cx && k.y === cy) continue;
      line(c, cx, cy, k.x, k.y, STEM, 1);
      px(c, k.x, k.y, STEM_LIGHT);
    }
    ellipse(c, cx, cy, 1.3, 1.3, () => STEM_DARK);
    const order = clumps.map((_, i) => i).sort((a, b) => (a === ring ? 1 : b === ring ? -1 : clumps[a].y - clumps[b].y));
    const gap = stage === 0 ? 0 : stage === 1 ? 0.18 : 0.3;
    for (const i of order) {
      if (!alive[i]) continue;
      const k = clumps[i];
      const r = stage === 2 ? k.r * 0.75 : k.r;
      ellipse(c, k.x, k.y, r, r, (nx, ny, x, y) => {
        if (gap > 0 && nx * nx + ny * ny > 0.3 && hash2(x, y, 31 + i) < gap) return null;
        return litShade(nx, ny, x, y, '#2e5a26', '#4a8034', '#76a84a');
      });
    }
    // Berries (2x2, lit from the upper-left) on top of surviving clumps.
    for (const i of order) {
      if (!alive[i]) continue;
      const k = clumps[i];
      const want = stage === 0 ? true : stage === 1 ? k.berries[0] < 0.5 : i === order[order.length - 1];
      if (!want) continue;
      const count = stage === 0 && k.berries[1] < 0.5 ? 2 : 1;
      for (let b = 0; b < count; b++) {
        const bx = Math.floor(k.x + (k.berries[2 + b] - 0.5) * 3);
        const by = Math.floor(k.y + (k.berries[3 - b] - 0.6) * 3);
        px(c, bx, by, '#f07a6a');
        px(c, bx + 1, by, '#c8302a');
        px(c, bx, by + 1, '#c8302a');
        px(c, bx + 1, by + 1, '#7a1a1e');
      }
    }
  }
  outline(c, OUTLINE);
  return c.canvas;
}

// ---------------------------------------------------------------------------
// Fern patches
// ---------------------------------------------------------------------------

/** Low patch of ferns, flatter and wider than a bush (~16-20px). Canvas center = patch center. */
export function drawFernPatch(variant: number, stage: FoodStage): HTMLCanvasElement {
  const v = wrap(variant, FERN_VARIANTS);
  const c = makeCanvas(26, 20);
  const cx = 13;
  const cy = 10;
  const rnd = seededRandom(4241 + v * 3571);
  const [dark, mid, light] = v === 0 ? ['#2c5424', '#3c6e2e', '#548a3a'] : ['#2e4e2c', '#42683a', '#5e8648'];
  const n = v === 0 ? 8 : 7;
  const origins: [number, number][] = [
    [cx - 3, cy + 0.5],
    [cx + 3, cy - 0.5],
  ];
  const start = rnd() * 6.28;
  const fronds = Array.from({ length: n }, (_, i) => {
    const [ox, oy] = origins[i % 2];
    const a = start + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
    // Fronds pointing sideways reach further so the patch is wide and flat.
    const len = 4.5 + rnd() * 1.5 + Math.abs(Math.cos(a)) * 1.2;
    const dx = Math.cos(a);
    const dy = Math.sin(a) * 0.7;
    const m = Math.hypot(dx, dy);
    return { ox, oy, dx: dx / m, dy: dy / m, len, key: rnd() };
  });
  const alive = survivors(
    n,
    FERN_KEEP[stage],
    fronds.map((f) => f.key),
  );
  const gap = stage === 0 ? 0 : stage === 1 ? 0.2 : 0.3;
  const order = fronds.map((_, i) => i).sort((a, b) => fronds[a].dy - fronds[b].dy);
  for (const i of order) {
    const f = fronds[i];
    if (!alive[i]) {
      line(c, f.ox + f.dx, f.oy + f.dy, f.ox + f.dx * 2.2, f.oy + f.dy * 2.2, '#5a4a2a', 1);
      continue;
    }
    const len = stage === 2 ? f.len * 0.8 : f.len;
    const qx = -f.dy;
    const qy = f.dx;
    for (let t = 0.5; t <= len; t += 0.5) {
      const x = f.ox + f.dx * t;
      const y = f.oy + f.dy * t;
      px(c, x, y, mid);
      if (Math.abs(t - Math.round(t)) > 0.01) continue;
      const w = Math.round(2 * Math.sin((t / (len + 0.5)) * Math.PI));
      for (let k = 1; k <= w; k++) {
        for (const s of [-1, 1]) {
          const lx = x + qx * k * s + f.dx * k * 0.4;
          const ly = y + qy * k * s + f.dy * k * 0.4;
          if (gap > 0 && hash2(Math.floor(lx), Math.floor(ly), 71 + i) < gap) continue;
          const lit = -qx * s * 0.5 - qy * s * 0.7;
          px(c, lx, ly, lit > 0.15 ? light : k === w ? dark : mid);
        }
      }
    }
    // Curled fiddlehead tip.
    px(c, f.ox + f.dx * (len + 0.7), f.oy + f.dy * (len + 0.7), dark);
  }
  for (const [ox, oy] of origins) px(c, ox, oy, dark);
  outline(c, FERN_OUTLINE);
  return c.canvas;
}

// ---------------------------------------------------------------------------
// Carcasses
// ---------------------------------------------------------------------------

/** Irregular dark blood pool drawn straight onto the final canvas (under the outlined body). */
function bloodPool(c: PixCanvas, cx: number, cy: number, rx: number, ry: number, seed: number): void {
  ellipse(c, cx, cy, rx, ry, (nx, ny, x, y) => {
    const d = nx * nx + ny * ny;
    if (d > 0.55 && hash2(x, y, seed) < (d - 0.55) * 2.4) return null;
    return d < 0.4 ? POOL : POOL_EDGE;
  });
  const rnd = seededRandom(seed * 17 + 3);
  for (let i = 0; i < 4; i++) {
    const a = rnd() * 6.28;
    px(c, cx + Math.cos(a) * rx * 1.1, cy + Math.sin(a) * ry * 1.1, POOL_EDGE);
  }
}

/** Horizontal taper strip (tails): `half(x)` = half-thickness, `off(x)` = integer center offset. */
function taper(
  c: PixCanvas,
  cx: number,
  cy: number,
  x0: number,
  x1: number,
  half: (x: number) => number,
  off: (x: number) => number,
  color: (ny: number, x: number, y: number) => string,
): void {
  for (let x = x0; x <= x1; x++) {
    const h = half(x);
    const o = off(x);
    for (let y = -Math.ceil(h); y <= Math.ceil(h); y++) {
      if (Math.abs(y + 0.5) > h) continue;
      px(c, cx + x, cy + o + y, color((y + 0.5) / h, cx + x, cy + o + y));
    }
  }
}

/** Ragged open wound with exposed red meat. */
function wound(c: PixCanvas, cx: number, cy: number, rx: number, ry: number, seed: number): void {
  // Torn hide lip.
  ellipse(c, cx, cy, rx + 1, ry + 1, (_nx, _ny, x, y) => (hash2(x, y, seed) < 0.55 ? HIDE_DARK : null));
  ellipse(c, cx, cy, rx, ry, (nx, ny, x, y) => {
    if (nx * nx + ny * ny > 0.7 && hash2(x, y, seed + 1) < 0.35) return null;
    return litShade(nx, ny, x, y, MEAT_DARK, MEAT, MEAT_LIGHT);
  });
}

function compose(final: PixCanvas, body: PixCanvas): HTMLCanvasElement {
  outline(body, OUTLINE);
  final.ctx.drawImage(body.canvas, 0, 0);
  return final.canvas;
}

function drawTriceratopsCarcass(stage: FoodStage): HTMLCanvasElement {
  const W = 56;
  const H = 40;
  const out = makeCanvas(W, H);
  const b = makeCanvas(W, H);
  const cx = 28;
  const cy = 20;
  const tailOff = (x: number) => Math.round(((-8 - x) / 14) ** 2 * 3);
  // Legs splayed stiffly out to the belly side (+y): [x0, y0, x1, y1].
  const legs: [number, number, number, number][] = [
    [7, 5, 10, 15],
    [3, 6, 2, 14],
    [-6, 6, -4, 15],
    [-10, 5, -12, 13],
  ];

  if (stage === 2) {
    // Bleached skeleton.
    // Tail vertebrae.
    for (let x = -21; x <= -8; x++) px(b, cx + x, cy + tailOff(x), x % 2 === 0 ? BONE : BONE_DARK);
    // Spine through the (absent) torso, which lies with its back toward -y.
    line(b, cx - 8, cy, cx - 4, cy - 5, BONE, 1);
    line(b, cx - 4, cy - 5, cx + 8, cy - 5, BONE, 1);
    line(b, cx + 8, cy - 5, cx + 10, cy - 1, BONE, 1);
    for (let x = -4; x <= 8; x += 2) px(b, cx + x, cy - 6, BONE_DARK);
    // Ribcage.
    for (const rx of [-3, -0.5, 2, 4.5, 7]) {
      const L = 4 + 7 * Math.sqrt(Math.max(0, 1 - ((rx - 2) / 8) ** 2));
      line(b, cx + rx, cy - 4, cx + rx + 1.5, cy - 4 + L * 0.5, BONE, 1);
      line(b, cx + rx + 1.5, cy - 4 + L * 0.5, cx + rx + 1, cy - 4 + L, BONE, 1);
      px(b, cx + rx + 1, cy - 4 + L, BONE_DARK);
    }
    // Pelvis.
    ellipse(b, cx - 7, cy - 3, 3, 2.2, (nx, ny, x, y) => litShade(nx, ny, x, y, BONE_DARK, BONE, BONE_HI));
    px(b, cx - 7, cy - 3, BONE_DARK);
    // Limb bones (two still in place, two dragged off).
    const bone = (x0: number, y0: number, x1: number, y1: number) => {
      line(b, cx + x0, cy + y0, cx + x1, cy + y1, BONE, 1);
      rect(b, cx + x1 - 0.5, cy + y1 - 0.5, 2, 2, BONE_DARK);
      px(b, cx + x0, cy + y0, BONE_HI);
    };
    bone(-7, 0, -5, 11);
    bone(-13, 7, -10, 12);
    line(b, cx + 6, cy - 3, cx + 8, cy + 3, BONE_DARK, 1);
    bone(8, 3, 10, 12);
    bone(2, 9, 5, 13);
    // Frill: bony shield with two big openings.
    ellipse(b, cx + 12, cy + 1, 5, 10, (nx, ny, x, y) => {
      if (nx > 0.55) return null;
      if ((nx + 0.15) ** 2 / 0.12 + (Math.abs(ny) - 0.42) ** 2 / 0.05 < 1) return null;
      if (nx * nx + ny * ny > 0.7) return checker(x, y) ? BONE : BONE_DARK;
      return litShade(nx, ny, x, y, BONE_DARK, BONE, BONE_HI);
    });
    // Skull.
    ellipse(b, cx + 19, cy + 1, 5.5, 3.5, (nx, ny, x, y) => litShade(nx, ny, x, y, BONE_DARK, BONE, BONE_HI));
    px(b, cx + 18, cy - 1, SOCKET);
    px(b, cx + 18, cy + 3, SOCKET);
    px(b, cx + 23, cy + 1, SOCKET);
    // Horn cores and beak.
    line(b, cx + 18, cy - 2, cx + 24, cy - 4, BONE_DARK, 1);
    line(b, cx + 18, cy + 4, cx + 24, cy + 6, BONE_DARK, 1);
    px(b, cx + 22, cy + 1, BONE_DARK);
    rect(b, cx + 24, cy, 2, 2, BEAK);
    // Dried scraps.
    px(b, cx + 1, cy - 2, MEAT_DARK);
    px(b, cx + 4, cy + 1, MEAT_DARK);
    px(b, cx - 6, cy - 4, HIDE_DARK);
    px(b, cx + 9, cy - 3, HIDE);
    px(b, cx - 15, cy + 1, HIDE_DARK);
    return compose(out, b);
  }

  bloodPool(out, cx + 2, cy + 8, stage === 0 ? 15 : 19, stage === 0 ? 7 : 9, 91 + stage);

  // Legs.
  legs.forEach(([x0, y0, x1, y1], i) => {
    if (stage === 1 && i === 2) {
      // Torn off: only a gnawed bone stub remains.
      line(b, cx + x0, cy + y0, cx + x1, cy + y1 - 3, BONE, 1);
      rect(b, cx + x1 - 0.5, cy + y1 - 3.5, 2, 2, BONE_DARK);
      px(b, cx + x0, cy + y0 + 1, MEAT);
      return;
    }
    line(b, cx + x0, cy + y0, cx + x1, cy + y1, HIDE_DARK, 3);
    line(b, cx + x0 - 1, cy + y0, cx + x1 - 1, cy + y1, HIDE, 1);
    px(b, cx + x1 - 1, cy + y1 + 2, BONE_DARK);
    px(b, cx + x1 + 1, cy + y1 + 2, BONE_DARK);
  });

  // Tail, sagging a little.
  taper(
    b,
    cx,
    cy,
    -22,
    -7,
    (x) => 0.6 + ((x + 22) / 15) * 4.4,
    tailOff,
    (ny) => (ny < -0.4 ? HIDE_LIGHT : ny > 0.5 ? HIDE_DARK : HIDE),
  );

  // Torso on its side: back toward -y, pale belly toward +y.
  ellipse(b, cx, cy, 13, 9, (nx, ny, x, y) => {
    if (ny > 0.6 && nx * nx + ny * ny < 0.9) return checker(x, y) ? BELLY : HIDE_LIGHT;
    return litShade(nx, ny, x, y, HIDE_DARK, HIDE, HIDE_LIGHT);
  });
  // Spine scutes along the back edge.
  for (let x = -11; x <= 9; x += 3) {
    px(b, cx + x, cy - 7, HIDE_DARK);
    px(b, cx + x + 1, cy - 8, HIDE_LIGHT);
  }
  // Mottled hide.
  for (const [sx, sy] of [
    [-8, -4],
    [-3, -1],
    [4, -5],
    [-10, 2],
    [7, 0],
  ]) {
    px(b, cx + sx, cy + sy, HIDE_DARK);
    px(b, cx + sx + 1, cy + sy, HIDE_DARK);
  }

  if (stage === 0) {
    // A bite wound and blood at the mouth.
    px(b, cx + 3, cy + 4, MEAT);
    px(b, cx + 4, cy + 4, MEAT_LIGHT);
    px(b, cx + 4, cy + 5, MEAT_DARK);
    px(b, cx - 5, cy + 2, MEAT);
  } else {
    // Flank torn open: meat and ribs.
    wound(b, cx - 1, cy + 1, 8, 5.5, 57);
    for (const r of [-6, -3, 0, 3, 6]) {
      const h = 5.5 * Math.sqrt(1 - (r / 8.5) ** 2) * 0.8;
      line(b, cx - 1 + r, cy + 1 - h, cx - 1 + r + 1, cy + 1 + h, BONE, 1);
      px(b, cx - 1 + r + 1, cy + 1 + h, BONE_DARK);
    }
    // Bite out of the neck.
    px(b, cx + 9, cy + 3, MEAT);
    px(b, cx + 9, cy + 4, MEAT_DARK);
    px(b, cx + 8, cy + 4, MEAT_LIGHT);
  }

  // Head: faded frill, face, horns. Lies slightly toward the belly side.
  ellipse(b, cx + 12, cy + 1, 5, 10, (nx, ny, x, y) => {
    if (nx > 0.55) return null;
    if (nx * nx + ny * ny > 0.72) return checker(x, y) ? BONE : '#5a3420';
    return litShade(nx, ny, x, y, '#5a3420', '#7a4a2e', '#9a6a42');
  });
  px(b, cx + 11, cy - 5, '#9a6a42');
  px(b, cx + 11, cy + 7, '#5a3420');
  ellipse(b, cx + 19, cy + 1, 6, 4, (nx, ny, x, y) => litShade(nx, ny, x, y, HIDE_DARK, HIDE, HIDE_LIGHT));
  rect(b, cx + 24, cy, 2, 2, BEAK);
  px(b, cx + 18, cy - 2, '#100c08');
  px(b, cx + 18, cy + 4, '#100c08');
  // Brow horns (the lower one snapped short) and nose horn.
  line(b, cx + 18, cy - 2, cx + 26, cy - 5, BONE, 1);
  line(b, cx + 18, cy + 4, cx + 23, cy + 6, BONE, 1);
  px(b, cx + 23, cy + 6, BONE_DARK);
  line(b, cx + 22, cy + 1, cx + 24, cy + 1, BONE, 1);
  // Blood from the mouth.
  px(b, cx + 26, cy + 2, MEAT);
  px(b, cx + 25, cy + 2, MEAT_DARK);
  return compose(out, b);
}

function drawVelociraptorCarcass(stage: FoodStage): HTMLCanvasElement {
  const W = 36;
  const H = 24;
  const out = makeCanvas(W, H);
  const b = makeCanvas(W, H);
  const cx = 18;
  const cy = 12;
  const tailOff = (x: number) => Math.round(-(((-5 - x) / 10) ** 2) * 3);

  if (stage === 2) {
    // Tail vertebrae and spine.
    for (let x = -15; x <= -5; x++) px(b, cx + x, cy + tailOff(x), x % 2 === 0 ? BONE : BONE_DARK);
    line(b, cx - 5, cy, cx - 4, cy - 2, BONE, 1);
    line(b, cx - 4, cy - 2, cx + 5, cy - 2, BONE, 1);
    // Ribs.
    for (const [r, L] of [
      [-3, 3],
      [-1, 4],
      [1, 4],
      [3, 3],
    ]) {
      line(b, cx - 1 + r, cy - 1, cx - 1 + r + 0.5, cy - 2 + L, BONE, 1);
      px(b, cx - 1 + r + 0.5, cy - 2 + L, BONE_DARK);
    }
    // Pelvis.
    px(b, cx - 4, cy - 1, BONE_DARK);
    px(b, cx - 4, cy, BONE);
    px(b, cx - 3, cy, BONE);
    // Hind leg with the sickle claw, plus one dragged-off leg bone.
    line(b, cx - 3, cy, cx - 2, cy + 5, BONE, 1);
    line(b, cx - 2, cy + 5, cx, cy + 8, BONE, 1);
    px(b, cx + 1, cy + 8, BONE_DARK);
    px(b, cx - 1, cy + 9, BONE_HI);
    line(b, cx - 9, cy + 4, cx - 6, cy + 7, BONE, 1);
    px(b, cx - 6, cy + 7, BONE_DARK);
    // Arm and claw.
    line(b, cx + 3, cy - 1, cx + 5, cy + 3, BONE, 1);
    px(b, cx + 6, cy + 4, BONE_DARK);
    // Skull with toothy jaw.
    ellipse(b, cx + 8, cy - 1.5, 3.4, 1.8, (nx, ny, x, y) => litShade(nx, ny, x, y, BONE_DARK, BONE, BONE_HI));
    px(b, cx + 11, cy - 2, BONE);
    px(b, cx + 7, cy - 2, SOCKET);
    px(b, cx + 9, cy - 1, SOCKET);
    line(b, cx + 6, cy + 1, cx + 11, cy + 1, BONE_DARK, 1);
    px(b, cx + 8, cy, BONE);
    px(b, cx + 10, cy, BONE);
    // Scraps.
    px(b, cx, cy, MEAT_DARK);
    px(b, cx - 8, cy - 1, HIDE_DARK);
    return compose(out, b);
  }

  bloodPool(out, cx, cy + 4, stage === 0 ? 9 : 11, stage === 0 ? 4.5 : 5.5, 131 + stage);

  // Hind legs sticking out toward +y: one bent forward, one bent back (or torn off).
  line(b, cx - 3, cy + 1, cx - 2, cy + 5, HIDE_DARK, 2);
  line(b, cx - 2, cy + 5, cx, cy + 8, HIDE, 1);
  px(b, cx + 1, cy + 8, BONE_DARK);
  px(b, cx + 1, cy + 9, BONE_DARK);
  px(b, cx - 1, cy + 9, BONE);
  px(b, cx - 1, cy + 10, BONE);
  if (stage === 1) {
    line(b, cx - 5, cy + 1, cx - 6, cy + 5, BONE, 1);
    px(b, cx - 6, cy + 5, BONE_DARK);
    px(b, cx - 5, cy + 2, MEAT);
  } else {
    line(b, cx - 5, cy + 1, cx - 7, cy + 5, HIDE_DARK, 2);
    line(b, cx - 7, cy + 5, cx - 8, cy + 8, HIDE, 1);
    px(b, cx - 7, cy + 9, BONE_DARK);
    px(b, cx - 9, cy + 9, BONE_DARK);
    px(b, cx - 9, cy + 8, BONE);
  }
  // Small clawed arms.
  line(b, cx + 3, cy + 2, cx + 5, cy + 4, HIDE, 1);
  px(b, cx + 6, cy + 4, BONE);
  px(b, cx + 6, cy + 5, BONE);
  line(b, cx + 2, cy + 2, cx + 3, cy + 5, HIDE_DARK, 1);
  px(b, cx + 4, cy + 6, BONE);

  // Long stiff tail, lifted slightly at the tip, with dark bands.
  taper(
    b,
    cx,
    cy,
    -15,
    -4,
    (x) => 0.5 + ((x + 15) / 11) * 1.5,
    tailOff,
    (ny, x) => (ny < -0.2 && x % 3 === 0 ? HIDE_DARK : ny < -0.3 ? HIDE_LIGHT : ny > 0.4 ? HIDE_DARK : HIDE),
  );
  // Slim body on its side.
  ellipse(b, cx - 1, cy, 5.5, 3.2, (nx, ny, x, y) => {
    if (ny > 0.5 && nx * nx + ny * ny < 0.85) return BELLY;
    return litShade(nx, ny, x, y, HIDE_DARK, HIDE, HIDE_LIGHT);
  });
  for (let x = -4; x <= 2; x += 2) px(b, cx + x, cy - 2, HIDE_DARK);
  // Neck and long-snouted head with an open jaw.
  line(b, cx + 3, cy - 1, cx + 6, cy - 1.5, HIDE, 2);
  ellipse(b, cx + 8, cy - 1.5, 3.5, 2, (nx, ny, x, y) => litShade(nx, ny, x, y, HIDE_DARK, HIDE, HIDE_LIGHT));
  rect(b, cx + 10, cy - 2, 2, 1, HIDE);
  line(b, cx + 7, cy + 1, cx + 11, cy + 1, HIDE_DARK, 1);
  px(b, cx + 9, cy, BONE);
  px(b, cx + 11, cy, BONE);
  px(b, cx + 7, cy - 2, '#100c08');

  if (stage === 0) {
    px(b, cx + 12, cy + 1, MEAT);
    px(b, cx, cy + 2, MEAT);
    px(b, cx + 1, cy + 2, MEAT_LIGHT);
  } else {
    wound(b, cx - 1, cy + 0.5, 3.5, 2.4, 77);
    for (const r of [-2, 0, 2]) {
      line(b, cx - 1 + r, cy - 1, cx - 1 + r, cy + 2, BONE, 1);
    }
    px(b, cx + 12, cy + 1, MEAT_DARK);
  }
  return compose(out, b);
}

function drawBrontosaurusCarcass(stage: FoodStage): HTMLCanvasElement {
  const W = 104;
  const H = 44;
  const out = makeCanvas(W, H);
  const b = makeCanvas(W, H);
  const cx = 52;
  const cy = 20;
  // The neck lies curled back toward the belly side (+y), the tail sags the other way.
  const neckOff = (x: number) => Math.round(((x - 14) / 24) ** 2 * 9);
  const tailOff = (x: number) => -Math.round(((-14 - x) / 34) ** 2 * 6);
  // Pillar legs sticking out toward +y: [x0, y0, x1, y1].
  const legs: [number, number, number, number][] = [
    [10, 7, 12, 17],
    [6, 8, 5, 17],
    [-9, 8, -7, 18],
    [-13, 7, -15, 16],
  ];

  if (stage === 2) {
    // Vertebrae from the tail tip to the skull.
    for (let x = -48; x <= -14; x++) px(b, cx + x, cy + tailOff(x), x % 2 === 0 ? BONE : BONE_DARK);
    line(b, cx - 14, cy, cx + 14, cy - 2, BONE, 1);
    for (let x = -12; x <= 12; x += 3) px(b, cx + x, cy - 2, BONE_DARK);
    for (let x = 14; x <= 36; x++) px(b, cx + x, cy + neckOff(x), x % 2 === 0 ? BONE : BONE_DARK);
    // Long arched ribcage.
    for (let r = -10; r <= 10; r += 3) {
      const L = 5 + 8 * Math.sqrt(Math.max(0, 1 - (r / 13) ** 2));
      line(b, cx + r, cy - 1, cx + r + 1.5, cy - 1 + L * 0.5, BONE, 1);
      line(b, cx + r + 1.5, cy - 1 + L * 0.5, cx + r + 1, cy - 1 + L, BONE, 1);
      px(b, cx + r + 1, cy - 1 + L, BONE_DARK);
    }
    // Pelvis and shoulder blades.
    ellipse(b, cx - 13, cy, 3.5, 2.5, (nx, ny, x, y) => litShade(nx, ny, x, y, BONE_DARK, BONE, BONE_HI));
    ellipse(b, cx + 12, cy - 1, 3, 2, (nx, ny, x, y) => litShade(nx, ny, x, y, BONE_DARK, BONE, BONE_HI));
    // Thick limb bones, one dragged off.
    for (const [x0, y0, x1, y1] of [legs[0], legs[2], [-22, 10, -19, 19]]) {
      line(b, cx + x0, cy + y0, cx + x1, cy + y1, BONE, 2);
      rect(b, cx + x1 - 1, cy + y1 - 0.5, 3, 2, BONE_DARK);
    }
    // Small skull.
    ellipse(b, cx + 39, cy + neckOff(37), 3.5, 2.4, (nx, ny, x, y) => litShade(nx, ny, x, y, BONE_DARK, BONE, BONE_HI));
    px(b, cx + 39, cy + neckOff(37) - 1, SOCKET);
    px(b, cx + 41, cy + neckOff(37), SOCKET);
    px(b, cx - 3, cy + 2, MEAT_DARK);
    px(b, cx + 22, cy + neckOff(22) - 1, HIDE_DARK);
    return compose(out, b);
  }

  bloodPool(out, cx, cy + 9, stage === 0 ? 22 : 27, stage === 0 ? 8 : 10, 171 + stage);

  legs.forEach(([x0, y0, x1, y1], i) => {
    if (stage === 1 && i === 1) {
      line(b, cx + x0, cy + y0, cx + x1, cy + y1 - 4, BONE, 2);
      px(b, cx + x0, cy + y0 + 1, MEAT);
      return;
    }
    line(b, cx + x0, cy + y0, cx + x1, cy + y1, HIDE_DARK, 4);
    line(b, cx + x0 - 1, cy + y0, cx + x1 - 1, cy + y1, HIDE, 1);
    px(b, cx + x1 - 1, cy + y1 + 2, BONE_DARK);
    px(b, cx + x1 + 1, cy + y1 + 2, BONE_DARK);
  });

  const shade = (ny: number) => (ny < -0.4 ? HIDE_LIGHT : ny > 0.5 ? HIDE_DARK : HIDE);
  taper(b, cx, cy, -48, -12, (x) => 0.7 + ((x + 48) / 36) * 5, tailOff, shade);
  taper(b, cx, cy, 12, 36, (x) => 5 - ((x - 12) / 24) * 2.6, neckOff, shade);
  // Torso on its side: back toward -y, pale belly toward +y.
  ellipse(b, cx - 1, cy, 17, 10, (nx, ny, x, y) => {
    if (ny > 0.6 && nx * nx + ny * ny < 0.9) return checker(x, y) ? BELLY : HIDE_LIGHT;
    return litShade(nx, ny, x, y, HIDE_DARK, HIDE, HIDE_LIGHT);
  });
  for (let x = -14; x <= 12; x += 3) px(b, cx + x, cy - 8, HIDE_DARK);
  // Head at the end of the neck.
  const hy = cy + neckOff(38);
  ellipse(b, cx + 39, hy, 4.5, 3, (nx, ny, x, y) => litShade(nx, ny, x, y, HIDE_DARK, HIDE, HIDE_LIGHT));
  px(b, cx + 39, hy - 2, '#100c08');

  if (stage === 0) {
    px(b, cx + 2, cy + 5, MEAT);
    px(b, cx + 3, cy + 5, MEAT_LIGHT);
    px(b, cx - 8, cy + 3, MEAT);
    px(b, cx + 43, hy + 1, MEAT);
  } else {
    wound(b, cx - 2, cy + 1, 11, 6.5, 97);
    for (let r = -8; r <= 8; r += 3) {
      const h = 6.5 * Math.sqrt(1 - (r / 11.5) ** 2) * 0.8;
      line(b, cx - 2 + r, cy + 1 - h, cx - 2 + r + 1, cy + 1 + h, BONE, 1);
      px(b, cx - 2 + r + 1, cy + 1 + h, BONE_DARK);
    }
    px(b, cx + 20, cy + neckOff(20), MEAT);
    px(b, cx + 21, cy + neckOff(21), MEAT_DARK);
  }
  return compose(out, b);
}

/** Dead dinosaur lying on its side seen from above, facing +x (head toward +x), canvas center = body center.
 *  kind is 'triceratops' (large: ~44px long incl. frill and tail) or 'velociraptor' (small: ~26px long, slim, long tail).
 *  stage 0 = fresh carcass (hide intact, some blood), 1 = partly eaten (exposed red meat and ribs), 2 = mostly bones (bleached ribcage, skull, spine). */
export function drawCarcass(kind: CarcassKind, stage: FoodStage): HTMLCanvasElement {
  if (kind === 'brontosaurus') return drawBrontosaurusCarcass(stage);
  return kind === 'triceratops' ? drawTriceratopsCarcass(stage) : drawVelociraptorCarcass(stage);
}
