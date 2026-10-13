# DayO Regression, Change Scope and Release Gates

## Why this exists

DayO has repeatedly shipped cases where a feature worked before an unrelated edit, disappeared without owner consent, or passed mocked/unit tests but failed on a physical device. These gates distinguish **proof of code behavior** from **proof of customer experience**. They are standing rules for every coding agent, regardless of model/vendor.

## Mandatory task boundary

For each task, define briefly (internally and in the final report):

- **Change objective:** what the owner sees working at the end.
- **Allowlist of files/hunks:** smallest source and exact mirrors, plus related tests. Anything else is out of scope.
- **Protected dependencies:** identify only relevant neighboring features that must remain unchanged.
- **Verification:** both successful and failure/timeout paths; User and Partner if both involved.
- **Approval gates:** data writes, migration, external provider usage, cost, credentials, Production activation and sensitive permissions require their own explicit owner approvals.

At completion compare `git diff --name-only <starting-base>` and `git diff --cached --name-only` with the allowlist. Unapproved paths or unexpected diff hunks **FAIL**. Never include pre-existing dirty changes, even if tests rely on them. If a root/public mirror is intentionally updated, assert contents match.

## Test layers (do not conflate them)

**Layer 0 — change safety:** scoped diff review, protected-path review, baseline comparison, syntax, mirrored-source equality, no secrets in diffs/logs.

**Layer 1 — functional tests:** the feature's own tests, errors/timeout, no-input, retries, duplicate requests, incorrect role, permission denial, lost acknowledgments, data persistence, reload and idempotency.

**Layer 2 — real browser DOM:** actual clicks, opens/closes, scroll and visible bounding boxes at widths **360, 390, 430, 1280**, KO/EN. Test both User and Partner screens when touched, with mobile keyboard/visual viewport changes and long content. Require **zero inaccessible primary actions, overlap, clipping, unexpected horizontal scroll and console errors**. Preserve timers/video/mic/Chat/Talk Cards/Next Question/CC/Letter as appropriate.

**Layer 3 — authorized Preview E2E:** two separate authenticated DayO participants; real API/DB read-write and read-back only with explicit approval; exact booking/time; test User vs Partner vs unrelated user and TEST without tickets or rewards. Verify runtime result, not merely a 200 HTTP status when semantic writes might fail.

**Layer 4 — real devices and Production:** Android Chrome/KakaoTalk→external Chrome, iOS Safari as relevant, explicit owner-operated microphone/camera (agents cannot prove actual human speech). After deployment verify the served assets/revision and relevant flows; if physical QA is outstanding, say so. Do not claim **fully fixed** until the failed real-world scenario is retested.

Mocks and synthetic browser events are **fixtures**, not live user acceptance. An API Ready deployment is **not** evidence the microphone, image or quiz was tested successfully.

## Current source-backed test entry points

Existing `tests/production-room-regressions.test.js` is the normal room/captions smoke gate and invokes `tests/partner-captions-browser.test.cjs` (real two-browser PeerJS, synthetic audio). Run:

```bash
node tests/production-room-regressions.test.js
```

When relevant, also use **existing** tests (verify current paths first):

| Area | Test entry points | Key checks |
|---|---|---|
| Partner Letter / end flow | `tests/letter-post-session-browser.cjs`, `tests/partner-letter-submit-fixtures.cjs`, `tests/room-wrap-up-fixtures.test.js` | click → verified save → lounge; drafts/errors; 25-minute end |
| Partner and User mobile room | `tests/mobile-room-ux-browser.cjs`, `tests/partner-captions-browser.test.cjs` | 360/390px DOM, keyboard, panels, captions/reconnect |
| Customer feedback / Recap | `tests/conversation-partner-feedback.cjs`, `tests/conversation-recap-fixtures.test.js`, `tests/recap-report-integration-fixtures.test.js` | one CTA, order, grounded report, DB rules |
| Quiz and review persistence | `tests/quiz-novelty-fixtures.cjs`, `tests/room-recap-qa-fixtures.cjs`, `tests/session-report-persistence-fixtures.test.js` | credible candidates, 2/4/6, replay/score |
| STT and chat | `tests/session-transcript-reliability-fixtures.test.js`, `tests/booking-chat-persistence.cjs` | independent roles, transcript persistence, chat idempotency |
| Illustration | `tests/keepsake-safety.cjs`, `tests/partner-illustration-cloudflare.cjs`, any current partner-review-specific fixture | consent, exact image/version, quota, review/deny/cleanup |

These are **candidate existing entry points, not a claim they all pass or are already integrated into CI**. Some historic AUDIO fixtures fail on unchanged main. Determine baseline and classify honestly. Do not rewrite expectations to silence a test or run privileged production integration in ordinary CI.

## One-time automation setup — REQUIRED for a true hard gate

**Observed repository baseline on 2026-10-13:** the root `package.json` had only runtime dependencies and no `test` script; several browser/DB fixtures import `playwright`, `jsdom` or `@electric-sql/pglite`; no `.github/workflows/` directory was visible. Thus a root AGENTS file alone does NOT give automated deployment enforcement.

A one-time, scoped setup task must:

1. Add **pinned test-only dev dependencies** and reproducible lockfile entries for Playwright, jsdom, PGlite if actually needed. Provision supported Chrome/Chromium in CI for scripts using `chromium.launch({channel:'chrome'})`. Do not alter production runtime dependencies or upgrade unrelated packages.
2. Implement a deterministic `npm run test:dayo:core` (or equivalent) that executes known-good current release-critical tests, including the room/CC browser test, mobile panel/keyboard checks, Partner Letter and feedback→Recap checks; add quiz and future image-review tests after establishing a green baseline. Never make a failed test 'optional' just to get CI green.
3. Implement a scoped change guard or explicit allowlist check that fails when files outside task scope are staged or committed. Preserve exact root/public mirrors and verify they match. The owner may explicitly approve exceptions in advance; code cannot self-authorize them.
4. Add `.github/workflows/dayo-regression-gate.yml` to run on pull requests to `main` and pushes to `main`, with **no Production secrets, no Production writes, no paid provider calls and no real accounts**. Run deterministic fixtures and browser interactions. Upload relevant screenshots/artifacts when failures occur without collecting private data.
5. Configure repository branch protection / ruleset so **passing DayO Regression Gate status is REQUIRED before merge**. Prevent direct `main` pushes that bypass the checks, subject to the owner's explicit choice. GitHub-side branch protection is a separate owner/admin setting; a workflow file by itself cannot stop direct pushes or automatically prevent Vercel Production deployments.
6. Align Vercel Production promotion to successful required CI checks (PR/merge or a deliberate pre-deploy gate). Verify the actual configuration; do not claim branch protections or deployment gating are enabled merely because a YAML file was created.
7. First test a deliberately broken caption/hidden mobile button and an out-of-scope diff on a disposable branch to show the gate **FAILS**, then restore the fixture and show the clean baseline **PASSES**. Never change live customer code for this test.

**Automation setup and any CI/branch-protection changes need one-time approval as a separate task.** Until installed and verified, the agent MUST explicitly report: "AGENTS instructions exist, but an enforced CI/deployment gate is NOT active."

## Focused release checklist

- [ ] Owner's exact requested behavior implemented, nothing else touched.
- [ ] Diff allowlist and untouched dirty-file status verified; public/root mirrors match.
- [ ] Existing protected features (especially live CC captions, booking, STT, video/Chat/Letter) remain functional.
- [ ] Correct positive, negative, failure and duplicate paths pass.
- [ ] KO/EN and mobile 360/390/430 + desktop real DOM checks pass; screenshots reviewed.
- [ ] Actual DB/API/storage evidence collected if required and explicitly authorized.
- [ ] Historical/TEST data untouched except exact approved test writes; no payouts/tickets for TEST.
- [ ] Privacy and paid-provider cost limits verified for affected endpoints.
- [ ] CI gate ran and passed, if installed; failures compared with base.
- [ ] Scope-specific commit/deploy permission exists; correct SHA/URL/asset checks reported.
- [ ] Any unverified real-device/customer flow remains prominently **OPEN**.

## Reporting format

`Outcome: DONE / PARTIAL / BLOCKED`

`Scope: requested feature and exact files`

`Preserved: named unaffected systems`

`Tests: PASS / FAIL / pre-existing failures / NOT RUN`

`Real acceptance: user/partner, device, DB, Preview/Production, each explicitly verified or unverified`

`Deploy: not deployed OR actual SHA + serving domain + status`

`Next action: one precise blocker/approval if needed`