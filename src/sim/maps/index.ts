import type { WorldGenOptions } from '../worldgen';
import { DEFAULT_TILES } from '../worldgen';
import type { MapRecipe } from './types';
import { CROSSING } from './crossing';

export type { MapRecipe } from './types';
export const RANDOM_MAP = 'random';
export const TEAM_COUNTS = [2, 3, 4];

/** What the first player on an empty server picks; repeated every round. */
export interface RoundSettings {
  teams: number;
  /** RANDOM_MAP or a fixed map id. */
  map: string;
}

export interface MapInfo {
  id: string;
  name: string;
  teams: number;
}

const MAPS: MapRecipe[] = [CROSSING];

export function getMap(id: string): MapRecipe | undefined {
  return MAPS.find((m) => m.id === id);
}

/** Maps offered for a team count: RANDOM first, then the fixed maps made for that count. */
export function mapsFor(teams: number): MapInfo[] {
  return [{ id: RANDOM_MAP, name: 'RANDOM', teams }, ...MAPS.filter((m) => m.teams === teams).map((m) => ({ id: m.id, name: m.name, teams: m.teams }))];
}

export function validSettings(teams: unknown, map: unknown): RoundSettings | null {
  if (typeof teams !== 'number' || !TEAM_COUNTS.includes(teams) || typeof map !== 'string') return null;
  if (map === RANDOM_MAP) return { teams, map };
  return getMap(map)?.teams === teams ? { teams, map } : null;
}

/** World options for a round. Server and client both call this, so they generate the same world. */
export function worldOptionsFor(map: string, teams: number, tiles = DEFAULT_TILES): WorldGenOptions {
  const recipe = getMap(map);
  if (recipe) return { cols: recipe.tiles, rows: recipe.tiles, teams: recipe.teams, map: recipe };
  return { cols: tiles, rows: tiles, teams };
}
