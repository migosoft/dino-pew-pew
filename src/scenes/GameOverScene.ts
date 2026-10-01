import Phaser from 'phaser';
import { pixelText } from '../render/Hud';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('gameover');
  }

  create(data: { score: number; wave: number; seed: number }): void {
    const { width, height } = this.cameras.main;
    const cx = Math.round(width / 2);
    const cy = Math.round(height / 2);
    this.add.rectangle(0, 0, width, height, 0x0b0805, 0.6).setOrigin(0, 0);
    pixelText(this, cx, cy - 36, 'YOU WERE DEFEATED', 0xe0503c).setOrigin(0.5).setScale(2);
    pixelText(this, cx, cy - 6, `WAVE REACHED ${data.wave}`).setOrigin(0.5);
    pixelText(this, cx, cy + 6, `SCORE ${data.score}`, 0xffe066).setOrigin(0.5);
    const prompt = pixelText(this, cx, cy + 30, 'PRESS R OR CLICK TO RIDE AGAIN').setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.3, yoyo: true, repeat: -1, duration: 500 });

    const restart = () => {
      this.scene.stop();
      this.scene.get('game').scene.restart({ seed: (Math.random() * 2 ** 31) >>> 0, intro: false });
    };
    this.input.keyboard!.once('keydown-R', restart);
    this.time.delayedCall(400, () => this.input.once('pointerdown', restart));
  }
}
