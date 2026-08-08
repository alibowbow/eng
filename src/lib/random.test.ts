import { describe, expect, it } from 'vitest';
import {
  createSeededRandom,
  restoreOriginalOrder,
  sampleUnique,
  sampleUniqueBy,
} from './random';

describe('random sessions', () => {
  it('selects the requested number without duplicate ids or source mutation', () => {
    const source = Array.from({ length: 20 }, (_, id) => ({ id }));
    const result = sampleUniqueBy(source, 8, (item) => item.id, createSeededRandom('session'));

    expect(result).toHaveLength(8);
    expect(new Set(result.map((item) => item.id)).size).toBe(8);
    expect(source.map((item) => item.id)).toEqual(Array.from({ length: 20 }, (_, id) => id));
  });

  it('deduplicates a malformed source before sampling', () => {
    const source = [{ id: 'a' }, { id: 'a' }, { id: 'b' }];
    expect(sampleUniqueBy(source, 20, (item) => item.id, () => 0)).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('clamps invalid counts and safely handles extreme random values', () => {
    expect(sampleUnique([1, 2, 3], -4)).toEqual([]);
    expect(sampleUnique([1, 2, 3], 10, () => 1)).toHaveLength(3);
  });

  it('is reproducible with a seed and restores canonical sorting', () => {
    const source = ['a', 'b', 'c', 'd'];
    expect(sampleUnique(source, 4, createSeededRandom(42))).toEqual(
      sampleUnique(source, 4, createSeededRandom(42)),
    );
    const shuffled = [{ sortKey: '10' }, { sortKey: '2' }, { sortKey: '1' }];
    expect(restoreOriginalOrder(shuffled, (item) => item.sortKey).map((item) => item.sortKey)).toEqual(['1', '2', '10']);
  });
});
