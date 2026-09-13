-- Speaking sense test history on profiles
alter table public.profiles
  add column if not exists speaking_level text,
  add column if not exists last_test_score integer,
  add column if not exists last_test_date timestamptz;
