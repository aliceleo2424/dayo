# DayO — Non-Negotiable Coding Agent Rules

These instructions govern **every task in this repository**, whether requested in Korean or English. The owner is a product founder, not an engineer: understand ordinary-language requests without requiring a developer-formatted prompt. **Do not transfer the burden of technical planning or routine QA to the owner.**

## 1. Strict task isolation — the highest-priority operating rule

- Implement **only** the behavior explicitly requested in the current task. A report, an idea, or an earlier discussion is not permission to modify other features.
- First identify the smallest impacted files, observable success criteria, and protected neighboring functionality. Give a brief scope statement only when helpful; do not demand an elaborate prompt.
- Read only relevant files and relevant sections of project guidance. **No repository-wide re-audits, summaries, mass searches, or unrelated dirty-file analysis** on each task. Continue from existing Work/Codex state and use current repository evidence as needed.
- **Never** refactor, rename, delete, optimize, reformat, redesign, update dependencies, or “clean up” unrelated code opportunistically, including while fixing a bug.
- If a change outside scope is genuinely necessary, **stop and request a narrow, explicit scope expansion**; do not silently include it. A test for the requested feature and an exact root/public mirror are allowed as scoped support files, and must be reported.
- Handle separate issues in **separate changes, commits, and releases**. Do not bundle illustration, paid STT, bookings, quizzes, or UI changes merely because they were discussed in the same conversation.
- If a test reveals an unrelated pre-existing failure, compare against the untouched base, record it, and leave unrelated code unchanged. Never “fix the fixtures” to make a failing feature appear to pass.

## 2. Preserve the working tree and source layout

- Inspect `git status --short`, active branch, and base commit before editing. Existing uncommitted changes in any worktree belong to the owner and **must remain untouched**.
- Never use `git reset --hard`, broad `git checkout/restore`, `git clean`, force-push, blanket staging (`git add .` / `git add -A`), or automatic conflict resolution that discards changes.
- Stage **exact approved files or hunks** only; confirm the staged diff matches the task. Do not commit or deploy pre-existing dirty changes.
- Canonical customer static source is `public/`; synchronize matching root static files when the existing deployment structure requires it. Do **not** collapse or remove these mirrors. Do **not** mirror `vercel.json`. Preserve unrelated changes in `public/partner.html`.
- Server endpoints live in root `api/`; Admin app in `admin/`. Do not edit either without direct task relevance.
- Never delete an apparently unused feature without checking imports, DOM IDs, global JS entry points, dynamic calls, RPCs, Admin users and future-use status. Webinar and dormant functionality are **preserved**, not assumed obsolete.

## 3. Protected systems — explicit approval required

Treat the following as read-only unless the owner specifically authorizes that exact change: Supabase Auth/login/OAuth, identities/profiles, RLS and grants, DB schema/migrations, bookings and cancellation, ticket lots/allocations/ledgers, checkout/PortOne/payments, rewards/payouts, safety/refunds, Admin privileges, environment secrets, Vercel configuration, and Production feature flags.

- Read-only diagnosis is not authorization to write. **Never apply migrations, manipulate Production records, issue real payouts, spend paid API credits, mint billable credentials, or activate customer features without scope-specific permission.**
- A migration approved and applied once must **never** be reapplied. Do not bypass ownership checks, time windows, RLS, allocation limits, or rate limits just to pass a test.
- Do not expose `.env*`, JWTs, service-role keys, restricted API keys, audio/transcript contents, participant personal data, or secret values in code, logs, tickets or reports.
- Always distinguish **local fix**, **mock test**, **real Preview**, **real authenticated E2E**, and **Production Ready**. Never present one as another.

## 4. Preserve the product contract and existing UX

`docs/DAYO_PRODUCT_CONTRACT.md` contains the owner's signed-off functional behavior. Consult **only relevant sections** for the requested task. Never reinterpret the product to make engineering easier.

Critical examples: preserve partner→learner live CC captions, 25-minute conversation plus 5-minute follow-up, mobile Talk Cards, independent participant STT, Letter submission, grounded learner quiz, customer feedback-before-Recap, and **Partner-owned illustration selection/preview/send decision**. No mandatory Admin review. Optional private Partner→Operations note is **not** a refund/safety report.

Do not change hero copy, booking purchase flow, pricing, language availability, STT provider, image provider, or Recap design during an unrelated fix. If an existing feature is disabled, preserve its disabled state unless specifically authorized to enable it.

## 5. Tests are a release gate, not a decorative report

Follow `docs/DAYO_RELEASE_GATES.md`. First establish relevant **untouched-base** test behavior. Then test the requested positive path, failure path, double-tap/reload, both roles where relevant, and contractually protected neighboring paths.

- Tests must exercise **real DOM interactions and the actual data/event route** where possible, not just the presence of functions, string matching or mocked success responses.
- Mobile UI changes require screenshots and tap/scroll/keyboard checks at **360, 390, 430 px and desktop**, in **KO/EN**, using both roles as applicable. No clipped buttons, invisible submit controls, horizontal overflow, stuck overlays, or unexpected browser zoom.
- Always run the existing normal room regression runner when the room or its dependencies change: `node tests/production-room-regressions.test.js`. Use additional task-relevant suites, not every unrelated test by default.
- For server/storage/permissions, test participant allow/deny and a real authenticated read/write only when authorized. Synthetic tests do **not** establish live security, speech accuracy, or device success.
- No deletion or disabling of existing features to pass an unrelated test. Missing valid quiz evidence must be explained honestly; never invent the learner's speech.
- If a required suite fails on the changed branch but passes on untouched base, **stop release**. If it fails in both, document and escalate only if it blocks this scope.
- `AGENTS.md` alone **cannot enforce CI**. Ensure the release workflow and required branch checks described in `docs/DAYO_RELEASE_GATES.md` are actually installed and passing before claiming an automated gate exists.

## 6. Scope/approval/deployment discipline

- For each task, privately establish `IN SCOPE`, `OUT OF SCOPE`, `ACCEPTANCE`, `REGRESSION CHECKS`, and `APPROVAL REQUIRED`. Report only meaningful blockers; minimize status overhead.
- No automatic push, Production deploy, migration, or external data write from a vague “check/fix” request. If the owner explicitly authorizes a scoped release, proceed only after its real gates pass.
- Use a task branch or isolated worktree as appropriate, with scoped staging and one narrow commit. Validate `HEAD`, branch, test run, deployed revision and Production domain only if a deployment actually occurred.
- Do not consume one-time trial slots, image attempts, or paid-provider tokens for a test that could be performed read-only or with a local fixture.
- If blocked, state the **single exact remaining blocker**, preserve progress, and do not start tangential audits or infrastructure projects.

## 7. Required final report — short, in English

Report: **Outcome** (DONE / PARTIAL / BLOCKED); **exact files changed**; **what behavior was proven**; **regressions passed/failed** (distinguish baseline failures); **real device / authenticated / Production verification status**; **commit SHA + deployment URL/status only if verified**; and **one owner action only if unavoidable**.

Never say “fixed,” “saved,” “deployed,” “secure,” or “Production Ready” without matching evidence. Do not misrepresent old test sessions as new results. Do not ask the owner to run commands that you can safely execute yourself.

---

# Pre-existing DayO rules — retained without modification

# DayO 개발 기본 원칙

## 1. 작업 범위 제한

- 사용자가 요청한 범위 밖의 파일, 기능, 데이터 구조를 임의로 수정하지 않는다.
- “더 깔끔하게 만들기”, “리팩터링”, “최적화”, “코드 정리” 등의 이유로 요청되지 않은 주변 코드를 수정하지 않는다.
- 요청을 해결하는 데 필요한 최소한의 파일만 수정한다.
- 여러 변경이 필요하면 한 번에 처리하기보다 독립적인 단계로 나눈다.

## 2. 핵심 시스템 보호

사용자가 명시적으로 변경을 요청하지 않는 한 다음 영역을 수정하지 않는다.

- Supabase Auth
- 로그인 및 회원가입
- OAuth provider
- `profiles`의 사용자 식별 구조
- RLS
- DB schema 및 migration
- 예약 RPC
- 이용권 차감
- 결제 및 정산
- 관리자 권한
- 환경변수
- Vercel 배포 설정

다른 기능을 수정하는 과정에서 위 영역까지 변경해야 한다고 판단되면 작업을 중단하고 그 이유를 보고한다.

## 3. 사용자 데이터 보호

- 기존 사용자 데이터를 추측으로 변환하거나 일괄 업데이트하지 않는다.
- 로그인·가입 경로(provider)를 임의로 변경하지 않는다. Google 가입자를 Kakao 가입자로, email 가입자를 social 가입자로 바꾸는 등의 일괄 데이터 변경을 금지한다.
- 필드의 의미가 불명확하면 기존 값을 보존한다.
- DB migration이나 데이터 보정이 필요하면 별도 작업으로 제안하고 자동 실행하지 않는다.

## 4. 삭제 규칙

파일이나 기능이 오래되어 보이거나 현재 화면에 보이지 않는다는 이유만으로 삭제하지 않는다. 삭제 전 반드시 다음을 확인한다.

- import 및 reference
- DOM 참조
- `window` 전역 호출
- 다른 JS 파일의 호출
- API 호출
- Supabase table 및 RPC 의존
- admin 의존
- 런타임 동적 호출 가능성

삭제가 안전하다는 근거가 명확하지 않으면 삭제하지 않고 보고한다.

## 5. 현재 제품 기준

DayO는 영어 수업이나 화상영어 서비스가 아니다. 한국에 사는 외국인과 취향과 일상을 나누는, 안전하게 관리되는 1:1 글로벌 대화 서비스다.

핵심 세션 구조는 다음과 같다.

1. 관심사와 이야기 주제 선택
2. 이야기 카드 확인
3. 25분 1:1 글로벌 대화
4. 필요한 순간 AI 언어 도움
5. 5분 후속 활동
6. 총 30분 세션 완료

5분 후속 활동은 현재 유지 대상이다. 현재 구현된 퀴즈와 문장 재구성 기능은 사용자가 명시적으로 변경 또는 제거하라고 하기 전까지 삭제하지 않는다. ‘오늘의 대화 기록’도 유지한다.

## 6. 향후 사용 기능 보호

- 현재 적극적으로 사용하지 않는 기능도 향후 사용 예정일 수 있으므로 자동으로 폐기하지 않는다.
- 웨비나 기능은 향후 사용할 예정이므로 삭제하지 않는다.
- 기능 상태를 `현재 사용`, `유지·비활성`, `재설계 예정`, `폐기 확정`으로 구분한다.
- 사용자가 명시적으로 `폐기 확정`한 기능만 제거한다.

## 7. 배포 소스 기준

현재 사용자 정적 사이트의 canonical source는 `public/`으로 취급한다.

- 사용자 HTML/JS/CSS: `public/`
- 서버 함수: 루트 `api/`
- 관리자 사이트: `admin/`

사용자 정적 파일을 수정할 때는 다음 순서를 따른다.

1. `public/` 파일을 먼저 수정한다.
2. 같은 이름의 루트 정적 파일이 있으면 당분간 동일 변경을 동기화한다.
3. `vercel.json`은 동기화하지 않는다.
4. `public/partner.html`의 기존 미커밋 변경을 훼손하지 않는다.

루트와 `public/`의 중복 구조를 임의로 제거하거나 재구성하지 않는다.

## 8. 기존 미커밋 변경 보호

- 작업 시작 전에 `git status`를 확인한다.
- 작업 시작 전부터 존재한 미커밋 변경은 사용자의 기존 작업으로 간주한다.
- 기존 변경을 되돌리거나 덮어쓰거나 `reset`하지 않는다. `checkout`으로 복구하지도 않는다.
- 작업 결과를 보고할 때 기존 변경과 이번 변경을 구분한다.

## 9. 작업 전 확인

실제 수정 전에 다음을 확인한다.

- 변경할 파일
- 영향을 받는 기능
- 의존 관계
- 수정하지 않을 영역

요청 범위를 벗어난 변경이 필요하면 임의로 진행하지 않는다.

## 10. 작업 후 보고

모든 작업 후 다음을 보고한다.

1. 수정한 파일
2. 각 파일에서 변경한 내용
3. 변경하지 않은 관련 영역
4. 실행한 테스트 또는 검증
5. 확인된 부작용 여부
6. 추가 확인이 필요한 사항

## 11. 비밀정보

- `.env.local` 및 기타 환경변수의 실제 비밀값을 출력하지 않는다.
- API secret, service role key, private token 등을 코드에 하드코딩하지 않는다.
- 서버용 비밀값을 브라우저 코드로 이동하지 않는다.

## 12. 모호한 경우의 기본 행동

- 무엇을 변경해야 할지 확실하지 않을 때는 추측해서 범위를 넓히지 않는다.
- 기존 동작과 데이터를 보존하는 쪽을 선택하고, 확인이 필요한 사항으로 보고한다.

## 제품 기준 문서 (기능 작업 전 먼저 읽기)

- 이야기 게임 · 나라별 이야기책 · 마이페이지 책장: `docs/STORY_BOOKSHELF_ORIGINAL_CONCEPT.md`가 Owner가 고른 원안(2026-10-18 확인)이다. `/demo-story` 데모와 리캡 "이야기 한 장면" 카드는 변형 · 별개 기능이며, 교체나 병합은 Owner 확인 후 별도 작업으로 한다.
- 편지함 · 5탭 메뉴 · 티켓 스탬프 등 고객 화면 아이디어: `docs/DAYO_UX_IDEAS_LETTERBOX_BOOKSHELF.md`.

