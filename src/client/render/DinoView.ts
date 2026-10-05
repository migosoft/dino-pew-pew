import Phaser from 'phaser';
import type { Dino } from '../../sim/types';
import { getDino } from '../../sim/defs/dinos';
import { angleDiff, localToWorld } from '../../sim/math';
import { mountFrame } from '../../sim/systems/aiming';
import { frameForAngle } from './textures/pixel';
import { DIRS } from './textures';
import { DEPTH } from './depth';
import { CHAINS, chainLength, type ChainSpec } from './chains';

/**
 * Distance (px) walked per leg pose for a dino of radius STRIDE_RADIUS (the Velociraptor). Bigger
 * dinos take longer strides, so their legs swing more slowly and they look heavier.
 */
const STRIDE_PER_POSE = 7;
const STRIDE_RADIUS = 7;
/** Peak height (px) of a leap above the shadow. */
const LEAP_HEIGHT = 10;
/** How far (radians) a tail tip sweeps to each side during a whip, and sways while walking. */
const WHIP_SWING = 1.5;
const TAIL_SWAY = 0.12;
/** A whip runs down the tail: each link lags the one before it by this share of the swing. */
const WHIP_LAG = 0.05;
/** Phase lag (radians) of the walking sway between neighbouring tail links: a wave runs down the tail. */
const SWAY_WAVE = 0.8;
/**
 * Follow-through: each tail link turns toward the direction of the link before it at this
 * rate (per second), so a turning dino's tail swings round behind it, the tip last.
 */
const TRAIL_RATE = 20;
/** How far (px) the head shoots forward during a bite. */
const BITE_REACH = 5;
/** Shadow strength (the per-piece shadow textures of other species use the same). */
const SHADOW_ALPHA = 0.32;
/** Dinos further than this outside the camera view are hidden and not updated (longer than any dino). */
const CULL_MARGIN = 200;

/** What a dino is standing in: shadows vanish in deep water and a ring of foam shows instead. */
export type Wading = 'dry' | 'shallow' | 'deep';

/** A placed part: world position and the angle its art (+x) points to. */
interface Placed {
  x: number;
  y: number;
  angle: number;
}

/** Neck and tail links of a chained species, their shadow stamps, and the render texture they are stamped into. */
interface ChainParts {
  spec: ChainSpec;
  neck: Phaser.GameObjects.Image[];
  tail: Phaser.GameObjects.Image[];
  shadow: Phaser.GameObjects.RenderTexture;
  /** Off-screen stamps in draw order: tail links, body, neck links, head (if any). */
  stamps: Phaser.GameObjects.Image[];
  size: number;
  /** Trailing direction of each tail link (follow-through), and when it was last advanced. */
  trail: number[] | null;
  lastMs: number;
  /** Link lengths, and the placed links reused every frame. */
  neckLens: number[];
  tailLens: number[];
  neckLinks: Placed[];
  tailLinks: Placed[];
  /** Body mask pose, then frame and offset of every stamp, as last drawn into the shadow (skip identical redraws). */
  drawn: Int32Array;
}

/** Stride (px per leg pose) for a dino of this radius: Velociraptor 7, Triceratops ≈10, T-Rex ≈14, Brontosaurus ≈16. */
function strideLen(radius: number): number {
  return STRIDE_PER_POSE * (radius / STRIDE_RADIUS) ** 0.75;
}

/**
 * Walk a chain of links from (x, y): link i points along its angle (already set in `links`)
 * and the next link starts where it ends. Fills in each link's joint; returns the end point in `end`.
 */
function placeChain(x: number, y: number, lens: number[], links: Placed[], end: Placed): void {
  for (let i = 0; i < lens.length; i++) {
    links[i].x = x;
    links[i].y = y;
    x += Math.cos(links[i].angle) * lens[i];
    y += Math.sin(links[i].angle) * lens[i];
  }
  end.x = x;
  end.y = y;
}

const placed = (): Placed => ({ x: 0, y: 0, angle: 0 });

/** Switch texture only when it changes; otherwise just the frame. */
function show(img: Phaser.GameObjects.Image, key: string, frame: number): Phaser.GameObjects.Image {
  return img.texture.key === key ? img.setFrame(frame) : img.setTexture(key, frame);
}

/**
 * Sprites for one dino: shadow, body, head, and — when ridden — armor, rider and weapons.
 * Species in CHAINS have a neck and tail made of links that bend, and one stamped shadow.
 * Fed the interpolated Dino every frame.
 */
export class DinoView {
  private shadow?: Phaser.GameObjects.Image;
  private body: Phaser.GameObjects.Image;
  private head?: Phaser.GameObjects.Image;
  private chain?: ChainParts;
  private foam: Phaser.GameObjects.Image;
  /** Rider armor over the body and head; only species with `<kind>_armor_*` textures have it. */
  private armor?: Phaser.GameObjects.Image;
  private headArmor?: Phaser.GameObjects.Image;
  private rider?: Phaser.GameObjects.Image;
  private weapons: Phaser.GameObjects.Image[];
  /** Parts that scale with a leap and flash white when hit. */
  private parts: Phaser.GameObjects.Image[];
  /** Everything this view shows, for hiding it off screen. */
  private all: (Phaser.GameObjects.Image | Phaser.GameObjects.RenderTexture)[];
  private visible = true;
  private flashing = false;
  /** Texture keys by pose, built once. */
  private bodyKeys: string[];
  private shadowKeys: string[];
  private bodyMaskKeys: string[];
  private headKey: string;
  private headBiteKey: string;
  private headAt = placed();
  private tailEnd = placed();
  /** Body center, leap scale and lift of the current frame (for sx/sy). */
  private cx = 0;
  private cy = 0;
  private scale = 1;
  private lift = 0;
  /** The dino as last drawn. */
  lastView: Dino;

  constructor(scene: Phaser.Scene, d: Dino, palette: string) {
    const def = getDino(d.kind);
    const spec = CHAINS[d.kind];
    this.bodyKeys = [0, 1].map((pose) => `${d.kind}_body_${palette}_${pose}`);
    this.shadowKeys = [0, 1].map((pose) => `${d.kind}_shadow_${pose}`);
    this.bodyMaskKeys = [0, 1].map((pose) => `${d.kind}_bodyMask_${pose}`);
    this.headKey = `${d.kind}_head_${palette}`;
    this.headBiteKey = `${d.kind}_headBite_${palette}`;
    if (spec) {
      const link = (part: string, i: number) => scene.add.image(0, 0, `${d.kind}_${part}${i}_${palette}`, 0);
      const stamp = (key: string) => scene.make.image({ key, frame: 0, add: false });
      const neckSegs = spec.neck?.segs ?? [];
      // Big enough for the head, neck and tail stretched out in any direction.
      const front = (def.head?.offset.x ?? 0) + chainLength(neckSegs) + (spec.neck?.headLen ?? 24);
      const reach = Math.max(front, -(def.tail?.offset.x ?? 0) + chainLength(spec.tail.segs), def.radius * 2);
      const size = 2 * Math.ceil(reach + 24);
      const stamps = [
        ...spec.tail.segs.map((_, i) => stamp(`${d.kind}_tail${i}_mask`)),
        stamp(`${d.kind}_bodyMask_0`),
        ...neckSegs.map((_, i) => stamp(`${d.kind}_neck${i}_mask`)),
        ...(def.head ? [stamp(`${d.kind}_head_mask`)] : []),
      ];
      this.chain = {
        spec,
        neck: neckSegs.map((_, i) => link('neck', i)),
        tail: spec.tail.segs.map((_, i) => link('tail', i)),
        shadow: scene.add.renderTexture(0, 0, size, size).setOrigin(0.5).setDepth(DEPTH.shadow).setAlpha(SHADOW_ALPHA),
        stamps,
        size,
        trail: null,
        lastMs: performance.now(),
        neckLens: neckSegs.map((s) => s.len),
        tailLens: spec.tail.segs.map((s) => s.len),
        neckLinks: neckSegs.map(placed),
        tailLinks: spec.tail.segs.map(placed),
        drawn: new Int32Array(1 + stamps.length * 3).fill(-1),
      };
    } else {
      this.shadow = scene.add.image(0, 0, this.shadowKeys[0], 0).setDepth(DEPTH.shadow);
    }
    this.foam = scene.add.image(0, 0, 'foamRing').setVisible(false);
    this.body = scene.add.image(0, 0, this.bodyKeys[0], 0);
    if (def.head) this.head = scene.add.image(0, 0, this.headKey, 0);
    const ridden = d.playerId !== null;
    if (ridden) {
      const armorKey = `${d.kind}_armor_${palette}`;
      const headArmorKey = `${d.kind}_headArmor_${palette}`;
      if (scene.textures.exists(armorKey)) this.armor = scene.add.image(0, 0, armorKey, 0);
      if (this.head && scene.textures.exists(headArmorKey)) this.headArmor = scene.add.image(0, 0, headArmorKey, 0);
      this.rider = scene.add.image(0, 0, `rider_${palette}`, 0);
    }
    this.weapons = ridden ? def.mounts.map((m) => scene.add.image(0, 0, `weapon_${m.weapon}`, 0)) : [];
    const opt = <T>(x: T | undefined): T[] => (x ? [x] : []);
    this.parts = [this.body, ...opt(this.head), ...opt(this.armor), ...opt(this.headArmor), ...opt(this.rider), ...(this.chain ? [...this.chain.neck, ...this.chain.tail] : [])];
    this.all = [...this.parts, ...this.weapons, ...opt(this.shadow), ...opt(this.chain?.shadow)];
    this.lastView = d;
    this.update(d);
  }

  /** Screen position of a part, spread out from the body center by the leap scale. */
  private sx(px: number): number {
    return Math.round(this.cx + (px - this.cx) * this.scale);
  }

  private sy(py: number): number {
    return Math.round(this.cy + (py - this.cy) * this.scale) - this.lift;
  }

  /** Draw the dino. With a camera `view`, a dino well outside it is just hidden. */
  update(d: Dino, wading: Wading = 'dry', view?: Phaser.Geom.Rectangle, nowMs = performance.now()): void {
    this.lastView = d;
    const { x, y, heading } = d;
    if (view && (x < view.x - CULL_MARGIN || y < view.y - CULL_MARGIN || x > view.right + CULL_MARGIN || y > view.bottom + CULL_MARGIN)) {
      if (this.visible) {
        this.visible = false;
        for (const o of this.all) o.setVisible(false);
        this.foam.setVisible(false);
      }
      return;
    }
    if (!this.visible) {
      this.visible = true;
      for (const o of this.all) o.setVisible(true);
    }
    const def = getDino(d.kind);

    const pose = Math.abs(d.speed) > 2 ? Math.floor(d.stride / strideLen(def.radius)) % 2 : 0;
    const f = frameForAngle(heading, DIRS);
    // Mid-leap the dino rises above its shadow and looks a little bigger.
    const ab = def.ability;
    const h = d.abilityT >= 0 && ab?.kind === 'leap' ? Math.sin(Math.PI * Math.min(1, d.abilityT / ab.duration)) * LEAP_HEIGHT : 0;
    const lift = Math.round(h);
    const scale = 1 + (0.15 * h) / LEAP_HEIGHT;
    this.cx = x;
    this.cy = y;
    this.scale = scale;
    this.lift = lift;
    // Y-sorted with the world; in the air it draws over rocks and dinos below.
    const z = DEPTH.world + y + (lift > 0 ? 40 : 0);
    // In water the shadow falls on the surface: fainter in the shallows, gone in deep water.
    const wet = lift > 0 ? 'dry' : wading;
    const shadowAlpha = wet === 'deep' ? 0 : wet === 'shallow' ? 0.55 : 1;
    if (this.shadow) {
      show(this.shadow, this.shadowKeys[pose], f)
        .setPosition(Math.round(x) + 3, Math.round(y) + 4)
        .setScale(1 - (0.2 * h) / LEAP_HEIGHT)
        .setAlpha(shadowAlpha);
    }
    this.foam
      .setVisible(wet === 'deep')
      .setPosition(Math.round(x), Math.round(y))
      .setScale((def.radius + 5) / 12, (def.radius + 4) / 12)
      .setRotation(heading)
      .setDepth(z - 0.3);

    show(this.body, this.bodyKeys[pose], f).setPosition(Math.round(x), Math.round(y) - lift).setDepth(z);
    this.armor?.setFrame(f).setPosition(Math.round(x), Math.round(y) - lift).setDepth(z + 0.15);

    if (this.chain) this.updateChain(d, z, pose, f, shadowAlpha, h, nowMs);
    if (this.head && def.head && !this.chain?.spec.neck) {
      // A bite thrusts the head forward with the jaws gaping, then snaps them shut.
      const biteU = d.abilityT >= 0 && ab?.kind === 'bite' ? d.abilityT / ab.duration : -1;
      const push = biteU >= 0 ? Math.sin(Math.PI * Math.min(1, biteU)) * BITE_REACH : 0;
      const hp = localToWorld(d, heading, { x: def.head.offset.x + push, y: def.head.offset.y });
      const hf = frameForAngle(heading + d.headYaw, DIRS);
      const gaping = biteU > 0.1 && biteU < 0.5;
      show(this.head, gaping ? this.headBiteKey : this.headKey, hf)
        .setPosition(this.sx(hp.x), this.sy(hp.y))
        .setDepth(def.head.under ? z - 0.05 : z + 0.2);
      this.headArmor?.setFrame(hf).setPosition(this.sx(hp.x), this.sy(hp.y)).setDepth(z + 0.22);
    }

    // The rider looks where the guns point (their mean direction when there are several).
    let aimX = 0;
    let aimY = 0;
    for (let i = 0; i < this.weapons.length; i++) {
      const mf = mountFrame(d, def, i);
      aimX += Math.cos(mf.angle);
      aimY += Math.sin(mf.angle);
      this.weapons[i]
        .setFrame(frameForAngle(mf.angle, DIRS))
        .setPosition(this.sx(mf.x), this.sy(mf.y))
        .setScale(scale)
        .setDepth(z + 0.4);
    }
    if (this.rider) {
      const riderAngle = aimX || aimY ? Math.atan2(aimY, aimX) : heading;
      const rp = localToWorld(d, heading, def.seat ?? { x: -1, y: 0 });
      this.rider
        .setFrame(frameForAngle(riderAngle, DIRS))
        .setPosition(this.sx(rp.x), this.sy(rp.y))
        .setDepth(z + 0.3);
    }

    const flashing = d.hitFlash > 0;
    for (const p of this.parts) p.setScale(scale);
    if (flashing !== this.flashing) {
      this.flashing = flashing;
      for (const p of this.parts) {
        if (flashing) p.setTintFill(0xffffff);
        else p.clearTint();
      }
    }
  }

  /**
   * Bend the neck (if chained) toward where the head looks, the head yaw spread over the
   * links. The tail trails behind turns (each link follows the one before it), sways in a
   * wave while walking, and whips with a lag toward the tip. Links further out draw over the
   * ones before, all below the body. Then stamp the shadow.
   */
  private updateChain(d: Dino, z: number, pose: number, bodyFrame: number, shadowAlpha: number, leapHeight: number, nowMs: number): void {
    const chain = this.chain!;
    const def = getDino(d.kind);
    const { spec, neckLinks, tailLinks } = chain;
    const n = neckLinks.length;
    const neckRoot = localToWorld(d, d.heading, def.head?.offset ?? { x: def.radius, y: 0 });
    for (let i = 0; i < n; i++) neckLinks[i].angle = d.heading + (d.headYaw * (i + 1)) / (n + 1);
    // The head: at the end of a chained neck, or on its usual pivot.
    const headAt = this.headAt;
    placeChain(neckRoot.x, neckRoot.y, chain.neckLens, neckLinks, headAt);
    headAt.angle = d.heading + d.headYaw;

    // Follow-through: link 0 eases toward straight behind the body, each further link toward the one before it.
    const m = tailLinks.length;
    const dt = Math.min(0.1, Math.max(0, (nowMs - chain.lastMs) / 1000));
    chain.lastMs = nowMs;
    const behind = d.heading + Math.PI;
    const trail = (chain.trail ??= tailLinks.map(() => behind));
    const ease = 1 - Math.exp(-TRAIL_RATE * dt);
    for (let i = 0; i < m; i++) trail[i] += angleDiff(i === 0 ? behind : trail[i - 1], trail[i]) * ease;
    const ab = def.ability;
    const whipT = d.abilityT >= 0 && ab?.kind === 'whip' ? d.abilityT / ab.duration : -1;
    const moving = Math.abs(d.speed) > 2;
    for (let i = 0; i < m; i++) {
      const reach = (i + 1) / m;
      const t = whipT - i * WHIP_LAG;
      const whip = whipT >= 0 && t > 0 && t < 1 ? Math.sin(Math.PI * 2 * t) * WHIP_SWING * reach ** 1.2 : 0;
      const sway = moving ? Math.sin((d.stride / strideLen(def.radius)) * (STRIDE_PER_POSE / 9) - i * SWAY_WAVE) * TAIL_SWAY * (0.4 + reach) : 0;
      tailLinks[i].angle = trail[i] + whip + sway;
    }
    const tailRoot = localToWorld(d, d.heading, def.tail?.offset ?? { x: -def.radius, y: 0 });
    placeChain(tailRoot.x, tailRoot.y, chain.tailLens, tailLinks, this.tailEnd);

    // Mid-leap the links rise and spread out with the body (sx, sy).
    const put = (img: Phaser.GameObjects.Image, p: Placed, depth: number) =>
      img.setFrame(frameForAngle(p.angle, DIRS)).setPosition(this.sx(p.x), this.sy(p.y)).setDepth(depth);
    for (let i = 0; i < n; i++) put(chain.neck[i], neckLinks[i], z - 0.09 + i * 0.005);
    if (this.head && spec.neck) put(this.head, headAt, z - 0.05);
    for (let i = 0; i < m; i++) put(chain.tail[i], tailLinks[i], z - 0.2 + i * 0.005);

    // One shadow for the whole silhouette: opaque stamps into a texture shown at shadow strength.
    // Mid-leap it stays on the ground and shrinks, like the single shadows of other species.
    const rt = chain.shadow;
    rt.setPosition(Math.round(d.x) + 3, Math.round(d.y) + 4)
      .setAlpha(SHADOW_ALPHA * shadowAlpha)
      .setScale(1 - (0.2 * leapHeight) / LEAP_HEIGHT);
    if (shadowAlpha <= 0) return;
    // Stamps in draw order: tail links, body, neck links, head. Redraw only if any of them changed.
    const half = chain.size / 2;
    const drawn = chain.drawn;
    let changed = drawn[0] !== pose;
    drawn[0] = pose;
    let k = 0;
    const stampAt = (px: number, py: number, frame: number) => {
      const ox = Math.round(px - d.x) + half;
      const oy = Math.round(py - d.y) + half;
      const o = 1 + k * 3;
      if (drawn[o] !== frame || drawn[o + 1] !== ox || drawn[o + 2] !== oy) {
        changed = true;
        drawn[o] = frame;
        drawn[o + 1] = ox;
        drawn[o + 2] = oy;
        chain.stamps[k].setFrame(frame).setPosition(ox, oy);
      }
      k++;
    };
    for (let i = 0; i < m; i++) stampAt(tailLinks[i].x, tailLinks[i].y, frameForAngle(tailLinks[i].angle, DIRS));
    if (chain.stamps[m].texture.key !== this.bodyMaskKeys[pose]) chain.stamps[m].setTexture(this.bodyMaskKeys[pose], bodyFrame);
    stampAt(d.x, d.y, bodyFrame);
    for (let i = 0; i < n; i++) stampAt(neckLinks[i].x, neckLinks[i].y, frameForAngle(neckLinks[i].angle, DIRS));
    if (def.head) stampAt(headAt.x, headAt.y, frameForAngle(headAt.angle, DIRS));
    if (changed) rt.clear().draw(chain.stamps);
  }

  destroy(): void {
    const chain = this.chain;
    for (const s of [this.shadow, this.foam, this.body, this.head, this.armor, this.headArmor, this.rider, ...this.weapons]) s?.destroy();
    if (chain) for (const s of [...chain.neck, ...chain.tail, ...chain.stamps, chain.shadow]) s.destroy();
  }
}
