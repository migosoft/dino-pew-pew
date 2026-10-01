import Phaser from 'phaser';
import type { Dino } from '../../sim/types';
import { getDino } from '../../sim/defs/dinos';
import { getWeapon } from '../../sim/defs/weapons';
import { mountCoverage, mountFrame, muzzlePoint } from '../../sim/systems/aiming';
import { DEPTH } from './depth';

const WEDGE_RADIUS = 64;

/**
 * Shows where the player's weapons can reach (faint wedge) and where they are
 * actually pointing right now (dotted line) — shots follow the dots, not the cursor.
 */
export class ArcIndicator {
  private g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.arc);
  }

  update(view: Dino | undefined): void {
    const g = this.g;
    g.clear();
    if (!view || !view.alive) return;
    const def = getDino(view.kind);
    for (let i = 0; i < def.mounts.length; i++) {
      const cov = mountCoverage(view, def, i);
      const pivot = mountFrame(view, def, i);
      const a0 = cov.center - cov.half;
      const a1 = cov.center + cov.half;
      g.fillStyle(0xfff2c0, 0.13);
      g.slice(pivot.x, pivot.y, WEDGE_RADIUS, a0, a1, false);
      g.fillPath();
      // Dotted rim at the edges of the reachable arc.
      for (const a of [a0, a1]) {
        for (let t = 14; t <= WEDGE_RADIUS; t += 5) {
          g.fillStyle(0xfff2c0, 0.4);
          g.fillRect(Math.round(pivot.x + Math.cos(a) * t), Math.round(pivot.y + Math.sin(a) * t), 1, 1);
        }
      }

      const muzzle = muzzlePoint(view, def, i);
      const range = Math.min(getWeapon(def.mounts[i].weapon).range, 140);
      const cos = Math.cos(pivot.angle);
      const sin = Math.sin(pivot.angle);
      for (let t = 6; t < range; t += 7) {
        g.fillStyle(0xfff2c0, 0.55 * (1 - t / range));
        g.fillRect(Math.round(muzzle.x + cos * t), Math.round(muzzle.y + sin * t), 1, 1);
      }
    }
  }
}
