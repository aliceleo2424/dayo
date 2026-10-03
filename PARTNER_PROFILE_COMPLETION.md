# Partner Profile Completion

Branch: codex/partner-profile-completion. Production has not been changed.

## Storage and permissions

081 adds partner_profile_details keyed by the canonical profiles.id. Details are self-declared, not legal or admin-verified records. No historical data is inferred/backfilled. Existing profiles.languages, profiles.visa_type, availability_slots and partner_capabilities are untouched. No partner_applications row, review score, media upload or notification is created.

Authenticated partners can SELECT only their own details. Admins can SELECT all details. Anon and general users cannot read details; no client has direct INSERT/UPDATE/DELETE privileges. save_partner_profile_completion(jsonb) checks the actual profiles.role, uses auth.uid() for identity and validates guide acknowledgement, location/visa consistency, distinct languages/proficiencies and KST availability. It returns a single JSON object. First guide/completion timestamps are assigned by the server and preserved on updates.

The lounge uses its existing approval event and a fresh role read. Incomplete partners see a non-blocking banner and a native modal. Completed partners see no banner. A missing migration/read error hides the optional completion UI without blocking the lounge. Save failure retains the form. Admin reads a separate self-declared summary; existing status/capability operations are unchanged.

## Before production

1. Review/apply only 081_partner_profile_completion.sql to the verified DayO project. Never run a blanket migration push or rerun 077/078/080.
2. Review/merge this branch when authorized, preserving unrelated dirty hunks. Deploy both user and admin projects.
3. Verify real partner/user/admin sessions: own-only reads/writes, guide/completion timestamps, re-login banner state and admin display. No production credentials/data were used for local completion QA.

## Local verification

Run tests/partner-profile-completion.cjs with NODE_PATH pointing to installed @electric-sql/pglite, TypeScript and React dependencies. It uses disposable in-memory PostgreSQL and mocked admin helpers. tests/partner-profile-completion-fixture.html is a local UI fixture only; its fake backend/localStorage must never be used as production authentication or persistence. Serve it with the two public module assets to test mobile/desktop.

Also verify admin TypeScript, JS/CSS syntax and the existing partner application SQL/API/message tests. Browser fixture persistence and real SQL persistence were verified separately; production E2E awaits 081 deployment.
