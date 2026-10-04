# Profiles security integration — production 적용 보류

2026-10-05 production mmhapsimcngmtefqfrcg metadata를 READ ONLY로 확인했다.
profiles 33개 column, 기존 11개 broad policy/ACL 및 081 lifecycle이 baseline이다.
새 admin RPC는 운영에 없으며 이번 Security 변경은 아직 미적용이다.

## Draft 순서

적용된 081 확인 → 082_profiles_minimum_privileges.sql →
083_partner_language_location_profile.sql → 084_partner_monthly_availability.sql.
이전 Security 083 / Partner 082는 미적용 draft만 재번호했다.
077/078/080/081 및 운영 checkout 085는 재실행하지 않는다.
Security가 081 exact lifecycle을 확인하므로 profile extension보다 먼저 적용한다.

## 최소 권한과 호환 코드

- anon/PUBLIC/authenticated broad table/column grant를 회수한다.
  authenticated 본인 row SELECT22개 / UPDATE10개만 허용한다.
- role/identity/email/balance/entitlement/admin field write 및 INSERT/DELETE는 금지.
- admin_list_profiles / admin_update_profile_memo는 dayo_is_admin guard,
  search_path='', 제한된 EXECUTE를 사용한다.
- profile-store는 실제 Auth UID와 명시적 column만 사용한다.
  broad upsert, 익명 remote 생성, 운영 balance cache 쓰기를 제거한다.
- welcome은 검증된 JWT/email·최근 가입·idempotency를 확인한 서버 API에서만
  welcome_email_sent를 저장한다. client secret은 추가하지 않는다.
- admin 조회/카운트는 adminProfiles helper, 메모는 새 실제 RPC로 연결했다.
  실제 티켓 UI는 기존 admin_grant_tickets/ledger 계약을 유지한다.
- 없는 partner_status를 만들지 않는다. 별도 상태 select는 비활성 표시,
  승인 기준은 role='partner'다.
- 기존 unused 절대 티켓 overwrite helper는 새 RPC 없이 보존한다.
  실제 UI는 ledger grant 경로이며 이 legacy helper를 활성화하지 않는다.

## Fail-closed 검사

policy/ACL/column type, 기존 RPC signature/hash/owner/config/ACL,
081 constraints/RLS/lifecycle, Auth bootstrap trigger와 helper의
owner/ACL/config/security-definer, postgres/service_role BYPASSRLS까지 검사한다.
Drift는 transaction 중단/rollback 대상이다. 기존 Auth trigger, role setter,
discovery, brief, ticket RPC, room/payment core 정의와 기존 사용자 행은 보존한다.

## 검증

- Security fixture157 checks PASS: own-only 권한, admin guard, 금지 field write,
  lifecycle 보존, helper owner/ACL drift 거부, welcome 실패/idempotency, SDK 호환.
- 실제 PostgreSQL17.11 metadata-only baseline → 082 → 083 → 084 적용 PASS.
  production17.6 legacy varchar-array deparser 차이 한 곳만 LOCAL expected
  metadata에서 정규화한다. Production SQL guard는 완화하지 않는다.
- 독립 backend 통합56 checks PASS. Ticket-backed 동시예약:
  한 성공/한 conflict/한 allocation/패자 ticket 보존.
- Admin TypeScript PASS. Public/root 일치. 원래 main과 별도 worktree dirty 보존.

Docker/Supabase local stack이 없어 PostgreSQL 대안을 사용했다.
실제 Supabase Auth/PostgREST HTTP E2E나 production 배포 성공으로 표현하지 않는다.
기존 availability_slots broad RLS는 이번 profiles/override 범위 밖이며 보존했다.
기존 reward static fixture의 stale assertion도 완화하지 않았다.

## Production 금지

운영 catalog SELECT만 수행했다. SQL apply/data write/main merge/deploy는 금지.
별도 rollout에서 fresh preflight, welcome/admin RPC/frontend 호환 배포 순서,
실제 Supabase session/HTTP 검증, 복구 계획이 필요하다.
RLS만 먼저 닫아서 기존 클라이언트 경로를 실패시키지 않는다.
