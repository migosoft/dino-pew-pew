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

/** Body canvas size (the head and tail links are separate canvases centered on their joints). */
export const REX_BODY = 56;
/** Head canvas size; its center is the neck pivot (`head.offset` in dinos.ts). */
export const REX_HEAD = 44;

/** Thick at the hips, thin at the tip: six links from the root behind the hips (`tail.offset`). */
export const REX_TAIL: ChainSegment[] = taperedChain(6, 5.2, 6, 0.8, 1.2);

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
  const swing = pose === 0 ? 3 : -3;
  for (const [side, s] of [
    [-1, swing],
    [1, -swing],
  ] as const) {
    const ly = cy + side * 9.5;
    // Heavy thigh bulging out past the flank.
    ellipse(c, cx - 3 + s, ly, 6, 4, (nx, ny, x, y) => litShade(nx, ny, x, y, p.dark, p.base, p.light));
    // Foot reaching forward, three clawed toes.
    rect(c, cx + 2 + s, ly - 1, 4, 3, p.dark);
    for (const t of [-1, 0, 1]) px(c, cx + 6 + s, ly + t, CLAW);
  }
  // Torso: deep chest in front, narrowing to the hips.
  ellipse(c, cx + 2, cy, 11, 7.4, (nx, ny, x, y) => mottle(p, x, y, litShade(nx, ny, x, y, p.dark, p.base, p.light), 31));
  ellipse(c, cx - 6, cy, 7, 6, (nx, ny, x, y) => mottle(p, x, y, litShade(nx, ny, x, y, p.dark, p.base, p.light), 37));
  // Thick neck growing into the head.
  ellipse(c, cx + 11, cy, 4.5, 5.2, (nx, ny, x, y) => mottle(p, x, y, litShade(nx, ny, x, y, p.dark, p.base, p.light), 41));
  // Pale belly showing along the right flank.
  for (let x = -4; x <= 8; x++) px(c, cx + x, cy + 6, checker(cx + x, cy + 6) ? p.belly : p.base);
  // Small arms folded at the chest, two claws each.
  for (const side of [-1, 1]) {
    const ay = cy + side * 5;
    line(c, cx + 8, ay, cx + 11, ay + side, p.dark, 1);
    px(c, cx + 12, ay + side, CLAW);
    px(c, cx + 12, ay, CLAW);
  }
  // Ridge of scutes along the spine.
  for (let x = -10; x <= 10; x += 3) px(c, cx + x, cy - 1, p.dark);
  for (let x = -9; x <= 11; x += 3) px(c, cx + x, cy - 2, p.light);
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
  ellipse(c, cx + 1, cy, 4, 4.5, (nx, ny, x, y) => litShade(nx, ny, x, y, p.dark, p.base, p.light));
  // Gaping jaws: the pink mouth and the lower teeth show at the sides of the snout.
  if (bite) {
    ellipse(c, cx + 11, cy, 7.5, 5.6, (_nx, ny) => (Math.abs(ny) > 0.62 ? MOUTH_DARK : MOUTH));
    for (let x = 6; x <= 17; x += 2) {
      px(c, cx + x, cy - 5, TOOTH);
      px(c, cx + x, cy + 4, TOOTH);
    }
  }
  // Broad skull behind the eyes.
  ellipse(c, cx + 6, cy, 6.2, 5.6 + open * 0.3, (nx, ny, x, y) => mottle(p, x, y, litShade(nx, ny, x, y, p.dark, p.base, p.light), 53));
  // Long, deep snout (narrower when the jaws gape, the lower jaw dropping out of view).
  ellipse(c, cx + 12, cy, 6.5, 4.4 - open, (nx, ny, x, y) => mottle(p, x, y, litShade(nx, ny, x, y, p.dark, p.base, p.light), 59));
  // Pale lips with teeth along both jaw edges.
  if (!bite) {
    for (let x = 8; x <= 17; x += 2) {
      px(c, cx + x, cy - 4, TOOTH);
      px(c, cx + x, cy + 3, TOOTH);
      px(c, cx + x + 1, cy + 3, TOOTH_DARK);
    }
  }
  // Brow ridges and red eyes, as on the box art.
  for (const side of [-1, 1]) {
    const ey = side < 0 ? cy - 4 : cy + 3;
    rect(c, cx + 5, ey, 2, 1, EYE);
    px(c, cx + 5, ey, EYE_HI);
    rect(c, cx + 4, side < 0 ? ey - 1 : ey + 1, 3, 1, p.dark);
  }
  // Nostrils near the snout tip.
  px(c, cx + 16, cy - 2, p.dark);
  px(c, cx + 16, cy + 1, p.dark);
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
    const y0 = side < 0 ? cy - 12 : cy + 10;
    rect(c, cx - 6, y0, 5, 2, METAL);
    rect(c, cx - 6, y0, 5, 1, METAL_LIGHT);
    px(c, cx - 4, y0 + (side < 0 ? 0 : 1), RIVET);
  }
  // Chest platform across the back between the shoulder frames, with a ladder.
  for (let y = -6; y <= 6; y++) {
    for (let x = -1; x <= 7; x++) {
      let col = METAL;
      if (y === -6 || x === -1) col = METAL_LIGHT;
      else if (y === 6 || x === 7) col = METAL_DARK;
      px(c, cx + x, cy + y, col);
    }
  }
  for (let x = 0; x <= 6; x += 2) rect(c, cx + x, cy - 2, 1, 5, METAL_DARK);
  rect(c, cx, cy - 3, 7, 1, METAL_LIGHT);
  rect(c, cx, cy + 3, 7, 1, METAL_LIGHT);
  // Shoulder frames: boxes sticking out past both flanks, vents across them, team trim.
  for (const side of [-1, 1]) {
    const y0 = side < 0 ? cy - 14 : cy + 8;
    const h = 6;
    for (let y = 0; y < h; y++) {
      for (let x = -1; x <= 8; x++) {
        let col = METAL;
        if (y === 0 || x === -1) col = METAL_LIGHT;
        else if (y === h - 1 || x === 8) col = METAL_DARK;
        px(c, cx + x, y0 + y, col);
      }
    }
    // Louvered vents.
    for (let x = 1; x <= 6; x += 2) rect(c, cx + x, y0 + 2, 1, h - 4, METAL_DARK);
    // Team-colored trim on the inner edge.
    rect(c, cx, side < 0 ? y0 + h - 2 : y0 + 1, 8, 1, side < 0 ? p.tunicLight : p.tunic);
    for (const rx of [0, 7]) px(c, cx + rx, side < 0 ? y0 + 1 : y0 + h - 2, RIVET);
  }
  // Saddle on the neck, where the rider sits (seat in dinos.ts), with a raised front lip.
  rect(c, cx + 7, cy - 3, 5, 6, p.saddle);
  rect(c, cx + 7, cy - 3, 5, 1, p.saddleLight);
  rect(c, cx + 12, cy - 3, 1, 6, METAL_LIGHT);
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
  for (const y of [-3, 2]) {
    rect(c, cx, cy + y, 7, 1, METAL);
    rect(c, cx, cy + y + (y < 0 ? -1 : 1), 7, 1, y < 0 ? METAL_LIGHT : METAL_DARK);
  }
  // The barrel across the head (local y), at the eyes, out to both gun ends.
  rect(c, cx + 3, cy - 8, 3, 16, METAL_LIGHT);
  rect(c, cx + 5, cy - 8, 1, 16, METAL);
  rect(c, cx + 3, cy - 8, 3, 1, METAL_DARK);
  rect(c, cx + 3, cy + 7, 3, 1, METAL_DARK);
  // Red power cell in the middle of the barrel, and a team stud behind it.
  rect(c, cx + 2, cy - 1, 5, 2, GUN_RED);
  px(c, cx + 2, cy - 1, GUN_RED_HI);
  px(c, cx, cy, p.tunicLight);
  for (const y of [-6, 5]) px(c, cx + 4, cy + y, RIVET);
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
