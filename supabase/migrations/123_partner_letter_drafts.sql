-- Owner decision 2026-10-20: AI Letter drafts for Partner review (draft -> Partner check/edit -> send).
-- Stores what the AI suggested and which User lines it cited, so the sent Letter (session_reports.partner_comment)
-- can be compared with the draft and the per-booking limit (first draft + one rewrite) is enforced server-side.
-- Written only by /api/conversation-recap with the service role. Partners can read their own drafts.
-- NOT applied automatically: apply separately after Owner approval. The feature works without it (drafts are not stored).

create table if not exists public.partner_letter_drafts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  partner_user_id uuid not null references auth.users(id) on delete cascade,
  attempt smallint not null check (attempt between 1 and 2),
  draft_text text not null check (char_length(draft_text) between 1 and 1200),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  model text not null check (char_length(model) <= 80),
  generator text not null check (char_length(generator) <= 80),
  source_version text not null check (char_length(source_version) <= 200),
  created_at timestamptz not null default now(),
  unique (booking_id, attempt)
);

create index if not exists partner_letter_drafts_partner_idx on public.partner_letter_drafts (partner_user_id, created_at desc);

alter table public.partner_letter_drafts enable row level security;

drop policy if exists partner_letter_drafts_partner_read on public.partner_letter_drafts;
create policy partner_letter_drafts_partner_read on public.partner_letter_drafts
  for select to authenticated
  using (partner_user_id = auth.uid());

-- No insert/update/delete policies: only the service role writes.
revoke insert, update, delete on public.partner_letter_drafts from anon, authenticated;
