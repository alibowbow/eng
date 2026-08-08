import {
  ArrowRight,
  Grid3X3,
  Settings,
  Shuffle,
} from "lucide-react";

export interface HomePageProps {
  totalCount: number;
  learnedCount: number;
  continueIndex: number;
  heroSrc: string;
  onContinue: () => void;
  onOpenGrid: () => void;
  onRandom: () => void;
  onSettings: () => void;
}

const COUNT_FORMATTER = new Intl.NumberFormat("ko-KR");

function normalizeCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function HomePage({
  totalCount,
  learnedCount,
  continueIndex,
  heroSrc,
  onContinue,
  onOpenGrid,
  onRandom,
  onSettings,
}: HomePageProps) {
  const safeTotalCount = normalizeCount(totalCount);
  const safeLearnedCount = Math.min(normalizeCount(learnedCount), safeTotalCount);
  const safeRemainingCount = safeTotalCount - safeLearnedCount;
  const safeContinueIndex =
    safeTotalCount === 0
      ? 0
      : Math.min(Math.max(0, normalizeCount(continueIndex)), safeTotalCount - 1);
  const continueNumber = safeTotalCount === 0 ? 0 : safeContinueIndex + 1;
  const learnedPercent =
    safeTotalCount === 0 ? 0 : Math.round((safeLearnedCount / safeTotalCount) * 100);

  return (
    <div className="sg-home">
      <header className="sg-home__header">
        <div className="sg-home__brand" aria-label="SayGrid 홈">
          <span className="sg-home__brand-mark" aria-hidden="true">
            {Array.from({ length: 9 }, (_, index) => (
              <i key={index} />
            ))}
          </span>
          <span>SayGrid</span>
        </div>
        <button
          type="button"
          className="sg-home__settings"
          aria-label="설정 열기"
          onClick={onSettings}
        >
          <Settings aria-hidden="true" />
        </button>
      </header>

      <main className="sg-home__main">
        <section className="sg-home__hero" aria-labelledby="sg-home-title">
          <div className="sg-home__hero-copy">
            <p className="sg-home__eyebrow">매일 이어지는 회화 지도</p>
            <h1 id="sg-home-title">필요한 영어를 한눈에 익혀요.</h1>
            <p className="sg-home__intro">
              짧은 패턴을 구간별로 훑고, 가리고, 반복하며 내 표현으로 만드세요.
            </p>

            <div className="sg-home__primary-actions">
              <button
                type="button"
                className="sg-home__continue"
                onClick={onContinue}
                disabled={safeTotalCount === 0}
              >
                <span>
                  <strong>이어서 학습</strong>
                  <small>
                    {safeTotalCount === 0
                      ? "학습할 표현이 없어요"
                      : `${COUNT_FORMATTER.format(continueNumber)}번부터`}
                  </small>
                </span>
                <ArrowRight aria-hidden="true" />
              </button>
              <button type="button" className="sg-home__all-grid" onClick={onOpenGrid}>
                <Grid3X3 aria-hidden="true" />
                <span>전체 그리드</span>
              </button>
            </div>
          </div>

          <figure className="sg-home__hero-art" aria-hidden="true">
            <img src={heroSrc} alt="" decoding="async" fetchPriority="high" />
          </figure>
        </section>

        <section className="sg-home__dashboard" aria-label="학습 현황과 빠른 시작">
          <div className="sg-home__progress-card">
            <div className="sg-home__progress-heading">
              <div>
                <p>나의 학습</p>
                <strong>{learnedPercent}%</strong>
              </div>
              <span>
                {COUNT_FORMATTER.format(safeLearnedCount)} / {COUNT_FORMATTER.format(safeTotalCount)}
              </span>
            </div>
            <progress
              className="sg-home__progress-bar"
              max={Math.max(1, safeTotalCount)}
              value={safeLearnedCount}
              aria-label={`전체 ${safeTotalCount}개 중 ${safeLearnedCount}개 학습`}
            />
            <dl className="sg-home__stats">
              <div>
                <dt>전체 패턴</dt>
                <dd>{COUNT_FORMATTER.format(safeTotalCount)}</dd>
              </div>
              <div>
                <dt>학습 완료</dt>
                <dd>{COUNT_FORMATTER.format(safeLearnedCount)}</dd>
              </div>
              <div>
                <dt>남은 패턴</dt>
                <dd>{COUNT_FORMATTER.format(safeRemainingCount)}</dd>
              </div>
            </dl>
          </div>

          <div className="sg-home__quick-actions" aria-label="학습 방식 선택">
            <button type="button" className="sg-home__quick-action" onClick={onRandom}>
              <span className="sg-home__quick-icon" aria-hidden="true">
                <Shuffle />
              </span>
              <span>
                <strong>랜덤 연습</strong>
                <small>익숙한 순서를 벗어나 점검하기</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </button>
            <button type="button" className="sg-home__quick-action" onClick={onSettings}>
              <span className="sg-home__quick-icon" aria-hidden="true">
                <Settings />
              </span>
              <span>
                <strong>학습 환경</strong>
                <small>음성과 화면을 나에게 맞추기</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
