import Phaser from 'phaser';
import type { Obstacle, Vec2, World } from '../../sim/types';
import { BASE_RADIUS } from '../../sim/players';
import type { TeamInfo } from '../../net/protocol';
import { TEAM_COLORS } from '../teams';
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
  /** Claimed base camps: slot -> team id + decoration objects. */
  private camps = new Map<number, { team: string; objects: Phaser.GameObjects.GameObject[] }>();

  constructor(private scene: Phaser.Scene, world: World) {
    this.groundKey = `ground_${world.seed}`;
    if (!scene.textures.exists(this.groundKey)) scene.textures.addCanvas(this.groundKey, drawGround(world));
    scene.add.image(0, 0, this.groundKey).setOrigin(0, 0).setDepth(DEPTH.ground);
    for (const o of world.obstacles) this.addObstacle(o);
    // Every campsite has a ring of marker stones; claimed ones get team totems (updateBases).
    for (const b of world.bases) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2 + 0.13;
        const x = Math.round(b.x + Math.cos(a) * BASE_RADIUS);
        const y = Math.round(b.y + Math.sin(a) * BASE_RADIUS);
        scene.add.image(x, y, 'campStone').setDepth(DEPTH.world + y);
      }
    }
  }

  /** Show totems and a team-colored boundary for each claimed base camp. */
  updateBases(teams: TeamInfo[]): void {
    for (const [slot, camp] of this.camps) {
      if (teams.some((t) => t.slot === slot && t.id === camp.team)) continue;
      for (const o of camp.objects) o.destroy();
      this.camps.delete(slot);
    }
    for (const t of teams) {
      if (this.camps.has(t.slot)) continue;
      const objects: Phaser.GameObjects.GameObject[] = [];
      const g = this.scene.add.graphics().setDepth(DEPTH.decal);
      g.fillStyle(TEAM_COLORS[t.slot], 0.08).fillCircle(t.base.x, t.base.y, BASE_RADIUS);
      for (let k = 0; k < 96; k++) {
        if (k % 3 === 2) continue;
        const a = (k / 96) * Math.PI * 2;
        g.fillStyle(TEAM_COLORS[t.slot], 0.55).fillRect(Math.round(t.base.x + Math.cos(a) * BASE_RADIUS), Math.round(t.base.y + Math.sin(a) * BASE_RADIUS), 1, 1);
      }
      objects.push(g);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.5;
        const x = Math.round(t.base.x + Math.cos(a) * (BASE_RADIUS - 10));
        const y = Math.round(t.base.y + Math.sin(a) * (BASE_RADIUS - 10));
        objects.push(this.scene.add.image(x, y, `totem_t${t.slot}`).setOrigin(0.5, 0.85).setDepth(DEPTH.world + y));
      }
      this.camps.set(t.slot, { team: t.id, objects });
    }
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
      const diff = target - c.sprite.alpha;
      if (diff === 0) continue;
      c.sprite.alpha = Math.abs(diff) < 0.01 ? target : c.sprite.alpha + diff * 0.2;
    }
  }

  destroy(): void {
    this.scene.textures.remove(this.groundKey);
  }
}
