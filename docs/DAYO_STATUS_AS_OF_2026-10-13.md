# DayO Engineering Handoff Snapshot — 2026-10-13

**This file is a dated snapshot only.** It does not override fresh code, database state, or the owner's newest instruction. Read only when the current task needs historical context; update facts after independent verification. Do not treat previously tested sessions as proof of today's Production behavior.

## Evidence at last check

- `main` was at Letter/post-session Production SHA `d798330b229b35d17c4c339dd296c60225abeb66` when last verified in GitHub; changes after this snapshot must be checked fresh.
- Partner Letter: actual authorized UI send, exact DB save, Judy recap read-back and Partner Lounge navigation **passed** on a TEST booking. Physical iOS/Android remains unverified.
- Customer feedback-before-Recap single CTA, no immediate card-save/Letter placeholder: shipped in Letter/post-session change, but full current physical-device journey not proven.
- Quiz: saved questions exist in some sessions; in a sampled set of 15 stored reports, 12 had zero questions. An Oct 12 TEST session had recognized Learner speech/key expressions but zero quiz questions. Do not call the entire quiz system broken or uniformly working; assess candidate eligibility and missing/hidden UI against evidence.
- Live Partner English CC captions: real two-browser synthetic-caption regressions integrated into normal room tests, but reported Oct 11 Galaxy/KakaoTalk issue remained unconfirmed. No claim the real-device problem was solved.
- Mobile chat/card keyboard/scroll fixes had deployed at `9c7e329`; physical Android/iOS verification remained pending.
- Cloudflare illustration: one prior TEST booking used both attempts. Attempt 2 had been generated, privately stored, with SHA/version, awaiting review. Earlier birthday lettering was rejected. Storage/owner-preview fixes migrated through 110. Migration 111 (Partner-owned review permissions) was **prepared locally but not reported applied** in this conversation. Partner send/reject UI and final authenticated acceptance were not verified. Customer generation remained OFF.
- Soniox pilot: separate `codex/soniox-owner-pilot` branch Preview `b5193b6` was reported READY, with migration 108 applied and two one-time slots unused at last verification. Real Soniox speech / mixed Korean-English accuracy was not yet verified. Never assume pilot has become Production STT.
- Requested new capability: optional private Partner→DayO Operations end-session note, independent of formal refund/safety reporting. It was not verified implemented or deployed.
- DayO backend uses Supabase. Existing user-facing static assets have both root and `public/` mirrors. Review `AGENTS.md` for paths and safe-change procedure.

## Owner's recurring unresolved concerns

- No unrelated feature changes, especially live CC disappearance or unexpected UI resizing.
- Partner mobile end-to-end reliability: controls remain visible/clickable with keyboard, Letter, illustration review and internal note.
- Customer post-session flow must not show unearned Letter placeholders or unneeded 'save Talk Card' UI; quiz needs both honest evidence and a reliable visible entry.
- Distinguish mock tests / Preview Ready / real authenticated acceptance / Production verification. Never say DONE at a weaker tier.

## One task at a time

Use `AGENTS.md`, then only the relevant product-contract subsection and current code/test files. Do not reopen completed investigation or unrelated migrations. No Production changes or paid calls without explicit owner approval.