import { describe, expect, it } from "vitest";
import type { ConversationPattern } from "../content/schema";
import { makePattern } from "../test/fixtures";
import {
  buildRelatedPatternIndex,
  type RelatedPackMetadata,
} from "./related";

function pattern(
  id: string,
  overrides: Partial<ConversationPattern> = {},
): ConversationPattern {
  return makePattern({
    id,
    familyId: `${id}.family`,
    pattern: overrides.english ?? id,
    english: id,
    korean: `${id} 한국어`,
    categoryIds: [],
    situationIds: [],
    tags: [],
    relations: {
      similar: [],
      contrast: [],
      prerequisites: [],
      followUps: [],
      responses: [],
    },
    sortKey: id,
    ...overrides,
  });
}

function snapshot(index: Map<string, ReturnType<typeof buildRelatedPatternIndex> extends Map<string, infer R> ? R : never>) {
  return [...index].map(([anchorId, related]) => [
    anchorId,
    related.map(({ pattern: item, reason, label }) => ({
      id: item.id,
      reason,
      label,
    })),
  ]);
}

describe("related pattern index", () => {
  const anchor = pattern("anchor", {
    english: "Could you book a table?",
    pattern: "Could you book + noun?",
    categoryIds: ["requests"],
    situationIds: ["restaurant"],
    cefr: "A2",
  });
  const sameFunction = pattern("same-function", {
    english: "Could you open the window?",
    pattern: "Could you + verb?",
    categoryIds: ["requests"],
    situationIds: ["office"],
    cefr: "B1",
  });
  const learnTogether = pattern("learn-together", {
    english: "When is our reservation?",
    categoryIds: ["schedule-check"],
    situationIds: ["hotel"],
    cefr: "A2",
  });
  const sameSituation = pattern("same-situation", {
    english: "The table is ready.",
    categoryIds: ["status"],
    situationIds: ["restaurant"],
    cefr: "A1",
  });
  const deprecated = pattern("deprecated", {
    categoryIds: ["requests"],
    deprecated: true,
  });

  const metadata: RelatedPackMetadata[] = [
    {
      packId: "core-conversation-001",
      patterns: [anchor, sameFunction, learnTogether],
      categories: [
        { id: "requests", labelKo: "부탁하기" },
        { id: "schedule-check", labelKo: "일정 확인" },
      ],
      situations: [
        { id: "restaurant", labelKo: "식당" },
        { id: "office", labelKo: "직장" },
        { id: "hotel", labelKo: "숙소" },
      ],
    },
    {
      packId: "practical-situations-001",
      patterns: [sameSituation],
      situations: [{ id: "restaurant", labelKo: "식당" }],
    },
  ];

  it("is deterministic regardless of pattern and pack input order", () => {
    const patterns = [
      anchor,
      sameFunction,
      learnTogether,
      sameSituation,
      deprecated,
    ];
    const forward = buildRelatedPatternIndex(patterns, metadata);
    const reversed = buildRelatedPatternIndex(
      [...patterns].reverse(),
      [...metadata].reverse().map((pack) => ({
        ...pack,
        patterns: [...pack.patterns].reverse(),
      })),
    );

    expect(snapshot(forward)).toEqual(snapshot(reversed));
  });

  it("returns a unique compact deck without the anchor or deprecated items", () => {
    const duplicateSameFunction = { ...sameFunction };
    const related = buildRelatedPatternIndex(
      [
        anchor,
        sameFunction,
        duplicateSameFunction,
        learnTogether,
        sameSituation,
        deprecated,
      ],
      metadata,
      99,
    ).get(anchor.id)!;
    const ids = related.map(({ pattern: item }) => item.id);

    expect(related.length).toBeLessThanOrEqual(5);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(anchor.id);
    expect(ids).not.toContain(deprecated.id);
  });

  it("keeps same-function and cross-category learning lanes in the deck", () => {
    const related = buildRelatedPatternIndex(
      [anchor, sameFunction, learnTogether, sameSituation],
      metadata,
    ).get(anchor.id)!;

    expect(related).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pattern: expect.objectContaining({ id: sameFunction.id }),
          reason: "same-function",
          label: "같은 기능 · 부탁하기",
        }),
        expect.objectContaining({
          pattern: expect.objectContaining({ id: learnTogether.id }),
          reason: "learn-together",
        }),
        expect.objectContaining({
          pattern: expect.objectContaining({ id: sameSituation.id }),
          reason: "same-situation",
          label: "같은 상황 · 식당",
        }),
      ]),
    );
  });

  it("does not create a relation from CEFR proximity alone", () => {
    const sameLevelOnly = pattern("same-level-only", {
      english: "Rain stopped overnight.",
      categoryIds: ["weather-report"],
      situationIds: ["outdoors"],
      cefr: anchor.cefr,
    });
    const related = buildRelatedPatternIndex(
      [anchor, sameLevelOnly],
      new Map([
        [anchor.id, "core-001"],
        [sameLevelOnly.id, "weather-001"],
      ]),
    ).get(anchor.id)!;

    expect(related).toEqual([]);
  });

  it("does not connect unrelated cards through a broad situation alone", () => {
    const broadSituationPatterns = [
      anchor,
      pattern("broad-only", {
        english: "Rain stopped overnight.",
        categoryIds: ["weather-report"],
        situationIds: ["conversation"],
      }),
      pattern("broad-filler-one", {
        english: "The parcel arrived early.",
        categoryIds: ["delivery-status"],
        situationIds: ["conversation"],
      }),
      pattern("broad-filler-two", {
        english: "Blue paint dries slowly.",
        categoryIds: ["home-project"],
        situationIds: ["conversation"],
      }),
    ];
    broadSituationPatterns[0] = {
      ...broadSituationPatterns[0],
      situationIds: ["conversation"],
    };

    const related = buildRelatedPatternIndex(broadSituationPatterns).get(anchor.id)!;

    expect(related).toEqual([]);
  });

  it("ignores generic tags and weak synthetic relations as qualifiers", () => {
    const genericTagOnly = pattern("generic-tag-only", {
      english: "Rain stopped overnight.",
      categoryIds: ["weather-report"],
      situationIds: ["outdoors"],
      tags: ["핵심 표현", "일상"],
      relations: {
        similar: [anchor.id],
        contrast: [],
        prerequisites: [],
        followUps: [],
        responses: [],
      },
    });
    const taggedAnchor = {
      ...anchor,
      tags: ["핵심 표현", "일상"],
      relations: {
        ...anchor.relations,
        similar: [genericTagOnly.id],
      },
    };
    const related = buildRelatedPatternIndex(
      [taggedAnchor, genericTagOnly],
      {
        [taggedAnchor.id]: "core-001",
        [genericTagOnly.id]: "weather-001",
      },
    ).get(taggedAnchor.id)!;

    expect(related).toEqual([]);
  });
});
