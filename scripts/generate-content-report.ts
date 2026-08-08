import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeEnglish } from "../src/content/validator";
import { readAllPackFiles, repoRoot, stableJson } from "./lib/content-tools";

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function table(map: Map<string, number>): string {
  return [...map]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => `| ${label} | ${count} |`)
    .join("\n");
}

async function main(): Promise<void> {
  const files = await readAllPackFiles();
  const patterns = files.flatMap((file) => file.pack.patterns);
  const categories = new Map<string, number>();
  const situations = new Map<string, number>();
  const cefr = new Map<string, number>();
  const priorities = new Map<string, number>();
  const english = new Map<string, string[]>();
  for (const pattern of patterns) {
    pattern.categoryIds.forEach((id) => increment(categories, id));
    pattern.situationIds.forEach((id) => increment(situations, id));
    increment(cefr, pattern.cefr);
    increment(priorities, pattern.priority);
    const normalized = normalizeEnglish(pattern.english);
    english.set(normalized, [...(english.get(normalized) ?? []), pattern.id]);
  }
  const duplicateCandidates = [...english.values()].filter((ids) => ids.length > 1);
  const isolatedPatterns = patterns
    .filter((pattern) => Object.values(pattern.relations).every((ids) => ids.length === 0))
    .map((pattern) => pattern.id);
  const exampleCount = patterns.reduce((count, pattern) => count + pattern.examples.length, 0);
  const withRecordedAudio = patterns.filter((pattern) => pattern.audio?.audioUrl).length;
  const withVariants = patterns.filter((pattern) => pattern.variants.length > 0).length;
  const withMistakes = patterns.filter((pattern) => pattern.commonMistakes.length > 0).length;
  const essentialCount = patterns.filter((pattern) => pattern.priority === "essential").length;

  const data = {
    generatedAt: new Date().toISOString(),
    packCount: files.length,
    patternCount: patterns.length,
    exampleCount,
    categoryCount: categories.size,
    situationCount: situations.size,
    essentialCount,
    essentialRatio: essentialCount / patterns.length,
    recordedAudioCount: withRecordedAudio,
    recordedAudioRatio: withRecordedAudio / patterns.length,
    browserTtsCount: patterns.filter((pattern) => pattern.audio?.ttsText).length,
    withVariants,
    withMistakes,
    duplicateCandidates,
    isolatedPatterns,
    categories: Object.fromEntries(categories),
    situations: Object.fromEntries(situations),
    cefr: Object.fromEntries(cefr),
    priorities: Object.fromEntries(priorities),
  };
  const docsDirectory = path.join(repoRoot, "docs");
  await mkdir(docsDirectory, { recursive: true });
  await writeFile(path.join(docsDirectory, "content-report.json"), stableJson(data), "utf8");
  const markdown = `# SayGrid 콘텐츠 검수 리포트

생성 시각: ${data.generatedAt}

## 요약

| 항목 | 값 |
|---|---:|
| 콘텐츠 팩 | ${data.packCount} |
| 패턴 패밀리 | ${data.patternCount} |
| 추가 예문 | ${data.exampleCount} |
| 카테고리 | ${data.categoryCount} |
| 상황 | ${data.situationCount} |
| 필수 패턴 비율 | ${(data.essentialRatio * 100).toFixed(1)}% |
| 브라우저 TTS 준비 | ${data.browserTtsCount} (${((data.browserTtsCount / patterns.length) * 100).toFixed(1)}%) |
| 녹음 음성 보유 | ${data.recordedAudioCount} (${(data.recordedAudioRatio * 100).toFixed(1)}%) |
| 변형 표현 보유 | ${data.withVariants} |
| 흔한 오류 보유 | ${data.withMistakes} |
| 완전 중복 의심 | ${data.duplicateCandidates.length} |
| 관계 없는 고립 패턴 | ${data.isolatedPatterns.length} |

## CEFR

| 단계 | 개수 |
|---|---:|
${table(cefr)}

## 우선순위

| 우선순위 | 개수 |
|---|---:|
${table(priorities)}

## 카테고리

| ID | 개수 |
|---|---:|
${table(categories)}

## 상황

| ID | 개수 |
|---|---:|
${table(situations)}

## 수동 검수 큐

- 완전 중복 후보: ${data.duplicateCandidates.length ? data.duplicateCandidates.map((ids) => ids.join(" ↔ ")).join(", ") : "없음"}
- 관계 없는 패턴: ${data.isolatedPatterns.length ? data.isolatedPatterns.join(", ") : "없음"}
- 녹음 음성은 선택 사항이며, 현재 모든 항목에 Web Speech API용 \`ttsText\`가 있다.
`;
  await writeFile(path.join(docsDirectory, "CONTENT_REPORT.md"), markdown, "utf8");
  console.log(`✓ report: ${patterns.length} patterns, ${exampleCount} examples`);
}

await main();
