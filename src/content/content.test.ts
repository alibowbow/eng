import { describe, expect, it } from "vitest";
import type { ContentPack, ConversationPattern, LearningProgress } from "./schema";
import { makeEmptyRelations } from "./schema";
import {
  buildIdMigrationMap,
  migrateProgressRecords,
  resolveCanonicalPatternId,
} from "./migrations";
import {
  validateContentLibrary,
  validateContentPack,
  validateConversationPattern,
} from "./validator";

function pattern(overrides: Partial<ConversationPattern> = {}): ConversationPattern {
  return {
    id: "test.pattern-one",
    familyId: "test.family-one",
    schemaVersion: 1,
    contentVersion: 1,
    pattern: "Could you + verb?",
    english: "Could you help me?",
    korean: "저를 도와주시겠어요?",
    intentKo: "도움을 정중하게 요청하기",
    categoryIds: ["requests"],
    situationIds: ["daily"],
    tags: ["부탁"],
    cefr: "A2",
    priority: "essential",
    register: ["neutral", "polite"],
    examples: [1, 2, 3].map((index) => ({
      id: `test.pattern-one.example-${index}`,
      english: `Could you help me with example ${index}?`,
      korean: `예시 ${index}번을 도와주시겠어요?`,
      situationId: "daily",
    })),
    variants: [],
    replies: [],
    commonMistakes: [],
    relations: makeEmptyRelations(),
    audio: { ttsText: "Could you help me?", lang: "en-US" },
    sortKey: "001.001.001",
    releasedAt: "2026-08-08",
    ...overrides,
  };
}

function pack(patterns: ConversationPattern[]): ContentPack {
  return {
    schemaVersion: 1,
    packId: "test-pack-001",
    titleKo: "테스트 팩",
    titleEn: "Test Pack",
    version: "1.0.0",
    contentVersion: 1,
    required: true,
    minAppVersion: "1.0.0",
    releasedAt: "2026-08-08",
    categories: [{ id: "requests", labelKo: "부탁", labelEn: "Requests" }],
    situations: [{ id: "daily", labelKo: "일상", labelEn: "Daily" }],
    patterns,
  };
}

function progress(patternId: string, mastery: LearningProgress["mastery"], successes: number): LearningProgress {
  return {
    patternId,
    mastery,
    lastRating: "known",
    successCount: successes,
    failureCount: 0,
    averageResponseMs: 1_000,
    lastStudiedAt: "2026-08-08T00:00:00.000Z",
    nextReviewAt: "2026-08-10T00:00:00.000Z",
    successStreak: successes,
    confusedWith: [],
    updatedAt: "2026-08-08T00:00:00.000Z",
  };
}

describe("content runtime validation", () => {
  it("accepts a complete pattern and pack", () => {
    const candidate = pattern();
    expect(validateConversationPattern(candidate).valid).toBe(true);
    expect(validateContentPack(pack([candidate])).valid).toBe(true);
  });

  it("rejects fewer than three examples and invalid CEFR", () => {
    const checked = validateConversationPattern(
      pattern({ examples: pattern().examples.slice(0, 2), cefr: "A0" as ConversationPattern["cefr"] }),
    );
    expect(checked.valid).toBe(false);
    expect(checked.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["examples-minimum", "invalid-enum"]),
    );
  });

  it("detects IDs, family IDs, normalized English, and sortKey duplicates", () => {
    const first = pattern();
    const second = pattern({ english: "could you help me!!!" });
    const checked = validateContentLibrary([pack([first, second])]);
    const codes = checked.errors.map((error) => error.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "duplicate-id",
        "duplicate-family-id",
        "duplicate-english",
        "duplicate-sort-key",
      ]),
    );
  });

  it("rejects relations that point to a missing pattern", () => {
    const candidate = pattern({
      relations: { ...makeEmptyRelations(), similar: ["missing.pattern"] },
    });
    const checked = validateContentLibrary([pack([candidate])]);
    expect(checked.errors.some((error) => error.code === "unknown-relation")).toBe(true);
  });

  it("rejects a replacedBy cycle", () => {
    const first = pattern({
      id: "test.old-one",
      familyId: "test.old-family-one",
      english: "Old expression one.",
      sortKey: "001.001.001",
      deprecated: true,
      replacedBy: "test.old-two",
    });
    const second = pattern({
      id: "test.old-two",
      familyId: "test.old-family-two",
      english: "Old expression two.",
      sortKey: "001.001.002",
      deprecated: true,
      replacedBy: "test.old-one",
      examples: pattern().examples.map((example, index) => ({ ...example, id: `test.old-two.example-${index + 1}` })),
    });
    const checked = validateContentLibrary([pack([first, second])]);
    expect(checked.errors.some((error) => error.code === "replacement-cycle")).toBe(true);
  });
});

describe("stable ID progress migration", () => {
  it("resolves alias and replacement chains and merges progress", () => {
    const old = pattern({
      id: "test.old-pattern",
      familyId: "test.old-family",
      deprecated: true,
      replacedBy: "test.new-pattern",
    });
    const current = pattern({
      id: "test.new-pattern",
      familyId: "test.new-family",
      aliases: ["test.very-old-pattern"],
    });
    const map = buildIdMigrationMap([old, current]);
    expect(resolveCanonicalPatternId("test.very-old-pattern", map)).toBe("test.new-pattern");
    expect(resolveCanonicalPatternId("test.old-pattern", map)).toBe("test.new-pattern");

    const migrated = migrateProgressRecords(
      [progress("test.old-pattern", 2, 2), progress("test.new-pattern", 4, 3)],
      map,
    );
    expect(migrated).toHaveLength(1);
    expect(migrated[0]).toMatchObject({
      patternId: "test.new-pattern",
      mastery: 4,
      successCount: 5,
    });
  });
});
