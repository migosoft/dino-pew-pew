import type { Dino, InputCommand, World } from '../../sim/types';
import { DT } from '../../sim/types';
import { angleDiff, lerp, lerpAngle } from '../../sim/math';
import { getDino } from '../../sim/defs/dinos';
import { CAMP } from '../../sim/camp';
import { driveDino } from '../../sim/systems/movement';
import { resolveObstacles, type ObstacleEnv } from '../../sim/systems/collision';
import { updateAim } from '../../sim/systems/aiming';
import type { StructureInfo } from '../../net/protocol';

/** Corrections bigger than this (px) jump instead of gliding (respawn, teleport-like knockback). */
export const SNAP_DISTANCE = 160;
/** Time constant (s) of the glide that hides a correction. */
const CORRECTION_TAU = 0.1;
/** After a long stall (background tab), don't replay more than this many steps in one frame. */
const MAX_STEPS_PER_FRAME = 8;
/** Unacknowledged inputs kept for replay (2 s): more means the server stopped answering. */
const MAX_HISTORY = 120;

interface Pose {
  x: number;
  y: number;
  heading: number;
  speed: number;
  stride: number;
  headYaw: number;
  mounts: number[];
}

/**
 * Client-side prediction of the local rider. Every fixed 60 Hz step samples one input, sends it,
 * and moves a local copy of the dino with the same sim code the server runs (`driveDino`), so
 * steering shows the same frame. Each snapshot resets the copy to the server's state for the
 * last input it applied (`ack`) and replays the newer inputs; the visible difference glides away.
 *
 * Not predicted (the server's state is shown instead): running abilities, which move the dino
 * by themselves. Pushes by other dinos and knockback arrive with the next snapshot.
 */
export class Predictor {
  private env: ObstacleEnv;
  private history: { seq: number; cmd: InputCommand }[] = [];
  /** The predicted dino after the latest step, and its pose one step earlier (for drawing in between). */
  private dino: Dino | null = null;
  private prev: Pose | null = null;
  private acc = 0;
  private offX = 0;
  private offY = 0;
  private offHeading = 0;
  /** The pose drawn last frame, to absorb jumps when switching between predicted and server-driven. */
  private last: { id: number; x: number; y: number; heading: number } | null = null;
  private predictedLastFrame = false;
  /** Size of the latest correction in px (debug overlay). */
  lastError = 0;

  constructor(world: World) {
    this.env = { world, structures: [] };
  }

  /** Standing camp buildings and towers block the dino like they do on the server. */
  setStructures(list: StructureInfo[]): void {
    this.env = { world: this.env.world, structures: list.map((s) => ({ x: s.x, y: s.y, hp: s.hp, radius: s.kind === 'camp' ? CAMP.buildingRadius : CAMP.towerRadius })) };
  }

  /**
   * Advance the fixed-step clock by `dtSec`. Each step samples a command and sends it;
   * `send` returns its seq, or 0 if it wasn't sent (then it isn't predicted either).
   */
  advance(dtSec: number, sample: () => InputCommand, send: (cmd: InputCommand) => number): void {
    this.acc += dtSec;
    let n = 0;
    while (this.acc >= DT) {
      this.acc -= DT;
      if (++n > MAX_STEPS_PER_FRAME) {
        this.acc = 0;
        break;
      }
      const cmd = sample();
      const seq = send(cmd);
      if (!seq) continue;
      this.history.push({ seq, cmd });
      if (this.history.length > MAX_HISTORY) this.history.shift();
      if (this.dino) {
        this.prev = poseOf(this.dino);
        stepDino(this.env, this.dino, cmd);
      }
    }
  }

  /**
   * A new snapshot: `server` is my dino in it (undefined if I have none), `ack` the seq of the
   * last input the server applied before it.
   */
  reconcile(server: Dino | undefined, ack: number): void {
    let drop = 0;
    while (drop < this.history.length && this.history[drop].seq <= ack) drop++;
    if (drop) this.history.splice(0, drop);
    if (!server || server.abilityT >= 0) {
      this.dino = null;
      this.prev = null;
      return;
    }
    const before = this.dino && this.dino.id === server.id ? this.pose() : null;
    const d = cloneDino(server);
    let prev = poseOf(d);
    for (const h of this.history) {
      prev = poseOf(d);
      stepDino(this.env, d, h.cmd);
    }
    this.dino = d;
    this.prev = prev;
    if (!before) return;
    const after = this.pose()!;
    this.offX += before.x - after.x;
    this.offY += before.y - after.y;
    this.offHeading += angleDiff(before.heading, after.heading);
    this.lastError = Math.hypot(before.x - after.x, before.y - after.y);
  }

  /** True while the local dino is drawn from the prediction (not from the server's state). */
  get predicting(): boolean {
    return this.dino !== null;
  }

  /** The predicted dino after the latest step (tests and debugging; don't modify it). */
  current(): Readonly<Dino> | null {
    return this.dino;
  }

  /**
   * Draw `view` (my dino, interpolated from the snapshots) where the prediction says it is.
   * While nothing is predicted, `view` keeps the server's pose, and only a leftover correction is added.
   */
  apply(view: Dino | undefined, dtSec: number): void {
    if (!view) {
      this.last = null;
      return;
    }
    const pose = this.dino && this.dino.id === view.id ? this.pose() : null;
    if (pose) {
      view.x = pose.x;
      view.y = pose.y;
      view.heading = pose.heading;
      view.speed = pose.speed;
      view.stride = pose.stride;
      view.headYaw = pose.headYaw;
      for (let i = 0; i < view.mounts.length && i < pose.mounts.length; i++) view.mounts[i].angle = pose.mounts[i];
    }
    // Switching between predicted and server-driven (an ability starts or ends) jumps: glide over it.
    if (this.last && this.last.id === view.id && this.predictedLastFrame !== !!pose) {
      this.offX = this.last.x - view.x;
      this.offY = this.last.y - view.y;
      this.offHeading = angleDiff(this.last.heading, view.heading);
    }
    this.predictedLastFrame = !!pose;
    if (!this.last || this.last.id !== view.id || this.offX * this.offX + this.offY * this.offY > SNAP_DISTANCE * SNAP_DISTANCE) {
      this.offX = this.offY = this.offHeading = 0;
    }
    const k = Math.exp(-dtSec / CORRECTION_TAU);
    this.offX *= k;
    this.offY *= k;
    this.offHeading *= k;
    view.x += this.offX;
    view.y += this.offY;
    view.heading += this.offHeading;
    view.px = view.x;
    view.py = view.y;
    view.pheading = view.heading;
    this.last = { id: view.id, x: view.x, y: view.y, heading: view.heading };
  }

  /** The predicted pose at this moment: between the last two steps, by the time left over. */
  private pose(): Pose | null {
    const d = this.dino;
    if (!d) return null;
    const p = this.prev ?? poseOf(d);
    const t = Math.min(1, this.acc / DT);
    return {
      x: lerp(p.x, d.x, t),
      y: lerp(p.y, d.y, t),
      heading: lerpAngle(p.heading, d.heading, t),
      speed: lerp(p.speed, d.speed, t),
      stride: lerp(p.stride, d.stride, t),
      headYaw: lerp(p.headYaw, d.headYaw, t),
      mounts: d.mounts.map((m, i) => lerp(p.mounts[i] ?? m.angle, m.angle, t)),
    };
  }
}

/** One server tick of a rider's own movement and aim, as `step()` in sim.ts does it. */
export function stepDino(env: ObstacleEnv, d: Dino, cmd: InputCommand): void {
  driveDino(env, d, cmd, DT);
  updateAim(d, getDino(d.kind), cmd.aimWorld, DT);
  // The server pushes everyone out of obstacles once more after dino contacts.
  resolveObstacles(env, d);
}

function poseOf(d: Dino): Pose {
  return { x: d.x, y: d.y, heading: d.heading, speed: d.speed, stride: d.stride, headYaw: d.headYaw, mounts: d.mounts.map((m) => m.angle) };
}

function cloneDino(d: Dino): Dino {
  return { ...d, mounts: d.mounts.map((m) => ({ ...m })), abilityFrom: { ...d.abilityFrom }, abilityTo: { ...d.abilityTo }, abilityHit: [...d.abilityHit] };
}
