import {
  CONTENT_SCHEMA_VERSION,
  makeEmptyRelations,
  type ContentPack,
  type ConversationPattern,
  type LearningProgress,
  type ReviewSchedule,
} from "./schema";
import {
  deleteRecord,
  getAllRecords,
  getRecord,
  putRecord,
  type FavoriteRecord,
  type PersonalNote,
} from "../lib/db";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Converts the small pre-v1 authoring shape used by early prototypes. Future
 * schema versions intentionally fail instead of being guessed.
 */
export function migratePattern(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const version = typeof input.schemaVersion === "number" ? input.schemaVersion : 0;
  if (version === CONTENT_SCHEMA_VERSION) return input;
  if (version > CONTENT_SCHEMA_VERSION) {
    throw new Error(`콘텐츠 스키마 ${version}은 현재 앱에서 지원하지 않습니다.`);
  }

  const id = typeof input.id === "string" ? input.id : "";
  const english = typeof input.english === "string" ? input.english : "";
  const korean = typeof input.korean === "string" ? input.korean : "";
  return {
    ...input,
    id,
    familyId: typeof input.familyId === "string" ? input.familyId : id,
    schemaVersion: CONTENT_SCHEMA_VERSION,
    contentVersion: typeof input.contentVersion === "number" ? input.contentVersion : 1,
    pattern: typeof input.pattern === "string" ? input.pattern : english,
    english,
    korean,
    intentKo: typeof input.intentKo === "string" ? input.intentKo : korean,
    categoryIds: Array.isArray(input.categoryIds) ? input.categoryIds : ["daily-core"],
    situationIds: Array.isArray(input.situationIds) ? input.situationIds : ["daily"],
    tags: Array.isArray(input.tags) ? input.tags : ["핵심 표현"],
    cefr: typeof input.cefr === "string" ? input.cefr : "A2",
    priority: typeof input.priority === "string" ? input.priority : "common",
    register: Array.isArray(input.register) ? input.register : ["neutral"],
    examples: Array.isArray(input.examples) ? input.examples : [],
    variants: Array.isArray(input.variants) ? input.variants : [],
    replies: Array.isArray(input.replies) ? input.replies : [],
    commonMistakes: Array.isArray(input.commonMistakes) ? input.commonMistakes : [],
    relations: isRecord(input.relations) ? input.relations : makeEmptyRelations(),
    audio: isRecord(input.audio) ? input.audio : { ttsText: english, lang: "en-US" },
    sortKey: typeof input.sortKey === "string" ? input.sortKey : "999.999.999",
  };
}

export function migrateContentPack(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const version = typeof input.schemaVersion === "number" ? input.schemaVersion : 0;
  if (version > CONTENT_SCHEMA_VERSION) {
    throw new Error(`콘텐츠 팩 스키마 ${version}은 현재 앱에서 지원하지 않습니다.`);
  }
  if (version === CONTENT_SCHEMA_VERSION) return input;
  return {
    ...input,
    schemaVersion: CONTENT_SCHEMA_VERSION,
    contentVersion: typeof input.contentVersion === "number" ? input.contentVersion : 1,
    required: typeof input.required === "boolean" ? input.required : true,
    minAppVersion: typeof input.minAppVersion === "string" ? input.minAppVersion : "1.0.0",
    releasedAt: typeof input.releasedAt === "string" ? input.releasedAt : "2026-08-08",
    categories: Array.isArray(input.categories) ? input.categories : [],
    situations: Array.isArray(input.situations) ? input.situations : [],
    patterns: Array.isArray(input.patterns) ? input.patterns.map(migratePattern) : [],
  };
}

export function buildIdMigrationMap(patterns: ConversationPattern[]): Map<string, string> {
  const direct = new Map<string, string>();
  for (const pattern of patterns) {
    for (const alias of pattern.aliases ?? []) direct.set(alias, pattern.id);
    if (pattern.replacedBy) direct.set(pattern.id, pattern.replacedBy);
  }
  return direct;
}

export function resolveCanonicalPatternId(patternId: string, migrationMap: ReadonlyMap<string, string>): string {
  const visited = new Set<string>();
  let current = patternId;
  while (migrationMap.has(current)) {
    if (visited.has(current)) throw new Error(`패턴 ID 마이그레이션 순환: ${[...visited, current].join(" -> ")}`);
    visited.add(current);
    current = migrationMap.get(current)!;
  }
  return current;
}

function latestIso(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function earliestIso(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

export function mergeLearningProgress(a: LearningProgress, b: LearningProgress): LearningProgress {
  const attemptsA = a.successCount + a.failureCount;
  const attemptsB = b.successCount + b.failureCount;
  const totalAttempts = attemptsA + attemptsB;
  return {
    patternId: b.patternId,
    mastery: Math.max(a.mastery, b.mastery) as LearningProgress["mastery"],
    lastRating: Date.parse(a.updatedAt) > Date.parse(b.updatedAt) ? a.lastRating : b.lastRating,
    successCount: a.successCount + b.successCount,
    failureCount: a.failureCount + b.failureCount,
    averageResponseMs: totalAttempts
      ? Math.round((a.averageResponseMs * attemptsA + b.averageResponseMs * attemptsB) / totalAttempts)
      : 0,
    lastStudiedAt: latestIso(a.lastStudiedAt, b.lastStudiedAt),
    nextReviewAt: earliestIso(a.nextReviewAt, b.nextReviewAt),
    successStreak: Math.max(a.successStreak, b.successStreak),
    confusedWith: Array.from(new Set([...a.confusedWith, ...b.confusedWith])),
    updatedAt: latestIso(a.updatedAt, b.updatedAt) ?? new Date().toISOString(),
  };
}

export function migrateProgressRecords(
  records: LearningProgress[],
  migrationMap: ReadonlyMap<string, string>,
): LearningProgress[] {
  const migrated = new Map<string, LearningProgress>();
  for (const record of records) {
    const patternId = resolveCanonicalPatternId(record.patternId, migrationMap);
    const next = { ...record, patternId };
    const existing = migrated.get(patternId);
    migrated.set(patternId, existing ? mergeLearningProgress(existing, next) : next);
  }
  return [...migrated.values()];
}

/** Moves all user-owned records to canonical IDs without deleting unrelated data. */
export async function migrateStoredUserData(patterns: ConversationPattern[]): Promise<number> {
  const migrationMap = buildIdMigrationMap(patterns);
  if (migrationMap.size === 0) return 0;
  let moved = 0;

  const progressRecords = await getAllRecords("userProgress");
  const migratedProgress = migrateProgressRecords(progressRecords, migrationMap);
  for (const original of progressRecords) {
    const canonical = resolveCanonicalPatternId(original.patternId, migrationMap);
    if (canonical !== original.patternId) {
      await deleteRecord("userProgress", original.patternId);
      moved += 1;
    }
  }
  for (const record of migratedProgress) await putRecord("userProgress", record);

  for (const storeName of ["reviewSchedule", "favorites", "personalNotes"] as const) {
    const records = await getAllRecords(storeName);
    for (const record of records) {
      const canonical = resolveCanonicalPatternId(record.patternId, migrationMap);
      if (canonical === record.patternId) continue;
      const existing = await getRecord(storeName, canonical);
      if (storeName === "reviewSchedule") {
        const source = record as ReviewSchedule;
        const target = existing as ReviewSchedule | undefined;
        await putRecord("reviewSchedule", {
          ...source,
          ...target,
          patternId: canonical,
          dueAt: earliestIso(source.dueAt, target?.dueAt)!,
          intervalDays: Math.max(source.intervalDays, target?.intervalDays ?? 0),
          lapses: source.lapses + (target?.lapses ?? 0),
          updatedAt: latestIso(source.updatedAt, target?.updatedAt)!,
        });
      } else if (storeName === "favorites") {
        const source = record as FavoriteRecord;
        const target = existing as FavoriteRecord | undefined;
        await putRecord("favorites", {
          patternId: canonical,
          createdAt: earliestIso(source.createdAt, target?.createdAt)!,
        });
      } else {
        const source = record as PersonalNote;
        const target = existing as PersonalNote | undefined;
        const texts = [target?.text, source.text].filter((text): text is string => Boolean(text));
        await putRecord("personalNotes", {
          patternId: canonical,
          text: Array.from(new Set(texts)).join("\n\n"),
          updatedAt: latestIso(source.updatedAt, target?.updatedAt)!,
        });
      }
      await deleteRecord(storeName, record.patternId);
      moved += 1;
    }
  }
  return moved;
}

export function asCurrentPack(input: unknown): ContentPack {
  return migrateContentPack(input) as ContentPack;
}
