import { METAL, METAL_DARK, METAL_LIGHT, RIVET, type DinoPalette } from './dinoArt';
import { taperedChain, type ChainSegment } from './chainArt';
import { checker, ellipse, hash2, line, litShade, makeCanvas, outline, px, rect } from './pixel';

// Procedural top-down T-Rex from the Dino Riders box art: a bulky two-legged body with a
// mottled hide, a big head, and a tail made of links. Ridden ones wear the grey armor of the
// box art: a harness on the head with one long gun barrel across it (the two head guns are
// its ends), big vented frames on both shoulders carrying red gun pods, a chest platform with
// a ladder, and plates on the shins. All art faces +x (east); canvas center = pivot.

const OUTLINE = '#17110d';
const TOOTH = '#f4eedc';
const TOOTH_DARK = '#c4b896';
const CLAW = '#d8ccaa';
const EYE = '#c81e1e';
const EYE_HI = '#ff8a5a';
const MOUTH = '#b8485a';
const MOUTH_DARK = '#6a1e2c';
const GUN_RED = '#c8302a';
const GUN_RED_DARK = '#7a1a16';
const GUN_RED_HI = '#f06a52';

/**
 * The art is laid out in "design pixels" and drawn at this scale, so the T-Rex can be resized
 * in one place. Keep it in step with dinos.ts (radius, head and tail offsets, seat, mounts),
 * which uses the same factor. Gun sprites keep their size.
 */
export const REX_SCALE = 1.2;
const S = REX_SCALE;
const r = (v: number) => Math.round(v * S);

/** Body canvas size (the head and tail links are separate canvases centered on their joints). */
export const REX_BODY = 2 * r(28);
/** Head canvas size; its center is the neck pivot (`head.offset` in dinos.ts). */
export const REX_HEAD = 2 * r(22);

/** Thick at the hips, thin at the tip: six links from the root behind the hips (`tail.offset`). */
export const REX_TAIL: ChainSegment[] = taperedChain(6, 5.2 * S, 6 * S, 0.8 * S, 1.2);

/** Dark mottling, scattered by hash so it looks natural (the box art's blotchy green hide). */
function mottle(p: DinoPalette, x: number, y: number, col: string, seed: number): string {
  const h = hash2(Math.floor(x / 3), Math.floor(y / 2), seed);
  return h < 0.1 && col !== p.light ? p.dark : col;
}

/** Bulky body on two big hind legs, with small arms at the chest. `pose` 0/1 alternates the legs. */
export function drawTrexBody(p: DinoPalette, pose: 0 | 1): HTMLCanvasElement {
  const c = makeCanvas(REX_BODY, REX_BODY);
  const cx = REX_BODY / 2;
  const cy = REX_BODY / 2;
  // Hind legs first so the torso overlaps the thighs: one forward, one back.
  const swing = (pose === 0 ? 3 : -3) * S;
  for (const [side, s] of [
    [-1, swing],
    [1, -swing],
  ] as const) {
    const ly = cy + side * 9.5 * S;
    // Heavy thigh bulging out past the flank.
    ellipse(c, cx - 3 * S + s, ly, 6 * S, 4 * S, (nx, ny, x, y) => litShade(nx, ny, x, y, p.dark, p.base, p.light));
    // Foot reaching forward, three clawed toes.
    rect(c, cx + r(2) + s, ly - 1, r(4), r(3), p.dark);
    for (const t of [-1, 0, 1]) px(c, cx + r(6) + s, ly + t, CLAW);
  }
  // Torso: deep chest in front, narrowing to the hips.
  ellipse(c, cx + 2 * S, cy, 11 * S, 7.4 * S, (nx, ny, x, y) => mottle(p, x, y, litShade(nx, ny, x, y, p.dark, p.base, p.light), 31));
  ellipse(c, cx - 6 * S, cy, 7 * S, 6 * S, (nx, ny, x, y) => mottle(p, x, y, litShade(nx, ny, x, y, p.dark, p.base, p.light), 37));
  // Thick neck growing into the head.
  ellipse(c, cx + 11 * S, cy, 4.5 * S, 5.2 * S, (nx, ny, x, y) => mottle(p, x, y, litShade(nx, ny, x, y, p.dark, p.base, p.light), 41));
  // Pale belly showing along the right flank.
  for (let x = r(-4); x <= r(8); x++) px(c, cx + x, cy + r(6), checker(cx + x, cy + r(6)) ? p.belly : p.base);
  // Small arms folded at the chest, two claws each.
  for (const side of [-1, 1]) {
    const ay = cy + side * r(5);
    line(c, cx + r(8), ay, cx + r(11), ay + side, p.dark, 1);
    px(c, cx + r(11) + 1, ay + side, CLAW);
    px(c, cx + r(11) + 1, ay, CLAW);
  }
  // Ridge of scutes along the spine.
  for (let x = r(-10); x <= r(10); x += 3) px(c, cx + x, cy - 1, p.dark);
  for (let x = r(-9); x <= r(11); x += 3) px(c, cx + x, cy - 2, p.light);
  outline(c, OUTLINE);
  return c.canvas;
}

/** Big head with a long snout and rows of teeth; `bite` draws the jaws gaping open. Canvas center = neck pivot. */
export function drawTrexHead(p: DinoPalette, bite = false): HTMLCanvasElement {
  const c = makeCanvas(REX_HEAD, REX_HEAD);
  const cx = REX_HEAD / 2;
  const cy = REX_HEAD / 2;
  const open = bite ? 2 : 0;
  // Neck stub around the pivot.
  ellipse(c, cx + S, cy, 4 * S, 4.5 * S, (nx, ny, x, y) => litShade(nx, ny, x, y, p.dark, p.base, p.light));
  // Gaping jaws: the pink mouth and the lower teeth show at the sides of the snout.
  if (bite) {
    ellipse(c, cx + 11 * S, cy, 7.5 * S, 5.6 * S, (_nx, ny) => (Math.abs(ny) > 0.62 ? MOUTH_DARK : MOUTH));
    for (let x = r(6); x <= r(17); x += 2) {
      px(c, cx + x, cy - r(5), TOOTH);
      px(c, cx + x, cy + r(4), TOOTH);
    }
  }
  // Broad skull behind the eyes.
  ellipse(c, cx + 6 * S, cy, 6.2 * S, (5.6 + open * 0.3) * S, (nx, ny, x, y) => mottle(p, x, y, litShade(nx, ny, x, y, p.dark, p.base, p.light), 53));
  // Long, deep snout (narrower when the jaws gape, the lower jaw dropping out of view).
  ellipse(c, cx + 12 * S, cy, 6.5 * S, (4.4 - open) * S, (nx, ny, x, y) => mottle(p, x, y, litShade(nx, ny, x, y, p.dark, p.base, p.light), 59));
  // Pale lips with teeth along both jaw edges.
  if (!bite) {
    for (let x = r(8); x <= r(17); x += 2) {
      px(c, cx + x, cy - r(4), TOOTH);
      px(c, cx + x, cy + r(3), TOOTH);
      px(c, cx + x + 1, cy + r(3), TOOTH_DARK);
    }
  }
  // Brow ridges and red eyes, as on the box art.
  for (const side of [-1, 1]) {
    const ey = side < 0 ? cy - r(4) : cy + r(3);
    rect(c, cx + r(5), ey, 2, 1, EYE);
    px(c, cx + r(5), ey, EYE_HI);
    rect(c, cx + r(4), side < 0 ? ey - 1 : ey + 1, 3, 1, p.dark);
  }
  // Nostrils near the snout tip.
  px(c, cx + r(16), cy - 2, p.dark);
  px(c, cx + r(16), cy + 1, p.dark);
  outline(c, OUTLINE);
  return c.canvas;
}

/**
 * The armor of a ridden T-Rex: big grey frames on both shoulders with louvered vents (the
 * gun pods hang from their front corners), a chest platform with a ladder between them,
 * the rider's saddle on the neck, and plates on the shins. Same canvas and pivot as the body.
 */
export function drawTrexSaddleArmor(p: DinoPalette): HTMLCanvasElement {
  const c = makeCanvas(REX_BODY, REX_BODY);
  const cx = REX_BODY / 2;
  const cy = REX_BODY / 2;
  // Shin plates with a gear, on the outside of both thighs.
  for (const side of [-1, 1]) {
    const y0 = side < 0 ? cy - r(12) : cy + r(10);
    rect(c, cx - r(6), y0, r(5), 2, METAL);
    rect(c, cx - r(6), y0, r(5), 1, METAL_LIGHT);
    px(c, cx - r(4), y0 + (side < 0 ? 0 : 1), RIVET);
  }
  // Chest platform across the back between the shoulder frames, with a ladder.
  for (let y = -r(6); y <= r(6); y++) {
    for (let x = -1; x <= r(7); x++) {
      let col = METAL;
      if (y === -r(6) || x === -1) col = METAL_LIGHT;
      else if (y === r(6) || x === r(7)) col = METAL_DARK;
      px(c, cx + x, cy + y, col);
    }
  }
  for (let x = 0; x <= r(6); x += 2) rect(c, cx + x, cy - r(2), 1, r(5), METAL_DARK);
  rect(c, cx, cy - r(3), r(7), 1, METAL_LIGHT);
  rect(c, cx, cy + r(3), r(7), 1, METAL_LIGHT);
  // Shoulder frames: boxes sticking out past both flanks, vents across them, team trim.
  for (const side of [-1, 1]) {
    const y0 = side < 0 ? cy - r(14) : cy + r(8);
    const h = r(6);
    for (let y = 0; y < h; y++) {
      for (let x = -1; x <= r(8); x++) {
        let col = METAL;
        if (y === 0 || x === -1) col = METAL_LIGHT;
        else if (y === h - 1 || x === r(8)) col = METAL_DARK;
        px(c, cx + x, y0 + y, col);
      }
    }
    // Louvered vents.
    for (let x = 1; x <= r(6); x += 2) rect(c, cx + x, y0 + 2, 1, h - 4, METAL_DARK);
    // Team-colored trim on the inner edge.
    rect(c, cx, side < 0 ? y0 + h - 2 : y0 + 1, r(8), 1, side < 0 ? p.tunicLight : p.tunic);
    for (const rx of [0, r(7)]) px(c, cx + rx, side < 0 ? y0 + 1 : y0 + h - 2, RIVET);
  }
  // Saddle on the neck, where the rider sits (seat in dinos.ts), with a raised front lip.
  rect(c, cx + r(7), cy - r(3), r(5), r(6), p.saddle);
  rect(c, cx + r(7), cy - r(3), r(5), 1, p.saddleLight);
  rect(c, cx + r(7) + r(5), cy - r(3), 1, r(6), METAL_LIGHT);
  outline(c, OUTLINE);
  return c.canvas;
}

/**
 * The head harness: a grey frame over the skull, and one long silver gun barrel across the
 * head at the eyes, with a red power cell in the middle. The head guns (weapon sprites) sit
 * on its two ends. Same canvas and pivot as the head.
 */
export function drawTrexHeadArmor(p: DinoPalette): HTMLCanvasElement {
  const c = makeCanvas(REX_HEAD, REX_HEAD);
  const cx = REX_HEAD / 2;
  const cy = REX_HEAD / 2;
  // Frame straps from the neck forward over the skull.
  for (const y of [-r(3), r(2)]) {
    rect(c, cx, cy + y, r(7), 1, METAL);
    rect(c, cx, cy + y + (y < 0 ? -1 : 1), r(7), 1, y < 0 ? METAL_LIGHT : METAL_DARK);
  }
  // The barrel across the head (local y), at the eyes, out to both gun ends.
  rect(c, cx + r(3), cy - r(8), 3, 2 * r(8), METAL_LIGHT);
  rect(c, cx + r(3) + 2, cy - r(8), 1, 2 * r(8), METAL);
  rect(c, cx + r(3), cy - r(8), 3, 1, METAL_DARK);
  rect(c, cx + r(3), cy + r(8) - 1, 3, 1, METAL_DARK);
  // Red power cell in the middle of the barrel, and a team stud behind it.
  rect(c, cx + r(2), cy - 1, r(5), 2, GUN_RED);
  px(c, cx + r(2), cy - 1, GUN_RED_HI);
  px(c, cx, cy, p.tunicLight);
  for (const y of [-r(6), r(5)]) px(c, cx + r(3) + 1, cy + y, RIVET);
  outline(c, OUTLINE);
  return c.canvas;
}

/** A head gun: the end of the barrel, turned forward, with a red muzzle cap. Canvas center = pivot; muzzle about 9 px out. */
export function drawRexHeadGun(): HTMLCanvasElement {
  const c = makeCanvas(24, 24);
  const cx = 12;
  const cy = 12;
  rect(c, cx - 1, cy - 1, 3, 3, METAL);
  rect(c, cx - 1, cy - 1, 3, 1, METAL_LIGHT);
  rect(c, cx + 2, cy - 1, 6, 2, METAL_LIGHT);
  rect(c, cx + 2, cy, 6, 1, METAL);
  // Red cap with the muzzle hole.
  rect(c, cx + 8, cy - 1, 2, 3, GUN_RED);
  px(c, cx + 8, cy - 1, GUN_RED_HI);
  px(c, cx + 9, cy, GUN_RED_DARK);
  outline(c, OUTLINE);
  return c.canvas;
}

/** A shoulder cannon: a red pod with a silver barrel. Canvas center = pivot; muzzle about 10 px out. */
export function drawRexShoulderCannon(): HTMLCanvasElement {
  const c = makeCanvas(28, 28);
  const cx = 14;
  const cy = 14;
  // Red pod with a silver band.
  ellipse(c, cx + 1, cy, 3.4, 2.6, (nx, ny, x, y) => litShade(nx, ny, x, y, GUN_RED_DARK, GUN_RED, GUN_RED_HI));
  rect(c, cx, cy - 2, 1, 5, METAL_LIGHT);
  // Barrel with a muzzle ring.
  rect(c, cx + 4, cy - 1, 6, 2, METAL_LIGHT);
  rect(c, cx + 4, cy, 6, 1, METAL);
  rect(c, cx + 9, cy - 1, 1, 3, METAL_DARK);
  outline(c, OUTLINE);
  return c.canvas;
}
