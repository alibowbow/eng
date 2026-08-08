import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

export const GRID_SECTION_SIZE = 40;

export interface GridSection {
  sectionIndex: number;
  startIndex: number;
  endIndex: number;
  startNumber: number;
  endNumber: number;
  label: string;
}

export interface GridNavigatorProps {
  totalCount: number;
  activeIndex: number;
  onNavigate: (index: number) => void;
  showPositionLabel?: boolean;
}

function normalizeCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function normalizeSectionSize(value: number) {
  return Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : GRID_SECTION_SIZE;
}

function makeSection(
  sectionIndex: number,
  totalCount: number,
  sectionSize: number,
): GridSection {
  const startIndex = sectionIndex * sectionSize;
  const endIndex = Math.min(startIndex + sectionSize - 1, totalCount - 1);
  const startNumber = startIndex + 1;
  const endNumber = endIndex + 1;

  return {
    sectionIndex,
    startIndex,
    endIndex,
    startNumber,
    endNumber,
    label: startNumber === endNumber ? `${startNumber}` : `${startNumber}–${endNumber}`,
  };
}

export function getSectionBounds(
  totalCount: number,
  activeIndex: number,
  sectionSize = GRID_SECTION_SIZE,
): GridSection | null {
  const safeTotalCount = normalizeCount(totalCount);
  if (safeTotalCount === 0) return null;

  const safeSectionSize = normalizeSectionSize(sectionSize);
  const integerIndex = Number.isFinite(activeIndex) ? Math.trunc(activeIndex) : 0;
  const safeActiveIndex = Math.min(Math.max(0, integerIndex), safeTotalCount - 1);
  const sectionIndex = Math.floor(safeActiveIndex / safeSectionSize);

  return makeSection(sectionIndex, safeTotalCount, safeSectionSize);
}

export function getSectionChips(
  totalCount: number,
  sectionSize = GRID_SECTION_SIZE,
): GridSection[] {
  const safeTotalCount = normalizeCount(totalCount);
  if (safeTotalCount === 0) return [];

  const safeSectionSize = normalizeSectionSize(sectionSize);
  const sectionCount = Math.ceil(safeTotalCount / safeSectionSize);
  return Array.from({ length: sectionCount }, (_, sectionIndex) =>
    makeSection(sectionIndex, safeTotalCount, safeSectionSize),
  );
}

export function GridNavigator({
  totalCount,
  activeIndex,
  onNavigate,
  showPositionLabel = true,
}: GridNavigatorProps) {
  const safeTotalCount = normalizeCount(totalCount);
  const safeActiveIndex =
    safeTotalCount === 0
      ? 0
      : Math.min(
          Math.max(0, Number.isFinite(activeIndex) ? Math.trunc(activeIndex) : 0),
          safeTotalCount - 1,
        );
  const sections = getSectionChips(safeTotalCount);
  const activeSection = getSectionBounds(safeTotalCount, safeActiveIndex);
  const previousSection = activeSection
    ? sections[activeSection.sectionIndex - 1] ?? null
    : null;
  const nextSection = activeSection
    ? sections[activeSection.sectionIndex + 1] ?? null
    : null;
  const [jumpValue, setJumpValue] = useState("");
  const [jumpError, setJumpError] = useState("");
  const inputId = useId();
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;

  const handleJump = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const requestedNumber = Number(jumpValue);

    if (
      !Number.isInteger(requestedNumber) ||
      requestedNumber < 1 ||
      requestedNumber > safeTotalCount
    ) {
      setJumpError(
        safeTotalCount === 0
          ? "이동할 표현이 없습니다."
          : `1부터 ${safeTotalCount} 사이의 번호를 입력하세요.`,
      );
      return;
    }

    setJumpError("");
    setJumpValue("");
    onNavigate(requestedNumber - 1);
  };

  return (
    <nav className="sg-grid-nav" aria-label="회화 패턴 구간 이동">
      <div className="sg-grid-nav__heading">
        <div>
          <p className="sg-grid-nav__eyebrow">40개씩 빠르게 이동</p>
          <h2>구간 이동</h2>
        </div>
        {showPositionLabel ? (
          <p className="sg-grid-nav__position" aria-live="polite">
            <strong>{safeTotalCount === 0 ? 0 : safeActiveIndex + 1}</strong>
            <span aria-hidden="true"> / </span>
            <span>{safeTotalCount}</span>
            <span className="sg-grid-nav__position-label"> 현재 위치</span>
          </p>
        ) : null}
      </div>

      <div className="sg-grid-nav__section-row">
        <button
          type="button"
          className="sg-grid-nav__step"
          onClick={() => previousSection && onNavigate(previousSection.startIndex)}
          disabled={!previousSection}
          aria-label={
            previousSection
              ? `이전 ${previousSection.label} 구간으로 이동`
              : "이전 구간 없음"
          }
        >
          <ChevronLeft aria-hidden="true" />
        </button>

        <ol className="sg-grid-nav__chips" aria-label="패턴 구간 목록">
          {sections.map((section) => {
            const isActive = section.sectionIndex === activeSection?.sectionIndex;
            return (
              <li key={section.startIndex} className="sg-grid-nav__chip-item">
                <button
                  type="button"
                  className={`sg-grid-nav__chip${
                    isActive ? " sg-grid-nav__chip--active" : ""
                  }`}
                  aria-current={isActive ? "location" : undefined}
                  aria-label={`${section.label}번 구간${isActive ? ", 현재 구간" : ""}`}
                  onClick={() => onNavigate(section.startIndex)}
                >
                  {section.label}
                </button>
              </li>
            );
          })}
          {sections.length === 0 ? (
            <li className="sg-grid-nav__empty">이동할 표현이 없습니다.</li>
          ) : null}
        </ol>

        <button
          type="button"
          className="sg-grid-nav__step"
          onClick={() => nextSection && onNavigate(nextSection.startIndex)}
          disabled={!nextSection}
          aria-label={
            nextSection ? `다음 ${nextSection.label} 구간으로 이동` : "다음 구간 없음"
          }
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>

      <form className="sg-grid-nav__jump" onSubmit={handleJump} noValidate>
        <label htmlFor={inputId}>번호로 바로 이동</label>
        <div className="sg-grid-nav__jump-controls">
          <input
            id={inputId}
            name="patternNumber"
            type="number"
            inputMode="numeric"
            min={1}
            max={Math.max(1, safeTotalCount)}
            step={1}
            value={jumpValue}
            disabled={safeTotalCount === 0}
            aria-invalid={jumpError ? "true" : undefined}
            aria-describedby={jumpError ? `${helpId} ${errorId}` : helpId}
            placeholder={safeTotalCount === 0 ? "—" : `${safeActiveIndex + 1}`}
            onChange={(event) => {
              setJumpValue(event.target.value);
              if (jumpError) setJumpError("");
            }}
          />
          <button
            type="submit"
            aria-label="입력한 번호로 이동"
            disabled={safeTotalCount === 0}
          >
            <span>이동</span>
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
        <small id={helpId} className="sg-grid-nav__jump-help">
          {safeTotalCount === 0 ? "표현이 추가되면 이동할 수 있어요." : `1–${safeTotalCount} 입력`}
        </small>
        {jumpError ? (
          <small id={errorId} className="sg-grid-nav__jump-error" role="alert">
            {jumpError}
          </small>
        ) : null}
      </form>
    </nav>
  );
}
