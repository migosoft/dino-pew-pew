import type { Vec2 } from '../types';
import { towerRing } from '../camp';
import type { MapRecipe } from './types';

const C = 4096;
const mirror = (p: Vec2): Vec2 => ({ x: 2 * C - p.x, y: 2 * C - p.y });

const CAMP_A = { x: 1024, y: 1024 };
const CAMP_B = mirror(CAMP_A);

/** River from the lake's north-east shore to the top-right corner, meandering a little. */
const RIVER_NE: Vec2[] = [
  { x: 4560, y: 3630 },
  { x: 5150, y: 3200 },
  { x: 5550, y: 2700 },
  { x: 6150, y: 2250 },
  { x: 6600, y: 1650 },
  { x: 7300, y: 1000 },
  { x: 8192, y: 300 },
];

/** Fords: two per river, plus a shallow causeway across the lake along the camp diagonal. */
const FORDS_NE = [
  { x: 5550, y: 2700, r: 130 },
  { x: 6600, y: 1650, r: 130 },
];

export const CROSSING: MapRecipe = {
  id: 'crossing',
  name: 'CROSSING',
  teams: 2,
  tiles: 512,
  seed: 0xc2055,
  symmetry: 'point',
  bases: [CAMP_A, CAMP_B],
  // Towers face the map centre.
  towers: [towerRing(CAMP_A, Math.PI / 4), towerRing(CAMP_B, (5 * Math.PI) / 4)],
  lakes: [{ x: C, y: C, r: 700, rim: 110 }],
  rivers: [
    { points: RIVER_NE, deep: 60, wide: 120 },
    { points: RIVER_NE.map(mirror), deep: 60, wide: 120 },
  ],
  fords: [
    ...FORDS_NE,
    ...FORDS_NE.map((f) => ({ ...mirror(f), r: f.r })),
    // Causeway: overlapping fords along the camp diagonal, out past the lake's deep core (≤ ~675 px with wobble).
    { x: C - 450, y: C - 450, r: 180 },
    { x: C - 250, y: C - 250, r: 200 },
    { x: C, y: C, r: 230 },
    { x: C + 250, y: C + 250, r: 200 },
    { x: C + 450, y: C + 450, r: 180 },
  ],
  zones: [
    // Flank forests along the rivers, one pair per half.
    { kind: 'forest', x: 4900, y: 2050, r: 900, strength: 0.55 },
    { kind: 'forest', x: 2050, y: 4900, r: 900, strength: 0.55 },
    { kind: 'forest', ...mirror({ x: 4900, y: 2050 }), r: 900, strength: 0.55 },
    { kind: 'forest', ...mirror({ x: 2050, y: 4900 }), r: 900, strength: 0.55 },
    // Rocks for cover at every river ford, on both banks.
    ...[...FORDS_NE, ...FORDS_NE.map((f) => ({ ...mirror(f), r: f.r }))].map((f) => ({ kind: 'rocks' as const, x: f.x, y: f.y, r: 360, strength: 0.6 })),
    // Open killing ground around each camp.
    { kind: 'clear', ...CAMP_A, r: 700, strength: 0.8 },
    { kind: 'clear', ...CAMP_B, r: 700, strength: 0.8 },
  ],
};
