// Draw-order bands. Objects standing on the ground are y-sorted inside the WORLD band.
export const DEPTH = {
  ground: -1000,
  decal: -900,
  shadow: -800,
  world: 0, // + y position
  arc: 40000,
  projectile: 50000,
  fx: 55000,
  overlay: 60000,
  canopy: 100000,
  hud: 200000,
} as const;
