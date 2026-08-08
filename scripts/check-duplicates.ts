import { normalizeEnglish, validateContentLibrary } from "../src/content/validator";
import { readAllPackFiles } from "./lib/content-tools";

function tokenSet(value: string): Set<string> {
  return new Set(normalizeEnglish(value).split(" ").filter(Boolean));
}

function similarity(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / Math.max(1, new Set([...a, ...b]).size);
}

async function main(): Promise<void> {
  const files = await readAllPackFiles();
  const packs = files.map((file) => file.pack);
  const checked = validateContentLibrary(packs);
  const duplicateErrors = checked.errors.filter((entry) => entry.code.startsWith("duplicate-"));
  if (duplicateErrors.length) {
    duplicateErrors.forEach((entry) => console.error(`ERROR ${entry.path}: ${entry.message}`));
    process.exitCode = 1;
    return;
  }

  const patterns = packs.flatMap((pack) => pack.patterns);
  const tokenSets = patterns.map((pattern) => tokenSet(pattern.english));
  const suspicious: Array<{ a: string; b: string; score: number }> = [];
  for (let a = 0; a < patterns.length; a += 1) {
    for (let b = a + 1; b < patterns.length; b += 1) {
      const score = similarity(tokenSets[a], tokenSets[b]);
      if (score >= 0.82 && normalizeEnglish(patterns[a].english) !== normalizeEnglish(patterns[b].english)) {
        suspicious.push({ a: patterns[a].id, b: patterns[b].id, score });
      }
    }
  }
  suspicious.sort((a, b) => b.score - a.score);
  console.log(`✓ exact ID/family/English/sortKey duplicates: 0`);
  console.log(`Near-duplicate candidates (manual review): ${suspicious.length}`);
  suspicious.slice(0, 40).forEach((pair) => console.log(`  ${(pair.score * 100).toFixed(0)}%  ${pair.a}  ↔  ${pair.b}`));
}

await main();
