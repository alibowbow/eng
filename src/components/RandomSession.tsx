import { Shuffle, Target, X } from "lucide-react";
import { memo, useState } from "react";

export interface RandomSessionHeaderProps {
  total: number;
  onExit: () => void;
}

export function RandomSessionHeader({
  total,
  onExit,
}: RandomSessionHeaderProps) {
  return (
    <section className="sg-session-header" aria-label="랜덤 표현 모음">
      <button type="button" className="sg-icon-button" aria-label="랜덤 학습 종료" onClick={onExit}>
        <X aria-hidden="true" />
      </button>
      <div className="sg-session-header__title">
        <Shuffle aria-hidden="true" />
        <strong>랜덤 {total}</strong>
        <span>카드를 누르면 바로 들을 수 있습니다</span>
      </div>
    </section>
  );
}

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
