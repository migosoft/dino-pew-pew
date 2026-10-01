import Phaser from 'phaser';
import type { Dino, World } from '../../sim/types';
import { Tile } from '../../sim/types';
import { getDino } from '../../sim/defs/dinos';
import { isAirborne, tileAt } from '../../sim/world';
import { frameForAngle, hash2 } from './textures/pixel';
import { FISH_DIRS } from './textures';
import { RIPPLE_R, WAVE_VARIANTS } from './textures/waterArt';
import { DEPTH } from './depth';
import type { Wading } from './DinoView';

// The living water, all client-side and purely cosmetic: wave crests that shimmer and
// drift, fish shadows that swim in deep water and dart away from dinos, and ripple rings
// from footsteps, wakes and splashes.

/** Wave points are bucketed in cells this big, so only the visible ones are drawn. */
const CELL = 96;
const WAVE_SPACING = 11;
/** Fish live in deep water around the camera: about one per this many square pixels of it. */
const FISH_AREA = 9000;
const MAX_FISH = 24;
const FISH_MARGIN = 120;
const FISH_SPEED = 12;
const FISH_DART_SPEED = 75;
/** Fish dart away from dinos and fresh ripples this close. */
const FISH_SCARE = 42;
const MAX_RIPPLES = 160;
/** Seconds between wake ripples behind a dino moving through deep water. */
const WAKE_INTERVAL = 0.12;
/** Seconds between the slow rings around a dino standing in deep water. */
const IDLE_RING_INTERVAL = 1.3;

interface WavePoint {
  x: number;
  y: number;
  deep: boolean;
  variant: number;
  phase: number;
  speed: number;
}

interface Fish {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  heading: number;
  turn: number;
  /** Seconds left darting away. */
  dart: number;
  big: 0 | 1;
  wiggle: number;
}

interface Ripple {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  age: number;
  life: number;
  from: number;
  to: number;
  alpha: number;
  /** Ellipse stretch along `angle` (wakes are long). */
  stretch: number;
  angle: number;
}

interface Walker {
  stride: number;
  foot: number;
  wake: number;
  idle: number;
}

export function wadingOf(world: World, d: Dino): Wading {
  if (isAirborne(d)) return 'dry';
  const t = tileAt(world, d.x, d.y);
  return t === Tile.Deep ? 'deep' : t === Tile.Shallow ? 'shallow' : 'dry';
}

export class WaterView {
  private cells = new Map<number, WavePoint[]>();
  private cols: number;
  private wavePool: Phaser.GameObjects.Image[] = [];
  private fish: Fish[] = [];
  private ripples: Ripple[] = [];
  private ripplePool: Phaser.GameObjects.Image[] = [];
  private walkers = new Map<number, Walker>();
  private droplets: Phaser.GameObjects.Particles.ParticleEmitter;
  private time = 0;
  /** Smoothed share of deep water around the camera (sets how many fish there are). */
  private deepShare = 0;

  constructor(private scene: Phaser.Scene, private world: World) {
    this.cols = Math.ceil(world.width / CELL);
    // Scatter wave points over the water, a little denser in deep water.
    for (let y = WAVE_SPACING / 2; y < world.height; y += WAVE_SPACING) {
      for (let x = WAVE_SPACING / 2; x < world.width; x += WAVE_SPACING) {
        const h = hash2(x, y, world.seed);
        const px = x + (hash2(x, y, world.seed + 1) - 0.5) * WAVE_SPACING;
        const py = y + (hash2(x, y, world.seed + 2) - 0.5) * WAVE_SPACING;
        const t = tileAt(world, px, py);
        if (t !== Tile.Deep && t !== Tile.Shallow) continue;
        const deep = t === Tile.Deep;
        if (h > (deep ? 0.75 : 0.5)) continue;
        // Keep crests off the foam line at the shore.
        if ([-4, 4].some((o) => tileAt(world, px + o, py) !== t || tileAt(world, px, py + o) !== t)) continue;
        const key = Math.floor(py / CELL) * this.cols + Math.floor(px / CELL);
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, (list = []));
        list.push({ x: px, y: py, deep, variant: Math.floor(h * 97) % WAVE_VARIANTS, phase: h * 40, speed: 0.9 + hash2(x, y, world.seed + 3) * 1.1 });
      }
    }
    this.droplets = scene.add
      .particles(0, 0, 'droplet', {
        speed: { min: 20, max: 60 },
        angle: { min: 200, max: 340 },
        gravityY: 160,
        lifespan: { min: 220, max: 420 },
        alpha: { start: 1, end: 0.2 },
        emitting: false,
      })
      .setDepth(DEPTH.fx - 2);
  }

  /** Advance and draw everything near the camera. `dinos` are the interpolated dinos this frame. */
  update(dtMs: number, dinos: Dino[]): void {
    const dt = Math.min(0.1, dtMs / 1000);
    this.time += dt;
    const view = this.scene.cameras.main.worldView;
    this.drawWaves(view);
    this.trackDinos(dinos, dt);
    this.updateFish(view, dinos, dt);
    this.updateRipples(dt);
  }

  /** A ring of ripples and a spray of droplets (leap landings, whips, dashes, bolts). */
  splash(x: number, y: number, size: number): void {
    if (tileAt(this.world, x, y) !== Tile.Deep && tileAt(this.world, x, y) !== Tile.Shallow) return;
    this.ripple(x, y, size * 0.3, size, 0.7, 0.9);
    this.ripple(x, y, size * 0.15, size * 0.6, 0.5, 0.8);
    this.droplets.explode(Math.round(4 + size / 3), x, y);
  }

  isWet(x: number, y: number): boolean {
    const t = tileAt(this.world, x, y);
    return t === Tile.Deep || t === Tile.Shallow;
  }

  private drawWaves(view: Phaser.Geom.Rectangle): void {
    const c0 = Math.max(0, Math.floor(view.x / CELL));
    const c1 = Math.min(this.cols - 1, Math.floor(view.right / CELL));
    const r0 = Math.max(0, Math.floor(view.y / CELL));
    const r1 = Math.floor(view.bottom / CELL);
    let used = 0;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const list = this.cells.get(r * this.cols + c);
        if (!list) continue;
        for (const w of list) {
          // Each crest swells and fades on its own beat while drifting with the wind.
          const s = Math.sin(this.time * w.speed + w.phase);
          if (s < 0.15) continue;
          const img = this.wavePool[used] ?? (this.wavePool[used] = this.scene.add.image(0, 0, 'wave_0_deep').setDepth(DEPTH.water + 2));
          used++;
          const drift = Math.sin(this.time * 0.5 + w.phase * 0.3) * 2.5;
          img
            .setTexture(`wave_${w.variant}_${w.deep ? 'deep' : 'shallow'}`)
            .setPosition(Math.round(w.x + drift), Math.round(w.y - s))
            .setAlpha((s - 0.15) * (w.deep ? 0.95 : 0.75))
            .setVisible(true);
        }
      }
    }
    for (let i = used; i < this.wavePool.length; i++) this.wavePool[i].setVisible(false);
  }

  /** Footstep rings, wakes and idle rings for every dino in the water. */
  private trackDinos(dinos: Dino[], dt: number): void {
    const seen = new Set<number>();
    for (const d of dinos) {
      seen.add(d.id);
      let w = this.walkers.get(d.id);
      if (!w) this.walkers.set(d.id, (w = { stride: d.stride, foot: 0, wake: 0, idle: 0 }));
      const wading = wadingOf(this.world, d);
      const def = getDino(d.kind);
      if (wading === 'dry') {
        w.stride = d.stride;
        continue;
      }
      const r = def.radius;
      const cos = Math.cos(d.heading);
      const sin = Math.sin(d.heading);
      // One ring per footstep, alternating left and right feet.
      const stepLen = r * 0.9;
      if (d.stride - w.stride >= stepLen) {
        w.stride = d.stride;
        w.foot = 1 - w.foot;
        const side = w.foot ? 1 : -1;
        const fx = d.x + cos * r * 0.4 - sin * side * r * 0.6;
        const fy = d.y + sin * r * 0.4 + cos * side * r * 0.6;
        const big = r / RIPPLE_R;
        this.ripple(fx, fy, big * 0.25, big * (wading === 'deep' ? 1.2 : 1.5), wading === 'deep' ? 0.45 : 0.75, 0.7 + r * 0.03);
      } else if (d.stride < w.stride) w.stride = d.stride;
      if (wading !== 'deep') continue;
      // A V of wake behind a moving dino, a slow ring around a standing one.
      w.wake -= dt;
      w.idle -= dt;
      if (Math.abs(d.speed) > 6 && w.wake <= 0) {
        w.wake = WAKE_INTERVAL;
        for (const side of [-1, 1]) {
          const bx = d.x - cos * r * 0.9 - sin * side * r * 0.7;
          const by = d.y - sin * r * 0.9 + cos * side * r * 0.7;
          this.ripple(bx, by, 0.3, (r / RIPPLE_R) * 0.9, 0.4, 0.8, 1.8, d.heading);
        }
      } else if (Math.abs(d.speed) <= 6 && w.idle <= 0) {
        w.idle = IDLE_RING_INTERVAL;
        this.ripple(d.x, d.y, (r + 3) / RIPPLE_R, (r + 12) / RIPPLE_R, 0.35, 1.4);
      }
    }
    for (const id of this.walkers.keys()) if (!seen.has(id)) this.walkers.delete(id);
  }

  private ripple(x: number, y: number, from: number, to: number, alpha: number, life: number, stretch = 1, angle = 0): void {
    if (this.ripples.length >= MAX_RIPPLES) this.recycle(this.ripples.shift()!);
    const img = this.ripplePool.pop() ?? this.scene.add.image(0, 0, 'ripple').setDepth(DEPTH.water + 3);
    img.setVisible(true).setPosition(Math.round(x), Math.round(y)).setRotation(angle);
    this.ripples.push({ img, x, y, age: 0, life, from, to, alpha, stretch, angle });
  }

  private recycle(r: Ripple): void {
    r.img.setVisible(false);
    this.ripplePool.push(r.img);
  }

  private updateRipples(dt: number): void {
    const keep: Ripple[] = [];
    for (const r of this.ripples) {
      r.age += dt;
      if (r.age >= r.life) {
        this.recycle(r);
        continue;
      }
      const t = r.age / r.life;
      // Fast at first, then slowing: like a real ring spreading out.
      const s = r.from + (r.to - r.from) * (1 - (1 - t) ** 2);
      r.img.setScale(s * r.stretch, s).setAlpha(r.alpha * (1 - t));
      keep.push(r);
    }
    this.ripples = keep;
  }

  private deep(x: number, y: number): boolean {
    return tileAt(this.world, x, y) === Tile.Deep;
  }

  private updateFish(view: Phaser.Geom.Rectangle, dinos: Dino[], dt: number): void {
    const x0 = view.x - FISH_MARGIN;
    const y0 = view.y - FISH_MARGIN;
    const w = view.width + FISH_MARGIN * 2;
    const h = view.height + FISH_MARGIN * 2;
    // Fish that drifted far from the camera go away; new ones turn up in deep water nearby.
    this.fish = this.fish.filter((f) => {
      const away = f.x < x0 - 60 || f.y < y0 - 60 || f.x > x0 + w + 60 || f.y > y0 + h + 60;
      if (away) f.img.destroy();
      return !away;
    });
    let deep = 0;
    for (let k = 0; k < 24; k++) if (this.deep(x0 + Math.random() * w, y0 + Math.random() * h)) deep++;
    this.deepShare += (deep / 24 - this.deepShare) * 0.05;
    const want = Math.min(MAX_FISH, Math.round((this.deepShare * w * h) / FISH_AREA));
    for (let k = 0; k < 6 && this.fish.length < want; k++) {
      const fx = x0 + Math.random() * w;
      const fy = y0 + Math.random() * h;
      if (!this.deep(fx, fy) || !this.deep(fx + 8, fy) || !this.deep(fx - 8, fy)) continue;
      const big = Math.random() < 0.3 ? 1 : 0;
      const img = this.scene.add.image(fx, fy, `fish_0_${big}`, 0).setDepth(DEPTH.water + 1);
      this.fish.push({ img, x: fx, y: fy, heading: Math.random() * Math.PI * 2, turn: 0, dart: 0, big, wiggle: Math.random() * 10 });
    }

    for (const f of this.fish) {
      // Scared by dinos and by fresh ripples.
      let threat: { x: number; y: number } | undefined;
      for (const d of dinos) {
        const reach = FISH_SCARE + getDino(d.kind).radius;
        if ((d.x - f.x) ** 2 + (d.y - f.y) ** 2 < reach * reach) threat = d;
      }
      if (!threat) for (const r of this.ripples) if (r.age < 0.2 && (r.x - f.x) ** 2 + (r.y - f.y) ** 2 < FISH_SCARE * FISH_SCARE) threat = r;
      if (threat && f.dart <= 0) {
        f.dart = 0.5 + Math.random() * 0.4;
        f.heading = Math.atan2(f.y - threat.y, f.x - threat.x) + (Math.random() - 0.5) * 0.8;
      }
      if (f.dart <= 0 && Math.random() < dt * 0.8) f.turn = (Math.random() - 0.5) * 2.2;
      f.heading += f.turn * dt;
      f.dart = Math.max(0, f.dart - dt);
      const speed = f.dart > 0 ? FISH_DART_SPEED : FISH_SPEED;
      // Turn back before leaving deep water.
      const ahead = 10;
      if (!this.deep(f.x + Math.cos(f.heading) * ahead, f.y + Math.sin(f.heading) * ahead)) {
        f.heading += Math.PI * (0.6 + Math.random() * 0.5);
        f.turn = -f.turn;
      } else {
        f.x += Math.cos(f.heading) * speed * dt;
        f.y += Math.sin(f.heading) * speed * dt;
      }
      f.wiggle += dt * (f.dart > 0 ? 18 : 6);
      f.img
        .setTexture(`fish_${Math.floor(f.wiggle) % 2}_${f.big}`, frameForAngle(f.heading, FISH_DIRS))
        .setPosition(Math.round(f.x), Math.round(f.y));
    }
  }

  destroy(): void {
    for (const f of this.fish) f.img.destroy();
    for (const img of this.wavePool) img.destroy();
    for (const r of this.ripples) r.img.destroy();
    for (const img of this.ripplePool) img.destroy();
    this.droplets.destroy();
  }
}
