import { describe, expect, it } from "vitest";
import { getSectionBounds, getSectionChips } from "./GridNavigator";

describe("GridNavigator section helpers", () => {
  it("returns no bounds or chips for an empty grid", () => {
    expect(getSectionBounds(0, 0)).toBeNull();
    expect(getSectionChips(0)).toEqual([]);
    expect(getSectionChips(-1)).toEqual([]);
  });

  it("uses zero-based indices and one-based labels at the first boundary", () => {
    expect(getSectionBounds(40, 0)).toMatchObject({
      sectionIndex: 0,
      startIndex: 0,
      endIndex: 39,
      startNumber: 1,
      endNumber: 40,
      label: "1–40",
    });
    expect(getSectionBounds(40, 39)?.label).toBe("1–40");
  });

  it("starts a second section when the total reaches 41", () => {
    const chips = getSectionChips(41);

    expect(chips).toHaveLength(2);
    expect(chips[0]).toMatchObject({ startIndex: 0, endIndex: 39, label: "1–40" });
    expect(chips[1]).toMatchObject({ startIndex: 40, endIndex: 40, label: "41" });
    expect(getSectionBounds(41, 40)).toEqual(chips[1]);
  });

  it("creates thirteen complete sections for all 520 patterns", () => {
    const chips = getSectionChips(520);

    expect(chips).toHaveLength(13);
    expect(chips.at(-1)).toMatchObject({
      sectionIndex: 12,
      startIndex: 480,
      endIndex: 519,
      startNumber: 481,
      endNumber: 520,
      label: "481–520",
    });
    expect(getSectionBounds(520, 519)).toEqual(chips[12]);
  });

  it("clamps out-of-range visible indices to a valid section", () => {
    expect(getSectionBounds(520, -10)?.label).toBe("1–40");
    expect(getSectionBounds(520, 520)?.label).toBe("481–520");
  });
});
