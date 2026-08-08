// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  db,
  deleteAllData,
  getFavoriteIds,
  resetLearningData,
  setFavorite,
} from "./db";

beforeEach(async () => {
  await deleteAllData();
});

afterEach(async () => {
  await deleteAllData();
});

describe("favorite persistence", () => {
  it("stores, reloads, and removes a favorite through the existing favorites store", async () => {
    await setFavorite("pattern.001", true);

    expect(await getFavoriteIds()).toEqual(new Set(["pattern.001"]));
    expect(await db.get("favorites", "pattern.001")).toMatchObject({
      patternId: "pattern.001",
    });

    await setFavorite("pattern.001", false);

    expect(await getFavoriteIds()).toEqual(new Set());
    expect(await db.get("favorites", "pattern.001")).toBeUndefined();
  });

  it("keeps favorites when learning progress and notes are reset", async () => {
    await setFavorite("pattern.001", true);

    await resetLearningData();

    expect(await getFavoriteIds()).toEqual(new Set(["pattern.001"]));
  });
});
