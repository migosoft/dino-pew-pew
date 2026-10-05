import Phaser from 'phaser';
import type { World } from '../../sim/types';
import { drawGroundChunk } from './textures/worldArt';
import { DEPTH } from './depth';

/** Ground chunk size in px: one takes about 10 ms to draw. */
export const CHUNK = 256;
/** Time per frame for drawing chunks ahead of the camera (chunks under the camera are always drawn at once). */
const FRAME_BUDGET_MS = 6;
/** Chunks this far outside the view (in chunks) are dropped. */
const KEEP = 3;

/** The 8192 px ground drawn lazily in chunks around the camera, since one texture that size won't fit on a GPU. */
export class GroundChunks {
  private live = new Map<number, Phaser.GameObjects.Image>();
  private readonly cols: number;
  private readonly rows: number;

  constructor(private scene: Phaser.Scene, private world: World) {
    this.cols = Math.ceil(world.width / CHUNK);
    this.rows = Math.ceil(world.height / CHUNK);
  }

  private key(i: number): string {
    return `ground_${this.world.seed}_${this.world.cols}_${i}`;
  }

  private draw(i: number): void {
    const cx = i % this.cols;
    const cy = Math.floor(i / this.cols);
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const w = Math.min(CHUNK, this.world.width - x0);
    const h = Math.min(CHUNK, this.world.height - y0);
    const key = this.key(i);
    if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, drawGroundChunk(this.world, x0, y0, w, h));
    this.live.set(i, this.scene.add.image(x0, y0, key).setOrigin(0, 0).setDepth(DEPTH.ground));
  }

  update(view: Phaser.Geom.Rectangle): void {
    const c0 = Math.max(0, Math.floor(view.x / CHUNK));
    const c1 = Math.min(this.cols - 1, Math.floor(view.right / CHUNK));
    const r0 = Math.max(0, Math.floor(view.y / CHUNK));
    const r1 = Math.min(this.rows - 1, Math.floor(view.bottom / CHUNK));
    // Under the camera: draw now, whatever it costs (no holes in the ground).
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (!this.live.has(r * this.cols + c)) this.draw(r * this.cols + c);
    // One chunk of margin all round, nearest first, within the frame budget.
    const t0 = performance.now();
    const cx = (c0 + c1) / 2;
    const cy = (r0 + r1) / 2;
    const want: number[] = [];
    for (let r = Math.max(0, r0 - 1); r <= Math.min(this.rows - 1, r1 + 1); r++) {
      for (let c = Math.max(0, c0 - 1); c <= Math.min(this.cols - 1, c1 + 1); c++) if (!this.live.has(r * this.cols + c)) want.push(r * this.cols + c);
    }
    want.sort((a, b) => Math.hypot((a % this.cols) - cx, Math.floor(a / this.cols) - cy) - Math.hypot((b % this.cols) - cx, Math.floor(b / this.cols) - cy));
    for (const i of want) {
      if (performance.now() - t0 > FRAME_BUDGET_MS) break;
      this.draw(i);
    }
    for (const [i, img] of this.live) {
      const c = i % this.cols;
      const r = Math.floor(i / this.cols);
      if (c >= c0 - KEEP && c <= c1 + KEEP && r >= r0 - KEEP && r <= r1 + KEEP) continue;
      img.destroy();
      this.scene.textures.remove(this.key(i));
      this.live.delete(i);
    }
  }

  destroy(): void {
    for (const [i, img] of this.live) {
      img.destroy();
      this.scene.textures.remove(this.key(i));
    }
    this.live.clear();
  }
}
