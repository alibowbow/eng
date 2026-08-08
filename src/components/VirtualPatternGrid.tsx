import { useVirtualizer } from "@tanstack/react-virtual";
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
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
  comfortable: 116,
  compact: 100,
  overview: 86,
};

function getColumnCount(width: number, density: GridDensity) {
  if (width <= 0) return 2;
  const gap = width < 600 ? 6 : 8;
  const calculated = Math.floor((width + gap) / (MIN_COLUMN_WIDTH[density] + gap));
  const mobileMinimum = width < 520 ? 2 : 1;
  return Math.max(mobileMinimum, Math.min(9, calculated));
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
  initialScrollIndex?: number;
  onVisibleRangeChange?: (startIndex: number, endIndex: number) => void;
  emptyState?: ReactNode;
  ariaLabel?: string;
}

function VirtualPatternGridComponent({
  patterns,
  mode,
  density,
  getProgress,
  revealedIds,
  selectedPatternId,
  speakingId,
  autoScrollSpeaking = true,
  onRevealChange,
  onActivatePattern,
  onSpeak,
  onOpenDetails,
  initialScrollIndex = 0,
  onVisibleRangeChange,
  emptyState,
  ariaLabel = "영어 회화 패턴 그리드",
}: VirtualPatternGridProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const autoScrollPausedUntil = useRef(0);
  const initialScrollApplied = useRef(false);
  const width = useElementWidth(scrollerRef);
  const columns = getColumnCount(width, density);
  const rowCount = Math.ceil(patterns.length / columns);
  const [internalRevealed, setInternalRevealed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT[density],
    overscan: 4,
    gap: width < 600 ? 6 : 8,
    getItemKey: (rowIndex) => {
      const firstPattern = patterns[rowIndex * columns];
      return firstPattern?.id ?? rowIndex;
    },
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const activeRevealedIds = revealedIds ?? internalRevealed;

  useEffect(() => {
    rowVirtualizer.measure();
  }, [columns, density, rowVirtualizer]);

  useEffect(() => {
    if (initialScrollApplied.current || width <= 0 || patterns.length === 0) return;
    initialScrollApplied.current = true;
    if (initialScrollIndex <= 0) return;
    rowVirtualizer.scrollToIndex(Math.floor(initialScrollIndex / columns), {
      align: "start",
    });
  }, [columns, initialScrollIndex, patterns.length, rowVirtualizer, width]);

  useEffect(() => {
    if (!speakingId || !autoScrollSpeaking || Date.now() < autoScrollPausedUntil.current) return;
    const patternIndex = patterns.findIndex((pattern) => pattern.id === speakingId);
    if (patternIndex < 0) return;
    rowVirtualizer.scrollToIndex(Math.floor(patternIndex / columns), {
      align: "auto",
      behavior: "smooth",
    });
  }, [autoScrollSpeaking, columns, patterns, rowVirtualizer, speakingId]);

  const pauseAutoScroll = useCallback(() => {
    autoScrollPausedUntil.current = Date.now() + 5_000;
  }, []);

  const visibleRange = useMemo(() => {
    const firstRow = virtualRows.at(0)?.index;
    const lastRow = virtualRows.at(-1)?.index;
    if (firstRow === undefined || lastRow === undefined) return null;
    return {
      start: firstRow * columns,
      end: Math.min(patterns.length - 1, (lastRow + 1) * columns - 1),
    };
  }, [columns, patterns.length, virtualRows]);

  useEffect(() => {
    if (visibleRange) onVisibleRangeChange?.(visibleRange.start, visibleRange.end);
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
    >
      <div
        className="sg-virtual-grid__canvas"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {virtualRows.map((virtualRow) => {
          const rowStart = virtualRow.index * columns;
          const rowPatterns = patterns.slice(rowStart, rowStart + columns);
          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              className="sg-virtual-grid__row"
              data-index={virtualRow.index}
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {rowPatterns.map((pattern) => (
                <PatternCard
                  key={pattern.id}
                  pattern={pattern}
                  mode={mode}
                  density={density}
                  progress={getProgress?.(pattern)}
                  revealed={activeRevealedIds.has(pattern.id)}
                  selected={selectedPatternId === pattern.id}
                  isSpeaking={speakingId === pattern.id}
                  onRevealChange={handleRevealChange}
                  onActivate={onActivatePattern}
                  onSpeak={onSpeak}
                  onOpenDetails={onOpenDetails}
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
