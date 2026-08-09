// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppToolbar, type AppToolbarProps } from "./AppToolbar";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

afterEach(cleanup);

describe("AppToolbar", () => {
  it("uses solid menu surfaces instead of washed-out gradients", () => {
    const toolbarRule = styles.match(/\.sg-toolbar\s*\{[^{}]*\}/)?.[0] ?? "";
    const activeModeRule = styles.match(/\.sg-mode-switch button\.is-active\s*\{[^{}]*\}/)?.[0] ?? "";

    expect(toolbarRule).toContain("background: var(--sg-toolbar-surface)");
    expect(toolbarRule).not.toContain("gradient");
    expect(activeModeRule).toContain("background: var(--sg-toolbar-active)");
    expect(activeModeRule).not.toContain("gradient");
  });

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
