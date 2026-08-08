import {
  Clock3,
  Eye,
  EyeOff,
  Filter,
  Grid3X3,
  Headphones,
  Home,
  Languages,
  RefreshCw,
  Search,
  Settings,
  Shuffle,
} from "lucide-react";
import { memo } from "react";
import type { DisplayMode, GridDensity } from "./types";

export interface AppToolbarProps {
  mode: DisplayMode;
  onModeChange: (mode: DisplayMode) => void;
  density: GridDensity;
  onDensityChange: (density: GridDensity) => void;
  totalCount: number;
  dueCount: number;
  activeFilterCount?: number;
  onSearch: () => void;
  onFilters: () => void;
  onRandom: (count: number) => void;
  onReview: () => void;
  onSettings: () => void;
  onHome: () => void;
  allRevealed?: boolean;
  onToggleRevealAll?: () => void;
}

const MODE_OPTIONS: Array<{
  value: DisplayMode;
  label: string;
  shortLabel: string;
  Icon: typeof Eye;
}> = [
  { value: "all", label: "모두 보기", shortLabel: "전체", Icon: Eye },
  { value: "hide-english", label: "영어 가리기", shortLabel: "영어 가리기", Icon: Languages },
  { value: "hide-korean", label: "한국어 가리기", shortLabel: "한국어 가리기", Icon: EyeOff },
  { value: "listening", label: "듣기 전용", shortLabel: "듣기", Icon: Headphones },
];

function AppToolbarComponent({
  mode,
  onModeChange,
  density,
  onDensityChange,
  totalCount,
  dueCount,
  activeFilterCount = 0,
  onSearch,
  onFilters,
  onRandom,
  onReview,
  onSettings,
  onHome,
  allRevealed = false,
  onToggleRevealAll,
}: AppToolbarProps) {
  return (
    <header className="sg-toolbar">
      <div className="sg-toolbar__primary">
        <button className="sg-wordmark" type="button" onClick={onHome} aria-label="SayGrid 홈으로 이동">
          <span className="sg-wordmark__mark" aria-hidden="true">
            {Array.from({ length: 9 }, (_, index) => (
              <i key={index} />
            ))}
          </span>
          <span>SayGrid</span>
        </button>

        <div className="sg-toolbar__rail">
          <div className="sg-mode-switch" role="group" aria-label="가리기 모드">
            {MODE_OPTIONS.map(({ value, label, shortLabel, Icon }) => (
              <button
                key={value}
                type="button"
                className={mode === value ? "is-active" : undefined}
                aria-pressed={mode === value}
                title={label}
                onClick={() => onModeChange(value)}
              >
                <Icon aria-hidden="true" />
                <span>{shortLabel}</span>
              </button>
            ))}
          </div>

          <div className="sg-toolbar__actions">
            <button type="button" className="sg-toolbar-button" onClick={() => onRandom(20)}>
              <Shuffle aria-hidden="true" />
              <span>랜덤 20</span>
            </button>
            <button type="button" className="sg-toolbar-button" onClick={onReview}>
              <Clock3 aria-hidden="true" />
              <span>복습</span>
              {dueCount > 0 ? <b aria-label={`복습 예정 ${dueCount}개`}>{dueCount}</b> : null}
            </button>
            <button type="button" className="sg-toolbar-button is-search" onClick={onSearch}>
              <Search aria-hidden="true" />
              <span>검색</span>
              <kbd aria-hidden="true">/</kbd>
            </button>
            <button type="button" className="sg-toolbar-button" onClick={onFilters}>
              <Filter aria-hidden="true" />
              <span>필터</span>
              {activeFilterCount > 0 ? (
                <b aria-label={`적용된 필터 ${activeFilterCount}개`}>{activeFilterCount}</b>
              ) : null}
            </button>
          </div>
        </div>
      </div>

      <div className="sg-toolbar__secondary">
        <button type="button" className="sg-icon-button" aria-label="홈으로 이동" onClick={onHome}>
          <Home aria-hidden="true" />
        </button>
        <p className="sg-result-count" aria-live="polite">
          <strong>{totalCount.toLocaleString("ko-KR")}</strong>
          <span>개 패턴</span>
        </p>
        {onToggleRevealAll ? (
          <button type="button" className="sg-quiet-button" onClick={onToggleRevealAll}>
            {allRevealed ? <RefreshCw aria-hidden="true" /> : <Eye aria-hidden="true" />}
            <span>{allRevealed ? "전체 다시 가리기" : "전체 정답 보기"}</span>
          </button>
        ) : null}
        <label className="sg-density-select">
          <Grid3X3 aria-hidden="true" />
          <span className="sg-sr-only">그리드 밀도</span>
          <select
            value={density}
            onChange={(event) => onDensityChange(event.target.value as GridDensity)}
            aria-label="그리드 밀도"
          >
            <option value="large">크게 보기</option>
            <option value="comfortable">기본 보기</option>
            <option value="compact">빠르게 보기</option>
            <option value="overview">전체 조망</option>
          </select>
        </label>
        <button type="button" className="sg-icon-button" aria-label="설정 열기" onClick={onSettings}>
          <Settings aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

export const AppToolbar = memo(AppToolbarComponent);
