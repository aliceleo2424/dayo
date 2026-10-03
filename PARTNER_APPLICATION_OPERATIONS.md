# Partner application 운영 기능 배포

이번 작업은 로컬 구현입니다. 기존 077·078, 지원폼·영상 업로드, Partner Lounge 진입, 결제·예약·로그인 설정은 변경하지 않습니다.

## 적용 순서

1. 대상이 DayO production (`mmhapsimcngmtefqfrcg`)인지 확인한 뒤 `supabase/migrations/080_partner_application_operations.sql` **하나만** 실행합니다. 079는 다른 작업의 migration이며 함께 적용하지 않습니다. 기존 077·078을 재실행하거나 다른 pending migration을 일괄 push하지 않습니다.
2. 사용자 사이트/API 프로젝트 `dayo`의 **서버 전용** 환경변수를 설정합니다. 기존 `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` 또는 `NEXT_PUBLIC_SUPABASE_URL`을 재사용합니다. 발신자는 기존 send-welcome API와 같은 `DayO <hello@dayotalk.com>`입니다. `RESEND_FROM`이 설정되어 있으면 그 값을 사용하며, Resend에서 해당 발신 도메인이 검증되어 있는지 확인합니다. 새 변수:
   - `PARTNER_APPLICATION_NOTIFICATION_TO=dayo.speak@gmail.com`
   - `PARTNER_APPLICATION_NOTIFICATION_SECRET`: 암호학적으로 생성한 최소 32자 비밀값. `NEXT_PUBLIC_` 접두사를 붙이지 않으며 저장소/브라우저에 넣지 않습니다.
3. 관련 변경만 커밋하여 사용자 사이트/API `dayo`, 관리자 사이트 `dayo-sufk`를 배포합니다. 관리자 이메일 링크는 `https://dayo-sufk.vercel.app/admin/partner-applications?application=<지원서 UUID>`입니다.
4. Supabase Dashboard → Database → Webhooks에서 **outbox 테이블** `public.partner_application_notifications`의 **INSERT** 이벤트를 등록합니다. 지원서 테이블의 UPDATE나 기존 webhook은 변경하지 않습니다.
   - POST `https://www.dayotalk.com/api/partner-application-notification`
   - `Content-Type: application/json`
   - `Authorization: Bearer <위 서버 전용 비밀값>`
   - HTTP timeout 15초. pg_net Database Webhook은 비동기로 실행되므로 메일 실패가 지원 저장을 실패시키지 않습니다.
5. 테스트 지원 1건을 제출해 실제 수신 메일, 상세 바로가기, New → Viewed, shortlist, note, 영상과 기존 심사 버튼을 확인합니다. 테스트 지원·영상·upload metadata를 삭제하면 관련 알림 행은 FK cascade로 삭제됩니다.

상세 링크는 관리자 로그인 상태에서 해당 지원서를 바로 엽니다. 기존 로그인 화면은 로그인 후 대시보드로 이동하므로, 로그아웃 상태에서 링크를 눌렀다면 로그인 후 메일 링크를 다시 열어 주세요. 로그인/권한 코드는 이번 작업에서 변경하지 않았습니다.

## 알림 전달 및 실패 확인

- AFTER INSERT trigger가 심사 점수 계산 이후 최소 요약만 저장합니다. 이메일·연락처·대학·긴 답변·영상 경로/URL은 알림 payload에 없습니다. 기존 지원서는 소급 알림을 보내지 않고 최초 열람 전까지 New로 표시합니다.
- API는 shared secret으로 인증하고 DB에서 payload를 다시 읽습니다. 요청 body에 임의로 넣은 정보/수신자는 사용하지 않습니다. Resend 기존 인프라로 plain-text 메일을 보냅니다.
- 서비스 전용 outbox는 admin을 포함한 anon/authenticated 계정에 공개되지 않습니다. 첫 Viewed 기록은 기존 `dayo_is_admin()`을 확인하는 RPC로만 저장합니다. shortlist는 기존 admin UPDATE RLS를 그대로 사용합니다.
- 동시 webhook은 1분 lease로 막고, Resend idempotency key와 `sent_at`으로 중복 발송을 방지합니다. API 실패는 전송 대기 상태로 남습니다. **webhook 자체의 자동 재시도/스케줄러는 추가하지 않았습니다.** 운영자는 Supabase SQL Editor에서 아래 조회로 실패·대기 상태를 확인할 수 있습니다(개인정보 없이 운영 상태만).

```sql
select application_id, queued_at, attempts, sent_at, last_error, locked_until
from public.partner_application_notifications
where sent_at is null
order by queued_at;
```

- 실패한 작업은 동일 비밀값으로 위 API에 `{"application_id":"<UUID>"}`를 POST하여 개별 재시도합니다. 잠긴 작업은 lease 만료 후 재시도합니다. `sent_at`이 있는 작업은 보내지 않습니다.
- Resend idempotency key 보존 기간(24시간)보다 짧은 **최초 시도 후 23시간까지만** 자동 API claim을 허용합니다. 이후에는 전송 여부를 Resend 로그에서 확인해야 합니다. 불확실한 작업을 강제로 재발송하거나 대량 발송하지 않습니다. 처리 중 요청은 `skipped: true`로 응답하므로 `sent_at`으로 완료 여부를 판단합니다.
- 배포/설정 중에도 지원서 저장은 유지됩니다. webhook 등록 이전에 생긴 대기 행은 위 개별 재시도로 처리합니다. outbox 저장 자체가 실패하는 예외도 지원 저장을 우선하며 DB warning으로 남습니다.

참고: [Supabase Database Webhooks](https://supabase.com/docs/guides/database/webhooks), [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
