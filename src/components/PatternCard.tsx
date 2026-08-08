import {
  Check,
  Circle,
  CircleDot,
  Info,
  RotateCcw,
  Star,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { ConversationPattern } from "../content/schema";
import {
  RadialGestureMenu,
  type RadialDirection,
} from "./RadialGestureMenu";
import type {
  DisplayMode,
  GridDensity,
  PatternProgressView,
} from "./types";

const TAP_DISTANCE_PX = 9;
const LONG_PRESS_MS = 360;
const GESTURE_TRIGGER_PX = 28;
const GESTURE_VISUAL_DISTANCE_PX = 38;
const RADIAL_SAFE_MARGIN_PX = 98;
const EMPTY_RELATED_PATTERNS: readonly RelatedPatternCardItem[] = [];

export interface RelatedPatternCardItem {
  pattern: ConversationPattern;
  label: string;
}

export interface PatternCardProps {
  pattern: ConversationPattern;
  mode: DisplayMode;
  density: GridDensity;
  progress?: PatternProgressView;
  revealed?: boolean;
  selected?: boolean;
  relatedPatterns?: readonly RelatedPatternCardItem[];
  resolveRelatedPatterns?: (pattern: ConversationPattern) => readonly RelatedPatternCardItem[];
  isSpeaking?: boolean;
  onRevealChange?: (patternId: string, revealed: boolean) => void;
  onActivate?: (pattern: ConversationPattern) => void;
  onSpeak: (
    pattern: ConversationPattern,
    textOverride?: string,
    visualPatternId?: string,
    options?: { slow?: boolean },
  ) => void;
  onOpenDetails?: (pattern: ConversationPattern) => void;
}

interface PointerOrigin {
  x: number;
  y: number;
  pointerId: number;
  longPressed: boolean;
  moved: boolean;
}

interface PracticeOverride {
  kind: "reply";
  index: number;
}

interface RadialGestureState {
  center: { x: number; y: number };
  direction: RadialDirection | null;
  drag: { x: number; y: number };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function radialDirection(deltaX: number, deltaY: number): RadialDirection | null {
  if (Math.hypot(deltaX, deltaY) < GESTURE_TRIGGER_PX) return null;
  if (Math.abs(deltaX) > Math.abs(deltaY)) return deltaX > 0 ? "right" : "left";
  return deltaY > 0 ? "down" : "up";
}

function radialDrag(deltaX: number, deltaY: number) {
  const distance = Math.hypot(deltaX, deltaY);
  if (distance === 0) return { x: 0, y: 0 };
  const scale = Math.min(1, GESTURE_VISUAL_DISTANCE_PX / distance);
  return { x: deltaX * scale, y: deltaY * scale };
}

function masteryMeta(mastery = 0) {
  if (mastery >= 5) return { label: "숙달", Icon: Star, level: "mastered" };
  if (mastery >= 4) return { label: "익힘", Icon: Check, level: "known" };
  if (mastery >= 2) return { label: "학습 중", Icon: CircleDot, level: "learning" };
  return { label: "미학습", Icon: Circle, level: "new" };
}

function normalizeSentence(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[’]/g, "'")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

function modulo(value: number, size: number) {
  return ((value % size) + size) % size;
}

function PatternCardComponent({
  pattern,
  mode,
  density,
  progress,
  revealed = false,
  selected = false,
  relatedPatterns = EMPTY_RELATED_PATTERNS,
  resolveRelatedPatterns,
  isSpeaking = false,
  onRevealChange,
  onActivate,
  onSpeak,
  onOpenDetails,
}: PatternCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const pointerOrigin = useRef<PointerOrigin | null>(null);
  const longPressTimer = useRef<number | undefined>(undefined);
  const suppressNextClick = useRef(false);
  const gestureDirectionRef = useRef<RadialDirection | null>(null);
  const gestureActiveRef = useRef(false);
  const resolvedRelatedRef = useRef<readonly RelatedPatternCardItem[]>(EMPTY_RELATED_PATTERNS);
  const previousPatternId = useRef(pattern.id);
  const [resolvedRelated, setResolvedRelated] = useState<readonly RelatedPatternCardItem[]>(EMPTY_RELATED_PATTERNS);
  const [relatedIndex, setRelatedIndex] = useState(0);
  const [practiceOverride, setPracticeOverride] = useState<PracticeOverride | null>(null);
  const [radialGesture, setRadialGesture] = useState<RadialGestureState | null>(null);
  const mastery = masteryMeta(progress?.mastery);

  const availableRelated = relatedPatterns.length > 0 ? relatedPatterns : resolvedRelated;
  const deck = useMemo(
    () => [
      { pattern, label: "원문" },
      ...availableRelated.filter((item) => item.pattern.id !== pattern.id),
    ],
    [availableRelated, pattern],
  );
  const effectiveRelatedIndex = selected ? relatedIndex : 0;
  const effectivePracticeOverride = selected ? practiceOverride : null;
  const deckIndex = modulo(effectiveRelatedIndex, deck.length);
  const activeDeckItem = deck[deckIndex] ?? deck[0];
  const activePattern = activeDeckItem.pattern;
  const activeReply = effectivePracticeOverride?.kind === "reply"
    ? activePattern.replies[modulo(effectivePracticeOverride.index, activePattern.replies.length)]
    : undefined;
  const practiceItem = activeReply;
  const english = practiceItem?.english ?? activePattern.english;
  const korean = practiceItem?.korean ?? activePattern.korean;
  const practiceLabel = activeReply ? "이어지는 대답" : activeDeckItem.label;
  const englishVisible = mode === "all" || revealed || mode === "hide-korean";
  const koreanVisible = mode === "all" || revealed || mode === "hide-english";
  const answerIsHidden = !englishVisible || !koreanVisible;
  const formula = practiceItem ? practiceLabel : activePattern.pattern;
  const showPatternFormula = normalizeSentence(formula) !== normalizeSentence(english);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current !== undefined) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = undefined;
    }
  }, []);

  const closeRadialGesture = useCallback(() => {
    gestureActiveRef.current = false;
    gestureDirectionRef.current = null;
    setRadialGesture(null);
  }, []);

  useEffect(
    () => () => {
      clearLongPress();
      gestureActiveRef.current = false;
      gestureDirectionRef.current = null;
    },
    [clearLongPress],
  );

  useEffect(() => {
    if (previousPatternId.current === pattern.id) return;
    previousPatternId.current = pattern.id;
    resolvedRelatedRef.current = EMPTY_RELATED_PATTERNS;
    setResolvedRelated(EMPTY_RELATED_PATTERNS);
    setRelatedIndex(0);
    setPracticeOverride(null);
    closeRadialGesture();
  }, [closeRadialGesture, pattern.id]);

  useEffect(() => {
    if (relatedPatterns.length > 0) resolvedRelatedRef.current = relatedPatterns;
  }, [relatedPatterns]);

  useEffect(() => {
    if (!selected) {
      setRelatedIndex(0);
      setPracticeOverride(null);
    }
  }, [selected]);

  const speakCurrent = useCallback(() => {
    onActivate?.(pattern);
    if (practiceItem) onSpeak(activePattern, practiceItem.english, pattern.id);
    else onSpeak(activePattern, undefined, pattern.id);
    if (answerIsHidden) onRevealChange?.(pattern.id, true);
  }, [activePattern, answerIsHidden, onActivate, onRevealChange, onSpeak, pattern, practiceItem?.english]);

  const cycleRelated = useCallback(
    (direction: 1 | -1) => {
      const newlyResolved = deck.length <= 1
        ? resolvedRelatedRef.current.length > 0
          ? resolvedRelatedRef.current
          : resolveRelatedPatterns?.(pattern) ?? []
        : [];
      if (newlyResolved.length > 0 && deck.length <= 1) {
        resolvedRelatedRef.current = newlyResolved;
        setResolvedRelated(newlyResolved);
      }
      const activeDeck = deck.length > 1
        ? deck
        : [
            { pattern, label: "원문" },
            ...newlyResolved.filter((item) => item.pattern.id !== pattern.id),
          ];
      if (activeDeck.length <= 1) {
        speakCurrent();
        return;
      }
      const currentIndex = modulo(relatedIndex, activeDeck.length);
      const nextIndex = modulo(currentIndex + direction, activeDeck.length);
      const next = activeDeck[nextIndex];
      setRelatedIndex(nextIndex);
      setPracticeOverride(null);
      onActivate?.(pattern);
      onSpeak(next.pattern, undefined, pattern.id);
      if (answerIsHidden) onRevealChange?.(pattern.id, true);
    },
    [answerIsHidden, deck, onActivate, onRevealChange, onSpeak, pattern, relatedIndex, resolveRelatedPatterns, speakCurrent],
  );

  const showReply = useCallback(() => {
    if (activePattern.replies.length === 0) {
      cycleRelated(1);
      return;
    }
    const nextIndex = practiceOverride?.kind === "reply" ? practiceOverride.index + 1 : 0;
    const reply = activePattern.replies[modulo(nextIndex, activePattern.replies.length)];
    setPracticeOverride({ kind: "reply", index: nextIndex });
    onActivate?.(pattern);
    onSpeak(activePattern, reply.english, pattern.id);
    if (answerIsHidden) onRevealChange?.(pattern.id, true);
  }, [activePattern, answerIsHidden, cycleRelated, onActivate, onRevealChange, onSpeak, pattern, practiceOverride]);

  const resetToOriginal = useCallback(() => {
    setRelatedIndex(0);
    setPracticeOverride(null);
    onActivate?.(pattern);
    onSpeak(pattern, undefined, pattern.id);
  }, [onActivate, onSpeak, pattern]);

  const speakSlowly = useCallback(() => {
    onActivate?.(pattern);
    onSpeak(
      activePattern,
      practiceItem?.english,
      pattern.id,
      { slow: true },
    );
    if (answerIsHidden) onRevealChange?.(pattern.id, true);
  }, [activePattern, answerIsHidden, onActivate, onRevealChange, onSpeak, pattern, practiceItem?.english]);

  const performRadialAction = useCallback(
    (direction: RadialDirection) => {
      if (direction === "left") cycleRelated(-1);
      else if (direction === "right") cycleRelated(1);
      else if (direction === "up") showReply();
      else speakSlowly();
    },
    [cycleRelated, showReply, speakSlowly],
  );

  const startRadialGesture = useCallback(() => {
    const origin = pointerOrigin.current;
    if (!origin || origin.moved) return;

    origin.longPressed = true;
    suppressNextClick.current = true;
    gestureActiveRef.current = true;
    gestureDirectionRef.current = null;

    if (relatedPatterns.length === 0 && resolvedRelatedRef.current.length === 0) {
      const nextRelated = resolveRelatedPatterns?.(pattern) ?? EMPTY_RELATED_PATTERNS;
      resolvedRelatedRef.current = nextRelated;
      setResolvedRelated(nextRelated);
    }

    const rect = cardRef.current?.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const toolbarBottom = document.querySelector(".sg-toolbar")?.getBoundingClientRect().bottom ?? 0;
    const naturalX = rect && rect.width > 0 ? rect.left + rect.width / 2 : origin.x;
    const naturalY = rect && rect.height > 0 ? rect.top + rect.height / 2 : origin.y;
    const center = {
      x: clamp(naturalX, RADIAL_SAFE_MARGIN_PX, viewportWidth - RADIAL_SAFE_MARGIN_PX),
      y: clamp(
        naturalY,
        Math.max(RADIAL_SAFE_MARGIN_PX, toolbarBottom + 94),
        viewportHeight - RADIAL_SAFE_MARGIN_PX,
      ),
    };

    onActivate?.(pattern);
    setRadialGesture({ center, direction: null, drag: { x: 0, y: 0 } });
    navigator.vibrate?.(10);
  }, [onActivate, pattern, relatedPatterns.length, resolveRelatedPatterns]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      suppressNextClick.current = false;
      pointerOrigin.current = {
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
        longPressed: false,
        moved: false,
      };
      clearLongPress();
      longPressTimer.current = window.setTimeout(startRadialGesture, LONG_PRESS_MS);
    },
    [clearLongPress, startRadialGesture],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const origin = pointerOrigin.current;
      if (!origin || origin.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - origin.x;
      const deltaY = event.clientY - origin.y;
      if (origin.longPressed && gestureActiveRef.current) {
        event.preventDefault();
        const direction = radialDirection(deltaX, deltaY);
        const drag = radialDrag(deltaX, deltaY);
        gestureDirectionRef.current = direction;
        setRadialGesture((current) => current ? { ...current, direction, drag } : current);
        return;
      }

      const distance = Math.hypot(deltaX, deltaY);
      if (distance > TAP_DISTANCE_PX) {
        origin.moved = true;
        clearLongPress();
      }
    },
    [clearLongPress],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const origin = pointerOrigin.current;
      clearLongPress();
      pointerOrigin.current = null;
      if (!origin || origin.pointerId !== event.pointerId) return;
      if (origin.longPressed) {
        event.preventDefault();
        suppressNextClick.current = true;
        const direction = gestureDirectionRef.current;
        closeRadialGesture();
        if (direction) performRadialAction(direction);
        return;
      }
      suppressNextClick.current = origin.moved;
    },
    [clearLongPress, closeRadialGesture, performRadialAction],
  );

  const cancelPointerGesture = useCallback(() => {
    clearLongPress();
    pointerOrigin.current = null;
    suppressNextClick.current = true;
    closeRadialGesture();
  }, [clearLongPress, closeRadialGesture]);

  const handleClick = useCallback(() => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      return;
    }
    speakCurrent();
  }, [speakCurrent]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const key = event.key.toLowerCase();
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        speakCurrent();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        cycleRelated(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        cycleRelated(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        showReply();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        speakSlowly();
      } else if (key === "r" || event.key === "Escape") {
        event.preventDefault();
        if (relatedIndex !== 0 || practiceOverride) resetToOriginal();
        else onRevealChange?.(pattern.id, false);
      }
    },
    [cycleRelated, onRevealChange, pattern.id, practiceOverride, relatedIndex, resetToOriginal, showReply, speakCurrent, speakSlowly],
  );

  const spokenLabel = english.replace(/[.!?]+$/g, "");
  const revealLabel = mode === "listening"
    ? "영어 발음을 듣고 정답 보기"
    : !englishVisible
      ? `${korean}. 영어 발음을 듣고 정답 보기`
      : !koreanVisible
        ? `${english}. 발음을 듣고 가려진 뜻 보기`
        : `${spokenLabel}. 발음 듣기`;
  const activeLabel = effectivePracticeOverride
    ? practiceLabel
    : `연결 ${deckIndex + 1}/${deck.length} · ${activeDeckItem.label}`;
  const transformedLabel = effectivePracticeOverride || deckIndex > 0 ? activeLabel : null;
  const taxonomyLabel = activePattern.tags.slice(0, 2).join(" · ");
  const toplineLabel = transformedLabel ?? (showPatternFormula ? formula : taxonomyLabel);
  const toplineLanguage = transformedLabel || !showPatternFormula ? "ko" : "en";
  const instructionId = `sg-pattern-${pattern.id}-instructions`;

  return (
    <article
      ref={cardRef}
      className={`sg-pattern-card sg-density-${density}${revealed ? " is-revealed" : ""}${selected ? " is-selected" : ""}${isSpeaking ? " is-speaking" : ""}${progress?.due ? " is-due" : ""}${radialGesture ? " is-gesture-active" : ""}`}
      data-pattern-id={pattern.id}
      data-mastery={mastery.level}
      data-practice-kind={practiceOverride?.kind ?? (deckIndex > 0 ? "related" : "base")}
    >
      <div className={`sg-pattern-card__topline${toplineLabel ? " has-label" : ""}`}>
        {toplineLabel ? (
          <p className={`sg-pattern-card__formula${transformedLabel ? " is-context" : ""}`} lang={toplineLanguage}>
            {toplineLabel}
          </p>
        ) : null}
        <span className="sg-pattern-card__signals">
          {progress?.due ? (
            <span className="sg-mini-signal is-due" title="복습 예정">
              <RotateCcw aria-hidden="true" />
              <span className="sg-sr-only">복습 예정</span>
            </span>
          ) : null}
          {mastery.level !== "new" ? (
            <span className={`sg-mastery-mark is-${mastery.level}`} title={mastery.label}>
              <mastery.Icon aria-hidden="true" />
              <span className="sg-sr-only">숙련 상태: {mastery.label}</span>
            </span>
          ) : null}
          <button
            type="button"
            className="sg-card-detail-button"
            aria-label={`${english} 상세 보기`}
            onClick={() => onOpenDetails?.(activePattern)}
            disabled={!onOpenDetails}
          >
            <Info aria-hidden="true" />
          </button>
        </span>
      </div>

      <div
        className="sg-pattern-card__answer"
        role="button"
        tabIndex={0}
        aria-label={`${selected ? "선택됨. " : ""}${revealLabel}`}
        aria-describedby={selected ? instructionId : undefined}
        aria-expanded={mode === "all" ? undefined : !answerIsHidden}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={cancelPointerGesture}
        onContextMenu={(event) => event.preventDefault()}
      >
        {englishVisible ? (
          <p className="sg-pattern-card__english" lang="en">
            {english}
          </p>
        ) : (
          <div className="sg-hidden-answer" aria-hidden="true">
            <span>영어를 말해 보세요</span>
          </div>
        )}

        {koreanVisible ? (
          <p className="sg-pattern-card__korean" lang="ko">
            {korean}
          </p>
        ) : (
          <div className="sg-hidden-answer" aria-hidden="true">
            <span>{mode === "listening" ? "듣고 뜻을 떠올려 보세요" : "뜻을 떠올려 보세요"}</span>
          </div>
        )}
        {answerIsHidden ? (
          <span className="sg-sr-only">정답이 가려져 있습니다. 누르면 발음을 듣고 확인합니다.</span>
        ) : null}
        {selected ? (
          <span id={instructionId} className="sg-sr-only">현재 선택된 카드입니다. 길게 누른 뒤 왼쪽이나 오른쪽으로 끌면 연관 표현, 위로 끌면 대답, 아래로 끌면 현재 문장을 천천히 듣습니다. 키보드에서는 같은 방향의 화살표 키를 사용합니다.</span>
        ) : null}
      </div>

      {radialGesture ? (
        <RadialGestureMenu
          open
          center={radialGesture.center}
          activeDirection={radialGesture.direction}
          drag={radialGesture.drag}
        />
      ) : null}
    </article>
  );
}

export const PatternCard = memo(PatternCardComponent);
