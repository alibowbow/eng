import type {
  LearningProgress,
  LearningRating,
  MasteryLevel,
  ReviewSchedule,
} from "./schema";

const KNOWN_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30] as const;

export interface ReviewResult {
  progress: LearningProgress;
  schedule: ReviewSchedule;
}

export function createLearningProgress(patternId: string, now = new Date()): LearningProgress {
  return {
    patternId,
    mastery: 0,
    successCount: 0,
    failureCount: 0,
    averageResponseMs: 0,
    successStreak: 0,
    confusedWith: [],
    updatedAt: now.toISOString(),
  };
}

function clampMastery(value: number): MasteryLevel {
  return Math.max(0, Math.min(5, Math.round(value))) as MasteryLevel;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function recordReview(
  previous: LearningProgress | undefined,
  rating: LearningRating,
  responseMs: number,
  now = new Date(),
): ReviewResult {
  if (!previous) throw new Error("recordReview에는 patternId를 포함한 기존 또는 초기 진도가 필요합니다.");
  const safeResponseMs = Number.isFinite(responseMs) ? Math.max(0, Math.round(responseMs)) : 0;
  const attempts = previous.successCount + previous.failureCount;
  const isSuccess = rating === "known";
  const isFailure = rating === "unknown";
  const mastery = clampMastery(
    rating === "known"
      ? previous.mastery + 1
      : rating === "unsure"
        ? Math.max(1, previous.mastery - (previous.mastery >= 4 ? 1 : 0))
        : Math.max(0, previous.mastery - 1),
  );
  const successStreak = isSuccess ? previous.successStreak + 1 : 0;
  const intervalDays =
    rating === "unknown"
      ? 0
      : rating === "unsure"
        ? Math.max(1, Math.floor(KNOWN_INTERVAL_DAYS[mastery] / 2))
        : KNOWN_INTERVAL_DAYS[mastery];
  const dueAt = rating === "unknown"
    ? new Date(now.getTime() + 10 * 60_000)
    : addDays(now, intervalDays);
  const averageResponseMs = Math.round(
    (previous.averageResponseMs * attempts + safeResponseMs) / Math.max(1, attempts + 1),
  );
  const isoNow = now.toISOString();

  return {
    progress: {
      ...previous,
      mastery,
      lastRating: rating,
      successCount: previous.successCount + (isSuccess ? 1 : 0),
      failureCount: previous.failureCount + (isFailure ? 1 : 0),
      averageResponseMs,
      lastStudiedAt: isoNow,
      nextReviewAt: dueAt.toISOString(),
      successStreak,
      updatedAt: isoNow,
    },
    schedule: {
      patternId: previous.patternId,
      dueAt: dueAt.toISOString(),
      intervalDays,
      easeFactor: Math.max(
        1.3,
        2.5 + (rating === "known" ? 0.1 : rating === "unsure" ? -0.05 : -0.2),
      ),
      lapses: previous.failureCount + (isFailure ? 1 : 0),
      updatedAt: isoNow,
    },
  };
}

export function isReviewDue(progress: LearningProgress, now = new Date()): boolean {
  return Boolean(progress.nextReviewAt && Date.parse(progress.nextReviewAt) <= now.getTime());
}

export function sortByReviewPriority(
  records: readonly LearningProgress[],
  now = new Date(),
): LearningProgress[] {
  const timestamp = now.getTime();
  return [...records].sort((a, b) => {
    const dueA = a.nextReviewAt ? Date.parse(a.nextReviewAt) : Number.POSITIVE_INFINITY;
    const dueB = b.nextReviewAt ? Date.parse(b.nextReviewAt) : Number.POSITIVE_INFINITY;
    const overdueA = Math.max(0, timestamp - dueA);
    const overdueB = Math.max(0, timestamp - dueB);
    return overdueB - overdueA || a.mastery - b.mastery || dueA - dueB;
  });
}
