// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makePattern } from "../test/fixtures";
import {
  getColumnCount,
  resolveInitialScrollIndex,
  VirtualPatternGrid,
} from "./VirtualPatternGrid";

const virtual = vi.hoisted(() => {
  const state = {
    range: { startIndex: 0, endIndex: 1 } as {
      startIndex: number;
      endIndex: number;
    } | null,
    items: [
      { index: 0, key: "row-0", start: 0, end: 116, size: 116, lane: 0 },
      { index: 1, key: "row-1", start: 124, end: 240, size: 116, lane: 0 },
    ],
    totalSize: 3_100,
    options: undefined as unknown,
  };
  const measure = vi.fn();
  const scrollToIndex = vi.fn();
  const instance = {
    get range() {
      return state.range;
    },
    getVirtualItems: () => state.items,
    getTotalSize: () => state.totalSize,
    measure,
    scrollToIndex,
  };

  return { instance, measure, scrollToIndex, state };
});

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: vi.fn((options: unknown) => {
    virtual.state.options = options;
    return virtual.instance;
  }),
}));

let elementWidth = 800;

function makePatterns(count: number) {
  return Array.from({ length: count }, (_, index) =>
    makePattern({
      id: `pattern.${String(index).padStart(3, "0")}`,
      familyId: `family.${String(index).padStart(3, "0")}`,
      english: `Pattern ${index}`,
      sortKey: `${String(index + 1).padStart(3, "0")}.001.001`,
    }),
  );
}

function setVirtualRows(startIndex: number, endIndex: number, overscan = 0) {
  virtual.state.range = { startIndex, endIndex };
  virtual.state.items = Array.from(
    { length: endIndex - startIndex + 1 + overscan * 2 },
    (_, offset) => {
      const index = Math.max(0, startIndex - overscan) + offset;
      return {
        index,
        key: `row-${index}`,
        start: index * 124,
        end: index * 124 + 116,
        size: 116,
        lane: 0,
      };
    },
  );
}

beforeEach(() => {
  elementWidth = 800;
  virtual.measure.mockReset();
  virtual.scrollToIndex.mockReset();
  virtual.state.range = { startIndex: 0, endIndex: 1 };
  virtual.state.totalSize = 3_100;
  setVirtualRows(0, 1);

  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
    width: elementWidth,
    height: 600,
    top: 0,
    right: elementWidth,
    bottom: 600,
    left: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));

  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("VirtualPatternGrid helpers", () => {
  it("keeps stable column counts around the tablet layout width", () => {
    expect(getColumnCount(560, "large")).toBe(2);
    expect(getColumnCount(560, "comfortable")).toBe(2);
    expect(getColumnCount(560, "compact")).toBe(3);
    expect(getColumnCount(560, "overview")).toBe(4);
    expect(getColumnCount(0, "comfortable")).toBe(2);
  });

  it("resolves saved IDs against filtered and random ordering", () => {
    const patterns = makePatterns(81);
    const shuffled = [patterns[80], patterns[40], patterns[0]];

    expect(resolveInitialScrollIndex(shuffled, 40, patterns[40].id)).toBe(1);
    expect(resolveInitialScrollIndex(shuffled, 40, "missing-pattern")).toBe(0);
    expect(resolveInitialScrollIndex([], 40, patterns[40].id)).toBeNull();
  });

  it("clamps indexes without rounding across 40-item section boundaries", () => {
    const patterns = makePatterns(81);

    expect(resolveInitialScrollIndex(patterns, 39)).toBe(39);
    expect(resolveInitialScrollIndex(patterns, 40)).toBe(40);
    expect(resolveInitialScrollIndex(patterns, 80)).toBe(80);
    expect(resolveInitialScrollIndex(patterns, 81)).toBe(80);
    expect(resolveInitialScrollIndex(patterns, -1)).toBe(0);
    expect(resolveInitialScrollIndex(patterns, Number.NaN)).toBe(0);
  });
});

describe("VirtualPatternGrid restoration", () => {
  it("restores once and never reports row zero before the saved row is visible", async () => {
    const patterns = makePatterns(81);
    const onVisibleRangeChange = vi.fn();
    const props = {
      patterns,
      mode: "all" as const,
      density: "comfortable" as const,
      onSpeak: vi.fn(),
      initialScrollPatternId: patterns[40].id,
      initialScrollIndex: 0,
      onVisibleRangeChange,
    };
    const { rerender } = render(<VirtualPatternGrid {...props} />);

    await waitFor(() =>
      expect(virtual.scrollToIndex).toHaveBeenCalledWith(10, {
        align: "start",
        behavior: "auto",
      }),
    );
    expect(onVisibleRangeChange).not.toHaveBeenCalled();

    // The virtual list renders overscan rows, but persistence must use its
    // actual visible range so refreshes do not drift upward on every load.
    setVirtualRows(10, 11, 2);
    rerender(<VirtualPatternGrid {...props} selectedPatternId="rerender-1" />);

    await waitFor(() =>
      expect(onVisibleRangeChange).toHaveBeenLastCalledWith(40, 47),
    );
    expect(onVisibleRangeChange).not.toHaveBeenCalledWith(0, expect.any(Number));

    rerender(<VirtualPatternGrid {...props} selectedPatternId="rerender-2" />);
    expect(virtual.scrollToIndex).toHaveBeenCalledTimes(1);
  });

  it("keeps a 40-item navigation boundary when it falls inside a grid row", async () => {
    elementWidth = 760; // comfortable density uses three columns here.
    const patterns = makePatterns(81);
    const onVisibleRangeChange = vi.fn();
    const props = {
      patterns,
      mode: "all" as const,
      density: "comfortable" as const,
      onSpeak: vi.fn(),
      initialScrollIndex: 40,
      onVisibleRangeChange,
    };
    const { rerender } = render(<VirtualPatternGrid {...props} />);

    await waitFor(() =>
      expect(virtual.scrollToIndex).toHaveBeenCalledWith(13, {
        align: "start",
        behavior: "auto",
      }),
    );
    setVirtualRows(13, 14);
    rerender(<VirtualPatternGrid {...props} selectedPatternId="section-ready" />);

    await waitFor(() =>
      expect(onVisibleRangeChange).toHaveBeenLastCalledWith(40, 44),
    );
    expect(onVisibleRangeChange).not.toHaveBeenCalledWith(39, 44);
  });

  it("does not let speaking auto-scroll race refresh restoration", async () => {
    const patterns = makePatterns(81);
    const props = {
      patterns,
      mode: "all" as const,
      density: "comfortable" as const,
      onSpeak: vi.fn(),
      initialScrollPatternId: patterns[40].id,
      speakingId: patterns[64].id,
      autoScrollSpeaking: true,
    };
    const { rerender } = render(<VirtualPatternGrid {...props} />);

    await waitFor(() =>
      expect(virtual.scrollToIndex).toHaveBeenCalledWith(10, {
        align: "start",
        behavior: "auto",
      }),
    );
    expect(virtual.scrollToIndex).not.toHaveBeenCalledWith(16, {
      align: "auto",
      behavior: "smooth",
    });

    setVirtualRows(10, 11);
    rerender(<VirtualPatternGrid {...props} selectedPatternId="restore-ready" />);
    await waitFor(() =>
      expect(virtual.scrollToIndex).toHaveBeenCalledWith(16, {
        align: "auto",
        behavior: "smooth",
      }),
    );

    fireEvent.wheel(screen.getByRole("region"));
    rerender(
      <VirtualPatternGrid
        {...props}
        speakingId={patterns[68].id}
        selectedPatternId="user-scrolled"
      />,
    );
    expect(virtual.scrollToIndex).not.toHaveBeenCalledWith(17, {
      align: "auto",
      behavior: "smooth",
    });
  });

  it("resets row metrics on density changes and keeps the visible anchor", async () => {
    const patterns = makePatterns(20);
    const onVisibleRangeChange = vi.fn();
    const { rerender } = render(
      <VirtualPatternGrid
        patterns={patterns}
        mode="all"
        density="comfortable"
        onSpeak={vi.fn()}
        onVisibleRangeChange={onVisibleRangeChange}
      />,
    );

    await waitFor(() => expect(onVisibleRangeChange).toHaveBeenCalled());
    const measuresBeforeDensityChange = virtual.measure.mock.calls.length;

    rerender(
      <VirtualPatternGrid
        patterns={patterns}
        mode="all"
        density="large"
        onSpeak={vi.fn()}
        onVisibleRangeChange={onVisibleRangeChange}
      />,
    );

    expect(virtual.measure.mock.calls.length).toBeGreaterThan(
      measuresBeforeDensityChange,
    );
    expect(virtual.scrollToIndex).toHaveBeenLastCalledWith(0, {
      align: "start",
      behavior: "auto",
    });
  });

  it("remaps the saved ID after filtered data changes or back navigation", async () => {
    const patterns = makePatterns(81);
    const anchor = patterns[40];
    const onVisibleRangeChange = vi.fn();
    const props = {
      mode: "all" as const,
      density: "comfortable" as const,
      onSpeak: vi.fn(),
      initialScrollPatternId: anchor.id,
      onVisibleRangeChange,
    };
    const { rerender } = render(
      <VirtualPatternGrid {...props} patterns={patterns} />,
    );

    await waitFor(() =>
      expect(virtual.scrollToIndex).toHaveBeenLastCalledWith(10, {
        align: "start",
        behavior: "auto",
      }),
    );
    setVirtualRows(10, 11);
    rerender(
      <VirtualPatternGrid
        {...props}
        patterns={patterns}
        selectedPatternId="full-list-ready"
      />,
    );
    await waitFor(() =>
      expect(onVisibleRangeChange).toHaveBeenLastCalledWith(40, 47),
    );

    onVisibleRangeChange.mockClear();
    const filtered = [
      patterns[0],
      patterns[1],
      patterns[2],
      patterns[3],
      anchor,
      ...patterns.slice(41, 56),
    ];
    rerender(<VirtualPatternGrid {...props} patterns={filtered} />);

    await waitFor(() =>
      expect(virtual.scrollToIndex).toHaveBeenLastCalledWith(1, {
        align: "start",
        behavior: "auto",
      }),
    );
    expect(onVisibleRangeChange).not.toHaveBeenCalled();

    setVirtualRows(1, 2);
    rerender(
      <VirtualPatternGrid
        {...props}
        patterns={filtered}
        selectedPatternId="filtered-list-ready"
      />,
    );
    await waitFor(() =>
      expect(onVisibleRangeChange).toHaveBeenLastCalledWith(4, 11),
    );
  });

  it("uses fixed row offsets and neutralizes first-child measurement changes", async () => {
    render(
      <VirtualPatternGrid
        patterns={makePatterns(20)}
        mode="all"
        density="comfortable"
        onSpeak={vi.fn()}
      />,
    );

    const scroller = await screen.findByRole("region", {
      name: "영어 회화 패턴 그리드",
    });
    const firstRow = scroller.querySelector<HTMLElement>(
      '.sg-virtual-grid__row[data-index="0"]',
    );
    const canvas = scroller.querySelector<HTMLElement>(
      ".sg-virtual-grid__canvas",
    );

    expect(scroller).toHaveStyle({ scrollBehavior: "auto" });
    expect(firstRow).toHaveStyle({
      gap: "16px",
      paddingInline: "16px",
      paddingTop: "0px",
      transform: "translate3d(0, 16px, 0)",
    });
    expect(canvas).toHaveStyle({ height: "3132px" });
  });

  it("renders an empty state without restoring or persisting a phantom range", () => {
    const onVisibleRangeChange = vi.fn();
    render(
      <VirtualPatternGrid
        patterns={[]}
        mode="all"
        density="comfortable"
        onSpeak={vi.fn()}
        initialScrollIndex={40}
        onVisibleRangeChange={onVisibleRangeChange}
        emptyState={<p>No patterns</p>}
      />,
    );

    expect(screen.getByText("No patterns")).toBeInTheDocument();
    expect(virtual.scrollToIndex).not.toHaveBeenCalled();
    expect(onVisibleRangeChange).not.toHaveBeenCalled();
  });
});
