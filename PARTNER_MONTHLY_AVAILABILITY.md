# Partner availability integration — production apply prohibited

## Source of truth and draft sequence (2026-10-05)

DayO production project mmhapsimcngmtefqfrcg was inspected with explicit READ ONLY transactions. Only catalog metadata was captured: no user rows, credentials, network-trigger arguments or email deliveries. Production is PostgreSQL 17.6. No DayO staging project is available.

- profiles has 33 columns, including role, but no partner_status. Approval is role = 'partner'; there is no second activity-status gate.
- Applied 077/078/080 application/video/operations structures and 081 completion were verified. Country/city extension and new Security admin RPCs are absent; legacy profiles policies/grants remain live.
- availability_slots_status_check originally permits only available/booked. 084 verifies that baseline and adds hidden without rewriting old rows.
- Checkout 085 is already represented in production and origin/main. It is neither renumbered nor reapplied.

Dependency order, renumbering only unapplied drafts:

1. Verify already-applied 081_partner_profile_completion.sql. Its unchanged copy is archival; never rerun in production.
2. 082_profiles_minimum_privileges.sql (formerly Security draft 083).
3. 083_partner_language_location_profile.sql (formerly Partner draft 082; SQL body unchanged by renumbering).
4. 084_partner_monthly_availability.sql.

Security checks the exact 081 lifecycle before the extension changes it. Filename order now matches dependency order. Never use db push to apply the entire pending set. Fresh production metadata must be checked before a later approved rollout; drift must abort.

## Storage and authority

Weekly templates remain availability_slots.slot_time = weekly:day|HH:mm. Date overrides hold default/closed/custom decisions, not a new booking identity. Concrete slot IDs stay authoritative. KST window is exactly today through +29 inclusive (October 5 → November 3); +30 is refused. Existing confirmed reservations outside the window remain valid.

Only authenticated role=partner invokes own schedule/save RPCs, with no caller-supplied owner ID. Direct override writes are revoked. Own partner/admin reads are allowed; other partner/general user reads denied. Private helpers are not exposed. Calendar RPC can materialize rows, so it is NOT a read-only production QA call.

Template application preserves explicit date overrides. Closure hides unbooked times and keeps confirmed rows/slot IDs. Booked controls are disabled with protection text. Pending rows are unconfirmed drafts, not reservations; confirmation rechecks availability. Cancellation cannot reopen a closed override. Existing confirmation/ticket/refund/notification/core locks and room timing are unchanged.

Existing broad availability_slots table policies are inherited unchanged. This task hardens profiles and the new override table, not all historical RLS. New RPC isolation tests are not a complete audit of old tables.

## UI

Partner Sessions defaults to Monthly Calendar, then Weekly Template and past session updates. Monthly means actual next-30-day schedule; Weekly means usual recurring schedule. Date editor offers template, whole day, closed and custom half-hour slots. Missing-RPC fallback retains the original weekly query chain; other errors fail closed.

User dates reflect concrete slots plus existing language/help/cutoff conditions. Date selection refreshes concrete availability; Next requires a selected slot. Final confirmation retains server validation. Holidays show small indicators, full names only in selected-date detail. They never block bookings. Shared availability-calendar module supports 2026/2027 explicitly; unsupported years omit annotations only. Renew official static source before December 2027.

Upcoming Schedule remains above tabs. Name click opens the existing private Brief: compact dynamic title/subtitle, stacked labels/values, neutral early-entry box. Prepare/Enter timing is unchanged. Public/root copies are synchronized.

## Reproduce actual local PostgreSQL tests

Docker/Supabase local stack is unavailable. Fallback: official PostgreSQL17.11 bound to 127.0.0.1, independent connections and RLS roles. tests/fixtures/partner-availability-live-schema.json contains catalog metadata and verbatim RPC definitions, no production rows/secrets.

Use a disposable local cluster and these environment variables:

- DAYO_LOCAL_PG_PORT: loopback port, default 55483.
- DAYO_LOCAL_PG_PASSWORD_FILE: local-only password file, never committed.
- DAYO_QA_DATABASE: fresh name matching dayo_contract_qa followed by digits.
- DAYO_LOCAL_BASELINE_SQL: generated SQL path outside repository.
- DAYO_LOCAL_QA_REPORT: optional report path outside repository.
- NODE_PATH: pg/PGlite installation if needed.

Run in order:

```text
python tests/build-partner-availability-baseline.py
node tests/setup-partner-availability-local.cjs
node tests/partner-availability-integration.cjs
node tests/profiles-security-fixtures.test.js
node tests/monthly-availability-db.cjs
node tests/monthly-availability.cjs
```

Setup refuses non-QA or existing databases. Only the known PG17 minor-version rendering of the legacy admin varchar-array policy is normalized in LOCAL expected metadata. All other policy fields and preserved RPC hashes remain exact. Production fail-closed SQL is not weakened.

Actual PostgreSQL integration: 56 checks passed, including combined migrations, unchanged Auth bootstrap, own-only profiles/details/overrides, admin RPC/memo, general/anon restrictions, profile/capability/template preservation, guide acknowledgement, weekly/custom/default/closed, propagation, booking protection/cancellation, +29 paid confirmation/+30 rejection, holiday ticket-backed booking, and original notification enqueue without email/network triggers.

Concurrency uses two independent backends calling the existing ticket-backed confirmation RPC on one concrete slot. Winner transaction holds the lock; pg_blocking_pids proves the loser actually waits. After commit: one success, one clean conflict, one allocation, no loser ticket debit, consistent booked slot.

Security fixture: 157 checks including owner/ACL drift rejection and rollback. Monthly PGlite/JS fixtures, Smart Booking/recent/public opening, notification (76 checks, no email), checkout (21 groups) and admin TypeScript pass. Checkout's protected payment/room checks remain unchanged; four authorized Security/Calendar UI helpers are checked by reviewed whole-file hashes rather than obsolete HEAD equality.

Loopback UI runs 084 SQL in PGlite with fictional Auth/booking fixtures. User390px, Partner390/760/1280px and Brief QA are separate from actual PostgreSQL multi-session tests. Full Supabase Auth/PostgREST HTTP E2E was NOT performed; do not call this a staging Supabase pass.

## Remaining rollout checks

Fresh drift preflight, compatibility release ordering (server welcome/admin RPCs and narrowed profile grants), real Supabase HTTP/session E2E and rollback plan require a separately authorized rollout. Existing reward static fixture has an obsolete assertion against unchanged room sources; it is not weakened. Full reward E2E is not claimed.

Feature-branch commit/push is authorized after local DB/concurrency passes. Production SQL/data writes, main merge and production deploy remain prohibited.
