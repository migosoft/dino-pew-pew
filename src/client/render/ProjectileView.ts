import Phaser from 'phaser';
import type { Projectile } from '../../sim/types';
import { lerp } from '../../sim/math';
import { frameForAngle } from './textures/pixel';
import { BOLT_DIRS } from './textures';
import { DEPTH } from './depth';

interface Entry {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  seen: boolean;
}

/** Keeps one sprite pair per live projectile in sync with the simulation. */
export class ProjectileView {
  private entries = new Map<number, Entry>();

  constructor(private scene: Phaser.Scene) {}

  update(projectiles: Projectile[], alpha: number): void {
    for (const e of this.entries.values()) e.seen = false;
    for (const p of projectiles) {
      let e = this.entries.get(p.id);
      if (!e) {
        const angle = Math.atan2(p.vy, p.vx);
        e = {
          sprite: this.scene.add.image(0, 0, `bolt_${p.team}`, frameForAngle(angle, BOLT_DIRS)).setDepth(DEPTH.projectile),
          shadow: this.scene.add.image(0, 0, 'dot').setAlpha(0.35).setDepth(DEPTH.shadow + 1),
          seen: true,
        };
        this.entries.set(p.id, e);
      }
      e.seen = true;
      const x = Math.round(lerp(p.px, p.x, alpha));
      const y = Math.round(lerp(p.py, p.y, alpha));
      e.sprite.setPosition(x, y);
      e.shadow.setPosition(x + 2, y + 4);
    }
    for (const [id, e] of this.entries) {
      if (e.seen) continue;
      e.sprite.destroy();
      e.shadow.destroy();
      this.entries.delete(id);
    }
  }
}
