import { describe, expect, it } from 'vitest';
import { campStage, towerStage } from '../../src/client/render/structureStages';
describe('structure damage stages', () => {
  it('map camp HP to six looks', () => {
    expect([3000, 2401, 2400, 1650, 900, 300, 1, 0].map((hp) => campStage(hp, 3000))).toEqual([0, 0, 1, 2, 3, 4, 4, 5]);
  });
  it('map tower HP to four looks', () => {
    expect([400, 241, 240, 100, 1, 0].map((hp) => towerStage(hp, 400))).toEqual([0, 0, 1, 2, 2, 3]);
  });
});
