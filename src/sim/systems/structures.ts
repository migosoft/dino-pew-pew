import type { Dino, GameState, PlayerState, Structure, Team } from '../types';
import { getDino } from '../defs/dinos';
import { angleDiff, angleTo } from '../math';
import { findDino, findPlayer } from '../world';
import { CAMP, fieldUp } from '../camp';
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
