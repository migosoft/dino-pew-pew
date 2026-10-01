import Phaser from 'phaser';
import type { Dino } from '../../sim/types';
import { getDino } from '../../sim/defs/dinos';
import { localToWorld } from '../../sim/math';
import { mountFrame } from '../../sim/systems/aiming';
import { frameForAngle } from './textures/pixel';
import { DIRS } from './textures';
import { DEPTH } from './depth';

const STRIDE_PER_POSE = 7;
/** Peak height (px) of a leap above the shadow. */
const LEAP_HEIGHT = 10;
/** How far (radians) a tail sweeps to each side during a whip, and sways while walking. */
const WHIP_SWING = 1.5;
const TAIL_SWAY = 0.12;

/** What a dino is standing in: shadows vanish in deep water and a ring of foam shows instead. */
export type Wading = 'dry' | 'shallow' | 'deep';

/**
 * Sprites for one dino: shadow, body, head, and — when ridden — armor, rider and weapons.
 * Fed a fresh interpolated Dino every frame.
 */
export class DinoView {
  private shadow: Phaser.GameObjects.Image;
  private body: Phaser.GameObjects.Image;
  private head?: Phaser.GameObjects.Image;
  /** A tail drawn as its own part (species with `tail` and `<kind>_tail_<palette>` art). */
  private tail?: Phaser.GameObjects.Image;
  private foam: Phaser.GameObjects.Image;
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
    this.foam = scene.add.image(0, 0, 'foamRing').setVisible(false);
    const tailKey = `${d.kind}_tail_${palette}`;
    if (def.tail && scene.textures.exists(tailKey)) this.tail = scene.add.image(0, 0, tailKey, 0);
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

  update(d: Dino, wading: Wading = 'dry'): void {
    this.lastView = d;
    const def = getDino(d.kind);
    const { x, y, heading } = d;

    const pose = Math.abs(d.speed) > 2 ? Math.floor(d.stride / STRIDE_PER_POSE) % 2 : 0;
    const f = frameForAngle(heading, DIRS);
    // Mid-leap the dino rises above its shadow and looks a little bigger.
    const ab = def.ability;
    const h = d.abilityT >= 0 && ab?.kind === 'leap' ? Math.sin(Math.PI * Math.min(1, d.abilityT / ab.duration)) * LEAP_HEIGHT : 0;
    const lift = Math.round(h);
    const scale = 1 + (0.15 * h) / LEAP_HEIGHT;
    // Screen position of a part, spread out from the body center by the leap scale.
    const sx = (px: number) => Math.round(x + (px - x) * scale);
    const sy = (py: number) => Math.round(y + (py - y) * scale) - lift;
    // Y-sorted with the world; in the air it draws over rocks and dinos below.
    const z = DEPTH.world + y + (lift > 0 ? 40 : 0);
    // In water the shadow falls on the surface: fainter in the shallows, gone in deep water.
    const wet = lift > 0 ? 'dry' : wading;
    this.shadow
      .setTexture(`${d.kind}_shadow_${pose}`, f)
      .setPosition(Math.round(x) + 3, Math.round(y) + 4)
      .setScale(1 - (0.2 * h) / LEAP_HEIGHT)
      .setAlpha(wet === 'deep' ? 0 : wet === 'shallow' ? 0.55 : 1);
    this.foam
      .setVisible(wet === 'deep')
      .setPosition(Math.round(x), Math.round(y))
      .setScale((def.radius + 5) / 12, (def.radius + 4) / 12)
      .setRotation(heading)
      .setDepth(z - 0.3);

    if (this.tail && def.tail) {
      const tp = localToWorld(d, heading, def.tail.offset);
      const whip = d.abilityT >= 0 && ab?.kind === 'whip' ? Math.sin(Math.PI * 2 * Math.min(1, d.abilityT / ab.duration)) * WHIP_SWING : 0;
      const sway = Math.abs(d.speed) > 2 ? Math.sin(d.stride / 9) * TAIL_SWAY : 0;
      this.tail.setFrame(frameForAngle(heading + whip + sway, DIRS)).setPosition(sx(tp.x), sy(tp.y)).setDepth(z - 0.1);
    }
    this.body.setTexture(`${d.kind}_body_${this.palette}_${pose}`, f).setPosition(Math.round(x), Math.round(y) - lift).setDepth(z);
    this.armor?.setFrame(f).setPosition(Math.round(x), Math.round(y) - lift).setDepth(z + 0.15);

    if (this.head && def.head) {
      const hp = localToWorld(d, heading, def.head.offset);
      const hf = frameForAngle(heading + d.headYaw, DIRS);
      this.head.setFrame(hf).setPosition(sx(hp.x), sy(hp.y)).setDepth(def.head.under ? z - 0.05 : z + 0.2);
      this.headArmor?.setFrame(hf).setPosition(sx(hp.x), sy(hp.y)).setDepth(z + 0.22);
    }

    // The rider looks where the guns point (their mean direction when there are several).
    let aimX = 0;
    let aimY = 0;
    this.weapons.forEach((w, i) => {
      const mf = mountFrame(d, def, i);
      aimX += Math.cos(mf.angle);
      aimY += Math.sin(mf.angle);
      w.setFrame(frameForAngle(mf.angle, DIRS))
        .setPosition(sx(mf.x), sy(mf.y))
        .setScale(scale)
        .setDepth(z + 0.4);
    });
    if (this.rider) {
      const riderAngle = aimX || aimY ? Math.atan2(aimY, aimX) : heading;
      const rp = localToWorld(d, heading, def.seat ?? { x: -1, y: 0 });
      this.rider
        .setFrame(frameForAngle(riderAngle, DIRS))
        .setPosition(sx(rp.x), sy(rp.y))
        .setDepth(z + 0.3);
    }

    for (const p of [this.body, this.head, this.tail, this.armor, this.headArmor, this.rider]) {
      if (!p) continue;
      p.setScale(scale);
      if (d.hitFlash > 0) p.setTintFill(0xffffff);
      else p.clearTint();
    }
  }

  destroy(): void {
    for (const s of [this.shadow, this.foam, this.tail, this.body, this.head, this.armor, this.headArmor, this.rider, ...this.weapons]) s?.destroy();
  }
}
