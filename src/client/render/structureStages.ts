/** Camp building look by HP: 0 intact … 4 near ruin, 5 ruins. */
export function campStage(hp: number, maxHp: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (hp <= 0) return 5;
  const f = hp / maxHp;
  return f > 0.8 ? 0 : f > 0.55 ? 1 : f > 0.3 ? 2 : f > 0.1 ? 3 : 4;
}

/** Tower look by HP: 0 intact, 1 cracked, 2 wrecked, 3 rubble. */
export function towerStage(hp: number, maxHp: number): 0 | 1 | 2 | 3 {
  if (hp <= 0) return 3;
  const f = hp / maxHp;
  return f > 0.6 ? 0 : f > 0.25 ? 1 : 2;
}
