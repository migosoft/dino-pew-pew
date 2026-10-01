import type { Dino, GameState, PlayerState } from './types';
import { findPlayer } from './world';
import { isInOwnBase, playerDino } from './players';

export type UpgradeStat = 'damage' | 'range' | 'fireRate' | 'armor';
export type Upgrades = Record<UpgradeStat, number>;

export const UPGRADE_STATS: UpgradeStat[] = ['damage', 'range', 'fireRate', 'armor'];
export const MAX_UPGRADE_LEVEL = 5;
export const COST_GROWTH = 1.6;

export const UPGRADES: Record<UpgradeStat, { label: string; baseCost: number; perLevel: string }> = {
  damage: { label: 'DAMAGE', baseCost: 60, perLevel: '+15% DMG' },
  range: { label: 'RANGE', baseCost: 40, perLevel: '+12% RANGE' },
  fireRate: { label: 'FIRE RATE', baseCost: 70, perLevel: '-12% INTERVAL' },
  armor: { label: 'ARMOR', baseCost: 60, perLevel: '-8% DMG TAKEN' },
};

/** Money for killing a wild dino is its species bounty; an enemy rider pays more the more upgraded it was. */
export const RIDER_BOUNTY_BASE = 40;
export const RIDER_BOUNTY_PER_LEVEL = 10;

export function noUpgrades(): Upgrades {
  return { damage: 0, range: 0, fireRate: 0, armor: 0 };
}

export function upgradeCost(stat: UpgradeStat, level: number): number {
  return Math.round(UPGRADES[stat].baseCost * COST_GROWTH ** level);
}

export function totalLevels(u: Upgrades): number {
  return u.damage + u.range + u.fireRate + u.armor;
}

/** Set a dino's stat multipliers from its rider's upgrade levels. */
export function applyUpgrades(d: Dino, u: Upgrades): void {
  d.damageMul = 1 + 0.15 * u.damage;
  d.rangeMul = 1 + 0.12 * u.range;
  d.fireIntervalMul = 0.88 ** u.fireRate;
  d.armor = 0.08 * u.armor;
}

export type BuyResult = 'ok' | 'not-in-base' | 'max-level' | 'no-money' | 'no-dino';

/** Spend money on one upgrade level. Only possible while standing in your own base camp. */
export function buyUpgrade(state: GameState, playerId: number, stat: UpgradeStat): BuyResult {
  const p = findPlayer(state, playerId);
  const d = p && playerDino(state, p);
  if (!p || !d) return 'no-dino';
  if (!isInOwnBase(state, d)) return 'not-in-base';
  const level = p.upgrades[stat];
  if (level >= MAX_UPGRADE_LEVEL) return 'max-level';
  const cost = upgradeCost(stat, level);
  if (p.money < cost) return 'no-money';
  p.money -= cost;
  p.upgrades[stat] = level + 1;
  applyUpgrades(d, p.upgrades);
  return 'ok';
}

/** Pay the killer (if a rider) for a kill. */
export function payBounty(state: GameState, killer: PlayerState, victim: Dino, victimPlayer: PlayerState | undefined, bounty: number): void {
  const amount = victimPlayer ? RIDER_BOUNTY_BASE + RIDER_BOUNTY_PER_LEVEL * totalLevels(victimPlayer.upgrades) : bounty;
  killer.money += amount;
  state.events.push({ type: 'bounty', playerId: killer.id, amount, x: victim.x, y: victim.y });
}
