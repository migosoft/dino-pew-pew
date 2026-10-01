import type { Dino, GameState, PlayerState, TeamState } from './types';
import { getDino } from './defs/dinos';
import { angleTo } from './math';
import { rand, randRange } from './rng';
import { createDino, findDino, findPlayer, findTeam, isFree } from './world';
import { applyUpgrades, noUpgrades, payBounty } from './upgrades';

export const MAX_TEAMS = 4;
export const MAX_PLAYERS = 16;
/** Radius of a team's base camp safe zone. */
export const BASE_RADIUS = 90;
export const RESPAWN_TIME = 4;
/** A team with no players dissolves after this many seconds, freeing its base. */
export const TEAM_EMPTY_TIMEOUT = 30;
export const TEAM_NAMES = ['GREEN', 'RED', 'GOLD', 'BLUE'];

/** Found a new team in the first free base slot, or null if all slots are taken. */
export function createTeam(state: GameState): TeamState | null {
  if (state.teams.length >= MAX_TEAMS) return null;
  for (let slot = 0; slot < MAX_TEAMS; slot++) {
    if (state.teams.some((t) => t.slot === slot)) continue;
    const team: TeamState = { id: `team${slot}`, slot, base: { ...state.world.bases[slot] }, emptyFor: 0 };
    state.teams.push(team);
    return team;
  }
  return null;
}

export function teamName(team: TeamState): string {
  return TEAM_NAMES[team.slot] ?? team.id.toUpperCase();
}

export function addPlayer(state: GameState, teamId: string, kind: string, name: string): PlayerState {
  const team = findTeam(state, teamId);
  if (!team) throw new Error(`Unknown team: ${teamId}`);
  getDino(kind); // validates the species
  const player: PlayerState = {
    id: state.nextId++,
    name,
    team: team.id,
    kind,
    dinoId: null,
    respawn: 0,
    kills: 0,
    deaths: 0,
    money: 0,
    upgrades: noUpgrades(),
  };
  state.players.push(player);
  team.emptyFor = 0;
  spawnPlayerDino(state, player);
  return player;
}

export function removePlayer(state: GameState, playerId: number): void {
  const player = findPlayer(state, playerId);
  if (!player) return;
  state.dinos = state.dinos.filter((d) => d.playerId !== playerId);
  state.players = state.players.filter((p) => p.id !== playerId);
}

/** Put the player's rider on a fresh dino somewhere in the team base. */
export function spawnPlayerDino(state: GameState, player: PlayerState): Dino {
  const team = findTeam(state, player.team)!;
  const def = getDino(player.kind);
  let x = team.base.x;
  let y = team.base.y;
  for (let attempt = 0; attempt < 30; attempt++) {
    const a = rand(state.rng) * Math.PI * 2;
    const r = randRange(state.rng, 0, BASE_RADIUS * 0.6);
    const cx = team.base.x + Math.cos(a) * r;
    const cy = team.base.y + Math.sin(a) * r;
    const crowded = state.dinos.some((d) => d.alive && (d.x - cx) ** 2 + (d.y - cy) ** 2 < (def.radius * 2.5) ** 2);
    if (isFree(state.world, cx, cy, def.radius) && !crowded) {
      x = cx;
      y = cy;
      break;
    }
  }
  // Face the map center.
  const heading = angleTo({ x, y }, { x: state.world.width / 2, y: state.world.height / 2 });
  const dino = createDino(state, player.kind, player.team, x, y, heading, player.id);
  applyUpgrades(dino, player.upgrades);
  player.dinoId = dino.id;
  state.events.push({ type: 'spawn', playerId: player.id, dinoId: dino.id });
  return dino;
}

/** Respawn timers and dissolving empty teams. */
export function updatePlayers(state: GameState, dt: number): void {
  for (const p of state.players) {
    if (p.dinoId !== null) continue;
    p.respawn -= dt;
    if (p.respawn <= 0) spawnPlayerDino(state, p);
  }
  for (const t of state.teams) {
    t.emptyFor = state.players.some((p) => p.team === t.id) ? 0 : t.emptyFor + dt;
  }
  state.teams = state.teams.filter((t) => t.emptyFor < TEAM_EMPTY_TIMEOUT);
}

/** True when a dino stands inside its own team's base camp (safe zone). */
export function isInOwnBase(state: GameState, d: Dino): boolean {
  const team = findTeam(state, d.team);
  if (!team) return false;
  return (d.x - team.base.x) ** 2 + (d.y - team.base.y) ** 2 < BASE_RADIUS * BASE_RADIUS;
}

/** Called when a rider's dino dies. */
export function onPlayerDinoDeath(state: GameState, victim: Dino, killer: Dino | undefined): void {
  const vp = victim.playerId !== null ? findPlayer(state, victim.playerId) : undefined;
  const kp = killer?.playerId != null && killer.team !== victim.team ? findPlayer(state, killer.playerId) : undefined;
  // Pay before resetting the victim's upgrades: upgraded riders are worth more.
  if (kp) payBounty(state, kp, victim, vp, getDino(victim.kind).bounty);
  if (vp) {
    vp.dinoId = null;
    vp.respawn = RESPAWN_TIME;
    vp.deaths++;
    vp.upgrades = noUpgrades();
  }
  // K/D counts rider-vs-rider kills; wild kills are reported (and paid for) separately.
  if (kp && vp) kp.kills++;
  if (kp || vp) state.events.push({ type: 'kill', killer: kp?.id ?? null, victim: vp?.id ?? null, victimKind: victim.kind });
}

export function playerDino(state: GameState, player: PlayerState): Dino | undefined {
  return player.dinoId !== null ? findDino(state, player.dinoId) : undefined;
}
