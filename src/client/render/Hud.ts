import Phaser from 'phaser';
import type { GameState } from '../../sim/types';
import { getDino } from '../../sim/defs/dinos';
import { FONT_KEY } from './textures';
import { DEPTH } from './depth';
import type { DinoView } from './DinoView';

export function pixelText(scene: Phaser.Scene, x: number, y: number, text: string, tint = 0xf4f0e0): Phaser.GameObjects.BitmapText {
  return scene.add.bitmapText(x, y, FONT_KEY, text.toUpperCase()).setTint(tint).setScrollFactor(0).setDepth(DEPTH.hud);
}

/** Screen-space HUD plus world-space enemy health bars and off-screen enemy arrows. */
export class Hud {
  private g: Phaser.GameObjects.Graphics;
  private world: Phaser.GameObjects.Graphics;
  private stats: Phaser.GameObjects.BitmapText;
  private banner: Phaser.GameObjects.BitmapText;
  private sub: Phaser.GameObjects.BitmapText;
  private arrows: Phaser.GameObjects.Image[] = [];
  private bannerTween?: Phaser.Tweens.Tween;

  constructor(private scene: Phaser.Scene) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.hud);
    this.world = scene.add.graphics().setDepth(DEPTH.overlay);
    this.stats = pixelText(scene, 6, 15, '');
    this.banner = pixelText(scene, 0, 0, '').setOrigin(0.5).setScale(2).setAlpha(0);
    this.sub = pixelText(scene, 0, 0, '').setOrigin(0.5).setAlpha(0);
  }

  showBanner(text: string, sub = '', tint = 0xffe066): void {
    const cam = this.scene.cameras.main;
    this.banner.setText(text.toUpperCase()).setTint(tint).setPosition(Math.round(cam.width / 2), Math.round(cam.height * 0.3));
    this.sub.setText(sub.toUpperCase()).setPosition(Math.round(cam.width / 2), Math.round(cam.height * 0.3) + 16);
    this.bannerTween?.stop();
    this.banner.setAlpha(1);
    this.sub.setAlpha(1);
    this.bannerTween = this.scene.tweens.add({ targets: [this.banner, this.sub], alpha: 0, delay: 1600, duration: 600 });
  }

  update(state: GameState, views: Map<number, DinoView>): void {
    const cam = this.scene.cameras.main;
    const player = state.dinos.find((d) => d.id === state.playerId);
    const g = this.g;
    g.clear();

    // Player health bar.
    const hpFrac = player ? Math.max(0, player.hp / player.maxHp) : 0;
    g.fillStyle(0x17110d, 1).fillRect(5, 5, 72, 7);
    g.fillStyle(0x4a1c18, 1).fillRect(6, 6, 70, 5);
    g.fillStyle(hpFrac > 0.35 ? 0x6fcf4a : 0xe0503c, 1).fillRect(6, 6, Math.round(70 * hpFrac), 5);
    g.fillStyle(0xffffff, 0.35).fillRect(6, 6, Math.round(70 * hpFrac), 1);

    const enemies = state.dinos.filter((d) => d.alive && d.team === 'enemy');
    const waveText = state.wave.phase === 'intermission' && state.wave.number > 0 ? `NEXT WAVE ${Math.ceil(state.wave.timer)}` : `WAVE ${state.wave.number}`;
    this.stats.setText(`${waveText}\nSCORE ${state.score}\nENEMIES ${enemies.length}`);

    // Enemy health bars (world space).
    const w = this.world;
    w.clear();
    for (const e of enemies) {
      if (e.hp >= e.maxHp) continue;
      const v = views.get(e.id)?.lastView ?? e;
      const r = getDino(e.kind).radius;
      const x = Math.round(v.x - 8);
      const y = Math.round(v.y - r - 8);
      w.fillStyle(0x17110d, 1).fillRect(x - 1, y - 1, 18, 4);
      w.fillStyle(0xe0503c, 1).fillRect(x, y, Math.round(16 * (e.hp / e.maxHp)), 2);
    }

    // Edge arrows pointing to off-screen enemies.
    while (this.arrows.length < enemies.length) this.arrows.push(this.scene.add.image(0, 0, 'arrow').setScrollFactor(0).setDepth(DEPTH.hud));
    this.arrows.forEach((a, i) => {
      const e = enemies[i];
      if (!e) return a.setVisible(false);
      const sx = e.x - cam.scrollX;
      const sy = e.y - cam.scrollY;
      const margin = 8;
      if (sx > 0 && sy > 0 && sx < cam.width && sy < cam.height) return a.setVisible(false);
      const cx = cam.width / 2;
      const cy = cam.height / 2;
      const ang = Math.atan2(sy - cy, sx - cx);
      const k = Math.min((cx - margin) / Math.abs(Math.cos(ang) || 1e-6), (cy - margin) / Math.abs(Math.sin(ang) || 1e-6));
      a.setVisible(true)
        .setPosition(Math.round(cx + Math.cos(ang) * k), Math.round(cy + Math.sin(ang) * k))
        .setRotation(ang);
    });
  }
}
