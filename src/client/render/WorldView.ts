import Phaser from 'phaser';
import type { Obstacle, Vec2, World } from '../../sim/types';
import { CANOPY_SIZES, ROCK_SIZES, drawGround, nearestSize } from './textures/worldArt';
import { DEPTH } from './depth';

/** Canopies sit above the trunk; this lift fakes height in the top-down view. */
const CANOPY_LIFT = 10;

interface Canopy {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  r: number;
}

export class WorldView {
  private canopies: Canopy[] = [];
  private groundKey: string;

  constructor(private scene: Phaser.Scene, world: World) {
    this.groundKey = `ground_${world.seed}`;
    if (!scene.textures.exists(this.groundKey)) scene.textures.addCanvas(this.groundKey, drawGround(world));
    scene.add.image(0, 0, this.groundKey).setOrigin(0, 0).setDepth(DEPTH.ground);
    for (const o of world.obstacles) this.addObstacle(o);
  }

  private addObstacle(o: Obstacle): void {
    const s = this.scene;
    if (o.kind === 'rock') {
      const size = nearestSize(ROCK_SIZES, o.r);
      s.add.image(o.x + 3, o.y + 3, 'shadow').setDisplaySize(size * 2.4, size * 1.4).setDepth(DEPTH.shadow);
      s.add.image(o.x, o.y, `rock_${size}_${o.variant}`).setDepth(DEPTH.world + o.y);
      return;
    }
    const R = nearestSize(CANOPY_SIZES, o.canopyR);
    s.add.image(o.x + 7, o.y + 6, `canopyShadow_${R}_${o.variant}`).setDepth(DEPTH.shadow);
    s.add.image(o.x, o.y, 'trunk').setDepth(DEPTH.world + o.y);
    const cy = o.y - CANOPY_LIFT;
    const sprite = s.add.image(o.x, cy, `canopy_${R}_${o.variant}`).setDepth(DEPTH.canopy + cy);
    this.canopies.push({ sprite, x: o.x, y: cy, r: R });
  }

  /** Canopies go see-through when the player walks underneath. */
  update(player: Vec2 | undefined): void {
    for (const c of this.canopies) {
      const under = player !== undefined && (player.x - c.x) ** 2 + (player.y - c.y) ** 2 < (c.r + 6) ** 2;
      const target = under ? 0.35 : 1;
      c.sprite.alpha += (target - c.sprite.alpha) * 0.2;
    }
  }

  destroy(): void {
    this.scene.textures.remove(this.groundKey);
  }
}
