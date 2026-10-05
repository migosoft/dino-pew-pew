import type { Vec2 } from '../types';

/** A round lake: deep inside r - rim, shallow out to r. Edges are wobbled by noise. */
export interface LakeDef {
  x: number;
  y: number;
  r: number;
  rim: number;
}

/** A river along a polyline, flowing from the first point to the last. Half-widths in px. */
export interface RiverDef {
  points: Vec2[];
  closed?: boolean;
  deep: number;
  wide: number;
}

/** A crossing: no deep water within r of (x, y). */
export interface FordDef {
  x: number;
  y: number;
  r: number;
}

/** Biases the obstacle scatter: more trees (forest), more rocks (rocks), or fewer of both (clear). */
export interface ZoneDef {
  kind: 'forest' | 'rocks' | 'clear';
  x: number;
  y: number;
  r: number;
  /** 0..1 at the centre, fading to 0 at r. */
  strength: number;
}

/** A hand-made map. Land types, exact shorelines and obstacles still come from seeded noise. */
export interface MapRecipe {
  id: string;
  /** Shown on the join screen (uppercase). */
  name: string;
  teams: number;
  /** Map size in 16 px tiles (square). */
  tiles: number;
  /** Fixed seed, so the map is the same every time. */
  seed: number;
  /** 'point': terrain, water and obstacles mirror through the map centre (fair for 2 teams). */
  symmetry: 'point' | 'none';
  /** Camp centres, one per team slot. */
  bases: Vec2[];
  /** Tower positions per team slot (5 each). */
  towers: Vec2[][];
  lakes: LakeDef[];
  rivers: RiverDef[];
  fords: FordDef[];
  zones: ZoneDef[];
}
