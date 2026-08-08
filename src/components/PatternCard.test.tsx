// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makePattern } from "../test/fixtures";
import { PatternCard } from "./PatternCard";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("PatternCard", () => {
  it("reveals, selects, and speaks a hidden answer with one deliberate tap", () => {
    const pattern = makePattern();
    const onRevealChange = vi.fn();
    const onActivate = vi.fn();
    const onSpeak = vi.fn();
    const { rerender } = render(
      <PatternCard
        pattern={pattern}
        mode="hide-english"
        density="comfortable"
        revealed={false}
        onRevealChange={onRevealChange}
        onActivate={onActivate}
        onSpeak={onSpeak}
      />,
    );

    expect(screen.queryByText(pattern.english)).not.toBeInTheDocument();
    expect(screen.getByText(pattern.korean)).toBeInTheDocument();
    const answer = screen.getByRole("button", { name: /발음을 듣고 정답 보기/ });
    fireEvent.pointerDown(answer, { pointerId: 1, pointerType: "touch", clientX: 20, clientY: 20 });
    fireEvent.pointerUp(answer, { pointerId: 1, pointerType: "touch", clientX: 22, clientY: 23 });
    fireEvent.click(answer);
    expect(onRevealChange).toHaveBeenCalledWith(pattern.id, true);
    expect(onActivate).toHaveBeenCalledWith(pattern);
    expect(onSpeak).toHaveBeenCalledTimes(1);
    expect(onSpeak).toHaveBeenCalledWith(pattern, undefined, pattern.id);

    rerender(
      <PatternCard
        pattern={pattern}
        mode="hide-english"
        density="comfortable"
        revealed
        selected
        onRevealChange={onRevealChange}
        onActivate={onActivate}
        onSpeak={onSpeak}
      />,
    );
    expect(screen.getByText(pattern.english)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /선택됨.*발음 듣기/ })).not.toHaveAttribute("aria-pressed");
  });

  it("uses the card body for speech and renders no standalone volume button", () => {
    const pattern = makePattern();
    const { container } = render(
      <PatternCard
        pattern={pattern}
        mode="all"
        density="comfortable"
        onSpeak={vi.fn()}
      />,
    );

    expect(container.querySelector('button[aria-label*="발음 듣기"]')).not.toBeInTheDocument();
    expect(container.querySelector(".sg-pattern-card__footer")).not.toBeInTheDocument();
  });

  it("keeps controls hidden until hold, locks scrolling, then paraphrases to the right", () => {
    vi.useFakeTimers();
    const pattern = makePattern();
    const onActivate = vi.fn();
    const onSpeak = vi.fn();
    function GestureHarness() {
      const [selected, setSelected] = useState(false);
      return (
        <div className="sg-virtual-grid__scroller" style={{ overflow: "auto" }}>
          <PatternCard
            pattern={pattern}
            mode="all"
            density="comfortable"
            selected={selected}
            onActivate={(activatedPattern) => {
              onActivate(activatedPattern);
              setSelected(true);
            }}
            onSpeak={onSpeak}
          />
        </div>
      );
    }
    const { container } = render(<GestureHarness />);

    const answer = screen.getByRole("button", { name: /발음 듣기$/ });
    expect(container.querySelector(".sg-related-edge")).not.toBeInTheDocument();
    expect(container.querySelector(".sg-gesture-rail")).not.toBeInTheDocument();
    expect(document.querySelector(".sg-radial-menu")).not.toBeInTheDocument();

    fireEvent.pointerDown(answer, { pointerId: 2, pointerType: "touch", clientX: 100, clientY: 60 });
    act(() => vi.advanceTimersByTime(370));
    expect(document.querySelector(".sg-radial-menu")).toBeInTheDocument();
    expect(screen.getByText("대답")).toBeInTheDocument();
    expect(screen.getByText("천천히")).toBeInTheDocument();
    expect(screen.getByText("단어 바꾸기")).toBeInTheDocument();
    expect(screen.getByText("바꿔 말하기")).toBeInTheDocument();
    expect(screen.queryByText("예문")).not.toBeInTheDocument();
    const scroller = container.querySelector<HTMLElement>(".sg-virtual-grid__scroller")!;
    expect(scroller).toHaveClass("is-gesture-locked");
    expect(scroller.style.overflow).toBe("hidden");
    const touchMove = new Event("touchmove", { bubbles: true, cancelable: true });
    window.dispatchEvent(touchMove);
    expect(touchMove.defaultPrevented).toBe(true);

    fireEvent.pointerMove(answer, { pointerId: 2, pointerType: "touch", clientX: 150, clientY: 61 });
    expect(document.querySelector(".sg-radial-menu__action.is-right.is-active")).toBeInTheDocument();
    fireEvent.pointerUp(answer, { pointerId: 2, pointerType: "touch", clientX: 150, clientY: 61 });
    fireEvent.click(answer);

    expect(onActivate).toHaveBeenCalledWith(pattern);
    expect(onSpeak).toHaveBeenCalledTimes(1);
    expect(onSpeak).toHaveBeenCalledWith(pattern, "I'm just getting ready to go.", pattern.id);
    expect(screen.getByText("I'm just getting ready to go.")).toBeInTheDocument();
    expect(document.querySelector(".sg-radial-menu")).not.toBeInTheDocument();
    expect(scroller).not.toHaveClass("is-gesture-locked");
    expect(scroller.style.overflow).toBe("auto");
  });

  it("drags up for a reply and down to replay the current sentence slowly", () => {
    vi.useFakeTimers();
    const pattern = makePattern();
    const onSpeak = vi.fn();
    render(
      <PatternCard
        pattern={pattern}
        mode="all"
        density="comfortable"
        selected
        onActivate={vi.fn()}
        onSpeak={onSpeak}
      />,
    );

    let answer = screen.getByRole("button", { name: /발음 듣기$/ });
    fireEvent.pointerDown(answer, { pointerId: 3, pointerType: "touch", clientX: 100, clientY: 80 });
    act(() => vi.advanceTimersByTime(370));
    fireEvent.pointerMove(answer, { pointerId: 3, pointerType: "touch", clientX: 100, clientY: 36 });
    fireEvent.pointerUp(answer, { pointerId: 3, pointerType: "touch", clientX: 100, clientY: 36 });
    fireEvent.click(answer);
    expect(onSpeak).toHaveBeenLastCalledWith(pattern, pattern.replies[0].english, pattern.id);
    expect(screen.getByText(pattern.replies[0].english)).toBeInTheDocument();

    answer = screen.getByRole("button", { name: /발음 듣기$/ });
    fireEvent.pointerDown(answer, { pointerId: 4, pointerType: "touch", clientX: 100, clientY: 60 });
    act(() => vi.advanceTimersByTime(370));
    fireEvent.pointerMove(answer, { pointerId: 4, pointerType: "touch", clientX: 100, clientY: 104 });
    fireEvent.pointerUp(answer, { pointerId: 4, pointerType: "touch", clientX: 100, clientY: 104 });
    fireEvent.click(answer);
    expect(onSpeak).toHaveBeenLastCalledWith(
      pattern,
      pattern.replies[0].english,
      pattern.id,
      { slow: true },
    );
    expect(screen.getByText(pattern.replies[0].english)).toBeInTheDocument();
  });

  it("supports word swaps and paraphrases with arrow keys", () => {
    const pattern = makePattern();
    const onSpeak = vi.fn();
    render(
      <PatternCard
        pattern={pattern}
        mode="all"
        density="comfortable"
        selected
        onActivate={vi.fn()}
        onSpeak={onSpeak}
      />,
    );

    const answer = screen.getByRole("button", { name: /발음 듣기$/ });
    fireEvent.keyDown(answer, { key: "ArrowLeft" });
    expect(onSpeak).toHaveBeenLastCalledWith(pattern, "I am about to leave.", pattern.id);
    fireEvent.keyDown(answer, { key: "ArrowRight" });
    expect(onSpeak).toHaveBeenLastCalledWith(pattern, "I'm just getting ready to go.", pattern.id);
    fireEvent.keyDown(answer, { key: "ArrowUp" });
    expect(onSpeak).toHaveBeenLastCalledWith(pattern, pattern.replies[0].english, pattern.id);
    fireEvent.keyDown(answer, { key: "ArrowDown" });
    expect(onSpeak).toHaveBeenLastCalledWith(
      pattern,
      pattern.replies[0].english,
      pattern.id,
      { slow: true },
    );
  });

  it("shows a distinct pattern formula but never repeats the same English sentence", () => {
    const duplicate = makePattern({ pattern: "I'm about to leave." });
    const { rerender } = render(
      <PatternCard
        pattern={duplicate}
        mode="all"
        density="comfortable"
        onSpeak={vi.fn()}
      />,
    );

    expect(screen.getAllByText(duplicate.english)).toHaveLength(1);
    expect(screen.queryByText("몰랐음")).not.toBeInTheDocument();
    expect(screen.queryByText("애매함")).not.toBeInTheDocument();
    expect(screen.queryByText("알았음")).not.toBeInTheDocument();

    const distinct = makePattern();
    rerender(
      <PatternCard
        pattern={distinct}
        mode="all"
        density="comfortable"
        onSpeak={vi.fn()}
      />,
    );
    expect(screen.getByText(distinct.pattern)).toBeInTheDocument();
    expect(screen.getByText(distinct.english)).toBeInTheDocument();
  });
});
