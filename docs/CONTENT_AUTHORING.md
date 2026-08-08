# SayGrid 콘텐츠 작성 가이드

이 문서는 새 패턴 100개를 기존 UI 수정 없이 추가하는 실제 절차다. 핵심 원칙은 **이미 배포한 ID를 다시 만들거나 바꾸지 않는 것**이다.

## 1. 작업 단위 정하기

100개를 하나의 거대한 파일에 계속 덧붙이기보다 주제와 업데이트 주기가 비슷한 50~150개를 한 팩으로 묶는다. 예를 들어 여행 문제 해결 100개라면 다음처럼 정한다.

```text
packId: travel-problems-001
file: public/content/packs/travel-problems-001.json
version: 1.0.0
required: false
```

`packId`는 영구 ID다. 제목이나 파일명은 나중에 바꿀 수 있지만 packId는 바꾸지 않는다.

## 2. ID 설계하기

패턴 ID는 `영역.두자리순번-짧은-의미` 형식을 권장한다.

```text
travel-hotel.01-air-conditioner-not-working
travel-hotel.02-need-another-room
```

- 영문 소문자, 숫자, 점, 하이픈만 쓴다.
- 문장을 수정해도 같은 회화 기능이면 ID를 유지한다.
- 기존 ID를 재사용하지 않는다.
- `familyId`도 한 카드 패밀리에 하나씩 영구적으로 부여한다.
- `sortKey`는 전체 콘텐츠에서 유일한 `000.000.000` 형태로 정한다.

## 3. JSON으로 직접 작성하기

기존 팩 하나를 복사한 뒤 팩 메타데이터와 taxonomy를 먼저 바꾼다. 각 패턴에는 대표 영어, 자연스러운 한국어, 의도, 분류, CEFR, 말투, 3개 이상의 실제 예문을 넣는다.

```json
{
  "id": "travel-hotel.09-need-another-room",
  "familyId": "travel-hotel.family-09",
  "schemaVersion": 1,
  "contentVersion": 1,
  "pattern": "Could I get another + noun?",
  "english": "Could I get another room?",
  "korean": "다른 방을 받을 수 있을까요?",
  "intentKo": "숙소에서 다른 방을 정중하게 요청하기",
  "categoryIds": ["travel-hotel"],
  "situationIds": ["travel"],
  "tags": ["숙박", "문제 해결"],
  "cefr": "A2",
  "priority": "essential",
  "register": ["neutral", "polite"],
  "examples": [],
  "variants": [],
  "replies": [],
  "commonMistakes": [],
  "relations": {
    "similar": [],
    "contrast": [],
    "prerequisites": [],
    "followUps": [],
    "responses": []
  },
  "audio": {
    "ttsText": "Could I get another room?",
    "lang": "en-US"
  },
  "sortKey": "055.002.009",
  "releasedAt": "2026-08-08"
}
```

위 예시의 빈 예문 배열은 설명용이며 그대로는 검증을 통과하지 않는다. `CONTENT_SCHEMA.md` 형식으로 실제 예문 3개 이상을 채운다.

## 4. CSV로 100개 가져오기

CSV 헤더는 다음 필드를 지원한다.

```text
id,familyId,pattern,english,korean,intentKo,nuanceKo,usageNoteKo,categoryIds,situationIds,tags,cefr,priority,register,sortKey,examples,variants,replies,commonMistakes,relations,audio,aliases,releasedAt,detailsFile
```

배열형 단순 값은 `|`로 구분하거나 JSON 배열로 쓴다. `examples`, `variants`, `replies`, `commonMistakes`, `relations`, `audio`는 CSV 셀 안의 JSON 문자열을 쓸 수 있다. 복잡한 부분은 `detailsFile`에 CSV 파일 기준 상대경로를 넣고 별도 JSON 객체로 관리한다.

```text
npm run content:import -- ./drafts/travel-100.csv \
  --pack-id travel-problems-001 \
  --title-ko "여행 문제 해결" \
  --title-en "Travel Problem Solving" \
  --version 1.0.0
```

가져오기 도구는 ID를 자동 생성하지 않는다. ID 누락, 기존 콘텐츠와의 중복, 예문 부족이 있으면 파일을 만들지 않는다. 같은 경로가 이미 있으면 `--force` 없이는 덮어쓰지 않는다. `--force`는 사람이 변경 범위를 확인한 경우에만 쓴다.

## 5. 검증하기

```text
npm run content:validate
npm run content:duplicates
npm run content:report
```

- `content:validate`: 스키마, ID, taxonomy, relation, URL, 버전, manifest 해시를 검사한다.
- `content:duplicates`: 완전 중복과 문장부호·대소문자 차이 중복을 차단하고, 유사 표현 후보를 사람이 볼 수 있게 출력한다.
- `content:report`: `docs/CONTENT_REPORT.md`와 `docs/content-report.json`을 갱신한다.

오류는 배포 전에 모두 해결한다. 유사 표현이 의도된 경우에는 두 패턴의 기능 차이를 `nuanceKo`에 분명히 적고 relation으로 연결한다.

## 6. Manifest 만들기

```text
npm run content:manifest
npm run content:validate
```

manifest 생성기는 팩 파일을 자동 발견하고 다음을 다시 계산한다.

- SHA-256 해시
- 팩별·전체 패턴 수
- category, situation, tag와 각각의 개수
- 팩 URL과 버전

새 팩을 추가하기 위해 그리드, 검색, 필터, TTS 컴포넌트를 수정하지 않는다.

## 7. 실제 화면 검수하기

자동 검증 다음에는 모바일과 데스크톱에서 표본을 직접 확인한다.

1. 360px 화면에서 영어·한국어가 잘리지 않는지 본다.
2. 영어 가리기, 한국어 가리기, 듣기 전용에서 답이 올바르게 열린다.
3. TTS가 기호나 괄호를 어색하게 읽지 않는지 듣는다.
4. 예문과 변형이 대표 문장과 같은 대화 기능인지 확인한다.
5. 한국어가 번역투가 아닌 실제 의도인지 확인한다.
6. 관련 표현 이동이 잘못된 팩/ID를 가리키지 않는지 본다.

## 8. 배포 후 진도가 유지되는 이유

앱은 콘텐츠 원본과 사용자 데이터를 서로 다른 IndexedDB store에 저장한다. 사용자 진도는 `patternId` 키로 저장되므로 다음 작업은 진도를 지우지 않는다.

- 패턴 배열 순서 변경
- 대표 문장·번역·설명 보정
- 새 예문 추가
- 팩 파일명 변경
- 새 팩 추가

ID를 정말 바꿔야 할 때만 이전 패턴을 `deprecated: true`, `replacedBy: "새-id"`로 남긴다. 앱이 이전 진도와 메모를 새 ID로 이동한다.

## 9. 잘못 배포한 콘텐츠 수정하기

- 오탈자·번역·예문 보정: ID 유지, 패턴 `contentVersion`과 팩 patch 버전을 올린다 (`1.0.0` → `1.0.1`).
- 표현의 의미가 바뀜: 새 ID를 만들고 이전 ID는 deprecated/replacedBy로 남긴다.
- 팩을 잠시 내림: manifest에서 빠져도 사용자 진도는 삭제하지 않는다. 같은 ID로 다시 배포하면 복원된다.
- 잘못된 relation: 대상 ID를 고치고 전체 검증 후 manifest를 재생성한다.

마지막으로 `npm run build`가 성공해야 한다. 이 명령은 콘텐츠 검증 실패 시 앱 빌드도 실패시킨다.
