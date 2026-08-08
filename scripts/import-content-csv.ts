import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ContentPack, ConversationPattern, TaxonomyItem } from "../src/content/schema";
import { makeEmptyRelations } from "../src/content/schema";
import { validateContentLibrary, validateContentPack } from "../src/content/validator";
import { buildContentManifest } from "./build-content-manifest";
import { packsDirectory, readAllPackFiles, stableJson } from "./lib/content-tools";

type Row = Record<string, string>;

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("CSV 따옴표가 닫히지 않았습니다.");
  row.push(field.replace(/\r$/, ""));
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function rowsAsObjects(rows: string[][]): Row[] {
  if (rows.length < 2) throw new Error("CSV에는 헤더와 한 개 이상의 데이터 행이 필요합니다.");
  const headers = rows[0].map((header) => header.trim().replace(/^\uFEFF/, ""));
  if (new Set(headers).size !== headers.length) throw new Error("CSV 헤더가 중복됩니다.");
  return rows.slice(1).map((cells, rowIndex) => {
    if (cells.length > headers.length) throw new Error(`${rowIndex + 2}행의 열 수가 헤더보다 많습니다.`);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ""]));
  });
}

function normalizeSentence(value: string): string {
  return value.normalize("NFKC").replace(/[ \t]+/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim();
}

function parseList(value: string): string[] {
  if (!value) return [];
  if (value.trim().startsWith("[")) return JSON.parse(value) as string[];
  return value.split(/[|;]/).map((part) => part.trim()).filter(Boolean);
}

function parseJsonColumn<T>(value: string, fallback: T): T {
  return value ? JSON.parse(value) as T : fallback;
}

async function loadLinkedJson(row: Row, csvDirectory: string): Promise<Partial<ConversationPattern>> {
  if (!row.detailsFile) return {};
  const target = path.resolve(csvDirectory, row.detailsFile);
  const parsed = JSON.parse(await readFile(target, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${row.id}: detailsFile은 JSON 객체여야 합니다.`);
  return parsed as Partial<ConversationPattern>;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function taxonomy(ids: string[], prefixKo: string, prefixEn: string): TaxonomyItem[] {
  return [...new Set(ids)].sort().map((id) => ({ id, labelKo: `${prefixKo} ${id}`, labelEn: `${prefixEn} ${id}` }));
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const sourceArg = process.argv.slice(2).find((item) => !item.startsWith("--") && !process.argv[process.argv.indexOf(item) - 1]?.startsWith("--"));
  if (!sourceArg) throw new Error("사용법: npm run content:import -- source.csv --pack-id new-pack-001 --title-ko '새 팩'");
  const sourcePath = path.resolve(sourceArg);
  const packId = arg("--pack-id") ?? path.basename(sourcePath, path.extname(sourcePath));
  const outPath = path.resolve(arg("--out") ?? path.join(packsDirectory, `${packId}.json`));
  if (await exists(outPath) && !process.argv.includes("--force")) {
    throw new Error(`${outPath}가 이미 있습니다. 기존 ID 보호를 위해 덮어쓰지 않았습니다. 확인 후 --force를 사용하세요.`);
  }
  const rows = rowsAsObjects(parseCsv(await readFile(sourcePath, "utf8")));
  const patterns: ConversationPattern[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const linked = await loadLinkedJson(row, path.dirname(sourcePath));
    if (!row.id) throw new Error(`${index + 2}행: id가 필요합니다. 진도를 보호하기 위해 ID를 자동 생성하지 않습니다.`);
    const pattern: ConversationPattern = {
      id: row.id,
      familyId: row.familyId,
      schemaVersion: 1,
      contentVersion: Number(row.contentVersion || 1),
      pattern: normalizeSentence(row.pattern),
      english: normalizeSentence(row.english),
      korean: normalizeSentence(row.korean),
      intentKo: normalizeSentence(row.intentKo),
      nuanceKo: normalizeSentence(row.nuanceKo) || undefined,
      usageNoteKo: normalizeSentence(row.usageNoteKo) || undefined,
      categoryIds: parseList(row.categoryIds),
      situationIds: parseList(row.situationIds),
      tags: parseList(row.tags),
      cefr: row.cefr as ConversationPattern["cefr"],
      priority: row.priority as ConversationPattern["priority"],
      register: parseList(row.register) as ConversationPattern["register"],
      examples: parseJsonColumn(row.examples, linked.examples ?? []),
      variants: parseJsonColumn(row.variants, linked.variants ?? []),
      replies: parseJsonColumn(row.replies, linked.replies ?? []),
      commonMistakes: parseJsonColumn(row.commonMistakes, linked.commonMistakes ?? []),
      relations: parseJsonColumn(row.relations, linked.relations ?? makeEmptyRelations()),
      pronunciation: linked.pronunciation,
      audio: parseJsonColumn(row.audio, linked.audio ?? { ttsText: normalizeSentence(row.english), lang: "en-US" }),
      sortKey: row.sortKey,
      aliases: parseList(row.aliases),
      releasedAt: row.releasedAt || new Date().toISOString().slice(0, 10),
    };
    patterns.push(pattern);
  }
  const categoryIds = patterns.flatMap((pattern) => pattern.categoryIds);
  const situationIds = patterns.flatMap((pattern) => pattern.situationIds);
  const pack: ContentPack = {
    schemaVersion: 1,
    packId,
    titleKo: arg("--title-ko") ?? packId,
    titleEn: arg("--title-en") ?? packId,
    version: arg("--version") ?? "1.0.0",
    contentVersion: 1,
    required: process.argv.includes("--required"),
    minAppVersion: arg("--min-app-version") ?? "1.0.0",
    releasedAt: arg("--released-at") ?? new Date().toISOString().slice(0, 10),
    categories: taxonomy(categoryIds, "분류", "Category"),
    situations: taxonomy(situationIds, "상황", "Situation"),
    patterns,
  };
  const checked = validateContentPack(pack, packId);
  if (!checked.valid) throw new Error(checked.errors.map((entry) => `${entry.path}: ${entry.message}`).join("\n"));
  const existing = await readAllPackFiles();
  const library = validateContentLibrary([...existing.filter((file) => file.absolutePath !== outPath).map((file) => file.pack), pack]);
  if (!library.valid) throw new Error(library.errors.map((entry) => `${entry.path}: ${entry.message}`).join("\n"));
  await writeFile(outPath, stableJson(pack), "utf8");
  await buildContentManifest();
  console.log(`✓ ${patterns.length} patterns imported to ${outPath}`);
}

await main();
