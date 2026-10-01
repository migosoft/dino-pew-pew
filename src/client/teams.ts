import { WILD_TEAM } from '../sim/types';
import type { TeamInfo } from '../net/protocol';

/** UI tint per team slot (GREEN, RED, GOLD, BLUE). */
export const TEAM_COLORS = [0x7ad06a, 0xe05048, 0xf0d060, 0x6890e8];

/** Texture palette key for a team id ("t0".."t3", or "wild"). */
export function paletteKey(team: string, teams: TeamInfo[]): string {
  if (team === WILD_TEAM) return 'wild';
  const t = teams.find((x) => x.id === team);
  return `t${t?.slot ?? 0}`;
}

export function teamColor(team: string, teams: TeamInfo[]): number {
  const t = teams.find((x) => x.id === team);
  return t ? TEAM_COLORS[t.slot] : 0xc8b48a;
}
