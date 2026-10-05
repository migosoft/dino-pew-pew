import Phaser from 'phaser';
import { WILD_TEAM } from '../../sim/types';
import { createMatch } from '../../sim/sim';
import { createDino } from '../../sim/world';
import { getDino } from '../../sim/defs/dinos';
import { DinoView } from '../render/DinoView';
import { DEPTH } from '../render/depth';
import { pixelText } from '../render/Hud';
import { drawClawCursor } from '../render/textures/worldArt';
import { DIRS, FONT_KEY } from '../render/textures';
import { frameForAngle } from '../render/textures/pixel';

const PALETTES = ['t0', 't1', 't2', 't3', 'wild'];
const TEAM_ROWS = ['t0', 't1', 't2', 't3'];
const HEADINGS = 8;
/** Cell size: big enough that neighbouring dinos (neck and tail included) don't overlap. */
const cellFor = (radius: number) => Math.max(52, radius * 8);

/**
 * Art preview sheet, opened with `?preview` (`?preview=velociraptor` for another species,
 * `&zoom=3&focus=row,col` to enlarge one cell, `&yaw=0.6` to turn heads (radians), `&whip=0.25` to
 * freeze a whip at that point of its swing). Rows are team palettes plus wild; columns are headings.
 * Ridden dinos have their guns turned slightly inwards, as when aiming ahead.
 * `?preview=camp` shows camp stages 0-5 and tower stages 0-3 for each team palette.
 */
export class PreviewScene extends Phaser.Scene {
  constructor() {
    super('preview');
  }

  create(): void {
    const params = new URLSearchParams(location.search);
    const kind = params.get('preview') || 'triceratops';
    const zoom = Number(params.get('zoom')) || 1;
    if (kind === 'camp') {
      // The whole sheet is wider than the view, so default to zoomed out.
      this.createCampSheet(params, Number(params.get('zoom')) || 0.48);
      return;
    }
    const CELL = cellFor(getDino(kind).radius);
    this.cameras.main.setBackgroundColor('#5a6b3a').setZoom(zoom);
    const s = createMatch(1);
    PALETTES.forEach((pal, row) => {
      for (let col = 0; col < HEADINGS; col++) {
        const heading = (col / HEADINGS) * Math.PI * 2;
        const ridden = pal !== 'wild';
        const d = createDino(s, kind, WILD_TEAM, (col + 0.5) * CELL, (row + 0.5) * CELL + 8, heading, ridden ? 1 : null);
        d.headYaw = Number(params.get('yaw')) || 0;
        const whip = params.get('whip');
        if (whip !== null && getDino(kind).ability) d.abilityT = Number(whip) * getDino(kind).ability!.duration;
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

  /** Camp sheet: a row per team palette; camp stages 0-5 (stage 0 under its force field), then tower stages 0-3. */
  private createCampSheet(params: URLSearchParams, zoom: number): void {
    const CW = 110;
    const CH = 120;
    const TOWER_X = 6 * CW + 20;
    this.cameras.main.setBackgroundColor('#5a6b3a').setZoom(zoom);
    TEAM_ROWS.forEach((pal, row) => {
      const y = row * CH + 70;
      for (let st = 0; st <= 5; st++) {
        const x = st * CW + CW / 2;
        this.add.image(x, y, `camp_${pal}_${st}`).setOrigin(0.5, 52 / 96);
        if (st === 0) this.add.image(x, y, `field_${pal}`).setOrigin(0.5, 56 / 110).setAlpha(0.8);
      }
      for (let st = 0; st <= 3; st++) {
        const x = TOWER_X + st * 40;
        this.add.image(x, y, `tower_${pal}_${st}`).setOrigin(0.5, 40 / 48);
        if (st <= 2) this.add.image(x, y - 22, `towerTurret_${pal}`, frameForAngle(0.5, DIRS));
      }
    });
    // Stage labels live in the world (pixelText is screen-fixed), so they follow zoom and focus.
    const label = (x: number, st: number) => this.add.bitmapText(x, 8, FONT_KEY, String(st)).setOrigin(0.5, 0).setScale(2).setTint(0xffe066);
    for (let st = 0; st <= 5; st++) label(st * CW + CW / 2, st);
    for (let st = 0; st <= 3; st++) label(TOWER_X + st * 40, st);
    this.add.bitmapText(4, -12, FONT_KEY, 'CAMP PREVIEW').setScale(2).setTint(0xffe066);
    const focus = params.get('focus')?.split(',').map(Number);
    if (focus) this.cameras.main.centerOn((focus[1] + 0.5) * CW, focus[0] * CH + 70);
    else this.cameras.main.centerOn((TOWER_X + 3 * 40 + 20) / 2, (TEAM_ROWS.length * CH) / 2);
  }
}
