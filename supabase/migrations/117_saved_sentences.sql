-- Owner request 2026-10-14: learners save sentences from the chat-style conversation record
-- (e.g. a partner's corrected sentence) and review them later in My Page. Own rows only.
create table if not exists public.saved_sentences(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 booking_id uuid references public.bookings(id) on delete set null,
 text text not null check (char_length(btrim(text)) between 1 and 1000),
 speaker text not null default 'partner' check (speaker in ('me','partner')),
 speaker_name text check (speaker_name is null or char_length(speaker_name) <= 60),
 spoken_at timestamptz,
 created_at timestamptz not null default now(),
 unique (user_id, booking_id, text)
);
create index if not exists saved_sentences_user_created on public.saved_sentences(user_id, created_at desc);
alter table public.saved_sentences enable row level security;
revoke all on public.saved_sentences from anon;
grant select, insert, delete on public.saved_sentences to authenticated;
drop policy if exists saved_sentences_select_own on public.saved_sentences;
drop policy if exists saved_sentences_insert_own on public.saved_sentences;
drop policy if exists saved_sentences_delete_own on public.saved_sentences;
create policy saved_sentences_select_own on public.saved_sentences for select to authenticated using (user_id = auth.uid());
create policy saved_sentences_insert_own on public.saved_sentences for insert to authenticated with check (
 user_id = auth.uid() and (booking_id is null or exists (select 1 from public.bookings b where b.id = booking_id and (b.learner_id = auth.uid() or b.partner_user_id = auth.uid()))));
create policy saved_sentences_delete_own on public.saved_sentences for delete to authenticated using (user_id = auth.uid());
