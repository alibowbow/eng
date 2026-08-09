import type {
  ConversationPattern,
  TaxonomyItem,
} from "../content/schema";

export type RelatedPatternReason =
  | "same-function"
  | "learn-together"
  | "same-situation";

export interface RelatedPattern {
  pattern: ConversationPattern;
  reason: RelatedPatternReason;
  label: string;
}

export interface RelatedPackMetadata {
  packId: string;
  patterns: readonly Pick<ConversationPattern, "id">[];
  categories?: readonly Pick<TaxonomyItem, "id" | "labelKo">[];
  situations?: readonly Pick<TaxonomyItem, "id" | "labelKo">[];
}

export type PatternPackMapping =
  | ReadonlyMap<string, string>
  | Readonly<Record<string, string | undefined>>;

export type RelatedPackSource =
  | readonly RelatedPackMetadata[]
  | PatternPackMapping;

interface PackContext {
  packByPatternId: Map<string, string>;
  categoryLabels: Map<string, string>;
  situationLabels: Map<string, string>;
}

interface LexicalFeatures {
  exactEnglish: boolean;
  sharedTokenCount: number;
  sharedBigramCount: number;
  tokenJaccard: number;
  qualifies: boolean;
}

interface PatternFeatures {
  normalizedEnglish: string;
  meaningfulTokens: Set<string>;
  meaningfulBigrams: Set<string>;
  relationIds: Set<string>;
}

interface RankedCandidate extends RelatedPattern {
  score: number;
  cefrDistance: number;
}

const DEFAULT_LIMIT = 5;
const MAX_COMPACT_DECK_SIZE = 5;

const LANE_ORDER: readonly RelatedPatternReason[] = [
  "same-function",
  "learn-together",
  "same-situation",
  "same-function",
  "learn-together",
];

const CEFR_RANK: Readonly<Record<ConversationPattern["cefr"], number>> = {
  A1: 0,
  A2: 1,
  B1: 2,
  B2: 3,
  C1: 4,
};

/**
 * Words which are too common to establish a useful relationship on their own.
 * Modal verbs are intentionally retained: "could you" and "would you" are
 * meaningful conversation frames even though their pronouns are generic.
 */
const GENERIC_ENGLISH_TOKENS = new Set([
  "a",
  "an",
  "and",
  "am",
  "are",
  "be",
  "been",
  "being",
  "but",
  "did",
  "do",
  "does",
  "for",
  "had",
  "has",
  "have",
  "he",
  "her",
  "here",
  "him",
  "his",
  "i",
  "if",
  "im",
  "is",
  "it",
  "its",
  "me",
  "my",
  "of",
  "or",
  "our",
  "please",
  "she",
  "so",
  "someone",
  "something",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "to",
  "us",
  "verb",
  "was",
  "we",
  "were",
  "you",
  "your",
]);

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en", {
    numeric: true,
    sensitivity: "base",
  });
}

function canonicalPatterns(
  patterns: readonly ConversationPattern[],
): ConversationPattern[] {
  const ordered = [...patterns]
    .filter((pattern) => !pattern.deprecated)
    .sort(
      (left, right) =>
        compareText(left.id, right.id) ||
        right.contentVersion - left.contentVersion ||
        compareText(left.sortKey, right.sortKey) ||
        compareText(left.english, right.english) ||
        compareText(left.korean, right.korean),
    );
  const seen = new Set<string>();
  return ordered.filter((pattern) => {
    if (seen.has(pattern.id)) return false;
    seen.add(pattern.id);
    return true;
  });
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function intersection(
  left: readonly string[],
  right: readonly string[],
): string[] {
  const rightValues = new Set(right);
  return sortedUnique(left.filter((value) => rightValues.has(value)));
}

function assignStableLabel(
  labels: Map<string, string>,
  id: string,
  label: string,
): void {
  const trimmed = label.trim();
  if (!trimmed) return;
  const current = labels.get(id);
  if (!current || compareText(trimmed, current) < 0) labels.set(id, trimmed);
}

function assignStablePack(
  packs: Map<string, string>,
  patternId: string,
  packId: string,
): void {
  const trimmed = packId.trim();
  if (!trimmed) return;
  const current = packs.get(patternId);
  if (!current || compareText(trimmed, current) < 0) {
    packs.set(patternId, trimmed);
  }
}

function isPackMetadataList(
  source: RelatedPackSource,
): source is readonly RelatedPackMetadata[] {
  return Array.isArray(source);
}

function packContext(source: RelatedPackSource): PackContext {
  const context: PackContext = {
    packByPatternId: new Map(),
    categoryLabels: new Map(),
    situationLabels: new Map(),
  };

  if (isPackMetadataList(source)) {
    const packs = [...source].sort((left, right) =>
      compareText(left.packId, right.packId),
    );
    for (const pack of packs) {
      for (const pattern of [...pack.patterns].sort((left, right) =>
        compareText(left.id, right.id),
      )) {
        assignStablePack(
          context.packByPatternId,
          pattern.id,
          pack.packId,
        );
      }
      for (const category of pack.categories ?? []) {
        assignStableLabel(
          context.categoryLabels,
          category.id,
          category.labelKo,
        );
      }
      for (const situation of pack.situations ?? []) {
        assignStableLabel(
          context.situationLabels,
          situation.id,
          situation.labelKo,
        );
      }
    }
    return context;
  }

  const entries =
    typeof (source as ReadonlyMap<string, string>).entries === "function"
      ? [...(source as ReadonlyMap<string, string>).entries()]
      : Object.entries(
          source as Readonly<Record<string, string | undefined>>,
        ).filter((entry): entry is [string, string] => Boolean(entry[1]));

  entries
    .sort(
      ([leftPattern, leftPack], [rightPattern, rightPack]) =>
        compareText(leftPattern, rightPattern) ||
        compareText(leftPack, rightPack),
    )
    .forEach(([patternId, packId]) =>
      assignStablePack(context.packByPatternId, patternId, packId),
    );
  return context;
}

/** Treat numbered pack installments as one broad learning area. */
function packMacro(packId: string | undefined): string | undefined {
  if (!packId) return undefined;
  const normalized = packId
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/(?:[-_.](?:pack[-_.]?)?v?\d+)+$/g, "")
    .replace(/[-_.]+$/g, "");
  return normalized || packId.trim().toLocaleLowerCase("en-US");
}

function normalizeEnglish(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  const normalized = normalizeEnglish(value);
  return normalized ? normalized.split(" ") : [];
}

function meaningfulTokens(pattern: ConversationPattern): Set<string> {
  return new Set(
    tokens(`${pattern.pattern} ${pattern.english}`).filter(
      (token) => !GENERIC_ENGLISH_TOKENS.has(token),
    ),
  );
}

function meaningfulBigrams(pattern: ConversationPattern): Set<string> {
  const words = tokens(pattern.english);
  const bigrams = new Set<string>();
  for (let index = 0; index < words.length - 1; index += 1) {
    const left = words[index];
    const right = words[index + 1];
    if (
      GENERIC_ENGLISH_TOKENS.has(left) &&
      GENERIC_ENGLISH_TOKENS.has(right)
    ) {
      continue;
    }
    bigrams.add(`${left} ${right}`);
  }
  return bigrams;
}

function patternFeatures(pattern: ConversationPattern): PatternFeatures {
  return {
    normalizedEnglish: normalizeEnglish(pattern.english),
    meaningfulTokens: meaningfulTokens(pattern),
    meaningfulBigrams: meaningfulBigrams(pattern),
    relationIds: relationIds(pattern),
  };
}

function lexicalFeatures(
  anchor: PatternFeatures,
  candidate: PatternFeatures,
): LexicalFeatures {
  const sharedTokens = [...anchor.meaningfulTokens].filter((token) =>
    candidate.meaningfulTokens.has(token),
  );
  const unionSize = new Set([
    ...anchor.meaningfulTokens,
    ...candidate.meaningfulTokens,
  ]).size;
  const tokenJaccard = unionSize ? sharedTokens.length / unionSize : 0;
  const sharedBigramCount = [...anchor.meaningfulBigrams].filter((bigram) =>
    candidate.meaningfulBigrams.has(bigram),
  ).length;
  const exactEnglish =
    Boolean(anchor.normalizedEnglish) &&
    anchor.normalizedEnglish === candidate.normalizedEnglish;

  return {
    exactEnglish,
    sharedTokenCount: sharedTokens.length,
    sharedBigramCount,
    tokenJaccard,
    qualifies:
      exactEnglish ||
      sharedBigramCount > 0 ||
      sharedTokens.length >= 2 ||
      (sharedTokens.length === 1 && tokenJaccard >= 0.5),
  };
}

function relationIds(pattern: ConversationPattern): Set<string> {
  return new Set(Object.values(pattern.relations).flat());
}

function cefrDistance(
  anchor: ConversationPattern,
  candidate: ConversationPattern,
): number {
  return Math.abs(CEFR_RANK[anchor.cefr] - CEFR_RANK[candidate.cefr]);
}

function cefrScore(distance: number): number {
  if (distance === 0) return 4;
  if (distance === 1) return 2;
  if (distance === 2) return 0.5;
  return 0;
}

function reasonLabel(
  reason: RelatedPatternReason,
  sharedCategoryId: string | undefined,
  sharedSituationId: string | undefined,
  context: PackContext,
): string {
  if (reason === "same-function") {
    const category = sharedCategoryId
      ? context.categoryLabels.get(sharedCategoryId)
      : undefined;
    return category ? `같은 기능 · ${category}` : "같은 기능";
  }
  if (reason === "same-situation") {
    const situation = sharedSituationId
      ? context.situationLabels.get(sharedSituationId)
      : undefined;
    return situation ? `같은 상황 · ${situation}` : "같은 상황";
  }
  return "함께 익히기";
}

function compareCandidates(
  left: RankedCandidate,
  right: RankedCandidate,
): number {
  return (
    right.score - left.score ||
    left.cefrDistance - right.cefrDistance ||
    compareText(left.pattern.sortKey, right.pattern.sortKey) ||
    compareText(left.pattern.id, right.pattern.id)
  );
}

function selectCompactDeck(
  candidates: readonly RankedCandidate[],
  limit: number,
): RelatedPattern[] {
  if (limit <= 0) return [];
  const lanes = new Map<RelatedPatternReason, RankedCandidate[]>([
    ["same-function", []],
    ["learn-together", []],
    ["same-situation", []],
  ]);
  for (const candidate of candidates) lanes.get(candidate.reason)?.push(candidate);
  for (const lane of lanes.values()) lane.sort(compareCandidates);

  const selected: RankedCandidate[] = [];
  const selectedIds = new Set<string>();
  for (const reason of LANE_ORDER) {
    if (selected.length >= limit) break;
    const candidate = lanes.get(reason)?.shift();
    if (!candidate || selectedIds.has(candidate.pattern.id)) continue;
    selected.push(candidate);
    selectedIds.add(candidate.pattern.id);
  }

  // Empty lanes should not make a deck needlessly short. Quotas establish the
  // mix first; the strongest remaining relationships fill any spare slots.
  if (selected.length < limit) {
    for (const candidate of [...candidates].sort(compareCandidates)) {
      if (selected.length >= limit) break;
      if (selectedIds.has(candidate.pattern.id)) continue;
      selected.push(candidate);
      selectedIds.add(candidate.pattern.id);
    }
  }

  return selected.sort(compareCandidates).map(({ pattern, reason, label }) => ({
    pattern,
    reason,
    label,
  }));
}

/**
 * Build a stable, compact swipe deck for every active pattern.
 *
 * Category membership is the primary signal. Cross-category patterns from the
 * same broad pack, uncommon shared situations, and real English phrase overlap
 * add useful practice paths. CEFR and authored relations only reorder an
 * already meaningful connection; neither can create one by itself.
 */
export interface RelatedPatternResolver {
  get: (patternOrId: ConversationPattern | string) => RelatedPattern[];
}

/**
 * Prepare shared indexes once, then rank only the card the learner actually
 * explores. This keeps the 520-card first render fast while every swipe still
 * receives a deterministic deck synchronously.
 */
export function createRelatedPatternResolver(
  patterns: readonly ConversationPattern[],
  packSource: RelatedPackSource = {},
  limit = DEFAULT_LIMIT,
): RelatedPatternResolver {
  const activePatterns = canonicalPatterns(patterns);
  const patternById = new Map(activePatterns.map((pattern) => [pattern.id, pattern]));
  const context = packContext(packSource);
  const situationCounts = new Map<string, number>();
  for (const pattern of activePatterns) {
    for (const situationId of new Set(pattern.situationIds)) {
      situationCounts.set(
        situationId,
        (situationCounts.get(situationId) ?? 0) + 1,
      );
    }
  }
  const scarceSituationThreshold = Math.max(
    2,
    Math.ceil(activePatterns.length * 0.08),
  );
  const resultLimit = Math.min(
    MAX_COMPACT_DECK_SIZE,
    Math.max(0, Number.isFinite(limit) ? Math.floor(limit) : DEFAULT_LIMIT),
  );
  const featuresById = new Map(
    activePatterns.map((pattern) => [pattern.id, patternFeatures(pattern)]),
  );
  const cache = new Map<string, RelatedPattern[]>();

  const get = (patternOrId: ConversationPattern | string): RelatedPattern[] => {
    const anchorId = typeof patternOrId === "string" ? patternOrId : patternOrId.id;
    const cached = cache.get(anchorId);
    if (cached) return cached;
    const anchor = patternById.get(anchorId);
    if (!anchor) return [];
    const anchorPackMacro = packMacro(
      context.packByPatternId.get(anchor.id),
    );
    const anchorFeatures = featuresById.get(anchor.id)!;
    const authoredRelations = anchorFeatures.relationIds;
    const candidates: RankedCandidate[] = [];

    for (const candidate of activePatterns) {
      if (candidate.id === anchor.id) continue;

      const sharedCategories = intersection(
        anchor.categoryIds,
        candidate.categoryIds,
      );
      const sharedSituations = intersection(
        anchor.situationIds,
        candidate.situationIds,
      ).sort(
        (left, right) =>
          (situationCounts.get(left) ?? Number.MAX_SAFE_INTEGER) -
            (situationCounts.get(right) ?? Number.MAX_SAFE_INTEGER) ||
          compareText(left, right),
      );
      const candidatePackMacro = packMacro(
        context.packByPatternId.get(candidate.id),
      );
      const samePackMacro = Boolean(
        anchorPackMacro &&
          candidatePackMacro &&
          anchorPackMacro === candidatePackMacro,
      );
      const candidateFeatures = featuresById.get(candidate.id)!;
      const lexical = lexicalFeatures(anchorFeatures, candidateFeatures);
      const scarceSharedSituations = sharedSituations.filter(
        (situationId) =>
          (situationCounts.get(situationId) ?? Number.MAX_SAFE_INTEGER) <=
          scarceSituationThreshold,
      );

      // Tags and CEFR intentionally do not qualify a candidate. Content tags
      // such as "표현" are too broad, and level alone says nothing about
      // what should be practised together. Likewise, broad situations such as
      // "conversation" only help rank an existing connection; they cannot
      // connect otherwise unrelated cards by themselves.
      if (
        !sharedCategories.length &&
        !scarceSharedSituations.length &&
        !samePackMacro &&
        !lexical.qualifies
      ) {
        continue;
      }

      const rareSharedSituation = scarceSharedSituations[0];
      const reason: RelatedPatternReason = sharedCategories.length
        ? "same-function"
        : rareSharedSituation
          ? "same-situation"
          : samePackMacro || lexical.qualifies
            ? "learn-together"
            : "same-situation";
      const distance = cefrDistance(anchor, candidate);
      const situationScore = scarceSharedSituations.reduce((score, situationId) => {
        const frequency = situationCounts.get(situationId) ?? activePatterns.length;
        return score + 18 + 30 / Math.max(1, frequency);
      }, 0);
      const lexicalScore = Math.min(
        30,
        (lexical.exactEnglish ? 16 : 0) +
          lexical.sharedBigramCount * 7 +
          lexical.sharedTokenCount * 2 +
          lexical.tokenJaccard * 8,
      );
      const candidateRelations = candidateFeatures.relationIds;
      const authoredTieBreak = authoredRelations.has(candidate.id)
        ? 0.2
        : candidateRelations.has(anchor.id)
          ? 0.1
          : 0;
      const score =
        (sharedCategories.length ? 120 + (sharedCategories.length - 1) * 8 : 0) +
        (samePackMacro && !sharedCategories.length ? 38 : 0) +
        situationScore +
        lexicalScore +
        cefrScore(distance) +
        authoredTieBreak;

      candidates.push({
        pattern: candidate,
        reason,
        label: reasonLabel(
          reason,
          sharedCategories[0],
          rareSharedSituation,
          context,
        ),
        score,
        cefrDistance: distance,
      });
    }

    const selected = selectCompactDeck(candidates, resultLimit);
    cache.set(anchor.id, selected);
    return selected;
  };

  return { get };
}

export function buildRelatedPatternIndex(
  patterns: readonly ConversationPattern[],
  packSource: RelatedPackSource = {},
  limit = DEFAULT_LIMIT,
): Map<string, RelatedPattern[]> {
  const activePatterns = canonicalPatterns(patterns);
  const resolver = createRelatedPatternResolver(activePatterns, packSource, limit);
  const index = new Map<string, RelatedPattern[]>();
  for (const pattern of activePatterns) index.set(pattern.id, resolver.get(pattern));

  return index;
}
