import { ArrowLeft, Check, RotateCcw, Shuffle, Target, X } from "lucide-react";
import { memo, useState } from "react";

export interface RandomSessionHeaderProps {
  currentIndex: number;
  total: number;
  answeredCount: number;
  onExit: () => void;
}

export function RandomSessionHeader({
  currentIndex,
  total,
  answeredCount,
  onExit,
}: RandomSessionHeaderProps) {
  const progress = total > 0 ? Math.min(100, (answeredCount / total) * 100) : 0;
  return (
    <section className="sg-session-header" aria-label="랜덤 학습 진행 상황">
      <button type="button" className="sg-icon-button" aria-label="랜덤 학습 종료" onClick={onExit}>
        <X aria-hidden="true" />
      </button>
      <div className="sg-session-header__title">
        <Shuffle aria-hidden="true" />
        <strong>랜덤 {total}</strong>
        <span>{Math.min(currentIndex + 1, total)} / {total}</span>
      </div>
      <div
        className="sg-session-progress"
        role="progressbar"
        aria-label="학습 완료율"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answeredCount}
      >
        <i style={{ width: `${progress}%` }} />
      </div>
      <span className="sg-session-header__answered">판정 {answeredCount}</span>
    </section>
  );
}

export interface RandomSessionResultProps {
  total: number;
  counts: {
    again: number;
    hard: number;
    easy: number;
  };
  onRetryMissed: () => void;
  onRestart: () => void;
  onExit: () => void;
}

function RandomSessionResultComponent({
  total,
  counts,
  onRetryMissed,
  onRestart,
  onExit,
}: RandomSessionResultProps) {
  const retryCount = counts.again + counts.hard;
  return (
    <section className="sg-session-result" aria-labelledby="session-result-title">
      <div className="sg-session-result__icon"><Check aria-hidden="true" /></div>
      <p className="sg-eyebrow">SESSION COMPLETE</p>
      <h2 id="session-result-title">{total}개 완료</h2>
      <p>방금 막힌 표현부터 한 번 더 보면 기억이 선명해집니다.</p>

      <dl className="sg-session-scores">
        <div className="is-easy"><dt>바로 알았음</dt><dd>{counts.easy}</dd></div>
        <div className="is-hard"><dt>애매함</dt><dd>{counts.hard}</dd></div>
        <div className="is-again"><dt>몰랐음</dt><dd>{counts.again}</dd></div>
      </dl>

      <div className="sg-session-result__actions">
        <button
          type="button"
          className="sg-primary-button"
          onClick={onRetryMissed}
          disabled={retryCount === 0}
        >
          <RotateCcw aria-hidden="true" />
          막힌 {retryCount}개 다시
        </button>
        <button type="button" className="sg-secondary-button" onClick={onRestart}>
          <Shuffle aria-hidden="true" /> 새로운 랜덤 {total}
        </button>
        <button type="button" className="sg-text-button" onClick={onExit}>
          <ArrowLeft aria-hidden="true" /> 그리드로 돌아가기
        </button>
      </div>
    </section>
  );
}

export const RandomSessionResult = memo(RandomSessionResultComponent);

export interface RandomSizePickerProps {
  onStart: (count: number) => void;
  availableCount: number;
}

export function RandomSizePicker({ onStart, availableCount }: RandomSizePickerProps) {
  const [customCount, setCustomCount] = useState(20);
  const sizes = [8, 20, 50, 100];
  return (
    <section className="sg-random-picker" aria-labelledby="random-picker-title">
      <Target aria-hidden="true" />
      <div>
        <h2 id="random-picker-title">몇 개를 연습할까요?</h2>
        <p>현재 필터 안에서 겹치지 않게 골라 드립니다.</p>
      </div>
      <div className="sg-random-picker__sizes">
        {sizes.map((size) => (
          <button
            key={size}
            type="button"
            disabled={availableCount < size}
            onClick={() => onStart(size)}
          >
            <strong>{size}</strong><span>개</span>
          </button>
        ))}
      </div>
      <form
        className="sg-random-picker__custom"
        onSubmit={(event) => {
          event.preventDefault();
          onStart(Math.max(1, Math.min(availableCount, customCount)));
        }}
      >
        <label htmlFor="sg-random-count">직접 입력</label>
        <input
          id="sg-random-count"
          type="number"
          min={1}
          max={availableCount}
          value={customCount}
          onChange={(event) => setCustomCount(event.currentTarget.valueAsNumber || 1)}
        />
        <button type="submit" className="sg-secondary-button">시작</button>
      </form>
    </section>
  );
}
