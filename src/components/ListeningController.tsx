import {
  Gauge,
  Pause,
  Play,
  Repeat2,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
} from "lucide-react";
import { memo } from "react";

export interface ListeningControllerProps {
  playing: boolean;
  paused?: boolean;
  title?: string;
  currentIndex: number;
  total: number;
  speed: number;
  repeat: boolean;
  onPlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onStop: () => void;
  onSpeedChange: (speed: number) => void;
  onRepeatChange: (repeat: boolean) => void;
}

function ListeningControllerComponent({
  playing,
  paused = false,
  title,
  currentIndex,
  total,
  speed,
  repeat,
  onPlayPause,
  onPrevious,
  onNext,
  onStop,
  onSpeedChange,
  onRepeatChange,
}: ListeningControllerProps) {
  const active = playing && !paused;
  const progress = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;
  return (
    <aside className="sg-listening-controller" aria-label="연속 듣기 컨트롤러">
      <div className="sg-listening-controller__now" aria-live="polite">
        <span className={active ? "is-playing" : undefined}><Volume2 aria-hidden="true" /></span>
        <div>
          <small>연속 듣기 {active ? "재생 중" : paused ? "일시정지" : "준비"}</small>
          <strong lang="en">{title || "현재 학습 범위"}</strong>
        </div>
      </div>

      <div className="sg-listening-controller__transport">
        <button type="button" className="sg-icon-button" aria-label="이전 문장" onClick={onPrevious} disabled={currentIndex <= 0}>
          <SkipBack aria-hidden="true" />
        </button>
        <button
          type="button"
          className="sg-play-button"
          aria-label={active ? "일시정지" : "재생"}
          aria-pressed={active}
          onClick={onPlayPause}
        >
          {active ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" fill="currentColor" />}
        </button>
        <button type="button" className="sg-icon-button" aria-label="다음 문장" onClick={onNext} disabled={currentIndex >= total - 1}>
          <SkipForward aria-hidden="true" />
        </button>
        <button type="button" className="sg-icon-button sg-stop-button" aria-label="연속 듣기 종료" onClick={onStop}>
          <Square aria-hidden="true" fill="currentColor" />
        </button>
      </div>

      <div className="sg-listening-controller__options">
        <label>
          <Gauge aria-hidden="true" />
          <span className="sg-sr-only">읽기 속도</span>
          <select value={speed} onChange={(event) => onSpeedChange(Number(event.target.value))} aria-label="읽기 속도">
            <option value={0.65}>0.65×</option>
            <option value={0.8}>0.8×</option>
            <option value={1}>1.0×</option>
            <option value={1.15}>1.15×</option>
          </select>
        </label>
        <button
          type="button"
          className={`sg-repeat-button${repeat ? " is-active" : ""}`}
          aria-pressed={repeat}
          onClick={() => onRepeatChange(!repeat)}
        >
          <Repeat2 aria-hidden="true" />
          <span>반복 {repeat ? "ON" : "OFF"}</span>
        </button>
        <span className="sg-listening-controller__count">
          {Math.min(currentIndex + 1, total).toLocaleString("ko-KR")} / {total.toLocaleString("ko-KR")}
        </span>
      </div>

      <div className="sg-listening-controller__progress" aria-hidden="true">
        <i style={{ width: `${progress}%` }} />
      </div>
    </aside>
  );
}

export const ListeningController = memo(ListeningControllerComponent);
