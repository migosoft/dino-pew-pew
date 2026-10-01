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
    // Right mouse: a short charge straight ahead that rams everything in the way.
    ability: { kind: 'dash', cooldown: 15, duration: 0.4, speed: 260, damage: 20, hitReach: 4 },
    // Two cannons hang from the armored saddle, one on each flank, and fire together.
    volley: true,
    mounts: [
      {
        id: 'sideCannonL',
        parent: 'body',
        offset: { x: 2, y: -13 },
        baseAngle: 0,
        arcHalf: 35 * DEG,
        turnSpeed: 3,
        weapon: 'sideCannon',
        muzzle: 15,
      },
      {
        id: 'sideCannonR',
        parent: 'body',
        offset: { x: 2, y: 13 },
        baseAngle: 0,
        arcHalf: 35 * DEG,
        turnSpeed: 3,
        weapon: 'sideCannon',
        muzzle: 15,
      },
    ],
  },
  // Fast and nimble with a small hitbox, but its twin side guns are light.
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
    // Right mouse: a leap toward the cursor (over rocks too) that slams down on whoever is below.
    ability: { kind: 'leap', cooldown: 15, duration: 0.45, minRange: 30, maxRange: 110, damage: 18, hitReach: 8 },
    // Two small guns hang from the metal saddle, one on each flank, and fire together.
    volley: true,
    mounts: [
      {
        id: 'sideGunL',
        parent: 'body',
        offset: { x: 1, y: -8 },
        baseAngle: 0,
        arcHalf: 25 * DEG,
        turnSpeed: 4.5,
        weapon: 'raptorSideGun',
        muzzle: 8,
      },
      {
        id: 'sideGunR',
        parent: 'body',
        offset: { x: 1, y: 8 },
        baseAngle: 0,
        arcHalf: 25 * DEG,
        turnSpeed: 4.5,
        weapon: 'raptorSideGun',
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
