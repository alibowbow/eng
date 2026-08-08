// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makePattern } from "../test/fixtures";
import { PatternCard } from "./PatternCard";

afterEach(cleanup);

describe("PatternCard", () => {
  it("reveals only the hidden English answer after a deliberate tap", () => {
    const pattern = makePattern();
    const onRevealChange = vi.fn();
    const onSpeak = vi.fn();
    const { rerender } = render(
      <PatternCard
        pattern={pattern}
        mode="hide-english"
        density="comfortable"
        revealed={false}
        onRevealChange={onRevealChange}
        onSpeak={onSpeak}
      />,
    );

    expect(screen.queryByText(pattern.english)).not.toBeInTheDocument();
    expect(screen.getByText(pattern.korean)).toBeInTheDocument();
    const answer = screen.getByRole("button", { name: /발음을 듣고 정답 보기/ });
    fireEvent.pointerDown(answer, { pointerId: 1, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(answer, { pointerId: 1, clientX: 22, clientY: 23 });
    fireEvent.click(answer);
    expect(onRevealChange).toHaveBeenCalledWith(true);
    expect(onSpeak).toHaveBeenCalledWith(pattern);

    rerender(
      <PatternCard
        pattern={pattern}
        mode="hide-english"
        density="comfortable"
        revealed
        onRevealChange={onRevealChange}
        onSpeak={onSpeak}
      />,
    );
    expect(screen.getByText(pattern.english)).toBeInTheDocument();
  });

  it("does not expose a hidden answer when only the TTS button is pressed", async () => {
    const user = userEvent.setup();
    const pattern = makePattern();
    const onSpeak = vi.fn();
    render(
      <PatternCard
        pattern={pattern}
        mode="listening"
        density="comfortable"
        revealed={false}
        onRevealChange={vi.fn()}
        onSpeak={onSpeak}
      />,
    );

    const cardAnswer = screen.getByRole("button", { name: "영어 발음을 듣고 정답 보기" });
    expect(cardAnswer).not.toHaveAccessibleName(pattern.korean);
    await user.click(screen.getByRole("button", { name: /발음 듣기/ }));
    expect(onSpeak).toHaveBeenCalledWith(pattern);
    expect(screen.queryByText(pattern.english)).not.toBeInTheDocument();
    expect(screen.queryByText(pattern.korean)).not.toBeInTheDocument();
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
