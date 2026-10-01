import type { DinoPalette } from './dinoArt';
import { checker, ellipse, line, litShade, makeCanvas, outline, px, rect } from './pixel';

// Procedural top-down Velociraptor, its head and the rider's dart launcher.
// All art faces +x (east); canvas center = pivot; rotation frames are produced afterwards.

const OUTLINE = '#17110d';
const BONE = '#efe4c2';
const BONE_DARK = '#b5a57c';
const EYE = '#100c08';

/** Raptor body incl. two hind legs and long stiff tail; canvas center = body center (sim position). pose 0/1 alternate legs for running. */
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
  // Long stiff tail tapering to the rear (x = -20 .. -6).
  for (let x = -20; x <= -5; x++) {
    const t = (x + 20) / 15;
    const half = 0.5 + t * 2.3;
    for (let y = -Math.ceil(half); y <= Math.ceil(half); y++) {
      if (Math.abs(y + 0.5) > half) continue;
      const ny = (y + 0.5) / half;
      px(c, cx + x, cy + y, ny < -0.35 ? p.light : ny > 0.45 ? p.dark : p.base);
    }
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
  // Dark raptor stripes across the back and tail.
  const stripes: [number, number][] = [
    [-5, 2],
    [4, 2],
    [-8, 2],
    [-11, 1],
    [-14, 1],
    [-17, 0],
  ];
  for (const [sx, hh] of stripes) {
    for (let y = -hh - 1; y <= hh; y++) px(c, cx + sx, cy + y, p.dark);
  }
  // Feather crest accents along the spine of the tail and toward the neck (team accent).
  for (let x = -18; x <= -7; x += 3) px(c, cx + x, cy - 1, x % 2 === 0 ? p.frillLight : p.frill);
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

/** Small dart launcher (the raptor rider's weapon); canvas center = swivel pivot; barrel toward +x, muzzle about 8px from pivot. */
export function drawRaptorDart(): HTMLCanvasElement {
  const c = makeCanvas(24, 24);
  const cx = 12;
  const cy = 12;
  // Dark-wood stock behind the pivot.
  rect(c, cx - 2, cy - 1, 3, 2, '#4a2e18');
  rect(c, cx - 2, cy - 1, 3, 1, '#7a5030');
  // Thin metal barrel.
  rect(c, cx + 1, cy - 1, 7, 1, '#b8bec4');
  rect(c, cx + 1, cy, 7, 1, '#62676d');
  // Bright dart tip at the muzzle.
  px(c, cx + 8, cy - 1, '#f4f0dc');
  px(c, cx + 8, cy, '#d8d2b8');
  outline(c, OUTLINE);
  return c.canvas;
}
