import type { DinoDef } from '../types';
import { DEG } from '../math';

// Each dinosaur is pure data: body handling, optional articulated head, and weapon mounts.
// New species only need a new entry here plus sprites (the Brontosaurus is the example
// for broadside mounts on a weapons platform).

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
    wadeSpeed: 0.7,
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
    // Small: deep water slows it down the most.
    wadeSpeed: 0.4,
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
  // Huge, slow and tough: a weapons platform on its back carries two guns on each flank and
  // one at the rear. Only the guns on the side of the cursor fire. Its long legs barely
  // notice deep water.
  brontosaurus: {
    kind: 'brontosaurus',
    diet: 'herbivore',
    size: 'large',
    eatRate: 9,
    bounty: 40,
    // Stamps with its front feet.
    melee: { damage: 8, reach: 5, arc: 50 * DEG, interval: 0.9 },
    radius: 15,
    maxSpeed: 50,
    reverseSpeed: 22,
    accel: 70,
    decel: 120,
    turnRate: 1.3,
    turnPenaltyAtSpeed: 0.5,
    hp: 220,
    wadeSpeed: 0.9,
    // The long neck and the head turn together from the shoulders.
    head: { offset: { x: 12, y: 0 }, maxYaw: 40 * DEG, yawSpeed: 1.8, under: true },
    tail: { offset: { x: -13, y: 0 } },
    // The rider sits in the glass dome at the front of the platform.
    seat: { x: 5, y: 0 },
    // Right mouse: a sweep of the tail that hits and shoves everything behind it.
    ability: { kind: 'whip', cooldown: 15, duration: 0.35, damage: 22, hitReach: 22, arc: 80 * DEG, knockback: 20 },
    fireMode: 'side',
    mounts: [
      {
        id: 'broadsideL1',
        parent: 'body',
        offset: { x: 8, y: -13 },
        baseAngle: -90 * DEG,
        arcHalf: 60 * DEG,
        turnSpeed: 2.5,
        weapon: 'broadsideGun',
        muzzle: 9,
      },
      {
        id: 'broadsideL2',
        parent: 'body',
        offset: { x: -6, y: -13 },
        baseAngle: -90 * DEG,
        arcHalf: 60 * DEG,
        turnSpeed: 2.5,
        weapon: 'broadsideGun',
        muzzle: 9,
      },
      {
        id: 'broadsideR1',
        parent: 'body',
        offset: { x: 8, y: 13 },
        baseAngle: 90 * DEG,
        arcHalf: 60 * DEG,
        turnSpeed: 2.5,
        weapon: 'broadsideGun',
        muzzle: 9,
      },
      {
        id: 'broadsideR2',
        parent: 'body',
        offset: { x: -6, y: 13 },
        baseAngle: 90 * DEG,
        arcHalf: 60 * DEG,
        turnSpeed: 2.5,
        weapon: 'broadsideGun',
        muzzle: 9,
      },
      {
        id: 'tailGun',
        parent: 'body',
        offset: { x: -15, y: 0 },
        baseAngle: Math.PI,
        arcHalf: 55 * DEG,
        turnSpeed: 2.5,
        weapon: 'tailGun',
        muzzle: 9,
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
