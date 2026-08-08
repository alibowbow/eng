import { describe, expect, it } from 'vitest';
import {
  REVIEW_DAY_MS,
  applyReviewResult,
  calculateReview,
  createInitialProgress,
  isReviewDue,
  normalizeReviewRating,
  sortByReviewPriority,
  toReviewSchedule,
} from './review';

const NOW = new Date('2026-08-08T00:00:00.000Z');

describe('review scheduling', () => {
  it('advances known cards through an explainable interval', () => {
    const initial = createInitialProgress('p1', NOW);
    const result = applyReviewResult(initial, 'known', { now: NOW, responseTimeMs: 1_200 });

    expect(result.mastery).toBe(1);
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);
    expect(result.successStreak).toBe(1);
    expect(new Date(result.nextReviewAt!).getTime() - NOW.getTime()).toBe(REVIEW_DAY_MS);
  });

  it('brings unknown and unsure cards back sooner without dropping below zero', () => {
    const mastered = {
      ...createInitialProgress('p1', NOW),
      mastery: 4 as const,
      successCount: 5,
      successStreak: 5,
    };
    const unknown = applyReviewResult(mastered, 'again', { now: NOW });
    const unsure = applyReviewResult(mastered, 'hard', { now: NOW });

    expect(normalizeReviewRating('again')).toBe('unknown');
    expect(normalizeReviewRating('easy')).toBe('known');
    expect(unknown.mastery).toBe(2);
    expect(unknown.successStreak).toBe(0);
    expect(unknown.failureCount).toBe(1);
    expect(new Date(unknown.nextReviewAt!).getTime() - NOW.getTime()).toBe(10 * 60_000);
    expect(unsure.mastery).toBe(3);
    expect(calculateReview(0, 'unknown').mastery).toBe(0);
  });

  it('tracks a running response average and confusion ids immutably', () => {
    const first = applyReviewResult(undefined, 'known', {
      patternId: 'p1',
      now: NOW,
      responseTimeMs: 1_000,
      confusedWith: ['p2'],
    });
    const second = applyReviewResult(first, 'known', {
      now: NOW.getTime() + REVIEW_DAY_MS,
      responseTimeMs: 3_000,
      confusedWith: ['p2', 'p3'],
    });

    expect(second.averageResponseMs).toBe(2_000);
    expect(second.confusedWith).toEqual(['p2', 'p3']);
    expect(first.confusedWith).toEqual(['p2']);
  });

  it('only treats learned records with a reached date as due', () => {
    const progress = applyReviewResult(createInitialProgress('p1', NOW), 'known', { now: NOW });
    expect(isReviewDue(progress, NOW.getTime() + REVIEW_DAY_MS - 1)).toBe(false);
    expect(isReviewDue(progress, NOW.getTime() + REVIEW_DAY_MS)).toBe(true);
    expect(isReviewDue(undefined, NOW)).toBe(false);
  });

  it('creates a separately storable review schedule from the progress record', () => {
    const progress = applyReviewResult(createInitialProgress('p1', NOW), 'known', { now: NOW });
    expect(toReviewSchedule(progress)).toMatchObject({
      patternId: 'p1',
      dueAt: '2026-08-09T00:00:00.000Z',
      intervalDays: 1,
      lapses: 0,
    });
  });

  it('prioritizes the earliest due card, then lower mastery, without mutating input', () => {
    const items = [{ id: 'late' }, { id: 'new' }, { id: 'early' }];
    const progress = new Map([
      ['late', { ...createInitialProgress('late', NOW), mastery: 3 as const, nextReviewAt: '2026-08-10T00:00:00.000Z' }],
      ['early', { ...createInitialProgress('early', NOW), mastery: 1 as const, nextReviewAt: '2026-08-09T00:00:00.000Z' }],
    ]);

    expect(sortByReviewPriority(items, progress).map(({ id }) => id)).toEqual(['early', 'late', 'new']);
    expect(items.map(({ id }) => id)).toEqual(['late', 'new', 'early']);
  });
});
