import type { AbilityDef, Dino, GameState, InputCommand } from '../types';
import { getDino } from '../defs/dinos';
import { DEG, angleDiff, angleTo, clamp, lerp } from '../math';
import { isAirborne } from '../world';
import { isInOwnBase } from '../players';
import { resolveObstacles } from './collision';
import { terrainSpeedFactor } from './movement';
import { applyDamage } from './damage';
import { isHostile } from './melee';

// Species abilities on right mouse: the raptor leaps toward the aim point and slams down,
// the triceratops dashes straight ahead and rams whoever is in the way, and the brontosaurus
// sweeps its tail through everything behind it.

/** Half-angle in front of a dashing dino within which it rams others. */
const DASH_ARC = 70 * DEG;
/** How far a dash shoves each dino it rams. */
const DASH_KNOCKBACK = 12;

/** Start the ability if it was requested and is ready. */
export function tryStartAbility(state: GameState, d: Dino, cmd: InputCommand): void {
  const ab = getDino(d.kind).ability;
  if (!cmd.ability || !ab || d.abilityCooldown > 0 || d.abilityT >= 0) return;
  d.abilityT = 0;
  d.abilityCooldown = ab.cooldown;
  d.abilityHit = [];
  if (ab.kind === 'leap') {
    const r = getDino(d.kind).radius;
    const toAim = Math.hypot(cmd.aimWorld.x - d.x, cmd.aimWorld.y - d.y);
    if (toAim > 1) d.heading = angleTo(d, cmd.aimWorld);
    const dist = clamp(toAim, ab.minRange ?? 0, ab.maxRange ?? toAim);
    d.abilityFrom = { x: d.x, y: d.y };
    d.abilityTo = {
      x: clamp(d.x + Math.cos(d.heading) * dist, r, state.world.width - r),
      y: clamp(d.y + Math.sin(d.heading) * dist, r, state.world.height - r),
    };
  }
  state.events.push({ type: 'ability', dinoId: d.id, kind: ab.kind, x: d.x, y: d.y });
}

/** Advance a running ability. Returns true while it controls the dino's movement. */
export function updateAbility(state: GameState, d: Dino, dt: number): boolean {
  if (d.abilityT < 0) return false;
  const def = getDino(d.kind);
  const ab = def.ability!;
  const before = d.abilityT;
  d.abilityT += dt;
  // Epsilon: whole ticks summed in floating point fall just short of e.g. 0.4 s.
  const done = d.abilityT >= ab.duration - 1e-6;
  if (ab.kind === 'whip') {
    // The tail lands half-way through the swing; the dino keeps walking meanwhile.
    const strike = ab.duration / 2;
    if (before < strike && d.abilityT >= strike - 1e-6) whip(state, d, def.radius, ab);
    if (done) d.abilityT = -1;
    return false;
  }
  if (ab.kind === 'leap') {
    const t = Math.min(1, d.abilityT / ab.duration);
    const len = Math.hypot(d.abilityTo.x - d.abilityFrom.x, d.abilityTo.y - d.abilityFrom.y);
    d.x = lerp(d.abilityFrom.x, d.abilityTo.x, t);
    d.y = lerp(d.abilityFrom.y, d.abilityTo.y, t);
    // Land running.
    d.speed = Math.min(len / ab.duration, def.maxSpeed);
    d.stride += d.speed * dt;
    if (done) {
      d.abilityT = -1;
      resolveObstacles(state, d);
      land(state, d, ab);
    }
    return true;
  }
  // Dash: deep water slows it like any other movement.
  const speed = (ab.speed ?? def.maxSpeed) * terrainSpeedFactor(state.world, d, def);
  d.speed = speed;
  d.x += Math.cos(d.heading) * speed * dt;
  d.y += Math.sin(d.heading) * speed * dt;
  d.stride += speed * dt;
  resolveObstacles(state, d);
  // A rock taken head-on bleeds most of the speed and stops the charge.
  const blocked = d.speed < speed * 0.85;
  ram(state, d, def.radius, ab);
  if (done || blocked) {
    d.abilityT = -1;
    d.speed = Math.min(d.speed, def.maxSpeed);
  }
  return true;
}

/** Leap landing: damage every hostile right below. */
function land(state: GameState, d: Dino, ab: AbilityDef): void {
  const r = getDino(d.kind).radius;
  state.events.push({ type: 'slam', dinoId: d.id, x: d.x, y: d.y });
  for (const b of state.dinos) {
    if (b === d || !b.alive || isAirborne(b) || !isHostile(d, b)) continue;
    const reach = r + getDino(b.kind).radius + ab.hitReach;
    if ((b.x - d.x) ** 2 + (b.y - d.y) ** 2 > reach * reach) continue;
    applyDamage(state, b, ab.damage * d.damageMul, d.id);
  }
}

/** Dash contact: damage (once per dash) and shove every hostile in front, except those safe in their camp. */
function ram(state: GameState, d: Dino, r: number, ab: AbilityDef): void {
  for (const b of state.dinos) {
    if (b === d || !b.alive || isAirborne(b) || !isHostile(d, b) || isInOwnBase(state, b) || d.abilityHit.includes(b.id)) continue;
    const reach = r + getDino(b.kind).radius + ab.hitReach;
    if ((b.x - d.x) ** 2 + (b.y - d.y) ** 2 > reach * reach) continue;
    if (Math.abs(angleDiff(angleTo(d, b), d.heading)) > DASH_ARC) continue;
    d.abilityHit.push(b.id);
    state.events.push({ type: 'melee', attackerId: d.id, targetId: b.id, x: (d.x + b.x) / 2, y: (d.y + b.y) / 2 });
    applyDamage(state, b, ab.damage * d.damageMul, d.id);
    b.x += Math.cos(d.heading) * DASH_KNOCKBACK;
    b.y += Math.sin(d.heading) * DASH_KNOCKBACK;
    resolveObstacles(state, b);
  }
}

/** Tail whip: damage and shove every hostile behind the dino, except those safe in their camp. */
function whip(state: GameState, d: Dino, r: number, ab: AbilityDef): void {
  const back = d.heading + Math.PI;
  const tail = getDino(d.kind).tail?.offset.x ?? -r;
  state.events.push({ type: 'whip', dinoId: d.id, x: d.x + Math.cos(back) * (-tail + 14), y: d.y + Math.sin(back) * (-tail + 14) });
  for (const b of state.dinos) {
    if (b === d || !b.alive || isAirborne(b) || !isHostile(d, b) || isInOwnBase(state, b) || d.abilityHit.includes(b.id)) continue;
    const reach = r + getDino(b.kind).radius + ab.hitReach;
    if ((b.x - d.x) ** 2 + (b.y - d.y) ** 2 > reach * reach) continue;
    const dir = angleTo(d, b);
    if (Math.abs(angleDiff(dir, back)) > (ab.arc ?? Math.PI / 2)) continue;
    d.abilityHit.push(b.id);
    state.events.push({ type: 'melee', attackerId: d.id, targetId: b.id, x: b.x, y: b.y });
    applyDamage(state, b, ab.damage * d.damageMul, d.id);
    const shove = ab.knockback ?? 0;
    b.x += Math.cos(dir) * shove;
    b.y += Math.sin(dir) * shove;
    resolveObstacles(state, b);
  }
}
