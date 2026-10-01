import Phaser from 'phaser';
import type { Dino } from '../../sim/types';
import { getDino } from '../../sim/defs/dinos';
import { lerp, lerpAngle, localToWorld } from '../../sim/math';
import { mountFrame } from '../../sim/systems/aiming';
import { frameForAngle } from './textures/pixel';
import { DIRS } from './textures';
import { DEPTH } from './depth';

const STRIDE_PER_POSE = 7;

/** Sprites for one dino: shadow, body, head, rider and one sprite per weapon mount. */
export class DinoView {
  private shadow: Phaser.GameObjects.Image;
  private body: Phaser.GameObjects.Image;
  private head?: Phaser.GameObjects.Image;
  private rider: Phaser.GameObjects.Image;
  private weapons: Phaser.GameObjects.Image[];
  /** Interpolated copy of the dino from the last update(), for overlays. */
  lastView: Dino;

  constructor(scene: Phaser.Scene, private d: Dino) {
    const def = getDino(d.kind);
    this.shadow = scene.add.image(0, 0, `${d.kind}_shadow_0`, 0).setDepth(DEPTH.shadow);
    this.body = scene.add.image(0, 0, `${d.kind}_body_${d.team}_0`, 0);
    if (def.head) this.head = scene.add.image(0, 0, `${d.kind}_head_${d.team}`, 0);
    this.rider = scene.add.image(0, 0, `rider_${d.team}`, 0);
    this.weapons = def.mounts.map((m) => scene.add.image(0, 0, `weapon_${m.weapon}`, 0));
    this.lastView = d;
  }

  get dino(): Dino {
    return this.d;
  }

  /** Interpolated world position for camera/HUD use. */
  position(alpha: number): { x: number; y: number } {
    return { x: lerp(this.d.px, this.d.x, alpha), y: lerp(this.d.py, this.d.y, alpha) };
  }

  update(alpha: number): void {
    const d = this.d;
    const def = getDino(d.kind);
    const x = lerp(d.px, d.x, alpha);
    const y = lerp(d.py, d.y, alpha);
    const heading = lerpAngle(d.pheading, d.heading, alpha);
    const view: Dino = { ...d, x, y, heading };
    this.lastView = view;

    const pose = Math.abs(d.speed) > 2 ? Math.floor(d.stride / STRIDE_PER_POSE) % 2 : 0;
    const f = frameForAngle(heading, DIRS);
    this.shadow.setTexture(`${d.kind}_shadow_${pose}`, f).setPosition(Math.round(x) + 3, Math.round(y) + 4);
    this.body.setTexture(`${d.kind}_body_${d.team}_${pose}`, f).setPosition(Math.round(x), Math.round(y)).setDepth(DEPTH.world + y);

    if (this.head && def.head) {
      const hp = localToWorld(view, heading, def.head.offset);
      this.head
        .setFrame(frameForAngle(heading + d.headYaw, DIRS))
        .setPosition(Math.round(hp.x), Math.round(hp.y))
        .setDepth(DEPTH.world + y + 0.2);
    }

    let riderAngle = heading;
    this.weapons.forEach((w, i) => {
      const mf = mountFrame(view, def, i);
      if (i === 0) riderAngle = mf.angle;
      w.setFrame(frameForAngle(mf.angle, DIRS))
        .setPosition(Math.round(mf.x), Math.round(mf.y))
        .setDepth(DEPTH.world + y + 0.4);
    });
    const rp = localToWorld(view, heading, { x: -1, y: 0 });
    this.rider
      .setFrame(frameForAngle(riderAngle, DIRS))
      .setPosition(Math.round(rp.x), Math.round(rp.y))
      .setDepth(DEPTH.world + y + 0.3);

    const parts = [this.body, this.head, this.rider];
    for (const p of parts) {
      if (!p) continue;
      if (d.hitFlash > 0) p.setTintFill(0xffffff);
      else p.clearTint();
    }
  }

  setVisible(v: boolean): void {
    for (const s of [this.shadow, this.body, this.head, this.rider, ...this.weapons]) s?.setVisible(v);
  }

  destroy(): void {
    for (const s of [this.shadow, this.body, this.head, this.rider, ...this.weapons]) s?.destroy();
  }
}
