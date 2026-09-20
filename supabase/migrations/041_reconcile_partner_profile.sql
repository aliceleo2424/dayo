-- Reconcile the partner profile bio field expected by the DayO partner lounge.

alter table public.profiles
  add column if not exists bio text;
