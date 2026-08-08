import type {
  ContentManifest,
  ContentPack,
  LearningProgress as ContentLearningProgress,
  ReviewSchedule,
} from "../content/schema";

export type LearningProgress = ContentLearningProgress;

export const DB_NAME = "saygrid";
export const DB_VERSION = 1;

export const STORE_NAMES = [
  "userProgress",
  "reviewSchedule",
  "favorites",
  "personalNotes",
  "appSettings",
  "installedPacks",
  "cachedContent",
  "contentManifest",
  "recentSessions",
  "lastGridPosition",
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

export type HideMode = "all" | "hide-english" | "hide-korean" | "listening";
export type GridDensity = "large" | "default" | "compact" | "overview";

export interface AppSettings {
  id: "main";
  hideMode: HideMode;
  gridDensity: GridDensity;
  locale: "ko-KR";
  ttsVoiceURI?: string;
  ttsLang: "en-US" | "en-GB";
  ttsRate: number;
  ttsPitch: number;
  ttsVolume: number;
  reducedMotion: boolean;
  highContrast: boolean;
  updatedAt: string;
  /** Forward-compatible settings added by the UI do not require a DB migration. */
  [key: string]: unknown;
}

export interface FavoriteRecord {
  patternId: string;
  createdAt: string;
}

export interface PersonalNote {
  patternId: string;
  text: string;
  updatedAt: string;
}

export interface InstalledPack {
  packId: string;
  version: string;
  hash: string;
  installedAt: string;
  lastUsedAt: string;
  enabled: boolean;
}

export interface CachedContent {
  packId: string;
  version: string;
  hash: string;
  pack: ContentPack;
  cachedAt: string;
}

export interface StoredManifest {
  id: "active";
  manifest: ContentManifest;
  cachedAt: string;
}

export interface RecentSession {
  id: string;
  kind: "grid" | "random" | "review" | "listening";
  patternIds: string[];
  completedPatternIds: string[];
  startedAt: string;
  endedAt?: string;
  summary?: Record<string, number>;
}

export interface GridPosition {
  id: "main";
  anchorPatternId?: string;
  scrollOffset: number;
  filterKey: string;
  updatedAt: string;
}

interface StoreRecords {
  userProgress: LearningProgress;
  reviewSchedule: ReviewSchedule;
  favorites: FavoriteRecord;
  personalNotes: PersonalNote;
  appSettings: AppSettings;
  installedPacks: InstalledPack;
  cachedContent: CachedContent;
  contentManifest: StoredManifest;
  recentSessions: RecentSession;
  lastGridPosition: GridPosition;
}

const STORE_KEYS: Record<StoreName, string> = {
  userProgress: "patternId",
  reviewSchedule: "patternId",
  favorites: "patternId",
  personalNotes: "patternId",
  appSettings: "id",
  installedPacks: "packId",
  cachedContent: "packId",
  contentManifest: "id",
  recentSessions: "id",
  lastGridPosition: "id",
};

const memoryFallback = new Map<StoreName, Map<IDBValidKey, unknown>>(
  STORE_NAMES.map((name) => [name, new Map()]),
);
const FALLBACK_PREFIX = "saygrid-db:";
let databasePromise: Promise<IDBDatabase> | undefined;
let forceFallback = false;

function canUseIndexedDb(): boolean {
  return !forceFallback && typeof indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase> {
  if (!canUseIndexedDb()) return Promise.reject(new Error("IndexedDB is unavailable"));
  if (databasePromise) return databasePromise;

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const storeName of STORE_NAMES) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, {
            keyPath: STORE_KEYS[storeName] as string,
          });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open SayGrid database"));
    request.onblocked = () => reject(new Error("SayGrid database upgrade is blocked"));
  });
  const tracked = opening.catch((error): never => {
    forceFallback = true;
    databasePromise = undefined;
    throw error;
  });
  databasePromise = tracked;
  return tracked;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function fallbackStorageKey(storeName: StoreName): string {
  return `${FALLBACK_PREFIX}${storeName}`;
}

function loadFallbackStore(storeName: StoreName): Map<IDBValidKey, unknown> {
  const inMemory = memoryFallback.get(storeName)!;
  if (inMemory.size || typeof localStorage === "undefined") return inMemory;
  try {
    const raw = localStorage.getItem(fallbackStorageKey(storeName));
    if (!raw) return inMemory;
    const values = JSON.parse(raw) as Array<[IDBValidKey, unknown]>;
    for (const [key, value] of values) inMemory.set(key, value);
  } catch {
    // Storage may be unavailable in private mode; the in-memory fallback remains usable.
  }
  return inMemory;
}

function persistFallbackStore(storeName: StoreName): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      fallbackStorageKey(storeName),
      JSON.stringify(Array.from(memoryFallback.get(storeName)!.entries())),
    );
  } catch {
    // Quota/security errors must not stop the learning session.
  }
}

async function withStore<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  try {
    const database = await openDatabase();
    const transaction = database.transaction(storeName, mode);
    const result = await requestResult(operation(transaction.objectStore(storeName)));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    });
    return result;
  } catch (error) {
    forceFallback = true;
    if (mode === "readonly") throw error;
    throw error;
  }
}

async function tryIndexed<T>(operation: () => Promise<T>, fallback: () => T): Promise<T> {
  if (!canUseIndexedDb()) return fallback();
  try {
    return await operation();
  } catch {
    forceFallback = true;
    return fallback();
  }
}

export async function getRecord<K extends StoreName>(
  storeName: K,
  key: IDBValidKey,
): Promise<StoreRecords[K] | undefined> {
  return tryIndexed(
    () => withStore(storeName, "readonly", (store) => store.get(key)) as Promise<StoreRecords[K]>,
    () => loadFallbackStore(storeName).get(key) as StoreRecords[K] | undefined,
  );
}

export async function getAllRecords<K extends StoreName>(storeName: K): Promise<StoreRecords[K][]> {
  return tryIndexed(
    () => withStore(storeName, "readonly", (store) => store.getAll()) as Promise<StoreRecords[K][]>,
    () => Array.from(loadFallbackStore(storeName).values()) as StoreRecords[K][],
  );
}

export async function putRecord<K extends StoreName>(
  storeName: K,
  value: StoreRecords[K],
): Promise<void> {
  await tryIndexed(
    async () => {
      await withStore(storeName, "readwrite", (store) => store.put(value));
    },
    () => {
      const key = (value as unknown as Record<string, IDBValidKey>)[STORE_KEYS[storeName]];
      loadFallbackStore(storeName).set(key, structuredClone(value));
      persistFallbackStore(storeName);
    },
  );
}

export async function deleteRecord(storeName: StoreName, key: IDBValidKey): Promise<void> {
  await tryIndexed(
    async () => {
      await withStore(storeName, "readwrite", (store) => store.delete(key));
    },
    () => {
      loadFallbackStore(storeName).delete(key);
      persistFallbackStore(storeName);
    },
  );
}

export async function clearStore(storeName: StoreName): Promise<void> {
  await tryIndexed(
    async () => {
      await withStore(storeName, "readwrite", (store) => store.clear());
    },
    () => {
      loadFallbackStore(storeName).clear();
      persistFallbackStore(storeName);
    },
  );
}

export const db = {
  get: getRecord,
  getAll: getAllRecords,
  put: putRecord,
  delete: deleteRecord,
  clear: clearStore,
};

export const DEFAULT_SETTINGS: AppSettings = {
  id: "main",
  hideMode: "all",
  gridDensity: "default",
  locale: "ko-KR",
  ttsLang: "en-US",
  ttsRate: 1,
  ttsPitch: 1,
  ttsVolume: 1,
  reducedMotion: false,
  highContrast: false,
  updatedAt: new Date(0).toISOString(),
};

export async function getProgressMap(): Promise<Map<string, LearningProgress>> {
  const records = await getAllProgress();
  return new Map(records.map((record) => [record.patternId, record]));
}

export function getAllProgress(): Promise<LearningProgress[]> {
  return getAllRecords("userProgress");
}

export function saveProgress(progress: LearningProgress): Promise<void> {
  return putRecord("userProgress", { ...progress, updatedAt: new Date().toISOString() });
}

export async function getSettings(): Promise<AppSettings> {
  const stored = await getRecord("appSettings", "main");
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function saveSettings(settings: Partial<Omit<AppSettings, "id">>): Promise<void> {
  return getSettings().then((current) =>
    putRecord("appSettings", {
      ...current,
      ...settings,
      id: "main",
      updatedAt: new Date().toISOString(),
    }),
  );
}

export interface SayGridBackup {
  format: "saygrid-backup";
  version: 1;
  exportedAt: string;
  data: {
    userProgress: LearningProgress[];
    reviewSchedule: ReviewSchedule[];
    favorites: FavoriteRecord[];
    personalNotes: PersonalNote[];
    appSettings: AppSettings[];
    installedPacks: InstalledPack[];
    recentSessions: RecentSession[];
    lastGridPosition: GridPosition[];
  };
}

const BACKUP_STORES = [
  "userProgress",
  "reviewSchedule",
  "favorites",
  "personalNotes",
  "appSettings",
  "installedPacks",
  "recentSessions",
  "lastGridPosition",
] as const;

export async function exportBackup(): Promise<SayGridBackup> {
  const [
    userProgress,
    reviewSchedule,
    favorites,
    personalNotes,
    appSettings,
    installedPacks,
    recentSessions,
    lastGridPosition,
  ] = await Promise.all(BACKUP_STORES.map((store) => getAllRecords(store)));

  return {
    format: "saygrid-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      userProgress: userProgress as LearningProgress[],
      reviewSchedule: reviewSchedule as ReviewSchedule[],
      favorites: favorites as FavoriteRecord[],
      personalNotes: personalNotes as PersonalNote[],
      appSettings: appSettings as AppSettings[],
      installedPacks: installedPacks as InstalledPack[],
      recentSessions: recentSessions as RecentSession[],
      lastGridPosition: lastGridPosition as GridPosition[],
    },
  };
}

function assertBackup(value: unknown): asserts value is SayGridBackup {
  if (!value || typeof value !== "object") throw new Error("백업 파일이 JSON 객체가 아닙니다.");
  const candidate = value as Partial<SayGridBackup>;
  if (candidate.format !== "saygrid-backup" || candidate.version !== 1 || !candidate.data) {
    throw new Error("지원하지 않는 SayGrid 백업 형식입니다.");
  }
  for (const store of BACKUP_STORES) {
    if (!Array.isArray(candidate.data[store])) {
      throw new Error(`백업의 ${store} 데이터가 올바르지 않습니다.`);
    }
  }
}

export async function importBackup(
  backup: unknown,
  options: { mode?: "merge" | "replace" } = {},
): Promise<void> {
  assertBackup(backup);
  if (options.mode === "replace") {
    await Promise.all(BACKUP_STORES.map((store) => clearStore(store)));
  }
  for (const store of BACKUP_STORES) {
    for (const value of backup.data[store]) {
      await putRecord(store, value as never);
    }
  }
}

export function resetSettings(): Promise<void> {
  return clearStore("appSettings");
}

export async function resetLearningData(): Promise<void> {
  await Promise.all([
    clearStore("userProgress"),
    clearStore("reviewSchedule"),
    clearStore("favorites"),
    clearStore("personalNotes"),
    clearStore("recentSessions"),
    clearStore("lastGridPosition"),
  ]);
}

export async function resetPackProgress(patternIds: Iterable<string>): Promise<void> {
  for (const patternId of patternIds) {
    await Promise.all([
      deleteRecord("userProgress", patternId),
      deleteRecord("reviewSchedule", patternId),
      deleteRecord("favorites", patternId),
      deleteRecord("personalNotes", patternId),
    ]);
  }
}

export async function deleteAllData(): Promise<void> {
  if (databasePromise) {
    try {
      const database = await databasePromise;
      database.close();
    } catch {
      // Ignore an already failed connection.
    }
  }
  databasePromise = undefined;
  if (typeof indexedDB !== "undefined") {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  }
  for (const store of STORE_NAMES) {
    memoryFallback.get(store)!.clear();
    try {
      localStorage.removeItem(fallbackStorageKey(store));
    } catch {
      // localStorage may not exist in the current runtime.
    }
  }
  forceFallback = false;
}
