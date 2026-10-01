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
 * Sprites for one dino: shadow, body, head, and — when ridden — rider and weapons.
 * Fed a fresh interpolated Dino every frame.
 */
export class DinoView {
  private shadow: Phaser.GameObjects.Image;
  private body: Phaser.GameObjects.Image;
  private head?: Phaser.GameObjects.Image;
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
    if (ridden) this.rider = scene.add.image(0, 0, `rider_${palette}`, 0);
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

    if (this.head && def.head) {
      const hp = localToWorld(d, heading, def.head.offset);
      this.head
        .setFrame(frameForAngle(heading + d.headYaw, DIRS))
        .setPosition(Math.round(hp.x), Math.round(hp.y))
        .setDepth(DEPTH.world + y + 0.2);
    }

    let riderAngle = heading;
    this.weapons.forEach((w, i) => {
      const mf = mountFrame(d, def, i);
      if (i === 0) riderAngle = mf.angle;
      w.setFrame(frameForAngle(mf.angle, DIRS))
        .setPosition(Math.round(mf.x), Math.round(mf.y))
        .setDepth(DEPTH.world + y + 0.4);
    });
    if (this.rider) {
      const rp = localToWorld(d, heading, { x: -1, y: 0 });
      this.rider
        .setFrame(frameForAngle(riderAngle, DIRS))
        .setPosition(Math.round(rp.x), Math.round(rp.y))
        .setDepth(DEPTH.world + y + 0.3);
    }

    for (const p of [this.body, this.head, this.rider]) {
      if (!p) continue;
      if (d.hitFlash > 0) p.setTintFill(0xffffff);
      else p.clearTint();
    }
  }

  destroy(): void {
    for (const s of [this.shadow, this.body, this.head, this.rider, ...this.weapons]) s?.destroy();
  }
}
