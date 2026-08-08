import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { registerSW } from "virtual:pwa-register";
import { AppToolbar } from "./components/AppToolbar";
import { EmptyState, ErrorState, LoadingGrid, ToastRegion } from "./components/FeedbackStates";
import { FilterSheet } from "./components/FilterSheet";
import { GridNavigator } from "./components/GridNavigator";
import { HomePage } from "./components/HomePage";
import { ListeningController } from "./components/ListeningController";
import { PatternDetailDrawer } from "./components/PatternDetailDrawer";
import {
  RandomSessionHeader,
  RandomSizePicker,
} from "./components/RandomSession";
import { SettingsPanel } from "./components/SettingsPanel";
import { VirtualPatternGrid } from "./components/VirtualPatternGrid";
import {
  EMPTY_FILTERS,
  type AppView,
  type DisplayMode,
  type FilterOption,
  type FilterState,
  type GridDensity,
  type ListeningSettings,
  type PatternProgressView,
  type ToastItem,
} from "./components/types";
import { loadContent, type LoadedContent } from "./content/loader";
import type { ConversationPattern, LearningProgress } from "./content/schema";
import { useContinuousListen } from "./hooks/useContinuousListen";
import { useSpeech } from "./hooks/useSpeech";
import {
  DEFAULT_SETTINGS,
  db,
  deleteAllData,
  exportBackup,
  getFavoriteIds,
  getProgressMap,
  getSettings,
  importBackup,
  resetLearningData,
  resetSettings,
  saveSettings,
  setFavorite as persistFavorite,
  type AppSettings,
  type GridPosition,
  type PersonalNote,
} from "./lib/db";
import { sampleUniqueBy } from "./lib/random";
import { createRelatedPatternResolver } from "./lib/related";
import { searchPatterns, type MasteryFilter } from "./lib/search";

interface RandomSessionState {
  patterns: ConversationPattern[];
}

interface SayGridHistoryState {
  saygridView?: AppView;
  saygridPatternId?: string;
  randomPatternIds?: string[];
}

const NEW_WINDOW_MS = 14 * 86_400_000;
const EMPTY_PATTERNS: ConversationPattern[] = [];
const DEFAULT_LISTENING_SETTINGS: ListeningSettings = {
  voiceId: "",
  rate: 1,
  pitch: 1,
  volume: 1,
  autoScroll: true,
  highContrast: false,
  reduceMotion: false,
};

function viewFromLocation(): AppView {
  const hash = window.location.hash;
  if (hash.startsWith("#pattern=")) return "grid";
  if (hash === "#grid" || hash === "#random") {
    return hash.slice(1) as AppView;
  }
  return "home";
}

function isAppView(value: unknown): value is AppView {
  return value === "home" || value === "grid" || value === "random";
}

function patternIdFromLocation(): string | undefined {
  const match = window.location.hash.match(/^#pattern=(.+)$/);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function viewHash(view: AppView) {
  return `#${view}`;
}

function makeToastId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mapDensity(value: AppSettings["gridDensity"]): GridDensity {
  return value === "default" ? "comfortable" : value;
}

function unmapDensity(value: GridDensity): AppSettings["gridDensity"] {
  return value === "comfortable" ? "default" : value;
}

function masteryFilter(value: string): MasteryFilter | undefined {
  const mapping: Record<string, MasteryFilter> = {
    unseen: "unlearned",
    mastered: "mastered",
  };
  return mapping[value];
}

function countActiveFilters(filters: FilterState) {
  return (
    filters.categoryIds.length +
    filters.situationIds.length +
    filters.cefr.length +
    filters.register.length +
    filters.mastery.length +
    Number(filters.favoritesOnly) +
    Number(filters.newOnly) +
    Number(Boolean(filters.query.trim()))
  );
}

function downloadJson(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function App() {
  const [content, setContent] = useState<LoadedContent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<DisplayMode>("all");
  const [density, setDensity] = useState<GridDensity>("comfortable");
  const [view, setView] = useState<AppView>(viewFromLocation);
  const [filters, setFilters] = useState<FilterState>(() => ({ ...EMPTY_FILTERS }));
  const [filterOpen, setFilterOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [revealedIds, setRevealedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [progressById, setProgressById] = useState<Map<string, LearningProgress>>(() => new Map());
  const [favoriteIds, setFavoriteIds] = useState<ReadonlySet<string>>(() => new Set());
  const [notesById, setNotesById] = useState<Map<string, string>>(() => new Map());
  const [activePatternId, setActivePatternId] = useState<string | null>(null);
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const [speakingPatternId, setSpeakingPatternId] = useState<string | null>(null);
  const [randomSession, setRandomSession] = useState<RandomSessionState | null>(null);
  const [initialScrollIndex, setInitialScrollIndex] = useState(0);
  const [initialScrollPatternId, setInitialScrollPatternId] = useState<string | undefined>();
  const [scrollRestoreVersion, setScrollRestoreVersion] = useState(0);
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);
  const [resumeIndex, setResumeIndex] = useState(0);
  const [resumePatternId, setResumePatternId] = useState<string | undefined>();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [listeningSettings, setListeningSettings] = useState<ListeningSettings>(
    DEFAULT_LISTENING_SETTINGS,
  );
  const [repeatListening, setRepeatListening] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const toastTimers = useRef(new Map<string, number>());
  const scrollSaveTimer = useRef<number | undefined>(undefined);
  const speakingToken = useRef(0);
  const pwaRegistered = useRef(false);
  const favoriteMutationVersion = useRef(new Map<string, number>());

  const {
    voices,
    status: speechStatus,
    currentText: speechCurrentText,
    speak,
    setSettings: setSpeechSettings,
  } = useSpeech();
  const deferredQuery = useDeferredValue(filters.query);
  const patterns = content?.patterns ?? EMPTY_PATTERNS;
  const patternById = useMemo(
    () => new Map(patterns.map((pattern) => [pattern.id, pattern])),
    [patterns],
  );
  const relatedPatternResolver = useMemo(
    () => createRelatedPatternResolver(patterns, content?.packs ?? []),
    [content?.packs, patterns],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timer = toastTimers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    toastTimers.current.delete(id);
  }, []);

  const pushToast = useCallback(
    (
      message: string,
      tone: ToastItem["tone"] = "neutral",
      action?: Pick<ToastItem, "actionLabel" | "onAction">,
      persistent = false,
    ) => {
      const id = makeToastId();
      setToasts((current) => [...current.slice(-2), { id, message, tone, ...action }]);
      if (!persistent) {
        const timer = window.setTimeout(() => dismissToast(id), 4_800);
        toastTimers.current.set(id, timer);
      }
    },
    [dismissToast],
  );

  const hydrate = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [loadedContent, progress, favorites, settings, notes, position] = await Promise.all([
        loadContent({ includeOptional: true }),
        getProgressMap(),
        getFavoriteIds(),
        getSettings(),
        db.getAll("personalNotes"),
        db.get("lastGridPosition", "main"),
      ]);
      setContent(loadedContent);
      setProgressById(progress);
      setFavoriteIds(favorites);
      setNotesById(new Map(notes.map((record) => [record.patternId, record.text])));
      setMode(settings.hideMode);
      setDensity(mapDensity(settings.gridDensity));
      setListeningSettings({
        voiceId: settings.ttsVoiceURI ?? "",
        rate: settings.ttsRate,
        pitch: settings.ttsPitch,
        volume: settings.ttsVolume,
        autoScroll: typeof settings.autoScroll === "boolean" ? settings.autoScroll : true,
        highContrast: settings.highContrast,
        reduceMotion: settings.reducedMotion,
      });
      let restoredIndex = 0;
      let restoredPatternId: string | undefined;
      if (position?.anchorPatternId) {
        const anchorIndex = loadedContent.patterns.findIndex(
          (pattern) => pattern.id === position.anchorPatternId,
        );
        if (anchorIndex >= 0) {
          restoredIndex = anchorIndex;
          restoredPatternId = position.anchorPatternId;
        }
      }
      setInitialScrollIndex(restoredIndex);
      const locationView = viewFromLocation();
      setInitialScrollPatternId(
        locationView === "grid" || locationView === "home" ? restoredPatternId : undefined,
      );
      setResumeIndex(restoredIndex);
      setResumePatternId(restoredPatternId);
      setVisibleStartIndex(restoredIndex);
      setScrollRestoreVersion((current) => current + 1);
      const linkedPatternId = patternIdFromLocation();
      if (linkedPatternId && loadedContent.patterns.some((pattern) => pattern.id === linkedPatternId)) {
        setSelectedPatternId(linkedPatternId);
        setView("grid");
      }
      loadedContent.errors.forEach((message) => pushToast(message, "warning"));
      if (loadedContent.updates.newPatternCount > 0) {
        pushToast(
          `새로운 회화 패턴 ${loadedContent.updates.newPatternCount.toLocaleString("ko-KR")}개가 추가되었습니다.`,
          "success",
        );
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "콘텐츠를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(
    () => () => {
      for (const timer of toastTimers.current.values()) window.clearTimeout(timer);
      if (scrollSaveTimer.current !== undefined) window.clearTimeout(scrollSaveTimer.current);
    },
    [],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setSpeechSettings({
      voiceURI: listeningSettings.voiceId,
      rate: listeningSettings.rate,
      pitch: listeningSettings.pitch,
      volume: listeningSettings.volume,
    });
  }, [listeningSettings.pitch, listeningSettings.rate, listeningSettings.voiceId, listeningSettings.volume, setSpeechSettings]);

  useEffect(() => {
    document.documentElement.classList.toggle("sg-high-contrast", listeningSettings.highContrast);
    document.documentElement.classList.toggle("sg-reduce-motion", listeningSettings.reduceMotion);
    return () => {
      document.documentElement.classList.remove("sg-high-contrast", "sg-reduce-motion");
    };
  }, [listeningSettings.highContrast, listeningSettings.reduceMotion]);

  useEffect(() => {
    if (pwaRegistered.current) return;
    pwaRegistered.current = true;
    const updateServiceWorker = registerSW({
      immediate: true,
      onOfflineReady: () => pushToast("오프라인에서도 SayGrid를 사용할 수 있습니다.", "success"),
      onNeedRefresh: () => {
        pushToast(
          "새 앱 버전이 준비되었습니다.",
          "neutral",
          { actionLabel: "업데이트", onAction: () => void updateServiceWorker(true) },
          true,
        );
      },
    });
  }, [pushToast]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches("input, textarea, select, [contenteditable='true']");
      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        setFilterOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as SayGridHistoryState | null;
      const nextView = isAppView(state?.saygridView) ? state.saygridView : viewFromLocation();
      const patternId = state?.saygridPatternId ?? patternIdFromLocation();
      setView(nextView);
      setSelectedPatternId(patternId ?? null);
      setActivePatternId(null);
      setRevealedIds(new Set());
      if (nextView === "grid") {
        setInitialScrollPatternId(resumePatternId);
        setInitialScrollIndex(resumeIndex);
        setVisibleStartIndex(resumeIndex);
        setScrollRestoreVersion((current) => current + 1);
      }
      if (nextView === "random" && state?.randomPatternIds?.length) {
        const restored = state.randomPatternIds
          .map((id) => patternById.get(id))
          .filter((pattern): pattern is ConversationPattern => Boolean(pattern));
        setRandomSession(restored.length ? { patterns: restored } : null);
      } else if (nextView !== "random") {
        setRandomSession(null);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [patternById, resumeIndex, resumePatternId]);

  const filteredPatterns = useMemo(() => {
    const mastery = filters.mastery.map(masteryFilter).filter(Boolean) as MasteryFilter[];
    return searchPatterns(patterns, {
      query: deferredQuery,
      filters: {
        categoryIds: filters.categoryIds,
        situationIds: filters.situationIds,
        cefr: filters.cefr as ConversationPattern["cefr"][],
        register: filters.register as ConversationPattern["register"],
        mastery,
        favoritesOnly: filters.favoritesOnly,
        newOnly: filters.newOnly,
      },
      progressById,
      notesById,
      favoriteIds,
      newSince: clock - NEW_WINDOW_MS,
    });
  }, [clock, deferredQuery, favoriteIds, filters, notesById, patterns, progressById]);

  const displayedPatterns = view === "random" && randomSession ? randomSession.patterns : filteredPatterns;

  const categoryOptions = useMemo<FilterOption[]>(() => {
    if (content?.manifest.categories.length) {
      return content.manifest.categories.map((item) => ({
        id: item.id,
        label: item.labelKo,
        count: item.count,
      }));
    }
    const counts = new Map<string, number>();
    patterns.forEach((pattern) => pattern.categoryIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1)));
    return [...counts].map(([id, count]) => ({ id, label: id, count }));
  }, [content?.manifest.categories, patterns]);
  const situationOptions = useMemo<FilterOption[]>(() => {
    if (content?.manifest.situations.length) {
      return content.manifest.situations.map((item) => ({
        id: item.id,
        label: item.labelKo,
        count: item.count,
      }));
    }
    const counts = new Map<string, number>();
    patterns.forEach((pattern) => pattern.situationIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1)));
    return [...counts].map(([id, count]) => ({ id, label: id, count }));
  }, [content?.manifest.situations, patterns]);

  const listenItems = useMemo(
    () =>
      displayedPatterns.map((pattern) => ({
        id: pattern.id,
        english: pattern.english,
        korean: pattern.korean,
        ttsText: pattern.audio?.ttsText,
        ttsLang: pattern.audio?.lang,
        audioUrl: pattern.audio?.audioUrl,
        slowAudioUrl: pattern.audio?.slowAudioUrl,
      })),
    [displayedPatterns],
  );
  const continuous = useContinuousListen(listenItems, { mode: "english", gapMs: 1_000 });
  const {
    state: continuousState,
    play: playContinuous,
    pause: pauseContinuous,
    resume: resumeContinuous,
    stop: stopContinuous,
    next: nextContinuous,
    previous: previousContinuous,
    setOptions: setContinuousOptions,
  } = continuous;
  const continuousActive = continuousState.status === "playing" || continuousState.status === "paused";

  useEffect(() => {
    setContinuousOptions({ rate: listeningSettings.rate, repeat: repeatListening });
  }, [listeningSettings.rate, repeatListening, setContinuousOptions]);

  const progressViewById = useMemo(() => {
    const next = new Map<string, PatternProgressView>();
    for (const pattern of patterns) {
      const progress = progressById.get(pattern.id);
      next.set(pattern.id, {
        mastery: progress?.mastery ?? 0,
        isNew: Boolean(
          pattern.releasedAt && new Date(pattern.releasedAt).getTime() >= clock - NEW_WINDOW_MS,
        ),
      });
    }
    return next;
  }, [clock, patterns, progressById]);

  const getProgressView = useCallback(
    (pattern: ConversationPattern): PatternProgressView | undefined =>
      progressViewById.get(pattern.id),
    [progressViewById],
  );

  const handleModeChange = useCallback((nextMode: DisplayMode) => {
    setMode(nextMode);
    setRevealedIds(new Set());
    void saveSettings({ hideMode: nextMode });
  }, []);

  const handleDensityChange = useCallback((nextDensity: GridDensity) => {
    setDensity(nextDensity);
    void saveSettings({ gridDensity: unmapDensity(nextDensity) });
  }, []);

  const handleRevealChange = useCallback((patternId: string, revealed: boolean) => {
    setRevealedIds((current) => {
      const next = new Set(current);
      if (revealed) next.add(patternId);
      else next.delete(patternId);
      return next;
    });
  }, []);

  const handleSpeak = useCallback(
    async (
      pattern: ConversationPattern,
      textOverride?: string,
      visualPatternId = pattern.id,
      options?: { slow?: boolean },
    ) => {
      stopContinuous();
      const token = speakingToken.current + 1;
      speakingToken.current = token;
      setSpeakingPatternId(visualPatternId);
      const result = await speak({
        text: textOverride || pattern.audio?.ttsText || pattern.english,
        lang: pattern.audio?.lang || "en-US",
        audioUrl: textOverride ? undefined : pattern.audio?.audioUrl,
        slowAudioUrl: textOverride ? undefined : pattern.audio?.slowAudioUrl,
        preferSlowAudio: options?.slow,
        settings: options?.slow ? { rate: 0.72 } : undefined,
      });
      if (token === speakingToken.current && result === "unsupported") {
        pushToast("이 브라우저에서는 음성 재생을 사용할 수 없습니다.", "warning");
      } else if (token === speakingToken.current && result === "error") {
        pushToast("음성을 재생하지 못했습니다. 다른 목소리를 선택해 보세요.", "error");
      }
      if (token === speakingToken.current) setSpeakingPatternId(null);
    },
    [pushToast, speak, stopContinuous],
  );

  const handleActivatePattern = useCallback((pattern: ConversationPattern) => {
    setActivePatternId(pattern.id);
  }, []);

  const handleOpenDetails = useCallback((pattern: ConversationPattern) => {
    setSelectedPatternId(pattern.id);
    window.history.pushState(
      {
        saygridView: view,
        saygridPatternId: pattern.id,
        randomPatternIds: randomSession?.patterns.map((item) => item.id),
      } satisfies SayGridHistoryState,
      "",
      `#pattern=${encodeURIComponent(pattern.id)}`,
    );
  }, [randomSession?.patterns, view]);

  const handleCloseDetails = useCallback(() => {
    if ((window.history.state as SayGridHistoryState | null)?.saygridPatternId) {
      window.history.back();
    } else {
      setSelectedPatternId(null);
    }
  }, []);

  const handleSelectRelated = useCallback((patternId: string) => {
    setSelectedPatternId(patternId);
    window.history.replaceState(
      {
        saygridView: view,
        saygridPatternId: patternId,
        randomPatternIds: randomSession?.patterns.map((item) => item.id),
      } satisfies SayGridHistoryState,
      "",
      `#pattern=${encodeURIComponent(patternId)}`,
    );
  }, [randomSession?.patterns, view]);

  const handleSaveNote = useCallback(
    (patternId: string, text: string) => {
      const trimmed = text.trim();
      setNotesById((current) => {
        const next = new Map(current);
        if (trimmed) next.set(patternId, trimmed);
        else next.delete(patternId);
        return next;
      });
      if (trimmed) {
        void db.put("personalNotes", {
          patternId,
          text: trimmed,
          updatedAt: new Date().toISOString(),
        } satisfies PersonalNote);
      } else {
        void db.delete("personalNotes", patternId);
      }
      pushToast("메모를 저장했습니다.", "success");
    },
    [pushToast],
  );

  const handleFavoriteChange = useCallback(
    (patternId: string, favorite: boolean) => {
      const mutationVersion = (favoriteMutationVersion.current.get(patternId) ?? 0) + 1;
      favoriteMutationVersion.current.set(patternId, mutationVersion);
      setFavoriteIds((current) => {
        const next = new Set(current);
        if (favorite) next.add(patternId);
        else next.delete(patternId);
        return next;
      });
      void persistFavorite(patternId, favorite).catch(() => {
        if (favoriteMutationVersion.current.get(patternId) !== mutationVersion) return;
        setFavoriteIds((current) => {
          if (current.has(patternId) !== favorite) return current;
          const next = new Set(current);
          if (favorite) next.delete(patternId);
          else next.add(patternId);
          return next;
        });
        pushToast("즐겨찾기를 저장하지 못했습니다.", "error");
      });
    },
    [pushToast],
  );

  const handleToggleFavoritesOnly = useCallback(() => {
    setFilters((current) => ({
      ...current,
      favoritesOnly: !current.favoritesOnly,
    }));
    setInitialScrollPatternId(undefined);
    setInitialScrollIndex(0);
    setVisibleStartIndex(0);
    setScrollRestoreVersion((current) => current + 1);
    setActivePatternId(null);
    setRevealedIds(new Set());
    if (view === "random") {
      setRandomSession(null);
      setView("grid");
      stopContinuous();
      window.history.pushState(
        { saygridView: "grid" } satisfies SayGridHistoryState,
        "",
        viewHash("grid"),
      );
    }
  }, [stopContinuous, view]);

  const startRandom = useCallback(
    (count: number, source: readonly ConversationPattern[] = filteredPatterns) => {
      const selected = sampleUniqueBy(source, count, (pattern) => pattern.id);
      if (!selected.length) {
        pushToast("현재 범위에는 연습할 표현이 없습니다.", "warning");
        return;
      }
      setRandomSession({ patterns: selected });
      setView("random");
      setInitialScrollPatternId(undefined);
      setInitialScrollIndex(0);
      setVisibleStartIndex(0);
      setScrollRestoreVersion((current) => current + 1);
      setActivePatternId(null);
      setRevealedIds(new Set());
      stopContinuous();
      window.history.pushState(
        { saygridView: "random", randomPatternIds: selected.map((pattern) => pattern.id) } satisfies SayGridHistoryState,
        "",
        viewHash("random"),
      );
    },
    [filteredPatterns, pushToast, stopContinuous],
  );

  const exitRandom = useCallback(() => {
    setRandomSession(null);
    setView("grid");
    setInitialScrollPatternId(resumePatternId);
    setInitialScrollIndex(resumeIndex);
    setVisibleStartIndex(resumeIndex);
    setScrollRestoreVersion((current) => current + 1);
    setActivePatternId(null);
    setRevealedIds(new Set());
    stopContinuous();
    window.history.pushState({ saygridView: "grid" } satisfies SayGridHistoryState, "", viewHash("grid"));
  }, [resumeIndex, resumePatternId, stopContinuous]);

  const handleViewChange = useCallback(
    (nextView: AppView) => {
      if (nextView !== "random") setRandomSession(null);
      setView(nextView);
      if (nextView === "home") {
        setInitialScrollPatternId(resumePatternId);
        setInitialScrollIndex(resumeIndex);
        setVisibleStartIndex(resumeIndex);
      } else if (nextView !== "grid") {
        setInitialScrollPatternId(undefined);
        setInitialScrollIndex(0);
        setVisibleStartIndex(0);
        setScrollRestoreVersion((current) => current + 1);
      }
      setActivePatternId(null);
      setRevealedIds(new Set());
      stopContinuous();
      window.history.pushState(
        { saygridView: nextView } satisfies SayGridHistoryState,
        "",
        viewHash(nextView),
      );
    },
    [resumeIndex, resumePatternId, stopContinuous],
  );

  const openGrid = useCallback(
    (index: number, patternId?: string) => {
      const safeIndex = Math.max(0, Math.min(patterns.length - 1, index));
      setRandomSession(null);
      setView("grid");
      setInitialScrollPatternId(patternId);
      setInitialScrollIndex(safeIndex);
      setVisibleStartIndex(safeIndex);
      setScrollRestoreVersion((current) => current + 1);
      setActivePatternId(null);
      setRevealedIds(new Set());
      stopContinuous();
      window.history.pushState({ saygridView: "grid" } satisfies SayGridHistoryState, "", viewHash("grid"));
    },
    [patterns.length, stopContinuous],
  );

  const handleGridNavigate = useCallback((index: number) => {
    const safeIndex = Math.max(0, Math.min(displayedPatterns.length - 1, index));
    setInitialScrollPatternId(undefined);
    setInitialScrollIndex(safeIndex);
    setVisibleStartIndex(safeIndex);
    setScrollRestoreVersion((current) => current + 1);
  }, [displayedPatterns.length]);

  const handleVisibleRangeChange = useCallback(
    (startIndex: number) => {
      setVisibleStartIndex(startIndex);
      const anchor = displayedPatterns[startIndex];
      if (!anchor) return;
      if (view !== "grid") return;
      const canonicalIndex = patterns.findIndex((pattern) => pattern.id === anchor.id);
      if (canonicalIndex >= 0) setResumeIndex(canonicalIndex);
      setResumePatternId(anchor.id);
      if (scrollSaveTimer.current !== undefined) window.clearTimeout(scrollSaveTimer.current);
      scrollSaveTimer.current = window.setTimeout(() => {
        const position: GridPosition = {
          id: "main",
          anchorPatternId: anchor.id,
          scrollOffset: startIndex,
          filterKey: JSON.stringify({ view, filters }),
          updatedAt: new Date().toISOString(),
        };
        void db.put("lastGridPosition", position);
      }, 300);
    },
    [displayedPatterns, filters, patterns, view],
  );

  const handleListeningToggle = useCallback(() => {
    if (!listenItems.length) {
      pushToast("현재 범위에는 들을 표현이 없습니다.", "warning");
      return;
    }
    if (continuousState.status === "playing") pauseContinuous();
    else if (continuousState.status === "paused") resumeContinuous();
    else playContinuous(0);
  }, [continuousState.status, listenItems.length, pauseContinuous, playContinuous, pushToast, resumeContinuous]);

  const handleSettingsChange = useCallback((next: ListeningSettings) => {
    setListeningSettings(next);
    void saveSettings({
      ttsVoiceURI: next.voiceId,
      ttsRate: next.rate,
      ttsPitch: next.pitch,
      ttsVolume: next.volume,
      autoScroll: next.autoScroll,
      highContrast: next.highContrast,
      reducedMotion: next.reduceMotion,
    });
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const backup = await exportBackup();
      downloadJson(backup, `saygrid-backup-${new Date().toISOString().slice(0, 10)}.json`);
      pushToast("학습 기록을 백업했습니다.", "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "백업을 만들지 못했습니다.", "error");
    }
  }, [pushToast]);

  const handleImport = useCallback(
    async (file: File) => {
      try {
        const backup = JSON.parse(await file.text()) as unknown;
        await importBackup(backup, { mode: "merge" });
        await hydrate();
        pushToast("백업을 복원했습니다.", "success");
      } catch (error) {
        pushToast(error instanceof Error ? error.message : "백업 파일을 읽지 못했습니다.", "error");
      }
    },
    [hydrate, pushToast],
  );

  const handleResetSettings = useCallback(async () => {
    if (!window.confirm("화면과 음성 설정을 기본값으로 되돌릴까요?")) return;
    await resetSettings();
    setMode(DEFAULT_SETTINGS.hideMode);
    setDensity(mapDensity(DEFAULT_SETTINGS.gridDensity));
    setListeningSettings(DEFAULT_LISTENING_SETTINGS);
    pushToast("설정을 기본값으로 되돌렸습니다.", "success");
  }, [pushToast]);

  const handleResetLearning = useCallback(async () => {
    if (!window.confirm("학습 진도와 메모를 모두 지울까요? 이 작업은 되돌릴 수 없습니다.")) return;
    await resetLearningData();
    setProgressById(new Map());
    setNotesById(new Map());
    pushToast("학습 기록을 초기화했습니다.", "success");
  }, [pushToast]);

  const handleDeleteAll = useCallback(async () => {
    if (!window.confirm("SayGrid의 콘텐츠 캐시와 모든 개인 데이터를 이 기기에서 삭제할까요?")) return;
    await deleteAllData();
    setSettingsOpen(false);
    await hydrate();
    pushToast("이 기기의 SayGrid 데이터를 모두 삭제했습니다.", "success");
  }, [hydrate, pushToast]);

  const allRevealed = useMemo(
    () =>
      displayedPatterns.length > 0 &&
      revealedIds.size >= displayedPatterns.length &&
      displayedPatterns.every((pattern) => revealedIds.has(pattern.id)),
    [displayedPatterns, revealedIds],
  );
  const selectedPattern = selectedPatternId ? patternById.get(selectedPatternId) ?? null : null;
  const favoriteCount = useMemo(
    () => patterns.reduce((count, pattern) => count + Number(favoriteIds.has(pattern.id)), 0),
    [favoriteIds, patterns],
  );
  const learnedCount = useMemo(
    () => patterns.reduce(
      (count, pattern) => count + Number((progressById.get(pattern.id)?.mastery ?? 0) > 0),
      0,
    ),
    [patterns, progressById],
  );
  const currentListeningPattern = continuousState.currentId
    ? patternById.get(continuousState.currentId)
    : undefined;
  const speakingId = continuousActive
    ? continuousState.currentId ?? undefined
    : speakingPatternId ?? undefined;

  return (
    <div className="sg-app" data-view={view}>
      {view === "home" ? (
        <div className="sg-home-shell">
          {loading ? <LoadingGrid /> : null}
          {!loading && loadError ? <ErrorState description={loadError} onRetry={() => void hydrate()} /> : null}
          {!loading && !loadError ? (
            <HomePage
              totalCount={patterns.length}
              learnedCount={learnedCount}
              continueIndex={resumeIndex}
              heroSrc={`${import.meta.env.BASE_URL}assets/saygrid-learning-cards.webp`}
              onContinue={() => openGrid(resumeIndex, resumePatternId)}
              onOpenGrid={() => openGrid(0)}
              onRandom={() => startRandom(50)}
              onSettings={() => setSettingsOpen(true)}
            />
          ) : null}
        </div>
      ) : (
        <>
          <AppToolbar
            mode={mode}
            onModeChange={handleModeChange}
            density={density}
            onDensityChange={handleDensityChange}
            totalCount={displayedPatterns.length}
            favoriteCount={favoriteCount}
            favoritesOnly={filters.favoritesOnly}
            activeFilterCount={countActiveFilters(filters)}
            onSearch={() => setFilterOpen(true)}
            onFilters={() => setFilterOpen(true)}
            onRandom={(count) => startRandom(count)}
            onToggleFavoritesOnly={handleToggleFavoritesOnly}
            onSettings={() => setSettingsOpen(true)}
            onHome={() => handleViewChange("home")}
            allRevealed={allRevealed}
            onToggleRevealAll={() => {
              if (allRevealed) setRevealedIds(new Set());
              else setRevealedIds(new Set(displayedPatterns.map((pattern) => pattern.id)));
            }}
          />

          <main id="main-grid" className="sg-main">
            {view === "grid" ? (
              <GridNavigator
                totalCount={displayedPatterns.length}
                activeIndex={visibleStartIndex}
                onNavigate={handleGridNavigate}
              />
            ) : null}

            {view === "random" && randomSession ? (
              <RandomSessionHeader
                total={randomSession.patterns.length}
                onExit={exitRandom}
              />
            ) : null}

            {loading ? <LoadingGrid /> : null}
            {!loading && loadError ? <ErrorState description={loadError} onRetry={() => void hydrate()} /> : null}
            {!loading && !loadError && view === "random" && !randomSession ? (
              <RandomSizePicker availableCount={filteredPatterns.length} onStart={(count) => startRandom(count, filteredPatterns)} />
            ) : null}
            {!loading && !loadError && !(view === "random" && !randomSession) ? (
              <VirtualPatternGrid
                key={`${view}-${displayedPatterns.length}-${scrollRestoreVersion}`}
                patterns={displayedPatterns}
                mode={mode}
                density={density}
                getProgress={getProgressView}
                favoriteIds={favoriteIds}
                revealedIds={revealedIds}
                selectedPatternId={activePatternId ?? undefined}
                speakingId={speakingId}
                autoScrollSpeaking={continuousActive && listeningSettings.autoScroll}
                onRevealChange={handleRevealChange}
                onActivatePattern={handleActivatePattern}
                onSpeak={handleSpeak}
                onOpenDetails={handleOpenDetails}
                onFavoriteChange={handleFavoriteChange}
                initialScrollIndex={initialScrollIndex}
                initialScrollPatternId={initialScrollPatternId}
                onVisibleRangeChange={handleVisibleRangeChange}
                emptyState={
                  <EmptyState
                    title={filters.favoritesOnly ? "즐겨찾기한 표현이 없어요" : undefined}
                    description={filters.favoritesOnly ? "카드 우측 상단의 별을 눌러 표현을 모아보세요." : undefined}
                    actionLabel="전체 그리드 보기"
                    onAction={() => {
                      setFilters({ ...EMPTY_FILTERS });
                      openGrid(0);
                    }}
                  />
                }
              />
            ) : null}
          </main>
        </>
      )}

      {continuousState.status !== "idle" && continuousState.status !== "stopped" ? (
        <ListeningController
          playing={continuousActive}
          paused={continuousState.status === "paused"}
          title={currentListeningPattern?.english}
          currentIndex={continuousState.index}
          total={continuousState.total}
          speed={listeningSettings.rate}
          repeat={repeatListening}
          onPlayPause={handleListeningToggle}
          onPrevious={previousContinuous}
          onNext={nextContinuous}
          onStop={stopContinuous}
          onSpeedChange={(rate) => handleSettingsChange({ ...listeningSettings, rate })}
          onRepeatChange={setRepeatListening}
        />
      ) : null}

      <FilterSheet
        open={filterOpen}
        value={filters}
        categories={categoryOptions}
        situations={situationOptions}
        onChange={(next) => startTransition(() => setFilters(next))}
        onApply={(next) => {
          setInitialScrollPatternId(undefined);
          setInitialScrollIndex(0);
          setVisibleStartIndex(0);
          setScrollRestoreVersion((current) => current + 1);
          setActivePatternId(null);
          startTransition(() => setFilters(next));
        }}
        onClose={() => setFilterOpen(false)}
        totalCount={filteredPatterns.length}
      />
      <PatternDetailDrawer
        open={Boolean(selectedPattern)}
        pattern={selectedPattern}
        progress={selectedPattern ? getProgressView(selectedPattern) : undefined}
        relatedPatterns={selectedPattern
          ? relatedPatternResolver.get(selectedPattern).map((item) => item.pattern)
          : []}
        note={selectedPattern ? notesById.get(selectedPattern.id) : ""}
        onClose={handleCloseDetails}
        onSpeak={(pattern) => void handleSpeak(pattern)}
        onSaveNote={handleSaveNote}
        onSelectRelated={handleSelectRelated}
      />
      <SettingsPanel
        open={settingsOpen}
        value={listeningSettings}
        voices={voices
          .filter((voice) => voice.lang.toLowerCase().startsWith("en"))
          .map((voice) => ({ id: voice.voiceURI, label: voice.name, lang: voice.lang }))}
        onChange={handleSettingsChange}
        onClose={() => setSettingsOpen(false)}
        onExport={() => void handleExport()}
        onImport={(file) => void handleImport(file)}
        onReset={() => void handleResetSettings()}
        onResetLearning={() => void handleResetLearning()}
        onDeleteAll={() => void handleDeleteAll()}
      />
      <ToastRegion items={toasts} onDismiss={dismissToast} />
      <p className="sg-sr-only" aria-live="polite">
        {speechStatus === "speaking" ? `음성 재생 중: ${speechCurrentText}` : ""}
      </p>
    </div>
  );
}
