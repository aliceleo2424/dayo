# Learner-side language recap — local implementation contract

## Sources and ownership

Final browser SpeechRecognition packets accumulate in `room-live.js` as rows with `id`, `speaker`, `text`, and timestamp. A packet may be a fragment; sentences are never reconstructed or combined for correction. `upsert_session_transcript` (existing 072) binds canonical `session_logs` to the authenticated booking participant and role.

`POST /api/learner-language-recap` validates the existing user JWT, reads only that user's confirmed/completed booking and canonical learner log with the same JWT/RLS, and derives language from the booking. It accepts only booking ID and UI locale. Client-provided transcripts, identities, languages, or Partner fields are rejected. No service-role key or new database permissions.

| Data | Stored source |
| --- | --- |
| Original learner speech | session_logs.transcript: row ID, learner speaker, text, timestamp; canonical participant_id / participant_role |
| Partner note / Treat / theme / illustration | session_reports.partner_comment / stamp / keyword / illust_url; existing Partner merge |
| Recap | Existing deterministic session_reports.summary from DayOLearnerExpressions.buildReviewData; no new thematic summary |
| Useful expressions | Existing learner-only session_reports.key_expressions; max 3 displayed, corrections deduplicated; Quiz source unchanged |
| Quiz | Existing session_reports.quiz_score percentage; original Quiz/Talk Record snapshot retained |
| Corrections | Structured objects in existing session_reports.feedback JSONB array, beside preserved evaluation chips |

## Generation and admission

Reuses existing Gemini REST infrastructure: server-only GEMINI_API_KEY, existing GEMINI_MODEL override, default gemini-3.6-flash. Structured JSON schema; max 3 corrections. Only up to 8 bounded candidate packets leave the server, with ephemeral IDs (no account/booking/log IDs). No transcript or secret logging.

Candidates require actual learner speaker, source row ID and timestamp, supported EN/ES/FR/KO, meaningful length, and basic quality checks. Short answers, unfinished connectors, damaged/repeated ASR, URLs/email, long number strings, and missing provenance are excluded. Supplied low ASR confidence is rejected; the current recorder does not provide a reliable confidence field, so no ASR certainty is invented. English reuses the existing sentence-quality helper; ES/FR use conservative verb checks; KO requires Korean text. These checks intentionally prefer omissions over guessed corrections.

The prompt requires exact source text/ID, clear intent, a real correction need, minimum edits, unchanged meaning, and no new facts/context. Natural sentences and ambiguous ASR must yield zero. The server additionally checks exact original/source identity, type, explicit quality flags, model confidence >= .94, bounded explanation, lexical overlap, unchanged numbers, no added proper names, and script compatibility. These heuristics reduce invention; they cannot mathematically prove semantic equivalence or perfect ASR. Rendering also corroborates the saved log ID and utterance ID against the user's authenticated canonical log. Missing evidence hides corrections.

```json
{
  "schema_version": 1,
  "generator": "dayo_learner_recap_v1",
  "source": "learner_recognized_speech",
  "speaker": "learner",
  "source_log_id": "canonical learner log UUID",
  "source_utterance_id": "recognized packet ID",
  "source_timestamp": "ISO timestamp",
  "original_text": "I am very agree.",
  "suggested_text": "I completely agree.",
  "correction_type": "grammar",
  "short_reason": "Use agree as a verb.",
  "meaning_preserved": true,
  "correction_needed": true,
  "confidence": 0.98
}
```

Stored results also carry source_digest, model, and generated_at. A separate feedback metadata object records generation version, digest, count and completion, including a valid zero-correction result. Identical sources/model/locale reuse a validated stored result on retry. Only this generator's previous entries are replaced; unrelated evaluation chips/legacy feedback remain.

## Persistence / failure boundary

The endpoint does not write to Supabase. The existing authenticated `merge_learner_session_report` RPC remains the sole write path. The optional browser enrichment precedes that merge; unavailable key/source, timeout, malformed output or provider failure falls back to the unchanged base report. Successful AI results are reused per booking within the page; failed attempts can retry. Existing report save success flag and booking identity remain unchanged.

The transcript flush is bounded to 1.8s; API work has a 7.5s deadline and browser fetch an 8.5s deadline. The UI may wait briefly for optional enrichment, but AI failure does not prevent saving the basic report. Changed script cache versions in room/My Page prevent stale readers from omitting new provenance. The original `__dayoLearnerReportPayload` remains intact for Quiz/Talk Record, so new structured feedback cannot render as evaluation-chip text there.

046 Partner conflict updates do not write summary/feedback/key_expressions/quiz_score; 047 learner conflict updates do not write partner_comment/stamp/keyword/illust_url. Both SQL contracts are unchanged. No migration, RLS, grants, role, reward, booking or Quiz change. Room adds only two script loaders and loader cache versions; lifecycle adds only the optional recap call and enriched merge argument.

Human Touch + Language Recap IA is unchanged. Correction count zero hides its block. Existing legacy corrections remain readable with their original quality/provenance rules. Source loading refreshes only the matching already-open detail and preserves scroll. English save label is `Save this report`; its existing export action is unchanged.

## Initial implementation verification

- New fixtures: filters, 0/1/3, multilingual, exact original/ID, meaning guards, own-booking access rejection, cached zero/result retry, API/provider failure, actual browser enrichment and lifecycle merge integration, both participant SQL ownership contracts, mirrors and unchanged lifecycle remainder.
- Existing 8 suites: User report UI, session review/Quiz, session persistence, transcript reliability, conversation insights, Partner notes/themes/finalize.
- Actual Gemini calls use only synthetic speech and the user's locally configured server key. A: `I am very agree.` -> `I completely agree.`; B: `I really like this café.` -> omitted; C: `and I maybe the yesterday` and D: `yes` -> excluded before provider. Safe result fixture is tests/fixtures/learner-language-recap-live.json; contains no secret/account data.
- Actual ES/FR/KO synthetic calls also produced source-bound corrections and Korean explanations. 390px/1280px local UI and Korean chrome checked; no horizontal overflow, existing Partner note and Quiz retained.
- Auth/RLS reads and writes are exercised with controlled HTTP/VM fixtures and unchanged SQL inspection, not a live Supabase session. No real session was created or modified; production E2E is still required.

Before release: review integration with the primary checkout's pending room/Quiz/client work, ensure the existing server Gemini key/model and Supabase public config are available to the user-site API, deploy only after approval, then verify own-learner vs Partner/outsider access, actual transcript save -> generation -> merge -> refresh, provider failure and retries in staging. Consider latency and request-cost controls before broad rollout. No main merge, push, production migration or deploy in this task.


## Actual DB release validation — 2026-10-05

The user explicitly designated a disposable confirmed Learner/Jen booking. The QA recorder feeds synthetic final-recognition events through the existing room-live recognition callback, UUID/timestamp serialization, ProfileStore ES module and authenticated `upsert_session_transcript`. The test clock uses that booking's session timestamp; this does not test microphone recognition, room entry or booking completion. No ticket/reward/session-state calls are made.

- Actual DayO Supabase accepted four canonical Learner rows. The real API read them with the Learner's JWT and called Gemini 3.6 Flash. Only `I am very agree.` produced a grammar correction (`I strongly agree.`); the natural café sentence had no correction and the fragment/`yes` were excluded.
- Existing Learner RPC saved source log/utterance IDs, exact original text, suggestion, reason/type, model/version/digest in feedback. Fresh authenticated reads retained one report and one correction; identical API retry used the stored digest without another provider call.
- Natural-only speech generated a valid zero result; the correction section disappeared. Partner RPC saved a test note/Treat/theme/image while retaining Learner feedback and the explicit QA Quiz sentinel (67, not a real Quiz attempt).
- Genuine Partner login was denied Learner API (403), Learner report SELECT, direct UPDATE and Learner merge. Production read-only catalog inspection confirmed authenticated SELECT-only table grants, owner/admin RLS, and separate participant RPC ownership. No policy/grant changes.
- A deliberately invalid key in the local handler copy caused a real Google 400. The existing Learner merge still saved the base report, preserving Partner fields and Quiz. No raw provider error reached the report UI. Restoring normal provider generation retained those fields.
- The unchanged actual My Page loaded the persisted report on a new page request (no report fixture injection). Korean/English views showed Human Touch, source-bound correction, useful expressions and Quiz. Illustration loaded; 390px had no horizontal overflow and retained the Save CTA.
- Existing lower speaking-pattern/word-count/rhythm insight remains. It is not the same correction data, but is better suited to the Progress/metrics view in a future UI task; no removal here.
- Real E2E exposed the existing `/rest/v1/` Supabase URL format. The new API now normalizes that public URL like the existing client, while still rejecting non-Supabase hosts. No environment variable was edited.

Local actual-DB tool (never part of the public site):
`node tests/learner-language-recap-e2e-server.cjs <server-env-file> <explicit-test-config-json>`
Config: bookingId, learnerId, partnerId, optional email. Keep real identifiers outside Git. Use only an explicitly authorized disposable booking. `--production-api` selects the fixed DayO production endpoint after release; failure simulation applies only to the local handler. Login is performed in the browser; no credentials are committed. After verification, delete only newly created QA log/report rows with explicit confirmation and keep the booking unchanged.

Release gates: latest main integration, the 12 relevant regression suites, production Ready/source match, authenticated production endpoint and production My Page smoke, then exact QA-row cleanup. No migration is needed.