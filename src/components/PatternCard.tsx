import {
  BookOpenText,
  Check,
  Circle,
  CircleDot,
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
  buildPracticeVariationDeck,
  type PracticeVariationKind,
} from "../lib/practice-variations";
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

export interface PatternCardProps {
  pattern: ConversationPattern;
  mode: DisplayMode;
  density: GridDensity;
  progress?: PatternProgressView;
  revealed?: boolean;
  selected?: boolean;
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
  kind: "reply" | PracticeVariationKind;
  index: number;
}

interface RadialGestureState {
  center: { x: number; y: number };
  direction: RadialDirection | null;
  drag: { x: number; y: number };
}

type PracticeVariationDeck = ReturnType<typeof buildPracticeVariationDeck>;

const practiceVariationCache = new Map<
  string,
  { english: string; korean: string; deck: PracticeVariationDeck }
>();

function getPracticeVariationDeck(
  pattern: Pick<ConversationPattern, "id" | "english" | "korean">,
): PracticeVariationDeck {
  const cached = practiceVariationCache.get(pattern.id);
  if (cached?.english === pattern.english && cached.korean === pattern.korean) {
    return cached.deck;
  }

  const deck = buildPracticeVariationDeck(pattern);
  practiceVariationCache.set(pattern.id, {
    english: pattern.english,
    korean: pattern.korean,
    deck,
  });
  return deck;
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

function cardTone(pattern: ConversationPattern) {
  const source = pattern.categoryIds[0] ?? pattern.familyId ?? pattern.id;
  let hash = 0;
  for (const character of source) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 6;
}

function PatternCardComponent({
  pattern,
  mode,
  density,
  progress,
  revealed = false,
  selected = false,
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
  const previousPatternId = useRef(pattern.id);
  const [practiceOverride, setPracticeOverride] = useState<PracticeOverride | null>(null);
  const [radialGesture, setRadialGesture] = useState<RadialGestureState | null>(null);
  const mastery = masteryMeta(progress?.mastery);
  const variationDeck = useMemo(
    () => getPracticeVariationDeck(pattern),
    [pattern.english, pattern.id, pattern.korean],
  );
  const effectivePracticeOverride = selected ? practiceOverride : null;
  const activeReply = effectivePracticeOverride?.kind === "reply"
    ? pattern.replies[modulo(effectivePracticeOverride.index, pattern.replies.length)]
    : undefined;
  const activeVariationLane = effectivePracticeOverride?.kind === "word-swap"
    ? variationDeck.wordSwaps
    : effectivePracticeOverride?.kind === "paraphrase"
      ? variationDeck.paraphrases
      : undefined;
  const activeVariation = activeVariationLane && effectivePracticeOverride
    ? activeVariationLane[modulo(effectivePracticeOverride.index, activeVariationLane.length)]
    : undefined;
  const practiceItem = activeReply ?? activeVariation;
  const english = practiceItem?.english ?? pattern.english;
  const korean = practiceItem?.korean ?? pattern.korean;
  const practiceLabel = activeReply
    ? "이어지는 대답"
    : activeVariation?.kind === "word-swap"
      ? "단어 바꾸기"
      : activeVariation?.kind === "paraphrase"
        ? "같은 뜻으로 바꿔 말하기"
        : "원문";
  const englishVisible = mode === "all" || revealed || mode === "hide-korean";
  const koreanVisible = mode === "all" || revealed || mode === "hide-english";
  const answerIsHidden = !englishVisible || !koreanVisible;
  const formula = practiceItem ? practiceLabel : pattern.pattern;
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
    setPracticeOverride(null);
    closeRadialGesture();
  }, [closeRadialGesture, pattern.id]);

  useEffect(() => {
    if (!selected) {
      setPracticeOverride(null);
    }
  }, [selected]);

  const speakCurrent = useCallback(() => {
    onActivate?.(pattern);
    if (practiceItem) onSpeak(pattern, practiceItem.english, pattern.id);
    else onSpeak(pattern, undefined, pattern.id);
    if (answerIsHidden && mode !== "listening") onRevealChange?.(pattern.id, true);
  }, [answerIsHidden, mode, onActivate, onRevealChange, onSpeak, pattern, practiceItem?.english]);

  const cycleVariation = useCallback(
    (kind: PracticeVariationKind) => {
      const lane = kind === "word-swap"
        ? variationDeck.wordSwaps
        : variationDeck.paraphrases;
      if (lane.length === 0) {
        speakCurrent();
        return;
      }
      const nextIndex = practiceOverride?.kind === kind
        ? practiceOverride.index + 1
        : 0;
      const next = lane[modulo(nextIndex, lane.length)];
      setPracticeOverride({ kind, index: nextIndex });
      onActivate?.(pattern);
      onSpeak(pattern, next.english, pattern.id);
      if (answerIsHidden) onRevealChange?.(pattern.id, true);
    },
    [answerIsHidden, onActivate, onRevealChange, onSpeak, pattern, practiceOverride, speakCurrent, variationDeck.paraphrases, variationDeck.wordSwaps],
  );

  const showReply = useCallback(() => {
    if (pattern.replies.length === 0) {
      speakCurrent();
      return;
    }
    const nextIndex = practiceOverride?.kind === "reply" ? practiceOverride.index + 1 : 0;
    const reply = pattern.replies[modulo(nextIndex, pattern.replies.length)];
    setPracticeOverride({ kind: "reply", index: nextIndex });
    onActivate?.(pattern);
    onSpeak(pattern, reply.english, pattern.id);
    if (answerIsHidden) onRevealChange?.(pattern.id, true);
  }, [answerIsHidden, onActivate, onRevealChange, onSpeak, pattern, practiceOverride, speakCurrent]);

  const resetToOriginal = useCallback(() => {
    setPracticeOverride(null);
    onActivate?.(pattern);
    onSpeak(pattern, undefined, pattern.id);
  }, [onActivate, onSpeak, pattern]);

  const speakSlowly = useCallback(() => {
    onActivate?.(pattern);
    onSpeak(
      pattern,
      practiceItem?.english,
      pattern.id,
      { slow: true },
    );
    if (answerIsHidden && mode !== "listening") onRevealChange?.(pattern.id, true);
  }, [answerIsHidden, mode, onActivate, onRevealChange, onSpeak, pattern, practiceItem?.english]);

  const performRadialAction = useCallback(
    (direction: RadialDirection) => {
      if (direction === "left") cycleVariation("word-swap");
      else if (direction === "right") cycleVariation("paraphrase");
      else if (direction === "up") showReply();
      else speakSlowly();
    },
    [cycleVariation, showReply, speakSlowly],
  );

  const startRadialGesture = useCallback(() => {
    const origin = pointerOrigin.current;
    if (!origin || origin.moved) return;

    origin.longPressed = true;
    suppressNextClick.current = true;
    gestureActiveRef.current = true;
    gestureDirectionRef.current = null;

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
  }, [onActivate, pattern]);

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
        event.stopPropagation();
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
        cycleVariation("word-swap");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        cycleVariation("paraphrase");
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        showReply();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        speakSlowly();
      } else if (key === "r" || event.key === "Escape") {
        event.preventDefault();
        if (practiceOverride) resetToOriginal();
        else onRevealChange?.(pattern.id, false);
      }
    },
    [cycleVariation, onRevealChange, pattern.id, practiceOverride, resetToOriginal, showReply, speakCurrent, speakSlowly],
  );

  const spokenLabel = english.replace(/[.!?]+$/g, "");
  const revealLabel = mode === "listening"
    ? "영어 발음을 듣고 정답 보기"
    : !englishVisible
      ? `${korean}. 영어 발음을 듣고 정답 보기`
      : !koreanVisible
        ? `${english}. 발음을 듣고 가려진 뜻 보기`
        : `${spokenLabel}. 발음 듣기`;
  const activeLaneLength = effectivePracticeOverride?.kind === "reply"
    ? pattern.replies.length
    : effectivePracticeOverride?.kind === "word-swap"
      ? variationDeck.wordSwaps.length
      : effectivePracticeOverride?.kind === "paraphrase"
        ? variationDeck.paraphrases.length
        : 0;
  const transformedLabel = effectivePracticeOverride
    ? `${practiceLabel} ${modulo(effectivePracticeOverride.index, Math.max(1, activeLaneLength)) + 1}/${Math.max(1, activeLaneLength)}`
    : null;
  const taxonomyLabel = pattern.tags.slice(0, 2).join(" · ");
  const toplineLabel = transformedLabel ?? (showPatternFormula ? formula : taxonomyLabel);
  const toplineLanguage = transformedLabel || !showPatternFormula ? "ko" : "en";
  const instructionId = `sg-pattern-${pattern.id}-instructions`;

  return (
    <article
      ref={cardRef}
      className={`sg-pattern-card sg-density-${density}${revealed ? " is-revealed" : ""}${selected ? " is-selected" : ""}${isSpeaking ? " is-speaking" : ""}${progress?.due ? " is-due" : ""}${radialGesture ? " is-gesture-active" : ""}`}
      data-pattern-id={pattern.id}
      data-card-tone={cardTone(pattern)}
      data-mastery={mastery.level}
      data-practice-kind={practiceOverride?.kind ?? "base"}
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
            aria-label={`${pattern.english} 상세 보기`}
            onClick={() => onOpenDetails?.(pattern)}
            disabled={!onOpenDetails}
          >
            <BookOpenText aria-hidden="true" />
            <span>상세</span>
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
          <span id={instructionId} className="sg-sr-only">현재 선택된 카드입니다. 길게 누른 뒤 왼쪽으로 끌면 단어를 바꾼 문장, 오른쪽으로 끌면 같은 뜻으로 바꿔 말한 문장, 위로 끌면 대답, 아래로 끌면 현재 문장을 천천히 듣습니다. 키보드에서는 같은 방향의 화살표 키를 사용합니다.</span>
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
