import type Phaser from 'phaser';

/** Bucket size in px: sprites are shown or hidden a bucket at a time. */
const BUCKET = 512;
/** Buckets this close to the view (px) count as visible. */
const BUCKET_MARGIN = 64;

/** Items of any kind grouped by position into 512 px buckets, with a diff of which buckets the view touches. */
export class BucketGrid<T> {
  private readonly cols: number;
  private readonly rows: number;
  private buckets = new Map<number, T>();
  private visible = new Set<number>();

  constructor(width: number, height: number) {
    this.cols = Math.ceil(width / BUCKET);
    this.rows = Math.ceil(height / BUCKET);
  }

  /** The bucket holding (x, y), created with `make` on first use. */
  at(x: number, y: number, make: () => T): T {
    const bx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / BUCKET)));
    const by = Math.min(this.rows - 1, Math.max(0, Math.floor(y / BUCKET)));
    const key = by * this.cols + bx;
    let b = this.buckets.get(key);
    if (b === undefined) this.buckets.set(key, (b = make()));
    return b;
  }

  /** Buckets currently visible, in no particular order. */
  *visibleBuckets(): Iterable<T> {
    for (const k of this.visible) {
      const b = this.buckets.get(k);
      if (b !== undefined) yield b;
    }
  }

  /** Work out the buckets near `view`, calling `show` / `hide` on those that entered / left. */
  update(view: Phaser.Geom.Rectangle, show: (b: T) => void, hide: (b: T) => void): void {
    const bx0 = Math.max(0, Math.floor((view.x - BUCKET_MARGIN) / BUCKET));
    const bx1 = Math.min(this.cols - 1, Math.floor((view.right + BUCKET_MARGIN) / BUCKET));
    const by0 = Math.max(0, Math.floor((view.y - BUCKET_MARGIN) / BUCKET));
    const by1 = Math.min(this.rows - 1, Math.floor((view.bottom + BUCKET_MARGIN) / BUCKET));
    const now = new Set<number>();
    for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) now.add(by * this.cols + bx);
    for (const k of this.visible) {
      const b = this.buckets.get(k);
      if (!now.has(k) && b !== undefined) hide(b);
    }
    for (const k of now) {
      const b = this.buckets.get(k);
      if (!this.visible.has(k) && b !== undefined) show(b);
    }
    this.visible = now;
  }
}
