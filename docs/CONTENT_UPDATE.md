# SayGrid 콘텐츠 업데이트 운영

앱 코드와 콘텐츠 릴리스는 서로 독립적이다. 정적 호스팅에서 `public/content/packs/*.json`과 `public/content/manifest.json`만 바꾸어도 새 회화 팩을 배포할 수 있다.

## 안전한 업데이트 순서

```text
1. 팩 JSON 추가 또는 수정
2. npm run content:validate
3. npm run content:duplicates
4. npm run content:manifest
5. npm run content:validate
6. npm run content:report
7. npm run build
8. 팩 파일을 먼저 배포
9. manifest.json을 마지막에 배포
```

manifest를 마지막에 올리는 이유는 새 manifest가 아직 없는 팩 URL을 가리키는 짧은 불일치를 피하기 위해서다. 호스팅이 원자적 배포를 제공하면 빌드 결과 전체를 한 번에 배포한다.

## 버전 규칙

- 패턴 설명·번역·예문 교정: 팩 patch 버전 증가 (`1.0.0` → `1.0.1`)
- 호환되는 필드/패턴 추가: minor 증가 (`1.0.1` → `1.1.0`)
- 앱 지원이 필요한 스키마 변경: major 증가, `schemaVersion`과 `minAppVersion`도 함께 검토
- 같은 패턴을 고쳤다면 패턴 ID는 유지하고 `contentVersion`을 증가
- manifest의 `contentVersion`은 생성기가 가장 최근 팩 배포일에서 만든다

이미 배포한 JSON을 바꾸고 팩 버전을 그대로 두면 안 된다. 해시가 달라져도 운영자가 변경 의미를 추적하기 어렵다.

## 앱의 업데이트 흐름

`src/content/loader.ts`는 다음 순서로 동작한다.

1. IndexedDB의 마지막 정상 manifest를 읽는다.
2. Vite `BASE_URL` 기준 `content/manifest.json`을 `no-cache`로 요청한다.
3. packId, version, hash를 로컬 캐시와 비교한다.
4. 변경된 팩만 다운로드한다.
5. SHA-256과 런타임 스키마를 모두 검증한다.
6. 성공한 팩만 새 캐시로 교체한다.
7. 다운로드나 검증이 실패하면 이전 정상 팩을 유지한다.
8. 새 패턴 수와 변경 팩을 결과의 `updates`로 반환한다.

따라서 네트워크가 끊기거나 새 팩 하나가 깨져도 이미 학습하던 콘텐츠를 잃지 않는다. 첫 방문 오프라인처럼 정상 캐시가 전혀 없는 경우에는 필수 팩을 만들 수 없으므로 오류를 표시한다.

## GitHub Pages 경로

manifest의 URL은 다음처럼 앱 기준 상대경로를 쓴다.

```json
{ "url": "content/packs/travel-problems-001.json" }
```

로더가 `import.meta.env.BASE_URL`과 결합하므로 `/eng/` 아래에서도 `/eng/content/...`로 요청된다. 도메인 루트 `/content/...`를 직접 코드에 쓰지 않는다.

## 필수 팩과 선택 팩

- `required: true`: 기본 학습 범위. 앱 시작 때 반드시 준비한다.
- `required: false`: 설치 요청이 있거나 이전에 설치한 경우 불러온다.

선택 팩을 끈다고 캐시와 진도를 즉시 삭제하지 않는다. `setPackEnabled(packId, false)`는 표시만 중단하고, 재활성화했을 때 기존 상태를 복구한다.

## ID 마이그레이션

표현을 새 ID로 교체할 때 이전 패턴을 적어도 한 번의 호환 기간 동안 팩에 남긴다.

```json
{
  "id": "travel.old-request",
  "deprecated": true,
  "replacedBy": "travel.polite-request"
}
```

`migrateStoredUserData()`는 다음 레코드를 canonical ID로 옮긴다.

- 숙련도와 평균 반응 시간
- 복습 예정일
- 즐겨찾기
- 개인 메모

두 ID 모두 진도가 있으면 성공·실패 횟수는 합치고 숙련도는 높은 값을 보존하며, 복습일은 더 이른 날짜를 선택한다. `replacedBy` 순환이나 존재하지 않는 대상은 콘텐츠 검증에서 차단된다.

## 롤백

문제가 생기면 이전의 팩 파일과 manifest를 함께 복원한다. 브라우저는 manifest 해시가 이전 값으로 돌아온 것을 변경으로 인식하고 해당 팩을 다시 받는다. 새 팩 다운로드가 실패하더라도 기존 IndexedDB 캐시는 유지된다.

패턴 ID를 이미 사용자에게 배포했다면 롤백 중에도 같은 의미에 다른 ID를 붙이지 않는다. 삭제한 팩을 다시 올릴 때 원래 packId와 patternId를 사용하면 사용자 진도가 다시 연결된다.

## 백업과 초기화 범위

`src/lib/db.ts`가 제공하는 API:

- `exportBackup()` / `importBackup()`: 진도, 일정, 즐겨찾기, 메모, 설정, 세션, 위치
- `resetSettings()`: 설정만 초기화
- `resetLearningData()`: 학습 관련 사용자 데이터만 초기화
- `resetPackProgress(patternIds)`: 특정 팩의 패턴 ID만 초기화
- `deleteAllData()`: 콘텐츠 캐시를 포함한 전체 로컬 데이터 삭제

콘텐츠 캐시는 사용자 백업에 넣지 않는다. manifest와 팩은 서버에서 다시 검증해 받을 수 있지만 사용자 학습 기록은 다시 만들 수 없기 때문이다.

## 배포 전 체크리스트

- [ ] 새 ID가 기존 ID와 겹치지 않는다.
- [ ] 영어·한국어·의도와 예문 3개를 사람이 검수했다.
- [ ] relation 대상이 이번 배포에 존재한다.
- [ ] 팩 버전과 releasedAt을 올렸다.
- [ ] manifest를 팩 수정 후 다시 만들었다.
- [ ] `content:validate`, `content:duplicates`, `build`가 성공한다.
- [ ] 모바일에서 긴 카드와 TTS를 표본 검사했다.
- [ ] 정적 호스팅에서는 팩보다 manifest가 먼저 노출되지 않는다.
