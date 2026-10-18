# DayO 변경 기록 (Changelog)

새 항목은 맨 위에 추가합니다. 각 항목: 날짜 · 무엇이 바뀌었나 · 관련 파일 · 확인한 것 · 남은 일.

---

## 2026-10-19 — 랜딩 스피킹 테스트 교체, 메일 디자인, 파트너 문구, 옛 로고 정리

배포: `main` d1bede3 (브랜치 4개 병합). 모두 주인(오너) 명시 요청.

### 1. 스피킹 감각 테스트 → "Emma 카톡" 대화 시뮬레이션 (영어 전용)
- 랜딩 `무료 스피킹 감각 테스트` 모달의 내용 교체. 한국 문화를 잘 아는 외국인 친구 Emma와 6턴 대화.
  - 매 턴 4개 답장 = 4가지 말버릇(유형). 가장 많이 고른 유형이 결과(동점이면 마지막 선택).
  - 유형(디저트): 마카롱=완벽주의 침묵형, 쿠키=단어 던지기형, 컵케이크=웃음 방패형, 푸딩=듣기만 프로형.
  - 매 턴 `한국어 찬스` 버튼(Emma가 한국어로 설명). 3번째 턴은 마이크로 말하기(브라우저 음성 인식, en-US).
    "I like"처럼 덜 끝난 답은 Emma가 되묻고 1회 재시도, 두 번째도 불명확하면 자연스럽게 넘어감. 건너뛰기 가능.
  - 결과 순서: 유형 카드 → Emma가 본 나 → 다음엔 이렇게 → `실제 대화에서 이렇게 말해보세요!`(표현 5개) → 가이드북 신청 → 대화 주제/예약 → 다시 하기.
- 언어 탭(불/일/중/스)은 숨김(영어 전용). 기존 말하기 3문장 코드는 남겨 두었고, 새 스크립트가 못 뜨면 예전 테스트가 대신 열림.
- 가이드북 신청 동의 UI: 맨 위 `아래 내용에 모두 동의합니다`(방문자가 직접 체크), 필수/선택 각각 체크박스 유지, 상세 설명은 화살표로 펼침. **광고 수신 동의는 기본 체크하지 않음**(KISA 안내서상 사전 체크 동의는 무효).
- 색: 세이지그린 #5F7D63 · 버터옐로우 #FFF4CC/#FFEAA7 · 아이보리 #FFFBF4 · 글자 #40362F.
- 파일: `public/emma-chat-test.js`, `public/emma-chat-test.css`, `public/index.html` (+ 루트 미러).
- 테스트: `tests/emma-chat-test-browser.cjs` (KO/EN × 360/390/430/1280, 마이크는 모의 음성인식).
- 로컬 기록: localStorage `dayo_speaking_sense_history`에 `format: 'emma-chat'`, `dessert_type`, `korean_help_used`, `mic_checked`.

### 2. 가이드북 메일 리디자인
- 신청 시 테스트 결과 유형(`dessertType`)을 함께 전송 → 메일 제목/본문 개인화
  ("마카롱님, 가이드북이 도착했어요 ☕", 유형별 시작 장: 마카롱·쿠키 PART 2, 컵케이크 PART 1, 푸딩 PART 5 — 가이드북 PART 0 표 기준).
- 가이드북 PART 1 실제 문장 3개 미리보기 + `가이드북 열기 (PDF 21쪽)` 버튼. 상단에 DayO 로고(흰 띠).
- **광고 버전은 같은 신청에서 광고 수신에 동의한 경우에만**: 제목 앞 `(광고)`, DayO 소개 + `첫 대화 9,900원` 예약 버튼, 보낸 곳/수신 거부 푸터.
  동의 안 한 사람은 비광고 버전(가격·예약 버튼 없음, 기존 비마케팅 문구 + 수신 거부 링크).
- 파일: `api/_lib/guidebook-email.js`(신규), `api/_lib/guidebook-delivery.js`(본문만 교체, 저장/중복방지/재시도 로직 그대로), 메일용 그림 `public/images/emma/{mac,cookie,cup,pud}.png` (+ 루트 미러).
- 테스트: `tests/guidebook-email-fixtures.cjs`, 기존 `tests/speaking-guidebook.cjs` 통과. 실제 메일 발송 테스트는 안 함.

### 3. 가입 환영 메일(학습자) 디자인 교체
- 문구·링크는 그대로, 카드 디자인으로 교체(로고 헤더, 체크리스트 카드, 9,900원 안내 박스, 세이지 버튼). 파트너 환영 메일은 변경 없음.
- 파일: `api/_lib/transactional-email.js` + 관리자 미러 `admin/src/lib/transactional-email.js`(테스트가 동일성 요구).
- 테스트: `tests/transactional-email-localization-fixtures.cjs` 통과.

### 4. 파트너 소개 문구
- "한국에서 생활하는 외국인 파트너" → **"한국 문화를 잘 아는 외국인 파트너"** (EN: "who knows Korean culture well") — 랜딩 소개, 대화방 안내, Emma 테스트.
- 파트너 모집 FAQ: "한국에 거주하며" → **"한국을 좋아하며"** (EN: "who love Korea"). 한국어 레벨은 지원 시 확인.
- 이유: 파트너 프로필에 해외 거주 선택지가 있어 "한국에 사는"은 사실과 달라질 수 있음.
- 미변경: 음성인식(Soniox) 참고 문장, 파트너 프로필 거주지 선택 항목.

### 5. 옛 붉은 로고 삭제
- `logo.png`, `images/logo.png`, `public/logo.png`, `public/images/logo.png` 삭제. 사이트/메일/API 참조 없음 확인.
- 샘플 그림으로 쓰던 테스트·미리보기 도구는 `logo-square.png`로 교체.
- 확인 못 한 것: 저장소 밖 설정(예: Supabase 인증 메일 템플릿)에 옛 로고 URL이 있다면 깨질 수 있음.

### 기존부터 실패하던 테스트 (이번 변경과 무관, 수정 전에도 동일)
- `tests/header-conversation-cta-fixtures.test.js`, `tests/price03-landing-fixtures.cjs`, `tests/customer-navigation-fixtures.cjs`, `tests/signup-benefit-and-welcome-fixtures.test.js`(계정 설정 항목), `tests/learner-language-recap-fixtures.test.js`(reviewSavePromise).

### 남은 일
- 실제 운영 사이트에서 마이크/메일 수신 확인(실제 발송 1회).
- '돼요' 글자 로고 파일이 따로 있다면 메일 헤더 교체.
