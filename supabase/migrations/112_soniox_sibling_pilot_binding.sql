-- Authorized Oct 13 sibling pilot: rebind ONE unconsumed learner slot.
-- No new slots, resets, credentials, booking/profile/report or financial writes.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
lock table public.soniox_owner_pilot_allocations in access exclusive mode;
do $preflight$ begin
 if (select count(*) from public.soniox_owner_pilot_allocations)<>2 or
    not exists(select 1 from public.soniox_owner_pilot_allocations where slot=1 and owner_id='85d0f35c-2af3-4170-8cbe-5d40a7706d25' and participant_role='learner' and state='available') or
    not exists(select 1 from public.soniox_owner_pilot_allocations where slot=2 and owner_id='1bc0eab5-9399-4da8-a90c-145ab0c4409d' and participant_role='partner' and state='available') then
  raise exception 'Expected exactly two untouched pilot slots; never reset or replay';
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.soniox_owner_pilot_allocations'::regclass and conname='soniox_owner_pilot_allocations_check' and md5(pg_get_constraintdef(oid))='ed6cba71ee791b0c50807bdb4f4b4f30') then
  raise exception 'Pilot identity constraint drift';
 end if;
 if not exists(select 1 from public.bookings b join public.profiles u on u.id=b.learner_id join public.profiles p on p.id=b.partner_user_id
  where b.id='cfb91da5-991b-48d9-b86f-a7e912cb8ed4' and b.learner_id='c4552202-cafd-4ab5-bbf9-5a23719edf44' and b.partner_user_id='1bc0eab5-9399-4da8-a90c-145ab0c4409d' and b.scheduled_at='2026-10-13T03:00:00Z'::timestamptz and b.status='confirmed' and b.is_test_session=false and u.role in ('user','learner') and p.role='partner') then
  raise exception 'Authorized noon booking/participant preflight mismatch';
 end if;
end $preflight$;
alter table public.soniox_owner_pilot_allocations drop constraint soniox_owner_pilot_allocations_check;
update public.soniox_owner_pilot_allocations set owner_id='c4552202-cafd-4ab5-bbf9-5a23719edf44' where slot=1 and owner_id='85d0f35c-2af3-4170-8cbe-5d40a7706d25' and state='available';
alter table public.soniox_owner_pilot_allocations add constraint soniox_owner_pilot_allocations_check check
 ((slot=1 and owner_id='c4552202-cafd-4ab5-bbf9-5a23719edf44' and participant_role='learner') or
  (slot=2 and owner_id='1bc0eab5-9399-4da8-a90c-145ab0c4409d' and participant_role='partner'));
commit;
