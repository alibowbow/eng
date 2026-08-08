import { Check, Filter, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { OverlaySheet } from "./OverlaySheet";
import { EMPTY_FILTERS, type FilterOption, type FilterState } from "./types";

export interface FilterSheetProps {
  open: boolean;
  value: FilterState;
  categories: FilterOption[];
  situations: FilterOption[];
  onChange: (filters: FilterState) => void;
  onApply: (filters: FilterState) => void;
  onClose: () => void;
  totalCount: number;
}

const CEFR_OPTIONS: FilterOption[] = ["A1", "A2", "B1", "B2", "C1"].map(
  (level) => ({ id: level, label: level }),
);

const REGISTER_OPTIONS: FilterOption[] = [
  { id: "casual", label: "캐주얼" },
  { id: "neutral", label: "중립" },
  { id: "polite", label: "공손" },
  { id: "formal", label: "격식" },
];

const MASTERY_OPTIONS: FilterOption[] = [
  { id: "unseen", label: "미학습" },
  { id: "mastered", label: "완전 숙달" },
];

function toggleValue(values: string[], id: string) {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

function activeFilterCount(filters: FilterState) {
  return (
    filters.categoryIds.length +
    filters.situationIds.length +
    filters.cefr.length +
    filters.register.length +
    filters.mastery.length +
    Number(filters.favoritesOnly) +
    Number(filters.newOnly)
  );
}

interface ChipGroupProps {
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (id: string) => void;
}

function ChipGroup({ label, options, selected, onToggle }: ChipGroupProps) {
  if (options.length === 0) return null;
  return (
    <fieldset className="sg-filter-group">
      <legend>{label}</legend>
      <div className="sg-filter-chips">
        {options.map((option) => {
          const active = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              className={active ? "is-selected" : undefined}
              aria-pressed={active}
              onClick={() => onToggle(option.id)}
            >
              {active ? <Check aria-hidden="true" /> : null}
              <span>{option.label}</span>
              {option.count !== undefined ? <small>{option.count.toLocaleString("ko-KR")}</small> : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function FilterSheetComponent({
  open,
  value,
  categories,
  situations,
  onChange,
  onApply,
  onClose,
  totalCount,
}: FilterSheetProps) {
  const [draft, setDraft] = useState<FilterState>(value);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const selectedCount = useMemo(() => activeFilterCount(draft), [draft]);

  const updateList = (key: "categoryIds" | "situationIds" | "cefr" | "register" | "mastery", id: string) => {
    setDraft((current) => ({ ...current, [key]: toggleValue(current[key], id) }));
  };

  const apply = () => {
    onChange(draft);
    onApply(draft);
    onClose();
  };

  return (
    <OverlaySheet
      open={open}
      title="검색과 필터"
      description="영어·한국어를 함께 찾고, 원하는 학습 범위만 남깁니다."
      onClose={onClose}
      position="auto"
      size="wide"
      initialFocusRef={searchRef}
      className="sg-filter-sheet"
      footer={
        <>
          <button
            type="button"
            className="sg-secondary-button"
            onClick={() => setDraft({ ...EMPTY_FILTERS })}
            disabled={selectedCount === 0 && !draft.query}
          >
            모두 지우기
          </button>
          <button type="button" className="sg-primary-button" onClick={apply}>
            <Filter aria-hidden="true" />
            {totalCount.toLocaleString("ko-KR")}개 보기
          </button>
        </>
      }
    >
      <label className="sg-search-field">
        <Search aria-hidden="true" />
        <span className="sg-sr-only">표현 검색</span>
        <input
          ref={searchRef}
          type="search"
          value={draft.query}
          onChange={(event) => setDraft((current) => ({ ...current, query: event.target.value }))}
          placeholder="영어, 한국어, 패턴, 예문 검색"
          autoComplete="off"
        />
        {draft.query ? (
          <button
            type="button"
            className="sg-search-field__clear"
            aria-label="검색어 지우기"
            onClick={() => setDraft((current) => ({ ...current, query: "" }))}
          >
            <X aria-hidden="true" />
          </button>
        ) : null}
      </label>

      <div className="sg-filter-quick" aria-label="빠른 필터">
        <SlidersHorizontal aria-hidden="true" />
        <button
          type="button"
          className={`sg-filter-favorite${draft.favoritesOnly ? " is-selected" : ""}`}
          aria-pressed={draft.favoritesOnly}
          onClick={() => setDraft((current) => ({
            ...current,
            favoritesOnly: !current.favoritesOnly,
          }))}
        >
          {draft.favoritesOnly ? <Check aria-hidden="true" /> : <Star aria-hidden="true" />}
          즐겨찾기
        </button>
        <button
          type="button"
          className={draft.newOnly ? "is-selected" : undefined}
          aria-pressed={draft.newOnly}
          onClick={() => setDraft((current) => ({ ...current, newOnly: !current.newOnly }))}
        >
          {draft.newOnly ? <Check aria-hidden="true" /> : null}
          새 표현
        </button>
      </div>

      <ChipGroup
        label="대화 기능"
        options={categories}
        selected={draft.categoryIds}
        onToggle={(id) => updateList("categoryIds", id)}
      />
      <ChipGroup
        label="상황"
        options={situations}
        selected={draft.situationIds}
        onToggle={(id) => updateList("situationIds", id)}
      />
      <div className="sg-filter-columns">
        <ChipGroup
          label="난이도"
          options={CEFR_OPTIONS}
          selected={draft.cefr}
          onToggle={(id) => updateList("cefr", id)}
        />
        <ChipGroup
          label="말투"
          options={REGISTER_OPTIONS}
          selected={draft.register}
          onToggle={(id) => updateList("register", id)}
        />
      </div>
      <ChipGroup
        label="숙련도"
        options={MASTERY_OPTIONS}
        selected={draft.mastery}
        onToggle={(id) => updateList("mastery", id)}
      />
    </OverlaySheet>
  );
}

export const FilterSheet = memo(FilterSheetComponent);
