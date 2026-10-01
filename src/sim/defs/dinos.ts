import type { DinoDef } from '../types';
import { DEG } from '../math';

// Each dinosaur is pure data: body handling, optional articulated head, and weapon mounts.
// New species (e.g. a Diplodocus with broadside back mounts) only need a new entry here
// plus sprites.

const DINOS: Record<string, DinoDef> = {
  triceratops: {
    kind: 'triceratops',
    diet: 'herbivore',
    size: 'large',
    eatRate: 10,
    bounty: 25,
    // Gores with its horns.
    melee: { damage: 10, reach: 6, arc: 40 * DEG, interval: 0.8 },
    radius: 11,
    maxSpeed: 72,
    reverseSpeed: 30,
    accel: 110,
    decel: 170,
    turnRate: 2.1,
    turnPenaltyAtSpeed: 0.4,
    hp: 100,
    head: { offset: { x: 11, y: 0 }, maxYaw: 25 * DEG, yawSpeed: 2.8 },
    mounts: [
      {
        id: 'hornCannon',
        parent: 'head',
        offset: { x: 3, y: 0 },
        baseAngle: 0,
        arcHalf: 10 * DEG,
        turnSpeed: 3,
        weapon: 'hornCannon',
        muzzle: 11,
      },
    ],
  },
  // Fast and nimble with a small hitbox, but its dart launcher is weak.
  velociraptor: {
    kind: 'velociraptor',
    diet: 'carnivore',
    size: 'small',
    eatRate: 12,
    bounty: 20,
    // Slashes with its sickle claws.
    melee: { damage: 6, reach: 5, arc: 60 * DEG, interval: 0.5 },
    radius: 7,
    maxSpeed: 118,
    reverseSpeed: 45,
    accel: 230,
    decel: 300,
    turnRate: 3.6,
    turnPenaltyAtSpeed: 0.2,
    hp: 60,
    head: { offset: { x: 7, y: 0 }, maxYaw: 15 * DEG, yawSpeed: 4 },
    mounts: [
      {
        id: 'dart',
        parent: 'head',
        offset: { x: 2, y: 0 },
        baseAngle: 0,
        arcHalf: 15 * DEG,
        turnSpeed: 4,
        weapon: 'raptorDart',
        muzzle: 8,
      },
    ],
  },
};

export function getDino(kind: string): DinoDef {
  const d = DINOS[kind];
  if (!d) throw new Error(`Unknown dino: ${kind}`);
  return d;
}

export function registerDino(def: DinoDef): void {
  DINOS[def.kind] = def;
}

export function listDinos(): DinoDef[] {
  return Object.values(DINOS).filter((d) => !d.kind.startsWith('test-'));
}
