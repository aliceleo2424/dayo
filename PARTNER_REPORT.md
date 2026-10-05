# Partner Report simplification

Status: isolated `codex/partner-report-simplify`, based on persistence stabilization `f1006f5aefad5f96c3ff8937bb1d105748ddc04f`. No main integration, production deployment or DB migration is part of this change.

## UI and reusable contract

`public/partner-report-contract.js` contains A–G note templates, actual language labels, six existing Treat codes/meanings, conservative keyword suggestions and the illustration prompt. It is available as `window.DayOPartnerReportContract` and as a Node module. A future User Report can import the same Treat mapping; the current User UI is unchanged.

The popup offers editable note templates, six Treats plus No Treat, at most three keyword suggestions, custom keyword entry and an optional illustration. The transcript is a collapsed reference. No learner sentence selection, grammar correction or AI report approval is required. A–B use the known session language; missing language is omitted rather than guessed. E requires an explicit session topic or a selected keyword. F provides a short recommendation input; edits to the note are preserved when the recommendation subsequently changes.

The intended completion time is about one minute; an average completion time has not been measured. Scoped CSS uses a scrollable modal, wrapping chips, 3-column desktop / 2-column mobile Treat cards and a sticky Submit report control.

## Keyword sources and privacy boundaries

The current room context is `DayORoomAccess`, `DayOLive.getTranscript()` / `sessionTranscript`, and `DayOCurrentTalkCard`. There is no new fallback to a prior session's localStorage transcript. Only explicitly partner/local/me transcript rows contribute to suggestions. Learner/user rows and unknown-role strings are excluded. A small concrete noun/phrase vocabulary ranks frequency and topic relevance. This is a local heuristic, not a multilingual POS model or an AI evaluator. Unknown topics may have no suggestions.

Fallback uses concrete nouns in the current Talk Card topic/question, then the current explicit session topic, then manual input. Suggestions are capped at three. Generic conversation/filler words are excluded. The keyword check rejects obvious contact/link patterns and angle/curly brackets; it is not a general PII classifier. Only the selected keyword and fixed artistic instructions go into the illustration URL, never the full transcript.

Future learner grammar corrections must use user-side recognized speech only. Partner transcript must not become the learner correction source.

## Illustration

The pre-existing Pollinations URL provider is reused: `https://image.pollinations.ai/prompt/{encoded_prompt}`. The prompt asks for a warm editorial illustration, cream/sage/soft-coral mood, no text, typography, letters or speech bubbles. No new provider credential, environment setting, proxy or storage schema was added.

A successful image load stores its URL in the pending report. Failure, timeout (12 seconds), or submission before the image finishes stores the keyword with `illust_url: null`. Submission never waits for illustration generation. Late callbacks from earlier keyword requests cannot replace the current selected keyword's image. Images completing after submission are not separately saved.

The local harness substitutes a local image / 404 / delayed image only to verify success, failure and pending UI paths. Actual legacy-provider success and long-term URL persistence are unverified. Current official provider documentation at https://gen.pollinations.ai/docs describes an API-key requirement for the modern endpoint. Confirm the legacy endpoint before release; any authenticated server adapter and durable asset storage are separate scope/configuration decisions. An image failure must remain non-blocking.

## Save ownership and persistence

The new UI payload is `partnerComment`, `stamp`, `keyword`, `illustUrl`. The unchanged `persistSessionReport` helper serializes the existing partner-owned DB fields `partner_comment`, `stamp`, `keyword`, `illust_url` plus existing `partner_name` metadata into `merge_partner_session_report(booking_id, report)`. The room's existing `approvedAt` submission metadata is not serialized by that helper. It sends no `spoken_sentence`, `summary`, `key_expressions`, `quiz_score`, `feedback` or correction data.

The independent reward / transcript / report promises, identity guards, pending/completed submit guards, retry messages and redirect rules are unchanged from f1006f5. One failed task does not stop the other two from attempting persistence. A failure retains the popup for retry; navigation still follows the existing all-success rule. Reward deduplication remains the existing server/RPC behavior. Report merge remains booking-scoped rather than a new row per click.

DB limitations inherited from the unchanged migrations 046/047: the legacy partner RPC still accepts a `spoken_sentence` field from other callers; this client does not send it, but server-enforced field ownership is a future security contract change. The merge uses COALESCE for nullable partner fields. Consequently No Treat works for a new report, but null does not clear a previously saved stamp/image/comment during retry/edit. This change does not invent a clearing sentinel or change existing RPC semantics. Explicit clear operations need a separately reviewed contract if later editing of persisted reports is introduced.

## Current User My Page rendering (unchanged)

- `public/mypage.html`: `#mypage-card-feed.mypage-report-list` receives the archive.
- `public/supabase-client.js`: `loadUserReports()` reads `session_reports` for the authenticated `learner_id`, normalizes records with `normalizeReportCard`, then renders the archive. Existing booking/log/transcript fallbacks remain.
- `talkQuoteText()` consumes `partner_comment` (including its existing text filter); `topicLabel()` consumes `keyword`; `reportTreat()` / `reportTreatHtml()` map `stamp` to existing translated labels.
- `renderReportArchiveItem()` creates the archive item; `renderViralReportCard()` displays the keepsake including `illust_url`, keyword and partner note; `renderReportDetailHtml()` renders the expanded report, Treat and current learner/AI fields.
- `public/mypage-dashboard.js`: the report detail flow calls `renderReportDetailHtml()` with a legacy card renderer fallback.
- Root mirrors of these files are not modified by this task.

Next User Report design should split HUMAN TOUCH (Partner note / Treat / keyword + illustration) from AI LANGUAGE RECAP (summary / user-side spoken sentences / natural corrections / useful expressions / quiz result). Existing learner/AI data must be preserved. Shared Treat meanings are ready for that follow-up but are not inserted into today's User UI.

## Event contract for follow-up

Migration 048 `session_events` and `record_session_event` currently whitelist `room_entered`, `media_connected`, `talk_card_shown`, `word_help_clicked`, `session_ended`. They do not accept the requested report selection events. No unsupported events are emitted and no schema is expanded here.

Proposed future event names, with booking_id + actor identity and schema_version 1:

- `partner_note_template_selected`: template_id a–g.
- `partner_custom_note_used`: template_id / edited boolean (no raw note text).
- `partner_treat_selected`: existing stamp code or null.
- `partner_keyword_suggested`: source kind + candidate count (no transcript).
- `partner_keyword_selected`: source kind + keyword if approved for telemetry.
- `partner_custom_keyword_used`: source kind / length, avoid duplicating raw private input.
- `partner_illustration_requested`, `partner_illustration_succeeded`, `partner_illustration_failed`: request correlation id / duration / failure kind, no full prompt, URL or transcript.
- `partner_report_submitted`: booking-scoped idempotency / outcome metadata; define retry versus success counts explicitly.

A future event migration/RPC must review ownership, RLS, retention, privacy and idempotency before connecting these events.

## Local verification

Run:

```text
node tests/partner-report-simplify-fixtures.test.js
node tests/session-report-persistence-fixtures.test.js
node tests/session-review-fixtures.test.js
node tests/partner-reward-reliability-fixtures.test.js
node tests/session-transcript-reliability-fixtures.test.js
node tests/production-room-regressions.test.js
```

`node tests/partner-report-preview.cjs` serves a local-only popup at `http://127.0.0.1:3051/preview`. It extracts the actual popup/submission code but replaces auth, storage, reward, redirects and image URLs with fixtures. It loads no production credentials, live media or quiz runtime. Query fixtures: `keywords=0|1|3`, `image=fail|pending`, `report=fail`, `reward=fail`, `transcript=fail`.

Verified locally: A–G / language substitution / editable recommendation, six Treats + No Treat, 0/1/3 candidates and manual keyword, image success/404/pending, submission, report/reward/transcript failure isolation and retry, idempotent fixture reward, transcript reference, 390px and 1280px no horizontal overflow / Submit inside modal. Duplicate and learner ownership contracts are covered by persistence regression fixtures. Production/RPC E2E and real provider generation are not claimed.

The fixtures compare the learner quiz inline section and the persistence/retry section with f1006f5, and assert room-live/session-lifecycle/Supabase client/My Page files remain unchanged. No DB/backend files are edited.

## Release gate after active sessions end

Obtain the user's separate production instruction. Review latest main and all room/report/quiz hunks before integrating; do not overwrite another task's room changes. Ensure f1006f5 persistence stabilization is included. Run the regression suites again and perform staging RPC E2E with both participant save orders, duplicate retry and image-provider failure. Resolve provider readiness separately if needed. This UI change needs no migration. Merge/deploy only after approval and active calls have ended, then verify new reports in User My Page without changing learner-owned data.
