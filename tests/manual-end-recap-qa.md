# Manual end / Recap preservation — local review

Baseline: `origin/main` cedb9bb9a4497c449498f54e2879e43c354658f9.
Worktree: `manual-end-recap/dayo`. Implementation baseline; no DB migration or production DB changes. Release is separately authorized after the final audit below.

## Audit

| Path | Current main | Local change / retained contract |
|---|---|---|
| Timer | Hangup → session-ended event → room routing + learner report/normal completion | One shared finalize promise; existing normal completion policy retained |
| User manual | Fire-and-forget transcript save → personal completion → hangup → direct quiz opening; no automatic report event | Final STT flush → stop media → canonical save/read → report save → existing personal completion → recap |
| Partner manual | Same learner-oriented path attempted; User quiz opening blocked for Partner | Own transcript saved; Partner Letter opened; no learner completion call |
| Peer disconnect | Media reconnect/recovery; not authoritative booking completion | Unchanged. Peer disconnect is not reclassified as manual end. User can end locally or reach the existing timer; no invented peer settlement |
| Refresh | Local per-booking transcript recovery; completed room access blocked; review progress relied on sessionStorage | Own ended room redirects to a no-media recap reader; reads exact booking/log/report. No transcript/settlement writes from recovery |
| Tab/browser close | Local final chunks already backed up; last final speech and DB request not guaranteed | Unchanged capture/pagehide. No promise of saving a killed process or missing audio |
| Network loss/reconnect | Existing media/STT retry; failed persistence retained locally | DB read failure blocks transcript replacement; canonical DB-backed recap/report retries remain available |

Manual main currently **does** attempt to open a recap; it is not an unconditional transcript deletion. The defect is the separate, unordered lifecycle, absent automatic manual report save, role-incompatible Partner routing, and missing durable review recovery. The particular tester's click cannot be replayed from public code alone.

## Persistence and settlement

- `upsert_session_transcript` is unchanged. Before writing the own participant row, merge its already-stored exact-booking transcript with final local chunks by stable ID + timestamp. Never touch the other participant row. A read error must not become an empty write.
- Existing `stopSpeech()` waits for the Web Speech final callback/onend, bounded at 2.5 seconds. Expose it as `flushTranscript`; do not add segmentation, silence guessing, or interim-text promotion.
- `session_reports.feedback` carries the existing `conversation_recap` v1 marker. Save through `merge_learner_session_report`; Partner fields stay under the separate existing Partner merge RPC.
- No 25-minute gate exists in recap generation. Keep existing expression quality, curated dictionary, supported-language checks. Short/empty canonical records remain honest; no guessed expressions/questions/metrics.
- Existing RPC `complete_learner_session(personal)` remains unchanged, including its existing completed/end_reason policy. A normal completion still has its existing server-side 25-minute/reward checks. Recovery never calls it.
- No direct reward/ticket/refund/notification mutation is added. 6,000P evidence gates, TEST exclusions, cancellation/late cancellation/no-show policies remain unchanged.
- Main recap and word recap use the same learner source version. DB progress is a floor; each answer is saved, completion counts are displayed, not a proficiency score. Existing legacy quiz_score compatibility remains internal.
- Partner aggregate data already saved for the same canonical learner version survives temporary API enrichment failure.
- Per-page finalize promise and existing transcript/report in-flight guards cover timer/click, double click and reconnect calls in that page. Existing booking-key upsert avoids duplicate report rows. Two independent tabs simultaneously replacing the same log remain constrained by the existing whole-snapshot SQL RPC; atomic cross-tab append would require a separate DB change and is not claimed here.

## Local verification

Run with Node and existing jsdom/PGlite/TypeScript dependencies. On Windows, historical SQL fixtures need CRLF normalization at test input; no SQL file was changed.

- `manual-end-recap-fixtures.cjs`: A–N behavioral paths, DB mock recovery/fresh context, late final, short/empty, server+local union, race guards, failed report save, progress answer persistence, Letter/Treat/rating/word-help preservation, dismiss, unchanged STT functions.
- `conversation-recap-fixtures.test.js`: canonical source/version, final flush, save revisions, failure, same-session progress, real PostgreSQL Partner merge/security.
- `session-transcript-reliability-fixtures.test.js`, `session-report-persistence-fixtures.test.js`, `session-review-fixtures.test.js`, `recap-report-integration-fixtures.test.js`, `room-wrap-up-fixtures.test.js`.
- `partner-reward-reliability-fixtures.test.js`: fixed reward, evidence, retries/concurrency.
- `partner-booking-cancellation-fixtures.cjs`: 167 real SQL/RLS/notification/DOM assertions.
- `room-recap-qa-fixtures.cjs`: current-main role/media/Talk Cards invariants, quiz 2/4/6 and 30/60/90 seconds, trend, exact source.
- Browser UI O: synthetic preview only, 360/390/1280, KO User / EN Partner confirmation; button width, horizontal scroll, minimum tap size; recap recovery and answer count after reload. No production account/data involved.

## Production QA plan — after separate release approval

1. Use the owner's explicit User and Partner accounts and one normal paid/ticket booking. Record exact booking UUID, slot, ticket allocation, reward ledger baseline. Do not use an unrelated customer or an Admin TEST booking to infer settlement.
2. Both participants enter the exact room; allow mic/camera and speak for a few minutes. Include a clear final sentence before ending.
3. User clicks End → Keep talking once: conversation and timer continue, no completion/report mutation.
4. User clicks End → confirm. Check User recap, canonical source log ID/version, included final chunks and the existing personal end_reason; never substitute another booking's records.
5. Refresh and revisit My Page after fresh login: same recap metrics and source; start word recap, answer, refresh/reenter, verify completion count persisted and no visible score.
6. Partner reaches the existing end/Letter flow; submit Letter/Treat and reload User report. Recap, feedback and progress remain unchanged.
7. Repeat on separate authorized bookings: -30 seconds, middle of conversation, Partner manual, normal timer, near-simultaneous timer/click, double click and temporary network loss. Verify exact rows, no duplicate reward or ticket/refund events.
8. Compare financial state with existing server policy, including manual completion vs normal evidence and no automatic manual reward. Never change end_reason/status to force a payout.
9. Check 360/390/1280 screens and KO/EN, generic error/retry, no raw errors. A hard browser kill may lose pending final speech; verify already-saved rows stay intact.

Before production: review these local diffs, verify live RPC/permission baseline and the storage/report preservation contract, authorize scoped commit/push/deploy separately, then run the real microphone/two-account E2E. No new migration is proposed for this single-room lifecycle fix; cross-tab atomic append is a separately reported limitation.
Browser QA: the browser viewport override did not alter the existing IAB window (it remained 1280px). Mobile checks therefore used a real 360px/390px iframe viewport with the actual unchanged modal/reader CSS, verified innerWidth and scrollWidth, rather than assuming the override succeeded. KO User and EN Partner confirmation passed; buttons were 44px minimum. The 390px word recap panel measured 358px wide with 16px margins; reload restored 1/6 completed from the synthetic DB mock. Actual mobile device/microphone E2E remains in the production QA plan. The recovery page loads the existing Supabase SDK/environment/client in the same order as room; no auth contract change. Its return path unhides the base recap after word recap skip/timeout.

## Final release audit (2026-10-07)

- Normal timer and manual User end both invoke the existing room `handleSessionEndRouting` → `openQuizModalImmediately` path. Room and My Page use `DayOConversationRecap.saved/build/render`. `session-recap.html` is an authenticated exact-ended-booking thin shell for fresh-session word recap reentry; no second metric/topic/expression/question model. It reuses lifecycle and memory-game helpers, contains only access/load/retry and modal mount markup, and never opens media or calls completion/reward.
- Local real PostgreSQL fixture `manual-end-settlement-fixtures.cjs` executes the unchanged current 093 completion/reward function definitions. User -30 seconds and middle: completed/personal, first completion and end timestamps, no automatic Partner reward, deducted ticket unchanged, no refund, slot booked. Personal retry preserves the first timestamp and cannot promote to normal. Partner manual: confirmed, null reason/timestamps and unchanged financial state until the User's existing completion path; the learner-only RPC rejects Partner. Normal User timer: confirmed/normal, ended_at set, completed_at still null while waiting for the existing Partner reward contract.
- Deferred promises prove final STT completion → media stop → transcript → recap save attempt → existing completion attempt → routing. Delayed STT final remains included. Report save failure preserves transcript; completion failure preserves stored recap. Same-page double clicks, timer/click and disconnect/click keep one finalize promise. Timeout/failure is a reported retry state, not a claim that an offline DB save succeeded.
- `memory-game.js` changes are limited to DB progress recovery, learner-version identity, per-answer progress persistence and preservation of the existing report payload. Questions remain 2/4/6, durations 30/60/90 seconds, completion counts, no visible score. Existing canonical model/render/API is unchanged: max 3 topics/actual expressions; hidden word expansion has up to 3 source words and max 2 synonyms/antonyms each, exactly as main. This release does not introduce a new word-expansion UI or change that contract.
- All 11 related fixture suites pass. Real two-account/microphone E2E remains to be distinguished from local mocks and the local SQL fixture. Independent multi-tab whole-snapshot write limitation remains documented; no new locking/migration.
