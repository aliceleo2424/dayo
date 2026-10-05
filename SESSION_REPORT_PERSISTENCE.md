# Session / report persistence contract

This contract stabilizes the existing submission path. It does not redesign
Partner Report, change Quiz, or alter production schema/security.

## Responsibilities and ordering

- Session end/timing/evidence remain owned by existing room-live and
  session-lifecycle code. Report submission does not invent completion evidence.
- Partner submission starts reward, transcript and partner report independently.
  Each rejection becomes its own failure result. One failure cannot prevent the
  other RPCs from being attempted or undo another committed result.
- Reward calls the existing `DayOPartnerReward.complete` helper /
  `complete_session_and_reward_partner` RPC. Existing booking locks, reward ledger,
  evidence checks and `already_rewarded` behavior are unchanged (migration 071).
- Transcript uses the existing `persistTranscript` path / participant transcript
  upsert. Identity is `(booking_id, participant_role)` (migration 070).
- Partner report calls `persistSessionReport` / `merge_partner_session_report`.
  Learner/AI report continues to use `merge_learner_session_report` independently.
- Navigation waits for all three successes. Failure leaves the submit action
  available and describes what has already saved. Concurrent clicks are ignored;
  successful submission remains disabled during the redirect delay.
- Manual retry uses the same booking ID. Database upserts and reward ledger ensure
  no duplicate report/reward. There is no new scheduler or durable report queue;
  failed unsaved fields still require retry before leaving the page.

## Canonical fields

| Owner | Fields |
| --- | --- |
| Partner payload | `partner_comment`, `stamp`, `keyword`, `illust_url` |
| Learner/AI | `summary`, `key_expressions`, `quiz_score`, `word_help`, `feedback`, `rating`, canonical `spoken_sentence` |
| Server | `booking_id`, learner/partner identity and canonical partner name |

`spoken_sentence` is a legacy shared column: existing partner and learner RPCs
both accept it (046/047). The current partner browser payload **omits** it so
partner submission cannot replace the learner-owned representative sentence.
Old rows and the legacy RPC signature remain intact. This is a client contract,
not a new server field-ownership/RLS restriction: legacy/custom RPC callers can
still send that field. Enforcing ownership for every caller would require a
separate backward-compatible RPC migration review.

Partner merge does not update Learner/AI fields. Learner merge does not update
partner note, Treat, keyword or illustration. `booking_id` is unique and both
RPCs merge into the same report row. Existing partner `COALESCE` behavior remains:
null/empty inputs preserve previous values (including a previously selected
Treat); explicit clearing is not introduced in this stabilization work.

## User My Page and selected dirty changes

Existing report list, archive/detail and image card read `session_reports` scoped
to the authenticated learner. Existing booking and transcript fallbacks remain.
Normalization now leaves absent sentence/keyword/image absent and rendering uses
empty-state text rather than fabricated topics, sentences or image URLs. A real
partner-only note/Treat/keyword/image report is retained even without learner text.
Actual multilingual sentences/expressions are preserved without English filters.

The original dirty worktree contains unrelated room layout/Word Help, auth,
booking notification and profile/quiz synchronization changes. Those are excluded.
The English-only normalization proposal is excluded. Only existing independent
partner persistence and factual report fallback changes are brought forward onto
the current origin/main base, with failure/duplicate/field-ownership safeguards.

## Verification limits

Fixtures exercise the real browser submission function and client helper in VM
contexts with failure-injected RPC adapters, plus existing reward/transcript/room/
learner regression fixtures and static migration ownership/idempotency contracts.
They do not execute production DB writes or constitute a production E2E run.
No migration, deployment or push is part of this commit-only stabilization step.
