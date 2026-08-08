import type {
  LearningProgress,
  LearningRating,
  MasteryLevel,
  ReviewSchedule,
} from '../content/schema';

export const REVIEW_MINUTE_MS = 60_000;
export const REVIEW_DAY_MS = 86_400_000;

/** UI aliases are accepted so the scheduling engine is not coupled to labels. */
export type ReviewRating = LearningRating | 'again' | 'hard' | 'good' | 'easy';

export interface ReviewOptions {
  /** Required only when `previous` is undefined. */
  patternId?: string;
  now?: Date | number | string;
  responseTimeMs?: number;
  confusedWith?: string[];
}

export interface ReviewCalculation {
  rating: LearningRating;
  mastery: MasteryLevel;
  intervalMs: number;
  intervalDays: number;
  easeFactor: number;
  lapses: number;
}

const KNOWN_INTERVAL_DAYS: Readonly<Record<MasteryLevel, number>> = {
  0: 0,
  1: 1,
  2: 3,
  3: 7,
  4: 21,
  5: 60,
};

const UNSURE_INTERVAL_DAYS: Readonly<Record<MasteryLevel, number>> = {
  0: 0.5,
  1: 0.5,
  2: 1,
  3: 3,
  4: 7,
  5: 14,
};

function clampMastery(value: number): MasteryLevel {
  return Math.max(0, Math.min(5, Math.round(value))) as MasteryLevel;
}

function asDate(value: ReviewOptions['now']): Date {
  const date = value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('A valid review date is required.');
  }
  return date;
}

export function normalizeReviewRating(rating: ReviewRating): LearningRating {
  if (rating === 'again') return 'unknown';
  if (rating === 'hard') return 'unsure';
  if (rating === 'good' || rating === 'easy') return 'known';
  return rating;
}

/**
 * A deliberately small, explainable spaced-review policy.
 *
 * - unknown: retry in ten minutes and lose two mastery steps
 * - unsure: step back once and return between 12 hours and 14 days
 * - known: advance one step through 1, 3, 7, 21 and 60 day intervals
 *
 * Long success streaks gently extend the top interval, capped at 180 days.
 */
export function calculateReview(
  mastery: MasteryLevel,
  ratingInput: ReviewRating,
  successStreak = 0,
  previousLapses = 0,
): ReviewCalculation {
  const rating = normalizeReviewRating(ratingInput);

  if (rating === 'unknown') {
    const nextMastery = clampMastery(mastery - 2);
    return {
      rating,
      mastery: nextMastery,
      intervalMs: 10 * REVIEW_MINUTE_MS,
      intervalDays: 10 / (24 * 60),
      easeFactor: Math.max(1.3, 2.5 - (previousLapses + 1) * 0.12),
      lapses: previousLapses + 1,
    };
  }

  if (rating === 'unsure') {
    const nextMastery = clampMastery(mastery === 0 ? 1 : mastery - 1);
    const intervalDays = UNSURE_INTERVAL_DAYS[nextMastery];
    return {
      rating,
      mastery: nextMastery,
      intervalMs: intervalDays * REVIEW_DAY_MS,
      intervalDays,
      easeFactor: Math.max(1.3, 2.35 - previousLapses * 0.1),
      lapses: previousLapses,
    };
  }

  const nextMastery = clampMastery(mastery + 1);
  const streakBonus = nextMastery === 5 ? Math.min(3, 1 + Math.max(0, successStreak) * 0.12) : 1;
  const intervalDays = Math.min(180, KNOWN_INTERVAL_DAYS[nextMastery] * streakBonus);

  return {
    rating,
    mastery: nextMastery,
    intervalMs: intervalDays * REVIEW_DAY_MS,
    intervalDays,
    easeFactor: Math.min(3, 2.5 + Math.min(0.5, successStreak * 0.03)),
    lapses: previousLapses,
  };
}

export function createInitialProgress(patternId: string, now: ReviewOptions['now'] = new Date()): LearningProgress {
  if (!patternId.trim()) throw new TypeError('patternId must not be empty.');
  const updatedAt = asDate(now).toISOString();
  return {
    patternId,
    mastery: 0,
    successCount: 0,
    failureCount: 0,
    averageResponseMs: 0,
    successStreak: 0,
    confusedWith: [],
    updatedAt,
  };
}

/** Apply a judgement without mutating the object read from IndexedDB. */
export function applyReviewResult(
  previous: LearningProgress | undefined,
  ratingInput: ReviewRating,
  options: ReviewOptions = {},
): LearningProgress {
  const now = asDate(options.now);
  const patternId = previous?.patternId ?? options.patternId;
  if (!patternId?.trim()) {
    throw new TypeError('options.patternId is required for a new review record.');
  }

  const current = previous ?? createInitialProgress(patternId, now);
  const rating = normalizeReviewRating(ratingInput);
  const nextStreak = rating === 'known' ? current.successStreak + 1 : 0;
  const calculation = calculateReview(current.mastery, rating, nextStreak, current.failureCount);
  const responseTimeMs = Math.max(0, Number.isFinite(options.responseTimeMs) ? options.responseTimeMs! : 0);
  const previousReviewCount = current.successCount + current.failureCount;
  const reviewCount = previousReviewCount + 1;
  const averageResponseMs = responseTimeMs
    ? Math.round((current.averageResponseMs * previousReviewCount + responseTimeMs) / reviewCount)
    : current.averageResponseMs;
  const nextReviewAt = new Date(now.getTime() + calculation.intervalMs).toISOString();

  return {
    ...current,
    mastery: calculation.mastery,
    lastRating: calculation.rating,
    successCount: current.successCount + (rating === 'known' ? 1 : 0),
    failureCount: current.failureCount + (rating === 'known' ? 0 : 1),
    averageResponseMs,
    lastStudiedAt: now.toISOString(),
    nextReviewAt,
    successStreak: nextStreak,
    confusedWith: options.confusedWith
      ? Array.from(new Set([...current.confusedWith, ...options.confusedWith])).filter(Boolean)
      : current.confusedWith,
    updatedAt: now.toISOString(),
  };
}

export function toReviewSchedule(
  progress: LearningProgress,
  previous?: ReviewSchedule,
): ReviewSchedule | undefined {
  if (!progress.nextReviewAt || !progress.lastRating) return undefined;
  const reviewedAt = progress.lastStudiedAt ? new Date(progress.lastStudiedAt).getTime() : Date.now();
  const dueAt = new Date(progress.nextReviewAt).getTime();
  const lapses = previous
    ? previous.lapses + Number(progress.lastRating === 'unknown')
    : progress.failureCount;
  const easeFactor = progress.lastRating === 'known'
    ? Math.min(3, 2.5 + Math.max(0, progress.successStreak - 1) * 0.03)
    : progress.lastRating === 'unsure'
      ? Math.max(1.3, 2.35 - lapses * 0.1)
      : Math.max(1.3, 2.5 - lapses * 0.12);
  return {
    patternId: progress.patternId,
    dueAt: progress.nextReviewAt,
    intervalDays: Math.max(0, (dueAt - reviewedAt) / REVIEW_DAY_MS),
    easeFactor,
    lapses,
    updatedAt: progress.updatedAt,
  };
}

export function isReviewDue(
  progress: Pick<LearningProgress, 'lastStudiedAt' | 'nextReviewAt'> | undefined,
  now: Date | number | string = new Date(),
): boolean {
  if (!progress?.lastStudiedAt || !progress.nextReviewAt) return false;
  const dueAt = new Date(progress.nextReviewAt).getTime();
  const currentTime = new Date(now).getTime();
  return Number.isFinite(dueAt) && Number.isFinite(currentTime) && dueAt <= currentTime;
}

export function sortByReviewPriority<T extends { id: string }>(
  items: readonly T[],
  progressById: ReadonlyMap<string, LearningProgress> | Readonly<Record<string, LearningProgress>>,
): T[] {
  const getProgress = (id: string) => {
    if (typeof (progressById as ReadonlyMap<string, LearningProgress>).get === 'function') {
      return (progressById as ReadonlyMap<string, LearningProgress>).get(id);
    }
    return (progressById as Readonly<Record<string, LearningProgress>>)[id];
  };

  return items
    .map((item, index) => ({ item, index, progress: getProgress(item.id) }))
    .sort((a, b) => {
      const aDue = a.progress?.nextReviewAt ? new Date(a.progress.nextReviewAt).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.progress?.nextReviewAt ? new Date(b.progress.nextReviewAt).getTime() : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      if ((a.progress?.mastery ?? 0) !== (b.progress?.mastery ?? 0)) {
        return (a.progress?.mastery ?? 0) - (b.progress?.mastery ?? 0);
      }
      return a.index - b.index;
    })
    .map(({ item }) => item);
}
