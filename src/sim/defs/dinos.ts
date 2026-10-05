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
    // Four sturdy legs: river currents don't bother it.
    currentSlow: 1,
    head: { offset: { x: 11, y: 0 }, maxYaw: 25 * DEG, yawSpeed: 2.8 },
    // The tail is drawn as links that bend from here (client/render/chains.ts).
    tail: { offset: { x: -7, y: 0 } },
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
    wadeSpeed: 0.25,
    // Light: a river current slows it and carries it downstream.
    currentSlow: 0.6,
    currentDrift: 0.8,
    head: { offset: { x: 7, y: 0 }, maxYaw: 15 * DEG, yawSpeed: 4 },
    tail: { offset: { x: -5, y: 0 } },
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
  // notice deep water. Its art is drawn at BRONTO_SCALE (brontosaurusArt.ts); the sizes
  // here (radius, head, tail, seat, mounts) use the same factor.
  brontosaurus: {
    kind: 'brontosaurus',
    diet: 'herbivore',
    size: 'large',
    eatRate: 9,
    bounty: 40,
    // Stamps with its front feet.
    melee: { damage: 8, reach: 7, arc: 50 * DEG, interval: 0.9 },
    radius: 22,
    maxSpeed: 50,
    reverseSpeed: 22,
    accel: 70,
    decel: 120,
    turnRate: 1.3,
    turnPenaltyAtSpeed: 0.5,
    hp: 220,
    wadeSpeed: 0.9,
    currentSlow: 1,
    // The long neck and the head turn together from the shoulders.
    head: { offset: { x: 18, y: 0 }, maxYaw: 40 * DEG, yawSpeed: 1.8, under: true },
    tail: { offset: { x: -19, y: 0 } },
    // The rider sits in the glass dome at the front of the platform.
    seat: { x: 8, y: 0 },
    // Right mouse: a sweep of the tail that hits and shoves everything behind it.
    ability: { kind: 'whip', cooldown: 15, duration: 0.35, damage: 22, hitReach: 32, arc: 80 * DEG, knockback: 20 },
    fireMode: 'side',
    mounts: [
      {
        id: 'broadsideL1',
        parent: 'body',
        offset: { x: 12, y: -20 },
        baseAngle: -90 * DEG,
        arcHalf: 60 * DEG,
        turnSpeed: 2.5,
        weapon: 'broadsideGun',
        muzzle: 11,
      },
      {
        id: 'broadsideL2',
        parent: 'body',
        offset: { x: -9, y: -20 },
        baseAngle: -90 * DEG,
        arcHalf: 60 * DEG,
        turnSpeed: 2.5,
        weapon: 'broadsideGun',
        muzzle: 11,
      },
      {
        id: 'broadsideR1',
        parent: 'body',
        offset: { x: 12, y: 20 },
        baseAngle: 90 * DEG,
        arcHalf: 60 * DEG,
        turnSpeed: 2.5,
        weapon: 'broadsideGun',
        muzzle: 11,
      },
      {
        id: 'broadsideR2',
        parent: 'body',
        offset: { x: -9, y: 20 },
        baseAngle: 90 * DEG,
        arcHalf: 60 * DEG,
        turnSpeed: 2.5,
        weapon: 'broadsideGun',
        muzzle: 11,
      },
      {
        id: 'tailGun',
        parent: 'body',
        offset: { x: -22, y: 0 },
        baseAngle: Math.PI,
        arcHalf: 55 * DEG,
        turnSpeed: 2.5,
        weapon: 'tailGun',
        muzzle: 11,
      },
    ],
  },
  // The armored T-Rex: twin guns on its head armor that turn with the head, two cannons in its
  // shoulder frames, and a lunging bite that hurts. Bigger than a Triceratops, smaller than a
  // Brontosaurus; it walks on two legs, so deep water and river currents slow it a little.
  trex: {
    kind: 'trex',
    diet: 'carnivore',
    size: 'large',
    eatRate: 11,
    bounty: 35,
    // Snaps with its jaws.
    melee: { damage: 12, reach: 7, arc: 35 * DEG, interval: 0.9 },
    radius: 15,
    maxSpeed: 66,
    reverseSpeed: 28,
    accel: 95,
    decel: 150,
    turnRate: 1.8,
    turnPenaltyAtSpeed: 0.45,
    hp: 170,
    wadeSpeed: 0.75,
    currentSlow: 0.8,
    head: { offset: { x: 14, y: 0 }, maxYaw: 30 * DEG, yawSpeed: 2.4 },
    tail: { offset: { x: -11, y: 0 } },
    // The rider sits on the harness behind the head.
    seat: { x: 9, y: 0 },
    // Right mouse: a short lunge, and the jaws close on the nearest dino in front.
    ability: { kind: 'bite', cooldown: 15, duration: 0.35, speed: 140, damage: 55, hitReach: 14, arc: 35 * DEG, knockback: 10 },
    mounts: [
      {
        id: 'headGunL',
        parent: 'head',
        offset: { x: 0, y: -8 },
        baseAngle: 0,
        arcHalf: 20 * DEG,
        turnSpeed: 4,
        weapon: 'rexHeadGun',
        muzzle: 9,
      },
      {
        id: 'headGunR',
        parent: 'head',
        offset: { x: 0, y: 8 },
        baseAngle: 0,
        arcHalf: 20 * DEG,
        turnSpeed: 4,
        weapon: 'rexHeadGun',
        muzzle: 9,
      },
      {
        id: 'shoulderGunL',
        parent: 'body',
        offset: { x: 4, y: -13 },
        baseAngle: 0,
        arcHalf: 40 * DEG,
        turnSpeed: 3,
        weapon: 'rexShoulderCannon',
        muzzle: 10,
      },
      {
        id: 'shoulderGunR',
        parent: 'body',
        offset: { x: 4, y: 13 },
        baseAngle: 0,
        arcHalf: 40 * DEG,
        turnSpeed: 3,
        weapon: 'rexShoulderCannon',
        muzzle: 10,
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
