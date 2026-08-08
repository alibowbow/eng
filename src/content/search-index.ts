import type { CefrLevel, ConversationPattern, PatternPriority, SpeechRegister } from "./schema";

export interface PatternFilters {
  categoryIds?: ReadonlySet<string> | string[];
  situationIds?: ReadonlySet<string> | string[];
  tags?: ReadonlySet<string> | string[];
  cefr?: ReadonlySet<CefrLevel> | CefrLevel[];
  priority?: ReadonlySet<PatternPriority> | PatternPriority[];
  register?: ReadonlySet<SpeechRegister> | SpeechRegister[];
}

export interface SearchDocument {
  id: string;
  english: string;
  korean: string;
  pattern: string;
  intent: string;
  details: string;
  all: string;
}

export interface SearchHit {
  pattern: ConversationPattern;
  score: number;
}

export interface BuildSearchIndexOptions {
  notes?: ReadonlyMap<string, string>;
  chunkSize?: number;
  onProgress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
}

export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(values: Array<string | undefined>): string {
  return normalizeSearchText(values.filter(Boolean).join(" "));
}

export function buildSearchDocument(
  pattern: ConversationPattern,
  personalNote = "",
): SearchDocument {
  const english = compact([
    pattern.english,
    pattern.pattern,
    ...pattern.examples.map((example) => example.english),
    ...pattern.variants.map((variant) => variant.english),
    ...pattern.replies.map((reply) => reply.english),
    ...(pattern.aliases ?? []),
  ]);
  const korean = compact([
    pattern.korean,
    pattern.intentKo,
    pattern.nuanceKo,
    pattern.usageNoteKo,
    ...pattern.examples.map((example) => example.korean),
    ...pattern.variants.map((variant) => variant.korean),
    ...pattern.replies.map((reply) => reply.korean),
    ...pattern.commonMistakes.map((mistake) => mistake.explanationKo),
    personalNote,
  ]);
  const formula = normalizeSearchText(pattern.pattern);
  const intent = normalizeSearchText(pattern.intentKo);
  const details = compact([
    ...pattern.categoryIds,
    ...pattern.situationIds,
    ...pattern.tags,
    pattern.cefr,
    pattern.priority,
    ...pattern.register,
  ]);
  return {
    id: pattern.id,
    english,
    korean,
    pattern: formula,
    intent,
    details,
    all: compact([english, korean, formula, intent, details]),
  };
}

function valuesSet<T extends string>(value: ReadonlySet<T> | T[] | undefined): ReadonlySet<T> | undefined {
  if (!value) return undefined;
  return value instanceof Set ? value : new Set(value);
}

function intersects(values: string[], selected: ReadonlySet<string> | undefined): boolean {
  return !selected?.size || values.some((value) => selected.has(value));
}

export function matchesFilters(pattern: ConversationPattern, filters: PatternFilters): boolean {
  const categories = valuesSet(filters.categoryIds);
  const situations = valuesSet(filters.situationIds);
  const tags = valuesSet(filters.tags);
  const cefr = valuesSet(filters.cefr);
  const priority = valuesSet(filters.priority);
  const register = valuesSet(filters.register);
  return (
    intersects(pattern.categoryIds, categories) &&
    intersects(pattern.situationIds, situations) &&
    intersects(pattern.tags, tags) &&
    (!cefr?.size || cefr.has(pattern.cefr)) &&
    (!priority?.size || priority.has(pattern.priority)) &&
    intersects(pattern.register, register)
  );
}

export function filterPatterns(
  patterns: readonly ConversationPattern[],
  filters: PatternFilters,
): ConversationPattern[] {
  return patterns.filter((pattern) => matchesFilters(pattern, filters));
}

function scoreDocument(document: SearchDocument, terms: string[]): number {
  let score = 0;
  for (const term of terms) {
    if (!document.all.includes(term)) return 0;
    if (document.english === term || document.korean === term) score += 100;
    if (document.english.startsWith(term)) score += 34;
    if (document.korean.startsWith(term)) score += 32;
    if (document.pattern.includes(term)) score += 24;
    if (document.intent.includes(term)) score += 16;
    if (document.english.includes(term)) score += 12;
    if (document.korean.includes(term)) score += 11;
    if (document.details.includes(term)) score += 4;
    score += 1;
  }
  return score;
}

export function searchPatterns(
  patterns: readonly ConversationPattern[],
  query: string,
  options: { filters?: PatternFilters; notes?: ReadonlyMap<string, string>; limit?: number } = {},
): SearchHit[] {
  const terms = normalizeSearchText(query).split(" ").filter(Boolean);
  const hits: SearchHit[] = [];
  for (const pattern of patterns) {
    if (options.filters && !matchesFilters(pattern, options.filters)) continue;
    const score = terms.length
      ? scoreDocument(buildSearchDocument(pattern, options.notes?.get(pattern.id)), terms)
      : 1;
    if (score > 0) hits.push({ pattern, score });
  }
  hits.sort((a, b) => b.score - a.score || a.pattern.sortKey.localeCompare(b.pattern.sortKey));
  return options.limit === undefined ? hits : hits.slice(0, options.limit);
}

function tokens(document: SearchDocument): string[] {
  return Array.from(new Set(document.all.split(" ").filter((token) => token.length > 1 || /[가-힣]/.test(token))));
}

/**
 * Incremental in-memory index. Building yields between chunks so 50k cards do
 * not monopolize the UI thread. It can also be constructed inside a Web Worker.
 */
export class PatternSearchIndex {
  private readonly documents = new Map<string, SearchDocument>();
  private readonly patterns = new Map<string, ConversationPattern>();
  private readonly postings = new Map<string, Set<string>>();

  static async build(
    patterns: readonly ConversationPattern[],
    options: BuildSearchIndexOptions = {},
  ): Promise<PatternSearchIndex> {
    const index = new PatternSearchIndex();
    const chunkSize = Math.max(50, options.chunkSize ?? 500);
    for (let start = 0; start < patterns.length; start += chunkSize) {
      if (options.signal?.aborted) throw new DOMException("검색 색인 생성이 취소되었습니다.", "AbortError");
      const end = Math.min(patterns.length, start + chunkSize);
      for (let position = start; position < end; position += 1) {
        const pattern = patterns[position];
        index.upsert(pattern, options.notes?.get(pattern.id));
      }
      options.onProgress?.(end, patterns.length);
      if (end < patterns.length) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return index;
  }

  upsert(pattern: ConversationPattern, note = ""): void {
    this.remove(pattern.id);
    const document = buildSearchDocument(pattern, note);
    this.documents.set(pattern.id, document);
    this.patterns.set(pattern.id, pattern);
    for (const token of tokens(document)) {
      const ids = this.postings.get(token) ?? new Set<string>();
      ids.add(pattern.id);
      this.postings.set(token, ids);
    }
  }

  remove(patternId: string): void {
    const previous = this.documents.get(patternId);
    if (previous) {
      for (const token of tokens(previous)) {
        const ids = this.postings.get(token);
        ids?.delete(patternId);
        if (ids?.size === 0) this.postings.delete(token);
      }
    }
    this.documents.delete(patternId);
    this.patterns.delete(patternId);
  }

  search(query: string, options: { filters?: PatternFilters; limit?: number } = {}): SearchHit[] {
    const terms = normalizeSearchText(query).split(" ").filter(Boolean);
    let candidateIds: Set<string> | undefined;
    for (const term of terms) {
      const exact = this.postings.get(term);
      const matching = exact
        ? new Set(exact)
        : new Set(
            [...this.postings]
              .filter(([token]) => token.startsWith(term) || token.includes(term))
              .flatMap(([, ids]) => [...ids]),
          );
      candidateIds = candidateIds
        ? new Set([...candidateIds].filter((id) => matching.has(id)))
        : matching;
    }
    const ids = candidateIds ?? new Set(this.patterns.keys());
    const hits: SearchHit[] = [];
    for (const id of ids) {
      const pattern = this.patterns.get(id)!;
      if (options.filters && !matchesFilters(pattern, options.filters)) continue;
      const score = terms.length ? scoreDocument(this.documents.get(id)!, terms) : 1;
      if (score > 0) hits.push({ pattern, score });
    }
    hits.sort((a, b) => b.score - a.score || a.pattern.sortKey.localeCompare(b.pattern.sortKey));
    return options.limit === undefined ? hits : hits.slice(0, options.limit);
  }

  get size(): number {
    return this.patterns.size;
  }
}
