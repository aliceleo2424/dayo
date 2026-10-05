# Guidebook leads retention and consent (local; not applied to production)

Migration: `supabase/migrations/088_speaking_guidebook_lead_consent.sql`.
The version was checked against origin/main and registered worktrees; only this worktree has 088.

- Required service consent and optional advertising consent are separate unchecked boxes.
- Existing rows are preserved. NULL source/false consent must never be treated as opt-in.
- `guidebook_sent_at`: first Resend-accepted send, not an inbox receipt guarantee. Failed sends leave it NULL. Idempotent retries preserve it.
- Non-marketing emails expire after 30 days from guidebook_sent_at. Requests never sent expire after 30 days from created_at to prevent indefinite failed-request retention.
- Marketing emails and consent records are retained until verified withdrawal or end of the marketing purpose. Repeated requests preserve the current consent timestamp; a new explicit opt-in after withdrawal starts a new consent period.
- `marketing_consented_at` supports future biennial consent notices; no notice scheduler or campaign sender is added here.

## Restricted operations

Only service_role may call these functions. No public email-existence endpoint is exposed. The unsubscribe API accepts only an opaque UUID v4 capability, never an email. Tokens stay in the URL fragment and are POSTed; unknown/used/deleted tokens have the same idempotent success response. Admins can read through the existing dayo_is_admin() RLS check; browser accounts cannot update consent or timestamps.

Campaign recipients MUST come from `public.guidebook_marketing_recipients()`; never use all leads or infer consent from existence of an email.

After verifying a withdrawal request through dayo.speak@gmail.com, call `public.withdraw_guidebook_marketing(email)`. It returns no email-existence result, disables advertising, records withdrawal, preserves consent time, and is idempotent. An unchecked repeat guidebook request is not withdrawal.

Run `public.purge_expired_guidebook_leads()` daily from an approved server/operator process. It deletes only expired non-consenting speaking_sense_guidebook rows and returns a count. It preserves legacy leads, unexpired service-purpose records and active opt-ins. 088 registers pg_cron job dayo-guidebook-leads-cleanup at 18:15 UTC daily (03:15 KST). Production dry-run before applying showed 0 candidates; existing six legacy leads are excluded.

If the marketing purpose ends, the operator must stop the campaign, set its consent flags false, and erase emails/records with no remaining service retention need. Retain only unexpired guidebook service-purpose records until their original 30-day deadline. Do not reset created_at or guidebook_sent_at. Deletion/collection-consent withdrawal requests with no other valid retention purpose must be handled individually by the server/operator.

## Production preflight (separate step)

1. Inspect current leads policies/grants and dayo_is_admin() before applying 088 alone. This changes access for ALL leads: anonymous insert-only; authenticated read only for admins; management server-only.
2. Re-run fixture and RLS tests against a safe staging environment.
3. Configure daily expiry cleanup and a verified withdrawal-request operating process before release.
4. Test actual Resend delivery and production pages; the local suite does not send real email.

The production release results are reported separately. Marketing recipients expose a server-only unsubscribe_url; every future campaign template must include that link. Guidebook delivery emails already include the link.

