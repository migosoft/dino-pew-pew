import Phaser from 'phaser';
import type { PlayerInfo } from '../../net/protocol';
import { MAX_UPGRADE_LEVEL, UPGRADES, UPGRADE_STATS, upgradeCost, type UpgradeStat } from '../../sim/upgrades';
import { pixelText } from './Hud';
import { DEPTH } from './depth';

const W = 250;
const ROW = 16;

/** Base camp shop overlay. The world keeps running underneath. */
export class ShopPanel {
  private g: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.BitmapText;
  private rows: Phaser.GameObjects.BitmapText[];
  private footer: Phaser.GameObjects.BitmapText;
  private open = false;

  constructor(private scene: Phaser.Scene, private onBuy: (stat: UpgradeStat) => void) {
    const depth = DEPTH.hud + 3;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    this.title = pixelText(scene, 0, 0, '', 0xffe066).setDepth(depth + 1);
    this.rows = UPGRADE_STATS.map((stat) => {
      const t = pixelText(scene, 0, 0, '').setDepth(depth + 1).setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => this.open && this.onBuy(stat));
      return t;
    });
    this.footer = pixelText(scene, 0, 0, '1-4 OR CLICK TO BUY   E CLOSE', 0x8a8a7a).setDepth(depth + 1);
    this.setVisible(false);
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.open = !this.open;
    this.setVisible(this.open);
  }

  close(): void {
    this.open = false;
    this.setVisible(false);
  }

  private setVisible(v: boolean): void {
    for (const o of [this.g, this.title, this.footer, ...this.rows]) o.setVisible(v);
  }

  update(me: PlayerInfo | undefined): void {
    if (!this.open || !me) return;
    const cam = this.scene.cameras.main;
    const x = Math.round(cam.width / 2 - W / 2);
    const y = Math.round(cam.height / 2 - 50);
    const h = 30 + UPGRADE_STATS.length * ROW + 18;
    this.g.clear();
    this.g.fillStyle(0x0b0805, 0.88).fillRect(x, y, W, h);
    this.g.lineStyle(1, 0xc8a650, 1).strokeRect(x + 0.5, y + 0.5, W - 1, h - 1);
    this.title.setText(`BASE CAMP SHOP      $ ${me.money}`).setPosition(x + 8, y + 7);
    UPGRADE_STATS.forEach((stat, i) => {
      const level = me.upgrades[stat];
      const maxed = level >= MAX_UPGRADE_LEVEL;
      const cost = upgradeCost(stat, level);
      const pips = '*'.repeat(level) + '-'.repeat(MAX_UPGRADE_LEVEL - level);
      const label = `${i + 1} ${UPGRADES[stat].label.padEnd(9)} ${pips}  ${UPGRADES[stat].perLevel.padEnd(13)} ${maxed ? ' MAX' : `$${cost}`}`;
      const tint = maxed ? 0x6a6a5a : me.money >= cost ? 0xf4f0e0 : 0x8a6a5a;
      this.rows[i].setText(label).setTint(tint).setPosition(x + 8, y + 26 + i * ROW);
    });
    this.footer.setPosition(x + 8, y + h - 14);
  }
}
