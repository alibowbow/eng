import type { ConversationPattern } from "../content/schema";

export type PracticeVariationKind = "word-swap" | "paraphrase";

export interface PracticeVariation {
  kind: PracticeVariationKind;
  english: string;
  korean: string;
}

export interface PracticeVariationDeck {
  wordSwaps: readonly PracticeVariation[];
  paraphrases: readonly PracticeVariation[];
}

interface TextRule {
  pattern: RegExp;
  replacement: string;
}

const MAX_VARIATIONS_PER_LANE = 3;

/**
 * These replacements deliberately change one lexical choice while preserving
 * the sentence frame and its practical meaning. They are ordered from the
 * most specific phrase to broader, still-safe synonyms.
 */
const WORD_SWAP_RULES: readonly TextRule[] = [
  { pattern: /\bcan I\b/i, replacement: "could I" },
  { pattern: /\bcould I\b/i, replacement: "can I" },
  { pattern: /\bcan you\b/i, replacement: "could you" },
  { pattern: /\bcould you\b/i, replacement: "can you" },
  { pattern: /\bcan we\b/i, replacement: "could we" },
  { pattern: /\bcould we\b/i, replacement: "can we" },
  { pattern: /\bask you something\b/i, replacement: "ask you one thing" },
  { pattern: /\bthere's something\b/i, replacement: "there's one thing" },
  { pattern: /\bthat's something\b/i, replacement: "that's one thing" },
  { pattern: /\bin the middle of something\b/i, replacement: "busy with a task" },
  { pattern: /\bwhy don't we\b/i, replacement: "why not" },
  { pattern: /\bwhy don't you\b/i, replacement: "why not" },
  { pattern: /\bdo you mind if\b/i, replacement: "is it okay if" },
  { pattern: /\bI'm gonna\b/i, replacement: "I'm going to" },
  { pattern: /\bI've gotta\b/i, replacement: "I have to" },
  { pattern: /\bhere's to\b/i, replacement: "cheers to" },
  { pattern: /\bfeel free to\b/i, replacement: "don't hesitate to" },
  { pattern: /\btake care of it\b/i, replacement: "handle it" },
  { pattern: /\bnot happy with\b/i, replacement: "dissatisfied with" },
  { pattern: /\bupset you\b/i, replacement: "hurt you" },
  { pattern: /\bhappy to help\b/i, replacement: "glad to assist" },
  { pattern: /\bhelp you with that\b/i, replacement: "assist you with that" },
  { pattern: /\bhelp me\b/i, replacement: "assist me" },
  { pattern: /\bneed help\b/i, replacement: "need assistance" },
  { pattern: /\byour help\b/i, replacement: "your assistance" },
  { pattern: /\ba second opinion\b/i, replacement: "another opinion" },
  { pattern: /\bwarmest congratulations\b/i, replacement: "heartfelt congratulations" },
  { pattern: /\bvery often\b/i, replacement: "that often" },
  { pattern: /\ba great idea\b/i, replacement: "a very good idea" },
  { pattern: /\ba great job\b/i, replacement: "an excellent job" },
  { pattern: /\ba different route\b/i, replacement: "an alternative route" },
  { pattern: /\ba formal complaint\b/i, replacement: "an official complaint" },
  { pattern: /\ba problem\b/i, replacement: "an issue" },
  { pattern: /\ban important detail\b/i, replacement: "a key detail" },
  { pattern: /\ba little time\b/i, replacement: "a bit of time" },
  { pattern: /\bgive you an idea\b/i, replacement: "give you a sense" },
  { pattern: /\bcheck the time\b/i, replacement: "look at the time" },
  { pattern: /\bcheck online\b/i, replacement: "look online" },
  { pattern: /\bme to check\b/i, replacement: "me to take a look" },
  { pattern: /\bcorrect one thing\b/i, replacement: "make one correction" },
  { pattern: /\bdo you prefer\b/i, replacement: "do you like better" },
  { pattern: /\beasy to talk to\b/i, replacement: "pleasant to talk to" },
  { pattern: /\bwhat time is check-in\b/i, replacement: "when does check-in begin" },
  { pattern: /\bhave to memorize this\b/i, replacement: "need to learn this by heart" },
  { pattern: /\bbe any better\b/i, replacement: "work any better" },
  { pattern: /\bflexibility on the price\b/i, replacement: "leeway on the price" },
  { pattern: /\bI'd prefer\b/i, replacement: "I would prefer" },
  { pattern: /\bbeen up to\b/i, replacement: "been doing" },
  { pattern: /\bjoin you\b/i, replacement: "come along with you" },
  { pattern: /\bbrings you here\b/i, replacement: "brought you here" },
  { pattern: /\blong time no see\b/i, replacement: "haven't seen you in ages" },
  { pattern: /\bgive me an example\b/i, replacement: "provide an example" },
  { pattern: /\bwhat do you mean by that\b/i, replacement: "what are you referring to" },
  { pattern: /\bwhat do you mean\b/i, replacement: "what are you referring to" },
  { pattern: /^Really(?=\?)/i, replacement: "Seriously" },
  { pattern: /\bif I understand correctly\b/i, replacement: "if I have this right" },
  { pattern: /\bspell that for me\b/i, replacement: "spell that out for me" },
  { pattern: /\bworth a try\b/i, replacement: "worth trying" },
  { pattern: /\bgoing to rain\b/i, replacement: "about to rain" },
  { pattern: /\bsince we have time\b/i, replacement: "since we're not in a hurry" },
  { pattern: /\blast bus\b/i, replacement: "final bus" },
  { pattern: /\bmove on\b/i, replacement: "proceed" },
  { pattern: /\bturn the music down\b/i, replacement: "lower the music" },
  { pattern: /\bfigure this out\b/i, replacement: "solve this" },
  { pattern: /\bgo over the plan\b/i, replacement: "review the plan" },
  { pattern: /\brings a bell\b/i, replacement: "sounds familiar" },
  { pattern: /\bcall it a day\b/i, replacement: "wrap things up" },
  { pattern: /\bget the ball rolling\b/i, replacement: "get things moving" },
  { pattern: /\bget started\b/i, replacement: "begin" },
  { pattern: /\bmake a decision\b/i, replacement: "make a choice" },
  { pattern: /\bwork on this\b/i, replacement: "tackle this" },
  { pattern: /\bsee the menu\b/i, replacement: "look at the menu" },
  { pattern: /\bthis to go\b/i, replacement: "this as takeout" },
  { pattern: /\bservice included\b/i, replacement: "service part of the price" },
  { pattern: /\bhow much is this\b/i, replacement: "how much is this item" },
  { pattern: /\btry this on\b/i, replacement: "try this item on" },
  { pattern: /\bpay by card\b/i, replacement: "pay with a card" },
  { pattern: /\bget a receipt\b/i, replacement: "request a receipt" },
  { pattern: /\bsplit the payment\b/i, replacement: "divide the payment" },
  { pattern: /\bleave my luggage\b/i, replacement: "store my luggage" },
  { pattern: /\bget to the station\b/i, replacement: "reach the station" },
  { pattern: /\blet me know\b/i, replacement: "tell me" },
  { pattern: /\bprescription\b/i, replacement: "written prescription" },
  { pattern: /\bstay on the line\b/i, replacement: "remain on the line" },
  { pattern: /\bput it another way\b/i, replacement: "say it differently" },
  { pattern: /^I see(?=\.)/i, replacement: "I understand" },
  { pattern: /^That makes sense(?=\.)/i, replacement: "That seems reasonable" },
  { pattern: /^Fair enough(?=\.)/i, replacement: "That seems reasonable" },
  { pattern: /\bgood to know\b/i, replacement: "helpful to know" },
  { pattern: /\bwhat a surprise\b/i, replacement: "how surprising" },
  { pattern: /\bhave a point\b/i, replacement: "make a valid point" },
  { pattern: /\bsit here\b/i, replacement: "take this seat" },
  { pattern: /\bjoin us\b/i, replacement: "come with us" },
  { pattern: /\bgrab lunch\b/i, replacement: "get lunch" },
  { pattern: /\binterest you in some coffee\b/i, replacement: "offer you some coffee" },
  { pattern: /\bget some rest\b/i, replacement: "rest a little" },
  { pattern: /\bif I were you\b/i, replacement: "in your position" },
  { pattern: /\bbring an umbrella\b/i, replacement: "take an umbrella" },
  { pattern: /\bcount me in\b/i, replacement: "include me" },
  { pattern: /\bhave a deal\b/i, replacement: "have an agreement" },
  { pattern: /\bsomewhere in the middle\b/i, replacement: "halfway" },
  { pattern: /\bthank you so much\b/i, replacement: "thanks very much" },
  { pattern: /\bowe you one\b/i, replacement: "owe you a favor" },
  { pattern: /\bsincere thanks\b/i, replacement: "heartfelt thanks" },
  { pattern: /\bmy fault\b/i, replacement: "my mistake" },
  { pattern: /\bowe you an apology\b/i, replacement: "need to apologize to you" },
  { pattern: /\bforgive me\b/i, replacement: "excuse me" },
  { pattern: /\bgoing to be okay\b/i, replacement: "going to be all right" },
  { pattern: /\baddress this\b/i, replacement: "deal with this" },
  { pattern: /\bexchange this\b/i, replacement: "swap this" },
  { pattern: /\breceipt for a refund\b/i, replacement: "proof of purchase for a refund" },
  { pattern: /\bchecks the weather\b/i, replacement: "looks at the forecast" },
  { pattern: /\bat first\b/i, replacement: "initially" },
  { pattern: /\bhope everything\b/i, replacement: "hope it all" },
  { pattern: /\bhave my word\b/i, replacement: "have my assurance" },
  { pattern: /\bcount on me\b/i, replacement: "rely on me" },
  { pattern: /\bask you a favor\b/i, replacement: "ask you for help" },
  { pattern: /\bhow have you been\b/i, replacement: "how have things been" },
  { pattern: /\bmy name is\b/i, replacement: "I go by" },
  { pattern: /\bwhat page\b/i, replacement: "which page" },
  { pattern: /\blet's do it\b/i, replacement: "let's go for it" },
  { pattern: /\bcongratulations\b/i, replacement: "congrats" },
  { pattern: /\bgood morning\b/i, replacement: "morning" },
  { pattern: /\bgood to see\b/i, replacement: "nice to see" },
  { pattern: /\bnot bad\b/i, replacement: "pretty good" },
  { pattern: /\btake care\b/i, replacement: "stay safe" },
  { pattern: /\bhealthcare\b/i, replacement: "the medical field" },
  { pattern: /\bget into\b/i, replacement: "become interested in" },
  { pattern: /\blike most\b/i, replacement: "like best" },
  { pattern: /\bget that\b/i, replacement: "find that" },
  { pattern: /\btold you\b/i, replacement: "informed you" },
  { pattern: /\bdecide to\b/i, replacement: "choose to" },
  { pattern: /\bhow does this work\b/i, replacement: "how does this function" },
  { pattern: /\bafter that\b/i, replacement: "following that" },
  { pattern: /\bmake you feel\b/i, replacement: "leave you feeling" },
  { pattern: /\bdo next\b/i, replacement: "do afterward" },
  { pattern: /\bthink that happened\b/i, replacement: "believe that occurred" },
  { pattern: /\bhappened before\b/i, replacement: "occurred previously" },
  { pattern: /\bthis one\b/i, replacement: "this particular one" },
  { pattern: /\bare you saying\b/i, replacement: "are you suggesting" },
  { pattern: /\bshould wait\b/i, replacement: "should hold off" },
  { pattern: /\balready done\b/i, replacement: "already finished" },
  { pattern: /\bunderstanding you right\b/i, replacement: "following you correctly" },
  { pattern: /\bmissed what you said\b/i, replacement: "didn't hear what you said" },
  { pattern: /\bin my opinion\b/i, replacement: "in my view" },
  { pattern: /\bthe way I see it\b/i, replacement: "from my point of view" },
  { pattern: /\bfrom my perspective\b/i, replacement: "from my viewpoint" },
  { pattern: /\btend to think\b/i, replacement: "generally believe" },
  { pattern: /\bmight have forgotten\b/i, replacement: "may have forgotten" },
  { pattern: /\bI guess\b/i, replacement: "I suppose" },
  { pattern: /\bpart of the reason\b/i, replacement: "one factor" },
  { pattern: /\bgiven the weather\b/i, replacement: "considering the weather" },
  { pattern: /\bstaying inside\b/i, replacement: "remaining indoors" },
  { pattern: /\bfor example\b/i, replacement: "for instance" },
  { pattern: /\bone good example\b/i, replacement: "one clear example" },
  { pattern: /\bsomething like\b/i, replacement: "something such as" },
  { pattern: /\ba case in point\b/i, replacement: "a good illustration" },
  { pattern: /\bmain difference\b/i, replacement: "key distinction" },
  { pattern: /\bon the other hand\b/i, replacement: "by contrast" },
  { pattern: /\btakes more time\b/i, replacement: "needs more time" },
  { pattern: /\bgreat sense of humor\b/i, replacement: "wonderful sense of humor" },
  { pattern: /\bcarry around\b/i, replacement: "take with you" },
  { pattern: /\blooks better\b/i, replacement: "appears nicer" },
  { pattern: /\bstands out\b/i, replacement: "is most noticeable" },
  { pattern: /\bthe store\b/i, replacement: "the shop" },
  { pattern: /\bgetting better\b/i, replacement: "improving" },
  { pattern: /\bby the way\b/i, replacement: "incidentally" },
  { pattern: /\bspeaking of\b/i, replacement: "on the subject of" },
  { pattern: /\bbooked your flight\b/i, replacement: "made your flight reservation" },
  { pattern: /\bthat reminds me\b/i, replacement: "come to think of it" },
  { pattern: /\bbefore I forget\b/i, replacement: "while I remember" },
  { pattern: /\banyway\b/i, replacement: "in any case" },
  { pattern: /\bnice talking to you\b/i, replacement: "great chatting with you" },
  { pattern: /\bget going\b/i, replacement: "get moving" },
  { pattern: /\bthanks for\b/i, replacement: "thank you for" },
  { pattern: /\bgive my best\b/i, replacement: "send my regards" },
  { pattern: /\bit depends\b/i, replacement: "that varies" },
  { pattern: /\bnever thought about\b/i, replacement: "never considered" },
  { pattern: /\bbasically\b/i, replacement: "essentially" },
  { pattern: /\bmade other plans\b/i, replacement: "made different plans" },
  { pattern: /\bI was wondering\b/i, replacement: "I wanted to know" },
  { pattern: /\bwith all due respect\b/i, replacement: "respectfully" },
  { pattern: /\bsee it differently\b/i, replacement: "have a different view" },
  { pattern: /\bwanna\b/i, replacement: "want to" },
  { pattern: /\bdunno\b/i, replacement: "don't know" },
  { pattern: /\bwhaddaya\b/i, replacement: "what do you" },
  { pattern: /\btook me a while\b/i, replacement: "took me some time" },
  { pattern: /\bget over\b/i, replacement: "recover from" },
  { pattern: /\bspeak to\b/i, replacement: "talk to" },
  { pattern: /\bconnection is breaking up\b/i, replacement: "signal is cutting out" },
  { pattern: /\blate reply\b/i, replacement: "delayed response" },
  { pattern: /\bjust saw\b/i, replacement: "only just read" },
  { pattern: /\bassignment\b/i, replacement: "homework" },
  { pattern: /\bhave to memorize\b/i, replacement: "need to learn by heart" },
  { pattern: /\bthe more I practice\b/i, replacement: "the more practice I get" },
  { pattern: /\ba table for two\b/i, replacement: "a table for a party of two" },
  { pattern: /\bon sale\b/i, replacement: "discounted" },
  { pattern: /\breservation\b/i, replacement: "booking" },
  { pattern: /\bwhich bus\b/i, replacement: "which bus route" },
  { pattern: /\bthis train\b/i, replacement: "this service" },
  { pattern: /\bneed to transfer\b/i, replacement: "have to change lines" },
  { pattern: /\bhow long does it take\b/i, replacement: "how much time does it take" },
  { pattern: /\bit hurts\b/i, replacement: "it aches" },
  { pattern: /\bhow often\b/i, replacement: "how frequently" },
  { pattern: /\beveryone\b/i, replacement: "everybody" },
  { pattern: /\bwhat I meant\b/i, replacement: "what I intended" },
  { pattern: /\btalking about\b/i, replacement: "discussing" },
  { pattern: /\bdifferent things\b/i, replacement: "different topics" },
  { pattern: /\bput this\b/i, replacement: "phrase this" },
  { pattern: /\bgive me a moment\b/i, replacement: "give me a second" },
  { pattern: /\bget back to you\b/i, replacement: "follow up with you" },
  { pattern: /\byou actually did it\b/i, replacement: "you really did it" },
  { pattern: /\bknow how you feel\b/i, replacement: "understand how you feel" },
  { pattern: /\bsounds right\b/i, replacement: "seems correct" },
  { pattern: /\bagree up to a point\b/i, replacement: "partly agree" },
  { pattern: /\bmay be right\b/i, replacement: "could be correct" },
  { pattern: /\bmostly agree\b/i, replacement: "largely agree" },
  { pattern: /\bone exception\b/i, replacement: "one reservation" },
  { pattern: /\bunderstand your point\b/i, replacement: "see your perspective" },
  { pattern: /\bsome concerns\b/i, replacement: "some reservations" },
  { pattern: /\banother explanation\b/i, replacement: "a different explanation" },
  { pattern: /\bdo you mind if\b/i, replacement: "is it okay if" },
  { pattern: /\bbe all right to\b/i, replacement: "be okay to" },
  { pattern: /\bhow about meeting\b/i, replacement: "what about meeting" },
  { pattern: /\bdifferent route\b/i, replacement: "alternative route" },
  { pattern: /\bsplit the cost\b/i, replacement: "share the expense" },
  { pattern: /\bbooking in advance\b/i, replacement: "reserving ahead of time" },
  { pattern: /\bworth checking\b/i, replacement: "helpful to look" },
  { pattern: /\bofficial invitation\b/i, replacement: "formal invite" },
  { pattern: /\bmight want to\b/i, replacement: "may want to" },
  { pattern: /\bsave a copy\b/i, replacement: "keep a copy" },
  { pattern: /\bbetter to wait\b/i, replacement: "better to hold off" },
  { pattern: /\bneed a hand\b/i, replacement: "want some help" },
  { pattern: /\bgive you a ride\b/i, replacement: "drive you there" },
  { pattern: /\bmake this easier\b/i, replacement: "simplify this" },
  { pattern: /\bworks for me\b/i, replacement: "suits me" },
  { pattern: /\bthanks for asking\b/i, replacement: "thank you for asking" },
  { pattern: /\bas a compromise\b/i, replacement: "as a middle ground" },
  { pattern: /\bmeet halfway\b/i, replacement: "split the difference" },
  { pattern: /\border more\b/i, replacement: "place a larger order" },
  { pattern: /\bin return\b/i, replacement: "in exchange" },
  { pattern: /\bfair compromise\b/i, replacement: "reasonable middle ground" },
  { pattern: /\bletting me know\b/i, replacement: "telling me" },
  { pattern: /\bmeans a lot to me\b/i, replacement: "really matters to me" },
  { pattern: /\bhandled that\b/i, replacement: "dealt with that" },
  { pattern: /\bsincerely apologize\b/i, replacement: "truly apologize" },
  { pattern: /\bthe inconvenience\b/i, replacement: "the trouble" },
  { pattern: /\blooks good on you\b/i, replacement: "suits you" },
  { pattern: /\bexcellent taste\b/i, replacement: "great taste" },
  { pattern: /\bimpressed by\b/i, replacement: "impressed with" },
  { pattern: /\bwell done\b/i, replacement: "great job" },
  { pattern: /\btake all the time you need\b/i, replacement: "take as much time as you need" },
  { pattern: /\bfeel different with time\b/i, replacement: "seem different over time" },
  { pattern: /\bover an hour\b/i, replacement: "more than an hour" },
  { pattern: /\bmuch noisier\b/i, replacement: "far louder" },
  { pattern: /\bbought this\b/i, replacement: "purchased this" },
  { pattern: /\busually get up\b/i, replacement: "normally get up" },
  { pattern: /\beat out\b/i, replacement: "dine out" },
  { pattern: /\bevery now and then\b/i, replacement: "occasionally" },
  { pattern: /\btake a day off\b/i, replacement: "have a day off" },
  { pattern: /\blose track of time\b/i, replacement: "forget the time" },
  { pattern: /\bused to live\b/i, replacement: "formerly lived" },
  { pattern: /\bnear here\b/i, replacement: "nearby" },
  { pattern: /\banything like it\b/i, replacement: "anything similar" },
  { pattern: /\blooking back\b/i, replacement: "in retrospect" },
  { pattern: /\bit all started\b/i, replacement: "it all began" },
  { pattern: /\bmissed the bus\b/i, replacement: "failed to catch the bus" },
  { pattern: /\bout of nowhere\b/i, replacement: "without warning" },
  { pattern: /\bbefore I knew it\b/i, replacement: "before I realized it" },
  { pattern: /\bto make a long story short\b/i, replacement: "to cut a long story short" },
  { pattern: /\bgot home safely\b/i, replacement: "made it home safely" },
  { pattern: /\ball along\b/i, replacement: "the whole time" },
  { pattern: /\bin the end\b/i, replacement: "ultimately" },
  { pattern: /\bbetter than expected\b/i, replacement: "better than anticipated" },
  { pattern: /\bintend to\b/i, replacement: "plan to" },
  { pattern: /\bkeep my promise\b/i, replacement: "honor my promise" },
  { pattern: /\bmy goal\b/i, replacement: "my aim" },
  { pattern: /\bmore confident\b/i, replacement: "more self-assured" },
  { pattern: /\bevery intention of\b/i, replacement: "a firm intention of" },
  { pattern: /\bin case you need me\b/i, replacement: "if you need me" },
  { pattern: /\bkeep my number\b/i, replacement: "save my number" },
  { pattern: /\bhad I known earlier\b/i, replacement: "had I known sooner" },
  { pattern: /\bclosing the window\b/i, replacement: "shutting the window" },
  { pattern: /\bkept this private\b/i, replacement: "kept this confidential" },
  { pattern: /\bmove the meeting\b/i, replacement: "reschedule the meeting" },
  { pattern: /\ba minute\b/i, replacement: "a moment" },
  { pattern: /\ba second\b/i, replacement: "a moment" },
  { pattern: /\bone more time\b/i, replacement: "once again" },
  { pattern: /\bright away\b/i, replacement: "immediately" },
  { pattern: /\bright now\b/i, replacement: "at the moment" },
  { pattern: /\breal quick\b/i, replacement: "really quickly" },
  { pattern: /\bpretty well\b/i, replacement: "quite well" },
  { pattern: /\ba little\b/i, replacement: "a bit" },
  { pattern: /\ba small\b/i, replacement: "a minor" },
  { pattern: /\bsmall problem\b/i, replacement: "minor issue" },
  { pattern: /\bbig deal\b/i, replacement: "major issue" },
  { pattern: /\bgood idea\b/i, replacement: "great idea" },
  { pattern: /\bgood news\b/i, replacement: "great news" },
  { pattern: /\bthe whole story\b/i, replacement: "the full story" },
  { pattern: /\bthe last part\b/i, replacement: "the final part" },
  { pattern: /\bthe first one\b/i, replacement: "the first option" },
  { pattern: /\bthe other one\b/i, replacement: "the alternative" },
  { pattern: /\bthe right choice\b/i, replacement: "the correct choice" },
  { pattern: /\bthe right person\b/i, replacement: "the appropriate person" },
  { pattern: /\bthe nearest\b/i, replacement: "the closest" },
  { pattern: /\bmore slowly\b/i, replacement: "slower" },
  { pattern: /\bless spicy\b/i, replacement: "milder" },
  { pattern: /\blarger size\b/i, replacement: "bigger size" },
  { pattern: /\bhigher floor\b/i, replacement: "upper floor" },
  { pattern: /\bwalking distance\b/i, replacement: "a walkable distance" },
  { pattern: /\bside effects\b/i, replacement: "adverse effects" },
  { pattern: /\bformal complaint\b/i, replacement: "official complaint" },
  { pattern: /\bimportant detail\b/i, replacement: "key detail" },
  { pattern: /\bdaily routine\b/i, replacement: "everyday routine" },
  { pattern: /\bhard work\b/i, replacement: "effort" },
  { pattern: /\bbackup plan\b/i, replacement: "fallback plan" },
  { pattern: /\bvideo call\b/i, replacement: "video chat" },
  { pattern: /\bphone\b/i, replacement: "mobile" },
  { pattern: /\bvacation\b/i, replacement: "holiday" },
  { pattern: /\barea\b/i, replacement: "neighborhood" },
  { pattern: /\binteresting\b/i, replacement: "fascinating" },
  { pattern: /\bwonderful\b/i, replacement: "fantastic" },
  { pattern: /\bincredible\b/i, replacement: "amazing" },
  { pattern: /\bamazing\b/i, replacement: "remarkable" },
  { pattern: /\bunexpected\b/i, replacement: "surprising" },
  { pattern: /\bfrustrating\b/i, replacement: "annoying" },
  { pattern: /\bdifficult\b/i, replacement: "challenging" },
  { pattern: /\bhard\b/i, replacement: "tough" },
  { pattern: /\bmake it look easy\b/i, replacement: "make it look effortless" },
  { pattern: /\beasy\b/i, replacement: "simple" },
  { pattern: /\bsimple\b/i, replacement: "straightforward" },
  { pattern: /\bpractical\b/i, replacement: "functional" },
  { pattern: /\bspacious\b/i, replacement: "roomy" },
  { pattern: /\bbright\b/i, replacement: "well-lit" },
  { pattern: /\bnoisy\b/i, replacement: "loud" },
  { pattern: /\bexpensive\b/i, replacement: "costly" },
  { pattern: /\bcheaper\b/i, replacement: "less expensive" },
  { pattern: /\bcrowded\b/i, replacement: "busy" },
  { pattern: /\bbusy\b/i, replacement: "hectic" },
  { pattern: /\btired\b/i, replacement: "worn out" },
  { pattern: /\bexhausted\b/i, replacement: "worn out" },
  { pattern: /\bnervous\b/i, replacement: "anxious" },
  { pattern: /\bupset\b/i, replacement: "distressed" },
  { pattern: /\bcareful\b/i, replacement: "cautious" },
  { pattern: /\bclearly\b/i, replacement: "well" },
  { pattern: /\bquick\b/i, replacement: "brief" },
  { pattern: /\bquickly\b/i, replacement: "promptly" },
  { pattern: /\btemporarily unavailable\b/i, replacement: "unavailable for now" },
  { pattern: /\bmainly\b/i, replacement: "mostly" },
  { pattern: /\bcompletely\b/i, replacement: "totally" },
  { pattern: /\bperhaps\b/i, replacement: "maybe" },
  { pattern: /\bmaybe\b/i, replacement: "perhaps" },
  { pattern: /\balmost\b/i, replacement: "nearly" },
  { pattern: /\bagain\b/i, replacement: "once more" },
  { pattern: /\bmy first time here\b/i, replacement: "my initial visit here" },
  { pattern: /\bfirst step\b/i, replacement: "initial step" },
  { pattern: /\badvantages\b/i, replacement: "benefits" },
  { pattern: /\boption\b/i, replacement: "choice" },
  { pattern: /\bidea\b/i, replacement: "suggestion" },
  { pattern: /\bproblem\b/i, replacement: "issue" },
  { pattern: /\bdetails\b/i, replacement: "information" },
  { pattern: /\badvice\b/i, replacement: "recommendation" },
  { pattern: /\bstart\b/i, replacement: "begin" },
  { pattern: /\bplan is to finish by\b/i, replacement: "plan is to wrap up by" },
  { pattern: /\bchoose\b/i, replacement: "pick" },
  { pattern: /\brecommend\b/i, replacement: "suggest" },
  { pattern: /\bpostpone\b/i, replacement: "delay" },
  { pattern: /\breschedule\b/i, replacement: "arrange another time" },
  { pattern: /\bnot available right now\b/i, replacement: "not free right now" },
  { pattern: /\bis this free\b/i, replacement: "is this complimentary" },
  { pattern: /\bcould be wrong\b/i, replacement: "could be mistaken" },
  { pattern: /\bexactly\b/i, replacement: "precisely" },
];

/**
 * Surface-form changes can contribute to a multi-change paraphrase, but must
 * never enter the word-swap lane on their own.
 */
const GRAMMATICAL_FORM_RULES: readonly TextRule[] = [
  { pattern: /\bIt's been\b/, replacement: "It has been" },
  { pattern: /\bit's been\b/, replacement: "it has been" },
  { pattern: /\bI'm\b/, replacement: "I am" },
  { pattern: /\bI've\b/, replacement: "I have" },
  { pattern: /\bI'll\b/, replacement: "I will" },
  { pattern: /\bI'd like\b/, replacement: "I would like" },
  { pattern: /\bI'd love\b/, replacement: "I would love" },
  { pattern: /\bI'd rather\b/, replacement: "I would rather" },
  { pattern: /\bWe're\b/, replacement: "We are" },
  { pattern: /\bwe're\b/, replacement: "we are" },
  { pattern: /\bWe'll\b/, replacement: "We will" },
  { pattern: /\bwe'll\b/, replacement: "we will" },
  { pattern: /\bYou've\b/, replacement: "You have" },
  { pattern: /\byou've\b/, replacement: "you have" },
  { pattern: /\bYou're\b/, replacement: "You are" },
  { pattern: /\byou're\b/, replacement: "you are" },
  { pattern: /\bYou'll\b/, replacement: "You will" },
  { pattern: /\byou'll\b/, replacement: "you will" },
  { pattern: /\bShe's\b/, replacement: "She is" },
  { pattern: /\bshe's\b/, replacement: "she is" },
  { pattern: /\bHe's\b/, replacement: "He is" },
  { pattern: /\bhe's\b/, replacement: "he is" },
  { pattern: /\bThey're\b/, replacement: "They are" },
  { pattern: /\bthey're\b/, replacement: "they are" },
  { pattern: /\bThey'll\b/, replacement: "They will" },
  { pattern: /\bthey'll\b/, replacement: "they will" },
  { pattern: /\bThat's\b/, replacement: "That is" },
  { pattern: /\bthat's\b/, replacement: "that is" },
  { pattern: /\bThere's been\b/, replacement: "There has been" },
  { pattern: /\bthere's been\b/, replacement: "there has been" },
  { pattern: /\bThere's\b/, replacement: "There is" },
  { pattern: /\bthere's\b/, replacement: "there is" },
  { pattern: /\bHere's\b/, replacement: "Here is" },
  { pattern: /\bWhat's\b/, replacement: "What is" },
  { pattern: /\bWho's\b/, replacement: "Who is" },
  { pattern: /\bHow's\b/, replacement: "How is" },
  { pattern: /\bcan't\b/i, replacement: "cannot" },
  { pattern: /\bwon't\b/i, replacement: "will not" },
  { pattern: /\bdon't\b/i, replacement: "do not" },
  { pattern: /\bdoesn't\b/i, replacement: "does not" },
  { pattern: /\bdidn't\b/i, replacement: "did not" },
  { pattern: /\bisn't\b/i, replacement: "is not" },
  { pattern: /\baren't\b/i, replacement: "are not" },
  { pattern: /\bwasn't\b/i, replacement: "was not" },
  { pattern: /\bweren't\b/i, replacement: "were not" },
  { pattern: /\bhaven't\b/i, replacement: "have not" },
  { pattern: /\bhasn't\b/i, replacement: "has not" },
  { pattern: /\bwouldn't\b/i, replacement: "would not" },
  { pattern: /\bcouldn't\b/i, replacement: "could not" },
  { pattern: /\bshouldn't\b/i, replacement: "should not" },
];

const EXACT_PARAPHRASES: Readonly<Record<string, readonly string[]>> = {
  "Good morning. How are you?": ["Morning! How are things?"],
  "It's good to see you.": ["It's nice seeing you."],
  "How have you been?": ["How are things with you?"],
  "Not bad. How about you?": ["I'm doing okay. And you?"],
  "Take care on your way home.": ["Be safe on your way home."],
  "My name is Mina.": ["I'm Mina."],
  "I work in healthcare.": ["Healthcare is my field."],
  "How did you get into that?": ["What got you interested in that?"],
  "What do you like most about it?": ["What's your favorite thing about it?"],
  "Where did you get that?": ["Where did you find that?"],
  "Who told you about it?": ["Who did you hear about it from?"],
  "Why did you decide to go?": ["What made you decide to go?"],
  "How does this work?": ["Can you explain how this works?"],
  "Is there anything else I should know?": ["What else should I know?"],
  "What happened after that?": ["What happened next?"],
  "How did that make you feel?": ["How did you feel about that?"],
  "What did you do next?": ["What was your next step?"],
  "Why do you think that happened?": ["What do you think caused that?"],
  "Has that happened before?": ["Have you experienced that before?"],
  "And how did it turn out?": ["And what was the outcome?"],
  "Do you mean this one?": ["Is this the one you mean?"],
  "Are you saying we should wait?": ["Do you mean that we should wait?"],
  "So, you mean it's already done?": ["So, are you saying it's finished already?"],
  "Does that mean I need an appointment?": ["So, do I have to make an appointment?"],
  "Am I understanding you right?": ["Have I understood you correctly?"],
  "I missed what you said after that.": ["I didn't hear the part that came next."],
  "In my opinion, we should wait.": ["I think waiting is the best option."],
  "The way I see it, we have two options.": ["From my point of view, there are two choices."],
  "From my perspective, the timing is right.": ["As I see it, this is the right time."],
  "I tend to think the simpler plan is better.": ["I generally prefer the less complicated plan."],
  "She might have forgotten.": ["It's possible that she forgot."],
  "I guess they changed their minds.": ["It seems they decided differently."],
  "Part of the reason is the cost.": ["The cost is one reason for it."],
  "Given the weather, staying inside makes sense.": ["It makes sense to stay indoors in this weather."],
  "For example, you could take the train.": ["Taking the train is one option, for instance."],
  "Take yesterday, for instance.": ["Yesterday is a good example."],
  "One good example is this app.": ["This app is a good example."],
  "Something like a notebook would work.": ["A notebook or something similar would do the job."],
  "A case in point is our last project.": ["Our last project is a good example."],
  "The main difference is the size.": ["Size is what mainly sets them apart."],
  "On the other hand, it takes more time.": ["The downside is that it requires more time."],
  "He has a great sense of humor.": ["He's very funny."],
  "It's small enough to carry around.": ["It's compact enough to take with you."],
  "It looks better in person.": ["Seeing it in real life is more impressive."],
  "What stands out is the attention to detail.": ["The careful attention to detail is most noticeable."],
  "The store is still open.": ["The shop hasn't closed yet."],
  "Things are getting better.": ["The situation is improving."],
  "By the way, how's your sister?": ["That reminds me—how is your sister?"],
  "Speaking of travel, have you booked your flight?": ["While we're talking about travel, have you arranged your flight?"],
  "That reminds me, I need to call Sam.": ["I just remembered that I have to call Sam."],
  "Before I forget, can I ask you something?": ["While I remember, may I ask you something?"],
  "Anyway, what were you saying?": ["Anyway, what were you talking about?"],
  "It was nice talking to you.": ["I enjoyed our conversation."],
  "I should get going.": ["It's time for me to leave."],
  "Thanks for your time.": ["I appreciate you taking the time."],
  "Take care, and give my best to your family.": ["Stay well, and send my regards to your family."],
  "Well, it depends.": ["That really depends on the situation."],
  "You know, I never thought about that.": ["I hadn't considered that before."],
  "Actually, I changed my mind.": ["To be honest, I decided differently."],
  "Basically, we need more time.": ["The main point is that we need extra time."],
  "The thing is, I already made other plans.": ["The problem is that I have plans already."],
  "I was wondering if you had a moment.": ["I wanted to know whether you had a minute."],
  "With all due respect, I see it differently.": ["Respectfully, I have a different view."],
  "Do you wanna come?": ["Would you like to come?"],
  "I dunno what happened.": ["I don't know what happened."],
  "Whaddaya think?": ["What do you think?"],
  "We ran out of milk.": ["There's no milk left."],
  "It took me a while to get over it.": ["I needed some time to recover from it."],
  "May I speak to Daniel, please?": ["Could I talk to Daniel, please?"],
  "The connection is breaking up.": ["The signal keeps cutting out."],
  "Sorry for the late reply. I just saw your message.": ["Apologies for replying late—I only just read your message."],
  "What page are we on?": ["Which page should I be looking at?"],
  "When is the assignment due?": ["What's the deadline for the assignment?"],
  "Do we have to memorize this?": ["Is memorizing this required?"],
  "The more I practice, the easier it gets.": ["It gets easier as I practice more."],
  "A table for two, please.": ["We'd like a table for two, please."],
  "Is this on sale?": ["Is this item discounted?"],
  "I have a reservation under Kim.": ["The reservation is in the name Kim."],
  "Which bus should I take?": ["What bus do I need to get?"],
  "What's the best way to get to the airport?": ["How should I get to the airport?"],
  "Does this train stop at City Hall?": ["Is City Hall one of this train's stops?"],
  "Where do I need to transfer?": ["At which station should I change lines?"],
  "How long does it take from here?": ["What's the travel time from here?"],
  "It hurts when I move my arm.": ["Moving my arm causes pain."],
  "How often should I take this?": ["How many times should I take this?"],
  "Is everyone okay?": ["Is everybody all right?"],
  "My wallet has been stolen.": ["Someone stole my wallet."],
  "What I meant was tomorrow, not today.": ["I meant tomorrow rather than today."],
  "We might be talking about different things.": ["Perhaps we're discussing two different things."],
  "How should I put this?": ["What's the best way to say this?"],
  "Give me a moment to think.": ["Let me think for a moment."],
  "Off the top of my head, I'd say no.": ["My first response would be no."],
  "Let me get back to you on that.": ["I'll follow up with you about that."],
  "You actually did it!": ["You really pulled it off!"],
  "I know how you feel.": ["I understand what you're going through."],
  "You have every right to feel that way.": ["You're completely justified in feeling that way."],
  "That sounds right to me.": ["That seems correct to me."],
  "I agree up to a point.": ["I partly agree."],
  "You may be right about that part.": ["That part of what you said could be correct."],
  "I mostly agree, with one exception.": ["I agree overall, except for one thing."],
  "I understand your point, but I have some concerns.": ["I see your perspective, though a few things worry me."],
  "Could there be another explanation?": ["Is a different explanation possible?"],
  "I respectfully disagree.": ["I see it differently, with respect."],
  "Do you mind if I open the window?": ["Would it bother you if I opened the window?"],
  "Would it be all right to bring a friend?": ["Would bringing a friend be okay?"],
  "How about meeting on Saturday?": ["Would you like to meet on Saturday?"],
  "We could try a different route.": ["Taking another route is an option."],
  "What if we split the cost?": ["How about sharing the cost?"],
  "I'd suggest booking in advance.": ["My recommendation is to book ahead."],
  "It might be worth checking online.": ["Checking online could be helpful."],
  "Consider this your official invitation.": ["You're officially invited."],
  "You might want to save a copy.": ["It may be a good idea to keep a copy."],
  "It would be better to wait until morning.": ["Waiting until morning would be best."],
  "Let me carry that for you.": ["I'll carry that for you."],
  "Do you need a hand?": ["Would some help be useful?"],
  "I can give you a ride.": ["I can take you there by car."],
  "Is there anything I can do to make this easier?": ["How can I make this easier for you?"],
  "Yes, that works for me.": ["Yes, I'm fine with that."],
  "Why not? Let's do it.": ["Sure, let's go ahead."],
  "Thanks for asking, but I have plans.": ["I appreciate the invitation, but I'm busy."],
  "We could go tomorrow instead.": ["Going tomorrow is another option."],
  "Would Friday be any better?": ["Would Friday work better for you?"],
  "As a compromise, we could meet halfway.": ["We could find a middle ground and meet halfway."],
  "Is there any flexibility on the price?": ["Do you have any room to adjust the price?"],
  "What if we order more?": ["Would ordering more make a difference?"],
  "We can agree to that on one condition.": ["We'll accept that provided one condition is met."],
  "I'd need something in return.": ["I would want something in exchange."],
  "That seems like a fair compromise.": ["That sounds like a reasonable middle ground."],
  "Thanks for letting me know.": ["I appreciate the update."],
  "It means a lot to me.": ["It's very meaningful to me."],
  "I should have handled that better.": ["I could have dealt with that more thoughtfully."],
  "I sincerely apologize for the inconvenience.": ["I'm truly sorry for the trouble."],
  "That looks good on you.": ["That really suits you."],
  "You have excellent taste.": ["Your taste is excellent."],
  "I was impressed by how calmly you handled it.": ["The calm way you handled it impressed me."],
  "Congratulations! You deserve it.": ["Well done! You've earned it."],
  "Well done on passing the exam.": ["Congratulations on getting through the exam."],
  "Take all the time you need.": ["There's no need to rush."],
  "Things may feel different with time.": ["You may see things differently as time passes."],
  "We've been waiting for over an hour.": ["Our wait has lasted more than an hour."],
  "The room is much noisier than expected.": ["The room is far louder than we anticipated."],
  "I bought this yesterday, but it's damaged.": ["I purchased this yesterday, and it turned out to be damaged."],
  "Is there a restocking fee?": ["Do you charge a fee for returns?"],
  "I usually get up around seven.": ["I normally wake up at about seven."],
  "We eat out once or twice a week.": ["We dine at restaurants once or twice each week."],
  "Every now and then, I take a day off.": ["I occasionally take a day off."],
  "I tend to lose track of time when I read.": ["Reading often makes me forget the time."],
  "I used to live near here.": ["I once lived nearby."],
  "I once met her at a conference.": ["I met her once while attending a conference."],
  "I had never seen anything like it.": ["It was unlike anything I'd ever seen."],
  "Looking back, I learned a lot from it.": ["In retrospect, it taught me a great deal."],
  "It all started when I missed the bus.": ["Missing the bus was how it all began."],
  "Then, out of nowhere, the lights went out.": ["Then the lights suddenly went out without warning."],
  "Before I knew it, everyone was laughing.": ["Suddenly, I realized that everyone was laughing."],
  "To make a long story short, we got home safely.": ["In short, we made it home safely."],
  "The funny thing is, I had the key all along.": ["The amusing part is that the key was with me the whole time."],
  "In the end, it turned out better than expected.": ["Ultimately, the result exceeded expectations."],
  "I intend to keep my promise.": ["I plan to honor my promise."],
  "My goal is to become more confident.": ["I aim to build my confidence."],
  "I have every intention of finishing it.": ["I fully intend to complete it."],
  "In case you need me, keep my number.": ["Save my number in case you need me."],
  "Had I known earlier, I would have helped.": ["I would have helped if I'd known sooner."],
  "Would you mind closing the window?": ["Could you close the window, please?"],
  "I'd appreciate it if you kept this private.": ["Please keep this confidential."],
  "Would it be possible to move the meeting?": ["Could we reschedule the meeting?"],
  "Do you have a minute?": ["Have you got a moment?", "Is now a good time?"],
  "Can I ask you something?": ["Could I ask you a quick question?"],
  "There's something I'd like to talk about.": ["I'd like to discuss something with you."],
  "How's your day going?": ["How has your day been?"],
  "What have you been up to?": ["What have you been doing lately?"],
  "I don't think we've met.": ["I believe this is our first time meeting."],
  "Mind if I join you?": ["Would it be okay if I joined you?"],
  "So, what brings you here?": ["So, what made you come here?"],
  "Long time no see.": ["It's been a while."],
  "What do you mean?": ["Could you clarify what you mean?"],
  "What do you mean by that?": ["Could you explain what you mean?"],
  "Could you say that again?": ["Could you repeat that?"],
  "Sorry, I didn't catch that.": ["Sorry, I missed what you said."],
  "There's no doubt about it.": ["I'm completely certain about it."],
  "It's hard to say for certain.": ["It's difficult to know for sure."],
  "That rings a bell.": ["That sounds familiar."],
  "I'm just pulling your leg.": ["I'm only joking with you."],
  "Let's call it a day.": ["Let's stop for today."],
  "I'm feeling under the weather.": ["I'm not feeling very well."],
  "You're on the right track.": ["You're heading in the right direction."],
  "What do you recommend?": ["What would you suggest?"],
  "How much is this?": ["What does this cost?"],
  "I'll take it.": ["I'd like to buy it."],
  "Call an ambulance!": ["Get an ambulance here!"],
  "Let me put it another way.": ["Let me rephrase that."],
  "I see.": ["I understand."],
  "That makes sense.": ["I can understand that."],
  "Fair enough.": ["That's reasonable."],
  "Good to know.": ["That's helpful to know."],
  "No way.": ["Seriously?"],
  "You're kidding.": ["You must be joking."],
  "Exactly.": ["That's right."],
  "Not necessarily.": ["That isn't always the case."],
  "That's incredible!": ["That's amazing!"],
  "I can't believe it.": ["It's hard to believe."],
  "What a surprise!": ["That's so surprising!"],
  "I completely agree.": ["I agree with you entirely."],
  "You have a point.": ["That's a valid point."],
  "We're on the same page.": ["We agree on this."],
  "Go ahead. I don't mind.": ["Sure, that's fine with me."],
  "Count me in.": ["I'd like to join."],
  "We have a deal.": ["It's a deal."],
  "Maybe another time.": ["Perhaps we can do it another day."],
  "Thank you so much.": ["Thanks a lot."],
  "I really appreciate your help.": ["Your help means a lot to me."],
  "That's very kind of you.": ["I appreciate your kindness."],
  "I owe you one.": ["I'll return the favor."],
  "That was my fault.": ["I was responsible for that."],
  "I owe you an apology.": ["I need to apologize to you."],
  "You did a great job.": ["You did excellent work."],
  "That's wonderful news.": ["That's great to hear."],
  "I'm sorry to hear that.": ["I'm sorry you're dealing with that."],
  "It's going to be okay.": ["Things will be all right."],
  "I've been there before.": ["I've visited that place before."],
  "I've never tried that.": ["That is something I haven't tried."],
  "I'm about to leave.": ["I'm just getting ready to go."],
  "You have my word.": ["I promise."],
  "You can count on me.": ["You can rely on me."],
};

/**
 * Second, more structural alternatives for sentences whose shortest wording
 * change is already used by the word-swap lane.
 */
const ADDITIONAL_PARAPHRASES: Readonly<Record<string, readonly string[]>> = {
  "I'm from Busan.": ["I come from Busan."],
  "This is my first time here.": ["I've never been here before."],
  "I don't know many people yet.": ["There aren't many people here I know yet."],
  "Let me tell you a little about myself.": ["I'd like to share a bit about myself."],
  "Really? Tell me more.": ["Really? I'd like to hear more."],
  "That sounds interesting.": ["That seems like it would be fascinating."],
  "I've always wondered about that.": ["I've been curious about that for a long time."],
  "Go on. I'm listening.": ["Please continue. You have my attention."],
  "Where did you get that?": ["Where did that come from?"],
  "When does it start?": ["What time does it begin?"],
  "Which one do you prefer?": ["Which one would you rather choose?"],
  "When you say 'soon,' how soon?": ["What exactly do you mean by 'soon'?"],
  "Just to be clear, is this free?": ["I just want to confirm: does this cost anything?"],
  "Would you mind saying that more slowly?": ["Could you slow down when you say that?"],
  "What was that again?": ["Could you repeat that?"],
  "Can you run that by me one more time?": ["Could you explain that to me again?"],
  "My impression is that they're ready.": ["They seem ready to me."],
  "I'm fairly certain she called.": ["I feel fairly sure that she called."],
  "I'm not entirely sure.": ["I still have some doubts."],
  "I could be wrong, but I think it's closed.": ["I may be mistaken, but the place seems closed."],
  "As far as I know, the plan hasn't changed.": ["To my knowledge, the plan remains the same."],
  "I'm confident we're making the right choice.": ["I believe we're choosing correctly."],
  "He must be exhausted.": ["He seems completely worn out."],
  "I wouldn't be surprised if she said no.": ["It seems quite possible that she'd say no."],
  "My guess is that we'll hear back tomorrow.": ["I expect a reply tomorrow."],
  "To give you an idea, it takes about an hour.": ["You can expect it to take around an hour."],
  "They're similar in many ways.": ["They have a lot in common."],
  "Both options have advantages.": ["Each option offers benefits."],
  "I'd rather walk than wait for a bus.": ["Walking is preferable to waiting for a bus."],
  "There's no comparison; this is much better.": ["This is clearly the better of the two."],
  "She's the kind of person who keeps her word.": ["Keeping her word is part of who she is."],
  "She's on her way.": ["She's coming now."],
  "The system is temporarily unavailable.": ["The system can't be used at the moment."],
  "I'm feeling much better today.": ["I feel much improved today."],
  "On a different note, I have some good news.": ["Changing the subject, I have good news."],
  "Not to change the subject, but we should check the time.": ["I don't mean to shift topics, but we need to check the time."],
  "I'll let you get back to work.": ["I won't take up any more of your work time."],
  "I won't keep you any longer.": ["I'll let you go now."],
  "I mean, it's not a bad idea.": ["What I'm saying is, it's actually an okay idea."],
  "Perhaps we could look at it another way.": ["Maybe there's another way to consider it."],
  "There seems to be a small problem.": ["It appears that we have a minor issue."],
  "You may want to reconsider that option.": ["It might be wise to think again about that choice."],
  "I'm gonna head out.": ["I'm leaving now."],
  "I've gotta get back to work.": ["I need to return to work."],
  "Gimme a second.": ["Give me just a moment."],
  "Kinda feels like we're stuck.": ["It seems like we may be stuck."],
  "Whaddaya think?": ["What's your take?"],
  "I'll pick you up at eight.": ["I'll come get you at eight."],
  "Can you turn the music down?": ["Could you lower the volume?"],
  "Don't put it off any longer.": ["Stop delaying it."],
  "It's not a big deal.": ["It isn't something to worry about."],
  "That rings a bell.": ["That sounds familiar to me."],
  "We'll cross that bridge when we come to it.": ["We'll deal with that issue when it arises."],
  "Who's calling, please?": ["May I ask who's speaking?"],
  "I'll call you back in ten minutes.": ["I'll return your call in ten minutes."],
  "I just sent you the details by text.": ["The details are in the text I just sent."],
  "I'd like to add one thing.": ["There's one more point I'd like to make."],
  "Can we come back to that later?": ["Could we revisit that later?"],
  "Who's responsible for the next step?": ["Who is handling the next step?"],
  "I'll send a summary after the meeting.": ["After the meeting, I'll send a recap."],
  "I need help understanding this part.": ["I need someone to explain this part."],
  "I studied, but I still found the test difficult.": ["Despite studying, I found the test difficult."],
  "Can we work on this together?": ["Could we collaborate on this?"],
  "I'd like the pasta, please.": ["I'll have the pasta, please."],
  "Can we get this to go?": ["Could you pack this for takeout?"],
  "Can I try this on?": ["Could I see how this fits?"],
  "Can I pay by card?": ["Do you accept cards?"],
  "The air conditioner isn't working.": ["The air conditioner seems to be broken."],
  "Can I leave my luggage here?": ["Is luggage storage available here?"],
  "Is it within walking distance?": ["Can we walk there from here?"],
  "I'd like to see a doctor.": ["I need an appointment with a doctor."],
  "I've had a fever since last night.": ["My fever started last night."],
  "I'm allergic to penicillin.": ["Penicillin causes an allergic reaction for me."],
  "Are there any side effects?": ["Does this cause any unwanted effects?"],
  "The symptoms haven't improved after three days.": ["After three days, the symptoms are no better."],
  "There's been an accident.": ["An accident has occurred."],
  "I can't find my child.": ["My child is missing."],
  "Sorry, I may not have explained it clearly.": ["Sorry, my explanation may not have been clear."],
  "I wasn't referring to you.": ["You weren't the person I meant."],
  "Just to correct one thing, the date is Friday.": ["One correction: the date is Friday."],
  "Let me think for a second.": ["Give me a moment to think."],
  "That's a good question.": ["That's worth thinking about."],
  "I'm not sure how to answer that.": ["I don't quite know how to respond."],
  "I need a little time to process that.": ["I need a moment to take that in."],
  "I see.": ["I understand what you mean."],
  "That's the last thing I expected.": ["I didn't expect that at all."],
  "How amazing is that?": ["Isn't that amazing?"],
  "You've got to be kidding me.": ["You can't be serious."],
  "Well, that was unexpected.": ["I wasn't expecting that."],
  "That must have been hard.": ["That sounds like it was difficult."],
  "I've been there too.": ["I've had the same experience."],
  "I'm here if you want to talk.": ["If you feel like talking, I'm available."],
  "I couldn't agree more.": ["I agree completely."],
  "I'm with you on that.": ["I agree with you."],
  "Absolutely. That's the best approach.": ["Yes, that's definitely the best approach."],
  "I agree up to a point.": ["I agree in part, but not completely."],
  "I see what you mean, although I'm not fully convinced.": ["I understand your reasoning, though I still have doubts."],
  "I can agree with the idea, but not the timing.": ["The idea works for me, but the timing doesn't."],
  "We're not that far apart on this.": ["Our positions on this are quite close."],
  "I'm not sure I agree with that.": ["I have some doubts about that."],
  "I see it a little differently.": ["My view is slightly different."],
  "That hasn't been my experience.": ["My own experience has been different."],
  "Can I sit here?": ["Is this seat available?"],
  "Is it okay if I call you later?": ["Would calling later be all right?"],
  "May I use your phone?": ["Could I borrow your phone?"],
  "Maybe we should ask first.": ["Perhaps we should check with them first."],
  "Why don't you come over this weekend?": ["How about visiting this weekend?"],
  "We're going for a walk if you'd like to come.": ["You're welcome to join our walk."],
  "Can I interest you in some coffee?": ["Would you care for some coffee?"],
  "You're more than welcome to stay.": ["Please feel free to stay."],
  "I'd love it if you could make it.": ["I really hope you can come."],
  "Whatever you do, don't rush the decision.": ["Take your time making the decision."],
  "You'd be wise to get a second opinion.": ["Getting another opinion would be sensible."],
  "Can I help you with that?": ["Would some assistance help?"],
  "Would you like me to check?": ["Should I check it for you?"],
  "Sure, I'd love to.": ["Yes, that would be great."],
  "I appreciate the offer, and I'll take you up on it.": ["Thank you; I accept the offer."],
  "As much as I'd like to, I have to say no.": ["I wish I could, but I have to decline."],
  "I appreciate the offer, but I'll pass.": ["Thanks, though I won't accept."],
  "How about a video call?": ["Could we talk by video instead?"],
  "Another option is to take a taxi.": ["We could also take a taxi."],
  "We don't have to decide today.": ["The decision can wait until later."],
  "That's more than we were hoping to spend.": ["It exceeds our budget."],
  "I can't thank you enough.": ["I'm extremely grateful."],
  "I'm sorry I'm late.": ["Please forgive the delay."],
  "I owe you an apology.": ["I should apologize."],
  "I'm sorry for the misunderstanding.": ["I apologize for the confusion."],
  "I love what you've done with the place.": ["The place looks wonderful after your changes."],
  "That was very thoughtful of you.": ["That was such a considerate gesture."],
  "Here's to your new beginning.": ["Cheers to a fresh start."],
  "All your hard work paid off.": ["Your effort brought results."],
  "You don't have to go through this alone.": ["You have support while you deal with this."],
  "I'm thinking of you.": ["You're in my thoughts."],
  "Whatever you need, I'm here for you.": ["I'll support you however I can."],
  "This isn't what I ordered.": ["My order was something else."],
  "We may have overlooked an important detail.": ["It's possible that we missed a key detail."],
  "I'm concerned about the deadline.": ["The deadline worries me."],
  "This could cause delays later.": ["This may lead to delays down the road."],
  "I hate to bring this up, but the numbers don't match.": ["Sorry to raise this, but the figures don't match."],
  "I'd like to return this.": ["I want to bring this back for a refund."],
  "Can I exchange this for a different size?": ["Could I swap this for another size?"],
  "It doesn't work as advertised.": ["It doesn't perform the way the ad says it will."],
  "She always checks the weather first.": ["Checking the forecast is the first thing she does."],
  "I've gotten into the habit of walking after dinner.": ["Walking after dinner has become a habit for me."],
  "It's become part of my daily routine.": ["It's now a regular part of my everyday life."],
  "That was the best trip I've ever taken.": ["I've never taken a better trip."],
  "At first, everything seemed fine.": ["Initially, nothing seemed wrong."],
  "I'm going to stay home tonight.": ["My plan for tonight is to stay home."],
  "We're meeting at six.": ["Our meeting is at six."],
  "I'm planning to visit next month.": ["I plan to visit next month."],
  "We're supposed to hear back tomorrow.": ["We expect an update tomorrow."],
  "I haven't decided what to do yet.": ["I'm still undecided about what to do."],
  "The plan is to finish by Friday.": ["We aim to have it done by Friday."],
  "I'm determined to make it work.": ["I won't give up on making it work."],
  "One day, I'd love to live abroad.": ["Living abroad someday is a dream of mine."],
  "I'll be there on time.": ["I promise to arrive on time."],
  "I won't tell anyone.": ["This will stay between us."],
  "I'll make it up to you.": ["I'll do something to compensate."],
  "You can count on me.": ["I'll be dependable."],
  "I'll do my best not to let you down.": ["I'll try hard not to disappoint you."],
  "Whatever happens, I'll keep my end of the bargain.": ["No matter what, I'll honor our agreement."],
  "I'll go as long as you come with me.": ["I'll go provided that you come too."],
  "Unless we leave now, we'll be late.": ["We need to leave now to be on time."],
  "What if the plan doesn't work?": ["What will we do if the plan fails?"],
  "Can you hold this for a second?": ["Could you hold this briefly?"],
  "Do you think you could come a little earlier?": ["Would arriving a little earlier be possible for you?"],
};

const REFINED_PARAPHRASES: Readonly<Record<string, readonly string[]>> = {
  "I'm doing pretty well, thanks.": ["I'm doing quite well, thank you."],
  "It's been a busy week.": ["This week has been really busy."],
  "I'm here on vacation.": ["I'm here for a holiday."],
  "I've just moved to this area.": ["I moved to this neighborhood recently."],
  "That's something I'm interested in too.": ["I'm interested in that as well."],
  "Personally, I'd choose the first one.": ["My personal choice would be the first option."],
  "If you ask me, it's too expensive.": ["In my view, the price is too high."],
  "Maybe he's running late.": ["He may be running behind."],
  "Chances are, it'll be crowded.": ["It will probably be crowded."],
  "That's why I changed my mind.": ["That explains why I decided differently."],
  "I chose this one mainly because it's simpler.": ["Its simplicity is the main reason I chose it."],
  "I couldn't come due to a family matter.": ["A family matter kept me from coming."],
  "Let's say you miss the last bus.": ["Imagine that you miss the last bus."],
  "Here's a simple example of what I mean.": ["This is a simple example of what I'm talking about."],
  "This one is cheaper than the other one.": ["Compared with the other one, this one costs less."],
  "Unlike the old model, this one is quiet.": ["This model is quiet, unlike the old one."],
  "She's easy to talk to.": ["Talking with her feels comfortable."],
  "The design is simple but practical.": ["The design combines simplicity with practicality."],
  "What stands out is the attention to detail.": ["The attention to detail is what catches your eye."],
  "We're almost ready.": ["It won't be long before we're ready."],
  "I'm in the middle of something.": ["I'm busy with something at the moment."],
  "I'm feeling much better today.": ["My condition has improved a lot today."],
  "I'll talk to you later.": ["I'll speak with you again later."],
  "Actually, I changed my mind.": ["As it turns out, I've reconsidered."],
  "As I was saying, the first step is easy.": ["As I mentioned, the initial step is uncomplicated."],
  "I'm not sure that's the best idea.": ["I doubt that's the best plan."],
  "I don't suppose you could help me?": ["Would it be possible for you to help me?"],
  "She came up with a great idea.": ["She thought of an excellent idea."],
  "Lemme check real quick.": ["Let me take a quick look."],
  "We need to get the ball rolling.": ["It's time for us to get started."],
  "I'm sorry, he's not available right now.": ["I'm sorry, he can't come to the phone at the moment."],
  "We need to make a decision by the end of today.": ["We have to decide before today ends."],
  "We need help right away.": ["Immediate assistance is required."],
  "That's not quite what I meant.": ["That's a little different from what I intended."],
  "I think there's been a misunderstanding.": ["It seems that we misunderstood one another."],
  "I can see why you're upset.": ["It's understandable that you're upset."],
  "I'm sorry you're going through that.": ["I'm sorry you're dealing with that."],
  "That sounds really frustrating.": ["That must be really annoying."],
  "That's exactly what I think.": ["I think exactly the same thing."],
  "That sounds right to me.": ["I agree with that assessment."],
  "That's true, but there's another side to it.": ["That's true, although there's another perspective."],
  "That's fair, though I see it a little differently.": ["That's reasonable, but my view is a little different."],
  "I'm afraid I can't support that idea.": ["I'm sorry, but I can't back that proposal."],
  "I'd rather you didn't mention it yet.": ["I'd prefer you not to mention it yet."],
  "One option would be to postpone it.": ["Postponing it would be one possibility."],
  "My advice is to keep it simple.": ["I recommend keeping it simple."],
  "Leave it with me. I'll take care of it.": ["I'll handle it, so you can leave it with me."],
  "I'm happy to help if you need anything.": ["I'm available to help with anything you need."],
  "I'd be happy to help.": ["I'd be pleased to give you a hand."],
  "That sounds like a great idea.": ["That suggestion sounds excellent."],
  "I'm sorry, but I can't.": ["Sorry, I'm unable to."],
  "I'd rather not, if that's okay.": ["I'd prefer not to, if that's all right."],
  "I'm afraid that won't be possible.": ["Unfortunately, that isn't possible."],
  "Failing that, we'll use the backup plan.": ["If that fails, we'll fall back on the backup plan."],
  "Could you do a little better than that?": ["Could you improve that offer a little?"],
  "That seems like a fair compromise.": ["That strikes me as a balanced solution."],
  "Please accept my sincere thanks.": ["You have my heartfelt gratitude."],
  "I didn't mean to upset you.": ["I'm sorry; upsetting you wasn't my intention."],
  "You're really good at this.": ["You have a real talent for this."],
  "You make it look easy.": ["You make this seem effortless."],
  "I'm so happy for you.": ["Your news makes me so happy."],
  "You should be proud of yourself.": ["You have every reason to feel proud."],
  "Please accept my warmest congratulations.": ["My warmest congratulations to you."],
  "There's no right way to feel right now.": ["However you feel right now is valid."],
  "I'm not happy with this service.": ["This service has disappointed me."],
  "I'm afraid this still hasn't been fixed.": ["Unfortunately, this still isn't repaired."],
  "I'd like to make a formal complaint.": ["I want to file a formal complaint."],
  "There's a problem with the schedule.": ["The schedule has an issue."],
  "Something doesn't seem right here.": ["Something here feels wrong."],
  "There's a larger issue we haven't discussed yet.": ["There's a bigger problem we still need to discuss."],
  "I'd prefer store credit if a refund isn't possible.": ["If a refund can't be issued, store credit is my preference."],
  "I don't drink coffee very often.": ["I rarely drink coffee."],
  "The last time I went, it was crowded.": ["It was crowded the last time I visited."],
  "You'll never guess what happened.": ["What happened will surprise you."],
  "Barring any problems, we'll start next week.": ["We'll begin next week if no problems arise."],
  "I'd like to learn something new.": ["Learning something new is what I want."],
  "I'm hoping to see you soon.": ["I hope to see you before long."],
  "You can borrow it provided that you're careful.": ["You may borrow it as long as you handle it carefully."],
  "Could you help me with this?": ["Could you give me a hand with this?"],
  "Could I ask you a favor?": ["Would you do me a favor?"],
  "Please let me know when you're ready.": ["Tell me once you're ready, please."],
};

/**
 * Grammatical glue words do not make a useful vocabulary substitution by
 * themselves. A word-swap candidate must replace at least one content word
 * with another content word after these are removed.
 */
const FUNCTION_WORDS = new Set([
  "a", "an", "the", "this", "that", "these", "those",
  "i", "me", "my", "mine", "myself", "you", "your", "yours", "yourself", "yourselves",
  "he", "him", "his", "himself", "she", "her", "hers", "herself", "it", "its", "itself",
  "we", "us", "our", "ours", "ourselves", "they", "them", "their", "theirs", "themselves",
  "who", "whom", "whose", "what", "which", "where", "when", "why", "how",
  "am", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "having", "do", "does", "did", "doing",
  "can", "could", "may", "might", "must", "shall", "should", "will", "would",
  "and", "but", "or", "nor", "so", "yet", "if", "because", "although", "though", "while",
  "as", "at", "by", "for", "from", "in", "into", "of", "on", "onto", "to", "with", "without",
  "about", "above", "after", "before", "behind", "below", "between", "during", "over", "under",
  "again", "all", "any", "both", "each", "either", "enough", "every", "few", "many", "much",
  "neither", "no", "none", "not", "one", "other", "several", "some", "such",
  "here", "there", "then", "than", "too", "also", "only", "just",
]);

function canonicalSurfaceForm(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[‘’]/g, "'")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\bcan't\b/g, "can not")
    .replace(/\bshan't\b/g, "shall not")
    .replace(/\b(\p{L}+)'m\b/gu, "$1 am")
    .replace(/\b(\p{L}+)'re\b/gu, "$1 are")
    .replace(/\b(\p{L}+)'ve\b/gu, "$1 have")
    .replace(/\b(\p{L}+)'ll\b/gu, "$1 will")
    .replace(/\b(\p{L}+)'d\b/gu, "$1 would")
    .replace(/\b(\p{L}+)'s\b/gu, "$1 is")
    .replace(/\b(\p{L}+)n't\b/gu, "$1 not")
    .replace(/\bgonna\b/g, "going to")
    .replace(/\bgotta\b/g, "have to")
    .replace(/\bwanna\b/g, "want to")
    .replace(/\bdunno\b/g, "do not know")
    .replace(/\bwhaddaya\b/g, "what do you")
    .replace(/\bcongrats\b/g, "congratulations")
    .replace(/\bthanks\b/g, "thank you")
    .replace(/\bworth trying\b/g, "worth try")
    .replace(/\bworth a try\b/g, "worth try")
    .replace(/\bmore slowly\b/g, "slow")
    .replace(/\bslower\b/g, "slow")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const IRREGULAR_LEXEMES: Readonly<Record<string, string>> = {
  best: "good",
  better: "good",
  brought: "bring",
  felt: "feel",
  found: "find",
  gone: "go",
  got: "get",
  gotten: "get",
  left: "leave",
  made: "make",
  saw: "see",
  seen: "see",
  taken: "take",
  thought: "think",
  told: "tell",
  took: "take",
  went: "go",
  worse: "bad",
  worst: "bad",
  written: "write",
};

function canonicalLexeme(token: string): string {
  const irregular = IRREGULAR_LEXEMES[token];
  if (irregular) return irregular;
  if (token === "walkable") return "walk";

  let stem = token;
  if (stem.length > 5 && stem.endsWith("ingly")) stem = stem.slice(0, -5);
  else if (stem.length > 4 && stem.endsWith("ly")) stem = stem.slice(0, -2);

  if (stem.length > 5 && stem.endsWith("ying")) stem = `${stem.slice(0, -4)}y`;
  else if (stem.length > 5 && stem.endsWith("ing")) stem = stem.slice(0, -3);
  else if (stem.length > 4 && stem.endsWith("ied")) stem = `${stem.slice(0, -3)}y`;
  else if (stem.length > 4 && stem.endsWith("ed")) stem = stem.slice(0, -2);
  else if (stem.length > 4 && stem.endsWith("ies")) stem = `${stem.slice(0, -3)}y`;
  else if (stem.length > 4 && stem.endsWith("est")) stem = stem.slice(0, -3);
  else if (stem.length > 4 && stem.endsWith("er")) stem = stem.slice(0, -2);
  else if (stem.length > 3 && stem.endsWith("s") && !stem.endsWith("ss")) stem = stem.slice(0, -1);

  if (/(.)\1$/.test(stem)) stem = stem.slice(0, -1);
  if (stem.length > 4 && stem.endsWith("e")) stem = stem.slice(0, -1);
  return stem;
}

function lexicalTokens(value: string): string[] {
  return canonicalSurfaceForm(value)
    .split(" ")
    .filter((token) => token && !FUNCTION_WORDS.has(token))
    .map(canonicalLexeme);
}

function tokenCounts(tokens: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

/**
 * A meaningful word swap removes a content word and introduces another one.
 * This deliberately rejects contractions, auxiliary-only changes, casing,
 * punctuation, and candidates that merely add grammatical filler.
 */
export function isMeaningfulWordSwap(original: string, candidate: string): boolean {
  if (canonicalSurfaceForm(original) === canonicalSurfaceForm(candidate)) return false;

  const originalCounts = tokenCounts(lexicalTokens(original));
  const candidateCounts = tokenCounts(lexicalTokens(candidate));
  let removedContentWord = false;
  let addedContentWord = false;

  for (const [token, count] of originalCounts) {
    if (count > (candidateCounts.get(token) ?? 0)) removedContentWord = true;
  }
  for (const [token, count] of candidateCounts) {
    if (count > (originalCounts.get(token) ?? 0)) addedContentWord = true;
  }

  return removedContentWord && addedContentWord;
}

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ");
}

function capitalize(value: string): string {
  return value ? `${value[0].toLocaleUpperCase("en-US")}${value.slice(1)}` : value;
}

function lowercaseInitial(value: string): string {
  if (!value || /^I(?:\b|')/.test(value)) return value;
  return `${value[0].toLocaleLowerCase("en-US")}${value.slice(1)}`;
}

function usesAn(word: string): boolean {
  const normalized = word.toLocaleLowerCase("en-US");
  if (/^(?:heir|honest|honor|hour)/.test(normalized)) return true;
  if (/^(?:euro|one|once|uni|use|user|usual|url)/.test(normalized)) return false;
  return /^[aeiou]/.test(normalized);
}

function repairIndefiniteArticles(value: string): string {
  return value.replace(/\b(a|an)\s+([a-z][\w-]*)/gi, (match, article: string, word: string) => {
    const expected = usesAn(word) ? "an" : "a";
    if (article.toLocaleLowerCase("en-US") === expected) return match;
    const corrected = /^\p{Lu}/u.test(article) ? capitalize(expected) : expected;
    return `${corrected} ${word}`;
  });
}

function applyRule(value: string, rule: TextRule): string {
  rule.pattern.lastIndex = 0;
  const replaced = value.replace(rule.pattern, (match) => {
    const startsUppercase = /^\p{Lu}/u.test(match);
    return startsUppercase ? capitalize(rule.replacement) : rule.replacement;
  });
  return repairIndefiniteArticles(replaced);
}

function applyRules(value: string, rules: readonly TextRule[]): string[] {
  const candidates: string[] = [];
  const claimedRanges: Array<readonly [start: number, end: number]> = [];
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    const match = rule.pattern.exec(value);
    if (!match || match.index === undefined) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (claimedRanges.some(([claimedStart, claimedEnd]) => start < claimedEnd && end > claimedStart)) {
      continue;
    }
    claimedRanges.push([start, end]);
    candidates.push(applyRule(value, rule));
  }
  return candidates;
}

function applyMultipleRules(value: string, rules: readonly TextRule[]): string[] {
  let candidate = value;
  let changes = 0;

  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    if (!rule.pattern.test(candidate)) continue;
    candidate = applyRule(candidate, rule);
    changes += 1;
    if (changes === 2) break;
  }

  return changes >= 2 ? [candidate] : [];
}

function structuralParaphrases(english: string): string[] {
  const candidates: string[] = [];
  const add = (value: string | undefined) => {
    if (value) candidates.push(value);
  };
  let match: RegExpMatchArray | null;

  if ((match = english.match(/^Do you have (.+)\?$/))) add(`Have you got ${match[1]}?`);
  if ((match = english.match(/^Can I (.+)\?$/))) add(`Could I ${match[1]}?`);
  if ((match = english.match(/^Could I (.+)\?$/))) add(`Would it be possible for me to ${match[1]}?`);
  if ((match = english.match(/^Can you (.+)\?$/))) add(`Could you ${match[1]}?`);
  if ((match = english.match(/^Could you (.+)\?$/))) add(`Would you be able to ${match[1]}?`);
  if ((match = english.match(/^Can we (.+)\?$/))) add(`Could we ${match[1]}?`);
  if ((match = english.match(/^Could we (.+)\?$/))) add(`Would it be possible to ${match[1]}?`);
  if ((match = english.match(/^Would you like to (.+)\?$/))) add(`Do you want to ${match[1]}?`);
  if ((match = english.match(/^Do you want to (.+)\?$/))) add(`Would you like to ${match[1]}?`);
  if ((match = english.match(/^Why don't we (.+)\?$/))) add(`How about we ${match[1]}?`);
  if ((match = english.match(/^Let's (.+)\.$/))) add(`Why don't we ${match[1]}?`);
  if ((match = english.match(/^I think (.+)\.$/))) add(`It seems to me that ${match[1]}.`);
  if ((match = english.match(/^I don't think (.+)\.$/))) add(`I doubt ${match[1]}.`);
  if ((match = english.match(/^I'm sure (.+)\.$/))) add(`I'm certain ${match[1]}.`);
  if ((match = english.match(/^I need to (.+)\.$/))) add(`I have to ${match[1]}.`);
  if ((match = english.match(/^We need to (.+)\.$/))) add(`We have to ${match[1]}.`);
  if ((match = english.match(/^You should (.+)\.$/))) add(`It would be a good idea to ${match[1]}.`);
  if ((match = english.match(/^It looks like (.+)\.$/))) add(`It seems that ${match[1]}.`);
  if ((match = english.match(/^Maybe (.+)\.$/))) add(`Perhaps ${match[1]}.`);
  if ((match = english.match(/^How do I (.+)\?$/))) add(`What's the best way for me to ${match[1]}?`);
  if ((match = english.match(/^How much is (.+)\?$/))) add(`What does ${match[1]} cost?`);
  if ((match = english.match(/^What time is (.+)\?$/))) add(`When is ${match[1]}?`);
  if ((match = english.match(/^Where is (.+)\?$/))) add(`Where can I find ${match[1]}?`);
  if ((match = english.match(/^Do I need (.+)\?$/))) add(`Is ${match[1]} necessary?`);
  if ((match = english.match(/^Is (.+) included\?$/))) add(`Does ${match[1]} come with it?`);
  if ((match = english.match(/^Please (.+)\.$/))) add(`Could you please ${match[1]}?`);
  if ((match = english.match(/^Make sure you (.+)\.$/))) add(`Be sure to ${match[1]}.`);
  if ((match = english.match(/^Feel free to (.+)\.$/))) add(`You are welcome to ${match[1]}.`);
  if ((match = english.match(/^I hope (.+)\.$/))) add(`Hopefully, ${match[1]}.`);
  if ((match = english.match(/^I promise (.+)\.$/))) add(`You have my word that ${match[1]}.`);
  if ((match = english.match(/^The reason (.+) is that (.+)\.$/))) add(`${capitalize(match[1])} because ${match[2]}.`);
  if ((match = english.match(/^(.+) because (.+)\.$/))) add(`Because ${match[2]}, ${lowercaseInitial(match[1])}.`);
  if ((match = english.match(/^Since (.+), (.+)\.$/))) add(`${capitalize(match[2])} because ${match[1]}.`);
  if ((match = english.match(/^Even if (.+), (.+)\.$/))) add(`${capitalize(match[2])}, even if ${match[1]}.`);
  if ((match = english.match(/^If (.+), (.+)\.$/))) add(`${capitalize(match[2])} if ${match[1]}.`);

  return candidates;
}

function uniqueCandidates(
  candidates: readonly string[],
  original: string,
): string[] {
  const originalKey = normalize(original);
  const seen = new Set([originalKey]);
  const unique: string[] = [];
  for (const rawCandidate of candidates) {
    const candidate = rawCandidate.trim().replace(/\s+/g, " ");
    const key = normalize(candidate);
    if (!candidate || seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}

function toVariations(
  kind: PracticeVariationKind,
  korean: string,
  candidates: readonly string[],
): PracticeVariation[] {
  return candidates.slice(0, MAX_VARIATIONS_PER_LANE).map((english) => ({
    kind,
    english,
    korean,
  }));
}

/**
 * Build two card-local practice lanes. No neighboring card can enter either
 * lane: every result is derived from the active sentence itself.
 */
export function buildPracticeVariationDeck(
  pattern: Pick<ConversationPattern, "english" | "korean">,
): PracticeVariationDeck {
  const lexicalCandidates = uniqueCandidates(
    applyRules(pattern.english, WORD_SWAP_RULES),
    pattern.english,
  ).filter((candidate) => isMeaningfulWordSwap(pattern.english, candidate));
  const lexicalKeys = new Set(lexicalCandidates.map(normalize));
  const paraphraseCandidates = uniqueCandidates(
    [
      ...(REFINED_PARAPHRASES[pattern.english] ?? []),
      ...(EXACT_PARAPHRASES[pattern.english] ?? []),
      ...(ADDITIONAL_PARAPHRASES[pattern.english] ?? []),
      ...structuralParaphrases(pattern.english),
      ...applyMultipleRules(pattern.english, [
        ...WORD_SWAP_RULES,
        ...GRAMMATICAL_FORM_RULES,
      ]),
    ],
    pattern.english,
  ).filter((candidate) => !lexicalKeys.has(normalize(candidate)));

  return {
    wordSwaps: toVariations("word-swap", pattern.korean, lexicalCandidates),
    paraphrases: toVariations("paraphrase", pattern.korean, paraphraseCandidates),
  };
}
