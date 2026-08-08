import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  Info,
  RotateCcw,
  Sparkles,
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
import type {
  DisplayMode,
  GridDensity,
  PatternProgressView,
} from "./types";

const TAP_DISTANCE_PX = 9;
const SWIPE_DISTANCE_PX = 42;
const LONG_PRESS_MS = 520;
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
  kind: "reply" | "example";
  index: number;
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
  const pointerOrigin = useRef<PointerOrigin | null>(null);
  const longPressTimer = useRef<number | undefined>(undefined);
  const suppressNextClick = useRef(false);
  const resolvedRelatedRef = useRef<readonly RelatedPatternCardItem[]>(EMPTY_RELATED_PATTERNS);
  const previousPatternId = useRef(pattern.id);
  const [resolvedRelated, setResolvedRelated] = useState<readonly RelatedPatternCardItem[]>(EMPTY_RELATED_PATTERNS);
  const [relatedIndex, setRelatedIndex] = useState(0);
  const [practiceOverride, setPracticeOverride] = useState<PracticeOverride | null>(null);
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
  const activeExample = effectivePracticeOverride?.kind === "example"
    ? activePattern.examples[modulo(effectivePracticeOverride.index, activePattern.examples.length)]
    : undefined;
  const practiceItem = activeReply ?? activeExample;
  const english = practiceItem?.english ?? activePattern.english;
  const korean = practiceItem?.korean ?? activePattern.korean;
  const practiceLabel = activeReply
    ? "이어지는 대답"
    : activeExample
      ? `실전 예문 ${modulo(effectivePracticeOverride?.index ?? 0, activePattern.examples.length) + 1}/${activePattern.examples.length}`
      : activeDeckItem.label;
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

  useEffect(() => clearLongPress, [clearLongPress]);

  useEffect(() => {
    if (previousPatternId.current === pattern.id) return;
    previousPatternId.current = pattern.id;
    resolvedRelatedRef.current = EMPTY_RELATED_PATTERNS;
    setResolvedRelated(EMPTY_RELATED_PATTERNS);
    setRelatedIndex(0);
    setPracticeOverride(null);
  }, [pattern.id]);

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

  const showExample = useCallback(() => {
    if (activePattern.examples.length === 0) {
      cycleRelated(1);
      return;
    }
    const nextIndex = practiceOverride?.kind === "example" ? practiceOverride.index + 1 : 0;
    const example = activePattern.examples[modulo(nextIndex, activePattern.examples.length)];
    setPracticeOverride({ kind: "example", index: nextIndex });
    onActivate?.(pattern);
    onSpeak(activePattern, example.english, pattern.id);
    if (answerIsHidden) onRevealChange?.(pattern.id, true);
  }, [activePattern, answerIsHidden, cycleRelated, onActivate, onRevealChange, onSpeak, pattern, practiceOverride]);

  const resetToOriginal = useCallback(() => {
    setRelatedIndex(0);
    setPracticeOverride(null);
    onActivate?.(pattern);
    onSpeak(pattern, undefined, pattern.id);
  }, [onActivate, onSpeak, pattern]);

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
      if (onOpenDetails) {
        longPressTimer.current = window.setTimeout(() => {
          const origin = pointerOrigin.current;
          if (!origin) return;
          origin.longPressed = true;
          suppressNextClick.current = true;
          onOpenDetails(activePattern);
        }, LONG_PRESS_MS);
      }
    },
    [activePattern, clearLongPress, onOpenDetails],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const origin = pointerOrigin.current;
      if (!origin || origin.pointerId !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - origin.x, event.clientY - origin.y);
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
      const deltaX = event.clientX - origin.x;
      const deltaY = event.clientY - origin.y;
      const horizontalSwipe = Math.abs(deltaX) >= SWIPE_DISTANCE_PX && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;
      if (horizontalSwipe) {
        suppressNextClick.current = true;
        cycleRelated(deltaX < 0 ? 1 : -1);
        return;
      }
      suppressNextClick.current = origin.longPressed || origin.moved;
    },
    [clearLongPress, cycleRelated],
  );

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
        showExample();
      } else if (key === "r" || event.key === "Escape") {
        event.preventDefault();
        if (relatedIndex !== 0 || practiceOverride) resetToOriginal();
        else onRevealChange?.(pattern.id, false);
      }
    },
    [cycleRelated, onRevealChange, pattern.id, practiceOverride, relatedIndex, resetToOriginal, showExample, showReply, speakCurrent],
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
  const instructionId = `sg-pattern-${pattern.id}-instructions`;

  return (
    <article
      className={`sg-pattern-card sg-density-${density}${revealed ? " is-revealed" : ""}${selected ? " is-selected" : ""}${isSpeaking ? " is-speaking" : ""}${progress?.due ? " is-due" : ""}`}
      data-pattern-id={pattern.id}
      data-mastery={mastery.level}
      data-practice-kind={practiceOverride?.kind ?? (deckIndex > 0 ? "related" : "base")}
    >
      <div className={`sg-pattern-card__topline${showPatternFormula || selected ? " has-label" : ""}`}>
        {showPatternFormula || selected ? (
          <p className="sg-pattern-card__formula" lang={practiceItem ? "ko" : "en"}>
            {showPatternFormula ? formula : activeLabel}
          </p>
        ) : null}
        <span className="sg-pattern-card__signals">
          {progress?.isNew ? (
            <span className="sg-mini-signal is-new" title="새로 추가됨">
              <Sparkles aria-hidden="true" />
              <span className="sg-sr-only">새 표현</span>
            </span>
          ) : null}
          {progress?.due ? (
            <span className="sg-mini-signal is-due" title="복습 예정">
              <RotateCcw aria-hidden="true" />
              <span className="sg-sr-only">복습 예정</span>
            </span>
          ) : null}
          <span className={`sg-mastery-mark is-${mastery.level}`} title={mastery.label}>
            <mastery.Icon aria-hidden="true" />
            <span className="sg-sr-only">숙련 상태: {mastery.label}</span>
          </span>
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
        onPointerCancel={() => {
          clearLongPress();
          pointerOrigin.current = null;
          suppressNextClick.current = true;
        }}
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
          <span id={instructionId} className="sg-sr-only">현재 선택된 카드입니다. 좌우 스와이프 또는 화살표로 연관 표현, 위 화살표로 대답, 아래 화살표로 예문을 듣습니다.</span>
        ) : null}
      </div>

      {selected && deck.length > 1 ? (
        <>
          <button
            type="button"
            className="sg-related-edge is-previous"
            aria-label="이전 연결 표현"
            onClick={() => cycleRelated(-1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            className="sg-related-edge is-next"
            aria-label="다음 연결 표현"
            onClick={() => cycleRelated(1)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </>
      ) : null}

      {selected ? (
        <div className="sg-gesture-rail" aria-label="연결 연습 바로가기">
          <button type="button" onClick={showReply}>
            <ArrowUp aria-hidden="true" />
            <span>대답</span>
          </button>
          <button type="button" onClick={showExample}>
            <ArrowDown aria-hidden="true" />
            <span>예문</span>
          </button>
        </div>
      ) : null}
    </article>
  );
}

export const PatternCard = memo(PatternCardComponent);
