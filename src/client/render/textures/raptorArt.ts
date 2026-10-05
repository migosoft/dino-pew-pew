import { METAL, METAL_DARK, METAL_LIGHT, RIVET, type DinoPalette } from './dinoArt';
import { taperedChain, type ChainSegment } from './chainArt';
import { checker, ellipse, line, litShade, makeCanvas, outline, px, rect } from './pixel';

// Procedural top-down Velociraptor, its head, the rider armor and the twin side guns.
// All art faces +x (east); canvas center = pivot; rotation frames are produced afterwards.

const OUTLINE = '#17110d';
const BONE = '#efe4c2';
const BONE_DARK = '#b5a57c';
const EYE = '#100c08';

/** Tail links from the root behind the hips (`tail.offset` in dinos.ts) to the tip. */
export const RAPTOR_TAIL: ChainSegment[] = taperedChain(4, 3.75, 2.8, 0.5);

/** Raptor body incl. two hind legs; the tail is separate links (RAPTOR_TAIL). Canvas center = body center (sim position). pose 0/1 alternate legs for running. */
export function drawRaptorBody(p: DinoPalette, pose: 0 | 1): HTMLCanvasElement {
  const c = makeCanvas(48, 48);
  const cx = 24;
  const cy = 24;
  // Hind legs first so the torso overlaps the thighs. Bipedal: one forward, one back.
  const swing = pose === 0 ? 2 : -2;
  const legs: [number, number][] = [
    [-5, swing], // left (top) side
    [4, -swing], // right (bottom) side
  ];
  for (const [ly, s] of legs) {
    const side = ly < 0 ? -1 : 1;
    // Thigh.
    ellipse(c, cx + 0.5 + s, cy + ly + 0.5, 2.6, 1.7, (nx, ny, x, y) => litShade(nx, ny, x, y, p.dark, p.dark, p.base));
    // Foot reaching forward with toe claws.
    line(c, cx + 1 + s, cy + ly + 0.5 + side, cx + 3 + s, cy + ly + 0.5 + side, p.dark, 1);
    px(c, cx + 4 + s, cy + ly + 0.5 + side, BONE);
    px(c, cx + 3 + s, cy + ly + 0.5 + side * 2, BONE_DARK);
    // Sickle claw on the inner toe.
    px(c, cx + 2 + s, cy + ly + 0.5 - side, BONE_DARK);
  }
  // Slim torso.
  ellipse(c, cx, cy, 7, 4.5, (nx, ny, x, y) => litShade(nx, ny, x, y, p.dark, p.base, p.light));
  // Lighter belly stripe along the right flank.
  for (let x = -4; x <= 4; x++) px(c, cx + x, cy + 3, checker(cx + x, cy + 3) ? p.belly : p.base);
  // Small forelimbs tucked near the chest, claws forward.
  for (const ay of [-4, 3]) {
    px(c, cx + 4, cy + ay, p.dark);
    px(c, cx + 5, cy + ay, p.dark);
    px(c, cx + 6, cy + ay, BONE_DARK);
  }
  // Dark raptor stripes across the back (the tail links carry their own).
  const stripes: [number, number][] = [
    [-5, 2],
    [4, 2],
  ];
  for (const [sx, hh] of stripes) {
    for (let y = -hh - 1; y <= hh; y++) px(c, cx + sx, cy + y, p.dark);
  }
  // Feather crest accents toward the neck (team accent; the tail links carry the rest).
  px(c, cx + 5, cy - 1, p.frill);
  px(c, cx + 6, cy - 1, p.frillLight);
  px(c, cx + 5, cy, p.frill);
  // Saddle blanket (rider sits at x = -1).
  rect(c, cx - 3, cy - 3, 6, 6, p.saddle);
  rect(c, cx - 3, cy - 3, 6, 1, p.saddleLight);
  rect(c, cx - 3, cy - 3, 1, 6, p.saddleLight);
  px(c, cx + 2, cy - 1, p.saddleLight);
  px(c, cx + 2, cy + 1, p.saddleLight);
  outline(c, OUTLINE);
  return c.canvas;
}

/** Raptor head on a short neck; canvas center = neck pivot; head extends toward +x. */
export function drawRaptorHead(p: DinoPalette): HTMLCanvasElement {
  const c = makeCanvas(28, 28);
  const cx = 14;
  const cy = 14;
  // Short neck stub around the pivot.
  rect(c, cx - 1, cy - 2, 3, 4, p.base);
  rect(c, cx - 1, cy - 2, 3, 1, p.light);
  rect(c, cx - 1, cy + 1, 3, 1, p.dark);
  // Skull.
  ellipse(c, cx + 3, cy, 3.2, 2.8, (nx, ny, x, y) => litShade(nx, ny, x, y, p.dark, p.base, p.light));
  // Narrow elongated snout.
  ellipse(c, cx + 5.5, cy, 3.6, 1.9, (nx, ny, x, y) => litShade(nx, ny, x, y, p.dark, p.base, p.light));
  // Teeth peeking from the jaw edges.
  px(c, cx + 6, cy - 2, BONE);
  px(c, cx + 8, cy - 2, BONE);
  px(c, cx + 6, cy + 1, BONE);
  px(c, cx + 8, cy + 1, BONE);
  // Nostril near the snout tip.
  px(c, cx + 8, cy - 1, p.dark);
  // Eyes on both sides with a dark brow.
  px(c, cx + 3, cy - 2, EYE);
  px(c, cx + 3, cy + 1, EYE);
  px(c, cx + 2, cy - 3, p.dark);
  // Small feather crest at the back of the head (team accent).
  px(c, cx, cy - 1, p.frill);
  px(c, cx + 1, cy - 1, p.frillLight);
  px(c, cx, cy, p.frillDark);
  outline(c, OUTLINE);
  return c.canvas;
}

/**
 * Small riveted metal saddle strapped over the back of a ridden raptor, with short struts
 * out to both flanks where the side guns hang. Same canvas and pivot as the body.
 */
export function drawRaptorSaddleArmor(p: DinoPalette): HTMLCanvasElement {
  const c = makeCanvas(48, 48);
  const cx = 24;
  const cy = 24;
  // Struts out to the gun hangers on both flanks.
  for (const side of [-1, 1]) {
    const y0 = side < 0 ? cy - 8 : cy + 5;
    rect(c, cx, y0, 2, 3, METAL);
    rect(c, cx, y0, 1, 3, METAL_LIGHT);
  }
  // Shell: x -5..3, y -5..5, corners cut, lit from the upper left.
  const x0 = -5;
  const x1 = 3;
  for (let y = -5; y <= 5; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x === x0 || x === x1) && Math.abs(y) === 5) continue;
      let col = METAL;
      if (y === -5 || x === x0) col = METAL_LIGHT;
      else if (y === 5 || x === x1) col = METAL_DARK;
      px(c, cx + x, cy + y, col);
    }
  }
  // Team-colored trim along both flanks.
  rect(c, cx + x0 + 1, cy - 4, x1 - x0 - 1, 1, p.tunicLight);
  rect(c, cx + x0 + 1, cy + 4, x1 - x0 - 1, 1, p.tunic);
  // Rivets in the corners.
  for (const [rx, ry] of [
    [-4, -4],
    [-4, 4],
    [2, -4],
    [2, 4],
  ]) {
    px(c, cx + rx, cy + ry, RIVET);
  }
  // Leather seat and a raised front lip.
  rect(c, cx - 4, cy - 2, 5, 5, p.saddle);
  rect(c, cx - 4, cy - 2, 5, 1, p.saddleLight);
  rect(c, cx + 2, cy - 3, 1, 7, METAL_LIGHT);
  outline(c, OUTLINE);
  return c.canvas;
}

/** Silver face mask with a grille over the raptor's skull and snout. Same canvas and pivot as the head. */
export function drawRaptorHeadArmor(p: DinoPalette): HTMLCanvasElement {
  const c = makeCanvas(28, 28);
  const cx = 14;
  const cy = 14;
  // Helmet over the skull, running out along the snout; the tip stays bare.
  ellipse(c, cx + 3.5, cy, 3.4, 2.6, (nx, ny, x, y) => litShade(nx, ny, x, y, METAL_DARK, METAL, METAL_LIGHT));
  ellipse(c, cx + 5.5, cy, 2.8, 1.7, (nx, ny, x, y) => (nx > 0.7 ? null : litShade(nx, ny, x, y, METAL_DARK, METAL, METAL_LIGHT)));
  // Dark grille slots across the snout.
  for (const gx of [5, 7]) {
    px(c, cx + gx, cy - 1, METAL_DARK);
    px(c, cx + gx, cy, METAL_DARK);
  }
  // Ridge along the top with a team-color stud.
  rect(c, cx + 1, cy - 1, 3, 1, RIVET);
  px(c, cx + 2, cy, p.tunicLight);
  // Eye holes.
  px(c, cx + 3, cy - 2, EYE);
  px(c, cx + 3, cy + 1, EYE);
  outline(c, OUTLINE);
  return c.canvas;
}

/** Small side-hung gun of the raptor rider. Canvas center = pivot; barrel points +x, muzzle about 8px from pivot. */
export function drawRaptorSideGun(): HTMLCanvasElement {
  const c = makeCanvas(24, 24);
  const cx = 12;
  const cy = 12;
  // Red power cell behind the breech, as on the box art.
  rect(c, cx - 2, cy - 1, 1, 3, '#a8282e');
  px(c, cx - 2, cy - 1, '#e05048');
  // Compact breech.
  rect(c, cx - 1, cy - 1, 3, 3, METAL);
  rect(c, cx - 1, cy - 1, 3, 1, METAL_LIGHT);
  rect(c, cx - 1, cy + 1, 3, 1, METAL_DARK);
  // Slim barrel and muzzle.
  rect(c, cx + 2, cy, 5, 1, METAL_LIGHT);
  px(c, cx + 7, cy, METAL_DARK);
  outline(c, OUTLINE);
  return c.canvas;
}
