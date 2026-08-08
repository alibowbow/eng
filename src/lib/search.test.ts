import { describe, expect, it } from 'vitest';
import type { LearningProgress } from '../content/schema';
import { makePattern } from '../test/fixtures';
import {
  buildSearchText,
  matchesPatternFilters,
  matchesSearchQuery,
  normalizeSearchText,
  searchPatterns,
} from './search';

describe('pattern search and filters', () => {
  const aboutTo = makePattern();
  const request = makePattern({
    id: 'request.001',
    familyId: 'request',
    english: 'Could you say that again?',
    korean: '다시 한 번 말씀해 주시겠어요?',
    pattern: 'Could you + verb?',
    intentKo: '정중하게 다시 요청하기',
    categoryIds: ['requests'],
    situationIds: ['work', 'travel'],
    tags: ['확인', '정중한 부탁'],
    cefr: 'B1',
    register: ['neutral', 'polite'],
    sortKey: '002.001',
  });

  it('normalizes case, punctuation and accents', () => {
    expect(normalizeSearchText('  CAFÉ—Again?!  ')).toBe('cafe again');
  });

  it('searches English, Korean, examples, mistakes and personal notes', () => {
    expect(matchesSearchQuery(request, 'could again')).toBe(true);
    expect(matchesSearchQuery(request, '정중하게')).toBe(true);
    expect(matchesSearchQuery(aboutTo, 'be 동사')).toBe(true);
    expect(matchesSearchQuery(request, '회의 메모', '다음 회의에서 연습할 메모')).toBe(true);
    expect(buildSearchText(aboutTo)).toContain('전화하려던 참이야');
  });

  it('uses OR inside a filter group and AND across groups', () => {
    expect(matchesPatternFilters(request, {
      categoryIds: ['requests', 'opinions'],
      situationIds: ['travel'],
      cefr: ['B1'],
      register: ['polite'],
    })).toBe(true);
    expect(matchesPatternFilters(request, { categoryIds: ['requests'], cefr: ['A1'] })).toBe(false);
  });

  it('combines bilingual query, progress, favorite and new filters in original order', () => {
    const progress: LearningProgress = {
      patternId: request.id,
      mastery: 5,
      lastRating: 'known',
      successCount: 10,
      failureCount: 1,
      averageResponseMs: 900,
      lastStudiedAt: '2026-08-01T00:00:00.000Z',
      nextReviewAt: '2026-08-07T00:00:00.000Z',
      successStreak: 6,
      confusedWith: [],
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    const results = searchPatterns([aboutTo, request], {
      query: '다시 could',
      filters: { mastery: ['due', 'mastered'], favoritesOnly: true, newOnly: true },
      progressById: new Map([[request.id, progress]]),
      favoriteIds: new Set([request.id]),
      newSince: '2026-07-31T00:00:00.000Z',
      now: '2026-08-08T00:00:00.000Z',
    });

    expect(results.map((pattern) => pattern.id)).toEqual([request.id]);
  });

  it('returns the full grid when search and filters are empty', () => {
    expect(searchPatterns([aboutTo, request])).toEqual([aboutTo, request]);
  });
});
