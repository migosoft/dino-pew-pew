import { WILD_TEAM, type Dino, type GameState, type PlayerState, type Structure, type Team } from '../types';
import { getDino } from '../defs/dinos';
import { angleDiff, angleTo, clamp, wrapAngle } from '../math';
import { rand } from '../rng';
import { findDino, findPlayer, findTeam, isAirborne } from '../world';
import { buildDinoGrid, dinosNear } from '../spatial';
import { CAMP, TOWER_GUN, fieldUp } from '../camp';
import { eliminateTeam } from '../rounds';

/** The rider whose dino dealt the damage (if it was a rider). */
function riderOf(state: GameState, sourceDinoId: number): PlayerState | undefined {
  const d = findDino(state, sourceDinoId);
  return d?.playerId != null ? findPlayer(state, d.playerId) : undefined;
}

function pay(state: GameState, p: PlayerState | undefined, amount: number, x: number, y: number): void {
  if (!p) return;
  p.money += amount;
  state.events.push({ type: 'bounty', playerId: p.id, amount, x, y });
}

/**
 * Damage a camp building or tower, hit at (x, y). Nothing happens outside a playing round,
 * and the camp building is shielded while its force field is up (towers are never shielded).
 */
export function damageStructure(state: GameState, s: Structure, amount: number, sourceDinoId: number, x: number, y: number): 'hit' | 'shielded' | 'immune' {
  if (s.hp <= 0) return 'immune';
  if (state.round.phase !== 'playing') {
    state.events.push({ type: 'structureHit', structureId: s.id, x, y, shielded: s.kind === 'camp' });
    return 'immune';
  }
  if (s.kind === 'camp' && fieldUp(state, s.team)) {
    state.events.push({ type: 'structureHit', structureId: s.id, x, y, shielded: true });
    return 'shielded';
  }
  s.hp = Math.max(0, s.hp - amount);
  s.hitFlash = 0.12;
  state.events.push({ type: 'structureHit', structureId: s.id, x, y, shielded: false });
  if (s.hp > 0) return 'hit';
  const rider = riderOf(state, sourceDinoId);
  if (s.kind === 'tower') {
    s.rebuildIn = CAMP.towerRebuild;
    s.target = null;
    state.events.push({ type: 'towerDown', structureId: s.id, team: s.team, by: rider?.id ?? null });
    pay(state, rider, CAMP.towerBounty, s.x, s.y);
  } else {
    state.events.push({ type: 'campDown', team: s.team, by: rider?.id ?? null });
    pay(state, rider, CAMP.campBounty, s.x, s.y);
    eliminateTeam(state, s.team);
  }
  return 'hit';
}

/** The first standing structure of another team that a circle at (x, y, r) touches. */
export function structureHitBy(state: GameState, x: number, y: number, r: number, team: Team): Structure | undefined {
  for (const s of state.structures) {
    if (s.hp <= 0 || s.team === team) continue;
    const rr = s.radius + r;
    if ((s.x - x) ** 2 + (s.y - y) ** 2 < rr * rr) return s;
  }
  return undefined;
}

/**
 * Standing enemy structures within `extra` px of a dino's body, inside ±arc around `dir`,
 * nearest first. Wild dinos never attack structures (empty list).
 */
export function structuresInArc(state: GameState, d: Dino, extra: number, dir: number, arc: number): Structure[] {
  if (d.playerId === null) return [];
  const r = getDino(d.kind).radius;
  const out: { s: Structure; dist: number }[] = [];
  for (const s of state.structures) {
    if (s.hp <= 0 || s.team === d.team) continue;
    const dist = Math.hypot(s.x - d.x, s.y - d.y);
    if (dist > r + s.radius + extra) continue;
    if (arc < Math.PI && Math.abs(angleDiff(angleTo(d, s), dir)) > arc) continue;
    out.push({ s, dist });
  }
  return out.sort((a, b) => a.dist - b.dist).map((o) => o.s);
}

const near: number[] = [];

/** Wild dinos that go for riders: carnivores, and herbivores charging after being provoked. */
export function isAggressiveWild(d: Dino): boolean {
  return d.team === WILD_TEAM && (getDino(d.kind).diet === 'carnivore' || d.ai?.mode === 'charge');
}

/** Nearest enemy rider or aggressive wild dino in gun range. */
function towerTarget(state: GameState, s: Structure): Dino | undefined {
  let best: Dino | undefined;
  let bestD = TOWER_GUN.range * TOWER_GUN.range;
  for (const j of dinosNear(state, s.x, s.y, TOWER_GUN.range, near)) {
    const d = state.dinos[j];
    if (!d.alive || d.team === s.team || isAirborne(d)) continue;
    if (d.playerId === null && !isAggressiveWild(d)) continue;
    const dd = (d.x - s.x) ** 2 + (d.y - s.y) ** 2;
    if (dd >= bestD) continue;
    best = d;
    bestD = dd;
  }
  return best;
}

function fireTower(state: GameState, s: Structure): void {
  const angle = s.angle + (rand(state.rng) * 2 - 1) * TOWER_GUN.spread;
  const x = s.x + Math.cos(s.angle) * CAMP.towerMuzzle;
  const y = s.y + Math.sin(s.angle) * CAMP.towerMuzzle;
  const vx = Math.cos(angle) * TOWER_GUN.projectileSpeed;
  const vy = Math.sin(angle) * TOWER_GUN.projectileSpeed;
  const id = state.nextId++;
  state.projectiles.push({ id, ownerId: s.id, team: s.team, x, y, px: x, py: y, vx, vy, traveled: 0, range: TOWER_GUN.range, damage: TOWER_GUN.damage, radius: TOWER_GUN.projectileRadius, kind: 'bolt', alive: true });
  s.cooldown = TOWER_GUN.fireInterval;
  state.events.push({ type: 'shot', dinoId: s.id, mount: -1, projectileId: id, team: s.team, x, y, vx, vy, range: TOWER_GUN.range });
}

/** Hit flashes, tower rebuilds, and tower turrets tracking and shooting their nearest target. */
export function updateStructures(state: GameState, dt: number): void {
  buildDinoGrid(state);
  for (const s of state.structures) {
    s.hitFlash = Math.max(0, s.hitFlash - dt);
    if (s.kind !== 'tower') continue;
    if (s.hp <= 0) {
      if (s.rebuildIn <= 0 || findTeam(state, s.team)?.eliminated) continue;
      s.rebuildIn -= dt;
      if (s.rebuildIn <= 0) {
        s.rebuildIn = 0;
        s.hp = s.maxHp;
        state.events.push({ type: 'towerUp', structureId: s.id, team: s.team });
      }
      continue;
    }
    s.cooldown = Math.max(0, s.cooldown - dt);
    const target = towerTarget(state, s);
    s.target = target?.id ?? null;
    if (!target) continue;
    // Lead the target: aim where it will be when the bolt arrives.
    const t = Math.hypot(target.x - s.x, target.y - s.y) / TOWER_GUN.projectileSpeed;
    const aim = { x: target.x + Math.cos(target.heading) * target.speed * t, y: target.y + Math.sin(target.heading) * target.speed * t };
    const diff = angleDiff(angleTo(s, aim), s.angle);
    const turn = CAMP.towerTurnSpeed * dt;
    s.angle = wrapAngle(s.angle + clamp(diff, -turn, turn));
    if (Math.abs(diff) < CAMP.towerAimTolerance && s.cooldown <= 0) fireTower(state, s);
  }
}
