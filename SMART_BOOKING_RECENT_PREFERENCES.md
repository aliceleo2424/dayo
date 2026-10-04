# Smart Booking recent preferences (local implementation)

## Source and flow

Read the logged-in learner's latest `confirmed` / `completed` booking by `created_at` (then ID), using existing own-booking SELECT permissions. Pending/cancelled bookings never supply defaults. An error or empty result leaves ordinary selection available. The selected booking is read without mutation; defaults are copied into the current modal state.

Full flow: language/Korean help → conversation settings (purposes, interests, style) → concrete time → partner → confirmation. Existing semantic section IDs stay intact so timing and concrete availability code is unchanged. Recent summary → Use these settings skips the first two selection screens. Edit opens prefilled language selection. Unknown required fields disable the shortcut and remain unselected. KO sessions hide Korean help in both selection and summaries. Purposes are editable defaults, not a fixed profile property.

The common booking UI uses ivory/beige/sage tokens, EN/ES/FR/KO language codes, short interest labels and exactly four conversation style choices. Legacy comfort controls and their redundant confirmation rows are removed from the UI; compatibility state/read helpers remain to preserve old snapshots and room preferences. Selected chips use soft sage with a sage border, while the primary CTA stays solid sage. Existing purpose storage keys are unchanged. Ticket, cutoff/test bypass, concrete slot queries, availability race guards, cancellation, notifications and room entry are outside this change.

## Storage boundary / Security Work dependency

No new profile preference store, migration, validator change, RPC, grant, or RLS change. 062 currently accepts only `purposes`, `interests`, `chat_style`, `chat_request`, `partner_preference`. In particular, it rejects `schema_version`, `korean_support_preference`, `conversation_style`.

Therefore current confirmations still send the accepted immutable legacy brief. New `encourage` UI selection serializes as `chat_request=praise`, `partner_preference=null`. Reading an old `chat_request=praise` with no legacy partner style maps to `encourage`; an explicit slow/fast/correct partner style takes precedence. `partner_preference=korean` is capability, and is never inferred to be one of the four styles. Missing historical Korean help stays unknown, never any.

Until the canonical v1 DB contract is approved, Korean help is kept only in user-ID-scoped **sessionStorage**, after successful confirmation, paired with that exact booking ID. It is reused only if the server still identifies that booking as the learner's latest successful booking. It cannot fill unrelated historical snapshots. This is a temporary supplement, not a durable preference source or analytics record; new browser sessions/devices cannot recover absent fields.

After Profiles Security/User Profile contract completion, extend the existing booking `conversation_brief` validator and explicit client adapter in a separate reviewed migration: `schema_version:1`, `korean_support_preference:required|any`, `purposes`, `interests`, `conversation_style:slow|fast|correct|encourage`. Preserve omitted historical Korean help as unknown. Do not backfill it to any. Resolve the existing `opic` purpose taxonomy separately; do not alias it to `work_school`. Store selected partner preferences, matching_score and scoring_version at confirmation if the matching snapshot contract is approved. These canonical keys are not sent to today's validator. Analytics must use a version-aware read adapter, not aggregate praise and encourage as unrelated categories.

## QA

`node tests/smart-booking-recent-preferences.cjs`

Browser fixture: `tests/smart-booking-fixture.html?scenario=recent|legacy|none|ko|error`. Fixture identities/bookings and confirmation are local-only; it never loads production credentials or makes production writes. `recent` deliberately emulates the **future** v1 contract; `legacy` tests the current production contract and missing Korean help. Saved payload and previous-row immutability are displayed on the fixture page.
