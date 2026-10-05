import type { Dino, Projectile } from '../../sim/types';
import { DT, TICK_RATE } from '../../sim/types';
import { lerp, lerpAngle } from '../../sim/math';
import { decodeDino, decodeStructure, type PlayerInfo, type RoundInfo, type SnapshotMsg, type StructureInfo, type TeamInfo, type TimedEvent } from '../../net/protocol';

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
  /** Each snapshot's dinos, decoded once when it arrives (by id, in tuple order). */
  private decoded = new WeakMap<SnapshotMsg, Map<number, Dino>>();
  /** Render-ready dinos handed out by dinosAt, reused frame to frame (one object per id). */
  private views = new Map<number, Dino>();
  private viewList: Dino[] = [];
  private events: TimedEvent[] = [];
  private offset: number | null = null;
  /** Snapshots leave players and teams out while unchanged: keep the last ones sent. */
  private lastPlayers: PlayerInfo[] = [];
  private lastTeams: TeamInfo[] = [];
  private lastRound: RoundInfo = { phase: 'waiting', timer: 0, winner: null };
  private structureCache = new WeakMap<SnapshotMsg, StructureInfo[]>();
  private projectiles = new Map<number, ClientProjectile>();
  /** Where projectiles ran out of range since the last takeSpent() (for splashes). */
  private spent: { x: number; y: number }[] = [];

  push(snap: SnapshotMsg, nowMs: number): void {
    if (this.snaps.length && snap.tick <= this.snaps[this.snaps.length - 1].tick) return;
    this.snaps.push(snap);
    const byId = new Map<number, Dino>();
    for (const t of snap.dinos) byId.set(t[0], decodeDino(t));
    this.decoded.set(snap, byId);
    if (snap.players) this.lastPlayers = snap.players;
    if (snap.teams) this.lastTeams = snap.teams;
    if (snap.round) this.lastRound = snap.round;
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

  /** A player's dino as of the newest snapshot (not interpolated; don't modify it). */
  latestDinoOf(playerId: number): Dino | undefined {
    const snap = this.latest();
    if (!snap) return undefined;
    for (const d of this.decoded.get(snap)!.values()) if (d.playerId === playerId) return d;
    return undefined;
  }

  /** The (fractional) server tick to render right now. */
  renderTick(nowMs: number): number {
    if (this.offset === null || !this.snaps.length) return 0;
    const t = (nowMs / 1000) * TICK_RATE + this.offset - INTERP_TICKS;
    const newest = this.snaps[this.snaps.length - 1].tick;
    return Math.min(t, newest);
  }

  /**
   * Remove and return all events that happened at or before `tick`, in order. Shots by
   * `shift.dinoId` move by (dx, dy): the local rider is drawn ahead of the server (prediction),
   * so its shots must leave from where it is drawn.
   */
  takeEvents(tick: number, shift?: { dinoId: number; dx: number; dy: number }): TimedEvent[] {
    const due: TimedEvent[] = [];
    const later: TimedEvent[] = [];
    for (const e of this.events) (e.tick <= tick ? due : later).push(e);
    this.events = later;
    for (const e of due) {
      if (e.type === 'shot') {
        if (shift && e.dinoId === shift.dinoId) {
          e.x += shift.dx;
          e.y += shift.dy;
        }
        this.projectiles.set(e.projectileId, { id: e.projectileId, team: e.team, x0: e.x, y0: e.y, vx: e.vx, vy: e.vy, tick0: e.tick, range: e.range });
      } else if (e.type === 'hit' || e.type === 'impact') {
        this.projectiles.delete(e.projectileId);
      }
    }
    return due;
  }

  /**
   * Dinos interpolated to `tick`. The array and the objects in it are reused by the next
   * call (each id keeps its object while it exists): read them, don't keep them.
   */
  dinosAt(tick: number): Dino[] {
    const n = this.snaps.length;
    const out = this.viewList;
    out.length = 0;
    if (!n) return out;
    let i = n - 1;
    while (i > 0 && this.snaps[i - 1].tick > tick) i--;
    const s1 = this.snaps[i];
    const s0 = i > 0 ? this.snaps[i - 1] : s1;
    const span = s1.tick - s0.tick;
    const t = span > 0 ? Math.max(0, Math.min(1, (tick - s0.tick) / span)) : 1;
    const prev = this.decoded.get(s0)!;
    const next = this.decoded.get(s1)!;
    for (const b of next.values()) {
      let v = this.views.get(b.id);
      if (!v) {
        v = { ...b, mounts: [] };
        this.views.set(b.id, v);
      }
      // Copy the newer state, keeping v's own mounts (the decoded snapshot stays untouched).
      const mounts = v.mounts;
      Object.assign(v, b);
      v.mounts = mounts;
      mounts.length = b.mounts.length;
      for (let k = 0; k < b.mounts.length; k++) (mounts[k] ??= { angle: 0, cooldown: 0 }).angle = b.mounts[k].angle;
      const a = prev.get(b.id);
      if (a && t < 1) {
        v.x = v.px = lerp(a.x, b.x, t);
        v.y = v.py = lerp(a.y, b.y, t);
        v.heading = v.pheading = lerpAngle(a.heading, b.heading, t);
        v.headYaw = lerp(a.headYaw, b.headYaw, t);
        v.stride = lerp(a.stride, b.stride, t);
        for (let k = 0; k < mounts.length; k++) mounts[k].angle = lerp(a.mounts[k]?.angle ?? b.mounts[k].angle, b.mounts[k].angle, t);
        if (a.abilityT >= 0 && b.abilityT >= 0) v.abilityT = lerp(a.abilityT, b.abilityT, t);
      }
      out.push(v);
    }
    for (const id of this.views.keys()) if (!next.has(id)) this.views.delete(id);
    return out;
  }

  projectilesAt(tick: number): Projectile[] {
    const out: Projectile[] = [];
    for (const p of this.projectiles.values()) {
      const k = tick - p.tick0 + 1;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed * k * DT > p.range) {
        const end = p.range / Math.max(speed, 1e-6);
        this.spent.push({ x: p.x0 + p.vx * end, y: p.y0 + p.vy * end });
        if (this.spent.length > 64) this.spent.shift();
        this.projectiles.delete(p.id);
        continue;
      }
      const x = p.x0 + p.vx * k * DT;
      const y = p.y0 + p.vy * k * DT;
      out.push({ id: p.id, ownerId: 0, team: p.team, x, y, px: x, py: y, vx: p.vx, vy: p.vy, traveled: 0, range: p.range, damage: 0, radius: 2, kind: 'bolt', alive: true });
    }
    return out;
  }

  /** End points of projectiles that ran out of range, since the last call. */
  takeSpent(): { x: number; y: number }[] {
    return this.spent.splice(0);
  }

  players(): PlayerInfo[] {
    return this.lastPlayers;
  }

  teams(): TeamInfo[] {
    return this.lastTeams;
  }

  round(): RoundInfo {
    return this.lastRound;
  }

  /** Structures as of the newest snapshot at or before `tick` (they barely move: no interpolation). */
  structuresAt(tick: number): StructureInfo[] {
    let snap = this.snaps[0];
    for (const s of this.snaps) if (s.tick <= tick) snap = s;
    if (!snap) return [];
    let list = this.structureCache.get(snap);
    if (!list) {
      list = snap.structures.map(decodeStructure);
      this.structureCache.set(snap, list);
    }
    return list;
  }
}
