import type { GameState, TeamState } from './types';
import { findTeam } from './world';
import { addCarcassFor } from './systems/feeding';

/** Seconds the result is shown before the next round. */
export const INTERMISSION = 15;

export function liveTeams(state: GameState): TeamState[] {
  return state.teams.filter((t) => !t.eliminated);
}

/**
 * Knock a team out: its structures fall for good, its riders die and can't respawn.
 * When at most one team is left in a playing round, the round is over.
 */
export function eliminateTeam(state: GameState, teamId: string): void {
  const team = findTeam(state, teamId);
  if (!team || team.eliminated) return;
  team.eliminated = true;
  for (const s of state.structures) {
    if (s.team !== teamId) continue;
    s.hp = 0;
    s.rebuildIn = 0;
    s.target = null;
  }
  for (const d of state.dinos) {
    if (!d.alive || d.team !== teamId) continue;
    d.alive = false;
    d.hp = 0;
    d.abilityT = -1;
    state.events.push({ type: 'death', dinoId: d.id, x: d.x, y: d.y, team: d.team });
    addCarcassFor(state, d);
  }
  for (const p of state.players) {
    if (p.team !== teamId) continue;
    p.dinoId = null;
    p.respawn = 0;
  }
  state.events.push({ type: 'eliminated', team: teamId });
  const live = liveTeams(state);
  if (state.round.phase === 'playing' && live.length <= 1) {
    const winner = live[0]?.id ?? null;
    state.round = { phase: 'over', timer: INTERMISSION, winner };
    state.events.push({ type: 'roundWon', team: winner });
    state.events.push({ type: 'phase', phase: 'over' });
  }
}
