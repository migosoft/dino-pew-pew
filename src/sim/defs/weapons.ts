import type { WeaponDef } from '../types';

const WEAPONS: Record<string, WeaponDef> = {
  hornCannon: {
    id: 'hornCannon',
    fireInterval: 0.26,
    projectileSpeed: 270,
    damage: 12,
    spread: 0.03,
    range: 270,
    projectileKind: 'bolt',
    projectileRadius: 2,
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
