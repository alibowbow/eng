import { describe, expect, it } from "vitest";
import type { ConversationPattern } from "../content/schema";
import { makePattern } from "../test/fixtures";
import { buildPracticeVariationDeck } from "./practice-variations";

interface PatternPackFixture {
  patterns: Array<Pick<ConversationPattern, "english" | "korean">>;
}

const packModules = import.meta.glob<{ default: PatternPackFixture }>(
  "../../public/content/packs/*.json",
  { eager: true },
);
const shippedPatterns = Object.values(packModules).flatMap(
  (module) => module.default.patterns,
);

describe("practice variation deck", () => {
  it("builds a lexical swap from the active sentence", () => {
    const pattern = makePattern({
      english: "Do you have a minute?",
      korean: "잠깐 시간 있어요?",
    });

    const deck = buildPracticeVariationDeck(pattern);

    expect(deck.wordSwaps[0]?.english).toBe("Do you have a moment?");
  });

  it("offers a genuine structural paraphrase for a common opener", () => {
    const pattern = makePattern({
      english: "Do you have a minute?",
      korean: "잠깐 시간 있어요?",
    });

    const deck = buildPracticeVariationDeck(pattern);

    expect(deck.paraphrases.map((item) => item.english)).toContain("Have you got a moment?");
  });

  it("paraphrases permission and request frames without another card", () => {
    const permission = buildPracticeVariationDeck(makePattern({ english: "Can I try this on?" }));
    const request = buildPracticeVariationDeck(makePattern({ english: "Could you say that again?" }));

    expect(permission.paraphrases.map((item) => item.english)).toContain("Could I see how this fits?");
    expect(request.paraphrases.map((item) => item.english)).toContain("Could you repeat that?");
  });

  it("keeps the Korean meaning attached to every derived expression", () => {
    const pattern = makePattern({
      english: "I'm about to leave.",
      korean: "이제 막 나가려던 참이야.",
    });

    const deck = buildPracticeVariationDeck(pattern);

    expect([...deck.wordSwaps, ...deck.paraphrases].every((item) => item.korean === pattern.korean)).toBe(true);
  });

  it("uses a contraction expansion as a conservative fallback", () => {
    const deck = buildPracticeVariationDeck(makePattern({ english: "We're almost ready." }));

    expect(deck.wordSwaps.map((item) => item.english)).toContain("We are almost ready.");
  });

  it("never returns the original sentence as a variation", () => {
    const pattern = makePattern({ english: "Thank you so much." });
    const deck = buildPracticeVariationDeck(pattern);

    expect([...deck.wordSwaps, ...deck.paraphrases].map((item) => item.english)).not.toContain(pattern.english);
  });

  it("deduplicates alternatives within each lane", () => {
    const deck = buildPracticeVariationDeck(makePattern({ english: "Maybe we should ask first." }));

    expect(new Set(deck.wordSwaps.map((item) => item.english)).size).toBe(deck.wordSwaps.length);
    expect(new Set(deck.paraphrases.map((item) => item.english)).size).toBe(deck.paraphrases.length);
  });

  it("keeps both gesture lanes distinct for every shipped pattern", () => {
    expect(shippedPatterns).toHaveLength(520);

    for (const pattern of shippedPatterns) {
      const deck = buildPracticeVariationDeck(pattern);

      expect(deck.wordSwaps.length, pattern.english).toBeGreaterThan(0);
      expect(deck.paraphrases.length, pattern.english).toBeGreaterThan(0);
      expect(deck.wordSwaps[0]?.english, pattern.english).not.toBe(
        deck.paraphrases[0]?.english,
      );
    }
  });
});
