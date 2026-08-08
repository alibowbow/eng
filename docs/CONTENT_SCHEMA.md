# SayGrid 콘텐츠 스키마

SayGrid의 화면 코드는 콘텐츠 팩을 직접 import하지 않는다. 앱은 `public/content/manifest.json`을 읽고, manifest에 등록된 팩을 런타임 검증한 뒤 사용한다. 현재 스키마 버전은 `1`이다.

## 파일 구조

```text
public/content/
├── manifest.json
└── packs/
    ├── core-conversation-001.json
    └── ...
```

브라우저의 기준 타입은 `src/content/schema.ts`, 런타임 검증 규칙은 `src/content/validator.ts`에 있다. 이 문서보다 코드가 더 최신이면 코드가 기준이다.

## ContentPack

```ts
interface ContentPack {
  schemaVersion: 1;
  packId: string;              // 영구 ID: 소문자, 숫자, 점, 하이픈
  titleKo: string;
  titleEn: string;
  descriptionKo?: string;
  version: string;             // SemVer, 예: 1.2.0
  contentVersion: number;      // 팩 내부 데이터 개정 번호
  required: boolean;
  minAppVersion: string;       // SemVer
  releasedAt: string;          // YYYY-MM-DD 또는 ISO UTC
  categories: TaxonomyItem[];
  situations: TaxonomyItem[];
  patterns: ConversationPattern[];
}
```

- `packId`는 파일명을 바꾸더라도 유지한다.
- 기존 팩 내용을 바꾸면 `version`을 올린다.
- 앱 실행에 꼭 필요한 팩만 `required: true`로 둔다. 선택 팩은 설치된 경우에만 다시 로드된다.
- 패턴이 참조하는 모든 `categoryId`, `situationId`는 같은 팩의 taxonomy에 선언한다.

## ConversationPattern

필수 필드는 다음과 같다.

```ts
interface ConversationPattern {
  id: string;
  familyId: string;
  schemaVersion: 1;
  contentVersion: number;

  pattern: string;
  english: string;
  korean: string;
  intentKo: string;
  nuanceKo?: string;
  usageNoteKo?: string;

  categoryIds: string[];
  situationIds: string[];
  tags: string[];
  cefr: "A1" | "A2" | "B1" | "B2" | "C1";
  priority: "essential" | "common" | "extended";
  register: Array<"casual" | "neutral" | "polite" | "formal">;

  examples: PatternExample[];       // 최소 3개
  variants: PatternVariant[];
  replies: PatternReply[];
  commonMistakes: PatternMistake[];
  relations: PatternRelations;

  pronunciation?: PatternPronunciation;
  audio?: PatternAudio;
  sortKey: string;                  // 000.000.000 형태, 전체에서 유일
  aliases?: string[];
  deprecated?: boolean;
  replacedBy?: string;
  releasedAt?: string;
}
```

`id`와 `familyId`는 한 번 배포한 뒤 바꾸지 않는다. 사용자의 진도, 메모, 즐겨찾기, 복습 일정이 배열 위치가 아니라 `id`에 연결되기 때문이다.

### 예문

```json
{
  "id": "ask-repeat.01-could-you-say-that-again.example-1",
  "english": "A: Could you say that again? B: Sure, no problem.",
  "korean": "A: 다시 한 번 말씀해 주시겠어요? B: 물론이죠, 문제없어요.",
  "situationId": "conversation",
  "noteKo": "짧은 대화 예시"
}
```

예문 ID도 패턴 안에서 유일하고 안정적으로 유지한다. 대표 카드 문장을 그대로 세 번 복제하지 말고, 서로 다른 슬롯·상황·응답을 보여주는 실제 문장 세 개 이상을 작성한다.

### 변형과 응답

```ts
interface PatternVariant {
  id: string;
  english: string;
  korean: string;
  register: "casual" | "neutral" | "polite" | "formal";
  nuanceKo?: string;
}

interface PatternReply {
  id: string;
  english: string;
  korean: string;
  type: "positive" | "negative" | "hesitant" | "clarification" | "follow-up";
}
```

변형은 단순히 다른 예문이 아니라 같은 대화 기능을 다른 말투로 수행하는 표현이다. 응답은 해당 표현을 들은 상대가 실제로 할 수 있는 말이다.

### 관계

모든 배열은 패턴 `id`를 참조한다.

```json
{
  "similar": [],
  "contrast": [],
  "prerequisites": [],
  "followUps": [],
  "responses": []
}
```

존재하지 않는 ID와 자기 자신은 참조할 수 없다. 다른 팩의 ID를 참조할 수는 있지만, 해당 팩도 같은 배포의 manifest에 있어야 검증을 통과한다.

### 음성

```json
{
  "ttsText": "Could you say that again?",
  "lang": "en-US",
  "audioUrl": "audio/ask-repeat/example.mp3",
  "slowAudioUrl": "audio/ask-repeat/example-slow.mp3",
  "speaker": "speaker-01",
  "accent": "General American"
}
```

`audioUrl`이 있으면 녹음 음성을 우선 사용하고, 없으면 `ttsText`를 Web Speech API로 읽는다. URL은 HTTPS 또는 앱 상대 경로만 허용한다.

## Manifest

manifest는 직접 편집하지 않고 `npm run content:manifest`로 만든다.

```ts
interface ContentManifest {
  schemaVersion: 1;
  contentVersion: string;
  generatedAt: string;
  totalPatternCount: number;
  packs: ManifestPack[];
  categories: TaxonomyItem[];
  situations: TaxonomyItem[];
  tags: Array<{ id: string; count: number }>;
}
```

팩 URL은 `content/packs/example.json`처럼 Vite `BASE_URL` 기준 상대경로다. `/content/...`처럼 도메인 루트에 고정하면 GitHub Pages의 `/eng/` 배포에서 깨진다. `hash`는 `sha256-`와 64자리 소문자 hex로 구성되며, 다운로드한 원문과 일치해야 캐시에 활성화된다.

## ID 변경과 폐기

같은 표현을 다듬는 경우에는 `id`를 유지하고 `contentVersion`과 팩 버전만 올린다. 의미상 완전히 다른 패턴으로 교체해야 하면 이전 레코드를 즉시 삭제하지 않는다.

```json
{
  "id": "old.pattern-id",
  "deprecated": true,
  "replacedBy": "new.pattern-id"
}
```

이전 이름을 새 패턴으로 흡수할 때는 새 패턴의 `aliases`에 이전 ID를 넣을 수도 있다. 앱의 마이그레이션은 숙련도, 일정, 즐겨찾기, 메모를 canonical ID로 옮긴다. `replacedBy` 순환은 빌드 오류다.

## 검증에서 배포를 막는 항목

- 필수 필드 및 한국어 번역 누락
- 지원하지 않는 CEFR, 말투, 우선순위
- 팩/패턴/패밀리/예문 ID 형식 오류 또는 중복
- 문장부호와 대소문자만 다른 영어 문장 중복
- `sortKey` 충돌
- 예문 3개 미만
- 선언하지 않은 category/situation
- 존재하지 않는 relation/replacement ID
- 위험하거나 잘못된 음성 URL
- SemVer, 날짜, 해시, 스키마 버전 불일치
- `replacedBy` 순환

긴 카드 문장은 경고로 보고되며 사람이 실제 모바일 화면에서 다시 검수한다.
