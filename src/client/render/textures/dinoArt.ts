import { checker, ellipse, line, litShade, makeCanvas, outline, px, rect, type PixCanvas } from './pixel';

// Procedural top-down Triceratops, rider and horn cannon. All art faces +x (east);
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

/** Body (with legs and tail). `pose` 0/1 alternates the diagonal leg pairs for walking. */
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
  // Tail tapering to the rear.
  for (let x = -22; x <= -7; x++) {
    const t = (x + 22) / 15;
    const half = 0.6 + t * 4.4;
    for (let y = -Math.ceil(half); y <= Math.ceil(half); y++) {
      if (Math.abs(y + 0.5) > half) continue;
      const ny = (y + 0.5) / half;
      px(c, cx + x, cy + y, ny < -0.4 ? p.light : ny > 0.5 ? p.dark : p.base);
    }
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

/** Bronze horn-mounted cannon. Canvas center = swivel pivot; barrel points +x. */
export function drawHornCannon(): HTMLCanvasElement {
  const c = makeCanvas(28, 28);
  const cx = 14;
  const cy = 14;
  // Breech block.
  rect(c, cx - 3, cy - 2, 5, 4, '#6e4a22');
  rect(c, cx - 3, cy - 2, 5, 1, '#b07c3a');
  // Barrel.
  rect(c, cx + 2, cy - 1, 9, 2, '#7a7f86');
  rect(c, cx + 2, cy - 1, 9, 1, '#c3c9cf');
  // Muzzle ring.
  rect(c, cx + 10, cy - 1.5, 2, 3, '#4e5257');
  px(c, cx + 10, cy - 2, '#9aa0a6');
  outline(c, OUTLINE);
  return c.canvas;
}
