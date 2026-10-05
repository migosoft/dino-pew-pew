import Phaser from 'phaser';
import { DEPTH } from './depth';

/** Scorch marks stay on the ground; past this many the oldest is reused. */
const MAX_SCORCHES = 64;

/** Short-lived visual feedback: muzzle flashes, sparks, dust and scorch marks. */
export class Effects {
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private smokeFx: Phaser.GameObjects.Particles.ParticleEmitter;
  private fireFx: Phaser.GameObjects.Particles.ParticleEmitter;
  private scorches: Phaser.GameObjects.Image[] = [];
  private nextScorch = 0;

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
    this.smokeFx = scene.add
      .particles(0, 0, 'dust', {
        tint: 0x5a5550,
        speedY: { min: -26, max: -14 },
        speedX: { min: -6, max: 6 },
        lifespan: { min: 1200, max: 2000 },
        scale: { start: 1, end: 3 },
        alpha: { start: 0.5, end: 0 },
        emitting: false,
      })
      .setDepth(DEPTH.fx - 2);
    this.fireFx = scene.add
      .particles(0, 0, 'spark', {
        tint: [0xffe066, 0xff7a2a, 0xe0503c],
        speedY: { min: -40, max: -20 },
        speedX: { min: -8, max: 8 },
        lifespan: { min: 250, max: 500 },
        alpha: { start: 1, end: 0 },
        emitting: false,
      })
      .setDepth(DEPTH.fx);
  }

  /** A rising puff of dark smoke (burning camp). */
  smoke(x: number, y: number): void {
    this.smokeFx.explode(1, x, y);
  }

  /** A flame lick (burning camp). */
  fire(x: number, y: number): void {
    this.fireFx.explode(2, x, y);
  }

  /** A structure collapsing: a burst of dust and sparks, and a shake when it happens on screen. */
  rubble(x: number, y: number): void {
    this.dust.explode(16, x, y);
    this.sparks.explode(12, x, y);
    const cam = this.scene.cameras.main;
    if (cam.worldView.contains(x, y)) cam.shake(200, 0.006);
  }

  /** Little leaves (herbivores) or bits of meat (carnivores) popping up while eating. */
  feed(x: number, y: number, meat: boolean): void {
    const bit = this.scene.add.image(Math.round(x + (Math.random() - 0.5) * 8), Math.round(y - 4), meat ? 'meat' : 'leaf').setDepth(DEPTH.fx);
    this.scene.tweens.add({ targets: bit, y: bit.y - 8, alpha: 0, duration: 500, onComplete: () => bit.destroy() });
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

  /** Dust kicked up as a leap or dash starts. */
  takeOff(x: number, y: number): void {
    this.dust.explode(6, x, y);
  }

  /** Puff of dust behind a dashing dino. */
  dashTrail(x: number, y: number): void {
    this.dust.explode(1, x, y);
  }

  /** Tail whip on dry ground: a swept cloud of dust where the tail lands. */
  whip(x: number, y: number): void {
    this.dust.explode(7, x, y);
  }

  /** Jaws snapping shut: sparks and blood on a hit, a puff of dust on a miss. */
  bite(x: number, y: number, hit: boolean): void {
    if (hit) {
      this.sparks.explode(10, x, y);
      for (let i = 0; i < 3; i++) {
        const drop = this.scene.add.image(Math.round(x + (Math.random() - 0.5) * 8), Math.round(y + (Math.random() - 0.5) * 6), 'meat').setDepth(DEPTH.decal);
        this.scene.tweens.add({ targets: drop, alpha: 0, delay: 3000, duration: 1500, onComplete: () => drop.destroy() });
      }
    } else this.dust.explode(4, x, y);
  }

  /** Leap landing: a ring of dust and sparks. */
  slam(x: number, y: number): void {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.dust.explode(1, x + Math.cos(a) * 8, y + Math.sin(a) * 8);
    }
    this.sparks.explode(8, x, y);
  }

  private scorch(x: number, y: number): void {
    if (this.scorches.length < MAX_SCORCHES) {
      this.scorches.push(this.scene.add.image(x, y, 'scorch').setDepth(DEPTH.decal));
      return;
    }
    this.scorches[this.nextScorch].setPosition(x, y);
    this.nextScorch = (this.nextScorch + 1) % MAX_SCORCHES;
  }

  death(x: number, y: number): void {
    this.sparks.explode(18, x, y);
    this.dust.explode(14, x, y);
    this.scorch(Math.round(x), Math.round(y));
    const cam = this.scene.cameras.main;
    if (cam.worldView.contains(x, y)) cam.shake(120, 0.004);
  }
}
