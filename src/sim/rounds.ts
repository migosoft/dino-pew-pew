import type { GameState, TeamState } from './types';
import { findPlayer, findTeam } from './world';
import { RESPAWN_TIME, TEAM_EMPTY_TIMEOUT } from './players';
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
    state.round.winner = winner;
    setPhase(state, 'over', INTERMISSION);
    state.events.push({ type: 'roundWon', team: winner });
  }
}

/** Seconds from "every team has a rider" to the start of the round. */
export const COUNTDOWN = 5;

function setPhase(state: GameState, phase: GameState['round']['phase'], timer: number): void {
  state.round.phase = phase;
  state.round.timer = timer;
  state.events.push({ type: 'phase', phase });
}

/** waiting -> countdown -> playing -> over. Empty teams lose their camp during a round. */
export function updateRound(state: GameState, dt: number): void {
  if (!state.camps) return;
  const r = state.round;
  const staffed = state.teams.length >= 2 && state.teams.every((t) => state.players.some((p) => p.team === t.id));
  if (r.phase === 'waiting') {
    if (staffed) setPhase(state, 'countdown', COUNTDOWN);
  } else if (r.phase === 'countdown') {
    if (!staffed) return setPhase(state, 'waiting', 0);
    r.timer -= dt;
    if (r.timer <= 0) setPhase(state, 'playing', 0);
  } else if (r.phase === 'playing') {
    for (const t of state.teams) {
      // One elimination may end the round: then nobody else falls this tick.
      if (state.round.phase !== 'playing') break;
      if (t.eliminated || t.emptyFor < TEAM_EMPTY_TIMEOUT) continue;
      state.events.push({ type: 'campDown', team: t.id, by: null });
      eliminateTeam(state, t.id);
    }
  } else {
    r.timer = Math.max(0, r.timer - dt);
  }
}

/** An eliminated rider joins a surviving team (with a new mount) and respawns in its camp. */
export function switchTeam(state: GameState, playerId: number, teamId: string, kind: string): 'ok' | 'not-eliminated' | 'bad-team' {
  const p = findPlayer(state, playerId);
  if (!p || !findTeam(state, p.team)?.eliminated) return 'not-eliminated';
  const to = findTeam(state, teamId);
  if (!to || to.eliminated) return 'bad-team';
  p.team = to.id;
  p.kind = kind;
  p.dinoId = null;
  p.respawn = RESPAWN_TIME;
  to.emptyFor = 0;
  return 'ok';
}
