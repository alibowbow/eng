export type RandomSource = () => number;

function safeRandom(random: RandomSource): number {
  const value = random();
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.999_999_999_999, Math.max(0, value));
}

/** Deterministic PRNG useful for reproducible sessions and unit tests. */
export function createSeededRandom(seed: number | string): RandomSource {
  let state =
    typeof seed === 'number'
      ? seed >>> 0
      : Array.from(seed).reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16_777_619), 2_166_136_261) >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Partial Fisher-Yates sampling. The source array is never mutated. */
export function sampleUnique<T>(
  items: readonly T[],
  requestedCount: number,
  random: RandomSource = Math.random,
): T[] {
  const count = Math.min(items.length, Math.max(0, Math.floor(requestedCount)));
  if (count === 0) return [];
  const pool = [...items];

  for (let index = 0; index < count; index += 1) {
    const offset = Math.floor(safeRandom(random) * (pool.length - index));
    const selectedIndex = index + offset;
    [pool[index], pool[selectedIndex]] = [pool[selectedIndex], pool[index]];
  }

  return pool.slice(0, count);
}

/** Dedupe malformed or merged content by stable id before sampling. */
export function sampleUniqueBy<T, Key>(
  items: readonly T[],
  requestedCount: number,
  getKey: (item: T) => Key,
  random: RandomSource = Math.random,
): T[] {
  const seen = new Set<Key>();
  const uniqueItems: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueItems.push(item);
  }
  return sampleUnique(uniqueItems, requestedCount, random);
}

export function shuffleUniqueBy<T, Key>(
  items: readonly T[],
  getKey: (item: T) => Key,
  random: RandomSource = Math.random,
): T[] {
  return sampleUniqueBy(items, Number.POSITIVE_INFINITY, getKey, random);
}

/** Restore the canonical content order after leaving a random session. */
export function restoreOriginalOrder<T>(
  items: readonly T[],
  getSortKey: (item: T) => string | number,
): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aKey = getSortKey(a.item);
      const bKey = getSortKey(b.item);
      const comparison = typeof aKey === 'number' && typeof bKey === 'number'
        ? aKey - bKey
        : String(aKey).localeCompare(String(bKey), undefined, { numeric: true });
      return comparison || a.index - b.index;
    })
    .map(({ item }) => item);
}
