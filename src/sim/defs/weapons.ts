import type { WeaponDef } from '../types';

const WEAPONS: Record<string, WeaponDef> = {
  // Fired in pairs by the Triceratops (one per flank): about the DPS of one bigger gun.
  sideCannon: {
    id: 'sideCannon',
    fireInterval: 0.3,
    projectileSpeed: 270,
    damage: 7,
    spread: 0.03,
    range: 270,
    projectileKind: 'bolt',
    projectileRadius: 2,
  },
  // Fired in pairs by the Velociraptor (one per flank): about the DPS of the old single dart.
  raptorSideGun: {
    id: 'raptorSideGun',
    fireInterval: 0.26,
    projectileSpeed: 300,
    damage: 3,
    spread: 0.04,
    range: 210,
    projectileKind: 'bolt',
    projectileRadius: 1.5,
  },
  // The Brontosaurus' flank guns: only the side facing the cursor fires, two at a time.
  broadsideGun: {
    id: 'broadsideGun',
    fireInterval: 0.35,
    projectileSpeed: 260,
    damage: 6,
    spread: 0.04,
    range: 260,
    projectileKind: 'bolt',
    projectileRadius: 2,
  },
  // The Brontosaurus' rear turret.
  tailGun: {
    id: 'tailGun',
    fireInterval: 0.4,
    projectileSpeed: 280,
    damage: 8,
    spread: 0.03,
    range: 240,
    projectileKind: 'bolt',
    projectileRadius: 2,
  },
  // The T-Rex's head guns: the two ends of the barrel across its head armor. Quick and accurate.
  rexHeadGun: {
    id: 'rexHeadGun',
    fireInterval: 0.22,
    projectileSpeed: 320,
    damage: 4,
    spread: 0.02,
    range: 260,
    projectileKind: 'bolt',
    projectileRadius: 1.5,
  },
  // The T-Rex's shoulder cannons, one in each armored shoulder frame.
  rexShoulderCannon: {
    id: 'rexShoulderCannon',
    fireInterval: 0.45,
    projectileSpeed: 260,
    damage: 8,
    spread: 0.04,
    range: 250,
    projectileKind: 'bolt',
    projectileRadius: 2.5,
  },
};

export function getWeapon(id: string): WeaponDef {
  const w = WEAPONS[id];
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}

export function registerWeapon(def: WeaponDef): void {
  WEAPONS[def.id] = def;
}
