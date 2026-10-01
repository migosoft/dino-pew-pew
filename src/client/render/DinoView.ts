import Phaser from 'phaser';
import type { Dino } from '../../sim/types';
import { getDino } from '../../sim/defs/dinos';
import { localToWorld } from '../../sim/math';
import { mountFrame } from '../../sim/systems/aiming';
import { frameForAngle } from './textures/pixel';
import { DIRS } from './textures';
import { DEPTH } from './depth';

const STRIDE_PER_POSE = 7;

/**
 * Sprites for one dino: shadow, body, head, and — when ridden — armor, rider and weapons.
 * Fed a fresh interpolated Dino every frame.
 */
export class DinoView {
  private shadow: Phaser.GameObjects.Image;
  private body: Phaser.GameObjects.Image;
  private head?: Phaser.GameObjects.Image;
  /** Rider armor over the body and head; only species with `<kind>_armor_*` textures have it. */
  private armor?: Phaser.GameObjects.Image;
  private headArmor?: Phaser.GameObjects.Image;
  private rider?: Phaser.GameObjects.Image;
  private weapons: Phaser.GameObjects.Image[];
  /** The dino as last drawn. */
  lastView: Dino;

  constructor(scene: Phaser.Scene, d: Dino, private palette: string) {
    const def = getDino(d.kind);
    this.shadow = scene.add.image(0, 0, `${d.kind}_shadow_0`, 0).setDepth(DEPTH.shadow);
    this.body = scene.add.image(0, 0, `${d.kind}_body_${palette}_0`, 0);
    if (def.head) this.head = scene.add.image(0, 0, `${d.kind}_head_${palette}`, 0);
    const ridden = d.playerId !== null;
    if (ridden) {
      const armorKey = `${d.kind}_armor_${palette}`;
      const headArmorKey = `${d.kind}_headArmor_${palette}`;
      if (scene.textures.exists(armorKey)) this.armor = scene.add.image(0, 0, armorKey, 0);
      if (this.head && scene.textures.exists(headArmorKey)) this.headArmor = scene.add.image(0, 0, headArmorKey, 0);
      this.rider = scene.add.image(0, 0, `rider_${palette}`, 0);
    }
    this.weapons = ridden ? def.mounts.map((m) => scene.add.image(0, 0, `weapon_${m.weapon}`, 0)) : [];
    this.lastView = d;
    this.update(d);
  }

  update(d: Dino): void {
    this.lastView = d;
    const def = getDino(d.kind);
    const { x, y, heading } = d;

    const pose = Math.abs(d.speed) > 2 ? Math.floor(d.stride / STRIDE_PER_POSE) % 2 : 0;
    const f = frameForAngle(heading, DIRS);
    this.shadow.setTexture(`${d.kind}_shadow_${pose}`, f).setPosition(Math.round(x) + 3, Math.round(y) + 4);
    this.body.setTexture(`${d.kind}_body_${this.palette}_${pose}`, f).setPosition(Math.round(x), Math.round(y)).setDepth(DEPTH.world + y);
    this.armor?.setFrame(f).setPosition(Math.round(x), Math.round(y)).setDepth(DEPTH.world + y + 0.15);

    if (this.head && def.head) {
      const hp = localToWorld(d, heading, def.head.offset);
      const hf = frameForAngle(heading + d.headYaw, DIRS);
      this.head.setFrame(hf).setPosition(Math.round(hp.x), Math.round(hp.y)).setDepth(DEPTH.world + y + 0.2);
      this.headArmor?.setFrame(hf).setPosition(Math.round(hp.x), Math.round(hp.y)).setDepth(DEPTH.world + y + 0.22);
    }

    // The rider looks where the guns point (their mean direction when there are several).
    let aimX = 0;
    let aimY = 0;
    this.weapons.forEach((w, i) => {
      const mf = mountFrame(d, def, i);
      aimX += Math.cos(mf.angle);
      aimY += Math.sin(mf.angle);
      w.setFrame(frameForAngle(mf.angle, DIRS))
        .setPosition(Math.round(mf.x), Math.round(mf.y))
        .setDepth(DEPTH.world + y + 0.4);
    });
    if (this.rider) {
      const riderAngle = aimX || aimY ? Math.atan2(aimY, aimX) : heading;
      const rp = localToWorld(d, heading, { x: -1, y: 0 });
      this.rider
        .setFrame(frameForAngle(riderAngle, DIRS))
        .setPosition(Math.round(rp.x), Math.round(rp.y))
        .setDepth(DEPTH.world + y + 0.3);
    }

    for (const p of [this.body, this.head, this.armor, this.headArmor, this.rider]) {
      if (!p) continue;
      if (d.hitFlash > 0) p.setTintFill(0xffffff);
      else p.clearTint();
    }
  }

  destroy(): void {
    for (const s of [this.shadow, this.body, this.head, this.armor, this.headArmor, this.rider, ...this.weapons]) s?.destroy();
  }
}
