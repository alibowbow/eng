import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ContentPack } from "../../src/content/schema";
import { migrateContentPack } from "../../src/content/migrations";
import { assertValidContentPack } from "../../src/content/validator";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptDirectory, "../..");
export const packsDirectory = path.join(repoRoot, "public/content/packs");
export const manifestPath = path.join(repoRoot, "public/content/manifest.json");

export interface PackFile {
  filename: string;
  absolutePath: string;
  raw: string;
  pack: ContentPack;
  hash: string;
}

export function sha256(raw: string): string {
  return `sha256-${createHash("sha256").update(raw).digest("hex")}`;
}

export async function listPackFilenames(): Promise<string[]> {
  return (await readdir(packsDirectory))
    .filter((filename) => filename.endsWith(".json") && !filename.startsWith("_"))
    .sort();
}

export async function readPackFile(filename: string): Promise<PackFile> {
  const absolutePath = path.join(packsDirectory, filename);
  const raw = await readFile(absolutePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${filename}: JSON 파싱 실패 (${error instanceof Error ? error.message : String(error)})`);
  }
  const pack = assertValidContentPack(migrateContentPack(parsed), filename);
  return { filename, absolutePath, raw, pack, hash: sha256(raw) };
}

export async function readAllPackFiles(): Promise<PackFile[]> {
  const filenames = await listPackFilenames();
  return Promise.all(filenames.map(readPackFile));
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function commaList(values: readonly string[]): string {
  return values.length ? values.join(", ") : "—";
}
