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
    const { rerender } = render(
      <PatternCard
        pattern={pattern}
        mode="hide-english"
        density="comfortable"
        revealed={false}
        onRevealChange={onRevealChange}
        onSpeak={vi.fn()}
      />,
    );

    expect(screen.queryByText(pattern.english)).not.toBeInTheDocument();
    expect(screen.getByText(pattern.korean)).toBeInTheDocument();
    const answer = screen.getByRole("button", { name: /정답 보기/ });
    fireEvent.pointerDown(answer, { pointerId: 1, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(answer, { pointerId: 1, clientX: 22, clientY: 23 });
    expect(onRevealChange).toHaveBeenCalledWith(true);

    rerender(
      <PatternCard
        pattern={pattern}
        mode="hide-english"
        density="comfortable"
        revealed
        onRevealChange={onRevealChange}
        onSpeak={vi.fn()}
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

    await user.click(screen.getByRole("button", { name: /발음 듣기/ }));
    expect(onSpeak).toHaveBeenCalledWith(pattern);
    expect(screen.queryByText(pattern.english)).not.toBeInTheDocument();
    expect(screen.queryByText(pattern.korean)).not.toBeInTheDocument();
  });

  it("shows the three explicit judgements only after checking the answer", async () => {
    const user = userEvent.setup();
    const pattern = makePattern();
    const onAssess = vi.fn();
    render(
      <PatternCard
        pattern={pattern}
        mode="hide-korean"
        density="comfortable"
        revealed
        onRevealChange={vi.fn()}
        onSpeak={vi.fn()}
        onAssess={onAssess}
      />,
    );

    await user.click(screen.getByRole("button", { name: /애매함/ }));
    expect(onAssess).toHaveBeenCalledWith(pattern, "hard");
    expect(screen.getByRole("button", { name: /몰랐음/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /알았음/ })).toBeInTheDocument();
  });
});
