import Phaser from 'phaser';
import type { Dino, Vec2 } from '../../sim/types';
import { getDino } from '../../sim/defs/dinos';
import { angleDiff, localToWorld } from '../../sim/math';
import { mountFrame } from '../../sim/systems/aiming';
import { frameForAngle } from './textures/pixel';
import { DIRS } from './textures';
import { DEPTH } from './depth';
import { CHAINS, chainLength, type ChainSpec } from './chains';

const STRIDE_PER_POSE = 7;
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
}

/**
 * Walk a chain of links from `root`: link i points along angles[i] and the next link starts
 * where it ends. Returns each link's joint and angle, plus the end point.
 */
function placeChain(root: Vec2, lens: number[], angles: number[]): { links: Placed[]; end: Vec2 } {
  const links: Placed[] = [];
  let x = root.x;
  let y = root.y;
  lens.forEach((len, i) => {
    links.push({ x, y, angle: angles[i] });
    x += Math.cos(angles[i]) * len;
    y += Math.sin(angles[i]) * len;
  });
  return { links, end: { x, y } };
}

/**
 * Sprites for one dino: shadow, body, head, and — when ridden — armor, rider and weapons.
 * Species in CHAINS have a neck and tail made of links that bend, and one stamped shadow.
 * Fed a fresh interpolated Dino every frame.
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
  /** The dino as last drawn. */
  lastView: Dino;

  constructor(scene: Phaser.Scene, d: Dino, private palette: string) {
    const def = getDino(d.kind);
    const spec = CHAINS[d.kind];
    if (spec) {
      const link = (part: string, i: number) => scene.add.image(0, 0, `${d.kind}_${part}${i}_${palette}`, 0);
      const stamp = (key: string) => scene.make.image({ key, frame: 0, add: false });
      const neckSegs = spec.neck?.segs ?? [];
      // Big enough for the head, neck and tail stretched out in any direction.
      const front = (def.head?.offset.x ?? 0) + chainLength(neckSegs) + (spec.neck?.headLen ?? 24);
      const reach = Math.max(front, -(def.tail?.offset.x ?? 0) + chainLength(spec.tail.segs), def.radius * 2);
      const size = 2 * Math.ceil(reach + 24);
      this.chain = {
        spec,
        neck: neckSegs.map((_, i) => link('neck', i)),
        tail: spec.tail.segs.map((_, i) => link('tail', i)),
        shadow: scene.add.renderTexture(0, 0, size, size).setOrigin(0.5).setDepth(DEPTH.shadow).setAlpha(SHADOW_ALPHA),
        stamps: [
          ...spec.tail.segs.map((_, i) => stamp(`${d.kind}_tail${i}_mask`)),
          stamp(`${d.kind}_bodyMask_0`),
          ...neckSegs.map((_, i) => stamp(`${d.kind}_neck${i}_mask`)),
          ...(def.head ? [stamp(`${d.kind}_head_mask`)] : []),
        ],
        size,
        trail: null,
        lastMs: performance.now(),
      };
    } else {
      this.shadow = scene.add.image(0, 0, `${d.kind}_shadow_0`, 0).setDepth(DEPTH.shadow);
    }
    this.foam = scene.add.image(0, 0, 'foamRing').setVisible(false);
    this.body = scene.add.image(0, 0, `${d.kind}_body_${palette}_0`, 0);
    if (def.head) this.head = scene.add.image(0, 0, `${d.kind}_head_${palette}`, 0);
    const ridden = d.playerId !== null;
    if (ridden) {
      const armorKey = `${d.kind}_armor_${palette}`;
      const headArmorKey = `${d.kind}_headArmor_${palette}`;
      if (scene.textures.exists(armorKey)) this.armor = scene.add.image(0, 0, armorKey, 0);
      if (this.head && scene.textures.exists(headArmorKey)) this.headArmor = scene.add.image(0, 0, headArmorKey, 0);
      this.rider = scene.add.image(0, 0, `rider_${palette}`, 0);
    }
    this.weapons = ridden ? def.mounts.map((m) => scene.add.image(0, 0, `weapon_${m.weapon}`, 0)) : [];
    this.lastView = d;
    this.update(d);
  }

  update(d: Dino, wading: Wading = 'dry'): void {
    this.lastView = d;
    const def = getDino(d.kind);
    const { x, y, heading } = d;

    const pose = Math.abs(d.speed) > 2 ? Math.floor(d.stride / STRIDE_PER_POSE) % 2 : 0;
    const f = frameForAngle(heading, DIRS);
    // Mid-leap the dino rises above its shadow and looks a little bigger.
    const ab = def.ability;
    const h = d.abilityT >= 0 && ab?.kind === 'leap' ? Math.sin(Math.PI * Math.min(1, d.abilityT / ab.duration)) * LEAP_HEIGHT : 0;
    const lift = Math.round(h);
    const scale = 1 + (0.15 * h) / LEAP_HEIGHT;
    // Screen position of a part, spread out from the body center by the leap scale.
    const sx = (px: number) => Math.round(x + (px - x) * scale);
    const sy = (py: number) => Math.round(y + (py - y) * scale) - lift;
    // Y-sorted with the world; in the air it draws over rocks and dinos below.
    const z = DEPTH.world + y + (lift > 0 ? 40 : 0);
    // In water the shadow falls on the surface: fainter in the shallows, gone in deep water.
    const wet = lift > 0 ? 'dry' : wading;
    const shadowAlpha = wet === 'deep' ? 0 : wet === 'shallow' ? 0.55 : 1;
    this.shadow
      ?.setTexture(`${d.kind}_shadow_${pose}`, f)
      .setPosition(Math.round(x) + 3, Math.round(y) + 4)
      .setScale(1 - (0.2 * h) / LEAP_HEIGHT)
      .setAlpha(shadowAlpha);
    this.foam
      .setVisible(wet === 'deep')
      .setPosition(Math.round(x), Math.round(y))
      .setScale((def.radius + 5) / 12, (def.radius + 4) / 12)
      .setRotation(heading)
      .setDepth(z - 0.3);

    this.body.setTexture(`${d.kind}_body_${this.palette}_${pose}`, f).setPosition(Math.round(x), Math.round(y) - lift).setDepth(z);
    this.armor?.setFrame(f).setPosition(Math.round(x), Math.round(y) - lift).setDepth(z + 0.15);

    if (this.chain) this.updateChain(d, z, pose, f, shadowAlpha, sx, sy, h);
    if (this.head && def.head && !this.chain?.spec.neck) {
      // A bite thrusts the head forward with the jaws gaping, then snaps them shut.
      const biteU = d.abilityT >= 0 && ab?.kind === 'bite' ? d.abilityT / ab.duration : -1;
      const push = biteU >= 0 ? Math.sin(Math.PI * Math.min(1, biteU)) * BITE_REACH : 0;
      const hp = localToWorld(d, heading, { x: def.head.offset.x + push, y: def.head.offset.y });
      const hf = frameForAngle(heading + d.headYaw, DIRS);
      const gaping = biteU > 0.1 && biteU < 0.5;
      this.head.setTexture(gaping ? `${d.kind}_headBite_${this.palette}` : `${d.kind}_head_${this.palette}`, hf);
      this.head.setFrame(hf).setPosition(sx(hp.x), sy(hp.y)).setDepth(def.head.under ? z - 0.05 : z + 0.2);
      this.headArmor?.setFrame(hf).setPosition(sx(hp.x), sy(hp.y)).setDepth(z + 0.22);
    }

    // The rider looks where the guns point (their mean direction when there are several).
    let aimX = 0;
    let aimY = 0;
    this.weapons.forEach((w, i) => {
      const mf = mountFrame(d, def, i);
      aimX += Math.cos(mf.angle);
      aimY += Math.sin(mf.angle);
      w.setFrame(frameForAngle(mf.angle, DIRS))
        .setPosition(sx(mf.x), sy(mf.y))
        .setScale(scale)
        .setDepth(z + 0.4);
    });
    if (this.rider) {
      const riderAngle = aimX || aimY ? Math.atan2(aimY, aimX) : heading;
      const rp = localToWorld(d, heading, def.seat ?? { x: -1, y: 0 });
      this.rider
        .setFrame(frameForAngle(riderAngle, DIRS))
        .setPosition(sx(rp.x), sy(rp.y))
        .setDepth(z + 0.3);
    }

    for (const p of [this.body, this.head, this.armor, this.headArmor, this.rider, ...(this.chain ? [...this.chain.neck, ...this.chain.tail] : [])]) {
      if (!p) continue;
      p.setScale(scale);
      if (d.hitFlash > 0) p.setTintFill(0xffffff);
      else p.clearTint();
    }
  }

  /**
   * Bend the neck (if chained) toward where the head looks, the head yaw spread over the
   * links. The tail trails behind turns (each link follows the one before it), sways in a
   * wave while walking, and whips with a lag toward the tip. Links further out draw over the
   * ones before, all below the body. Then stamp the shadow.
   */
  private updateChain(
    d: Dino,
    z: number,
    pose: number,
    bodyFrame: number,
    shadowAlpha: number,
    sx: (x: number) => number,
    sy: (y: number) => number,
    leapHeight: number,
  ): void {
    const chain = this.chain!;
    const def = getDino(d.kind);
    const { spec } = chain;
    const neckSegs = spec.neck?.segs ?? [];
    const n = neckSegs.length;
    const neckRoot = localToWorld(d, d.heading, def.head?.offset ?? { x: def.radius, y: 0 });
    const neckAngles = neckSegs.map((_, i) => d.heading + (d.headYaw * (i + 1)) / (n + 1));
    const neck = placeChain(neckRoot, neckSegs.map((s) => s.len), neckAngles);
    // The head: at the end of a chained neck, or on its usual pivot.
    const headAt: Placed = { ...(spec.neck ? neck.end : neckRoot), angle: d.heading + d.headYaw };

    // Follow-through: link 0 eases toward straight behind the body, each further link toward the one before it.
    const segs = spec.tail.segs;
    const m = segs.length;
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - chain.lastMs) / 1000));
    chain.lastMs = now;
    const behind = d.heading + Math.PI;
    const trail = (chain.trail ??= segs.map(() => behind));
    const ease = 1 - Math.exp(-TRAIL_RATE * dt);
    for (let i = 0; i < m; i++) trail[i] += angleDiff(i === 0 ? behind : trail[i - 1], trail[i]) * ease;
    const ab = def.ability;
    const whipT = d.abilityT >= 0 && ab?.kind === 'whip' ? d.abilityT / ab.duration : -1;
    const moving = Math.abs(d.speed) > 2;
    const tailAngles = segs.map((_, i) => {
      const reach = (i + 1) / m;
      const t = whipT - i * WHIP_LAG;
      const whip = whipT >= 0 && t > 0 && t < 1 ? Math.sin(Math.PI * 2 * t) * WHIP_SWING * reach ** 1.2 : 0;
      const sway = moving ? Math.sin(d.stride / 9 - i * SWAY_WAVE) * TAIL_SWAY * (0.4 + reach) : 0;
      return trail[i] + whip + sway;
    });
    const tail = placeChain(localToWorld(d, d.heading, def.tail?.offset ?? { x: -def.radius, y: 0 }), segs.map((s) => s.len), tailAngles);

    // Mid-leap the links rise and spread out with the body (sx, sy).
    const put = (img: Phaser.GameObjects.Image, p: Placed, depth: number) =>
      img.setFrame(frameForAngle(p.angle, DIRS)).setPosition(sx(p.x), sy(p.y)).setDepth(depth);
    neck.links.forEach((p, i) => put(chain.neck[i], p, z - 0.09 + i * 0.005));
    if (this.head && spec.neck) put(this.head, headAt, z - 0.05);
    tail.links.forEach((p, i) => put(chain.tail[i], p, z - 0.2 + i * 0.005));

    // One shadow for the whole silhouette: opaque stamps into a texture shown at shadow strength.
    // Mid-leap it stays on the ground and shrinks, like the single shadows of other species.
    const rt = chain.shadow;
    rt.setPosition(Math.round(d.x) + 3, Math.round(d.y) + 4)
      .setAlpha(SHADOW_ALPHA * shadowAlpha)
      .setScale(1 - (0.2 * leapHeight) / LEAP_HEIGHT);
    if (shadowAlpha <= 0) return;
    const half = chain.size / 2;
    const pieces: [Placed, number][] = [
      ...tail.links.map((p): [Placed, number] => [p, frameForAngle(p.angle, DIRS)]),
      [{ x: d.x, y: d.y, angle: d.heading }, bodyFrame],
      ...neck.links.map((p): [Placed, number] => [p, frameForAngle(p.angle, DIRS)]),
      ...(def.head ? [[headAt, frameForAngle(headAt.angle, DIRS)] as [Placed, number]] : []),
    ];
    chain.stamps[m].setTexture(`${d.kind}_bodyMask_${pose}`);
    pieces.forEach(([p, frame], i) => chain.stamps[i].setFrame(frame).setPosition(Math.round(p.x - d.x) + half, Math.round(p.y - d.y) + half));
    rt.clear().draw(chain.stamps);
  }

  destroy(): void {
    const chain = this.chain;
    for (const s of [this.shadow, this.foam, this.body, this.head, this.armor, this.headArmor, this.rider, ...this.weapons]) s?.destroy();
    if (chain) for (const s of [...chain.neck, ...chain.tail, ...chain.stamps, chain.shadow]) s.destroy();
  }
}
