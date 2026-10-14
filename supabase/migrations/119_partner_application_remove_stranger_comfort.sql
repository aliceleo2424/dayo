-- Owner request 2026-10-14: remove "How comfortable are you talking with a stranger?" from the partner application.
-- The column stays (history) but is no longer required; new applications leave it NULL (CHECK passes on NULL).
-- Score is now out of 5: video environment 2 + weekly capacity 2 + scenario answer >= 80 chars 1.
-- Status thresholds keep the same relative cut-offs (old: ready >= 6/7, review >= 3/7): ready >= 4, review >= 2.
-- partner_applications was empty in production when this was written.
begin;
alter table public.partner_applications alter column stranger_conversation_comfort drop not null;
create or replace function public.triage_partner_application() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.email := lower(trim(new.email));
  new.created_at := now();
  new.submitted_at := now();
  new.review_score :=
    case when new.video_environment = 'yes' then 2 else 0 end +
    case when new.weekly_session_capacity in ('3-5','6-10','10+') then 2 else 0 end +
    case when length(trim(new.scenario_answer)) >= 80 then 1 else 0 end;
  new.review_status := case when new.review_score >= 4 then 'ready' when new.review_score >= 2 then 'review' else 'hold' end;
  new.review_note := '';
  new.reviewed_at := null;
  new.test_status := 'not_invited';
  new.final_status := 'pending';
  return new;
end;
$$;
commit;
