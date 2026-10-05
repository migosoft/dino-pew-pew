import Phaser from 'phaser';
import type { Obstacle, Vec2, World } from '../../sim/types';
import { BASE_RADIUS } from '../../sim/players';
import type { TeamInfo } from '../../net/protocol';
import { TEAM_COLORS } from '../teams';
import { CANOPY_SIZES, ROCK_SIZES, nearestSize } from './textures/worldArt';
import { BucketGrid } from './BucketGrid';
import { GroundChunks } from './GroundChunks';
import { DEPTH } from './depth';

/** Canopies sit above the trunk; this lift fakes height in the top-down view. */
const CANOPY_LIFT = 10;

interface Canopy {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  r: number;
}

interface ObstacleBucket {
  images: Phaser.GameObjects.Image[];
  canopies: Canopy[];
}

export class WorldView {
  private ground: GroundChunks;
  private buckets: BucketGrid<ObstacleBucket>;
  /** Camp markings per team slot. */
  private camps = new Map<number, { circle: Phaser.GameObjects.Graphics; totems: Phaser.GameObjects.Image[]; eliminated: boolean }>();

  constructor(private scene: Phaser.Scene, world: World) {
    this.ground = new GroundChunks(scene, world);
    this.buckets = new BucketGrid(world.width, world.height);
    for (const o of world.obstacles) this.addObstacle(o);
  }

  /** Draw a team-colored boundary and totems once per team; fade them when the team is eliminated. */
  updateBases(teams: TeamInfo[]): void {
    for (const t of teams) {
      let camp = this.camps.get(t.slot);
      if (!camp) {
        const g = this.scene.add.graphics().setDepth(DEPTH.decal);
        g.fillStyle(TEAM_COLORS[t.slot], 0.08).fillCircle(t.base.x, t.base.y, BASE_RADIUS);
        for (let k = 0; k < 96; k++) {
          if (k % 3 === 2) continue;
          const a = (k / 96) * Math.PI * 2;
          g.fillStyle(TEAM_COLORS[t.slot], 0.55).fillRect(Math.round(t.base.x + Math.cos(a) * BASE_RADIUS), Math.round(t.base.y + Math.sin(a) * BASE_RADIUS), 1, 1);
        }
        const totems: Phaser.GameObjects.Image[] = [];
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + 0.5;
          const x = Math.round(t.base.x + Math.cos(a) * (BASE_RADIUS - 10));
          const y = Math.round(t.base.y + Math.sin(a) * (BASE_RADIUS - 10));
          totems.push(this.scene.add.image(x, y, `totem_t${t.slot}`).setOrigin(0.5, 0.85).setDepth(DEPTH.world + y));
        }
        camp = { circle: g, totems, eliminated: false };
        this.camps.set(t.slot, camp);
      }
      if (t.eliminated && !camp.eliminated) {
        camp.eliminated = true;
        camp.circle.setAlpha(0.3);
        for (const o of camp.totems) o.setTint(0x777777);
      }
    }
  }

  private addObstacle(o: Obstacle): void {
    const s = this.scene;
    const bucket = this.buckets.at(o.x, o.y, () => ({ images: [], canopies: [] }));
    if (o.kind === 'rock') {
      const size = nearestSize(ROCK_SIZES, o.r);
      bucket.images.push(s.add.image(o.x + 3, o.y + 3, 'shadow').setDisplaySize(size * 2.4, size * 1.4).setDepth(DEPTH.shadow).setVisible(false));
      bucket.images.push(s.add.image(o.x, o.y, `rock_${size}_${o.variant}`).setDepth(DEPTH.world + o.y).setVisible(false));
      return;
    }
    const R = nearestSize(CANOPY_SIZES, o.canopyR);
    bucket.images.push(s.add.image(o.x + 7, o.y + 6, `canopyShadow_${R}_${o.variant}`).setDepth(DEPTH.shadow).setVisible(false));
    bucket.images.push(s.add.image(o.x, o.y, 'trunk').setDepth(DEPTH.world + o.y).setVisible(false));
    const cy = o.y - CANOPY_LIFT;
    const sprite = s.add.image(o.x, cy, `canopy_${R}_${o.variant}`).setDepth(DEPTH.canopy + cy).setVisible(false);
    bucket.images.push(sprite);
    bucket.canopies.push({ sprite, x: o.x, y: cy, r: R });
  }

  /** Draw the ground around the view, show only the obstacles near it, and fade canopies the player walks under. */
  update(player: Vec2 | undefined, view: Phaser.Geom.Rectangle): void {
    this.ground.update(view);
    this.buckets.update(
      view,
      (b) => b.images.forEach((img) => img.setVisible(true)),
      (b) => b.images.forEach((img) => img.setVisible(false)),
    );
    // Canopies go see-through when the player walks underneath.
    for (const bucket of this.buckets.visibleBuckets()) {
      for (const c of bucket.canopies) {
        const under = player !== undefined && (player.x - c.x) ** 2 + (player.y - c.y) ** 2 < (c.r + 6) ** 2;
        const target = under ? 0.35 : 1;
        const diff = target - c.sprite.alpha;
        if (diff === 0) continue;
        c.sprite.alpha = Math.abs(diff) < 0.01 ? target : c.sprite.alpha + diff * 0.2;
      }
    }
  }

  destroy(): void {
    this.ground.destroy();
  }
}
