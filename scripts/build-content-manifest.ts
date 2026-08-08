import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ContentManifest, TaxonomyItem } from "../src/content/schema";
import { assertValidManifest, validateContentLibrary } from "../src/content/validator";
import { manifestPath, readAllPackFiles, stableJson } from "./lib/content-tools";

interface CountedTaxonomy extends TaxonomyItem {
  count: number;
}

export async function buildContentManifest(): Promise<ContentManifest> {
  const files = await readAllPackFiles();
  if (files.length === 0) throw new Error("public/content/packs에 JSON 팩이 없습니다.");
  const library = validateContentLibrary(files.map((file) => file.pack));
  if (!library.valid) {
    throw new Error(library.errors.map((entry) => `${entry.path}: ${entry.message}`).join("\n"));
  }

  const categories = new Map<string, CountedTaxonomy>();
  const situations = new Map<string, CountedTaxonomy>();
  const tags = new Map<string, number>();
  const taxonomySource = new Map<string, TaxonomyItem>();

  for (const { pack } of files) {
    for (const item of [...pack.categories, ...pack.situations]) taxonomySource.set(item.id, item);
    for (const pattern of pack.patterns) {
      for (const id of pattern.categoryIds) {
        const item = taxonomySource.get(id) ?? { id, labelKo: id, labelEn: id };
        const current = categories.get(id) ?? { ...item, count: 0 };
        current.count += 1;
        categories.set(id, current);
      }
      for (const id of pattern.situationIds) {
        const item = taxonomySource.get(id) ?? { id, labelKo: id, labelEn: id };
        const current = situations.get(id) ?? { ...item, count: 0 };
        current.count += 1;
        situations.set(id, current);
      }
      for (const tag of pattern.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
    }
  }

  const latestRelease = files
    .map((file) => file.pack.releasedAt.slice(0, 10))
    .sort()
    .at(-1) ?? new Date().toISOString().slice(0, 10);
  const manifest: ContentManifest = {
    schemaVersion: 1,
    contentVersion: latestRelease.replaceAll("-", "."),
    generatedAt: `${latestRelease}T00:00:00.000Z`,
    totalPatternCount: library.patternCount,
    packs: files.map(({ filename, pack, hash }) => ({
      packId: pack.packId,
      titleKo: pack.titleKo,
      titleEn: pack.titleEn,
      version: pack.version,
      url: `content/packs/${filename}`,
      hash,
      patternCount: pack.patterns.length,
      required: pack.required,
      minAppVersion: pack.minAppVersion,
      releasedAt: pack.releasedAt,
      categoryIds: [...new Set(pack.patterns.flatMap((pattern) => pattern.categoryIds))].sort(),
      situationIds: [...new Set(pack.patterns.flatMap((pattern) => pattern.situationIds))].sort(),
      tags: [...new Set(pack.patterns.flatMap((pattern) => pattern.tags))].sort(),
    })),
    categories: [...categories.values()].sort((a, b) => a.id.localeCompare(b.id)),
    situations: [...situations.values()].sort((a, b) => a.id.localeCompare(b.id)),
    tags: [...tags].map(([id, count]) => ({ id, count })).sort((a, b) => a.id.localeCompare(b.id)),
  };

  assertValidManifest(manifest);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, stableJson(manifest), "utf8");
  console.log(`manifest.json: ${manifest.packs.length} packs, ${manifest.totalPatternCount} patterns`);
  return manifest;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) {
  await buildContentManifest();
}
