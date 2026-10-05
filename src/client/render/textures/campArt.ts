import { ellipse, line, litShade, makeCanvas, outline, px, rect, seededRandom, type PixCanvas } from './pixel';
import { METAL, METAL_DARK, METAL_LIGHT, type DinoPalette } from './dinoArt';

const STONE = ['#4a4640', '#6e685e', '#958d7f'] as const;
const WOOD = ['#3e2716', '#6b4226', '#9a6638'] as const;
const CHAR = '#1d1714';
const ASH = '#3a3430';
const EMBER = '#ff7a2a';
const CRYSTAL = ['#2a8fb0', '#7ff0ff', '#d8ffff'] as const;
const OUTLINE = '#120c08';

/** Darken (f < 1) or lighten (f > 1) a #rrggbb colour. */
function tint(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f))).toString(16).padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

const CX = 48;
const CY = 52;
/** Fixed damage layout shared by all palettes: where holes, scorches and breaches go. */
const HOLES = (() => {
  const rnd = seededRandom(9001);
  return Array.from({ length: 14 }, () => ({ a: rnd() * Math.PI * 2, d: 0.25 + rnd() * 0.6, s: 2 + Math.floor(rnd() * 4) }));
})();

function stake(c: PixCanvas, x: number, y: number, broken: boolean): void {
  if (broken) {
    rect(c, x - 1, y - 2, 3, 2, WOOD[0]);
    px(c, x, y - 3, CHAR);
    return;
  }
  rect(c, x - 1, y - 7, 3, 7, WOOD[1]);
  rect(c, x - 1, y - 7, 1, 7, WOOD[2]);
  px(c, x, y - 8, WOOD[2]);
}

/** Palisade stakes on an ellipse; `front` draws the half nearer the viewer (drawn after the hall). */
function palisade(c: PixCanvas, stage: number, front: boolean): void {
  for (let k = 0; k < 30; k++) {
    const a = (k / 30) * Math.PI * 2;
    const y = CY + 2 + Math.sin(a) * 36;
    if (front !== Math.sin(a) > 0) continue;
    // Gate gap facing south-east.
    if (k === 3 || k === 4) continue;
    const broken = (stage >= 2 && k % 7 === 2) || (stage >= 3 && k % 5 === 1) || (stage >= 4 && k % 3 === 0);
    stake(c, Math.round(CX + Math.cos(a) * 44), Math.round(y), broken);
  }
}

function crystal(c: PixCanvas, x: number, y: number, cracked: boolean): void {
  // Faint glow on the roof around the crystal.
  ellipse(c, x, y, 7, 6, (nx, ny) => (nx * nx + ny * ny > 0.5 ? 'rgba(127,240,255,0.22)' : 'rgba(127,240,255,0.4)'));
  rect(c, x - 3, y + 4, 7, 2, METAL_DARK);
  rect(c, x - 2, y + 4, 5, 1, METAL);
  for (let dy = -5; dy <= 3; dy++) {
    const w = dy < 0 ? 3 + dy : 3 - Math.max(0, dy - 1);
    for (let dx = -Math.max(0, w - 1); dx <= Math.max(0, w - 1); dx++) px(c, x + dx, y + dy, dx < 0 ? CRYSTAL[2] : dx === 0 ? CRYSTAL[1] : CRYSTAL[0]);
  }
  if (cracked) {
    px(c, x, y - 2, CHAR);
    px(c, x + 1, y, CHAR);
    px(c, x, y + 1, CHAR);
  }
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

function banner(c: PixCanvas, p: DinoPalette, torn: boolean): void {
  const x = CX + 24;
  const y = CY - 30;
  line(c, x, y, x, y + 22, WOOD[1]);
  for (let r = 0; r < 7; r++) {
    const w = torn ? (r % 2 ? 5 : 8 - r) : 9;
    rect(c, x + 1, y + 1 + r, w, 1, r < 2 ? p.tunicLight : p.tunic);
  }
}

/** The team's camp: palisade, stone footing, round hall with a hide roof, field crystal, banner. */
export function drawCamp(p: DinoPalette, stage: number): HTMLCanvasElement {
  const c = makeCanvas(96, 96);
  if (stage >= 5) return drawRuins(c);
  palisade(c, stage, false);
  ellipse(c, CX, CY + 6, 31, 22, (nx, ny, x, y) => litShade(nx, ny, x, y, STONE[0], STONE[1], STONE[2]));
  const roofDark = tint(p.tunic, 0.6);
  ellipse(c, CX, CY - 3, 28, 21, (nx, ny, x, y) => {
    // Half the roof caved in from stage 3: charred beams over a dark interior.
    if (stage >= 3 && nx > 0.05 && ny < 0.3) return (x + y) % 5 === 0 ? WOOD[0] : x % 6 === 0 ? CHAR : '#24180f';
    // Radial seams between hide panels.
    const seam = Math.abs(Math.sin(Math.atan2(ny, nx) * 4)) < 0.12;
    return seam ? roofDark : litShade(nx, ny, x, y, roofDark, p.tunic, p.tunicLight);
  });
  // Timber ring at the roof edge.
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    px(c, Math.round(CX + Math.cos(a) * 28), Math.round(CY - 3 + Math.sin(a) * 21), k % 4 ? WOOD[1] : WOOD[2]);
  }
  // Door facing the viewer.
  rect(c, CX - 4, CY + 14, 8, 8, '#24180f');
  rect(c, CX - 4, CY + 14, 8, 1, WOOD[2]);
  if (stage < 4) banner(c, p, stage >= 1);
  // Damage that builds up stage by stage.
  HOLES.forEach((h, i) => {
    const x = Math.round(CX + Math.cos(h.a) * 26 * h.d);
    const y = Math.round(CY - 3 + Math.sin(h.a) * 19 * h.d);
    if (stage >= 1 && i < 4) ellipse(c, x, y, h.s, h.s - 1, (nx, ny, xx, yy) => (nx * nx + ny * ny < 0.45 ? 'rgba(20,14,10,0.8)' : (xx + yy) % 2 ? 'rgba(20,14,10,0.55)' : null));
    if ((stage >= 2 && i >= 4 && i < 8) || (stage >= 4 && i >= 8)) {
      ellipse(c, x, y, h.s, h.s - 1, () => '#1a110b');
      px(c, x + h.s - 1, y, EMBER);
    }
  });
  // Drawn after the damage so no hole swallows it; same spot at every stage, cracked from stage 4.
  crystal(c, CX, CY - 12, stage >= 4);
  if (stage >= 3) for (let k = 0; k < 18; k++) px(c, CX + 20 + (k * 7) % 14, CY + 10 + (k * 5) % 9, STONE[k % 3]);
  palisade(c, stage, true);
  outline(c, OUTLINE);
  return c.canvas;
}

/** What is left: a ring of rubble, crossed charred beams, ash and crystal shards. */
function drawRuins(c: PixCanvas): HTMLCanvasElement {
  ellipse(c, CX, CY + 4, 30, 21, (_nx, _ny, x, y) => ((x * 7 + y * 3) % 5 === 0 ? CHAR : ASH));
  const rnd = seededRandom(4242);
  for (let k = 0; k < 70; k++) {
    const a = rnd() * Math.PI * 2;
    const d = 0.8 + rnd() * 0.35;
    const x = Math.round(CX + Math.cos(a) * 30 * d);
    const y = Math.round(CY + 4 + Math.sin(a) * 21 * d);
    const s = 1 + Math.floor(rnd() * 3);
    ellipse(c, x, y, s, s, (nx, ny, xx, yy) => litShade(nx, ny, xx, yy, STONE[0], STONE[1], STONE[2]));
  }
  line(c, CX - 20, CY - 6, CX + 16, CY + 12, WOOD[0], 2);
  line(c, CX - 14, CY + 14, CX + 22, CY - 4, CHAR, 2);
  line(c, CX - 6, CY - 14, CX + 4, CY + 16, WOOD[0], 2);
  for (const [dx, dy] of [[-3, 2], [4, -1], [1, 5]]) px(c, CX + dx, CY + dy, CRYSTAL[1]);
  for (let k = 0; k < 8; k++) px(c, CX - 10 + k * 3, CY + 2 + (k % 3), EMBER);
  outline(c, OUTLINE);
  return c.canvas;
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

/** Force field dome over the camp building: faint fill, hex shimmer, brighter rim. */
export function drawField(color: string): HTMLCanvasElement {
  const c = makeCanvas(120, 110);
  const n = parseInt(color.slice(1), 16);
  const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  ellipse(c, 60, 56, 56, 50, (nx, ny, x, y) => {
    const r = nx * nx + ny * ny;
    if (r > 0.86) return `rgba(${rgb},0.55)`;
    const hex = (x + Math.floor(y / 2)) % 8 === 0 || y % 7 === 0;
    if (hex) return `rgba(${rgb},${(0.12 + r * 0.2).toFixed(2)})`;
    // Highlight on the upper-left of the dome.
    if (nx < -0.3 && ny < -0.3 && r < 0.5) return 'rgba(255,255,255,0.10)';
    return `rgba(${rgb},0.05)`;
  });
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
