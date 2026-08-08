// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makePattern } from "../test/fixtures";
import { PatternCard } from "./PatternCard";

afterEach(cleanup);

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

  it("swipes horizontally to a related pattern and suppresses the trailing click", () => {
    const pattern = makePattern();
    const related = makePattern({
      id: "pattern.002",
      familyId: "family.002",
      english: "I'm getting ready to leave.",
      korean: "나갈 준비를 하고 있어.",
      sortKey: "001.002",
    });
    const onActivate = vi.fn();
    const onSpeak = vi.fn();
    function SwipeHarness() {
      const [selected, setSelected] = useState(false);
      return (
        <PatternCard
          pattern={pattern}
          mode="all"
          density="comfortable"
          selected={selected}
          relatedPatterns={[{ pattern: related, label: "같은 기능" }]}
          onActivate={(activatedPattern) => {
            onActivate(activatedPattern);
            setSelected(true);
          }}
          onSpeak={onSpeak}
        />
      );
    }
    render(<SwipeHarness />);

    const answer = screen.getByRole("button", { name: /발음 듣기$/ });
    fireEvent.pointerDown(answer, { pointerId: 2, pointerType: "touch", clientX: 110, clientY: 50 });
    fireEvent.pointerMove(answer, { pointerId: 2, pointerType: "touch", clientX: 62, clientY: 52 });
    fireEvent.pointerUp(answer, { pointerId: 2, pointerType: "touch", clientX: 45, clientY: 52 });
    fireEvent.click(answer);

    expect(onActivate).toHaveBeenCalledWith(pattern);
    expect(onSpeak).toHaveBeenCalledTimes(1);
    expect(onSpeak).toHaveBeenCalledWith(related, undefined, pattern.id);
    expect(screen.getByText(related.english)).toBeInTheDocument();
  });

  it("uses the selected gesture rail for a reply and an example", async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole("button", { name: "대답" }));
    expect(onSpeak).toHaveBeenLastCalledWith(pattern, pattern.replies[0].english, pattern.id);
    expect(screen.getByText(pattern.replies[0].english)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "예문" }));
    expect(onSpeak).toHaveBeenLastCalledWith(pattern, pattern.examples[0].english, pattern.id);
    expect(screen.getByText(pattern.examples[0].english)).toBeInTheDocument();
  });

  it("supports the same connection practice with arrow keys", () => {
    const pattern = makePattern();
    const related = makePattern({
      id: "pattern.002",
      familyId: "family.002",
      english: "I'm ready to go.",
      korean: "갈 준비가 됐어.",
      sortKey: "001.002",
    });
    const onSpeak = vi.fn();
    render(
      <PatternCard
        pattern={pattern}
        mode="all"
        density="comfortable"
        selected
        relatedPatterns={[{ pattern: related, label: "같은 기능" }]}
        onActivate={vi.fn()}
        onSpeak={onSpeak}
      />,
    );

    const answer = screen.getByRole("button", { name: /발음 듣기$/ });
    fireEvent.keyDown(answer, { key: "ArrowRight" });
    expect(onSpeak).toHaveBeenLastCalledWith(related, undefined, pattern.id);
    fireEvent.keyDown(answer, { key: "ArrowUp" });
    expect(onSpeak).toHaveBeenLastCalledWith(related, related.replies[0].english, pattern.id);
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
