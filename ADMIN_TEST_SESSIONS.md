# 관리자 테스트 세션

## 계약과 운영 상태

- 운영 DB `mmhapsimcngmtefqfrcg`의 실제 함수 정의와 hash를 확인했다. 090 매칭과 091 파트너 취소는 이미 운영에 존재하며, 2026-10-06 사용자 승인으로 092 → 093 → 095를 단독 적용했다. 094 CMS는 제외했다.
- `093_admin_test_sessions.sql`은 새 `bookings.is_test_session boolean not null default false`를 추가한다. 기존 예약은 일반 예약으로 유지하며 과거 데이터를 추측해 TEST로 변환하지 않는다.
- `admin_create_test_session(user, partner, language, scheduled_at, request_id)`는 실제 관리자 권한을 확인한다. 예약 ID는 request UUID이며, 동일 요청 재시도는 같은 예약을 반환한다. 다른 요청과 같은 UUID를 재사용하면 거절한다.
- 실제 `profiles.id`로 역할을 확인하고 `learner_id`, `partner_id`, `partner_user_id`를 저장한다. `slot_id=null`, `status=confirmed`, 금전 관련 플래그는 모두 false다.
- 시작 시간은 명시적으로 KST로 변환하며 기본은 현재 +5분이다. 기존 방의 시작 5분 전 입장, 25분 대화 +5분 후속 활동을 그대로 사용한다. 가짜 사용자나 관리자 impersonation은 없다.
- 정확한 예약 ID의 일반 room 링크를 제공한다. 각 참여자는 자기 계정으로 로그인해야 한다. 관리자 계정으로 해당 링크를 열면 기존 관리자 preview 동작이며 참여자 대신 저장할 수 없다.

## 서버 안전장치

- TEST 플래그는 변경할 수 없다. TEST 예약의 slot/ticket/reward 필드는 CHECK로 제한한다.
- `ticket_allocations`, `partner_session_rewards`는 TEST 예약 기록을 trigger에서 거절한다.
- 기존 완료 RPC는 TEST에 대해 같은 본인 권한/25분/파트너 참여 증거를 검사하되, 보상 0원으로 완료한다. 정상 세션의 기존 6,000P 처리/중복 방지는 보존한다.
- 기존 `cancel_my_booking`의 테스트 취소는 티켓 환불/발급이나 파트너 보상 없이 처리한다. 운영 환불 helper는 브라우저 호출 권한이 없으며 서버의 TEST 환불 분기는 미환불 결과를 반환한다. 기술 신고의 관리자 금전 결정도 거절한다. 091의 `cancel_my_partner_booking`은 기존 실제 티켓/슬롯/원장 요건을 유지하므로 TEST를 일반 취소로 처리하지 않는다.
- TEST 완료는 파트너 금전 보상을 기다리지 않는다. `completed_at`, `ended_at`, 정상 종료 이유를 기록해 기존 후속 활동 및 리포트 저장 경로를 유지한다.
- 사용자/파트너 transcript, session events, Learner Recap/Quiz, Partner Letter/Treat RPC는 변경하지 않는다. 별도 STT segmentation 변경은 포함하지 않는다.
- 기존 booking 알림 enqueue/claim 및 API에서 TEST를 제외한다. 실수로 큐에 들어간 TEST도 발송하지 않는다.
- 사용자/파트너/Admin concrete availability에서 TEST 예약을 점유 조건에 포함하지 않는다. 실제 slot 행을 생성/수정하지 않는다.

## 통계와 지급 제외

- Admin 전체/완료 세션 KPI, 파트너 정산·노쇼·평가 집계, Partner Lounge 로그 기반 활동비에서 제외한다.
- User My Page 완료 수와 월간 Progress 집계에서 제외한다. 실제 TEST 리포트 자체는 조회 가능해 QA를 유지한다.
- 최근 일반 예약 설정 prefill과 이용권 화면의 기존 예약 여부 판정에서 제외한다.
- 주문/결제/이용권/보상 원장이 생성되지 않아 기존 매출·지급 합계에 영향이 없다.
- 현재 별도 retention/rebooking 분석 조회는 발견되지 않았다. 향후 분석은 반드시 `is_test_session=false` 조건을 사용한다. Admin QA 목록/히스토리는 TEST 배지와 함께 유지한다.
- 기존 과거 QA 기록의 플래그를 추측으로 바꾸지 않는다.

## 수정 파일

- `admin/src/app/admin/dashboard/page.tsx`: 생성 버튼, TEST 표시, KPI 제외
- `admin/src/components/admin/test-session-modal.tsx`: KST 생성/결과 모달
- `admin/src/lib/admin-data.ts`: TEST 계약, 완료 KPI 제외
- `admin/src/components/admin/booking-monitor.tsx`: TEST 표시
- `admin/src/components/admin/partner-detail-modal.tsx`: TEST 표시, 정산/평가 제외
- `admin/src/app/admin/partners/partner-payout-manager.tsx`: 정상 예약만 정산 집계
- `api/booking-notifications.js`: TEST 알림 skip
- 아래 public 파일과 동일한 루트 mirror: `profile-store.js`, `partner-reward.js`, `booking-modal.js`, `tickets-modal.js`, `supabase-client.js`, `mypage-dashboard.js`, `conversation-insights.js` — 필요한 TEST 통계/보상 재시도/일반 예약 설정 제외 조건만 변경
- `supabase/migrations/093_admin_test_sessions.sql`: 새 플래그/RPC/서버 보호
- `tests/admin-test-sessions-db.cjs`, `tests/fixtures/admin-test-session-production-contract.json`: 정의만 담은 운영 schema/function 기반 로컬 PostgreSQL 검증, 고객 행/비밀값 없음
- `tests/admin-dashboard-upcoming-bookings.cjs`, `tests/booking-notifications-fixtures.test.js`: 새 KPI 조건/알림 API 계약에 맞춘 회귀 fixture
- 이 문서

## 검증

- PGlite에서 운영 함수 정의 + 기존 084/091 의존성 + 093 실행. 관리자 생성, anon/user/partner 거절, 동일 요청/중복 ID, 참여자 조회, 플래그 불변, 원장/금전 상태 차단 검증.
- 2026-10-06 운영 함수 fingerprint를 기준으로 알림 claim/enqueue와 보상 함수 3개를 재베이스했다. TEST 분기를 제외한 운영 body는 정확히 동일하다. 예상치 못한 함수 변경 시 migration은 schema 변경 전에 중단한다.
- 일반 091 취소의 1회 환불/슬롯 재개방/양쪽 수신자 알림, 현재 잔액 보존, 이후 보상 6,000P 상계 및 재시도 중복 방지 검증.
- 실제 기존 SQL의 양쪽 역할 transcript 저장, Learner summary/feedback/Quiz 및 Partner Letter/Treat 저장·재시도, TEST 보상 0, 일반 예약 6,000P 1회 지급 검증.
- TEST 이메일 claim 차단 및 일반 알림 회귀(78개 check), 사용자/파트너/Admin 예약 가능 시간 점유 제외, 정상 4시간 cutoff 검증.
- Admin exact-booking QA, upcoming/past 정렬, 사용자 신원, report/transcript/reward, Smart Booking, Recap 회귀 및 TypeScript/JS 검사.
- 실제 React 모달을 합성 RPC 응답으로 390px/1280px 렌더링했다. 양쪽에서 가로 overflow 없고 생성/결과/본인 로그인 안내/동일 room ID 링크 확인. 임시 preview route는 commit에서 제외한다.
- 실제 Supabase staging/운영 room의 mic/camera/STT 및 30분 실시간 E2E는 아직 수행하지 않았다. 로컬 SQL 검증을 네트워크/마이크 검증으로 간주하지 않는다.

## 적용 전 확인

1. 최종 번호: 090 매칭(적용됨), 091 파트너 취소(적용됨), 092 Partner Report ownership, 093 Admin 테스트 세션, 094 Conversation Posts CMS, 095 Alpha 언어 eligibility. 이미 적용된 090/091은 재실행하지 않는다. 092/094/095는 파일명과 테스트 경로만 바뀌었고 SQL 본문은 유지한다.
2. 093은 운영 091 취소 helper/table에 의존한다. 수정하는 운영 함수가 변경되면 hash preflight가 전체 transaction을 중단한다. 먼저 최신 함수/의존성을 다시 감사해야 하며 guard를 임의 제거하지 않는다. 092의 report merge와 095의 언어 판정 함수를 덮어쓰지 않는다. CMS는 독립적이다.
3. 별도 승인 후 staging에서 092 → 093 순서로 적용하고 실제 두 계정의 일반 room 전체 흐름(카메라/마이크/STT/Talk Cards/채팅/후속 활동/리포트/Admin QA)을 검증한다. TEST가 일반 availability를 점유하지 않으므로 실제 고객 일정과 겹치지 않게 테스트 시간을 선택한다. 091 파트너 전용 취소 UI의 TEST 예약 동작도 확인해야 한다.
4. migration 적용 승인과 staging 검증 후 관련 user/API/admin 배포를 함께 진행한다. 새 column이 없는 운영 DB에 UI만 먼저 배포하면 일부 조회가 실패하므로 먼저 배포하지 않는다.
5. 테스트 booking/log/report/event는 명시적으로 생성한 QA ID만 확인해 정리한다. 실제 고객 데이터는 보존한다.
