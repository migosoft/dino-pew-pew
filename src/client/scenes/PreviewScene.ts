import Phaser from 'phaser';
import { WILD_TEAM } from '../../sim/types';
import { createMatch } from '../../sim/sim';
import { createDino } from '../../sim/world';
import { getDino } from '../../sim/defs/dinos';
import { DinoView } from '../render/DinoView';
import { DEPTH } from '../render/depth';
import { pixelText } from '../render/Hud';
import { drawClawCursor } from '../render/textures/worldArt';

const PALETTES = ['t0', 't1', 't2', 't3', 'wild'];
const HEADINGS = 8;
/** Cell size: big enough that neighbouring dinos (neck and tail included) don't overlap. */
const cellFor = (radius: number) => Math.max(52, radius * 8);

/**
 * Art preview sheet, opened with `?preview` (`?preview=velociraptor` for another species,
 * `&zoom=3&focus=row,col` to enlarge one cell). Rows are team palettes plus wild; columns are headings.
 * Ridden dinos have their guns turned slightly inwards, as when aiming ahead.
 */
export class PreviewScene extends Phaser.Scene {
  constructor() {
    super('preview');
  }

  create(): void {
    const params = new URLSearchParams(location.search);
    const kind = params.get('preview') || 'triceratops';
    const zoom = Number(params.get('zoom')) || 1;
    const CELL = cellFor(getDino(kind).radius);
    this.cameras.main.setBackgroundColor('#5a6b3a').setZoom(zoom);
    const s = createMatch(1);
    PALETTES.forEach((pal, row) => {
      for (let col = 0; col < HEADINGS; col++) {
        const heading = (col / HEADINGS) * Math.PI * 2;
        const ridden = pal !== 'wild';
        const d = createDino(s, kind, WILD_TEAM, (col + 0.5) * CELL, (row + 0.5) * CELL + 8, heading, ridden ? 1 : null);
        d.headYaw = 0;
        d.mounts.forEach((m, i) => (m.angle = d.mounts.length > 1 ? (i === 0 ? 0.08 : -0.08) : 0));
        new DinoView(this, d, pal);
      }
    });
    pixelText(this, 4, 2, `${kind} PREVIEW`, 0xffe066);
    // Menu cursors (normal, hover) at their real 32px size.
    [false, true].forEach((hover, i) => {
      const key = `preview_claw_${i}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, drawClawCursor(hover));
      this.add.image(this.cameras.main.width - 80 + i * 38, 16, key).setOrigin(0).setScrollFactor(0).setScale(1 / zoom).setDepth(DEPTH.hud);
    });
    // `&focus=row,col` centers one cell (useful with zoom).
    const focus = params.get('focus')?.split(',').map(Number);
    if (focus) this.cameras.main.centerOn((focus[1] + 0.5) * CELL, (focus[0] + 0.5) * CELL + 8);
    else this.cameras.main.centerOn((HEADINGS * CELL) / 2, (PALETTES.length * CELL) / 2 + 8);
  }
}
