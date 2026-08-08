import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  CefrLevel,
  ContentPack,
  ConversationPattern,
  PatternPriority,
  ReplyType,
  SpeechRegister,
  TaxonomyItem,
} from "../src/content/schema";
import { makeEmptyRelations } from "../src/content/schema";
import { packsDirectory, stableJson } from "./lib/content-tools";

type Pair = readonly [english: string, korean: string];
type ReplyStyle = "greeting" | "question" | "statement" | "request" | "reaction" | "closing" | "service" | "urgent";

interface SeedArea {
  id: string;
  labelKo: string;
  labelEn: string;
  situation: string;
  situationKo: string;
  situationEn: string;
  replyStyle: ReplyStyle;
  phrases: readonly Pair[];
}

const area = (
  id: string,
  labelKo: string,
  labelEn: string,
  situation: string,
  situationKo: string,
  situationEn: string,
  replyStyle: ReplyStyle,
  phrases: readonly Pair[],
): SeedArea => ({ id, labelKo, labelEn, situation, situationKo, situationEn, replyStyle, phrases });

const areas: SeedArea[] = [
  area("conversation-start", "대화 시작", "Starting a conversation", "daily", "일상", "Daily life", "question", [
    ["Do you have a minute?", "잠깐 시간 있어요?"],
    ["Can I ask you something?", "뭐 하나 물어봐도 돼요?"],
    ["There's something I'd like to talk about.", "이야기하고 싶은 게 있어요."],
    ["How's your day going?", "오늘 하루 어때요?"],
    ["What have you been up to?", "그동안 뭐 하고 지냈어요?"],
    ["I don't think we've met.", "우리 처음 보는 것 같아요."],
    ["Mind if I join you?", "같이 있어도 될까요?"],
    ["So, what brings you here?", "그런데 여기엔 무슨 일로 오셨어요?"],
  ]),
  area("greetings", "인사와 안부", "Greetings and well-being", "daily", "일상", "Daily life", "greeting", [
    ["Good morning. How are you?", "좋은 아침이에요. 잘 지내세요?"],
    ["It's good to see you.", "만나서 반가워요."],
    ["Long time no see.", "정말 오랜만이에요."],
    ["How have you been?", "그동안 어떻게 지냈어요?"],
    ["I'm doing pretty well, thanks.", "저는 꽤 잘 지내요, 고마워요."],
    ["Not bad. How about you?", "나쁘지 않아요. 당신은요?"],
    ["It's been a busy week.", "바쁜 한 주였어요."],
    ["Take care on your way home.", "조심해서 들어가세요."],
  ]),
  area("self-introduction", "자기소개", "Introducing yourself", "social", "사교", "Social", "statement", [
    ["My name is Mina.", "제 이름은 미나예요."],
    ["I'm from Busan.", "저는 부산에서 왔어요."],
    ["I work in healthcare.", "저는 의료 분야에서 일해요."],
    ["I'm here on vacation.", "휴가차 여기 왔어요."],
    ["I've just moved to this area.", "저는 이 동네로 막 이사 왔어요."],
    ["This is my first time here.", "여기는 처음이에요."],
    ["I don't know many people yet.", "아직 아는 사람이 많지 않아요."],
    ["Let me tell you a little about myself.", "제 소개를 조금 해볼게요."],
  ]),
  area("showing-interest", "관심 표현", "Showing interest", "social", "사교", "Social", "reaction", [
    ["Really? Tell me more.", "정말요? 더 이야기해 주세요."],
    ["That sounds interesting.", "흥미롭게 들리네요."],
    ["How did you get into that?", "그건 어떻게 시작하게 됐어요?"],
    ["What do you like most about it?", "그중에서 뭐가 가장 좋아요?"],
    ["I'd love to hear the whole story.", "이야기를 전부 듣고 싶어요."],
    ["I've always wondered about that.", "그게 늘 궁금했어요."],
    ["That's something I'm interested in too.", "저도 관심 있는 분야예요."],
    ["Go on. I'm listening.", "계속 말해요. 듣고 있어요."],
  ]),
  area("basic-questions", "질문 만들기", "Building questions", "daily", "일상", "Daily life", "question", [
    ["What do you mean?", "무슨 뜻이에요?"],
    ["Where did you get that?", "그건 어디서 구했어요?"],
    ["When does it start?", "언제 시작해요?"],
    ["Who told you about it?", "그 이야기는 누구한테 들었어요?"],
    ["Why did you decide to go?", "왜 가기로 결정했어요?"],
    ["How does this work?", "이건 어떻게 작동해요?"],
    ["Which one do you prefer?", "어느 쪽이 더 좋아요?"],
    ["Is there anything else I should know?", "제가 더 알아야 할 게 있나요?"],
  ]),
  area("follow-up-questions", "추가 질문", "Follow-up questions", "daily", "일상", "Daily life", "question", [
    ["What happened after that?", "그다음에는 어떻게 됐어요?"],
    ["How did that make you feel?", "그 일로 기분이 어땠어요?"],
    ["What did you do next?", "그다음엔 뭘 했어요?"],
    ["Why do you think that happened?", "왜 그런 일이 생겼다고 생각해요?"],
    ["Could you give me an example?", "예를 하나 들어줄 수 있어요?"],
    ["What do you mean by that?", "그 말은 무슨 뜻이에요?"],
    ["Has that happened before?", "전에도 그런 적이 있어요?"],
    ["And how did it turn out?", "그래서 결과는 어떻게 됐어요?"],
  ]),
  area("meaning-check", "의미 확인", "Checking meaning", "daily", "일상", "Daily life", "question", [
    ["Do you mean this one?", "이걸 말하는 거예요?"],
    ["Are you saying we should wait?", "기다려야 한다는 말이에요?"],
    ["So, you mean it's already done?", "그러니까 이미 끝났다는 뜻이에요?"],
    ["If I understand correctly, we leave at six.", "제가 맞게 이해했다면 6시에 출발하는 거죠."],
    ["When you say 'soon,' how soon?", "곧이라고 하면 어느 정도를 말해요?"],
    ["Does that mean I need an appointment?", "그러면 예약이 필요하다는 뜻인가요?"],
    ["Just to be clear, is this free?", "확실히 하자면, 이건 무료인가요?"],
    ["Am I understanding you right?", "제가 제대로 이해한 게 맞나요?"],
  ]),
  area("ask-repeat", "다시 말해 달라고 하기", "Asking for repetition", "conversation", "대화", "Conversation", "request", [
    ["Could you say that again?", "다시 한 번 말씀해 주시겠어요?"],
    ["Sorry, I didn't catch that.", "죄송하지만, 잘 못 들었어요."],
    ["Could you repeat the last part?", "마지막 부분을 다시 말해 주시겠어요?"],
    ["Would you mind saying that more slowly?", "조금 더 천천히 말씀해 주시겠어요?"],
    ["What was that again?", "그게 뭐였죠?"],
    ["I missed what you said after that.", "그다음에 한 말을 놓쳤어요."],
    ["Could you spell that for me?", "철자를 불러 주시겠어요?"],
    ["Can you run that by me one more time?", "그걸 한 번만 더 설명해 줄래요?"],
  ]),
  area("correct-misunderstanding", "잘못 이해한 내용 수정", "Correcting misunderstandings", "conversation", "대화", "Conversation", "statement", [
    ["That's not quite what I meant.", "제가 말한 뜻은 그게 아니에요."],
    ["I think there's been a misunderstanding.", "오해가 있었던 것 같아요."],
    ["What I meant was tomorrow, not today.", "제가 말한 건 오늘이 아니라 내일이었어요."],
    ["Sorry, I may not have explained it clearly.", "미안해요, 제가 명확하게 설명하지 못했나 봐요."],
    ["Let me put it another way.", "다르게 말해 볼게요."],
    ["I wasn't referring to you.", "당신을 두고 한 말이 아니었어요."],
    ["We might be talking about different things.", "서로 다른 걸 이야기하고 있는지도 몰라요."],
    ["Just to correct one thing, the date is Friday.", "한 가지만 바로잡으면, 날짜는 금요일이에요."],
  ]),
  area("thinking-time", "생각할 시간 벌기", "Buying thinking time", "conversation", "대화", "Conversation", "statement", [
    ["Let me think for a second.", "잠깐 생각해 볼게요."],
    ["That's a good question.", "좋은 질문이네요."],
    ["How should I put this?", "이걸 어떻게 말해야 할까요?"],
    ["Give me a moment to think.", "생각할 시간을 잠깐 주세요."],
    ["Off the top of my head, I'd say no.", "지금 바로 떠오르는 답은 아니에요."],
    ["I'm not sure how to answer that.", "그건 어떻게 답해야 할지 모르겠어요."],
    ["Let me get back to you on that.", "그건 확인해서 다시 알려드릴게요."],
    ["I need a little time to process that.", "그걸 받아들이고 생각할 시간이 조금 필요해요."],
  ]),
  area("short-reactions", "짧은 반응", "Short reactions", "conversation", "대화", "Conversation", "reaction", [
    ["I see.", "그렇군요."],
    ["That makes sense.", "말이 되네요."],
    ["Fair enough.", "그 정도면 납득돼요."],
    ["Good to know.", "알아두면 좋겠네요."],
    ["No way.", "설마요."],
    ["You're kidding.", "농담이죠?"],
    ["Exactly.", "바로 그거예요."],
    ["Not necessarily.", "꼭 그런 건 아니에요."],
  ]),
  area("surprise", "놀람과 감탄", "Surprise and exclamation", "social", "사교", "Social", "reaction", [
    ["That's incredible!", "정말 대단해요!"],
    ["I can't believe it.", "믿을 수가 없어요."],
    ["What a surprise!", "정말 놀랍네요!"],
    ["You actually did it!", "정말 해냈네요!"],
    ["That's the last thing I expected.", "정말 전혀 예상하지 못했어요."],
    ["How amazing is that?", "정말 놀랍지 않아요?"],
    ["You've got to be kidding me.", "설마 농담이겠죠."],
    ["Well, that was unexpected.", "이건 예상 밖이었네요."],
  ]),
  area("empathy", "공감", "Empathy", "social", "사교", "Social", "reaction", [
    ["I know how you feel.", "어떤 기분인지 알아요."],
    ["That must have been hard.", "정말 힘들었겠어요."],
    ["I can see why you're upset.", "왜 속상한지 알 것 같아요."],
    ["I'm sorry you're going through that.", "그런 일을 겪고 있다니 마음이 안 좋아요."],
    ["You have every right to feel that way.", "그렇게 느끼는 게 당연해요."],
    ["That sounds really frustrating.", "정말 답답했겠네요."],
    ["I've been there too.", "저도 그런 적이 있어요."],
    ["I'm here if you want to talk.", "이야기하고 싶으면 제가 들어줄게요."],
  ]),
  area("agreement", "동의", "Agreement", "conversation", "대화", "Conversation", "statement", [
    ["I completely agree.", "전적으로 동의해요."],
    ["That's exactly what I think.", "제 생각도 딱 그래요."],
    ["You have a point.", "일리가 있어요."],
    ["I couldn't agree more.", "정말 전적으로 동의해요."],
    ["We're on the same page.", "우리 생각이 같네요."],
    ["That sounds right to me.", "제 생각에도 맞는 것 같아요."],
    ["I'm with you on that.", "그 점에서는 당신과 같은 생각이에요."],
    ["Absolutely. That's the best approach.", "물론이죠. 그게 가장 좋은 방법이에요."],
  ]),
  area("partial-agreement", "부분 동의", "Partial agreement", "conversation", "대화", "Conversation", "statement", [
    ["I agree up to a point.", "어느 정도까지는 동의해요."],
    ["That's true, but there's another side to it.", "그건 맞지만 다른 측면도 있어요."],
    ["I see what you mean, although I'm not fully convinced.", "무슨 말인지는 알지만 완전히 납득되진 않아요."],
    ["You may be right about that part.", "그 부분은 당신 말이 맞을 수도 있어요."],
    ["I mostly agree, with one exception.", "한 가지 예외를 빼면 대체로 동의해요."],
    ["I can agree with the idea, but not the timing.", "생각에는 동의하지만 시기에는 동의하지 않아요."],
    ["That's fair, though I see it a little differently.", "그건 타당하지만 저는 조금 다르게 봐요."],
    ["We're not that far apart on this.", "이 문제에 대한 우리 생각이 아주 다른 건 아니에요."],
  ]),
  area("polite-disagreement", "정중한 반대", "Polite disagreement", "conversation", "대화", "Conversation", "statement", [
    ["I'm not sure I agree with that.", "그 점에는 동의하기 어려운 것 같아요."],
    ["I see it a little differently.", "저는 조금 다르게 봐요."],
    ["I understand your point, but I have some concerns.", "말씀은 이해하지만 몇 가지 우려가 있어요."],
    ["That hasn't been my experience.", "제 경험은 그렇지 않았어요."],
    ["Could there be another explanation?", "다른 설명도 가능하지 않을까요?"],
    ["I respectfully disagree.", "죄송하지만 저는 의견이 다릅니다."],
    ["I'm afraid I can't support that idea.", "유감이지만 그 생각에는 동의하기 어려워요."],
    ["Let's agree to disagree.", "서로 의견이 다르다는 걸 인정하기로 해요."],
  ]),
  area("opinions", "의견 표현", "Expressing opinions", "conversation", "대화", "Conversation", "statement", [
    ["I think it's worth a try.", "한번 해볼 만하다고 생각해요."],
    ["In my opinion, we should wait.", "제 생각에는 기다리는 게 좋겠어요."],
    ["The way I see it, we have two options.", "제가 보기에는 선택지가 두 가지예요."],
    ["Personally, I'd choose the first one.", "개인적으로는 첫 번째 것을 고르겠어요."],
    ["From my perspective, the timing is right.", "제 관점에서는 시기가 적절해요."],
    ["If you ask me, it's too expensive.", "제 생각을 묻는다면, 너무 비싸요."],
    ["My impression is that they're ready.", "제 인상으로는 그들이 준비된 것 같아요."],
    ["I tend to think the simpler plan is better.", "저는 더 단순한 계획이 낫다고 보는 편이에요."],
  ]),
  area("certainty", "확신과 불확실성", "Certainty and uncertainty", "conversation", "대화", "Conversation", "statement", [
    ["I'm sure it'll work out.", "분명 잘 풀릴 거예요."],
    ["There's no doubt about it.", "그건 의심할 여지가 없어요."],
    ["I'm fairly certain she called.", "그녀가 전화한 게 거의 확실해요."],
    ["I'm not entirely sure.", "완전히 확신하진 못하겠어요."],
    ["I could be wrong, but I think it's closed.", "제가 틀릴 수도 있지만 문을 닫은 것 같아요."],
    ["It's hard to say for certain.", "확실하게 말하기는 어려워요."],
    ["As far as I know, the plan hasn't changed.", "제가 알기로 계획은 바뀌지 않았어요."],
    ["I'm confident we're making the right choice.", "우리가 올바른 선택을 하고 있다고 확신해요."],
  ]),
  area("guessing", "추측", "Guessing", "conversation", "대화", "Conversation", "statement", [
    ["Maybe he's running late.", "아마 그가 늦고 있나 봐요."],
    ["She might have forgotten.", "그녀가 잊었을지도 몰라요."],
    ["It looks like it's going to rain.", "비가 올 것 같아요."],
    ["I guess they changed their minds.", "그들이 마음을 바꾼 것 같아요."],
    ["Chances are, it'll be crowded.", "아마 붐빌 가능성이 커요."],
    ["He must be exhausted.", "그는 틀림없이 아주 지쳤을 거예요."],
    ["I wouldn't be surprised if she said no.", "그녀가 거절해도 놀랍지 않을 것 같아요."],
    ["My guess is that we'll hear back tomorrow.", "제 추측으로는 내일 답을 받을 거예요."],
  ]),
  area("giving-reasons", "이유 설명", "Giving reasons", "conversation", "대화", "Conversation", "statement", [
    ["I stayed home because I wasn't feeling well.", "몸이 좋지 않아서 집에 있었어요."],
    ["The reason I called is that I need your advice.", "전화한 이유는 조언이 필요해서예요."],
    ["That's why I changed my mind.", "그래서 마음을 바꿨어요."],
    ["Since we have time, let's walk.", "시간이 있으니 걸어가요."],
    ["I chose this one mainly because it's simpler.", "주로 더 간단해서 이걸 골랐어요."],
    ["Part of the reason is the cost.", "이유 중 하나는 비용이에요."],
    ["I couldn't come due to a family matter.", "집안일 때문에 올 수 없었어요."],
    ["Given the weather, staying inside makes sense.", "날씨를 고려하면 실내에 있는 게 합리적이에요."],
  ]),
  area("examples", "예시 들기", "Giving examples", "conversation", "대화", "Conversation", "statement", [
    ["For example, you could take the train.", "예를 들어 기차를 탈 수 있어요."],
    ["Take yesterday, for instance.", "가령 어제를 생각해 보세요."],
    ["One good example is this app.", "좋은 예로 이 앱이 있어요."],
    ["Let's say you miss the last bus.", "막차를 놓쳤다고 해볼게요."],
    ["Something like a notebook would work.", "공책 같은 것이면 괜찮을 거예요."],
    ["To give you an idea, it takes about an hour.", "감이 오게 말하면 한 시간 정도 걸려요."],
    ["A case in point is our last project.", "적절한 사례로 지난 프로젝트가 있어요."],
    ["Here's a simple example of what I mean.", "제가 말하는 뜻을 보여주는 간단한 예가 있어요."],
  ]),
  area("comparison", "비교와 대조", "Comparison and contrast", "conversation", "대화", "Conversation", "statement", [
    ["This one is cheaper than the other one.", "이게 다른 것보다 더 저렴해요."],
    ["They're similar in many ways.", "두 가지는 여러 면에서 비슷해요."],
    ["The main difference is the size.", "가장 큰 차이는 크기예요."],
    ["Unlike the old model, this one is quiet.", "이전 모델과 달리 이건 조용해요."],
    ["Both options have advantages.", "두 선택지 모두 장점이 있어요."],
    ["On the other hand, it takes more time.", "반면에 시간이 더 걸려요."],
    ["I'd rather walk than wait for a bus.", "버스를 기다리느니 걷겠어요."],
    ["There's no comparison; this is much better.", "비교할 것도 없이 이게 훨씬 나아요."],
  ]),
  area("describing", "사람과 사물 묘사", "Describing people and things", "daily", "일상", "Daily life", "statement", [
    ["She's easy to talk to.", "그녀는 이야기하기 편한 사람이에요."],
    ["He has a great sense of humor.", "그는 유머 감각이 뛰어나요."],
    ["It's small enough to carry around.", "들고 다니기에 충분히 작아요."],
    ["The room feels bright and spacious.", "방이 밝고 넓게 느껴져요."],
    ["It looks better in person.", "실제로 보니 더 좋아요."],
    ["She's the kind of person who keeps her word.", "그녀는 약속을 지키는 사람이에요."],
    ["The design is simple but practical.", "디자인이 단순하지만 실용적이에요."],
    ["What stands out is the attention to detail.", "눈에 띄는 점은 세심함이에요."],
  ]),
  area("current-state", "현재 상태", "Current state", "daily", "일상", "Daily life", "statement", [
    ["I'm a little tired right now.", "지금 조금 피곤해요."],
    ["We're almost ready.", "거의 준비됐어요."],
    ["The store is still open.", "가게는 아직 영업 중이에요."],
    ["She's on her way.", "그녀는 오는 중이에요."],
    ["I'm in the middle of something.", "지금 뭔가 하는 중이에요."],
    ["Things are getting better.", "상황이 나아지고 있어요."],
    ["The system is temporarily unavailable.", "시스템을 일시적으로 사용할 수 없어요."],
    ["I'm feeling much better today.", "오늘은 몸이 훨씬 좋아요."],
  ]),
  area("habits-frequency", "습관과 빈도", "Habits and frequency", "daily", "일상", "Daily life", "statement", [
    ["I usually get up around seven.", "저는 보통 7시쯤 일어나요."],
    ["We eat out once or twice a week.", "우리는 일주일에 한두 번 외식해요."],
    ["I don't drink coffee very often.", "저는 커피를 자주 마시지 않아요."],
    ["She always checks the weather first.", "그녀는 항상 먼저 날씨를 확인해요."],
    ["Every now and then, I take a day off.", "가끔씩 하루 쉬어요."],
    ["I've gotten into the habit of walking after dinner.", "저녁 식사 후 걷는 습관이 생겼어요."],
    ["I tend to lose track of time when I read.", "책을 읽으면 시간 가는 줄 모르는 편이에요."],
    ["It's become part of my daily routine.", "그게 제 일과의 일부가 됐어요."],
  ]),
  area("past-experience", "과거 경험", "Past experiences", "daily", "일상", "Daily life", "statement", [
    ["I've been there before.", "전에 거기 가본 적 있어요."],
    ["I've never tried that.", "그건 한 번도 해본 적 없어요."],
    ["I used to live near here.", "예전에 이 근처에 살았어요."],
    ["The last time I went, it was crowded.", "지난번에 갔을 때는 붐볐어요."],
    ["I once met her at a conference.", "전에 한 학회에서 그녀를 만난 적이 있어요."],
    ["That was the best trip I've ever taken.", "그 여행이 지금까지 가장 좋았어요."],
    ["I had never seen anything like it.", "그런 건 한 번도 본 적이 없었어요."],
    ["Looking back, I learned a lot from it.", "돌이켜 보면 그 일에서 많이 배웠어요."],
  ]),
  area("storytelling", "사건과 이야기", "Events and storytelling", "daily", "일상", "Daily life", "statement", [
    ["You'll never guess what happened.", "무슨 일이 있었는지 절대 못 맞힐 거예요."],
    ["It all started when I missed the bus.", "모든 건 제가 버스를 놓치면서 시작됐어요."],
    ["At first, everything seemed fine.", "처음에는 모든 게 괜찮아 보였어요."],
    ["Then, out of nowhere, the lights went out.", "그러다 갑자기 불이 꺼졌어요."],
    ["Before I knew it, everyone was laughing.", "어느새 모두가 웃고 있었어요."],
    ["To make a long story short, we got home safely.", "간단히 말하면 우리는 무사히 집에 왔어요."],
    ["The funny thing is, I had the key all along.", "웃긴 건 제가 내내 열쇠를 가지고 있었다는 거예요."],
    ["In the end, it turned out better than expected.", "결국 예상보다 잘 풀렸어요."],
  ]),
  area("plans", "계획과 예정", "Plans and arrangements", "daily", "일상", "Daily life", "statement", [
    ["I'm going to stay home tonight.", "오늘 밤에는 집에 있을 거예요."],
    ["We're meeting at six.", "우리는 6시에 만나기로 했어요."],
    ["I'm planning to visit next month.", "다음 달에 방문할 계획이에요."],
    ["I'm about to leave.", "이제 막 나가려던 참이에요."],
    ["We're supposed to hear back tomorrow.", "내일 답을 받기로 되어 있어요."],
    ["I haven't decided what to do yet.", "아직 뭘 할지 정하지 못했어요."],
    ["The plan is to finish by Friday.", "계획은 금요일까지 끝내는 거예요."],
    ["Barring any problems, we'll start next week.", "문제가 없다면 다음 주에 시작할 거예요."],
  ]),
  area("hopes-intentions", "희망과 의도", "Hopes and intentions", "daily", "일상", "Daily life", "statement", [
    ["I hope everything goes well.", "모든 일이 잘되길 바라요."],
    ["I'd like to learn something new.", "새로운 걸 배우고 싶어요."],
    ["I'm hoping to see you soon.", "곧 만나기를 바라고 있어요."],
    ["I intend to keep my promise.", "약속을 지킬 생각이에요."],
    ["My goal is to become more confident.", "제 목표는 더 자신감을 갖는 거예요."],
    ["I'm determined to make it work.", "반드시 잘되게 만들 생각이에요."],
    ["One day, I'd love to live abroad.", "언젠가 해외에서 살아보고 싶어요."],
    ["I have every intention of finishing it.", "그걸 끝낼 확실한 의지가 있어요."],
  ]),
  area("promises", "약속", "Promises", "social", "사교", "Social", "statement", [
    ["I promise I'll call you tonight.", "오늘 밤에 전화하겠다고 약속할게요."],
    ["I'll be there on time.", "시간 맞춰 갈게요."],
    ["You have my word.", "제가 약속할게요."],
    ["I won't tell anyone.", "아무에게도 말하지 않을게요."],
    ["I'll make it up to you.", "꼭 만회할게요."],
    ["You can count on me.", "저를 믿어도 돼요."],
    ["I'll do my best not to let you down.", "실망시키지 않도록 최선을 다할게요."],
    ["Whatever happens, I'll keep my end of the bargain.", "무슨 일이 있어도 제 몫의 약속은 지킬게요."],
  ]),
  area("conditions", "조건", "Conditions", "conversation", "대화", "Conversation", "statement", [
    ["If it rains, we'll stay inside.", "비가 오면 실내에 있을 거예요."],
    ["I'll go as long as you come with me.", "당신이 같이 가면 저도 갈게요."],
    ["You can borrow it provided that you're careful.", "조심해서 쓴다는 조건으로 빌려도 돼요."],
    ["Unless we leave now, we'll be late.", "지금 출발하지 않으면 늦을 거예요."],
    ["Even if it's expensive, we still need it.", "비싸더라도 우리에게는 필요해요."],
    ["In case you need me, keep my number.", "제가 필요할 경우를 대비해 번호를 저장해 두세요."],
    ["What if the plan doesn't work?", "계획대로 되지 않으면 어떡하죠?"],
    ["Had I known earlier, I would have helped.", "더 일찍 알았더라면 도왔을 거예요."],
  ]),
  area("requests", "부탁", "Requests", "daily", "일상", "Daily life", "request", [
    ["Could you help me with this?", "이것 좀 도와주시겠어요?"],
    ["Can you hold this for a second?", "이것 좀 잠깐 들어줄래요?"],
    ["Would you mind closing the window?", "창문을 닫아 주시겠어요?"],
    ["Could I ask you a favor?", "부탁 하나 해도 될까요?"],
    ["Please let me know when you're ready.", "준비되면 알려 주세요."],
    ["Do you think you could come a little earlier?", "조금 일찍 와줄 수 있을까요?"],
    ["I'd appreciate it if you kept this private.", "이 일을 비밀로 해주시면 감사하겠습니다."],
    ["Would it be possible to move the meeting?", "회의 시간을 옮길 수 있을까요?"],
  ]),
  area("permission", "허락", "Permission", "daily", "일상", "Daily life", "request", [
    ["Can I sit here?", "여기 앉아도 될까요?"],
    ["Do you mind if I open the window?", "창문을 열어도 괜찮을까요?"],
    ["Is it okay if I call you later?", "나중에 전화해도 될까요?"],
    ["May I use your phone?", "전화기를 사용해도 될까요?"],
    ["Would it be all right to bring a friend?", "친구를 데려와도 괜찮을까요?"],
    ["Go ahead. I don't mind.", "그러세요. 괜찮아요."],
    ["Feel free to take one.", "편하게 하나 가져가세요."],
    ["I'd rather you didn't mention it yet.", "아직은 그 이야기를 하지 않았으면 해요."],
  ]),
  area("suggestions", "제안", "Suggestions", "social", "사교", "Social", "request", [
    ["Why don't we take a break?", "우리 잠깐 쉬는 게 어때요?"],
    ["How about meeting on Saturday?", "토요일에 만나는 건 어때요?"],
    ["We could try a different route.", "다른 길로 가볼 수도 있어요."],
    ["Maybe we should ask first.", "먼저 물어보는 게 좋을지도 몰라요."],
    ["What if we split the cost?", "비용을 나눠 내는 건 어때요?"],
    ["I'd suggest booking in advance.", "미리 예약하는 걸 권해요."],
    ["It might be worth checking online.", "온라인으로 확인해 볼 만해요."],
    ["One option would be to postpone it.", "한 가지 방법은 연기하는 거예요."],
  ]),
  area("invitations", "권유", "Invitations", "social", "사교", "Social", "request", [
    ["Would you like to join us?", "우리와 함께할래요?"],
    ["Do you want to grab lunch?", "같이 점심 먹을래요?"],
    ["Why don't you come over this weekend?", "이번 주말에 우리 집에 놀러 오는 게 어때요?"],
    ["We're going for a walk if you'd like to come.", "우리는 산책하러 가는데 원하면 같이 가요."],
    ["Can I interest you in some coffee?", "커피 한 잔 어떠세요?"],
    ["You're more than welcome to stay.", "얼마든지 머물러도 좋아요."],
    ["I'd love it if you could make it.", "와줄 수 있다면 정말 좋겠어요."],
    ["Consider this your official invitation.", "이걸 정식 초대라고 생각해 주세요."],
  ]),
  area("advice", "조언", "Advice", "daily", "일상", "Daily life", "statement", [
    ["You should get some rest.", "좀 쉬는 게 좋겠어요."],
    ["If I were you, I'd call first.", "제가 당신이라면 먼저 전화하겠어요."],
    ["You might want to save a copy.", "사본을 저장해 두는 게 좋을 거예요."],
    ["It would be better to wait until morning.", "아침까지 기다리는 게 더 나을 거예요."],
    ["Make sure you bring an umbrella.", "우산을 꼭 챙기세요."],
    ["My advice is to keep it simple.", "제 조언은 단순하게 하라는 거예요."],
    ["Whatever you do, don't rush the decision.", "어떻게 하든 결정을 서두르지는 마세요."],
    ["You'd be wise to get a second opinion.", "다른 의견도 들어보는 게 현명할 거예요."],
  ]),
  area("offering-help", "도움 제안", "Offering help", "daily", "일상", "Daily life", "request", [
    ["Can I help you with that?", "그거 도와드릴까요?"],
    ["Let me carry that for you.", "제가 들어드릴게요."],
    ["Do you need a hand?", "도움이 필요해요?"],
    ["I can give you a ride.", "제가 태워다 드릴 수 있어요."],
    ["Would you like me to check?", "제가 확인해 볼까요?"],
    ["I'm happy to help if you need anything.", "필요한 게 있으면 기꺼이 도울게요."],
    ["Leave it with me. I'll take care of it.", "저한테 맡기세요. 제가 처리할게요."],
    ["Is there anything I can do to make this easier?", "이 일을 더 쉽게 만들기 위해 제가 할 수 있는 게 있나요?"],
  ]),
  area("accepting", "수락", "Accepting", "social", "사교", "Social", "reaction", [
    ["Sure, I'd love to.", "물론이죠, 정말 좋아요."],
    ["That sounds like a great idea.", "좋은 생각 같아요."],
    ["Count me in.", "저도 할게요."],
    ["Yes, that works for me.", "네, 저는 그 시간이 괜찮아요."],
    ["I'd be happy to help.", "기꺼이 도울게요."],
    ["Why not? Let's do it.", "좋죠. 그렇게 해요."],
    ["I appreciate the offer, and I'll take you up on it.", "제안 고맙고, 받아들일게요."],
    ["We have a deal.", "그렇게 합의한 거예요."],
  ]),
  area("refusing", "거절", "Refusing", "social", "사교", "Social", "statement", [
    ["I'm sorry, but I can't.", "미안하지만 할 수 없어요."],
    ["Thanks for asking, but I have plans.", "물어봐 줘서 고맙지만 계획이 있어요."],
    ["I'd rather not, if that's okay.", "괜찮다면 사양하고 싶어요."],
    ["I'm afraid that won't be possible.", "유감이지만 그건 어려울 것 같아요."],
    ["Maybe another time.", "다음 기회에 할게요."],
    ["I don't think I'm the right person for this.", "제가 이 일에 적합한 사람은 아닌 것 같아요."],
    ["As much as I'd like to, I have to say no.", "정말 그러고 싶지만 거절해야겠어요."],
    ["I appreciate the offer, but I'll pass.", "제안은 고맙지만 사양할게요."],
  ]),
  area("alternatives", "대안 제시", "Offering alternatives", "conversation", "대화", "Conversation", "statement", [
    ["We could go tomorrow instead.", "대신 내일 갈 수도 있어요."],
    ["How about a video call?", "화상 통화는 어때요?"],
    ["If that doesn't work, we can reschedule.", "그게 안 되면 일정을 다시 잡을 수 있어요."],
    ["Another option is to take a taxi.", "또 다른 방법은 택시를 타는 거예요."],
    ["Would Friday be any better?", "금요일은 좀 더 괜찮을까요?"],
    ["We don't have to decide today.", "오늘 꼭 결정할 필요는 없어요."],
    ["As a compromise, we could meet halfway.", "절충안으로 중간 지점에서 만날 수 있어요."],
    ["Failing that, we'll use the backup plan.", "그것도 안 되면 예비 계획을 쓰죠."],
  ]),
  area("negotiation", "협상", "Negotiation", "work", "직장", "Work", "statement", [
    ["Is there any flexibility on the price?", "가격을 조정할 여지가 있나요?"],
    ["Could you do a little better than that?", "그보다 조금 더 좋은 조건이 가능할까요?"],
    ["What if we order more?", "저희가 더 많이 주문한다면 어떤가요?"],
    ["That's more than we were hoping to spend.", "저희가 생각한 예산보다 많아요."],
    ["We can agree to that on one condition.", "한 가지 조건이라면 동의할 수 있어요."],
    ["Let's meet somewhere in the middle.", "서로 중간 지점에서 합의하죠."],
    ["I'd need something in return.", "그 대신 저도 뭔가가 필요해요."],
    ["That seems like a fair compromise.", "공정한 절충안 같아요."],
  ]),
  area("thanks", "감사", "Thanks", "social", "사교", "Social", "reaction", [
    ["Thank you so much.", "정말 고마워요."],
    ["I really appreciate your help.", "도와주셔서 정말 감사해요."],
    ["That's very kind of you.", "정말 친절하시네요."],
    ["Thanks for letting me know.", "알려줘서 고마워요."],
    ["I can't thank you enough.", "아무리 감사해도 부족해요."],
    ["It means a lot to me.", "저에게 정말 큰 의미예요."],
    ["I owe you one.", "제가 신세를 졌네요."],
    ["Please accept my sincere thanks.", "진심으로 감사드립니다."],
  ]),
  area("apologies", "사과", "Apologies", "social", "사교", "Social", "statement", [
    ["I'm sorry I'm late.", "늦어서 미안해요."],
    ["I didn't mean to upset you.", "당신을 속상하게 할 생각은 아니었어요."],
    ["That was my fault.", "그건 제 잘못이었어요."],
    ["I owe you an apology.", "제가 사과드려야 해요."],
    ["I'm sorry for the misunderstanding.", "오해가 생겨서 죄송해요."],
    ["Please forgive me for forgetting.", "잊어버린 걸 용서해 주세요."],
    ["I should have handled that better.", "제가 더 잘 대처했어야 했어요."],
    ["I sincerely apologize for the inconvenience.", "불편을 끼쳐드려 진심으로 사과드립니다."],
  ]),
  area("compliments", "칭찬", "Compliments", "social", "사교", "Social", "reaction", [
    ["You did a great job.", "정말 잘했어요."],
    ["That looks good on you.", "그거 정말 잘 어울려요."],
    ["You're really good at this.", "이걸 정말 잘하네요."],
    ["I love what you've done with the place.", "이곳을 꾸민 방식이 정말 마음에 들어요."],
    ["You have excellent taste.", "안목이 정말 좋네요."],
    ["That was very thoughtful of you.", "정말 세심하게 배려해 주셨네요."],
    ["You make it look easy.", "아주 쉽게 해내는 것처럼 보여요."],
    ["I was impressed by how calmly you handled it.", "침착하게 대처하는 모습이 인상적이었어요."],
  ]),
  area("congratulations", "축하", "Congratulations", "social", "사교", "Social", "reaction", [
    ["Congratulations! You deserve it.", "축하해요! 충분히 그럴 자격이 있어요."],
    ["I'm so happy for you.", "정말 잘돼서 기뻐요."],
    ["Well done on passing the exam.", "시험에 합격한 것 정말 잘했어요."],
    ["That's wonderful news.", "정말 좋은 소식이네요."],
    ["Here's to your new beginning.", "당신의 새로운 시작을 축하해요."],
    ["You should be proud of yourself.", "스스로 자랑스러워해도 돼요."],
    ["All your hard work paid off.", "열심히 노력한 보람이 있었네요."],
    ["Please accept my warmest congratulations.", "진심 어린 축하를 전합니다."],
  ]),
  area("comfort", "위로", "Comforting", "social", "사교", "Social", "reaction", [
    ["I'm sorry to hear that.", "그런 소식을 들어 마음이 안 좋아요."],
    ["It's going to be okay.", "괜찮아질 거예요."],
    ["Take all the time you need.", "필요한 만큼 천천히 시간을 가지세요."],
    ["You don't have to go through this alone.", "이 일을 혼자 겪을 필요는 없어요."],
    ["I'm thinking of you.", "당신을 생각하고 있어요."],
    ["Things may feel different with time.", "시간이 지나면 다르게 느껴질 수도 있어요."],
    ["There's no right way to feel right now.", "지금 어떤 감정을 느껴야 한다는 정답은 없어요."],
    ["Whatever you need, I'm here for you.", "무엇이 필요하든 제가 곁에 있을게요."],
  ]),
  area("complaints", "불만", "Complaints", "service", "서비스", "Service", "service", [
    ["I'm not happy with this service.", "이 서비스가 만족스럽지 않아요."],
    ["This isn't what I ordered.", "이건 제가 주문한 게 아니에요."],
    ["We've been waiting for over an hour.", "한 시간 넘게 기다리고 있어요."],
    ["The room is much noisier than expected.", "방이 예상보다 훨씬 시끄러워요."],
    ["I'm afraid this still hasn't been fixed.", "유감이지만 이 문제가 아직 해결되지 않았어요."],
    ["Could I speak to the person in charge?", "담당자와 이야기할 수 있을까요?"],
    ["I don't think this is acceptable.", "이건 받아들이기 어렵다고 생각해요."],
    ["I'd like to make a formal complaint.", "정식으로 불만을 제기하고 싶습니다."],
  ]),
  area("raising-problems", "문제 제기", "Raising problems", "work", "직장", "Work", "statement", [
    ["There's a problem with the schedule.", "일정에 문제가 있어요."],
    ["Something doesn't seem right here.", "여기 뭔가 이상해 보여요."],
    ["We may have overlooked an important detail.", "중요한 세부 사항을 놓쳤을 수도 있어요."],
    ["I'm concerned about the deadline.", "마감일이 걱정돼요."],
    ["This could cause delays later.", "이것 때문에 나중에 지연이 생길 수 있어요."],
    ["We need to address this before moving on.", "계속 진행하기 전에 이 문제를 다뤄야 해요."],
    ["I hate to bring this up, but the numbers don't match.", "말씀드리기 조심스럽지만 숫자가 맞지 않아요."],
    ["There's a larger issue we haven't discussed yet.", "아직 논의하지 않은 더 큰 문제가 있어요."],
  ]),
  area("returns-exchanges", "환불과 교환", "Returns and exchanges", "shopping", "쇼핑", "Shopping", "service", [
    ["I'd like to return this.", "이걸 반품하고 싶어요."],
    ["Can I exchange this for a different size?", "이걸 다른 사이즈로 교환할 수 있을까요?"],
    ["It doesn't work as advertised.", "광고한 대로 작동하지 않아요."],
    ["I bought this yesterday, but it's damaged.", "어제 샀는데 손상되어 있어요."],
    ["Do I need the receipt for a refund?", "환불하려면 영수증이 필요한가요?"],
    ["Could you refund it to the same card?", "같은 카드로 환불해 주시겠어요?"],
    ["Is there a restocking fee?", "반품 수수료가 있나요?"],
    ["I'd prefer store credit if a refund isn't possible.", "환불이 안 된다면 매장 적립금으로 받고 싶어요."],
  ]),
  area("phone-messages", "전화와 메시지", "Phone and messages", "phone", "전화", "Phone", "service", [
    ["May I speak to Daniel, please?", "대니얼과 통화할 수 있을까요?"],
    ["Who's calling, please?", "누구시라고 전해 드릴까요?"],
    ["I'm sorry, he's not available right now.", "죄송하지만 지금은 통화가 어렵습니다."],
    ["Could you leave a message?", "메시지를 남겨 주시겠어요?"],
    ["I'll call you back in ten minutes.", "10분 뒤에 다시 전화할게요."],
    ["The connection is breaking up.", "통화 연결이 자꾸 끊겨요."],
    ["I just sent you the details by text.", "방금 문자로 세부 내용을 보냈어요."],
    ["Sorry for the late reply. I just saw your message.", "답장이 늦어 미안해요. 방금 메시지를 봤어요."],
  ]),
  area("work-meetings", "직장과 회의", "Work and meetings", "work", "직장", "Work", "statement", [
    ["Let's get started.", "시작하죠."],
    ["Could you give us a quick update?", "간단히 진행 상황을 알려주시겠어요?"],
    ["I'd like to add one thing.", "한 가지 덧붙이고 싶어요."],
    ["Can we come back to that later?", "그건 나중에 다시 이야기해도 될까요?"],
    ["Who's responsible for the next step?", "다음 단계는 누가 담당하나요?"],
    ["Let's make sure we're aligned on the deadline.", "마감일에 대한 생각이 같은지 확인하죠."],
    ["I'll send a summary after the meeting.", "회의 후에 요약을 보내겠습니다."],
    ["We need to make a decision by the end of today.", "오늘 안으로 결정을 내려야 합니다."],
  ]),
  area("school-learning", "학교와 학습", "School and learning", "school", "학교", "School", "question", [
    ["What page are we on?", "몇 쪽을 보고 있나요?"],
    ["Could you explain that one more time?", "그걸 한 번 더 설명해 주시겠어요?"],
    ["When is the assignment due?", "과제 마감이 언제예요?"],
    ["I need help understanding this part.", "이 부분을 이해하는 데 도움이 필요해요."],
    ["Do we have to memorize this?", "이걸 외워야 하나요?"],
    ["I studied, but I still found the test difficult.", "공부했지만 시험은 여전히 어려웠어요."],
    ["Can we work on this together?", "이걸 같이 해도 될까요?"],
    ["The more I practice, the easier it gets.", "연습할수록 더 쉬워져요."],
  ]),
  area("restaurant-cafe", "식당과 카페", "Restaurants and cafes", "restaurant", "식당", "Restaurant", "service", [
    ["A table for two, please.", "두 명 자리 부탁합니다."],
    ["Could we see the menu?", "메뉴를 볼 수 있을까요?"],
    ["What do you recommend?", "무엇을 추천하세요?"],
    ["I'd like the pasta, please.", "파스타로 주세요."],
    ["Could you make it less spicy?", "덜 맵게 해주실 수 있나요?"],
    ["Can we get this to go?", "이거 포장해 주실 수 있나요?"],
    ["Could we have the check, please?", "계산서 부탁합니다."],
    ["Is service included?", "봉사료가 포함되어 있나요?"],
  ]),
  area("shopping-payment", "쇼핑과 결제", "Shopping and payment", "shopping", "쇼핑", "Shopping", "service", [
    ["How much is this?", "이거 얼마예요?"],
    ["Do you have this in a larger size?", "이거 더 큰 사이즈가 있나요?"],
    ["Can I try this on?", "이거 입어봐도 될까요?"],
    ["Is this on sale?", "이거 할인 중인가요?"],
    ["I'll take it.", "이걸로 할게요."],
    ["Can I pay by card?", "카드로 결제할 수 있나요?"],
    ["Could I get a receipt?", "영수증을 받을 수 있을까요?"],
    ["Could you split the payment between two cards?", "카드 두 장으로 나눠 결제해 주실 수 있나요?"],
  ]),
  area("travel-hotel", "여행과 숙박", "Travel and accommodation", "travel", "여행", "Travel", "service", [
    ["I have a reservation under Kim.", "김이라는 이름으로 예약했어요."],
    ["What time is check-in?", "체크인은 몇 시예요?"],
    ["Is breakfast included?", "조식이 포함되어 있나요?"],
    ["Could I have a room on a higher floor?", "높은 층 방을 받을 수 있을까요?"],
    ["The air conditioner isn't working.", "에어컨이 작동하지 않아요."],
    ["Can I leave my luggage here?", "짐을 여기에 맡길 수 있나요?"],
    ["Could we check out a little later?", "조금 늦게 체크아웃할 수 있을까요?"],
    ["What's the best way to get to the airport?", "공항까지 가는 가장 좋은 방법은 무엇인가요?"],
  ]),
  area("transport-directions", "교통과 길 찾기", "Transport and directions", "transport", "교통", "Transport", "question", [
    ["How do I get to the station?", "역에 어떻게 가나요?"],
    ["Is it within walking distance?", "걸어갈 만한 거리인가요?"],
    ["Which bus should I take?", "어느 버스를 타야 하나요?"],
    ["Does this train stop at City Hall?", "이 기차가 시청에 서나요?"],
    ["Where do I need to transfer?", "어디에서 갈아타야 하나요?"],
    ["How long does it take from here?", "여기서 얼마나 걸리나요?"],
    ["Could you let me know when we get there?", "도착하면 알려주시겠어요?"],
    ["I think we may have gone the wrong way.", "길을 잘못 든 것 같아요."],
  ]),
  area("hospital-pharmacy", "병원과 약국", "Hospital and pharmacy", "health", "병원", "Health", "service", [
    ["I'd like to see a doctor.", "진료를 받고 싶어요."],
    ["I've had a fever since last night.", "어젯밤부터 열이 났어요."],
    ["It hurts when I move my arm.", "팔을 움직이면 아파요."],
    ["I'm allergic to penicillin.", "저는 페니실린 알레르기가 있어요."],
    ["How often should I take this?", "이 약을 얼마나 자주 먹어야 하나요?"],
    ["Are there any side effects?", "부작용이 있나요?"],
    ["Do I need a prescription for this?", "이 약은 처방전이 필요한가요?"],
    ["The symptoms haven't improved after three days.", "사흘이 지나도 증상이 나아지지 않았어요."],
  ]),
  area("emergency", "응급 상황", "Emergencies", "emergency", "긴급 상황", "Emergency", "urgent", [
    ["Call an ambulance!", "구급차를 불러 주세요!"],
    ["We need help right away.", "지금 당장 도움이 필요해요."],
    ["Is everyone okay?", "모두 괜찮나요?"],
    ["There's been an accident.", "사고가 났어요."],
    ["I can't find my child.", "아이를 찾을 수 없어요."],
    ["My wallet has been stolen.", "지갑을 도난당했어요."],
    ["Where is the nearest police station?", "가장 가까운 경찰서가 어디예요?"],
    ["Please stay on the line and tell me where you are.", "전화를 끊지 말고 위치를 알려 주세요."],
  ]),
  area("topic-change", "화제 전환", "Changing the subject", "conversation", "대화", "Conversation", "statement", [
    ["By the way, how's your sister?", "그런데 여동생은 잘 지내요?"],
    ["Speaking of travel, have you booked your flight?", "여행 이야기가 나와서 말인데, 항공편은 예약했어요?"],
    ["That reminds me, I need to call Sam.", "그 말을 들으니 샘에게 전화해야 하는 게 생각났어요."],
    ["On a different note, I have some good news.", "다른 이야기인데, 좋은 소식이 있어요."],
    ["Before I forget, can I ask you something?", "잊기 전에 하나 물어봐도 될까요?"],
    ["Anyway, what were you saying?", "어쨌든, 무슨 말을 하고 있었죠?"],
    ["Let's move on to the next point.", "다음 요점으로 넘어가죠."],
    ["Not to change the subject, but we should check the time.", "화제를 돌리려는 건 아니지만 시간을 확인해야 해요."],
  ]),
  area("conversation-ending", "대화 종료", "Ending a conversation", "conversation", "대화", "Conversation", "closing", [
    ["It was nice talking to you.", "이야기 나눠서 즐거웠어요."],
    ["I should get going.", "이제 가봐야겠어요."],
    ["I'll let you get back to work.", "다시 일하실 수 있게 이만 갈게요."],
    ["Let's catch up again soon.", "조만간 또 이야기해요."],
    ["Thanks for your time.", "시간 내주셔서 감사합니다."],
    ["I'll talk to you later.", "나중에 이야기해요."],
    ["I won't keep you any longer.", "더 이상 시간을 뺏지 않을게요."],
    ["Take care, and give my best to your family.", "잘 지내고, 가족에게도 안부 전해 주세요."],
  ]),
  area("fillers", "필러와 말버릇", "Fillers and discourse markers", "conversation", "대화", "Conversation", "statement", [
    ["Well, it depends.", "글쎄요, 경우에 따라 달라요."],
    ["You know, I never thought about that.", "있잖아요, 그건 생각해 본 적이 없어요."],
    ["I mean, it's not a bad idea.", "그러니까, 나쁜 생각은 아니에요."],
    ["Actually, I changed my mind.", "사실, 마음을 바꿨어요."],
    ["Basically, we need more time.", "기본적으로 시간이 더 필요해요."],
    ["To be honest, I'm a little nervous.", "솔직히 말하면 조금 긴장돼요."],
    ["As I was saying, the first step is easy.", "말씀드리던 대로 첫 단계는 쉬워요."],
    ["The thing is, I already made other plans.", "문제는 제가 이미 다른 계획을 세웠다는 거예요."],
  ]),
  area("softening", "완곡한 표현", "Softening language", "conversation", "대화", "Conversation", "statement", [
    ["It might be a little difficult.", "조금 어려울 수도 있을 것 같아요."],
    ["I'm not sure that's the best idea.", "그게 가장 좋은 생각인지는 모르겠어요."],
    ["Perhaps we could look at it another way.", "어쩌면 다른 방식으로 볼 수도 있겠어요."],
    ["I was wondering if you had a moment.", "잠깐 시간 괜찮으신지 여쭤보고 싶었어요."],
    ["There seems to be a small problem.", "작은 문제가 있는 것 같아요."],
    ["I don't suppose you could help me?", "혹시 저를 도와주실 수 있을까요?"],
    ["With all due respect, I see it differently.", "존중하는 마음은 있지만 저는 다르게 봅니다."],
    ["You may want to reconsider that option.", "그 선택지를 다시 생각해 보시는 게 좋을 수도 있어요."],
  ]),
  area("contractions", "자연스러운 축약", "Natural contractions", "conversation", "대화", "Conversation", "statement", [
    ["I'm gonna head out.", "저 이제 나갈게요."],
    ["Do you wanna come?", "같이 갈래요?"],
    ["I've gotta get back to work.", "저 다시 일하러 가야 해요."],
    ["Lemme check real quick.", "제가 얼른 확인해 볼게요."],
    ["Gimme a second.", "잠깐만요."],
    ["Kinda feels like we're stuck.", "우리 막힌 것 같은 느낌이 좀 들어요."],
    ["I dunno what happened.", "무슨 일이 있었는지 모르겠어요."],
    ["Whaddaya think?", "어떻게 생각해요?"],
  ]),
  area("phrasal-verbs", "자주 쓰는 구동사", "Everyday phrasal verbs", "daily", "일상", "Daily life", "statement", [
    ["I'll pick you up at eight.", "8시에 데리러 갈게요."],
    ["Can you turn the music down?", "음악 소리를 줄여줄래요?"],
    ["We ran out of milk.", "우유가 다 떨어졌어요."],
    ["I need to figure this out.", "이걸 해결해야 해요."],
    ["Don't put it off any longer.", "더 이상 미루지 마세요."],
    ["She came up with a great idea.", "그녀가 좋은 아이디어를 생각해 냈어요."],
    ["Let's go over the plan once more.", "계획을 한 번 더 검토해 봅시다."],
    ["It took me a while to get over it.", "그걸 극복하는 데 시간이 좀 걸렸어요."],
  ]),
  area("idioms", "일상적인 관용 표현", "Everyday idioms", "daily", "일상", "Daily life", "statement", [
    ["It's not a big deal.", "별일 아니에요."],
    ["That rings a bell.", "그 말이 어렴풋이 기억나요."],
    ["I'm just pulling your leg.", "그냥 농담하는 거예요."],
    ["Let's call it a day.", "오늘은 이만 끝내죠."],
    ["I'm feeling under the weather.", "몸이 좀 안 좋아요."],
    ["We need to get the ball rolling.", "이제 일을 시작해야 해요."],
    ["You're on the right track.", "제대로 하고 있어요."],
    ["We'll cross that bridge when we come to it.", "그 문제는 닥치면 해결하죠."],
  ]),
];

const packDefinitions = [
  ["core-conversation-001", "핵심 대화 운영", "Core Conversation", 0, 8],
  ["repair-response-001", "이해·반응·의견", "Repair and Response", 8, 16],
  ["meaning-description-001", "의미·설명·묘사", "Meaning and Description", 16, 24],
  ["time-action-001", "시간·경험·행동", "Time and Action", 24, 32],
  ["social-actions-001", "부탁·제안·협상", "Social Actions", 32, 41],
  ["social-care-001", "감사·감정·문제", "Social Care", 41, 49],
  ["practical-situations-001", "생활 상황 회화", "Practical Situations", 49, 58],
  ["natural-spoken-001", "자연스러운 구어체", "Natural Spoken English", 58, 65],
] as const;

const replySets: Record<ReplyStyle, readonly Pair[]> = {
  greeting: [["Hi! It's good to see you too.", "안녕하세요! 저도 만나서 반가워요."], ["I'm doing well, thanks.", "잘 지내요, 고마워요."], ["You too. Take care!", "당신도요. 잘 지내요!" ]],
  question: [["Let me think for a second.", "잠깐 생각해 볼게요."], ["That's a good question.", "좋은 질문이네요."], ["I'll check and let you know.", "확인해서 알려드릴게요." ]],
  statement: [["I see what you mean.", "무슨 말인지 알겠어요."], ["That makes sense.", "말이 되네요."], ["Thanks for telling me.", "말해줘서 고마워요." ]],
  request: [["Sure, no problem.", "물론이죠, 문제없어요."], ["I'd be happy to.", "기꺼이 그럴게요."], ["Let me see what I can do.", "제가 어떻게 할 수 있는지 볼게요." ]],
  reaction: [["I know, right?", "그러게 말이에요."], ["That's exactly how I feel.", "제 기분도 딱 그래요."], ["Thanks for saying that.", "그렇게 말해줘서 고마워요." ]],
  closing: [["It was nice talking to you too.", "저도 이야기 나눠서 좋았어요."], ["Talk to you soon.", "곧 다시 이야기해요."], ["Take care!", "잘 지내요!" ]],
  service: [["Certainly. Let me check that for you.", "물론입니다. 확인해 드릴게요."], ["Of course. One moment, please.", "네. 잠시만 기다려 주세요."], ["I'll help you with that.", "그 부분을 도와드릴게요." ]],
  urgent: [["I'm calling for help now.", "지금 도움을 요청하고 있어요."], ["Stay calm. Help is on the way.", "침착하세요. 도움이 오고 있어요."], ["Tell me exactly where you are.", "정확히 어디에 있는지 말해 주세요." ]],
};

const cefrByPosition: readonly CefrLevel[] = ["A1", "A1", "A2", "A2", "B1", "B1", "B2", "C1"];
const priorityByPosition: readonly PatternPriority[] = ["essential", "essential", "essential", "common", "common", "common", "extended", "extended"];
const commonMistakes: Record<string, readonly [wrong: string, explanationKo: string]> = {
  "Could you say that again?": ["Could you say again?", "무엇을 다시 말하는지 나타내는 that을 함께 쓰는 것이 자연스럽다."],
  "How does this work?": ["How this works?", "일반 의문문에서는 주어 앞에 조동사 does가 온다."],
  "I completely agree.": ["I am completely agree.", "agree는 형용사가 아니라 동사이므로 be동사를 쓰지 않는다."],
  "I've been there before.": ["I have ever been there.", "긍정 경험을 말할 때는 before를 쓰는 편이 자연스럽고 ever는 주로 의문문·최상급과 쓴다."],
  "I'm about to leave.": ["I'm about leaving.", "막 ~하려는 참이라는 뜻은 be about to + 동사원형 구조를 쓴다."],
  "Would you mind closing the window?": ["Would you mind to close the window?", "Would you mind 뒤에는 to부정사가 아니라 동명사(-ing)를 쓴다."],
  "I'm allergic to penicillin.": ["I'm allergic with penicillin.", "알레르기 대상을 말할 때 allergic 뒤에는 전치사 to를 쓴다."],
  "How much is this?": ["How much this is?", "직접 의문문에서는 be동사 is가 주어 this보다 앞에 온다."],
  "Can I pay by card?": ["Can I pay with card?", "결제 수단을 일반적으로 말할 때는 by card가 자연스럽다."],
  "I used to live near here.": ["I use to live near here.", "과거의 습관은 긍정문에서 used to로 쓴다."],
  "It depends.": ["It is depend.", "depend는 동사이므로 be동사를 함께 쓰지 않는다."],
};

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42)
    .replace(/-$/g, "");
}

function registerFor(english: string, areaIndex: number): SpeechRegister[] {
  if (areaIndex >= 60 || /\b(?:gonna|wanna|gotta|lemme|gimme|kinda|dunno|whaddaya)\b/i.test(english)) return ["casual"];
  if (/\b(?:could|would|may|please|appreciate|sincerely|respectfully)\b/i.test(english)) return ["neutral", "polite"];
  return ["neutral"];
}

function buildPattern(seed: SeedArea, areaIndex: number, phrase: Pair, phraseIndex: number): ConversationPattern {
  const number = String(phraseIndex + 1).padStart(2, "0");
  const id = `${seed.id}.${number}-${slug(phrase[0])}`;
  const replies = replySets[seed.replyStyle];
  return {
    id,
    familyId: `${seed.id}.family-${number}`,
    schemaVersion: 1,
    contentVersion: 1,
    pattern: phrase[0],
    english: phrase[0],
    korean: phrase[1],
    intentKo: `${seed.labelKo} 상황에서 “${phrase[1]}”라는 의도를 자연스럽게 전달하기`,
    nuanceKo: `실제 ${seed.situationKo} 대화에서 바로 쓸 수 있는 ${seed.labelKo} 표현이다. 말투와 억양에 따라 부드러움의 정도가 달라질 수 있다.`,
    usageNoteKo: `대표 문장을 먼저 익힌 뒤 상대의 응답까지 한 덩어리로 소리 내어 연습한다.`,
    categoryIds: [seed.id],
    situationIds: [seed.situation],
    tags: [seed.labelKo, phraseIndex < 3 ? "핵심 표현" : "확장 표현"],
    cefr: cefrByPosition[phraseIndex],
    priority: priorityByPosition[phraseIndex],
    register: registerFor(phrase[0], areaIndex),
    examples: replies.map((reply, replyIndex) => ({
      id: `${id}.example-${replyIndex + 1}`,
      english: `A: ${phrase[0]} B: ${reply[0]}`,
      korean: `A: ${phrase[1]} B: ${reply[1]}`,
      situationId: seed.situation,
      noteKo: `${seed.situationKo}에서 이어지는 짧은 대화 예시`,
    })),
    variants: [],
    replies: [{
      id: `${id}.reply-1`,
      english: replies[0][0],
      korean: replies[0][1],
      type: (seed.replyStyle === "question" ? "clarification" : "positive") as ReplyType,
    }],
    commonMistakes: commonMistakes[phrase[0]]
      ? [{ wrong: commonMistakes[phrase[0]][0], corrected: phrase[0], explanationKo: commonMistakes[phrase[0]][1] }]
      : [],
    relations: makeEmptyRelations(),
    audio: { ttsText: phrase[0], lang: "en-US" },
    sortKey: `${String(areaIndex + 1).padStart(3, "0")}.001.${String(phraseIndex + 1).padStart(3, "0")}`,
    releasedAt: "2026-08-08",
  };
}

function taxonomyFor(selectedAreas: SeedArea[], field: "category" | "situation"): TaxonomyItem[] {
  const items = new Map<string, TaxonomyItem>();
  for (const seed of selectedAreas) {
    const item = field === "category"
      ? { id: seed.id, labelKo: seed.labelKo, labelEn: seed.labelEn }
      : { id: seed.situation, labelKo: seed.situationKo, labelEn: seed.situationEn };
    items.set(item.id, item);
  }
  return [...items.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function makePack(definition: (typeof packDefinitions)[number]): ContentPack {
  const [packId, titleKo, titleEn, start, end] = definition;
  const selectedAreas = areas.slice(start, end);
  const patterns = selectedAreas.flatMap((seed, localIndex) =>
    seed.phrases.map((phrase, phraseIndex) => buildPattern(seed, start + localIndex, phrase, phraseIndex)),
  );
  const idsByArea = new Map<string, ConversationPattern[]>();
  for (const pattern of patterns) {
    const areaId = pattern.categoryIds[0];
    const siblings = idsByArea.get(areaId) ?? [];
    siblings.push(pattern);
    idsByArea.set(areaId, siblings);
  }
  for (const siblings of idsByArea.values()) {
    siblings.forEach((pattern, index) => {
      const alternative = siblings[(index + 1) % siblings.length];
      pattern.relations.similar = [
        siblings[(index + siblings.length - 1) % siblings.length].id,
        alternative.id,
      ];
      pattern.relations.followUps = [alternative.id];
      pattern.variants = [{
        id: `${pattern.id}.variant-1`,
        english: alternative.english,
        korean: alternative.korean,
        register: alternative.register[0],
        nuanceKo: `같은 ${pattern.tags[0]} 기능에서 선택할 수 있는 관련 표현`,
      }];
    });
  }
  return {
    schemaVersion: 1,
    packId,
    titleKo,
    titleEn,
    descriptionKo: `${selectedAreas.map((seed) => seed.labelKo).join(" · ")} 핵심 패턴`,
    version: "1.0.0",
    contentVersion: 1,
    required: true,
    minAppVersion: "1.0.0",
    releasedAt: "2026-08-08",
    categories: taxonomyFor(selectedAreas, "category"),
    situations: taxonomyFor(selectedAreas, "situation"),
    patterns,
  };
}

async function main(): Promise<void> {
  if (areas.length !== 65 || areas.some((seed) => seed.phrases.length !== 8)) {
    throw new Error(`65개 영역마다 정확히 8개 패턴이 필요합니다. 현재 영역 수: ${areas.length}`);
  }
  await mkdir(packsDirectory, { recursive: true });
  for (const definition of packDefinitions) {
    const pack = makePack(definition);
    await writeFile(path.join(packsDirectory, `${pack.packId}.json`), stableJson(pack), "utf8");
    console.log(`${pack.packId}: ${pack.patterns.length} patterns`);
  }
  console.log(`Generated ${areas.length * 8} patterns across ${packDefinitions.length} packs.`);
}

await main();
