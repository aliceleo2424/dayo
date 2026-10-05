# User Conversation Report — read-only presentation contract

## Current sources

`loadUserReports()` reads learner-owned `session_reports` and resolves partner nicknames using `list_public_partner_profiles`. It keeps existing legacy/fallback paths. My Page now opts into `user-conversation-report.js`; other pages keep their existing renderer.

| UI | Existing persisted field/source | Owner |
| --- | --- | --- |
| Partner note | session_reports.partner_comment | Partner |
| Treat | session_reports.stamp → DayOPartnerReportContract.treats | Partner |
| Conversation Theme / illustration | session_reports.keyword / illust_url | Partner |
| Recap | session_reports.summary | Learner |
| Useful expressions | session_reports.key_expressions (max 3 displayed) | Learner |
| Quiz | session_reports.quiz_score (percentage, including 0) | Learner |
| Looked-up words | session_reports.word_help | Learner |
| Corrections | Structured session_reports.feedback, corroborated against own canonical learner session_logs.transcript | Learner |

The current recap producer is `DayOLearnerExpressions.buildReviewData`: it records learner-only extracted expressions and a deterministic summary about the recorded expressions. It does **not** generate an AI thematic summary or grammar corrections. Current feedback strings are user evaluation chips, not language corrections. No new AI producer, migration, RPC, write path or third-party transcript transmission is added by this UI change. No fabricated Quiz denominator or answer-review link.

## Correction admission (read adapter, not a new writer)

A future validated correction may use the existing feedback JSONB array; no schema expansion is required for this renderer. This is a presentation candidate, not an implemented/approved AI generation API:

```json
{
  "source": "learner_recognized_speech",
  "original": "I am very agree.",
  "corrected": "I totally agree.",
  "meaning_preserved": true,
  "correction_needed": true,
  "explanation": "Use agree as a verb."
}
```

Both quality flags must be explicit. The original must match a learner-labelled utterance in that booking's canonical log fetched by the existing authenticated participant query. Partner/unknown speakers, missing provenance, fragments, repeated/garbled English, low supplied ASR confidence, ambiguous items and identical corrections are omitted. At most 3 unique corrections appear. Missing evidence gives zero corrections. `spoken_sentence` is not used as correction evidence because legacy ownership was mixed. No grammatical correctness is inferred by this renderer.

The current producer emits none of these correction objects; its existing evaluation chips remain stored unchanged. Before claiming AI-generated recap/corrections in production, define and validate a separate learner-only generation contract. Fixture correction objects are synthetic QA data, not real AI output.

## Rendering / compatibility

Human Touch and Language Recap are independent and omitted when empty. Successful illustrations use the saved URL; broken images are hidden and theme remains. Timed speaking metrics remain within Language Recap when learner evidence exists. Existing card export and My Page detail open/close entry points remain available. All text is escaped. Dates use KST; no guessed language/real-name fallback. Korean and English chrome are provided; saved multilingual text is preserved.

Archive shows nickname/date/language/theme/Treat/Quiz only. It never expands note, expressions or correction text. Export captures Human Touch without duplicating the old decorative card in the detail.

## Local verification / release boundary

- `node tests/user-conversation-report-fixtures.test.js`
- `node tests/session-review-fixtures.test.js`
- `node tests/session-report-persistence-fixtures.test.js`
- `node tests/conversation-insights-fixtures.test.js`
- Existing Partner Report fixtures
- `node tests/user-conversation-report-preview.cjs` → localhost:3052/preview (390px / 1280px, broken image / sparse / legacy / Korean controls)

No production writes or deploys. Based on clean origin/main 7980c3d. Primary working tree's uncommitted room/quiz/client changes are not copied or reverted. Before integration, review its supabase-client normalization hunk together with the separate pending work; keep both functionality. room, learner-expressions, session lifecycle and report persistence functions are unchanged.
QA result: 8 relevant fixture suites passed; 390px/1280px UI checked, broken image hidden, theme retained, sparse recap omitted, long legacy note wraps, Korean chrome verified. The historical Partner Report Simplify suite fails its old full-file immutable client/My Page guard; that old test is unchanged. The new fixture independently compares room/Quiz/lifecycle/booking and shared-client write paths to latest-main baseline 7980c3d.
