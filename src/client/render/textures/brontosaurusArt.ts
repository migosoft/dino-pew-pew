import { checker, ellipse, line, litShade, makeCanvas, outline, px, rect } from './pixel';
import { METAL, METAL_DARK, METAL_LIGHT, RIVET, type DinoPalette } from './dinoArt';

// Procedural top-down Brontosaurus: body, a long neck with the head (one part that turns
// at the shoulders), a separate tail (it swings for the whip), and the rider's weapons
// platform from the Dino Riders box art: a white armored deck with a glass cockpit dome
// in front, rails at the back, struts down both flanks carrying red gun pods, and a
// rear turret. All art faces +x (east); rotation frames are produced afterwards.

const OUTLINE = '#17110d';
const NAIL = '#b5a57c';
const EYE = '#100c08';

const DECK_HI = '#f2f4f2';
const DECK = '#d3d9dc';
const DECK_DARK = '#98a2aa';
const DECK_SEAM = '#b2bbc2';
const GLASS_DARK = '#2a5470';
const GLASS = '#5b9dc2';
const GLASS_HI = '#c4eaf8';
const POD_DARK = '#7a1a16';
const POD = '#c8302a';
const POD_HI = '#f06a52';
const POD_HOLE = '#3a0c0a';

/**
 * The art is laid out in "design pixels" and drawn at this scale, so the Brontosaurus can be
 * resized in one place. Keep it in step with dinos.ts (radius, head and tail offsets, seat,
 * mounts), which uses the same factor.
 */
export const BRONTO_SCALE = 1.5;
const S = BRONTO_SCALE;
const r = (v: number) => Math.round(v * S);

/** Body canvas size; the neck and tail canvases are centered on their own pivots. */
export const BRONTO_BODY = r(48);
/** Pivots in body-local pixels (must match `head.offset` and `tail.offset` in dinos.ts). */
export const BRONTO_NECK_X = r(12);
export const BRONTO_TAIL_X = r(-13);
const NECK_W = r(72);
const NECK_H = r(22);
const TAIL_W = r(84);
const TAIL_H = r(18);

/** Shading of a long tapering strip (neck, tail): light along the upper-left edge. */
function hide(p: DinoPalette, ny: number, x: number, y: number): string {
  if (ny < -0.55) return p.light;
  if (ny < -0.2) return checker(x, y) ? p.light : p.base;
  if (ny > 0.6) return p.dark;
  if (ny > 0.35) return checker(x, y) ? p.dark : p.base;
  return p.base;
}

/** Strip along x from x0 to x1 (canvas pixels) with half-thickness half(x), centered on cy. */
function strip(c: ReturnType<typeof makeCanvas>, x0: number, x1: number, cy: number, half: (x: number) => number, p: DinoPalette): void {
  for (let x = Math.floor(x0); x <= x1; x++) {
    const h = half(x);
    for (let y = -Math.ceil(h); y <= Math.ceil(h); y++) {
      if (Math.abs(y + 0.5) > h) continue;
      px(c, x, cy + y, hide(p, (y + 0.5) / h, x, cy + y));
    }
  }
}

/** Body with four pillar legs. `pose` 0/1 alternates the diagonal leg pairs for walking. */
export function drawBrontosaurusBody(p: DinoPalette, pose: 0 | 1): HTMLCanvasElement {
  const c = makeCanvas(BRONTO_BODY, BRONTO_BODY);
  const cx = BRONTO_BODY / 2;
  const cy = BRONTO_BODY / 2;
  const swing = (pose === 0 ? 2 : -2) * S;
  const legs: [number, number, number][] = [
    [13, -10.5, swing],
    [13, 10.5, -swing],
    [-12, -11, -swing],
    [-12, 11, swing],
  ];
  for (const [lx, ly, sw] of legs) {
    const fx = cx + lx * S + sw;
    const fy = cy + ly * S;
    ellipse(c, fx, fy, 4.6 * S, 3.8 * S, (nx, ny, x, y) => litShade(nx, ny, x, y, p.dark, p.dark, p.base));
    // Blunt toenails on the front of each foot.
    for (const t of [-2, 0, 2]) px(c, fx + 4 * S, fy + t, NAIL);
  }
  // Shoulders, where the neck grows out.
  ellipse(c, cx + 12 * S, cy, 6 * S, 7 * S, (nx, ny, x, y) => litShade(nx, ny, x, y, p.dark, p.base, p.light));
  // Big barrel of a torso, widest at the hips.
  ellipse(c, cx - S, cy, 18.5 * S, 12.5 * S, (nx, ny, x, y) => litShade(nx, ny, x, y, p.dark, p.base, p.light));
  // Spine ridge.
  for (let x = r(-16); x <= r(14); x += 4) px(c, cx + x, cy, p.dark);
  for (let x = r(-15); x <= r(15); x += 4) px(c, cx + x, cy - 1, p.light);
  // Mottled hide.
  for (const [sx, sy] of [
    [-10, -6],
    [-4, 7],
    [5, -8],
    [-13, 4],
    [8, 6],
    [0, -4],
    [-16, -3],
    [12, -2],
  ]) {
    rect(c, cx + r(sx), cy + r(sy), 2, 1, p.dark);
    px(c, cx + r(sx) + 1, cy + r(sy) + 1, p.dark);
  }
  outline(c, OUTLINE);
  return c.canvas;
}

/** Long neck and small head. Canvas center = the shoulder pivot. */
export function drawBrontosaurusNeck(p: DinoPalette): HTMLCanvasElement {
  const c = makeCanvas(NECK_W, NECK_H);
  const cx = NECK_W / 2;
  const cy = NECK_H / 2;
  const len = 24 * S;
  const x0 = cx - 4 * S;
  // Thick at the shoulders, slimmer behind the head.
  strip(c, x0, cx + len, cy, (x) => (4.6 - ((x - x0) / (cx + len - x0)) * 2.2) * S, p);
  // A few darker bands across the neck.
  for (const t of [6, 12, 18]) {
    px(c, cx + r(t), cy - 1, p.dark);
    px(c, cx + r(t), cy + 1, p.dark);
    px(c, cx + r(t) + 1, cy, p.dark);
  }
  // Head: clearly wider than the end of the neck, with a blunt snout.
  const hx = cx + len + 4 * S;
  ellipse(c, hx, cy, 6 * S, 4.4 * S, (nx, ny, x, y) => litShade(nx, ny, x, y, p.dark, p.base, p.light));
  ellipse(c, hx + 4 * S, cy, 3 * S, 3.2 * S, (nx, ny, x, y) => litShade(nx, ny, x, y, p.dark, p.base, p.light));
  // Eyes under brow ridges.
  for (const side of [-1, 1]) {
    const ey = Math.round(cy + side * 3 * S);
    rect(c, hx - 2, side < 0 ? ey : ey - 1, 2, 2, EYE);
    rect(c, hx - 2, side < 0 ? ey - 1 : ey + 1, 2, 1, p.light);
  }
  // Nostrils on top of the snout.
  px(c, hx + 5 * S, cy - 2, p.dark);
  px(c, hx + 5 * S, cy + 1, p.dark);
  outline(c, OUTLINE);
  return c.canvas;
}

/** Long tapering tail. Canvas center = the tail root; it points to -x. */
export function drawBrontosaurusTail(p: DinoPalette): HTMLCanvasElement {
  const c = makeCanvas(TAIL_W, TAIL_H);
  const cx = TAIL_W / 2;
  const cy = TAIL_H / 2;
  const x0 = cx - 38 * S;
  const x1 = cx + 4 * S;
  // Tapers quickly to a whip-thin tip.
  strip(c, x0, x1, cy, (x) => (0.5 + ((x - x0) / (x1 - x0)) ** 1.6 * 5.4) * S, p);
  for (let x = r(-32); x <= 0; x += 5) px(c, cx + x, cy, p.dark);
  outline(c, OUTLINE);
  return c.canvas;
}

/** Body, straight neck and straight tail in one canvas (for the drop shadow). Center = body center. */
export function drawBrontosaurusWhole(p: DinoPalette, pose: 0 | 1): HTMLCanvasElement {
  const W = r(120);
  const H = BRONTO_BODY;
  const c = makeCanvas(W, H);
  const cx = W / 2;
  const cy = H / 2;
  c.ctx.drawImage(drawBrontosaurusTail(p), cx + BRONTO_TAIL_X - TAIL_W / 2, cy - TAIL_H / 2);
  c.ctx.drawImage(drawBrontosaurusBody(p, pose), cx - BRONTO_BODY / 2, 0);
  c.ctx.drawImage(drawBrontosaurusNeck(p), cx + BRONTO_NECK_X - NECK_W / 2, cy - NECK_H / 2);
  return c.canvas;
}

/**
 * The weapons platform on a ridden Brontosaurus: struts to both flanks (the red gun pods
 * hang there), the white deck, a glass cockpit dome in front (the rider sits in it), rails
 * on the rear deck and a turret ring at the back. Same canvas and pivot as the body.
 */
export function drawBrontosaurusPlatform(p: DinoPalette): HTMLCanvasElement {
  const c = makeCanvas(BRONTO_BODY, BRONTO_BODY);
  const cx = BRONTO_BODY / 2;
  const cy = BRONTO_BODY / 2;
  // Struts down both flanks to the gun pods at x = 8 and x = -6.
  for (const sx of [r(8), r(-6)]) {
    for (const side of [-1, 1]) {
      const y0 = side < 0 ? cy - r(13) : cy + r(8);
      const h = r(5);
      rect(c, cx + sx - 2, y0, 4, h, METAL);
      rect(c, cx + sx - 2, y0, 1, h, METAL_LIGHT);
      rect(c, cx + sx + 1, y0, 1, h, METAL_DARK);
    }
  }
  // Turret ring at the rear, over the tail root.
  ellipse(c, cx - 15 * S, cy, 3.6 * S, 3.6 * S, (nx, ny, x, y) => litShade(nx, ny, x, y, METAL_DARK, METAL, METAL_LIGHT));
  // Deck with cut corners, lit from the upper left.
  const x0 = r(-13);
  const x1 = r(10);
  const yh = r(8);
  for (let y = -yh; y <= yh; y++) {
    for (let x = x0; x <= x1; x++) {
      // Corner cut: two steps deep.
      const fromEdge = Math.min(x - x0, x1 - x);
      if (Math.abs(y) === yh && fromEdge < 2) continue;
      if (Math.abs(y) === yh - 1 && fromEdge < 1) continue;
      let col = DECK;
      if (y === -yh || x === x0) col = DECK_HI;
      else if (y === yh || x === x1) col = DECK_DARK;
      else if ((x - x0) % 7 === 0) col = DECK_SEAM;
      px(c, cx + x, cy + y, col);
    }
  }
  // Team-colored trim along both long edges.
  for (const y of [-r(6), r(6) - 1]) rect(c, cx + x0 + 2, cy + y, x1 - x0 - 3, 2, y < 0 ? p.tunicLight : p.tunic);
  // Rails: a ladder along the middle of the rear deck.
  for (const y of [-r(3), r(3)]) line(c, cx + r(-12), cy + y, cx + r(-3), cy + y, METAL_DARK, 1);
  for (let x = r(-11); x <= r(-3); x += 3) line(c, cx + x, cy - r(3), cx + x, cy + r(3), METAL, 1);
  // Team emblems on the rear deck corners, and rivets.
  rect(c, cx + r(-12), cy - r(5) - 1, 3, 3, p.tunicLight);
  rect(c, cx + r(-12), cy + r(4) - 1, 3, 3, p.tunic);
  for (const [rx, ry] of [
    [-12, -7],
    [-12, 7],
    [9, -7],
    [9, 7],
    [-1, -7],
    [-1, 7],
    [-6, -7],
    [-6, 7],
  ]) {
    px(c, cx + r(rx), cy + r(ry), RIVET);
  }
  // Glass cockpit dome at the front of the deck, with a metal rim.
  ellipse(c, cx + 5 * S, cy, 5.5 * S, 6 * S, (nx, ny, x, y) => {
    if (nx * nx + ny * ny > 0.75) return litShade(nx, ny, x, y, METAL_DARK, METAL, METAL_LIGHT);
    return litShade(nx, ny, x, y, GLASS_DARK, GLASS, GLASS_HI);
  });
  // Glint.
  px(c, cx + r(3), cy - r(4), '#ffffff');
  px(c, cx + r(3) + 1, cy - r(4), GLASS_HI);
  px(c, cx + r(4), cy - r(5), GLASS_HI);
  outline(c, OUTLINE);
  return c.canvas;
}

/** Red gun pod with a cluster of barrels, hung from a strut. Canvas center = pivot; barrels point +x. */
export function drawBroadsideGun(): HTMLCanvasElement {
  const c = makeCanvas(32, 32);
  const cx = 16;
  const cy = 16;
  // Barrels.
  for (const y of [-3, 1]) {
    rect(c, cx + 4, cy + y, 7, 1, METAL);
    rect(c, cx + 4, cy + y + 1, 7, 1, METAL_DARK);
  }
  rect(c, cx + 10, cy - 3, 1, 6, METAL_LIGHT);
  // Round red pod.
  ellipse(c, cx, cy, 5.6, 5, (nx, ny, x, y) => litShade(nx, ny, x, y, POD_DARK, POD, POD_HI));
  // Muzzle openings on the front face.
  for (const y of [-3, -1, 1, 3]) px(c, cx + 4, cy + y, POD_HOLE);
  // Mounting band.
  rect(c, cx - 1, cy - 5, 2, 10, METAL_DARK);
  outline(c, OUTLINE);
  return c.canvas;
}

/** Rear turret: twin barrels on a gunmetal housing. Canvas center = pivot; barrels point +x. */
export function drawTailGun(): HTMLCanvasElement {
  const c = makeCanvas(32, 32);
  const cx = 16;
  const cy = 16;
  for (const y of [-3, 1]) {
    rect(c, cx + 3, cy + y, 9, 1, METAL_LIGHT);
    rect(c, cx + 3, cy + y + 1, 9, 1, METAL);
  }
  rect(c, cx + 11, cy - 3, 1, 6, POD);
  ellipse(c, cx, cy, 4.6, 4.6, (nx, ny, x, y) => litShade(nx, ny, x, y, METAL_DARK, METAL, METAL_LIGHT));
  px(c, cx - 1, cy - 2, RIVET);
  px(c, cx - 2, cy - 1, RIVET);
  outline(c, OUTLINE);
  return c.canvas;
}
