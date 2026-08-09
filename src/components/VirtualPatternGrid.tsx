import { useVirtualizer } from "@tanstack/react-virtual";
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type { ConversationPattern } from "../content/schema";
import { PatternCard } from "./PatternCard";
import type {
  DisplayMode,
  GridDensity,
  PatternProgressView,
} from "./types";

const MIN_COLUMN_WIDTH: Record<GridDensity, number> = {
  large: 248,
  comfortable: 188,
  compact: 158,
  overview: 130,
};

const ESTIMATED_ROW_HEIGHT: Record<GridDensity, number> = {
  large: 156,
  comfortable: 128,
  compact: 100,
  overview: 86,
};

const MOBILE_LAYOUT_BREAKPOINT = 720;

function getGridGap(width: number) {
  return width > 0 && width <= MOBILE_LAYOUT_BREAKPOINT ? 12 : 16;
}

export function getColumnCount(width: number, density: GridDensity) {
  if (width <= 0) return 2;
  const gap = getGridGap(width);
  const calculated = Math.floor((width + gap) / (MIN_COLUMN_WIDTH[density] + gap));
  const mobileMinimum = width < 520 ? 2 : 1;
  return Math.max(mobileMinimum, Math.min(9, calculated));
}

function getRowHeight(density: GridDensity) {
  // These are the largest card heights for each density. Mobile CSS makes
  // cards a few pixels shorter, so using the maximum remains overlap-safe even
  // when the scroller width and the viewport media query cross at different
  // points (for example, inside a split layout).
  return ESTIMATED_ROW_HEIGHT[density];
}

export function resolveInitialScrollIndex(
  patterns: readonly ConversationPattern[],
  initialScrollIndex: number,
  initialScrollPatternId?: string,
) {
  if (patterns.length === 0) return null;

  if (initialScrollPatternId) {
    const matchedIndex = patterns.findIndex(
      (pattern) => pattern.id === initialScrollPatternId,
    );
    // A saved full-grid anchor may not exist in a filtered or random list.
    // Starting at zero is predictable; clamping its old full-list index is not.
    return matchedIndex >= 0 ? matchedIndex : 0;
  }

  const finiteIndex = Number.isFinite(initialScrollIndex)
    ? Math.floor(initialScrollIndex)
    : 0;
  return Math.min(patterns.length - 1, Math.max(0, finiteIndex));
}

function useElementWidth(elementRef: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const update = (nextWidth: number) => {
      startTransition(() => setWidth(Math.round(nextWidth)));
    };
    update(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) update(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [elementRef]);

  return width;
}

export interface VirtualPatternGridProps {
  patterns: ConversationPattern[];
  mode: DisplayMode;
  density: GridDensity;
  getProgress?: (pattern: ConversationPattern) => PatternProgressView | undefined;
  favoriteIds?: ReadonlySet<string>;
  revealedIds?: ReadonlySet<string>;
  selectedPatternId?: string;
  speakingId?: string;
  autoScrollSpeaking?: boolean;
  onRevealChange?: (patternId: string, revealed: boolean) => void;
  onActivatePattern?: (pattern: ConversationPattern) => void;
  onSpeak: (
    pattern: ConversationPattern,
    textOverride?: string,
    visualPatternId?: string,
    options?: { slow?: boolean },
  ) => void;
  onOpenDetails?: (pattern: ConversationPattern) => void;
  onFavoriteChange?: (patternId: string, favorite: boolean) => void;
  initialScrollIndex?: number;
  initialScrollPatternId?: string;
  onVisibleRangeChange?: (startIndex: number, endIndex: number) => void;
  emptyState?: ReactNode;
  ariaLabel?: string;
}

function VirtualPatternGridComponent({
  patterns,
  mode,
  density,
  getProgress,
  favoriteIds,
  revealedIds,
  selectedPatternId,
  speakingId,
  autoScrollSpeaking = true,
  onRevealChange,
  onActivatePattern,
  onSpeak,
  onOpenDetails,
  onFavoriteChange,
  initialScrollIndex = 0,
  onVisibleRangeChange,
  emptyState,
  ariaLabel = "영어 회화 패턴 그리드",
  initialScrollPatternId,
}: VirtualPatternGridProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const autoScrollPausedUntil = useRef(0);
  const initialScrollApplied = useRef(false);
  const canReportVisibleRange = useRef(false);
  const restorationTargetRow = useRef<number | null>(null);
  const restorationTargetPatternIndex = useRef<number | null>(null);
  const restoreIdentityRef = useRef("");
  const lastVisibleStartIndex = useRef<number | null>(null);
  const previousLayout = useRef<{
    columns: number;
    dataIdentity: string;
    gap: number;
    rowHeight: number;
  } | null>(null);
  const [restorationReadyVersion, markRestorationReady] = useState(0);
  const width = useElementWidth(scrollerRef);
  const gap = getGridGap(width);
  const rowHeight = getRowHeight(density);
  const columns = getColumnCount(width, density);
  const rowCount = Math.ceil(patterns.length / columns);
  const [internalRevealed, setInternalRevealed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => rowHeight,
    overscan: 4,
    gap,
    getItemKey: (rowIndex) => {
      const firstPattern = patterns[rowIndex * columns];
      return firstPattern?.id ?? rowIndex;
    },
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const activeRevealedIds = revealedIds ?? internalRevealed;
  const patternIdentity = useMemo(
    () => patterns.map((pattern) => pattern.id).join("\u001f"),
    [patterns],
  );
  const patternIndexById = useMemo(
    () => new Map(patterns.map((pattern, index) => [pattern.id, index])),
    [patterns],
  );
  const restoreIdentity = `${patternIdentity}\u001e${initialScrollPatternId ?? ""}\u001e${initialScrollIndex}`;

  if (restoreIdentityRef.current !== restoreIdentity) {
    restoreIdentityRef.current = restoreIdentity;
    initialScrollApplied.current = false;
    canReportVisibleRange.current = false;
    restorationTargetRow.current = null;
    restorationTargetPatternIndex.current = null;
    lastVisibleStartIndex.current = null;
  }

  useLayoutEffect(() => {
    const nextLayout = { columns, dataIdentity: patternIdentity, gap, rowHeight };
    const previous = previousLayout.current;
    previousLayout.current = nextLayout;
    if (
      previous &&
      previous.columns === columns &&
      previous.dataIdentity === patternIdentity &&
      previous.gap === gap &&
      previous.rowHeight === rowHeight
    ) {
      return;
    }

    const anchorIndex = lastVisibleStartIndex.current;
    rowVirtualizer.measure();
    if (
      anchorIndex !== null &&
      initialScrollApplied.current &&
      canReportVisibleRange.current
    ) {
      const targetRow = Math.floor(anchorIndex / columns);
      canReportVisibleRange.current = false;
      restorationTargetRow.current = targetRow;
      restorationTargetPatternIndex.current = anchorIndex;
      rowVirtualizer.scrollToIndex(targetRow, {
        align: "start",
        behavior: "auto",
      });
    }
  }, [columns, gap, patternIdentity, rowHeight, rowVirtualizer]);

  useEffect(() => {
    if (initialScrollApplied.current || width <= 0 || patterns.length === 0) {
      return;
    }

    const initialPatternIndex = resolveInitialScrollIndex(
      patterns,
      initialScrollIndex,
      initialScrollPatternId,
    );
    if (initialPatternIndex === null) return;

    const targetRow = Math.floor(initialPatternIndex / columns);
    initialScrollApplied.current = true;
    restorationTargetRow.current = targetRow;
    restorationTargetPatternIndex.current = initialPatternIndex;
    rowVirtualizer.scrollToIndex(targetRow, {
      align: "start",
      behavior: "auto",
    });
  }, [
    columns,
    initialScrollIndex,
    initialScrollPatternId,
    patternIdentity,
    patterns,
    rowVirtualizer,
    width,
  ]);

  const visibleStartRow = rowVirtualizer.range?.startIndex;
  const visibleEndRow = rowVirtualizer.range?.endIndex;

  useEffect(() => {
    const targetRow = restorationTargetRow.current;
    if (
      canReportVisibleRange.current ||
      targetRow === null ||
      visibleStartRow === undefined ||
      visibleEndRow === undefined ||
      (visibleStartRow !== targetRow &&
        !(visibleEndRow === rowCount - 1 && targetRow >= visibleStartRow))
    ) {
      return;
    }

    canReportVisibleRange.current = true;
    markRestorationReady((current) => current + 1);
  }, [rowCount, visibleEndRow, visibleStartRow]);

  useEffect(() => {
    if (
      !canReportVisibleRange.current ||
      !speakingId ||
      !autoScrollSpeaking ||
      Date.now() < autoScrollPausedUntil.current
    ) {
      return;
    }
    const patternIndex = patternIndexById.get(speakingId);
    if (patternIndex === undefined) return;
    rowVirtualizer.scrollToIndex(Math.floor(patternIndex / columns), {
      align: "auto",
      behavior: "smooth",
    });
  }, [
    autoScrollSpeaking,
    columns,
    patternIndexById,
    restorationReadyVersion,
    rowVirtualizer,
    speakingId,
  ]);

  const pauseAutoScroll = useCallback(() => {
    autoScrollPausedUntil.current = Date.now() + 5_000;
  }, []);

  const visibleRange = useMemo(() => {
    if (visibleStartRow === undefined || visibleEndRow === undefined) return null;
    return {
      start: visibleStartRow * columns,
      end: Math.min(patterns.length - 1, (visibleEndRow + 1) * columns - 1),
    };
  }, [columns, patterns.length, visibleEndRow, visibleStartRow]);

  useEffect(() => {
    if (!canReportVisibleRange.current || !visibleRange) return;
    const restoredIndex = restorationTargetPatternIndex.current;
    const start =
      restoredIndex !== null &&
      restoredIndex >= visibleRange.start &&
      restoredIndex <= visibleRange.end
        ? restoredIndex
        : visibleRange.start;
    restorationTargetPatternIndex.current = null;
    lastVisibleStartIndex.current = start;
    onVisibleRangeChange?.(start, visibleRange.end);
  }, [onVisibleRangeChange, visibleRange]);

  const handleRevealChange = useCallback(
    (patternId: string, nextRevealed: boolean) => {
      if (!revealedIds) {
        setInternalRevealed((current) => {
          const next = new Set(current);
          if (nextRevealed) next.add(patternId);
          else next.delete(patternId);
          return next;
        });
      }
      onRevealChange?.(patternId, nextRevealed);
    },
    [onRevealChange, revealedIds],
  );

  if (patterns.length === 0) {
    return <div className="sg-grid-empty">{emptyState}</div>;
  }

  return (
    <div
      ref={scrollerRef}
      className={`sg-virtual-grid__scroller sg-density-${density}`}
      role="region"
      aria-label={ariaLabel}
      tabIndex={-1}
      onWheel={pauseAutoScroll}
      onTouchMove={pauseAutoScroll}
      style={{ scrollBehavior: "auto" }}
    >
      <div
        className="sg-virtual-grid__canvas"
        style={{ height: `${rowVirtualizer.getTotalSize() + gap * 2}px` }}
      >
        {virtualRows.map((virtualRow) => {
          const rowStart = virtualRow.index * columns;
          const rowPatterns = patterns.slice(rowStart, rowStart + columns);
          return (
            <div
              key={virtualRow.key}
              className="sg-virtual-grid__row"
              data-index={virtualRow.index}
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: `${gap}px`,
                paddingInline: `${gap}px`,
                paddingTop: 0,
                transform: `translate3d(0, ${virtualRow.start + gap}px, 0)`,
              }}
            >
              {rowPatterns.map((pattern) => (
                <PatternCard
                  key={pattern.id}
                  pattern={pattern}
                  mode={mode}
                  density={density}
                  progress={getProgress?.(pattern)}
                  favorite={favoriteIds?.has(pattern.id)}
                  revealed={activeRevealedIds.has(pattern.id)}
                  selected={selectedPatternId === pattern.id}
                  isSpeaking={speakingId === pattern.id}
                  onRevealChange={handleRevealChange}
                  onActivate={onActivatePattern}
                  onSpeak={onSpeak}
                  onOpenDetails={onOpenDetails}
                  onFavoriteChange={onFavoriteChange}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const VirtualPatternGrid = memo(VirtualPatternGridComponent);
