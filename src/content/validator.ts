import {
  CEFR_LEVELS,
  CONTENT_SCHEMA_VERSION,
  PATTERN_PRIORITIES,
  REPLY_TYPES,
  SPEECH_REGISTERS,
  type ContentManifest,
  type ContentPack,
  type ConversationPattern,
  type ManifestPack,
  type PatternRelations,
} from "./schema";

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult<T> {
  valid: boolean;
  value?: T;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  issues: ValidationIssue[];
}

export interface LibraryValidationResult extends ValidationResult<ContentPack[]> {
  patternCount: number;
}

const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SORT_KEY_PATTERN = /^\d{3}(?:\.\d{3}){2,3}$/;
const SHA256_PATTERN = /^sha256-[a-f0-9]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/;

function result<T>(issues: ValidationIssue[], value?: T): ValidationResult<T> {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return { valid: errors.length === 0, value: errors.length ? undefined : value, errors, warnings, issues };
}

function issue(
  issues: ValidationIssue[],
  severity: ValidationSeverity,
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ severity, code, path, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string | undefined {
  const value = object[key];
  if (typeof value !== "string" || value.trim() === "") {
    issue(issues, "error", "required-string", `${path}.${key}`, `${key} 값이 비어 있거나 문자열이 아닙니다.`);
    return undefined;
  }
  if (value !== value.trim()) {
    issue(issues, "warning", "outer-whitespace", `${path}.${key}`, `${key} 앞뒤에 불필요한 공백이 있습니다.`);
  }
  return value;
}

function optionalString(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string | undefined {
  const value = object[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    issue(issues, "error", "optional-string", `${path}.${key}`, `${key}는 비어 있지 않은 문자열이어야 합니다.`);
    return undefined;
  }
  return value;
}

function requiredNumber(
  object: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): number | undefined {
  const value = object[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issue(issues, "error", "required-number", `${path}.${key}`, `${key}가 유효한 숫자가 아닙니다.`);
    return undefined;
  }
  return value;
}

function stringArray(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  options: { min?: number; ids?: boolean } = {},
): string[] {
  if (!Array.isArray(value)) {
    issue(issues, "error", "required-array", path, "문자열 배열이어야 합니다.");
    return [];
  }
  const values: string[] = [];
  value.forEach((item, index) => {
    if (typeof item !== "string" || item.trim() === "") {
      issue(issues, "error", "array-string", `${path}[${index}]`, "비어 있지 않은 문자열이어야 합니다.");
    } else {
      values.push(item);
      if (options.ids && !ID_PATTERN.test(item)) {
        issue(issues, "error", "invalid-id", `${path}[${index}]`, `ID 형식이 올바르지 않습니다: ${item}`);
      }
    }
  });
  if (options.min !== undefined && values.length < options.min) {
    issue(issues, "error", "array-too-short", path, `최소 ${options.min}개가 필요합니다.`);
  }
  if (new Set(values).size !== values.length) {
    issue(issues, "error", "array-duplicate", path, "배열 안에 중복 값이 있습니다.");
  }
  return values;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: ValidationIssue[],
): value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    issue(issues, "error", "invalid-enum", path, `허용 값: ${allowed.join(", ")}`);
    return false;
  }
  return true;
}

function validateId(value: string | undefined, path: string, issues: ValidationIssue[]): void {
  if (value && !ID_PATTERN.test(value)) {
    issue(issues, "error", "invalid-id", path, `영문 소문자·숫자·점·하이픈만 사용할 수 있습니다: ${value}`);
  }
}

function validateDate(value: string | undefined, path: string, issues: ValidationIssue[]): void {
  if (value && (!ISO_DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value)))) {
    issue(issues, "error", "invalid-date", path, `ISO 날짜 형식이 아닙니다: ${value}`);
  }
}

function validateUrl(value: string | undefined, path: string, issues: ValidationIssue[]): void {
  if (!value) return;
  if (/^(?:javascript|data):/i.test(value) || /\\/.test(value)) {
    issue(issues, "error", "invalid-url", path, `안전하지 않은 URL입니다: ${value}`);
    return;
  }
  if (!(value.startsWith("/") || value.startsWith("content/") || value.startsWith("audio/") || /^https:\/\//.test(value))) {
    issue(issues, "error", "invalid-url", path, `HTTPS 또는 앱 상대 URL을 사용해야 합니다: ${value}`);
  }
}

function validateRelations(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): PatternRelations | undefined {
  if (!isRecord(value)) {
    issue(issues, "error", "relations-object", path, "relations 객체가 필요합니다.");
    return undefined;
  }
  return {
    similar: stringArray(value.similar, `${path}.similar`, issues, { ids: true }),
    contrast: stringArray(value.contrast, `${path}.contrast`, issues, { ids: true }),
    prerequisites: stringArray(value.prerequisites, `${path}.prerequisites`, issues, { ids: true }),
    followUps: stringArray(value.followUps, `${path}.followUps`, issues, { ids: true }),
    responses: stringArray(value.responses, `${path}.responses`, issues, { ids: true }),
  };
}

export function validateConversationPattern(
  value: unknown,
  path = "pattern",
): ValidationResult<ConversationPattern> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "error", "pattern-object", path, "패턴은 JSON 객체여야 합니다.");
    return result(issues);
  }

  const id = requiredString(value, "id", path, issues);
  const familyId = requiredString(value, "familyId", path, issues);
  validateId(id, `${path}.id`, issues);
  validateId(familyId, `${path}.familyId`, issues);

  const schemaVersion = requiredNumber(value, "schemaVersion", path, issues);
  const contentVersion = requiredNumber(value, "contentVersion", path, issues);
  if (schemaVersion !== undefined && schemaVersion !== CONTENT_SCHEMA_VERSION) {
    issue(issues, "error", "schema-version", `${path}.schemaVersion`, `지원 스키마는 ${CONTENT_SCHEMA_VERSION}입니다.`);
  }
  if (contentVersion !== undefined && (!Number.isInteger(contentVersion) || contentVersion < 1)) {
    issue(issues, "error", "content-version", `${path}.contentVersion`, "1 이상의 정수여야 합니다.");
  }

  const pattern = requiredString(value, "pattern", path, issues);
  const english = requiredString(value, "english", path, issues);
  const korean = requiredString(value, "korean", path, issues);
  requiredString(value, "intentKo", path, issues);
  optionalString(value, "nuanceKo", path, issues);
  optionalString(value, "usageNoteKo", path, issues);

  if (english && english.length > 160) {
    issue(issues, "warning", "long-card-english", `${path}.english`, "대표 영어 문장이 160자를 넘습니다.");
  }
  if (korean && korean.length > 100) {
    issue(issues, "warning", "long-card-korean", `${path}.korean`, "대표 한국어 문장이 100자를 넘습니다.");
  }
  if (pattern && pattern.length > 80) {
    issue(issues, "warning", "long-pattern", `${path}.pattern`, "패턴 공식이 80자를 넘습니다.");
  }

  stringArray(value.categoryIds, `${path}.categoryIds`, issues, { min: 1, ids: true });
  stringArray(value.situationIds, `${path}.situationIds`, issues, { min: 1, ids: true });
  stringArray(value.tags, `${path}.tags`, issues, { min: 1 });
  enumValue(value.cefr, CEFR_LEVELS, `${path}.cefr`, issues);
  enumValue(value.priority, PATTERN_PRIORITIES, `${path}.priority`, issues);
  const registers = stringArray(value.register, `${path}.register`, issues, { min: 1 });
  registers.forEach((register, index) =>
    enumValue(register, SPEECH_REGISTERS, `${path}.register[${index}]`, issues),
  );

  if (!Array.isArray(value.examples)) {
    issue(issues, "error", "examples-array", `${path}.examples`, "examples 배열이 필요합니다.");
  } else {
    if (value.examples.length < 3) {
      issue(issues, "error", "examples-minimum", `${path}.examples`, "추가 예문은 최소 3개여야 합니다.");
    }
    const exampleIds = new Set<string>();
    value.examples.forEach((example, index) => {
      const examplePath = `${path}.examples[${index}]`;
      if (!isRecord(example)) {
        issue(issues, "error", "example-object", examplePath, "예문은 객체여야 합니다.");
        return;
      }
      const exampleId = requiredString(example, "id", examplePath, issues);
      validateId(exampleId, `${examplePath}.id`, issues);
      requiredString(example, "english", examplePath, issues);
      requiredString(example, "korean", examplePath, issues);
      optionalString(example, "situationId", examplePath, issues);
      optionalString(example, "noteKo", examplePath, issues);
      if (exampleId && exampleIds.has(exampleId)) {
        issue(issues, "error", "duplicate-example-id", `${examplePath}.id`, `예문 ID 중복: ${exampleId}`);
      }
      if (exampleId) exampleIds.add(exampleId);
    });
  }

  if (!Array.isArray(value.variants)) {
    issue(issues, "error", "variants-array", `${path}.variants`, "variants 배열이 필요합니다.");
  } else {
    value.variants.forEach((variant, index) => {
      const variantPath = `${path}.variants[${index}]`;
      if (!isRecord(variant)) {
        issue(issues, "error", "variant-object", variantPath, "변형 표현은 객체여야 합니다.");
        return;
      }
      validateId(requiredString(variant, "id", variantPath, issues), `${variantPath}.id`, issues);
      requiredString(variant, "english", variantPath, issues);
      requiredString(variant, "korean", variantPath, issues);
      enumValue(variant.register, SPEECH_REGISTERS, `${variantPath}.register`, issues);
      optionalString(variant, "nuanceKo", variantPath, issues);
    });
  }

  if (!Array.isArray(value.replies)) {
    issue(issues, "error", "replies-array", `${path}.replies`, "replies 배열이 필요합니다.");
  } else {
    value.replies.forEach((reply, index) => {
      const replyPath = `${path}.replies[${index}]`;
      if (!isRecord(reply)) {
        issue(issues, "error", "reply-object", replyPath, "응답은 객체여야 합니다.");
        return;
      }
      validateId(requiredString(reply, "id", replyPath, issues), `${replyPath}.id`, issues);
      requiredString(reply, "english", replyPath, issues);
      requiredString(reply, "korean", replyPath, issues);
      enumValue(reply.type, REPLY_TYPES, `${replyPath}.type`, issues);
    });
  }

  if (!Array.isArray(value.commonMistakes)) {
    issue(issues, "error", "mistakes-array", `${path}.commonMistakes`, "commonMistakes 배열이 필요합니다.");
  } else {
    value.commonMistakes.forEach((mistake, index) => {
      const mistakePath = `${path}.commonMistakes[${index}]`;
      if (!isRecord(mistake)) {
        issue(issues, "error", "mistake-object", mistakePath, "오류 예시는 객체여야 합니다.");
        return;
      }
      requiredString(mistake, "wrong", mistakePath, issues);
      requiredString(mistake, "corrected", mistakePath, issues);
      requiredString(mistake, "explanationKo", mistakePath, issues);
    });
  }

  validateRelations(value.relations, `${path}.relations`, issues);

  if (value.pronunciation !== undefined && !isRecord(value.pronunciation)) {
    issue(issues, "error", "pronunciation-object", `${path}.pronunciation`, "pronunciation은 객체여야 합니다.");
  }
  if (value.audio !== undefined) {
    if (!isRecord(value.audio)) {
      issue(issues, "error", "audio-object", `${path}.audio`, "audio는 객체여야 합니다.");
    } else {
      optionalString(value.audio, "ttsText", `${path}.audio`, issues);
      if (value.audio.lang !== undefined && !["en-US", "en-GB"].includes(String(value.audio.lang))) {
        issue(issues, "error", "audio-lang", `${path}.audio.lang`, "en-US 또는 en-GB만 사용할 수 있습니다.");
      }
      validateUrl(optionalString(value.audio, "audioUrl", `${path}.audio`, issues), `${path}.audio.audioUrl`, issues);
      validateUrl(optionalString(value.audio, "slowAudioUrl", `${path}.audio`, issues), `${path}.audio.slowAudioUrl`, issues);
      optionalString(value.audio, "speaker", `${path}.audio`, issues);
      optionalString(value.audio, "accent", `${path}.audio`, issues);
    }
  }

  const sortKey = requiredString(value, "sortKey", path, issues);
  if (sortKey && !SORT_KEY_PATTERN.test(sortKey)) {
    issue(issues, "error", "sort-key", `${path}.sortKey`, "sortKey는 000.000.000 형식이어야 합니다.");
  }
  if (value.aliases !== undefined) stringArray(value.aliases, `${path}.aliases`, issues, { ids: true });
  if (value.deprecated !== undefined && typeof value.deprecated !== "boolean") {
    issue(issues, "error", "deprecated-boolean", `${path}.deprecated`, "deprecated는 boolean이어야 합니다.");
  }
  const replacedBy = optionalString(value, "replacedBy", path, issues);
  validateId(replacedBy, `${path}.replacedBy`, issues);
  if (value.deprecated === true && !replacedBy) {
    issue(issues, "error", "deprecated-without-replacement", path, "deprecated 패턴에는 replacedBy가 필요합니다.");
  }
  const releasedAt = optionalString(value, "releasedAt", path, issues);
  validateDate(releasedAt, `${path}.releasedAt`, issues);

  return result(issues, value as unknown as ConversationPattern);
}

function validateTaxonomy(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issue(issues, "error", "taxonomy-array", path, "분류 목록은 배열이어야 합니다.");
    return;
  }
  const ids = new Set<string>();
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      issue(issues, "error", "taxonomy-object", itemPath, "분류 항목은 객체여야 합니다.");
      return;
    }
    const id = requiredString(item, "id", itemPath, issues);
    validateId(id, `${itemPath}.id`, issues);
    requiredString(item, "labelKo", itemPath, issues);
    requiredString(item, "labelEn", itemPath, issues);
    if (id && ids.has(id)) issue(issues, "error", "taxonomy-duplicate", `${itemPath}.id`, `중복 분류 ID: ${id}`);
    if (id) ids.add(id);
  });
}

export function validateContentPack(value: unknown, path = "pack"): ValidationResult<ContentPack> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "error", "pack-object", path, "콘텐츠 팩은 JSON 객체여야 합니다.");
    return result(issues);
  }
  const schemaVersion = requiredNumber(value, "schemaVersion", path, issues);
  if (schemaVersion !== undefined && schemaVersion !== CONTENT_SCHEMA_VERSION) {
    issue(issues, "error", "schema-version", `${path}.schemaVersion`, `지원 스키마는 ${CONTENT_SCHEMA_VERSION}입니다.`);
  }
  const packId = requiredString(value, "packId", path, issues);
  validateId(packId, `${path}.packId`, issues);
  requiredString(value, "titleKo", path, issues);
  requiredString(value, "titleEn", path, issues);
  optionalString(value, "descriptionKo", path, issues);
  const version = requiredString(value, "version", path, issues);
  if (version && !SEMVER_PATTERN.test(version)) {
    issue(issues, "error", "pack-version", `${path}.version`, "팩 버전은 SemVer(예: 1.2.0) 형식이어야 합니다.");
  }
  const contentVersion = requiredNumber(value, "contentVersion", path, issues);
  if (contentVersion !== undefined && (!Number.isInteger(contentVersion) || contentVersion < 1)) {
    issue(issues, "error", "content-version", `${path}.contentVersion`, "1 이상의 정수여야 합니다.");
  }
  if (typeof value.required !== "boolean") issue(issues, "error", "pack-required", `${path}.required`, "boolean이어야 합니다.");
  const minAppVersion = requiredString(value, "minAppVersion", path, issues);
  if (minAppVersion && !SEMVER_PATTERN.test(minAppVersion)) {
    issue(issues, "error", "min-app-version", `${path}.minAppVersion`, "SemVer 형식이어야 합니다.");
  }
  validateDate(requiredString(value, "releasedAt", path, issues), `${path}.releasedAt`, issues);
  validateTaxonomy(value.categories, `${path}.categories`, issues);
  validateTaxonomy(value.situations, `${path}.situations`, issues);

  if (!Array.isArray(value.patterns) || value.patterns.length === 0) {
    issue(issues, "error", "patterns-array", `${path}.patterns`, "한 개 이상의 패턴이 필요합니다.");
  } else {
    value.patterns.forEach((pattern, index) => {
      const checked = validateConversationPattern(pattern, `${path}.patterns[${index}]`);
      issues.push(...checked.issues);
    });
  }

  if (Array.isArray(value.patterns)) {
    const categoryIds = new Set(
      Array.isArray(value.categories)
        ? value.categories.filter(isRecord).map((item) => item.id).filter((id): id is string => typeof id === "string")
        : [],
    );
    const situationIds = new Set(
      Array.isArray(value.situations)
        ? value.situations.filter(isRecord).map((item) => item.id).filter((id): id is string => typeof id === "string")
        : [],
    );
    value.patterns.forEach((pattern, index) => {
      if (!isRecord(pattern)) return;
      if (Array.isArray(pattern.categoryIds)) {
        pattern.categoryIds.forEach((id) => {
          if (typeof id === "string" && !categoryIds.has(id)) {
            issue(issues, "error", "unknown-category", `${path}.patterns[${index}].categoryIds`, `팩에 선언되지 않은 categoryId: ${id}`);
          }
        });
      }
      if (Array.isArray(pattern.situationIds)) {
        pattern.situationIds.forEach((id) => {
          if (typeof id === "string" && !situationIds.has(id)) {
            issue(issues, "error", "unknown-situation", `${path}.patterns[${index}].situationIds`, `팩에 선언되지 않은 situationId: ${id}`);
          }
        });
      }
    });
  }

  return result(issues, value as unknown as ContentPack);
}

export function normalizeEnglish(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateContentLibrary(packs: ContentPack[]): LibraryValidationResult {
  const issues: ValidationIssue[] = [];
  for (let index = 0; index < packs.length; index += 1) {
    issues.push(...validateContentPack(packs[index], `packs[${index}]`).issues);
  }

  const packIds = new Map<string, string>();
  const ids = new Map<string, string>();
  const familyIds = new Map<string, string>();
  const sortKeys = new Map<string, string>();
  const english = new Map<string, string>();
  const aliasTarget = new Map<string, string>();
  const patterns = packs.flatMap((pack) => pack.patterns);

  packs.forEach((pack, packIndex) => {
    const previous = packIds.get(pack.packId);
    if (previous) issue(issues, "error", "duplicate-pack-id", `packs[${packIndex}].packId`, `${pack.packId}가 ${previous}와 중복됩니다.`);
    else packIds.set(pack.packId, `packs[${packIndex}]`);

    pack.patterns.forEach((pattern, patternIndex) => {
      const path = `packs[${packIndex}].patterns[${patternIndex}]`;
      for (const [map, value, code, label] of [
        [ids, pattern.id, "duplicate-id", "id"],
        [familyIds, pattern.familyId, "duplicate-family-id", "familyId"],
        [sortKeys, pattern.sortKey, "duplicate-sort-key", "sortKey"],
      ] as const) {
        const previousPath = map.get(value);
        if (previousPath) issue(issues, "error", code, `${path}.${label}`, `${value}가 ${previousPath}와 중복됩니다.`);
        else map.set(value, path);
      }
      const normalized = normalizeEnglish(pattern.english);
      const previousEnglish = english.get(normalized);
      if (previousEnglish) {
        issue(issues, "error", "duplicate-english", `${path}.english`, `문장부호/대소문자를 무시하면 ${previousEnglish}와 중복됩니다.`);
      } else english.set(normalized, path);
      for (const alias of pattern.aliases ?? []) {
        const previousAlias = aliasTarget.get(alias);
        if (previousAlias && previousAlias !== pattern.id) {
          issue(issues, "error", "duplicate-alias", `${path}.aliases`, `${alias}가 여러 패턴을 가리킵니다.`);
        }
        aliasTarget.set(alias, pattern.id);
      }
    });
  });

  const knownIds = new Set([...ids.keys(), ...aliasTarget.keys()]);
  patterns.forEach((pattern) => {
    const relationGroups = Object.entries(pattern.relations) as Array<[keyof PatternRelations, string[]]>;
    for (const [kind, relationIds] of relationGroups) {
      for (const relationId of relationIds) {
        if (!knownIds.has(relationId)) {
          issue(issues, "error", "unknown-relation", `${pattern.id}.relations.${kind}`, `존재하지 않는 패턴 ID: ${relationId}`);
        }
        if (relationId === pattern.id) {
          issue(issues, "error", "self-relation", `${pattern.id}.relations.${kind}`, "자기 자신을 관계로 지정할 수 없습니다.");
        }
      }
    }
    if (pattern.replacedBy && !knownIds.has(pattern.replacedBy)) {
      issue(issues, "error", "unknown-replacement", `${pattern.id}.replacedBy`, `대체 패턴이 없습니다: ${pattern.replacedBy}`);
    }
  });

  const replacements = new Map(patterns.filter((p) => p.replacedBy).map((p) => [p.id, p.replacedBy!]));
  for (const start of replacements.keys()) {
    const seen = new Set<string>();
    let cursor: string | undefined = start;
    while (cursor && replacements.has(cursor)) {
      if (seen.has(cursor)) {
        issue(issues, "error", "replacement-cycle", `${start}.replacedBy`, `replacedBy 순환이 발견되었습니다: ${[...seen, cursor].join(" -> ")}`);
        break;
      }
      seen.add(cursor);
      cursor = replacements.get(cursor);
    }
  }

  const base = result(issues, packs);
  return { ...base, patternCount: patterns.length };
}

function validateManifestPack(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "error", "manifest-pack-object", path, "manifest pack은 객체여야 합니다.");
    return;
  }
  validateId(requiredString(value, "packId", path, issues), `${path}.packId`, issues);
  requiredString(value, "titleKo", path, issues);
  requiredString(value, "titleEn", path, issues);
  const version = requiredString(value, "version", path, issues);
  if (version && !SEMVER_PATTERN.test(version)) issue(issues, "error", "pack-version", `${path}.version`, "SemVer 형식이어야 합니다.");
  validateUrl(requiredString(value, "url", path, issues), `${path}.url`, issues);
  const hash = requiredString(value, "hash", path, issues);
  if (hash && !SHA256_PATTERN.test(hash)) issue(issues, "error", "hash-format", `${path}.hash`, "sha256- + 64자리 소문자 hex 형식이어야 합니다.");
  const count = requiredNumber(value, "patternCount", path, issues);
  if (count !== undefined && (!Number.isInteger(count) || count < 0)) issue(issues, "error", "pattern-count", `${path}.patternCount`, "0 이상의 정수여야 합니다.");
  if (typeof value.required !== "boolean") issue(issues, "error", "pack-required", `${path}.required`, "boolean이어야 합니다.");
  const minAppVersion = requiredString(value, "minAppVersion", path, issues);
  if (minAppVersion && !SEMVER_PATTERN.test(minAppVersion)) issue(issues, "error", "min-app-version", `${path}.minAppVersion`, "SemVer 형식이어야 합니다.");
  validateDate(requiredString(value, "releasedAt", path, issues), `${path}.releasedAt`, issues);
  stringArray(value.categoryIds, `${path}.categoryIds`, issues, { ids: true });
  stringArray(value.situationIds, `${path}.situationIds`, issues, { ids: true });
  stringArray(value.tags, `${path}.tags`, issues);
}

export function validateManifest(value: unknown, path = "manifest"): ValidationResult<ContentManifest> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, "error", "manifest-object", path, "manifest는 JSON 객체여야 합니다.");
    return result(issues);
  }
  const schemaVersion = requiredNumber(value, "schemaVersion", path, issues);
  if (schemaVersion !== undefined && schemaVersion !== CONTENT_SCHEMA_VERSION) issue(issues, "error", "schema-version", `${path}.schemaVersion`, `지원 스키마는 ${CONTENT_SCHEMA_VERSION}입니다.`);
  requiredString(value, "contentVersion", path, issues);
  validateDate(requiredString(value, "generatedAt", path, issues), `${path}.generatedAt`, issues);
  const totalPatternCount = requiredNumber(value, "totalPatternCount", path, issues);
  if (!Array.isArray(value.packs)) {
    issue(issues, "error", "manifest-packs", `${path}.packs`, "packs 배열이 필요합니다.");
  } else {
    value.packs.forEach((pack, index) => validateManifestPack(pack, `${path}.packs[${index}]`, issues));
    const ids = value.packs.filter(isRecord).map((pack) => pack.packId).filter((id): id is string => typeof id === "string");
    if (new Set(ids).size !== ids.length) issue(issues, "error", "duplicate-pack-id", `${path}.packs`, "중복 packId가 있습니다.");
    const sum = value.packs.reduce((count, pack) => count + (isRecord(pack) && typeof pack.patternCount === "number" ? pack.patternCount : 0), 0);
    if (totalPatternCount !== undefined && totalPatternCount !== sum) issue(issues, "error", "manifest-count", `${path}.totalPatternCount`, `팩 합계 ${sum}와 일치하지 않습니다.`);
  }
  validateTaxonomy(value.categories, `${path}.categories`, issues);
  validateTaxonomy(value.situations, `${path}.situations`, issues);
  if (!Array.isArray(value.tags)) issue(issues, "error", "manifest-tags", `${path}.tags`, "tags 배열이 필요합니다.");
  return result(issues, value as unknown as ContentManifest);
}

export function assertValidContentPack(value: unknown, source = "content pack"): ContentPack {
  const checked = validateContentPack(value, source);
  if (!checked.valid || !checked.value) {
    throw new Error(`${source} 검증 실패:\n${checked.errors.map((item) => `${item.path}: ${item.message}`).join("\n")}`);
  }
  return checked.value;
}

export function assertValidManifest(value: unknown, source = "manifest"): ContentManifest {
  const checked = validateManifest(value, source);
  if (!checked.valid || !checked.value) {
    throw new Error(`${source} 검증 실패:\n${checked.errors.map((item) => `${item.path}: ${item.message}`).join("\n")}`);
  }
  return checked.value;
}

export function isManifestPack(value: unknown): value is ManifestPack {
  const issues: ValidationIssue[] = [];
  validateManifestPack(value, "pack", issues);
  return !issues.some((entry) => entry.severity === "error");
}
