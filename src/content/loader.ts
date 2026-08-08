import {
  db,
  type CachedContent,
  type InstalledPack,
  type StoredManifest,
} from "../lib/db";
import type {
  ContentManifest,
  ContentPack,
  ConversationPattern,
  ManifestPack,
} from "./schema";
import { migrateContentPack, migrateStoredUserData } from "./migrations";
import {
  assertValidContentPack,
  assertValidManifest,
  validateContentLibrary,
} from "./validator";

export type ContentSource = "network" | "cache" | "mixed";

export interface LoadContentOptions {
  appVersion?: string;
  baseUrl?: string;
  manifestPath?: string;
  includeOptional?: boolean;
  packIds?: string[];
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  migrateProgress?: boolean;
}

export interface ContentUpdateSummary {
  newPatternCount: number;
  changedPatternCount: number;
  updatedPackIds: string[];
  newPackIds: string[];
}

export interface LoadedContent {
  manifest: ContentManifest;
  packs: ContentPack[];
  patterns: ConversationPattern[];
  source: ContentSource;
  updates: ContentUpdateSummary;
  errors: string[];
}

export interface LoadedManifest {
  manifest: ContentManifest;
  source: "network" | "cache";
  previous?: ContentManifest;
  warning?: string;
}

export interface LoadedPack {
  pack: ContentPack;
  source: "network" | "cache";
  stale: boolean;
  warning?: string;
}

export class ContentLoadError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ContentLoadError";
  }
}

const FALLBACK_APP_VERSION = "1.0.0";

function viteBaseUrl(): string {
  return import.meta.env?.BASE_URL || "/";
}

/** Resolve content against Vite BASE_URL so GitHub Pages `/eng/` works. */
export function resolveContentUrl(path: string, baseUrl = viteBaseUrl()): string {
  if (/^https:\/\//i.test(path)) return path;
  const cleanPath = path.replace(/^\/+/, "");
  const normalizedBase = `/${baseUrl.replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");
  if (typeof document !== "undefined") {
    return new URL(cleanPath, new URL(normalizedBase, document.baseURI)).toString();
  }
  return `${normalizedBase}${cleanPath}`.replace(/\/{2,}/g, "/");
}

function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function satisfiesMinAppVersion(appVersion: string, minAppVersion: string): boolean {
  const actual = parseVersion(appVersion);
  const minimum = parseVersion(minAppVersion);
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] > minimum[index]) return true;
    if (actual[index] < minimum[index]) return false;
  }
  return true;
}

export async function sha256Text(text: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new ContentLoadError("이 브라우저는 콘텐츠 무결성 검사를 지원하지 않습니다.");
  }
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256-${hex}`;
}

async function fetchText(url: string, options: LoadContentOptions): Promise<string> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (!fetcher) throw new ContentLoadError("fetch API를 사용할 수 없습니다.");
  const response = await fetcher(url, {
    cache: "no-cache",
    signal: options.signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new ContentLoadError(`${url} 다운로드 실패 (${response.status})`);
  return response.text();
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ContentLoadError(`${label} JSON을 해석할 수 없습니다.`, error);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function loadManifest(options: LoadContentOptions = {}): Promise<LoadedManifest> {
  const stored = await db.get("contentManifest", "active");
  let cached: ContentManifest | undefined;
  if (stored) {
    try {
      cached = assertValidManifest(stored.manifest, "cached manifest");
    } catch {
      // A corrupt cache is ignored; it is not allowed to poison a valid network response.
    }
  }

  const manifestUrl = resolveContentUrl(options.manifestPath ?? "content/manifest.json", options.baseUrl);
  try {
    const text = await fetchText(manifestUrl, options);
    const manifest = assertValidManifest(parseJson(text, "manifest"), "network manifest");
    await db.put("contentManifest", {
      id: "active",
      manifest,
      cachedAt: new Date().toISOString(),
    } satisfies StoredManifest);
    return { manifest, source: "network", previous: cached };
  } catch (error) {
    if (cached) {
      return {
        manifest: cached,
        source: "cache",
        previous: cached,
        warning: `최신 콘텐츠 목록을 불러오지 못해 저장된 목록을 사용합니다: ${errorMessage(error)}`,
      };
    }
    throw new ContentLoadError("콘텐츠 목록과 오프라인 캐시를 모두 불러오지 못했습니다.", error);
  }
}

function validCachedPack(record: CachedContent | undefined): ContentPack | undefined {
  if (!record) return undefined;
  try {
    return assertValidContentPack(migrateContentPack(record.pack), `cached pack ${record.packId}`);
  } catch {
    return undefined;
  }
}

export async function loadPack(
  descriptor: ManifestPack,
  options: LoadContentOptions = {},
): Promise<LoadedPack> {
  const appVersion = options.appVersion ?? FALLBACK_APP_VERSION;
  if (!satisfiesMinAppVersion(appVersion, descriptor.minAppVersion)) {
    throw new ContentLoadError(
      `${descriptor.titleKo} 팩은 앱 ${descriptor.minAppVersion} 이상이 필요합니다. (현재 ${appVersion})`,
    );
  }

  const cachedRecord = await db.get("cachedContent", descriptor.packId);
  const cachedPack = validCachedPack(cachedRecord);
  if (cachedPack && cachedRecord?.hash === descriptor.hash && cachedRecord.version === descriptor.version) {
    await markInstalled(descriptor);
    return { pack: cachedPack, source: "cache", stale: false };
  }

  const packUrl = resolveContentUrl(descriptor.url, options.baseUrl);
  try {
    const text = await fetchText(packUrl, options);
    const actualHash = await sha256Text(text);
    if (actualHash !== descriptor.hash) {
      throw new ContentLoadError(
        `${descriptor.packId} 해시가 manifest와 다릅니다. (${actualHash.slice(0, 20)}…)`,
      );
    }
    const pack = assertValidContentPack(
      migrateContentPack(parseJson(text, descriptor.packId)),
      `network pack ${descriptor.packId}`,
    );
    if (pack.packId !== descriptor.packId) throw new ContentLoadError(`팩 ID 불일치: ${pack.packId}`);
    if (pack.version !== descriptor.version) throw new ContentLoadError(`팩 버전 불일치: ${pack.version}`);
    if (pack.patterns.length !== descriptor.patternCount) {
      throw new ContentLoadError(`패턴 수 불일치: manifest ${descriptor.patternCount}, pack ${pack.patterns.length}`);
    }
    await db.put("cachedContent", {
      packId: descriptor.packId,
      version: descriptor.version,
      hash: descriptor.hash,
      pack,
      cachedAt: new Date().toISOString(),
    });
    await markInstalled(descriptor);
    return { pack, source: "network", stale: false };
  } catch (error) {
    if (cachedPack) {
      return {
        pack: cachedPack,
        source: "cache",
        stale: true,
        warning: `${descriptor.titleKo} 업데이트에 실패해 이전 버전을 사용합니다: ${errorMessage(error)}`,
      };
    }
    throw new ContentLoadError(`${descriptor.titleKo} 팩을 불러올 수 없습니다.`, error);
  }
}

async function markInstalled(descriptor: ManifestPack): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db.get("installedPacks", descriptor.packId);
  await db.put("installedPacks", {
    packId: descriptor.packId,
    version: descriptor.version,
    hash: descriptor.hash,
    installedAt: existing?.installedAt ?? now,
    lastUsedAt: now,
    enabled: existing?.enabled ?? true,
  } satisfies InstalledPack);
}

function selectPacks(
  manifest: ContentManifest,
  installedIds: Set<string>,
  options: LoadContentOptions,
): ManifestPack[] {
  const requested = options.packIds ? new Set(options.packIds) : undefined;
  return manifest.packs.filter((pack) => {
    if (requested) return requested.has(pack.packId);
    return pack.required || options.includeOptional === true || installedIds.has(pack.packId);
  });
}

function calculateUpdates(
  previous: ContentManifest | undefined,
  current: ContentManifest,
): ContentUpdateSummary {
  if (!previous) {
    return { newPatternCount: 0, changedPatternCount: 0, updatedPackIds: [], newPackIds: [] };
  }
  const oldPacks = new Map(previous.packs.map((pack) => [pack.packId, pack]));
  const newPackIds: string[] = [];
  const updatedPackIds: string[] = [];
  let newPatternCount = 0;
  let changedPatternCount = 0;
  for (const pack of current.packs) {
    const old = oldPacks.get(pack.packId);
    if (!old) {
      newPackIds.push(pack.packId);
      newPatternCount += pack.patternCount;
    } else if (old.hash !== pack.hash) {
      updatedPackIds.push(pack.packId);
      newPatternCount += Math.max(0, pack.patternCount - old.patternCount);
      changedPatternCount += Math.min(pack.patternCount, old.patternCount);
    }
  }
  return { newPatternCount, changedPatternCount, updatedPackIds, newPackIds };
}

export async function loadContent(options: LoadContentOptions = {}): Promise<LoadedContent> {
  const loadedManifest = await loadManifest(options);
  const installed = await db.getAll("installedPacks");
  const descriptors = selectPacks(
    loadedManifest.manifest,
    new Set(installed.filter((pack) => pack.enabled).map((pack) => pack.packId)),
    options,
  );
  const settled = await Promise.allSettled(
    descriptors.map((descriptor) => loadPack(descriptor, options)),
  );

  const packs: ContentPack[] = [];
  const sources = new Set<"network" | "cache">([loadedManifest.source]);
  const errors = loadedManifest.warning ? [loadedManifest.warning] : [];
  settled.forEach((entry, index) => {
    if (entry.status === "fulfilled") {
      packs.push(entry.value.pack);
      sources.add(entry.value.source);
      if (entry.value.warning) errors.push(entry.value.warning);
    } else {
      const descriptor = descriptors[index];
      const message = `${descriptor.titleKo}: ${errorMessage(entry.reason)}`;
      if (descriptor.required) errors.push(message);
    }
  });

  const missingRequired = descriptors.filter(
    (descriptor) => descriptor.required && !packs.some((pack) => pack.packId === descriptor.packId),
  );
  if (missingRequired.length) {
    throw new ContentLoadError(`필수 콘텐츠 팩을 불러오지 못했습니다: ${missingRequired.map((pack) => pack.titleKo).join(", ")}`);
  }

  const library = validateContentLibrary(packs);
  if (!library.valid) {
    throw new ContentLoadError(
      `로드된 콘텐츠 전체 검증 실패:\n${library.errors.map((entry) => `${entry.path}: ${entry.message}`).join("\n")}`,
    );
  }
  const patterns = packs
    .flatMap((pack) => pack.patterns)
    .filter((pattern) => !pattern.deprecated)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  if (options.migrateProgress !== false) await migrateStoredUserData(packs.flatMap((pack) => pack.patterns));
  const source: ContentSource = sources.size > 1 ? "mixed" : [...sources][0];

  return {
    manifest: loadedManifest.manifest,
    packs,
    patterns,
    source,
    updates: calculateUpdates(loadedManifest.previous, loadedManifest.manifest),
    errors,
  };
}

export async function installOptionalPack(
  packId: string,
  options: LoadContentOptions = {},
): Promise<LoadedPack> {
  const { manifest } = await loadManifest(options);
  const descriptor = manifest.packs.find((pack) => pack.packId === packId);
  if (!descriptor) throw new ContentLoadError(`manifest에 없는 팩입니다: ${packId}`);
  const loaded = await loadPack(descriptor, options);
  const installed = await db.get("installedPacks", packId);
  if (installed) await db.put("installedPacks", { ...installed, enabled: true });
  return loaded;
}

export async function setPackEnabled(packId: string, enabled: boolean): Promise<void> {
  const installed = await db.get("installedPacks", packId);
  if (!installed) throw new ContentLoadError(`설치되지 않은 팩입니다: ${packId}`);
  await db.put("installedPacks", { ...installed, enabled, lastUsedAt: new Date().toISOString() });
}

export async function clearContentCache(): Promise<void> {
  await Promise.all([
    db.clear("cachedContent"),
    db.clear("contentManifest"),
  ]);
}
