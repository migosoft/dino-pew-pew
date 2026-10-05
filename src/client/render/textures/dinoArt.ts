import { taperedChain, type ChainSegment } from './chainArt';
import { checker, ellipse, line, litShade, makeCanvas, outline, px, rect, type PixCanvas } from './pixel';

// Procedural top-down Triceratops, its rider armor, rider and side cannons. All art faces +x (east);
// rotation frames are produced afterwards.

export interface DinoPalette {
  dark: string;
  base: string;
  light: string;
  belly: string;
  frillDark: string;
  frill: string;
  frillLight: string;
  saddle: string;
  saddleLight: string;
  tunic: string;
  tunicLight: string;
}

/** One palette per team slot (index = TeamState.slot). Tunic color = team color. */
export const TEAM_PALETTES: DinoPalette[] = [
  {
    // GREEN
    dark: '#2b4a2c',
    base: '#4d7c3c',
    light: '#7aa951',
    belly: '#93b86a',
    frillDark: '#8a3e1e',
    frill: '#c2662c',
    frillLight: '#eaa04c',
    saddle: '#6b4226',
    saddleLight: '#9a6638',
    tunic: '#2f8a34',
    tunicLight: '#7ad06a',
  },
  {
    // RED
    dark: '#3c2420',
    base: '#7a4632',
    light: '#a9714a',
    belly: '#b98a5c',
    frillDark: '#3b3a6e',
    frill: '#5d5aa8',
    frillLight: '#8e8ad8',
    saddle: '#2e2a26',
    saddleLight: '#55493e',
    tunic: '#a8282e',
    tunicLight: '#e05048',
  },
  {
    // GOLD
    dark: '#4a3a1c',
    base: '#9a7a34',
    light: '#c8a650',
    belly: '#d8bc78',
    frillDark: '#2e5a5a',
    frill: '#3f8a84',
    frillLight: '#6cc0b4',
    saddle: '#5a2a1a',
    saddleLight: '#8a4a2a',
    tunic: '#c89a20',
    tunicLight: '#f0d060',
  },
  {
    // BLUE
    dark: '#24303e',
    base: '#4a5e74',
    light: '#7890a8',
    belly: '#90a4b8',
    frillDark: '#7a2a4a',
    frill: '#b04a6e',
    frillLight: '#e07898',
    saddle: '#3a2a20',
    saddleLight: '#6a5038',
    tunic: '#2850a8',
    tunicLight: '#6890e8',
  },
];

/** Riderless wild dinosaurs: natural, muted hides (saddle colors blend into the hide). */
export const WILD_PALETTE: DinoPalette = {
  dark: '#3a3a2a',
  base: '#6a6a4a',
  light: '#94926a',
  belly: '#aaa47c',
  frillDark: '#5a3a24',
  frill: '#8a5a34',
  frillLight: '#b88450',
  saddle: '#6a6a4a',
  saddleLight: '#6a6a4a',
  tunic: '#6a6a4a',
  tunicLight: '#94926a',
};

const OUTLINE = '#17110d';
const BONE = '#efe4c2';
const BONE_DARK = '#b5a57c';
const BEAK = '#3a3430';

/** Tail links from the root under the hips (`tail.offset` in dinos.ts) to the tip. */
export const TRICERATOPS_TAIL: ChainSegment[] = taperedChain(3, 5, 5, 0.6);

/** Body with legs; the tail is drawn as separate links (TRICERATOPS_TAIL). `pose` 0/1 alternates the diagonal leg pairs for walking. */
export function drawTriceratopsBody(p: DinoPalette, pose: 0 | 1): HTMLCanvasElement {
  const c = makeCanvas(48, 48);
  const cx = 24;
  const cy = 24;
  // Legs first so the body overlaps them.
  const swing = pose === 0 ? 2 : -2;
  const legs: [number, number, number][] = [
    [7, -8.5, swing],
    [7, 8.5, -swing],
    [-6, -8.5, -swing],
    [-6, 8.5, swing],
  ];
  for (const [lx, ly, s] of legs) {
    ellipse(c, cx + lx + s, cy + ly, 3.2, 2.6, (nx, ny, x, y) => litShade(nx, ny, x, y, p.dark, p.dark, p.base));
    // toes
    px(c, cx + lx + s + 2.5, cy + ly + (ly < 0 ? -1.5 : 1.5), BONE_DARK);
  }
  // Torso.
  ellipse(c, cx, cy, 13, 9, (nx, ny, x, y) => litShade(nx, ny, x, y, p.dark, p.base, p.light));
  // Spine ridge of small scutes.
  for (let x = -14; x <= 8; x += 3) px(c, cx + x, cy - 0.5, p.dark);
  for (let x = -13; x <= 9; x += 3) px(c, cx + x, cy - 1.5, p.light);
  // Mottled hide.
  const spots = [
    [-8, -5],
    [-3, 5],
    [3, -6],
    [-10, 3],
    [6, 4],
  ];
  for (const [sx, sy] of spots) {
    px(c, cx + sx, cy + sy, p.dark);
    px(c, cx + sx + 1, cy + sy, p.dark);
  }
  // Saddle blanket.
  rect(c, cx - 5, cy - 5, 8, 10, p.saddle);
  rect(c, cx - 5, cy - 5, 8, 1, p.saddleLight);
  rect(c, cx - 5, cy - 5, 1, 10, p.saddleLight);
  for (let y = -4; y < 5; y += 2) px(c, cx + 2, cy + y, p.saddleLight);
  outline(c, OUTLINE);
  return c.canvas;
}

/** Head with frill and three horns. Canvas center = neck pivot. */
export function drawTriceratopsHead(p: DinoPalette): HTMLCanvasElement {
  const c = makeCanvas(36, 36);
  const cx = 18;
  const cy = 18;
  // Frill: a wide bony shield behind the face.
  ellipse(c, cx + 1, cy, 5.5, 11, (nx, ny, x, y) => {
    if (nx > 0.55) return null;
    const rim = nx * nx + ny * ny > 0.72;
    if (rim) return checker(x, y) ? BONE : p.frillDark;
    return litShade(nx, ny, x, y, p.frillDark, p.frill, p.frillLight);
  });
  // Frill spots.
  px(c, cx, cy - 6, p.frillLight);
  px(c, cx, cy + 6, p.frillDark);
  px(c, cx - 2, cy - 2, p.frillLight);
  // Face.
  ellipse(c, cx + 8, cy, 6.5, 4.2, (nx, ny, x, y) => litShade(nx, ny, x, y, p.dark, p.base, p.light));
  // Beak.
  rect(c, cx + 14, cy - 1, 2, 2, BEAK);
  px(c, cx + 13, cy - 2, BEAK);
  px(c, cx + 13, cy + 1, BEAK);
  // Eyes.
  px(c, cx + 7, cy - 3, '#100c08');
  px(c, cx + 7, cy + 3, '#100c08');
  // Brow horns, long and slightly splayed.
  line(c, cx + 6, cy - 3, cx + 16, cy - 5, BONE, 1);
  line(c, cx + 6, cy + 3, cx + 16, cy + 5, BONE, 1);
  px(c, cx + 6, cy - 2, BONE_DARK);
  px(c, cx + 6, cy + 2, BONE_DARK);
  // Nose horn.
  line(c, cx + 11, cy, cx + 13, cy, BONE, 1);
  outline(c, OUTLINE);
  return c.canvas;
}

/** Rider seen from above: shoulders, head with hair. Faces +x (the aim direction). */
export function drawRider(p: DinoPalette): HTMLCanvasElement {
  const c: PixCanvas = makeCanvas(16, 16);
  const cx = 8;
  const cy = 8;
  ellipse(c, cx - 0.5, cy, 2.6, 4, (nx, ny, x, y) => litShade(nx, ny, x, y, p.tunic, p.tunic, p.tunicLight));
  // Arms reaching forward to the controls.
  px(c, cx + 2, cy - 3, '#d9a77a');
  px(c, cx + 2, cy + 3, '#d9a77a');
  // Head + hair.
  ellipse(c, cx, cy, 1.8, 1.8, (nx, ny) => (nx < 0.1 ? '#4a2e1a' : ny < 0 ? '#e8b88a' : '#c99468'));
  outline(c, OUTLINE);
  return c.canvas;
}

// Gunmetal for armor plates and guns (shared by all teams; team color goes on trim).
export const METAL_DARK = '#3a3f47';
export const METAL = '#6b7480';
export const METAL_LIGHT = '#a8b2bd';
export const RIVET = '#dde3e8';

/**
 * Armored howdah strapped over the back of a ridden Triceratops, with struts out to both
 * flanks where the side cannons hang. Same canvas and pivot as the body.
 */
export function drawTriceratopsSaddleArmor(p: DinoPalette): HTMLCanvasElement {
  const c = makeCanvas(48, 48);
  const cx = 24;
  const cy = 24;
  // Struts out to the cannon hangers on both flanks.
  for (const side of [-1, 1]) {
    const y0 = side < 0 ? cy - 11 : cy + 8;
    rect(c, cx, y0, 3, 4, METAL);
    rect(c, cx, y0, 1, 4, METAL_LIGHT);
    rect(c, cx + 2, y0, 1, 4, METAL_DARK);
  }
  // Boxy shell: x -10..5, y -7..7, corners cut, lit from the upper left.
  const x0 = -10;
  const x1 = 5;
  for (let y = -7; y <= 7; y++) {
    for (let x = x0; x <= x1; x++) {
      const corner = (x === x0 || x === x1) && Math.abs(y) === 7;
      if (corner) continue;
      let col = METAL;
      if (y === -7 || x === x0) col = METAL_LIGHT;
      else if (y === 7 || x === x1) col = METAL_DARK;
      px(c, cx + x, cy + y, col);
    }
  }
  // Team-colored trim along both flanks and a seam between the front and rear plates.
  for (const y of [-5, 5]) {
    rect(c, cx + x0 + 1, cy + y, x1 - x0 - 1, 1, y < 0 ? p.tunicLight : p.tunic);
  }
  rect(c, cx - 6, cy - 6, 1, 13, METAL_DARK);
  // Rivets in the plate corners.
  for (const [rx, ry] of [
    [-9, -6],
    [-9, 6],
    [-7, -6],
    [-7, 6],
    [4, -6],
    [4, 6],
  ]) {
    px(c, cx + rx, cy + ry, RIVET);
  }
  // Leather seat for the rider.
  rect(c, cx - 4, cy - 3, 6, 6, p.saddle);
  rect(c, cx - 4, cy - 3, 6, 1, p.saddleLight);
  // Raised front shield protecting the rider.
  rect(c, cx + 3, cy - 4, 2, 8, METAL_LIGHT);
  rect(c, cx + 4, cy - 4, 1, 8, METAL);
  outline(c, OUTLINE);
  return c.canvas;
}

/** Face plate and frill shield of a ridden Triceratops. Same canvas and pivot as the head. */
export function drawTriceratopsHeadArmor(p: DinoPalette): HTMLCanvasElement {
  const c = makeCanvas(36, 36);
  const cx = 18;
  const cy = 18;
  // Frill shield in team color with a metal rim, studded in the middle.
  ellipse(c, cx, cy, 3, 7, (nx, ny, x, y) => {
    if (nx * nx + ny * ny > 0.68) return litShade(nx, ny, x, y, METAL_DARK, METAL, METAL_LIGHT);
    return litShade(nx, ny, x, y, p.tunic, p.tunic, p.tunicLight);
  });
  px(c, cx, cy - 3, RIVET);
  px(c, cx, cy + 3, RIVET);
  // Gunmetal face plate over the snout, leaving the beak and eyes free.
  ellipse(c, cx + 9.5, cy, 4, 2.6, (nx, ny, x, y) => (nx > 0.85 ? null : litShade(nx, ny, x, y, METAL_DARK, METAL, METAL_LIGHT)));
  rect(c, cx + 7, cy, 5, 1, METAL_LIGHT);
  // Horns go through holes in the plate.
  line(c, cx + 8, cy - 3, cx + 16, cy - 5, BONE, 1);
  line(c, cx + 8, cy + 3, cx + 16, cy + 5, BONE, 1);
  line(c, cx + 12, cy, cx + 13, cy, BONE, 1);
  outline(c, OUTLINE);
  return c.canvas;
}

/** Heavy side-hung cannon. Canvas center = pivot (middle of the breech); barrel points +x. */
export function drawSideCannon(): HTMLCanvasElement {
  const c = makeCanvas(32, 32);
  const cx = 16;
  const cy = 16;
  // Boxy breech.
  rect(c, cx - 3, cy - 2, 6, 5, METAL);
  rect(c, cx - 3, cy - 2, 6, 1, METAL_LIGHT);
  rect(c, cx - 3, cy + 2, 6, 1, METAL_DARK);
  px(c, cx - 2, cy, RIVET);
  px(c, cx + 1, cy, RIVET);
  // Long barrel with two cooling rings.
  rect(c, cx + 3, cy - 1, 10, 2, METAL);
  rect(c, cx + 3, cy - 1, 10, 1, METAL_LIGHT);
  for (const rx of [5, 9]) rect(c, cx + rx, cy - 2, 1, 4, METAL_DARK);
  // Heavy muzzle.
  rect(c, cx + 13, cy - 2, 2, 4, METAL_DARK);
  px(c, cx + 13, cy - 2, METAL_LIGHT);
  outline(c, OUTLINE);
  return c.canvas;
}
