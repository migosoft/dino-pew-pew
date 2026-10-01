import Phaser from 'phaser';
import { rotationStrip, silhouette } from './pixel';
import { TEAM_PALETTES, drawHornCannon, drawRider, drawTriceratopsBody, drawTriceratopsHead } from './dinoArt';
import {
  CANOPY_SIZES,
  ROCK_SIZES,
  drawArrow,
  drawBolt,
  drawCampStone,
  drawTotem,
  drawCanopy,
  drawDot,
  drawMuzzleFlash,
  drawReticle,
  drawRock,
  drawScorch,
  drawShadowEllipse,
  drawTrunk,
} from './worldArt';
import { FONT_CHARS, FONT_H, FONT_W, drawFont } from './font';

/** Rotation frames for parts that turn (bodies, heads, weapons). */
export const DIRS = 64;
export const BOLT_DIRS = 32;
export const FONT_KEY = 'pixelfont';

function addStrip(scene: Phaser.Scene, key: string, src: HTMLCanvasElement, n: number): void {
  const { canvas, size } = rotationStrip(src, n);
  const tex = scene.textures.addCanvas(key, canvas)!;
  for (let i = 0; i < n; i++) tex.add(i, 0, i * size, 0, size, size);
}

function addImage(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): void {
  scene.textures.addCanvas(key, canvas);
}

export function generateTextures(scene: Phaser.Scene): void {
  // Per-team textures are keyed by palette: "t0".."t3" (see client/teams.ts).
  TEAM_PALETTES.forEach((pal, slot) => {
    const key = `t${slot}`;
    for (const pose of [0, 1] as const) {
      const body = drawTriceratopsBody(pal, pose);
      addStrip(scene, `triceratops_body_${key}_${pose}`, body, DIRS);
      if (slot === 0) addStrip(scene, `triceratops_shadow_${pose}`, silhouette(body, 'rgba(0,0,0,0.32)'), DIRS);
    }
    addStrip(scene, `triceratops_head_${key}`, drawTriceratopsHead(pal), DIRS);
    addStrip(scene, `rider_${key}`, drawRider(pal), DIRS);
    addImage(scene, `totem_${key}`, drawTotem(pal.tunic, pal.tunicLight));
  });
  addImage(scene, 'campStone', drawCampStone());
  addStrip(scene, 'weapon_hornCannon', drawHornCannon(), DIRS);
  // Bolts: your own team's shots are warm yellow, everyone else's are red.
  addStrip(scene, 'bolt_friendly', drawBolt('#fff6b0', '#ffb030'), BOLT_DIRS);
  addStrip(scene, 'bolt_hostile', drawBolt('#ffd0c0', '#ff4a2c'), BOLT_DIRS);

  for (const r of ROCK_SIZES) for (let v = 0; v < 3; v++) addImage(scene, `rock_${r}_${v}`, drawRock(r, v));
  for (const R of CANOPY_SIZES) {
    for (let v = 0; v < 3; v++) {
      const canopy = drawCanopy(R, v);
      addImage(scene, `canopy_${R}_${v}`, canopy);
      addImage(scene, `canopyShadow_${R}_${v}`, silhouette(canopy, 'rgba(0,0,0,0.22)'));
    }
  }
  addImage(scene, 'trunk', drawTrunk());
  addImage(scene, 'shadow', drawShadowEllipse(8, 5));
  addImage(scene, 'dot', drawDot(1, '#000000'));
  addImage(scene, 'spark', drawDot(1, '#ffffff'));
  addImage(scene, 'dust', drawDot(2.5, '#c8b48a'));
  addImage(scene, 'flash', drawMuzzleFlash());
  addImage(scene, 'scorch', drawScorch());
  addImage(scene, 'reticle', drawReticle());
  addImage(scene, 'arrow', drawArrow());

  const font = drawFont();
  addImage(scene, FONT_KEY, font.canvas);
  scene.cache.bitmapFont.add(
    FONT_KEY,
    Phaser.GameObjects.RetroFont.Parse(scene, {
      image: FONT_KEY,
      width: FONT_W,
      height: FONT_H,
      chars: FONT_CHARS,
      charsPerRow: font.charsPerRow,
      'spacing.x': 0,
      'spacing.y': 0,
      'offset.x': 0,
      'offset.y': 0,
      lineSpacing: 2,
    }),
  );
}
