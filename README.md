# SayGrid

SayGrid는 회화 패턴을 화면 가득 펼쳐 놓고 영어·한국어를 가리거나 듣고, 카드마다 기억 상태를 기록하며 반복하는 정적 PWA입니다. 로그인과 유료 API 없이 브라우저만으로 핵심 학습 흐름이 작동합니다.

## 핵심 기능

- 모두 보기, 영어 가리기, 한국어 가리기, 듣기 전용
- 카드 문장을 누르면 영어 발음을 즉시 재생하고, 가리기 모드에서는 정답도 함께 확인
- 패턴 공식과 대표 문장이 같을 때는 한 번만 표시하고, 실제로 다른 공식만 보조 정보로 표시
- 현재 필터 안에서 중복 없는 랜덤 8·20·50·100 세션
- 영어·한국어·예문·뉘앙스·개인 메모 통합 검색과 조합 필터
- 사전 녹음 음성을 우선 사용하는 Web Speech TTS
- 영어만, 영→한, 한→영, 두 번 듣기, 느리게→보통 속도의 연속 듣기
- 콘텐츠 팩 단위 검증·캐시·업데이트 및 안정적인 패턴 ID 기반 진도 보존
- 반응형 가상 그리드, IndexedDB 저장, 오프라인 설치

## 시작하기

Node.js 20 이상을 권장합니다.

```bash
npm install
npm run dev
```

검증과 프로덕션 빌드:

```bash
npm test
npm run typecheck
npm run content:validate
npm run build
```

콘텐츠 관련 명령:

```bash
npm run content:validate
npm run content:duplicates
npm run content:manifest
npm run content:report
npm run content:import -- ./patterns.csv
npm run content:perf
```

## 구조

```text
public/content/          manifest와 배포되는 JSON 콘텐츠 팩
src/content/             스키마, 검증, 로더, 마이그레이션
src/components/          가상 그리드와 학습 UI
src/hooks/               TTS와 연속 듣기 컨트롤러
src/lib/                 IndexedDB, 검색, 랜덤, 학습 기록 로직
scripts/                 콘텐츠 제작·검수 CLI
docs/                    콘텐츠 작성·스키마·업데이트 안내
```

콘텐츠 원본과 사용자 기록은 분리됩니다. 진도·즐겨찾기·메모는 배열 위치가 아닌 영구 `patternId`에 연결되므로 문구 수정이나 팩 업데이트 뒤에도 유지됩니다. 새 팩은 `public/content/packs`에 추가한 다음 검증하고 manifest를 다시 만들면 UI 수정 없이 반영됩니다. 자세한 절차는 [콘텐츠 작성 안내](docs/CONTENT_AUTHORING.md)를 참고하세요.

## TTS와 오디오

카드에 `audio.audioUrl` 또는 `audio.slowAudioUrl`이 있으면 해당 파일을 먼저 재생합니다. 파일이 없거나 로드에 실패하면 Web Speech API로 안전하게 대체합니다. 음성 목록은 브라우저의 지연 로딩을 고려해 `voiceschanged`를 구독하며, 새 재생 전 기존 큐를 취소해 소리가 겹치지 않습니다.

음성 품질과 설치 가능한 음성은 운영체제·브라우저마다 다릅니다. 영어 음성이 없으면 사용 가능한 영어 계열 음성, 그마저 없으면 브라우저 기본 음성을 선택합니다.

## GitHub Pages 배포

기본 Vite base와 PWA scope는 Vercel·로컬·커스텀 도메인에서 바로 열리는 `/`입니다. GitHub Pages 워크플로는 저장소 경로에 맞게 `VITE_BASE_PATH=/eng/`를 지정합니다.

```bash
npm run build
```

다른 하위 경로에 배포할 때는 빌드 시 `VITE_BASE_PATH`로 덮어쓸 수 있습니다.

```bash
VITE_BASE_PATH=/my-path/ npm run build
```

`dist` 디렉터리를 GitHub Pages에 배포하세요. 서비스 워커 업데이트는 학습 중 화면을 강제로 새로고침하지 않고, 새 버전이 준비됐을 때 사용자가 적용하는 `prompt` 방식입니다.

## 데이터와 개인정보

학습 기록, 설정, 즐겨찾기와 개인 메모는 기본적으로 현재 브라우저의 IndexedDB에만 저장됩니다. 설정에서 JSON 백업을 내보내거나 복원할 수 있습니다. 브라우저 저장소를 삭제하면 백업하지 않은 데이터도 함께 사라질 수 있습니다.

## 접근성

모든 핵심 조작은 키보드와 스크린 리더 사용을 고려합니다. 카드에서 `Enter` 또는 `Space`로 발음을 재생하고 가려진 정답을 열며, `P`로 다시 재생하고 `R`로 다시 가릴 수 있습니다. `Esc`는 열린 상세 패널을 닫습니다. 숙련 상태는 색뿐 아니라 모양과 텍스트로도 전달합니다.
