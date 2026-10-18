# DayO — Claude Code Entry Point

This repo already has authoritative standing instructions in `AGENTS.md`.

Before modifying code, read `AGENTS.md` and follow it as the repository's governing rules. Read **only the relevant section** of `docs/DAYO_PRODUCT_CONTRACT.md` and `docs/DAYO_RELEASE_GATES.md` for the current task. Avoid full-repository audits for routine changes.

The same strict limits apply in Claude Code as Codex: never change out-of-scope code, preserve all owner dirty work, do not auto-apply migrations or spend paid API credits, do not bypass authentication or quota guards, do not silently remove existing features, and do not claim live acceptance based on simulated tests. Changes to existing customer UX require explicit owner instruction.

For customer-screen design ideas (bottom tabs, 내 대화, 편지함, 책장, ticket stamps, 나를 소개해요), read `docs/DAYO_UX_IDEAS_LETTERBOX_BOOKSHELF.md` before changing those screens.

Recent shipped changes are summarized in `docs/DAYO_CHANGELOG.md` (newest first); add an entry there for every release.

When asked for independent review, remain **read-only**: report scope violations, regressions and missing E2E verification without editing any files.