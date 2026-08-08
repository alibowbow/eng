import { readFile } from "node:fs/promises";
import { validateContentLibrary, validateManifest } from "../src/content/validator";
import { manifestPath, readAllPackFiles } from "./lib/content-tools";

async function main(): Promise<void> {
  const files = await readAllPackFiles();
  const checked = validateContentLibrary(files.map((file) => file.pack));
  for (const warning of checked.warnings) {
    console.warn(`WARNING ${warning.code} ${warning.path}: ${warning.message}`);
  }
  if (!checked.valid) {
    for (const error of checked.errors) console.error(`ERROR ${error.code} ${error.path}: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const rawManifest = await readFile(manifestPath, "utf8");
  const manifest = validateManifest(JSON.parse(rawManifest));
  if (!manifest.valid || !manifest.value) {
    for (const error of manifest.errors) console.error(`ERROR ${error.code} ${error.path}: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const actualById = new Map(files.map((file) => [file.pack.packId, file]));
  for (const descriptor of manifest.value.packs) {
    const file = actualById.get(descriptor.packId);
    if (!file) throw new Error(`manifest에만 존재하는 팩: ${descriptor.packId}`);
    if (file.hash !== descriptor.hash) throw new Error(`${descriptor.packId}: manifest 해시가 현재 파일과 다릅니다. npm run content:manifest를 실행하세요.`);
    if (file.pack.patterns.length !== descriptor.patternCount) throw new Error(`${descriptor.packId}: manifest 패턴 수가 다릅니다.`);
    actualById.delete(descriptor.packId);
  }
  if (actualById.size) throw new Error(`manifest에 누락된 팩: ${[...actualById.keys()].join(", ")}`);
  if (checked.patternCount < 500) throw new Error(`초기 콘텐츠는 최소 500개여야 합니다. 현재 ${checked.patternCount}개입니다.`);
  console.log(`✓ ${files.length} packs, ${checked.patternCount} patterns, manifest hashes valid`);
  console.log(`✓ ${files.reduce((count, file) => count + file.pack.patterns.reduce((sum, pattern) => sum + pattern.examples.length, 0), 0)} examples`);
}

await main();
