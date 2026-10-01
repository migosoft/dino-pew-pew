import type { Dino, Projectile } from '../../sim/types';
import { DT, TICK_RATE } from '../../sim/types';
import { lerp, lerpAngle } from '../../sim/math';
import { decodeDino, type PlayerInfo, type SnapshotMsg, type TeamInfo, type TimedEvent } from '../../net/protocol';

/** Render this many ticks behind the newest server state (100 ms = 2 snapshots of jitter room). */
export const INTERP_TICKS = 6;
const MAX_SNAPSHOTS = 60;

interface ClientProjectile {
  id: number;
  team: string;
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  tick0: number;
  range: number;
}

/**
 * Client-side mirror of the server world, rendered slightly in the past and
 * interpolated between snapshots. Projectiles are simulated locally from their
 * spawn events (they fly straight), and removed on the server's hit/impact events.
 */
export class Mirror {
  private snaps: SnapshotMsg[] = [];
  private events: TimedEvent[] = [];
  private offset: number | null = null;
  private projectiles = new Map<number, ClientProjectile>();

  push(snap: SnapshotMsg, nowMs: number): void {
    if (this.snaps.length && snap.tick <= this.snaps[this.snaps.length - 1].tick) return;
    this.snaps.push(snap);
    if (this.snaps.length > MAX_SNAPSHOTS) this.snaps.shift();
    for (const e of snap.events) this.events.push(e);

    // Clock sync: estimate (serverTick - localTick). Faster arrivals pull the estimate up
    // quickly; slower ones drift it down gently, so jitter doesn't shake the render clock.
    const sample = snap.tick - (nowMs / 1000) * TICK_RATE;
    if (this.offset === null || Math.abs(sample - this.offset) > 30) this.offset = sample;
    else this.offset += (sample - this.offset) * (sample > this.offset ? 0.3 : 0.02);
  }

  get ready(): boolean {
    return this.snaps.length > 0;
  }

  latest(): SnapshotMsg | undefined {
    return this.snaps[this.snaps.length - 1];
  }

  /** The (fractional) server tick to render right now. */
  renderTick(nowMs: number): number {
    if (this.offset === null || !this.snaps.length) return 0;
    const t = (nowMs / 1000) * TICK_RATE + this.offset - INTERP_TICKS;
    const newest = this.snaps[this.snaps.length - 1].tick;
    return Math.min(t, newest);
  }

  /** Remove and return all events that happened at or before `tick`, in order. */
  takeEvents(tick: number): TimedEvent[] {
    const due: TimedEvent[] = [];
    const later: TimedEvent[] = [];
    for (const e of this.events) (e.tick <= tick ? due : later).push(e);
    this.events = later;
    for (const e of due) {
      if (e.type === 'shot') {
        this.projectiles.set(e.projectileId, { id: e.projectileId, team: e.team, x0: e.x, y0: e.y, vx: e.vx, vy: e.vy, tick0: e.tick, range: e.range });
      } else if (e.type === 'hit' || e.type === 'impact') {
        this.projectiles.delete(e.projectileId);
      }
    }
    return due;
  }

  /** Dinos interpolated to `tick`. */
  dinosAt(tick: number): Dino[] {
    const n = this.snaps.length;
    if (!n) return [];
    let i = n - 1;
    while (i > 0 && this.snaps[i - 1].tick > tick) i--;
    const s1 = this.snaps[i];
    const s0 = i > 0 ? this.snaps[i - 1] : s1;
    const span = s1.tick - s0.tick;
    const t = span > 0 ? Math.max(0, Math.min(1, (tick - s0.tick) / span)) : 1;
    const prev = new Map(s0.dinos.map((d) => [d[0], d]));
    return s1.dinos.map((tuple) => {
      const b = decodeDino(tuple);
      const at = prev.get(tuple[0]);
      if (!at || t >= 1) return b;
      const a = decodeDino(at);
      b.x = b.px = lerp(a.x, b.x, t);
      b.y = b.py = lerp(a.y, b.y, t);
      b.heading = b.pheading = lerpAngle(a.heading, b.heading, t);
      b.headYaw = lerp(a.headYaw, b.headYaw, t);
      b.stride = lerp(a.stride, b.stride, t);
      b.mounts.forEach((m, k) => (m.angle = lerp(a.mounts[k]?.angle ?? m.angle, m.angle, t)));
      if (a.abilityT >= 0 && b.abilityT >= 0) b.abilityT = lerp(a.abilityT, b.abilityT, t);
      return b;
    });
  }

  projectilesAt(tick: number): Projectile[] {
    const out: Projectile[] = [];
    for (const p of this.projectiles.values()) {
      const k = tick - p.tick0 + 1;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed * k * DT > p.range) {
        this.projectiles.delete(p.id);
        continue;
      }
      const x = p.x0 + p.vx * k * DT;
      const y = p.y0 + p.vy * k * DT;
      out.push({ id: p.id, ownerId: 0, team: p.team, x, y, px: x, py: y, vx: p.vx, vy: p.vy, traveled: 0, range: p.range, damage: 0, radius: 2, kind: 'bolt', alive: true });
    }
    return out;
  }

  players(): PlayerInfo[] {
    return this.latest()?.players ?? [];
  }

  teams(): TeamInfo[] {
    return this.latest()?.teams ?? [];
  }
}
