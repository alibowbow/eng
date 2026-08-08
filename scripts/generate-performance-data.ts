import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function write(stream: ReturnType<typeof createWriteStream>, value: string): Promise<void> {
  if (!stream.write(value)) await once(stream, "drain");
}

async function main(): Promise<void> {
  const count = Number(arg("--count") ?? 50_000);
  if (!Number.isInteger(count) || count < 1 || count > 250_000) throw new Error("--count는 1~250000 사이 정수여야 합니다.");
  const output = path.resolve(arg("--out") ?? `/tmp/saygrid-performance-${count}.json`);
  await mkdir(path.dirname(output), { recursive: true });
  const stream = createWriteStream(output, "utf8");
  await write(stream, `{"schemaVersion":1,"packId":"performance-${count}","titleKo":"성능 테스트 ${count}","titleEn":"Performance ${count}","version":"1.0.0","contentVersion":1,"required":false,"minAppVersion":"1.0.0","releasedAt":"2026-08-08","categories":[{"id":"performance","labelKo":"성능 테스트","labelEn":"Performance"}],"situations":[{"id":"test","labelKo":"테스트","labelEn":"Test"}],"patterns":[\n`);
  for (let index = 0; index < count; index += 1) {
    const serial = String(index + 1).padStart(6, "0");
    const id = `performance.pattern-${serial}`;
    const pattern = {
      id,
      familyId: `performance.family-${serial}`,
      schemaVersion: 1,
      contentVersion: 1,
      pattern: `Performance phrase ${serial}`,
      english: `This is performance phrase number ${index + 1}.`,
      korean: `성능 테스트 문장 ${index + 1}번입니다.`,
      intentKo: "대규모 가상 그리드 성능 측정",
      categoryIds: ["performance"],
      situationIds: ["test"],
      tags: ["성능 테스트"],
      cefr: "A1",
      priority: "extended",
      register: ["neutral"],
      examples: [1, 2, 3].map((number) => ({ id: `${id}.example-${number}`, english: `Performance example ${serial}-${number}.`, korean: `성능 예문 ${serial}-${number}입니다.`, situationId: "test" })),
      variants: [],
      replies: [],
      commonMistakes: [],
      relations: { similar: [], contrast: [], prerequisites: [], followUps: [], responses: [] },
      audio: { ttsText: `This is performance phrase number ${index + 1}.`, lang: "en-US" },
      sortKey: `${String(Math.floor(index / 1_000)).padStart(3, "0")}.${String(Math.floor((index % 1_000) / 10)).padStart(3, "0")}.${String(index % 10).padStart(3, "0")}`,
      releasedAt: "2026-08-08",
    };
    await write(stream, `${index ? ",\n" : ""}${JSON.stringify(pattern)}`);
  }
  await write(stream, "\n]}\n");
  stream.end();
  await once(stream, "finish");
  console.log(`✓ ${count.toLocaleString()} virtual patterns written to ${output}`);
}

await main();
