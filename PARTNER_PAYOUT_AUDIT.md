# Partner payout settlement audit — 2026-10-07

Baseline: latest fetched origin/main c0f34f8b15598951b25defa1dc989668d87ec360.
Branch: codex/partner-payout-audit. Local implementation only; no production migration, push or deployment.

## Read-only production audit / exact root cause

Production project mmhapsimcngmtefqfrcg was inspected with SELECT-only SQL in Supabase.

- Neither public.settlement_logs nor public.settle_partner_payout(uuid) exists. Admin calls that missing RPC in both the settlement table and Partner detail modal. Replaying 018 is unsuitable: it grants broad access and zeroes a scalar balance without source links.
- partner_session_rewards has booking_id (PK/FK), partner_id (FK to profiles.id), reward_amount (6000), created_at. Normal reward writes also record the booking flag and add the amount minus actual cancellation offsets to profiles.point_balance.
- User late cancellation adds 6000 to the balance and stores status=cancelled, end_reason=user_cancelled_late, partner_rewarded=true in the exact booking; it does not create a session reward row.
- Admin-approved compensation uses session_tech_issue_reports (approved partner reward decision, resolved_by, resolved_at) and the rewarded booking flag. It likewise does not create a session reward row.
- Partner cancellation debt and its future normal reward offsets are stored in partner_cancellation_penalties / partner_cancellation_penalty_offsets. Existing balances are not directly debited by cancellation.
- credit_ledgers is a ticket ledger, not an additional canonical Partner earnings source. Unexplained point balances cannot be silently treated as approved earnings.
- The previous list calculates (monthly completed + learner_noshow) × 6000 − partner_noshow × 10000, falling back to point_balance when that expression is zero. It neither subtracts actual recorded payouts nor includes every canonical compensation source. The action confirms point_balance instead of the displayed final payout. 지급완료 is inferred from a zero computed amount; it is not persisted.
- Clara's existing 6000 balance is backed by a completed normal booking with partner_rewarded=true and no session reward row (legacy completion). No payout was created, and no bank destination, transfer date or reference was guessed.

Audited existing function definition MD5s (not credentials):
- complete_session_and_reward_partner: 2ea12b70aff627407e70ebfdc2b66dc9
- cancel_my_booking: 313fb0b75668898821bd694331be49cb
- cancel_my_partner_booking: 55a91c222e96912e384c3f9a58f8ad33
- apply_partner_cancellation_reward_offsets: debe05b1e8a0031ab902daa3f379421e
- resolve_tech_issue_report: eb60a739449c789a93721830b17fb401
- dayo_is_admin: b932d95fb53315d3521fc15648ea116b

## Canonical records and source grouping

099 adds partner_payouts and partner_payout_items; it does not rewrite reward writers or historical rows.

partner_payouts stores: UUID id (also the request idempotency key), canonical partner_user_id referencing profiles.id, amount, currency=KRW, payout_method, payout_destination_label, optional payout_reference / note, actual paid_at, processed_by=auth.uid(), created_at, status=paid.

partner_payout_items stores one unique booking_id, payout_id, source_type, optional FK to the existing session reward / approved tech report, gross_amount, already-applied offset_amount, net_amount and earned_at. Sources:
1. session_reward: existing reward row + completed/rewarded normal booking; net = recorded 6000 minus actual existing offsets.
2. legacy_session_reward: completed/rewarded normal booking without a reward row; references that existing booking without manufacturing a ledger row.
3. late_cancellation: exact rewarded user-late-cancel booking, 6000.
4. admin_compensation: exact rewarded resolved booking + approved report evidence, 6000. Multiple participant reports for one booking do not duplicate earnings.

TEST, unapproved cases and sources already included in a payout are excluded. An unexplained balance/source mismatch is 확인 필요 and blocks recording. No automatic historical reconciliation, arbitrary credits, new reward policy, tax calculation or partial allocation of an individual reward is added.

The modal previews the unpaid sources as a frozen batch. Server validation checks every requested item is still unpaid and verifies its total against the submitted actual amount. Later earnings are not automatically added to that batch and remain unpaid. The complete remaining source total must also reconcile with the locked profile balance. Only the recorded amount is subtracted; the profile is never blindly zeroed.

## Authorization, immutability and duplicate protection

- Only authenticated administrators passing the existing dayo_is_admin check can call admin_get_partner_payout_summary, admin_get_partner_payout_audit or admin_record_partner_payout.
- New tables have RLS enabled with no broad policies; public/anon/authenticated/service_role direct privileges are revoked. Internal helpers are not externally executable.
- The profile row lock shares the reward/compensation writers' mutex. Settlement does not lock bookings, preserving their existing booking-before-profile writer lock order.
- Unique request id + exact retry payload gives idempotent recovery. A reused id with changed details is rejected.
- Unique source booking_id prevents a second payout for any included reward, regardless of browser state, operator or request id. If a selected source was already paid, the whole record is rejected.
- Payout receipt, source links and balance subtraction are one transaction. Saved receipts/items are immutable; there is no silent edit/delete API.
- Status comes from actual payout records and remaining source amounts: 대기 / 지급완료 / 적립 없음 / 확인 필요. A payout is paid while genuinely new remaining earnings can still leave the Partner awaiting another payment.

## Admin modal and privacy

Both existing actions open the shared payout/audit modal using the exact canonical profiles.id.

Fields: Partner name; final batch amount in KRW; completed sessions / legacy / cancellation / approved compensation counts; applied offset summary and expandable source IDs; actual amount; method; display-safe destination; actual paid date/time (explicit KST); optional reference and memo. Primary CTA: 지급 완료 기록.

Methods: bank_transfer=계좌이체, cash=현금, paypal=PayPal, wise=Wise, other=기타.

Destination examples: 국민은행 ****1234; PayPal c***@gmail.com; 현금 지급. Full existing account details are not fetched into the payout list or duplicated in a new record. The server rejects unmasked destination emails / long numeric identifiers and requires bank account masking. Payout summary list/CSV has no raw bank or private contact fields.

Save errors leave the payment unrecorded in UI. Retries retain the same frozen request. Success shows the saved receipt/source links; reload reads the actual audit RPC. Zero/unreconciled amounts disable recording. Clara's operator must enter the actual transfer details manually after release; the implementation creates no real Clara payout.

## Migration numbering and release boundary

- New migration: 099_partner_payout_audit.sql.
- Latest fetched main and the inspected existing worktrees top out at 098; no competing 099 was found before implementation.
- Production has no supabase_migrations.schema_migrations registry. An authoritative highest applied version number cannot be claimed from a nonexistent registry; live objects and function definitions above were audited instead. Recheck numbering and source contract drift immediately before a separately authorized production release.
- Migration preflight refuses missing required contracts or an unexpected legacy settlement_logs / settle_partner_payout contract. Review historical settlement linkage if either appears later.
- Do not modify/re-run 018 or any other old migration. Apply 099 only once in a separately authorized release, then release Admin and verify actual RPC/audit results.
- Remaining release QA: production admin/non-admin permissions; payout persistence after reload; real operator recording of Clara's already-completed transfer using verified details. Do not create a second transfer.

## Local validation

- tests/partner-payout-db.cjs: isolated PostgreSQL layered on the existing audited production-shaped catalog and real 091/093 regression. Verifies all five methods, actual amount/destination/date/processor/reference/memo persistence, reload, exact reward/booking/report links, request conflict/retry/duplicate protection, later earnings left unpaid, anon/user/partner/service-role denial and direct write denial, zero/mismatch blocking, other unpaid Partner unchanged, manual legacy Clara fixture, immutable receipts, existing source rows/offsets unchanged.
- Existing reward/cancellation/TEST financial regression runs with 099 already present. Every preexisting public function definition is compared before/after 099; none changes.
- tests/partner-payout-ui.cjs: actual React/Radix modal and RPC adapter, local synthetic responses only. 390px/1440px, no horizontal overflow, all method labels, masked destination, explicit KST conversion, amount validation, rejected save remains unpaid, identical retry request, persisted audit reload, zero disabled, late wrong-Partner responses ignored. Both legacy settlement call sites are absent.
- Admin strict TypeScript noEmit and git diff --check pass. No full production deployment/build or real transfer is implied by these local tests.

Protected areas remain untouched: booking writers, ticket/checkout, room/WebRTC, availability, STT, Recap, Auth/profile identity, existing reward and compensation calculations. Existing primary checkout dirty work and local Prepare branch remain intact.
