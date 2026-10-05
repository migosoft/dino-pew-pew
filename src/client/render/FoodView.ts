import Phaser from 'phaser';
import type { FoodSource } from '../../sim/types';
import type { CarcassTuple, PlantTuple } from '../../net/protocol';
import { frameForAngle } from './textures/pixel';
import { CARCASS_DIRS } from './textures';
import { DEPTH } from './depth';
import { CARCASS_KINDS } from './textures/foodArt';

/** Plant sprites are shown or hidden in buckets of this many px. */
const BUCKET = 512;
/** Buckets this close to the view (px) count as visible. */
const BUCKET_MARGIN = 64;

/** 0 = full, 1 = half eaten, 2 = nearly gone. */
function stageOf(food: number, maxFood: number): 0 | 1 | 2 {
  const f = maxFood > 0 ? food / maxFood : 0;
  return f > 0.6 ? 0 : f > 0.25 ? 1 : 2;
}

/**
 * Bushes, fern patches and carcasses. Plants come from the (client-generated) world and
 * only their food level changes; carcasses come and go with the server's carcass list.
 * Trees are food too but their look doesn't change.
 */
export class FoodView {
  private plants = new Map<number, { src: FoodSource; sprite: Phaser.GameObjects.Image; stage: number }>();
  private buckets = new Map<number, Phaser.GameObjects.Image[]>();
  private visible = new Set<number>();
  private readonly bucketCols: number;
  private readonly bucketRows: number;
  private carcasses = new Map<number, { sprite: Phaser.GameObjects.Image; stage: number; species: string }>();

  constructor(private scene: Phaser.Scene, food: FoodSource[], worldWidth: number, worldHeight: number) {
    this.bucketCols = Math.ceil(worldWidth / BUCKET);
    this.bucketRows = Math.ceil(worldHeight / BUCKET);
    for (const f of food) {
      if (f.kind !== 'bush' && f.kind !== 'fern') continue;
      const src = { ...f };
      const sprite = scene.add.image(Math.round(f.x), Math.round(f.y), `${f.kind}_${f.variant}_0`).setVisible(false);
      const bx = Math.min(this.bucketCols - 1, Math.max(0, Math.floor(f.x / BUCKET)));
      const by = Math.min(this.bucketRows - 1, Math.max(0, Math.floor(f.y / BUCKET)));
      const list = this.buckets.get(by * this.bucketCols + bx);
      if (list) list.push(sprite);
      else this.buckets.set(by * this.bucketCols + bx, [sprite]);
      // Bushes stand up (y-sorted); fern patches hug the ground.
      sprite.setDepth(f.kind === 'bush' ? DEPTH.world + f.y : DEPTH.decal + 1);
      this.plants.set(f.id, { src, sprite, stage: 0 });
    }
  }

  /** Show only the plants in 512 px buckets near the view. */
  cull(view: Phaser.Geom.Rectangle): void {
    const bx0 = Math.max(0, Math.floor((view.x - BUCKET_MARGIN) / BUCKET));
    const bx1 = Math.min(this.bucketCols - 1, Math.floor((view.right + BUCKET_MARGIN) / BUCKET));
    const by0 = Math.max(0, Math.floor((view.y - BUCKET_MARGIN) / BUCKET));
    const by1 = Math.min(this.bucketRows - 1, Math.floor((view.bottom + BUCKET_MARGIN) / BUCKET));
    const now = new Set<number>();
    for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) now.add(by * this.bucketCols + bx);
    for (const k of this.visible) if (!now.has(k)) for (const s of this.buckets.get(k) ?? []) s.setVisible(false);
    for (const k of now) if (!this.visible.has(k)) for (const s of this.buckets.get(k) ?? []) s.setVisible(true);
    this.visible = now;
  }

  setPlants(levels: PlantTuple[]): void {
    for (const [id, food] of levels) {
      const p = this.plants.get(id);
      if (!p) continue;
      p.src.food = food;
      const stage = stageOf(food, p.src.maxFood);
      if (stage !== p.stage) {
        p.stage = stage;
        p.sprite.setTexture(`${p.src.kind}_${p.src.variant}_${stage}`);
      }
    }
  }

  /** Add new carcasses and update changed ones. */
  upsertCarcasses(list: CarcassTuple[]): void {
    for (const [id, species, x, y, heading, food, maxFood] of list) {
      const stage = stageOf(food, maxFood);
      const kind = (CARCASS_KINDS as readonly string[]).includes(species) ? species : 'triceratops';
      let c = this.carcasses.get(id);
      if (!c) {
        const sprite = this.scene.add.image(x, y, `carcass_${kind}_${stage}`, frameForAngle(heading / 100, CARCASS_DIRS)).setDepth(DEPTH.decal + 2);
        c = { sprite, stage, species: kind };
        this.carcasses.set(id, c);
      } else if (c.stage !== stage) {
        c.stage = stage;
        c.sprite.setTexture(`carcass_${kind}_${stage}`, c.sprite.frame.name);
      }
    }
  }

  removeCarcasses(ids: number[]): void {
    for (const id of ids) {
      this.carcasses.get(id)?.sprite.destroy();
      this.carcasses.delete(id);
    }
  }
}
