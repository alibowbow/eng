import type { ConversationPattern, LearningProgress } from '../content/schema';
import { isReviewDue } from './review';

export type MasteryFilter =
  | 'unlearned'
  | 'learning'
  | 'unknown'
  | 'unsure'
  | 'known'
  | 'mastered'
  | 'due';

export interface PatternFilters {
  categoryIds?: readonly string[];
  situationIds?: readonly string[];
  tags?: readonly string[];
  cefr?: readonly ConversationPattern['cefr'][];
  priority?: readonly ConversationPattern['priority'][];
  register?: readonly ConversationPattern['register'][number][];
  mastery?: readonly MasteryFilter[];
  favoritesOnly?: boolean;
  reviewDueOnly?: boolean;
  newOnly?: boolean;
}

export type ProgressLookup =
  | ReadonlyMap<string, LearningProgress>
  | Readonly<Record<string, LearningProgress | undefined>>;

export type NotesLookup = ReadonlyMap<string, string> | Readonly<Record<string, string | undefined>>;

export interface SearchPatternsOptions {
  query?: string;
  filters?: PatternFilters;
  progressById?: ProgressLookup;
  notesById?: NotesLookup;
  favoriteIds?: ReadonlySet<string> | readonly string[];
  now?: Date | number | string;
  /** Items released on or after this time receive the `newOnly` match. */
  newSince?: Date | number | string;
}

function lookup<T>(source: ReadonlyMap<string, T> | Readonly<Record<string, T | undefined>> | undefined, id: string): T | undefined {
  if (!source) return undefined;
  if (typeof (source as ReadonlyMap<string, T>).get === 'function') {
    return (source as ReadonlyMap<string, T>).get(id);
  }
  return (source as Readonly<Record<string, T | undefined>>)[id];
}

function intersects(values: readonly string[], selected: readonly string[] | undefined): boolean {
  return !selected?.length || selected.some((value) => values.includes(value));
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(/[’‘`']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSearchText(pattern: ConversationPattern, personalNote = ''): string {
  const relationIds = Object.values(pattern.relations).flat();
  const searchable = [
    pattern.pattern,
    pattern.english,
    pattern.korean,
    pattern.intentKo,
    pattern.nuanceKo,
    pattern.usageNoteKo,
    ...pattern.categoryIds,
    ...pattern.situationIds,
    ...pattern.tags,
    ...(pattern.aliases ?? []),
    ...pattern.examples.flatMap((example) => [example.english, example.korean, example.noteKo, example.situationId]),
    ...pattern.variants.flatMap((variant) => [variant.english, variant.korean, variant.nuanceKo, variant.register]),
    ...pattern.replies.flatMap((reply) => [reply.english, reply.korean, reply.type]),
    ...pattern.commonMistakes.flatMap((mistake) => [mistake.wrong, mistake.corrected, mistake.explanationKo]),
    ...relationIds,
    personalNote,
  ];
  return normalizeSearchText(searchable.filter(Boolean).join(' '));
}

export function matchesSearchQuery(pattern: ConversationPattern, query: string, personalNote = ''): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  const haystack = buildSearchText(pattern, personalNote);
  return normalizedQuery.split(' ').every((token) => haystack.includes(token));
}

function matchesMasteryFilters(
  selected: readonly MasteryFilter[] | undefined,
  progress: LearningProgress | undefined,
  now: SearchPatternsOptions['now'],
): boolean {
  if (!selected?.length) return true;
  return selected.some((filter) => {
    if (filter === 'unlearned') return !progress || progress.mastery === 0;
    if (filter === 'learning') return Boolean(progress && progress.mastery > 0 && progress.mastery < 5);
    if (filter === 'unknown') return progress?.lastRating === 'unknown';
    if (filter === 'unsure') return progress?.lastRating === 'unsure';
    if (filter === 'known') return progress?.lastRating === 'known';
    if (filter === 'mastered') return progress?.mastery === 5;
    return isReviewDue(progress, now);
  });
}

function isFavorite(id: string, favorites: SearchPatternsOptions['favoriteIds']): boolean {
  if (!favorites) return false;
  if (typeof (favorites as ReadonlySet<string>).has === 'function') {
    return (favorites as ReadonlySet<string>).has(id);
  }
  return (favorites as readonly string[]).includes(id);
}

export function matchesPatternFilters(
  pattern: ConversationPattern,
  filters: PatternFilters = {},
  context: Pick<SearchPatternsOptions, 'progressById' | 'favoriteIds' | 'now' | 'newSince'> = {},
): boolean {
  if (!intersects(pattern.categoryIds, filters.categoryIds)) return false;
  if (!intersects(pattern.situationIds, filters.situationIds)) return false;
  if (!intersects(pattern.tags, filters.tags)) return false;
  if (filters.cefr?.length && !filters.cefr.includes(pattern.cefr)) return false;
  if (filters.priority?.length && !filters.priority.includes(pattern.priority)) return false;
  if (filters.register?.length && !filters.register.some((register) => pattern.register.includes(register))) return false;
  if (filters.favoritesOnly && !isFavorite(pattern.id, context.favoriteIds)) return false;

  const progress = lookup(context.progressById, pattern.id);
  if (filters.reviewDueOnly && !isReviewDue(progress, context.now)) return false;
  if (!matchesMasteryFilters(filters.mastery, progress, context.now)) return false;

  if (filters.newOnly) {
    if (!pattern.releasedAt) return false;
    const releasedAt = new Date(pattern.releasedAt).getTime();
    const threshold = context.newSince === undefined
      ? Date.now() - 7 * 86_400_000
      : new Date(context.newSince).getTime();
    if (!Number.isFinite(releasedAt) || !Number.isFinite(threshold) || releasedAt < threshold) return false;
  }

  return true;
}

/** Search and filter while preserving the canonical input order. */
export function searchPatterns<T extends ConversationPattern>(
  patterns: readonly T[],
  options: SearchPatternsOptions = {},
): T[] {
  return patterns.filter((pattern) => {
    if (!matchesPatternFilters(pattern, options.filters, options)) return false;
    const note = lookup(options.notesById, pattern.id) ?? '';
    return matchesSearchQuery(pattern, options.query ?? '', note);
  });
}
