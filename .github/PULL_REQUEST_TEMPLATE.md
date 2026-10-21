## Requested user-visible outcome
State the exact behavior to deliver.

## Exact file scope (CI checks every changed path)
<!-- DAYO_SCOPE_START -->
<!-- Replace these comments with the exact changed file paths, one per line. -->
<!-- DAYO_SCOPE_END -->

## Neighboring product behavior to preserve
Name only features relevant to the change (CC, Letter, video, STT, booking, Recap, quiz).

## Verification
- [ ] The exact changed paths match the declared list; unrelated dirty files preserved.
- [ ] Relevant core/browser tests and real rendered mobile screenshots PASS.
- [ ] KO/EN, roles, tap/scroll/keyboard and failure paths checked where relevant.
- [ ] No live database write, paid API use or Production deploy without exact approval.
- [ ] Any physical-device or authenticated E2E gap is reported as OPEN.

## Owner approval
List any separate authorization for a database migration, paid provider, security permission change or Production deployment.

> Changes under api/, supabase/migrations/, vercel.json or release/deploy
> workflows require an owner-reviewed dayo-owner-approved-sensitive label.
