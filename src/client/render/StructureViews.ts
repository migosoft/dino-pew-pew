import Phaser from 'phaser';
import type { StructureInfo, TeamInfo } from '../../net/protocol';
import { CAMP } from '../../sim/camp';
import { paletteKey, teamColor } from '../teams';
import { DEPTH } from './depth';
import { Effects } from './Effects';
import { campStage, towerStage } from './structureStages';
import { DIRS } from './textures';
import { frameForAngle } from './textures/pixel';

interface Entry {
  kind: StructureInfo['kind'];
  base: Phaser.GameObjects.Image;
  shadow?: Phaser.GameObjects.Image;
  turret?: Phaser.GameObjects.Image;
  field?: Phaser.GameObjects.Image;
  stage: number;
  fieldOn: boolean;
  /** Next time (ms) this structure puffs smoke or fire. */
  nextFx: number;
}

/** Grow the camera view by this much before deciding a structure is close enough to smoke. */
const FX_MARGIN = 80;
const CAMP_FX_MS = 220;
const RUIN_SMOKE_MS = 600;
const TOWER_SPARK_MS = 700;
/** Wing roofs (relative to the camp centre) where smoke and fire rise. */
const ROOF_POINTS: [number, number][] = [
  [-27, -16],
  [27, -16],
];
const SCAFFOLD = 0xb08a52;
const PIP = 0xffe066;

/** Camps, towers and force fields: one set of sprites per structure id, created when first seen. */
export class StructureViews {
  private entries = new Map<number, Entry>();
  private overlay: Phaser.GameObjects.Graphics;
  private structures = new Map<number, StructureInfo>();

  constructor(private scene: Phaser.Scene, private fx: Effects) {
    this.overlay = scene.add.graphics().setDepth(DEPTH.overlay);
  }

  update(list: StructureInfo[], teams: TeamInfo[], now: number, view: Phaser.Geom.Rectangle): void {
    this.structures = new Map(list.map((s) => [s.id, s]));
    this.overlay.clear();
    const near = new Phaser.Geom.Rectangle(view.x - FX_MARGIN, view.y - FX_MARGIN, view.width + FX_MARGIN * 2, view.height + FX_MARGIN * 2);
    for (const s of list) {
      const p = paletteKey(s.team, teams);
      const stage: number = s.kind === 'camp' ? campStage(s.hp, s.maxHp) : towerStage(s.hp, s.maxHp);
      let e = this.entries.get(s.id);
      if (!e) {
        e = this.create(s, p, stage);
        this.entries.set(s.id, e);
      }
      const baseKey = `${s.kind === 'camp' ? 'camp' : 'tower'}_${p}_${stage}`;
      if (stage !== e.stage) {
        e.base.setTexture(baseKey);
        if (stage > e.stage && stage === (s.kind === 'camp' ? 5 : 3)) this.fx.rubble(s.x, s.y);
        e.stage = stage;
      } else if (e.base.texture.key !== baseKey) e.base.setTexture(baseKey);

      // The hit flash wins; otherwise a cracked camp crystal flickers as a slow tint on/off.
      if (s.hitFlash) e.base.setTintFill(0xffffff);
      else if (s.kind === 'camp' && stage === 4 && Math.floor(now / 250) % 2 === 0) e.base.setTint(0xffd8c8);
      else e.base.clearTint();

      const onScreen = near.contains(s.x, s.y);
      if (s.kind === 'camp') this.updateCamp(e, s, p, stage, now, onScreen);
      else this.updateTower(e, s, stage, now, onScreen);
    }
    for (const [id, e] of this.entries) {
      if (this.structures.has(id)) continue;
      this.destroyEntry(e);
      this.entries.delete(id);
    }
  }

  private create(s: StructureInfo, p: string, stage: number): Entry {
    const e: Entry = { kind: s.kind, base: null as unknown as Phaser.GameObjects.Image, stage, fieldOn: s.field, nextFx: 0 };
    if (s.kind === 'camp') {
      e.base = this.scene.add.image(s.x, s.y - 4, `camp_${p}_${stage}`).setOrigin(0.5, 52 / 96).setDepth(DEPTH.world + s.y + 20);
      e.shadow = this.scene.add.image(s.x + 4, s.y + 6, 'shadow').setDisplaySize(84, 40).setDepth(DEPTH.shadow);
      e.field = this.scene.add.image(s.x, s.y - 10, `field_${p}`).setDepth(DEPTH.world + s.y + 40).setVisible(s.field);
    } else {
      e.base = this.scene.add.image(s.x, s.y, `tower_${p}_${stage}`).setOrigin(0.5, 40 / 48).setDepth(DEPTH.world + s.y);
      e.turret = this.scene.add.image(s.x, s.y - 22, `towerTurret_${p}`, 0).setDepth(DEPTH.world + s.y + 1);
    }
    return e;
  }

  private updateCamp(e: Entry, s: StructureInfo, p: string, stage: number, now: number, onScreen: boolean): void {
    const field = e.field!;
    if (field.texture.key !== `field_${p}`) field.setTexture(`field_${p}`);
    if (s.field !== e.fieldOn) {
      e.fieldOn = s.field;
      this.scene.tweens.killTweensOf(field);
      if (s.field) {
        field.setVisible(true).setScale(0.6);
        this.scene.tweens.add({ targets: field, scale: 1, duration: 400 });
      } else {
        // Shrink, then a quick pop as it vanishes.
        this.scene.tweens.add({
          targets: field,
          scale: 0.7,
          duration: 220,
          onComplete: () => {
            this.scene.tweens.add({ targets: field, scale: 1.1, alpha: 0, duration: 80, onComplete: () => field.setVisible(false) });
          },
        });
      }
    }
    if (e.fieldOn) field.setAlpha(0.55 + 0.15 * Math.sin(now / 400));

    if (!onScreen || stage < 2 || now < e.nextFx) return;
    if (stage === 5) {
      e.nextFx = now + RUIN_SMOKE_MS;
      this.fx.smoke(s.x, s.y - 8);
      return;
    }
    e.nextFx = now + CAMP_FX_MS;
    for (const [dx, dy] of ROOF_POINTS) {
      this.fx.smoke(s.x + dx, s.y + dy);
      if (stage >= 3) this.fx.fire(s.x + dx, s.y + dy + 4);
    }
  }

  private updateTower(e: Entry, s: StructureInfo, stage: number, now: number, onScreen: boolean): void {
    const turret = e.turret!;
    turret.setVisible(stage < 3);
    if (stage < 3) turret.setFrame(frameForAngle(s.angle, DIRS));
    if (stage === 3 && s.rebuildIn > 0) this.drawRebuild(s);
    if (onScreen && stage === 2 && now >= e.nextFx) {
      e.nextFx = now + TOWER_SPARK_MS;
      this.fx.hit(s.x, s.y - 22);
    }
  }

  /** Scaffold outline over the rubble, and a one-pixel progress bar under it. */
  private drawRebuild(s: StructureInfo): void {
    const g = this.overlay;
    const x = Math.round(s.x);
    const y = Math.round(s.y);
    g.lineStyle(1, SCAFFOLD, 0.9);
    g.strokeRect(x - 9, y - 24, 18, 22);
    g.lineBetween(x - 9, y - 24, x + 9, y - 2);
    g.lineBetween(x + 9, y - 24, x - 9, y - 2);
    g.lineBetween(x - 9, y - 13, x + 9, y - 13);
    const w = Math.round(20 * (1 - s.rebuildIn / CAMP.towerRebuild));
    g.fillStyle(0x000000, 0.6).fillRect(x - 10, y + 6, 20, 1);
    g.fillStyle(PIP, 1).fillRect(x - 10, y + 6, Math.max(0, Math.min(20, w)), 1);
  }

  /** A ripple where the force field blocked a hit. */
  shieldHit(x: number, y: number, structureId: number, structures: StructureInfo[], teams: TeamInfo[]): void {
    const team = structures.find((s) => s.id === structureId)?.team;
    const ring = this.scene.add.image(Math.round(x), Math.round(y), 'fieldRing').setDepth(DEPTH.fx);
    if (team) ring.setTint(teamColor(team, teams));
    this.scene.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 350, onComplete: () => ring.destroy() });
  }

  private destroyEntry(e: Entry): void {
    for (const o of [e.base, e.shadow, e.turret, e.field]) {
      if (!o) continue;
      this.scene.tweens.killTweensOf(o);
      o.destroy();
    }
  }

  destroy(): void {
    for (const e of this.entries.values()) this.destroyEntry(e);
    this.entries.clear();
    this.overlay.destroy();
  }
}
