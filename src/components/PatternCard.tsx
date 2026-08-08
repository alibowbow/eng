import {
  Bookmark,
  Check,
  ChevronRight,
  Circle,
  CircleDot,
  Info,
  RotateCcw,
  Sparkles,
  Star,
  Volume2,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
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
const LONG_PRESS_MS = 520;

export interface PatternCardProps {
  pattern: ConversationPattern;
  mode: DisplayMode;
  density: GridDensity;
  progress?: PatternProgressView;
  revealed?: boolean;
  isSpeaking?: boolean;
  onRevealChange?: (revealed: boolean) => void;
  onSpeak: (pattern: ConversationPattern) => void;
  onToggleFavorite?: (pattern: ConversationPattern) => void;
  onOpenDetails?: (pattern: ConversationPattern) => void;
}

interface PointerOrigin {
  x: number;
  y: number;
  pointerId: number;
  longPressed: boolean;
  moved: boolean;
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

function PatternCardComponent({
  pattern,
  mode,
  density,
  progress,
  revealed = false,
  isSpeaking = false,
  onRevealChange,
  onSpeak,
  onToggleFavorite,
  onOpenDetails,
}: PatternCardProps) {
  const pointerOrigin = useRef<PointerOrigin | null>(null);
  const longPressTimer = useRef<number | undefined>(undefined);
  const suppressNextClick = useRef(false);
  const mastery = masteryMeta(progress?.mastery);
  const englishVisible = mode === "all" || revealed || mode === "hide-korean";
  const koreanVisible = mode === "all" || revealed || mode === "hide-english";
  const answerIsHidden = !englishVisible || !koreanVisible;
  const showPatternFormula = normalizeSentence(pattern.pattern) !== normalizeSentence(pattern.english);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current !== undefined) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = undefined;
    }
  }, []);

  useEffect(() => clearLongPress, [clearLongPress]);

  const activateCard = useCallback(() => {
    onSpeak(pattern);
    if (answerIsHidden) onRevealChange?.(true);
  }, [answerIsHidden, onRevealChange, onSpeak, pattern]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
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
          onOpenDetails(pattern);
        }, LONG_PRESS_MS);
      }
    },
    [clearLongPress, onOpenDetails, pattern],
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
      const distance = Math.hypot(event.clientX - origin.x, event.clientY - origin.y);
      suppressNextClick.current = origin.longPressed || origin.moved || distance > TAP_DISTANCE_PX;
    },
    [clearLongPress],
  );

  const handleClick = useCallback(() => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      return;
    }
    activateCard();
  }, [activateCard]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const key = event.key.toLowerCase();
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateCard();
      } else if (key === "r") {
        event.preventDefault();
        onRevealChange?.(false);
      } else if (key === "p") {
        event.preventDefault();
        onSpeak(pattern);
      }
    },
    [activateCard, onRevealChange, onSpeak, pattern],
  );

  const revealLabel = mode === "listening"
    ? "영어 발음을 듣고 정답 보기"
    : !englishVisible
      ? `${pattern.korean}. 영어 발음을 듣고 정답 보기`
      : !koreanVisible
        ? `${pattern.english}. 발음을 듣고 가려진 뜻 보기`
        : `${pattern.english}. 발음 듣기`;

  return (
    <article
      className={`sg-pattern-card sg-density-${density}${revealed ? " is-revealed" : ""}${isSpeaking ? " is-speaking" : ""}${progress?.due ? " is-due" : ""}`}
      data-pattern-id={pattern.id}
      data-mastery={mastery.level}
    >
      <div className="sg-pattern-card__topline">
        {showPatternFormula ? (
          <p className="sg-pattern-card__formula" lang="en">
            {pattern.pattern}
          </p>
        ) : (
          <span aria-hidden="true" />
        )}
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
        </span>
      </div>

      <div
        className="sg-pattern-card__answer"
        role="button"
        tabIndex={0}
        aria-label={revealLabel}
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
            {pattern.english}
          </p>
        ) : (
          <div className="sg-hidden-answer" aria-hidden="true">
            <span>영어를 말해 보세요</span>
          </div>
        )}

        {koreanVisible ? (
          <p className="sg-pattern-card__korean" lang="ko">
            {pattern.korean}
          </p>
        ) : (
          <div className="sg-hidden-answer" aria-hidden="true">
            <span>{mode === "listening" ? "듣고 뜻을 떠올려 보세요" : "뜻을 떠올려 보세요"}</span>
          </div>
        )}
        {answerIsHidden ? (
          <span className="sg-sr-only">정답이 가려져 있습니다. 누르면 발음을 듣고 확인합니다.</span>
        ) : null}
      </div>

      <div className="sg-pattern-card__footer">
        <button
          type="button"
          className={`sg-icon-button sg-card-action${isSpeaking ? " is-active" : ""}`}
          aria-label={`${pattern.english} 발음 듣기`}
          aria-pressed={isSpeaking}
          onClick={() => onSpeak(pattern)}
        >
          <Volume2 aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`sg-icon-button sg-card-action${progress?.bookmarked ? " is-active" : ""}`}
          aria-label={progress?.bookmarked ? "즐겨찾기 해제" : "즐겨찾기에 추가"}
          aria-pressed={Boolean(progress?.bookmarked)}
          onClick={() => onToggleFavorite?.(pattern)}
          disabled={!onToggleFavorite}
        >
          <Bookmark aria-hidden="true" fill={progress?.bookmarked ? "currentColor" : "none"} />
        </button>
        <button
          type="button"
          className="sg-icon-button sg-card-action sg-detail-action"
          aria-label={`${pattern.english} 상세 보기`}
          onClick={() => onOpenDetails?.(pattern)}
          disabled={!onOpenDetails}
        >
          {density === "overview" ? <ChevronRight aria-hidden="true" /> : <Info aria-hidden="true" />}
        </button>
      </div>
    </article>
  );
}

export const PatternCard = memo(PatternCardComponent);
