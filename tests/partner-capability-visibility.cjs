/* Local PostgreSQL + actual booking filter regression. No production connection. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const ids = {
  partner: '11111111-1111-4111-8111-111111111111',
  existing: '22222222-2222-4222-8222-222222222222',
  learner: '33333333-3333-4333-8333-333333333333',
  admin: '44444444-4444-4444-8444-444444444444'
};

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
      create table public.profiles(id uuid primary key,role text,nickname text,email text);
      grant select on public.profiles to authenticated;
      create function public.dayo_is_admin() returns boolean language sql stable security definer as $$
        select exists(select 1 from public.profiles where id=auth.uid() and role='admin') $$;
      create table public.availability_slots(id uuid primary key default gen_random_uuid(),
        partner_id uuid not null,slot_time text not null,status text not null default 'available'
        constraint availability_slots_status_check check(status in ('available','booked')),
        created_at timestamptz default now(),updated_at timestamptz default now(),unique(partner_id,slot_time));
      create table public.bookings(id uuid primary key default gen_random_uuid(),
        slot_id uuid,partner_id uuid,status text,scheduled_at timestamptz);
      insert into auth.users select x::uuid from unnest(array['${ids.partner}','${ids.existing}','${ids.learner}','${ids.admin}']) x;
      insert into public.profiles values
        ('${ids.partner}','partner','New Partner',null),('${ids.existing}','partner','Existing Partner',null),
        ('${ids.learner}','user','Learner',null),('${ids.admin}','admin','Admin',null);
    `);
    await db.exec(read('supabase/migrations/070_partner_capabilities.sql'));
    await db.exec(read('supabase/migrations/084_partner_monthly_availability.sql'));
    async function as(who, sql) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[who]]);
      await db.exec('set role authenticated');
      return db.query(sql);
    }
    const hook = {};
    const window = { __DAYO_SMART_BOOKING_TEST__: hook };
    vm.runInNewContext(read('public/booking-modal.js'), {
      window, document: { readyState: 'loading', addEventListener() {} }, Date, console, setTimeout, clearTimeout
    });
    const api = hook.api;
    const dates = (await db.query(`select
      (clock_timestamp() at time zone 'Asia/Seoul')::date::text today,
      ((clock_timestamp() at time zone 'Asia/Seoul')::date+1)::text tomorrow,
      extract(isodow from (clock_timestamp() at time zone 'Asia/Seoul'))::int dow,
      to_char(clock_timestamp() at time zone 'Asia/Seoul','HH24:MI') time`)).rows[0];
    const day = ['mon','tue','wed','thu','fri','sat','sun'][dates.dow - 1];
    // A/D/E/F: weekly save creates future concrete rows, never past rows,
    // and replay keeps IDs and row counts stable.
    const template = JSON.stringify([{ dayId: day, time: '08:30' }, { dayId: day, time: '23:00' }]);
    await as('partner', `select save_partner_weekly_template('${template}')`);
    await db.exec('reset role');
    const before = (await db.query(`select id,slot_time,status from availability_slots
      where partner_id='${ids.partner}' and slot_time not like 'weekly:%' order by slot_time`)).rows;
    assert(before.length > 0, 'weekly save materializes concrete slots');
    assert.equal((await db.query(`select count(*)::int n from availability_slots
      where partner_id='${ids.partner}' and slot_time not like 'weekly:%'
      and availability_kst_start(slot_time)<=now()`)).rows[0].n, 0, 'no past concrete creation');
    if (dates.time < '23:00') assert(before.some(s => s.slot_time === dates.today + 'T23:00:00'), 'today future slot created');
    await as('partner', `select save_partner_weekly_template('${template}')`);
    await db.exec('reset role');
    assert.deepEqual((await db.query(`select id,slot_time,status from availability_slots
      where partner_id='${ids.partner}' and slot_time not like 'weekly:%' order by slot_time`)).rows, before);
    // B/C: booked and confirmed rows survive closing or reselecting a date.
    await as('partner', `select save_partner_availability_override('${dates.tomorrow}','custom',array['12:00','12:30'])`);
    await db.exec('reset role');
    const reserved = (await db.query(`select id,slot_time from availability_slots
      where partner_id='${ids.partner}' and slot_time like '${dates.tomorrow}%' order by slot_time`)).rows;
    for (const row of reserved) await db.query(`insert into bookings(slot_id,partner_id,status,scheduled_at)
      values($1,$2,'confirmed',availability_kst_start($3))`, [row.id, ids.partner, row.slot_time]);
    await db.query("update availability_slots set status='booked' where id=$1", [reserved[0].id]);
    await as('partner', `select save_partner_availability_override('${dates.tomorrow}','closed','{}')`);
    await as('partner', `select save_partner_availability_override('${dates.tomorrow}','custom',array['12:00','12:30'])`);
    await db.exec('reset role');
    assert.equal((await db.query('select status from availability_slots where id=$1', [reserved[0].id])).rows[0].status, 'booked');
    assert.equal((await db.query("select count(*)::int n from bookings where partner_id=$1 and status='confirmed'", [ids.partner])).rows[0].n, 2);
    const listedBefore = (await as('learner', `select get_booking_calendar_slots(array['${ids.partner}']::uuid[]) slots`)).rows[0].slots;
    assert(!listedBefore.some(s => reserved.some(r => r.id === s.id)), 'confirmed available-status row also excluded');
    // Reproduce production: real available rows do not imply verified language capability.
    let profiles = (await as('learner', 'select list_public_partner_profiles() profile')).rows.map(r => r.profile);
    const newPartner = profiles.find(p => p.id === ids.partner);
    assert(listedBefore.length > 0);
    assert.equal(api.partnerMatchesCriteria(newPartner, 'en', 'any'), false, 'missing capability excludes new partner');
    await assert.rejects(as('partner', `select admin_set_partner_capabilities('${ids.partner}',array['en'],'basic')`), /Admin access/);
    await as('admin', `select admin_set_partner_capabilities('${ids.existing}',array['en','fr'],'fluent')`);
    const existingBefore = (await as('learner', 'select list_public_partner_profiles() profile')).rows.find(r => r.profile.id === ids.existing).profile;
    await as('admin', `select admin_set_partner_capabilities('${ids.partner}',array['en'],'basic')`);
    // G/H: actual filters retain language/help requirements and include the new
    // partner at a real shared time without requiring a preference score.
    profiles = (await as('learner', 'select list_public_partner_profiles() profile')).rows.map(r => r.profile);
    const configured = profiles.find(p => p.id === ids.partner);
    assert.equal(api.partnerMatchesCriteria(configured, 'en', 'any'), true);
    assert.equal(api.partnerMatchesCriteria(configured, 'fr', 'any'), false);
    assert.equal(api.partnerMatchesCriteria(configured, 'en', 'needed'), false);
    assert.deepEqual(profiles.find(p => p.id === ids.existing), existingBefore, 'existing verified capability unchanged');
    const candidateSlots = (await as('learner', `select get_booking_calendar_slots(array['${ids.partner}']::uuid[]) slots`)).rows[0].slots;
    const slot = candidateSlots[0];
    const eligible = profiles.filter(p => api.partnerMatchesCriteria(p, 'en', 'any'));
    assert(api.partnersForTime(candidateSlots, eligible, api.slotStartKey(slot.slot_time)).some(p => p.id === ids.partner));
    await db.exec('reset role;set role anon');
    await assert.rejects(db.query('select list_public_partner_profiles()'), /permission denied/);
    console.log('PASS capability visibility: weekly/today future/past/idempotency; booked+confirmed preservation; missing capability reproduction; admin-only registration; language/help filters; new candidate and existing capability unchanged.');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
