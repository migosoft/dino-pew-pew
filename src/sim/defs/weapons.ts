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
  raptorDart: {
    id: 'raptorDart',
    fireInterval: 0.22,
    projectileSpeed: 300,
    damage: 5,
    spread: 0.04,
    range: 210,
    projectileKind: 'bolt',
    projectileRadius: 1.5,
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
