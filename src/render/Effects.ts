import Phaser from 'phaser';
import { DEPTH } from './depth';

/** Short-lived visual feedback: muzzle flashes, sparks, dust and scorch marks. */
export class Effects {
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private scene: Phaser.Scene) {
    this.sparks = scene.add
      .particles(0, 0, 'spark', {
        speed: { min: 30, max: 90 },
        lifespan: { min: 120, max: 260 },
        alpha: { start: 1, end: 0 },
        tint: [0xffe066, 0xffb030, 0xffffff],
        emitting: false,
      })
      .setDepth(DEPTH.fx);
    this.dust = scene.add
      .particles(0, 0, 'dust', {
        speed: { min: 8, max: 40 },
        lifespan: { min: 400, max: 800 },
        scale: { start: 1, end: 2.2 },
        alpha: { start: 0.7, end: 0 },
        emitting: false,
      })
      .setDepth(DEPTH.fx - 1);
  }

  muzzle(x: number, y: number): void {
    const f = this.scene.add.image(Math.round(x), Math.round(y), 'flash').setDepth(DEPTH.fx);
    this.scene.time.delayedCall(50, () => f.destroy());
  }

  hit(x: number, y: number): void {
    this.sparks.explode(6, x, y);
  }

  impact(x: number, y: number): void {
    this.sparks.explode(3, x, y);
    this.dust.explode(2, x, y);
  }

  death(x: number, y: number): void {
    this.sparks.explode(18, x, y);
    this.dust.explode(14, x, y);
    this.scene.add.image(Math.round(x), Math.round(y), 'scorch').setDepth(DEPTH.decal);
    this.scene.cameras.main.shake(120, 0.004);
  }
}
