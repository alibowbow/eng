/**
 * Stable content contracts for SayGrid.
 *
 * Content JSON is deliberately dependency-free: the same interfaces are used by
 * the browser and the Node authoring tools, while validator.ts performs runtime
 * validation at every trust boundary.
 */

export const CONTENT_SCHEMA_VERSION = 1 as const;

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
export const PATTERN_PRIORITIES = ["essential", "common", "extended"] as const;
export const SPEECH_REGISTERS = ["casual", "neutral", "polite", "formal"] as const;
export const REPLY_TYPES = [
  "positive",
  "negative",
  "hesitant",
  "clarification",
  "follow-up",
] as const;

export type CefrLevel = (typeof CEFR_LEVELS)[number];
export type PatternPriority = (typeof PATTERN_PRIORITIES)[number];
export type SpeechRegister = (typeof SPEECH_REGISTERS)[number];
export type ReplyType = (typeof REPLY_TYPES)[number];

export interface PatternExample {
  id: string;
  english: string;
  korean: string;
  situationId?: string;
  noteKo?: string;
}

export interface PatternVariant {
  id: string;
  english: string;
  korean: string;
  register: SpeechRegister;
  nuanceKo?: string;
}

export interface PatternReply {
  id: string;
  english: string;
  korean: string;
  type: ReplyType;
}

export interface PatternMistake {
  wrong: string;
  corrected: string;
  explanationKo: string;
}

export interface PatternRelations {
  similar: string[];
  contrast: string[];
  prerequisites: string[];
  followUps: string[];
  responses: string[];
}

export interface PatternPronunciation {
  chunks?: string[];
  stress?: string;
  reductions?: string[];
  connectedSpeech?: string[];
}

export interface PatternAudio {
  ttsText?: string;
  lang?: "en-US" | "en-GB";
  audioUrl?: string;
  slowAudioUrl?: string;
  speaker?: string;
  accent?: string;
}

export interface ConversationPattern {
  /** Permanent identifier. Never derive user progress from array position. */
  id: string;
  /** Permanent family identifier. One grid card represents one family. */
  familyId: string;
  schemaVersion: number;
  contentVersion: number;
  pattern: string;
  english: string;
  korean: string;
  intentKo: string;
  nuanceKo?: string;
  usageNoteKo?: string;
  categoryIds: string[];
  situationIds: string[];
  tags: string[];
  cefr: CefrLevel;
  priority: PatternPriority;
  register: SpeechRegister[];
  examples: PatternExample[];
  variants: PatternVariant[];
  replies: PatternReply[];
  commonMistakes: PatternMistake[];
  relations: PatternRelations;
  pronunciation?: PatternPronunciation;
  audio?: PatternAudio;
  sortKey: string;
  aliases?: string[];
  deprecated?: boolean;
  replacedBy?: string;
  /** ISO date. The UI may use this to show a non-blocking NEW marker. */
  releasedAt?: string;
}

export interface TaxonomyItem {
  id: string;
  labelKo: string;
  labelEn: string;
  count?: number;
}

export interface ContentPack {
  schemaVersion: number;
  packId: string;
  titleKo: string;
  titleEn: string;
  descriptionKo?: string;
  version: string;
  contentVersion: number;
  required: boolean;
  minAppVersion: string;
  releasedAt: string;
  categories: TaxonomyItem[];
  situations: TaxonomyItem[];
  patterns: ConversationPattern[];
}

export interface ManifestPack {
  packId: string;
  titleKo: string;
  titleEn: string;
  version: string;
  /** URL relative to Vite BASE_URL, e.g. content/packs/core-001.json. */
  url: string;
  /** sha256- followed by lowercase hex. */
  hash: string;
  patternCount: number;
  required: boolean;
  minAppVersion: string;
  releasedAt: string;
  categoryIds: string[];
  situationIds: string[];
  tags: string[];
}

export interface ContentManifest {
  schemaVersion: number;
  contentVersion: string;
  generatedAt: string;
  totalPatternCount: number;
  packs: ManifestPack[];
  categories: TaxonomyItem[];
  situations: TaxonomyItem[];
  tags: Array<{ id: string; count: number }>;
}

export type MasteryLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type LearningRating = "unknown" | "unsure" | "known";

export interface LearningProgress {
  patternId: string;
  mastery: MasteryLevel;
  lastRating?: LearningRating;
  successCount: number;
  failureCount: number;
  averageResponseMs: number;
  lastStudiedAt?: string;
  nextReviewAt?: string;
  successStreak: number;
  confusedWith: string[];
  updatedAt: string;
}

export interface ReviewSchedule {
  patternId: string;
  dueAt: string;
  intervalDays: number;
  easeFactor: number;
  lapses: number;
  updatedAt: string;
}

export const EMPTY_RELATIONS: Readonly<PatternRelations> = Object.freeze({
  similar: [],
  contrast: [],
  prerequisites: [],
  followUps: [],
  responses: [],
});

export function makeEmptyRelations(): PatternRelations {
  return {
    similar: [],
    contrast: [],
    prerequisites: [],
    followUps: [],
    responses: [],
  };
}
