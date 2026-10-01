import type { DinoDef } from '../types';
import { DEG } from '../math';

// Each dinosaur is pure data: body handling, optional articulated head, and weapon mounts.
// New species (e.g. a Diplodocus with broadside back mounts) only need a new entry here
// plus sprites.

const DINOS: Record<string, DinoDef> = {
  triceratops: {
    kind: 'triceratops',
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
