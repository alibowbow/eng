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
import { ListeningController } from "./components/ListeningController";
import { MobileNav } from "./components/MobileNav";
import { PatternDetailDrawer } from "./components/PatternDetailDrawer";
import {
  RandomSessionHeader,
  RandomSessionResult,
  RandomSizePicker,
} from "./components/RandomSession";
import { SettingsPanel } from "./components/SettingsPanel";
import { VirtualPatternGrid } from "./components/VirtualPatternGrid";
import {
  EMPTY_FILTERS,
  type AppView,
  type Assessment,
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
  getProgressMap,
  getSettings,
  importBackup,
  resetLearningData,
  resetSettings,
  saveProgress,
  saveSettings,
  type AppSettings,
  type GridPosition,
  type PersonalNote,
} from "./lib/db";
import { sampleUniqueBy } from "./lib/random";
import { applyReviewResult, isReviewDue, toReviewSchedule } from "./lib/review";
import { searchPatterns, type MasteryFilter } from "./lib/search";

interface RandomSessionState {
  patterns: ConversationPattern[];
  answers: Map<string, Assessment>;
  requestedCount: number;
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

function makeToastId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mapDensity(value: AppSettings["gridDensity"]): GridDensity {
  return value === "default" ? "comfortable" : value;
}

function unmapDensity(value: GridDensity): AppSettings["gridDensity"] {
  return value === "comfortable" ? "default" : value;
}

function assessmentFromRating(rating?: LearningProgress["lastRating"]): Assessment | undefined {
  if (rating === "unknown") return "again";
  if (rating === "unsure") return "hard";
  if (rating === "known") return "easy";
  return undefined;
}

function masteryFilter(value: string): MasteryFilter | undefined {
  const mapping: Record<string, MasteryFilter> = {
    unseen: "unlearned",
    again: "unknown",
    hard: "unsure",
    easy: "known",
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
    Number(filters.reviewDueOnly) +
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
  const [view, setView] = useState<AppView>("grid");
  const [filters, setFilters] = useState<FilterState>(() => ({ ...EMPTY_FILTERS }));
  const [filterOpen, setFilterOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [revealedIds, setRevealedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [progressById, setProgressById] = useState<Map<string, LearningProgress>>(() => new Map());
  const [favoriteIds, setFavoriteIds] = useState<ReadonlySet<string>>(() => new Set());
  const [notesById, setNotesById] = useState<Map<string, string>>(() => new Map());
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const [randomSession, setRandomSession] = useState<RandomSessionState | null>(null);
  const [initialScrollIndex, setInitialScrollIndex] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [listeningSettings, setListeningSettings] = useState<ListeningSettings>(
    DEFAULT_LISTENING_SETTINGS,
  );
  const [repeatListening, setRepeatListening] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const toastTimers = useRef(new Map<string, number>());
  const scrollSaveTimer = useRef<number | undefined>(undefined);
  const revealStartedAt = useRef(new Map<string, number>());
  const speakingToken = useRef(0);
  const pwaRegistered = useRef(false);

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
      const [loadedContent, progress, settings, favorites, notes, position] = await Promise.all([
        loadContent({ includeOptional: true }),
        getProgressMap(),
        getSettings(),
        db.getAll("favorites"),
        db.getAll("personalNotes"),
        db.get("lastGridPosition", "main"),
      ]);
      setContent(loadedContent);
      setProgressById(progress);
      setFavoriteIds(new Set(favorites.map((record) => record.patternId)));
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
      if (position?.anchorPatternId) {
        const anchorIndex = loadedContent.patterns.findIndex(
          (pattern) => pattern.id === position.anchorPatternId,
        );
        if (anchorIndex >= 0) setInitialScrollIndex(anchorIndex);
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
      const patternId = (event.state as { saygridPatternId?: string } | null)?.saygridPatternId;
      setSelectedPatternId(patternId ?? null);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const filteredPatterns = useMemo(() => {
    const mastery = filters.mastery.map(masteryFilter).filter(Boolean) as MasteryFilter[];
    if (filters.reviewDueOnly && !mastery.includes("due")) mastery.push("due");
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
      now: clock,
      newSince: clock - NEW_WINDOW_MS,
    });
  }, [clock, deferredQuery, favoriteIds, filters, notesById, patterns, progressById]);

  const duePatterns = useMemo(
    () => filteredPatterns.filter((pattern) => isReviewDue(progressById.get(pattern.id), clock)),
    [clock, filteredPatterns, progressById],
  );
  const savedPatterns = useMemo(
    () => filteredPatterns.filter((pattern) => favoriteIds.has(pattern.id)),
    [favoriteIds, filteredPatterns],
  );
  const scopedPatterns = view === "review" ? duePatterns : view === "saved" ? savedPatterns : filteredPatterns;
  const displayedPatterns = view === "random" && randomSession ? randomSession.patterns : scopedPatterns;

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

  const getProgressView = useCallback(
    (pattern: ConversationPattern): PatternProgressView => {
      const progress = progressById.get(pattern.id);
      return {
        mastery: progress?.mastery ?? 0,
        lastRating: assessmentFromRating(progress?.lastRating),
        due: isReviewDue(progress, clock),
        bookmarked: favoriteIds.has(pattern.id),
        isNew: Boolean(
          pattern.releasedAt && new Date(pattern.releasedAt).getTime() >= clock - NEW_WINDOW_MS,
        ),
      };
    },
    [clock, favoriteIds, progressById],
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
      if (revealed) {
        next.add(patternId);
        revealStartedAt.current.set(patternId, performance.now());
      } else {
        next.delete(patternId);
        revealStartedAt.current.delete(patternId);
      }
      return next;
    });
  }, []);

  const handleSpeak = useCallback(
    async (pattern: ConversationPattern) => {
      stopContinuous();
      const token = speakingToken.current + 1;
      speakingToken.current = token;
      const result = await speak({
        text: pattern.audio?.ttsText || pattern.english,
        lang: pattern.audio?.lang || "en-US",
        audioUrl: pattern.audio?.audioUrl,
        slowAudioUrl: pattern.audio?.slowAudioUrl,
      });
      if (token === speakingToken.current && result === "unsupported") {
        pushToast("이 브라우저에서는 음성 재생을 사용할 수 없습니다.", "warning");
      } else if (token === speakingToken.current && result === "error") {
        pushToast("음성을 재생하지 못했습니다. 다른 목소리를 선택해 보세요.", "error");
      }
    },
    [pushToast, speak, stopContinuous],
  );

  const handleAssess = useCallback(
    (pattern: ConversationPattern, assessment: Assessment) => {
      const startedAt = revealStartedAt.current.get(pattern.id);
      const responseTimeMs = startedAt === undefined ? 0 : Math.max(0, performance.now() - startedAt);
      const rating = assessment === "easy" ? "known" : assessment === "hard" ? "unsure" : "unknown";
      const previous = progressById.get(pattern.id);
      const next = applyReviewResult(previous, rating, { patternId: pattern.id, responseTimeMs });
      setProgressById((current) => {
        const updated = new Map(current);
        updated.set(pattern.id, next);
        return updated;
      });
      void saveProgress(next);
      const schedule = toReviewSchedule(next);
      if (schedule) void db.put("reviewSchedule", schedule);
      setRevealedIds((current) => {
        const updated = new Set(current);
        updated.delete(pattern.id);
        return updated;
      });
      revealStartedAt.current.delete(pattern.id);
      if (view === "random") {
        setRandomSession((session) => {
          if (!session) return session;
          const answers = new Map(session.answers);
          answers.set(pattern.id, assessment);
          return { ...session, answers };
        });
      }
    },
    [progressById, view],
  );

  const handleToggleFavorite = useCallback(
    (pattern: ConversationPattern) => {
      const isFavorite = favoriteIds.has(pattern.id);
      setFavoriteIds((current) => {
        const next = new Set(current);
        if (isFavorite) next.delete(pattern.id);
        else next.add(pattern.id);
        return next;
      });
      if (isFavorite) void db.delete("favorites", pattern.id);
      else void db.put("favorites", { patternId: pattern.id, createdAt: new Date().toISOString() });
      pushToast(isFavorite ? "보관함에서 뺐습니다." : "보관함에 추가했습니다.", "success");
    },
    [favoriteIds, pushToast],
  );

  const handleOpenDetails = useCallback((pattern: ConversationPattern) => {
    setSelectedPatternId(pattern.id);
    window.history.pushState({ saygridPatternId: pattern.id }, "", `#pattern=${encodeURIComponent(pattern.id)}`);
  }, []);

  const handleCloseDetails = useCallback(() => {
    if ((window.history.state as { saygridPatternId?: string } | null)?.saygridPatternId) {
      window.history.back();
    } else {
      setSelectedPatternId(null);
    }
  }, []);

  const handleSelectRelated = useCallback((patternId: string) => {
    setSelectedPatternId(patternId);
    window.history.replaceState({ saygridPatternId: patternId }, "", `#pattern=${encodeURIComponent(patternId)}`);
  }, []);

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

  const startRandom = useCallback(
    (count: number, source: readonly ConversationPattern[] = scopedPatterns) => {
      const selected = sampleUniqueBy(source, count, (pattern) => pattern.id);
      if (!selected.length) {
        pushToast("현재 범위에는 연습할 표현이 없습니다.", "warning");
        return;
      }
      setRandomSession({ patterns: selected, answers: new Map(), requestedCount: count });
      setView("random");
      setRevealedIds(new Set());
      stopContinuous();
    },
    [pushToast, scopedPatterns, stopContinuous],
  );

  const exitRandom = useCallback(() => {
    setRandomSession(null);
    setView("grid");
    setRevealedIds(new Set());
    stopContinuous();
  }, [stopContinuous]);

  const handleViewChange = useCallback(
    (nextView: AppView) => {
      if (nextView !== "random") setRandomSession(null);
      setView(nextView);
      setRevealedIds(new Set());
      stopContinuous();
    },
    [stopContinuous],
  );

  const handleVisibleRangeChange = useCallback(
    (startIndex: number) => {
      const anchor = displayedPatterns[startIndex];
      if (!anchor) return;
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
    [displayedPatterns, filters, view],
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
    if (!window.confirm("진도, 복습 일정, 즐겨찾기와 메모를 모두 지울까요? 이 작업은 되돌릴 수 없습니다.")) return;
    await resetLearningData();
    setProgressById(new Map());
    setFavoriteIds(new Set());
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
  const dueCount = useMemo(
    () => patterns.reduce(
      (count, pattern) => count + Number(isReviewDue(progressById.get(pattern.id), clock)),
      0,
    ),
    [clock, patterns, progressById],
  );
  const randomAnswered = randomSession?.answers.size ?? 0;
  const randomComplete = Boolean(randomSession?.patterns.length && randomAnswered >= randomSession.patterns.length);
  const randomCounts = useMemo(
    () => randomSession
      ? [...randomSession.answers.values()].reduce(
          (counts, rating) => ({ ...counts, [rating]: counts[rating] + 1 }),
          { again: 0, hard: 0, easy: 0 },
        )
      : { again: 0, hard: 0, easy: 0 },
    [randomSession],
  );
  const currentListeningPattern = continuousState.currentId
    ? patternById.get(continuousState.currentId)
    : undefined;
  const speakingId = continuousActive ? continuousState.currentId ?? undefined : undefined;

  return (
    <div className="sg-app" data-view={view}>
      <AppToolbar
        mode={mode}
        onModeChange={handleModeChange}
        density={density}
        onDensityChange={handleDensityChange}
        totalCount={displayedPatterns.length}
        dueCount={dueCount}
        activeFilterCount={countActiveFilters(filters)}
        onSearch={() => setFilterOpen(true)}
        onFilters={() => setFilterOpen(true)}
        onRandom={(count) => startRandom(count)}
        onReview={() => handleViewChange("review")}
        onListening={handleListeningToggle}
        onSettings={() => setSettingsOpen(true)}
        allRevealed={allRevealed}
        onToggleRevealAll={() => {
          if (allRevealed) setRevealedIds(new Set());
          else setRevealedIds(new Set(displayedPatterns.map((pattern) => pattern.id)));
        }}
        isListening={continuousActive}
      />

      <main id="main-grid" className="sg-main">
        {view === "random" && randomSession && !randomComplete ? (
          <RandomSessionHeader
            currentIndex={Math.min(randomAnswered, randomSession.patterns.length - 1)}
            total={randomSession.patterns.length}
            answeredCount={randomAnswered}
            onExit={exitRandom}
          />
        ) : null}

        {loading ? <LoadingGrid /> : null}
        {!loading && loadError ? <ErrorState description={loadError} onRetry={() => void hydrate()} /> : null}
        {!loading && !loadError && view === "random" && !randomSession ? (
          <RandomSizePicker availableCount={filteredPatterns.length} onStart={(count) => startRandom(count, filteredPatterns)} />
        ) : null}
        {!loading && !loadError && randomComplete && randomSession ? (
          <RandomSessionResult
            total={randomSession.patterns.length}
            counts={randomCounts}
            onRetryMissed={() => {
              const missed = randomSession.patterns.filter((pattern) => {
                const answer = randomSession.answers.get(pattern.id);
                return answer === "again" || answer === "hard";
              });
              startRandom(missed.length, missed);
            }}
            onRestart={() => startRandom(randomSession.requestedCount, filteredPatterns)}
            onExit={exitRandom}
          />
        ) : null}
        {!loading && !loadError && !(view === "random" && (!randomSession || randomComplete)) ? (
          <VirtualPatternGrid
            patterns={displayedPatterns}
            mode={mode}
            density={density}
            getProgress={getProgressView}
            revealedIds={revealedIds}
            speakingId={speakingId}
            autoScrollSpeaking={listeningSettings.autoScroll}
            onRevealChange={handleRevealChange}
            onSpeak={(pattern) => void handleSpeak(pattern)}
            onAssess={handleAssess}
            onToggleFavorite={handleToggleFavorite}
            onOpenDetails={handleOpenDetails}
            initialScrollIndex={initialScrollIndex}
            onVisibleRangeChange={handleVisibleRangeChange}
            emptyState={
              <EmptyState
                title={view === "review" ? "지금 복습할 표현이 없어요" : view === "saved" ? "보관한 표현이 없어요" : undefined}
                description={view === "review" ? "다음 복습 시간이 되면 여기에 자동으로 모입니다." : undefined}
                actionLabel="전체 그리드 보기"
                onAction={() => {
                  setFilters({ ...EMPTY_FILTERS });
                  setView("grid");
                }}
              />
            }
          />
        ) : null}
      </main>

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

      <MobileNav value={view} onChange={handleViewChange} reviewCount={dueCount} />
      <FilterSheet
        open={filterOpen}
        value={filters}
        categories={categoryOptions}
        situations={situationOptions}
        onChange={(next) => startTransition(() => setFilters(next))}
        onApply={(next) => {
          setInitialScrollIndex(0);
          startTransition(() => setFilters(next));
        }}
        onClose={() => setFilterOpen(false)}
        totalCount={filteredPatterns.length}
      />
      <PatternDetailDrawer
        open={Boolean(selectedPattern)}
        pattern={selectedPattern}
        progress={selectedPattern ? getProgressView(selectedPattern) : undefined}
        relatedPatterns={patterns}
        note={selectedPattern ? notesById.get(selectedPattern.id) : ""}
        onClose={handleCloseDetails}
        onSpeak={(pattern) => void handleSpeak(pattern)}
        onToggleFavorite={handleToggleFavorite}
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
