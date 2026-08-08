// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppToolbar, type AppToolbarProps } from "./AppToolbar";

afterEach(cleanup);

describe("AppToolbar favorites", () => {
  it("exposes the favorite count and pressed state through one toggle", () => {
    const onToggleFavoritesOnly = vi.fn();
    const props: AppToolbarProps = {
      mode: "all",
      onModeChange: vi.fn(),
      density: "comfortable",
      onDensityChange: vi.fn(),
      totalCount: 520,
      favoriteCount: 3,
      favoritesOnly: false,
      onSearch: vi.fn(),
      onFilters: vi.fn(),
      onRandom: vi.fn(),
      onToggleFavoritesOnly,
      onSettings: vi.fn(),
      onHome: vi.fn(),
    };
    const { rerender } = render(<AppToolbar {...props} />);

    const toggle = screen.getByRole("button", { name: "즐겨찾기 3개만 보기" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(onToggleFavoritesOnly).toHaveBeenCalledTimes(1);

    rerender(<AppToolbar {...props} favoritesOnly />);
    expect(
      screen.getByRole("button", { name: "즐겨찾기 3개, 전체 보기로 전환" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
