import { describe, expect, it } from "vitest";
import type { ConversationPattern } from "../content/schema";
import { makePattern } from "../test/fixtures";
import {
  buildPracticeVariationDeck,
  isMeaningfulWordSwap,
} from "./practice-variations";

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

function wordSwapsFor(english: string): string[] {
  return buildPracticeVariationDeck(makePattern({ english })).wordSwaps.map(
    (item) => item.english,
  );
}

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

  it("keeps a lexical alternative instead of expanding a contraction", () => {
    const deck = buildPracticeVariationDeck(makePattern({ english: "We're almost ready." }));

    expect(deck.wordSwaps.map((item) => item.english)).toContain("We're nearly ready.");
    expect(deck.wordSwaps.map((item) => item.english)).not.toContain("We are almost ready.");
  });

  it("rejects contraction, auxiliary, casing, punctuation, and inflection-only edits", () => {
    expect(isMeaningfulWordSwap("I'm ready.", "I am ready.")).toBe(false);
    expect(isMeaningfulWordSwap("Could you help me?", "Can you help me?")).toBe(false);
    expect(isMeaningfulWordSwap("Ready?", "READY!")).toBe(false);
    expect(isMeaningfulWordSwap("What brings you here?", "What brought you here?")).toBe(false);
    expect(isMeaningfulWordSwap("I think it's worth a try.", "I think it's worth trying.")).toBe(false);
  });

  it("accepts an actual content-word substitution", () => {
    expect(isMeaningfulWordSwap("Could you help me?", "Could you assist me?")).toBe(true);
    expect(isMeaningfulWordSwap("Do you have a minute?", "Do you have a moment?")).toBe(true);
  });

  it("does not use informal-form normalization as a word swap", () => {
    const contraction = buildPracticeVariationDeck(makePattern({ english: "I'm from Busan." }));
    const informal = buildPracticeVariationDeck(makePattern({ english: "Do you wanna come?" }));

    expect(contraction.wordSwaps.map((item) => item.english)).not.toContain("I am from Busan.");
    expect(informal.wordSwaps.map((item) => item.english)).not.toContain("Do you want to come?");
  });

  it("prefers a safe phrase rule over overlapping broad word rules", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["To give you an idea, it takes about an hour.", "To give you a sense, it takes about an hour."],
      ["She's easy to talk to.", "She's pleasant to talk to."],
      ["Do we have to memorize this?", "Do we need to learn this by heart?"],
      ["I need a little time to process that.", "I need a bit of time to process that."],
      ["Feel free to take one.", "Don't hesitate to take one."],
      ["We could try a different route.", "We could try an alternative route."],
      ["You'd be wise to get a second opinion.", "You'd be wise to get another opinion."],
      ["Leave it with me. I'll take care of it.", "Leave it with me. I'll handle it."],
      ["I didn't mean to upset you.", "I didn't mean to hurt you."],
      ["All your hard work paid off.", "All your effort paid off."],
      ["I'm not happy with this service.", "I'm dissatisfied with this service."],
    ];

    for (const [source, expected] of cases) {
      expect(wordSwapsFor(source), source).toContain(expected);
    }
  });

  it("repairs indefinite articles after a lexical replacement", () => {
    expect(wordSwapsFor("Could I have a room on a higher floor?")).toContain(
      "Could I have a room on an upper floor?",
    );
    expect(wordSwapsFor("I'd like to make a formal complaint.")).toContain(
      "I'd like to make an official complaint.",
    );
    expect(wordSwapsFor("There's a problem with the schedule.")).toContain(
      "There's an issue with the schedule.",
    );
    expect(wordSwapsFor("We may have overlooked an important detail.")).toContain(
      "We may have overlooked a key detail.",
    );
  });

  it("never emits known ungrammatical or misleading broad-rule results", () => {
    const rejectedCases: ReadonlyArray<readonly [string, string]> = [
      ["To give you an idea, it takes about an hour.", "To give you an suggestion, it takes about an hour."],
      ["On the other hand, it takes more time.", "On the other hand, it requires longer."],
      ["She's easy to talk to.", "She's simple to talk to."],
      ["Lemme check real quick.", "Lemme check real brief."],
      ["Do we have to memorize this?", "Do we need to learn by heart this?"],
      ["Could I have a room on a higher floor?", "Could I have a room on a upper floor?"],
      ["I need a little time to process that.", "I need a bit time to process that."],
      ["Feel free to take one.", "Feel complimentary to take one."],
      ["We could try a different route.", "We could try a alternative route."],
      ["You'd be wise to get a second opinion.", "You'd be wise to get a moment opinion."],
      ["Leave it with me. I'll take care of it.", "Leave it with me. I'll stay safe of it."],
      ["I didn't mean to upset you.", "I didn't mean to distressed you."],
      ["All your hard work paid off.", "All your tough work paid off."],
      ["I'm not happy with this service.", "I'm not glad with this service."],
      ["I'd like to make a formal complaint.", "I'd like to make a official complaint."],
      ["There's a problem with the schedule.", "There's a issue with the schedule."],
      ["We may have overlooked an important detail.", "We may have overlooked an key detail."],
      ["And how did it turn out?", "And how did it end up?"],
      ["We ran out of milk.", "We used up all the milk."],
      ["Unlike the old model, this one is quiet.", "Unlike the old model, this one is silent."],
      ["No way.", "Impossible."],
      ["Then, out of nowhere, the lights went out.", "Then, out of nowhere, the power went out."],
      ["What's the best way to get to the airport?", "What's the easiest way to get to the airport?"],
      ["I couldn't come due to a family matter.", "I couldn't come due to a family issue."],
      ["I guess they changed their minds.", "I guess they reconsidered."],
      ["I respectfully disagree.", "I politely disagree."],
      ["You make it look easy.", "You make it look simple."],
      ["Could I get a receipt?", "Could I get proof of purchase?"],
    ];

    for (const [source, rejected] of rejectedCases) {
      expect(wordSwapsFor(source), source).not.toContain(rejected);
    }
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

  it("keeps every shipped word swap lexical and separate from paraphrases", () => {
    expect(shippedPatterns).toHaveLength(520);

    let patternsWithWordSwaps = 0;
    for (const pattern of shippedPatterns) {
      const deck = buildPracticeVariationDeck(pattern);

      expect(deck.paraphrases.length, pattern.english).toBeGreaterThan(0);
      if (deck.wordSwaps.length > 0) patternsWithWordSwaps += 1;
      for (const item of deck.wordSwaps) {
        expect(isMeaningfulWordSwap(pattern.english, item.english), pattern.english).toBe(true);
        expect(item.english, pattern.english).not.toBe(deck.paraphrases[0]?.english);
      }
    }

    expect(patternsWithWordSwaps).toBeGreaterThan(300);
  });
});
