import Phaser from 'phaser';
import { rotationStrip, silhouette } from './pixel';
import {
  TEAM_PALETTES,
  WILD_PALETTE,
  drawRider,
  drawSideCannon,
  drawTriceratopsBody,
  drawTriceratopsHead,
  drawTriceratopsHeadArmor,
  drawTriceratopsSaddleArmor,
} from './dinoArt';
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
import { WAVE_VARIANTS, drawDroplet, drawFish, drawFoamRing, drawRipple, drawWave } from './waterArt';
import { FONT_CHARS, FONT_H, FONT_W, drawFont } from './font';
import { drawRaptorBody, drawRaptorHead, drawRaptorHeadArmor, drawRaptorSaddleArmor, drawRaptorSideGun } from './raptorArt';
import { drawBroadsideGun, drawBrontosaurusBody, drawBrontosaurusHead, drawBrontosaurusPlatform, drawTailGun } from './brontosaurusArt';
import { drawChainSegment } from './chainArt';
import { CHAINS } from '../chains';
import { BUSH_VARIANTS, CARCASS_KINDS, FERN_VARIANTS, drawBush, drawCarcass, drawFernPatch, type FoodStage } from './foodArt';

/** Rotation frames for parts that turn (bodies, heads, weapons). */
export const DIRS = 64;
export const BOLT_DIRS = 32;
/** Carcasses lie still, so fewer rotation frames suffice. */
export const CARCASS_DIRS = 16;
/** Fish shadows are tiny; 16 directions look smooth enough. */
export const FISH_DIRS = 16;
export const FONT_KEY = 'pixelfont';

function addStrip(scene: Phaser.Scene, key: string, src: HTMLCanvasElement, n: number): void {
  const { canvas, size, perRow } = rotationStrip(src, n);
  const tex = scene.textures.addCanvas(key, canvas)!;
  for (let i = 0; i < n; i++) tex.add(i, 0, (i % perRow) * size, Math.floor(i / perRow) * size, size, size);
}

function addImage(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): void {
  scene.textures.addCanvas(key, canvas);
}

export function generateTextures(scene: Phaser.Scene): void {
  // Per-team textures are keyed by palette: "t0".."t3", plus "wild" (see client/teams.ts).
  [...TEAM_PALETTES, WILD_PALETTE].forEach((pal, slot) => {
    const key = slot < TEAM_PALETTES.length ? `t${slot}` : 'wild';
    // Tails (and the Brontosaurus neck) are chains of links that bend (client/render/chains.ts).
    // Chained species have no ready-made shadow: opaque masks of body, head and links are
    // stamped into one texture per dino, so the shadow bends too and overlaps don't darken it.
    const mask = (src: HTMLCanvasElement) => silhouette(src, '#000000');
    const bodyAndHead = (kind: string, body: (pose: 0 | 1) => HTMLCanvasElement, head: HTMLCanvasElement) => {
      for (const pose of [0, 1] as const) {
        const canvas = body(pose);
        addStrip(scene, `${kind}_body_${key}_${pose}`, canvas, DIRS);
        if (slot === 0) addStrip(scene, `${kind}_bodyMask_${pose}`, mask(canvas), DIRS);
      }
      addStrip(scene, `${kind}_head_${key}`, head, DIRS);
      if (slot === 0) addStrip(scene, `${kind}_head_mask`, mask(head), DIRS);
    };
    bodyAndHead('triceratops', (pose) => drawTriceratopsBody(pal, pose), drawTriceratopsHead(pal));
    // Rider armor (only ridden dinos wear it, so no wild variant). DinoView picks up
    // `<kind>_armor_<palette>` (body) and `<kind>_headArmor_<palette>` whenever they exist.
    if (key !== 'wild') {
      addStrip(scene, `triceratops_armor_${key}`, drawTriceratopsSaddleArmor(pal), DIRS);
      addStrip(scene, `triceratops_headArmor_${key}`, drawTriceratopsHeadArmor(pal), DIRS);
    }
    bodyAndHead('velociraptor', (pose) => drawRaptorBody(pal, pose), drawRaptorHead(pal));
    if (key !== 'wild') {
      addStrip(scene, `velociraptor_armor_${key}`, drawRaptorSaddleArmor(pal), DIRS);
      addStrip(scene, `velociraptor_headArmor_${key}`, drawRaptorHeadArmor(pal), DIRS);
    }
    bodyAndHead('brontosaurus', (pose) => drawBrontosaurusBody(pal, pose), drawBrontosaurusHead(pal));
    for (const [kind, spec] of Object.entries(CHAINS)) {
      for (const [part, chain] of [['neck', spec.neck], ['tail', spec.tail]] as const) {
        chain?.segs.forEach((seg, i) => {
          const link = drawChainSegment(pal, seg, chain.style);
          addStrip(scene, `${kind}_${part}${i}_${key}`, link, DIRS);
          if (slot === 0) addStrip(scene, `${kind}_${part}${i}_mask`, mask(link), DIRS);
        });
      }
    }
    if (key !== 'wild') addStrip(scene, `brontosaurus_armor_${key}`, drawBrontosaurusPlatform(pal), DIRS);
    addStrip(scene, `rider_${key}`, drawRider(pal), DIRS);
    addImage(scene, `totem_${key}`, drawTotem(pal.tunic, pal.tunicLight));
  });
  addImage(scene, 'campStone', drawCampStone());
  addStrip(scene, 'weapon_sideCannon', drawSideCannon(), DIRS);
  addStrip(scene, 'weapon_raptorSideGun', drawRaptorSideGun(), DIRS);
  addStrip(scene, 'weapon_broadsideGun', drawBroadsideGun(), DIRS);
  addStrip(scene, 'weapon_tailGun', drawTailGun(), DIRS);

  const stages: FoodStage[] = [0, 1, 2];
  for (const st of stages) {
    for (let v = 0; v < BUSH_VARIANTS; v++) addImage(scene, `bush_${v}_${st}`, drawBush(v, st));
    for (let v = 0; v < FERN_VARIANTS; v++) addImage(scene, `fern_${v}_${st}`, drawFernPatch(v, st));
    for (const kind of CARCASS_KINDS) addStrip(scene, `carcass_${kind}_${st}`, drawCarcass(kind, st), CARCASS_DIRS);
  }
  addImage(scene, 'leaf', drawDot(1, '#8ed05a'));
  addImage(scene, 'meat', drawDot(1, '#c83a2a'));
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
  // Living water.
  addImage(scene, 'ripple', drawRipple());
  addImage(scene, 'foamRing', drawFoamRing());
  addImage(scene, 'droplet', drawDroplet());
  for (let v = 0; v < WAVE_VARIANTS; v++) {
    addImage(scene, `wave_${v}_deep`, drawWave(v, true));
    addImage(scene, `wave_${v}_shallow`, drawWave(v, false));
  }
  for (const frame of [0, 1] as const) {
    addStrip(scene, `fish_${frame}_0`, drawFish(frame, false), FISH_DIRS);
    addStrip(scene, `fish_${frame}_1`, drawFish(frame, true), FISH_DIRS);
  }
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
