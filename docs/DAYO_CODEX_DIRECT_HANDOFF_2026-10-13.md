# DayO / 돼요 — Verified Codex Handoff & Direct-Conversation Working Agreement
**Snapshot date:** 2026-10-13 (KST)  
**Intended reader:** Codex (and optionally Claude Code), working with the DayO repository and its owner  
**Status:** Engineering handoff / fact reconciliation / ongoing work queue. **NOT blanket authorization to implement, migrate, deploy, spend, or merge.**

> **Owner's preferred workflow:** The owner speaks naturally in Korean in the Codex conversation, without translating requests into developer jargon or copying a separate ChatGPT-generated programming prompt. Codex must interpret the request, perform safe technical planning, coding and routine QA, ask only essential decisions, and report clearly. The owner is the product decision-maker, not a substitute developer, QA engineer or release operator.

## 0. READ THIS FIRST — ORDER OF AUTHORITY AND SAFE START

1. **Latest explicit owner decision in the live conversation** supersedes earlier suggestions, dated handoff notes, and stale plans. If a requirement conflicts with an implementation, preserve work and **ask the owner about the actual product decision** instead of silently rewriting it.
2. For deployment/migration facts, prefer **verified current production state** (actual GitHub refs, applied Supabase migrations, served Vercel revision, persisted database row) over an agent's success claim. Local changes, passing fixtures, Preview READY and production behavior are different evidence levels.
3. **Root \`AGENTS.md\` is in GitHub \`main\` now** and contains standing restrictions. Read it once per new workspace, then only the relevant sections of \`docs/DAYO_PRODUCT_CONTRACT.md\`, \`docs/DAYO_RELEASE_GATES.md\` and this handoff. Do not perform expensive repo-wide re-analysis every turn.
4. Before editing: determine actual local checkout/worktree and branch, \`git status --short\`, existing owner changes, relevant files, narrow functional acceptance and **protected adjacent behaviors**. Review current state without wiping dirty work. Follow the smallest viable edit.
5. **Each new Korean-language request authorizes only that request.** The work queue below is context and priority, **not simultaneous permission to implement everything**. Keep image, CI, mobile, Recap/quiz, Soniox and operations notes separately scoped.
6. Only ask a clarifying question when a **material owner decision, unknown access permission, cost, migration or non-reversible Production action** cannot safely be resolved from existing instructions. Prefer **one concise Korean question** with the options, impact and recommendation. Do not invent product requirements to avoid asking.
7. **Approval discipline:** an earlier approval for PR #2 was for the PR #2 documentation merge, **not** for PR #3, migration 111 reapplication, paid STT consumption or any new production release. Do not recycle one approval for unrelated actions.

### Mandatory classifications in every work result

- **VERIFIED CURRENT:** independently checked in the actual environment (include check date / SHA / environment).
- **OWNER DECISION:** explicit agreed product contract.
- **REPORTED BUT NOT REVERIFIED:** previous agent result, worktree-only change, Preview report or physical-device observation.
- **OPEN / BLOCKED:** actual defect, failing test, missing UI or unproven end-to-end acceptance.
- **NEEDS OWNER CHOICE:** a material unresolved requirement; do not implement based on preference or guess.

Never call a mocked or synthetically signaled browser test a successful physical-device test.

## 1. Product identity and invariant journeys (OWNER DECISION)

- **DayO (돼요)**, https://www.dayotalk.com — scheduled, moderated **1:1 conversation** with a partner, centered on real-world foreign-language confidence and friendly cultural exchange, not formal private tutoring or a dating/random-chat service. Do not rewrite service identity during technical fixes.
- Standard session: **25 minutes of real conversation + 5 minutes of follow-up/word quiz**, total 30 minutes. Do not silently delete the five-minute follow-up or substitute a different flow.
- The **Partner** guides conversation and controls shared Talk Cards/Next Question; preserve the three-card (~10 minutes/topic) intended pacing without forcing exact timer behavior absent a specific request. Customer and Partner have distinct capabilities.
- Live room must preserve video, mic/camera, mute, timer (including 3- and 1-minute wrap alerts as currently implemented), reconnection and audio recovery, Talk Cards, chat, language help, safety/report action and session-end role routing.
- **Live English closed captions (CC)** from Partner speech to Learner are a non-negotiable retained feature. Do not confuse the production Web Speech STT/caption implementation with the protected Soniox pilot.
- The main booking and payment flow, price/packages, cancellation, tickets, TEST-session financial suppression, login/auth, RLS, Partner reward idempotency, branding and site copy are protected. Do not guess new pricing, available partner languages or live inventory from historic business notes. Current real customer language focus is en/ko/es but historical FR profiles/bookings must remain intact.
- Static user-facing canonical sources: \`public/\`; existing corresponding root static mirrors are retained and must be synchronized **only for touched files**. Server API: root \`api/\`; Admin: \`admin/\`. Avoid unrelated \`vercel.json\` edits.

## 2. Locked Partner end-of-session contract — Priority P0

**This is the central, repeatedly misunderstood requirement. The owner did not authorize a mandatory Owner/Admin image-approval step.**

The Partner's actual responsibilities after a conversation are:

1. **Write and send a human Partner Letter.** Existing templates/suggestions may help but must be grounded in the exact booking. User can always write their own words. Preserve draft on failure, authentic save/read-back, double-submit prevention, unknown/lost-ACK recovery, appropriate finish/reward handling and reliable return to Partner Lounge. Do **not** conflate UI display with a confirmed DB write.
2. **Choose a verified topic from the actual booking**, request the optional watercolor keepsake when available, **preview that exact image**, and independently click **"Send this image"** or **"Don't use"**. The **same authorized Partner who generated it is the sole required reviewer**. Owner/Admin moderation may exist as an optional administrative override, not a mandatory second review. No auto-publishing, unrelated-session topic invention or bypass of attempt caps.
3. **Optional private note to DayO Operations** about a technical difficulty, awkward conversation issue or miscellaneous handoff, **never disclosed to the customer**. This is deliberately less formal than a complaint/safety report; it must NOT trigger refund, no-show, cancellation, technical-dispute workflow, settlement or disciplinary action automatically. Not writing it must not block finishing; a failed save preserves the note and must not corrupt the Letter or image outcome.

**Ordering/UI guidance:** all three capabilities should be clearly discoverable on Partner end screen and workable on mobile. Do **not** impose newly invented sequential blocking dependencies between image/note and Letter. The Partner's responsibility to consider and decide on an image is the intended experience; when generation is unavailable or fails, the Letter and session finish still work.

### Existing confirmed vs outstanding

- **VERIFIED in earlier authenticated TEST:** a real Partner Letter was sent via UI, exact DB text persisted, the learner could read it, and Partner navigation to Lounge succeeded. Released code baseline was \`d798330b229b35d17c4c339dd296c60225abeb66\`. Later \`main\` is a docs-only commit; prior UI release is preserved. **Physical device end-to-end remains OPEN.**
- **OPEN:** actual Partner image preview and **Send / Don't use** UI and exact customer read-back; actual partner-operated approval on the stored image; pending/other-account denial; reject/revoke; cleanup; mobile UI; actual new private operations note.
- **Existing DB functions NOT suitable for the optional note:** \`report_session_tech_issue\` is associated with time-bounded technical-issue/booking/refund review; \`add_booking_cs_note\` is Admin-only. Do **not** reuse either by weakening permissions. Recheck any recent notes implementation before proposing a narrowly authorized, private Partner-write/Admin-read route.

### Mobile acceptance

- At **360 / 390 / 430 px and 1280 px**, KO and EN, ensure controls are actually **visible, tappable, scrollable and clickable**, with safe viewport-area positions and correct behavior after the mobile keyboard appears. Long Partner Letters and image previews must not hide action buttons.
- Test timer, remote video, mic, camera, shared cards/Next Question, chat send, keyboard, session end, Letter save/retry, image chooser/preview/send/reject, note save/retry, dismiss/close and navigation. Include role isolation and slower network states. Do not call a screenshot-only test a function test.
- Preserve current production layout outside the actual identified defect; do not redesign whole site.

## 3. Locked Learner end-of-session Recap and quiz contract — Priority P0

Actual desired **customer** flow: end conversation → optional Partner feedback **FIRST** → one primary CTA **"피드백 보내고 리캡 시작"** (or localized equivalent) → Recap → grounded Word Quiz → My Page.

- Feedback choices are optional; no duplicate competing buttons, no Feedback overlay appearing after Recap is already shown, and no soft-lock if feedback save fails. Allow clear continue behavior with truthful status.
- Recap content priority: **Today's Stories**, **My Conversation Volume**, **Today's Word Quiz**, then genuine saved in-session chat where relevant. Story and "I said" quotations must come from authenticated Learner evidence only (never Partner speech, chat presented as spoken speech, or AI-invented facts).
- Do **not** revive unsolicited **save Talk Card/Recap card** CTAs in the immediate Recap. Keep in-room Talk Cards. Do not show nonexistent/empty Partner Letter placeholders or manual refresh buttons; show the real saved Letter in My Page when available.
- Quiz is an essential product promise. Target **2 questions per eligible word, 1–3 words (2/4/6 questions)**. Candidates require authentic learner speech or **permitted saved chat**, with correctly labeled chat vs speech; protect prior-session repetition rules and confidence criteria. Preserve truthful score/progress/replay, persistence, reload, and My Page retrieval.
- If source evidence truly cannot yield reliable words, show **a comprehensible explanation**, not a disappearing feature. Never fabricate words or mark Partner voice as learner evidence to force a quiz.
- **VERIFIED current DB, 2026-10-13:** 15 saved reports inspected; 12 had **0** persisted questions, 3 had 2 questions. This includes a recent TEST booking \`[Oct-12 TEST booking; look up ID in authorized QA records]\` with prior reported Learner speech/key expressions but 0 questions. **Cause remains OPEN**. Counts are a small sample, not population-level performance.
- **Earlier shipped code:** feedback-first single CTA and removal of premature Letter/card CTAs. Chromium synthetic-browser suite covered **24 KO/EN 360/390/1280 Letter + Feedback→Recap cases**; it passed in PR #3 CI. This **does not** establish actual mobile / authenticated physical-user full-path acceptance.
- Investigate the actual zero-candidate cause and UI behavior before adjusting thresholds; compare unchanged-base behavior and separately verify each candidate's provenance.

## 4. Cloudflare keepsake illustration — latest authoritative reconciliation

**CRITICAL CORRECTION:** older snapshots, previous assistant messages and some Work reports said migration **111 was prepared but not applied**. **Direct read-only Supabase verification on 2026-10-13 proves it IS ALREADY APPLIED.** Do NOT apply 111 again.

| Item | Current verified state / caution |
|---|---|
| Production migration ledger | \`107_keepsake_illustrations\` applied 2026-10-11; \`108_soniox_owner_pilot_allocations\`, \`109_keepsake_manual_review\`, \`110_keepsake_authenticated_metadata\`, and **\`111_keepsake_partner_review\` applied 2026-10-12**. Exact 111 ledger version: \`20261012175731\`. |
| Owner preview | Reported fixed by migration 110; independently verifying live visual usability remains a separate test. |
| Partner review rights | 111 ledger says applied. Do not infer Partner approval UI or E2E from presence of SQL. Function \`dayo_keepsake_review(p_action text, p_booking_id uuid, p_attempt_id uuid, p_sha256 text, p_object_path text, p_storage_version text, p_slot smallint)\` exists; inspect actual signature/auth rather than guessing API. |
| GitHub/source mismatch | \`supabase/migrations/111_keepsake_partner_review.sql\` was **NOT in \`main\`** on 2026-10-13. Previously reported local file: \`<local-user>/.codex/worktrees/keepsake-final/dayo/supabase/migrations/111_keepsake_partner_review.sql (Windows user home; do not guess exact path)\`. Confirm local worktree file exists and source corresponds to applied DB migration. Preserve; do not generate a competing 111 file or replay SQL. |
| Historic TEST image | Booking \`[Oct-10 keepsake TEST booking; look up ID in authorized QA records]\` (Oct 10): attempt 1 failed invalid image; **attempt 2 state=ready, review_state=pending, hash+Storage version exist**. Both attempts exhausted; **do not regenerate, reset or clean the pending asset without explicit authority**. |
| Enrollment | \`public.keepsake_beta_bookings\` has **0** rows as verified 2026-10-13. Do not imply the planned two beta customers are already enrolled. |
| Customer release | \`public/partner-report-contract.js\` in \`main\` still has \`illustrationAvailable:false\` (verified earlier this session). **Customer generation remains OFF**. Do not flip until Partner review and customer approved read-back actually pass and owner authorizes release. |
| Image design | Cloudflare watercolor image, no embedded lettering/watermarks, private exact-booking Storage, generation cap 2, bounded cost/cleanup, manual Partner send/reject; no obligatory Owner approval. Keep explicit customer's own sharing distinct from strangers accessing an unshared booking asset. |

**Next image-specific task after current priority is authorized:** use existing saved attempt 2; connect Partner preview + "Send this image" / "Don't use"; Partner authorized approve/reject; learner can access only approved image; unrelated user and pending states denied; revoke/cleanup; mobile real DOM screenshots; no additional generation. Do not couple image success to Letter send or reset quotas.

## 5. Speech, CC, Soniox and evidence safety — protected

- Current Production baseline: browser Web Speech / \`en-US\` recognizer for room STT, session transcript recording, and Partner-to-Learner English CC. Keep subtitles, toggle, ~8s expiration, two-line display, connection recovery, and correctly attributed participant channels. Never auto-replace with paid Soniox while testing.
- **Reported outstanding real-device bug:** Galaxy S23 / KakaoTalk in-app browser on Oct 11 showed missing captions. Separate browser test passing is not proof this device case is fixed. Use external Chrome as appropriate but don't falsely claim the issue is closed.
- **Soniox pilot:** Protected Preview, not Production. Reported branch \`codex/soniox-owner-pilot\`, code SHA \`b5193b6\`, Preview URL originally \`[protected Soniox Preview URL; retrieve from authorized prior Work result or Vercel]\`. It was tied to an Oct 12 TEST booking window; the old link may no longer permit capture. Revalidate any Preview URL against actual authorized booking and Vercel environment; do not claim real pilot success from READY status.
- **VERIFIED current Soniox DB, 2026-10-13:** two one-time allocations are **available and not reserved**, learner slot 1 and Partner slot 2. Do not consume, restart, refund or reset without an approved valid-time TEST plan and explicit user consent. Paid cap/pricing from old planning ($2 manual fund, no auto-topup; combined STT+image cost target approximately 500 KRW/session) are **historical configuration/targets to revalidate**, not authorization for spending.
- \`session_logs\`, \`session_reports\`, transcript identity/provenance, typed-chat persistence, word help and saved source versions are protected. Real Learner quoted speech must be Learner speech, not Partner audio or saved chat falsely attributed.

## 6. GitHub/CI and actual work status — verified 2026-10-13

**GitHub repository:** \`aliceleo2424/dayo\`.

| Subject | Verified state |
|---|---|
| \`main\` | SHA \`04f561805ee480f9867dc2438e95a1ea9831e30a\` at the last check. This is a **documentation-only guardrails merge** atop the previously verified Partner Letter release \`d798330b...\`. Recheck \`origin/main\` immediately before a new task; local worktrees may lag. |
| PR #2 | \`https://github.com/aliceleo2424/dayo/pull/2\` **MERGED**. Root \`AGENTS.md\`, \`CLAUDE.md\`, \`docs/DAYO_PRODUCT_CONTRACT.md\`, \`docs/DAYO_RELEASE_GATES.md\`, and dated snapshot were installed. Existing Korean rules were preserved. This does not enable branch protection. |
| PR #3 | \`https://github.com/aliceleo2424/dayo/pull/3\`, branch \`codex/dayo-ci-regression-20261013\`, head SHA \`6bde88b40b6cdedbe6332ffd197afc2ebd9fd3cf\`; **OPEN, NOT MERGED**. It adds a GitHub Actions workflow, strict PR scope checks, invariant checks, PR template and two localized fixture repairs. **No app code changed**. |
| PR #3 latest CI | Run \`38331058561\`, https://github.com/aliceleo2424/dayo/actions/runs/38331058561, **FAILED**. Scope & protected-file guard **PASS**; core fixtures **FAIL** for remaining old test assumptions; browser suite **FAIL** for actual desktop send-button viewport overflow. Do not mark green or merge just because some suites passed. |
| Specific physical layout defect | \`tests/mobile-room-ux-browser.cjs\` rendered customer KO desktop send button at right edge **1313.17px on 1280px viewport** (~33.17px off-screen). This is a real DOM finding, not yet fixed. Keep a separate scoped UI fix; don't change the test to hide it. |
| Browser passes | CI Chromium actual DOM: **24 cases** across Partner Letter and Customer Feedback→Recap (KO/EN, 360/390/1280) passed with synthetic transport; two-browser real PeerJS + synthetic captions also passed. Session timer, CC and STT regression fixtures passed. |
| Core fixture issues | Historical \`partner-report-finalize\` assumptions partially updated on PR #3 branch; other fixture failures surfaced, including obsolete topic-rule assertion, DOM mock mismatch, and historical comparison expectations. Separate true regressions from obsolete tests; test-only repairs must reflect the **current implementation**, never weaken requirements to hide product defects. |
| Enforcement | \`main\` branch reported **protected=false**; repository rulesets returned \`[]\` at last check. **No enforced required checks or verified Vercel production promotion block exists yet.** Actions YAML alone does NOT prevent direct main push or automatic Production deploy. |
| Other open PR | PR #1, Vercel React Server Components CVE-related, is unrelated. Do not merge, rebase or edit it as part of DayO guardrails without a separate assessment. |

### CI work still needed (separate task; not automatic permission to merge)

- Finish and honestly classify existing fixture failures on PR #3 and actual desktop chat send-button overflow. Do not alter app code inside a CI-only PR to manufacture a pass.
- Run complete cross-role UI suite and exact PR changed-file allowlist. Keep test dependencies pinned/reproducible; avoid gratuitous production dependency updates.
- Demonstrate an intentionally broken disposable **fixture-only** scenario fails the gate, then clean scenario passes, without changing customer code.
- Only after a fully green tested PR should CI workflow merge be requested/authorized. Then separately configure required status checks, branch protection and Vercel deploy gating via accounts with sufficient admin access, with explicit approval. Do not claim enforcement until verified.
- Separate PR #3 setup from mobile defect fix. Never silently enlarge PR file allowlist or circumvent it.

## 7. Current priority queue — CONTEXT, NOT A MULTI-TASK ORDER

**P0A — Partner mobile live room / completion.** All visible, functional Partner controls and after-session Letter/image/note at 360/390/430, KO/EN, with keyboard and errors. Preserve prior fixes. Split implementation into minimal related changes and separate security/migration approvals.

**P0B — Customer Feedback/Recap/Quiz.** Repair remaining interface/zero-question failures, compare actual unmodified baseline, preserve report provenance and single-CTA order, real authenticated flow to My Page. Separate commit/release from P0A when risk warrants.

**P0C — Existing keepsake attempt 2 and Partner send/reject.** Migration 111 is **already applied**, but exact Partner UI, approved customer display and edge-case tests are not completed. Avoid regeneration and any unrelated admin-approval redesign.

**P1 — CI release enforcement.** PR #3 remains blocked by real/reported failures; complete scoped correction and branch ruleset after approval.

**P1 — Soniox protected comparison.** Valuable for future STT accuracy, but not a reason to touch today's Production STT or burn the two reserved one-use slots.

**P1 — Optional private Partner→Operations note.** Desired as part of Partner experience but may require a small isolated permission/storage change. Avoid unrelated safety/refund workflows. If schema is needed, propose an exact migration for approval.

Choose **one P0 item** based on the latest direct request; do not implement the whole queue from this document.

## 8. Non-negotiable regression/verification obligations

1. Before any work, inspect relevant source and **existing dirty files** in the current worktree. Choose exact file/hunk allowlist. Existing dirty edits by user/other agents are inviolate. No \`git reset --hard\`, blanket staging, force push, destructive checkout/clean or unrelated formatting.
2. Root \`AGENTS.md\` / \`public/\` vs root mirrors must remain consistent. Don't remove dormant features, global functions or DOM IDs just because they appear unused.
3. **Behavioral acceptance** for touched controls: click/focus, visual bounding box, keyboard/scroll, KO/EN, User/Partner role, delayed network, error, lost acknowledgment, second tap, reload/persisted state. Screenshots at 360/390/430/1280. Test actual element and handler; a CSS/string assertion is not enough.
4. For room/CC affected work use existing \`tests/production-room-regressions.test.js\`, \`tests/mobile-room-ux-browser.cjs\`, \`tests/partner-captions-browser.test.cjs\`, \`tests/letter-post-session-browser.cjs\` as relevant. For Recap and quiz use \`tests/conversation-recap-fixtures.test.js\`, \`tests/room-recap-qa-fixtures.cjs\`, \`tests/quiz-novelty-fixtures.cjs\` plus the immediate feedback UI test. Don't re-audit every unrelated system each time.
5. **A failing test on untouched base is not a new regression** but still may be a product bug. Diagnose and report exactly; fix code in a separate approved scope, update stale tests only when demonstrated obsolete, never silence failures.
6. For server/DB/image: verify exact authentication, booking participant roles, source booking and image hash/version; record the actual persisted response and read-back, not only \`HTTP 200\` or Preview READY. No real writes or paid calls without scoped approval.
7. TEST bookings must not deduct a real customer's ticket, issue Partner rewards or corrupt real reports. Protect user data. Never leak credentials or private logs.
8. No claim of Production acceptance until actual deployed SHA and served assets, authenticated accounts and required real-device cases are checked. Clearly identify what was tested only synthetically.
9. Do not broaden an individual fix into a full UI redesign. Preserve typography/layout and existing labels unless essential to the requested issue. **No unrelated feature disappearance**.
10. Report small, precise diffs, exact tests, baseline comparisons, actual deployment state and one next decision rather than a long speculative audit.

## 9. Conflicts and unknowns — owner-first resolution policy

When you find contradictory statements, first recheck authoritative source and explain the discrepancy in plain Korean:

- **Applied SQL vs local migration file:** DB migration ledger and catalog prove 111 is already applied, but the SQL file may remain only in \`keepsake-final\` worktree. Preserve both states; confirm exact DDL correspondence without reapplying. Ask owner only if a *new* migration/retroactive source change decision is actually necessary.
- **"Admin approval" vs Partner approval:** explicit owner decision is **Partner sole required reviewer**. Older admin-only workflows and extra owner approval are superseded product proposals, not mandatory requirements.
- **"Image is a Partner responsibility" vs "image must never block Letter":** both are intentional. The Partner can choose/approve/reject where available; generation failure must not prevent Letter or session completion. Ask only if implementing a genuinely new required completion condition.
- **"5-minute follow-up" vs "quiz may have zero trustworthy words":** never invent answers. Fix excessive candidate rejection and provide truthful zero-evidence UX; if a new fallback pedagogy or mandatory minimum quiz needs a policy choice, ask owner before implementation.
- **"CI workflow exists" vs "CI enforced":** PR #3 contains a *draft workflow*, not merged and not backed by branch-protection/Vercel gates. Must keep the statuses separate.
- **"STT works in browser" vs "captions missing on Galaxy":** a synthetic browser pass does not override a real reported device failure. Reproduce and close with the same device conditions.
- **"Language options en/ko/es" vs historical French:** scope new-customer inventory/booking behavior only; don't delete historical French partner profiles or rows.
- **"Letter sent" vs UI text says sent:** DB read-back is required for claims; retry/unknown status must be safe.
- **Old dates, URLs, quotas, availability, pricing:** time-sensitive claims must be refreshed before action; stale TEST reservations and protected Preview links must not be treated as currently valid.

If an owner decision is genuinely required, stop the specific dangerous edit and ask, e.g.:

> "현재 운영 DB에는 111이 적용돼 있지만 GitHub에는 SQL 파일이 없습니다. 기존 파일을 기록용으로 저장소에 추가할까요? DB에 다시 적용하지는 않겠습니다."

Do not invent consent from silence. Ask only the minimum question to unblock that exact task; do not ask the owner to run mundane technical QA you can execute.

## 10. Direct Codex conversation protocol — no intermediary developer prompts

The owner may simply say (examples; **not blanket task orders**):
- "파트너 모바일에서 잘리는 버튼만 고치고, 다른 화면은 손대지 마. 실제 눌러서 확인해."
- "대화가 끝나면 파트너가 Letter, 그림, 운영팀 비공개 메모를 할 수 있게 해 줘. 구현 상태부터 확인해."
- "단어 퀴즈가 자꾸 사라지는 이유를 실제 저장 데이터로 확인하고 그 문제만 해결해."
- "CI PR #3이 실패하는 이유를 구분하고, 기능을 건드리지 말고 필요한 테스트 수정안만 제안해."

Codex must convert that natural language to a **short self-contained scope and acceptance plan**, verify relevant source only, then implement and check **within authorized scope**. Never require the owner to translate the above into an English engineering prompt. Do not force long forms or dozens of confirmation messages.

**Example compact final report:**
\`\`\`text
Outcome: PARTIAL
Changed: public/room.html and exact root mirror only
Preserved: CC, WebRTC, STT, Letter, booking/finances
Tests: browser KO/EN 360/390/430 PASS; real iPhone NOT TESTED
Production: NOT DEPLOYED
Remaining: Owner's iPhone live-room retest after Preview
\`\`\`

## 11. First-time reader's exact safe action

**Do this upon receiving the handoff, before any new change:**
1. Confirm the repository/worktree and whether its \`AGENTS.md\` and product contract match current \`origin/main\`; do not overwrite dirty work to sync.
2. Read this handoff and the relevant actual code; verify quickly only stale high-impact facts related to the owner's **next requested task** (especially migration 111 applied and CI PR #3 still open).
3. Tell the owner in Korean: "인수인계를 확인했습니다. 자연어로 바로 요청하셔도 됩니다. 기존 기능과 다른 작업은 보호하겠습니다." Add **at most one** material discrepancy requiring a decision, if any.
4. **Wait for a concrete requested task**. Do not auto-run the backlog or spend more tokens on unrelated deep research.

---
**Sources of truth checked for this snapshot:** GitHub \`main\` branch, PR #2/#3 and its last CI run; root agent/product/release-contract files; Supabase migration ledger, keepsake attempt/enrollment rows, Soniox allocation rows, \`session_reports\` quiz rows; previously recorded exact authenticated TEST acceptance. Unverified physical-device and Preview state is labeled as such.  
**Security:** No passwords, tokens, raw transcripts or sensitive personal information should be copied into this document.
