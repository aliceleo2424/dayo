const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const contract = require('./fixtures/internal-test-learner-production-contract.json');
const migration = read('supabase/migrations/079_internal_test_learner_lead_time.sql');
const testId = '85d0f35c-2af3-4170-8cbe-5d40a7706d25';
const jenId = '1bc0eab5-9399-4da8-a90c-145ab0c4409d';
const oldId = '131a43d2-8a90-41bb-a17a-2217b1ef283f';
const ordinaryId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function frontend() {
  const window = { _dayoAuthUser: { id: testId }, _dayoAuthProfile: { role: 'user' } };
  const client = read('public/supabase-client.js');
  vm.runInNewContext(client.slice(client.indexOf('  var PREOPEN_BOOKING_TEST_USERS'), client.indexOf('  function normalizeRpcPayload')), { window });
  const hook = {};
  window.__DAYO_SMART_BOOKING_TEST__ = hook;
  const now = Date.now();
  class FixedDate extends Date { static now() { return now; } }
  const context = { window, document: { readyState: 'loading', addEventListener() {} }, Date: FixedDate, console, setTimeout, clearTimeout };
  vm.runInNewContext(read('public/booking-modal.js'), context);
  // The shared slot window is exported before the rest of the DOM initialization.
  const slots = read('public/availability-slots.js');
  vm.runInNewContext(slots.slice(0, slots.indexOf('  function displayLocale()')) + '\n})();', context);
  for (const [id, bypass, internal] of [[testId, true, false], [jenId, true, true], [oldId, true, true], [ordinaryId, false, false]]) {
    window._dayoAuthUser.id = id;
    assert.equal(window.DayOPreopenBooking.canBypassLeadTime(), bypass);
    assert.equal(window.DayOPreopenBooking.isInternalTest(), internal);
    assert.equal(hook.api.isBookableStart(now + 3600000), bypass);
    assert.equal(window.DayOBookingWindow.isBookableStart(now + 3600000, now), bypass);
    assert.equal(hook.api.requiresNoRefundWarning(now + 3600000), !internal);
    assert.equal(hook.api.isBookableStart(now + 5 * 3600000), true);
    assert.equal(hook.api.isBookableStart(now - 3600000), false);
    assert.equal(hook.api.isFutureThirtyMinuteConcreteSlot({ slot_time: 'weekly:mon|15:00' }), false);
  }
  window._dayoAuthUser.id = ordinaryId;
  assert.equal(window.DayOPreopenBooking.canBypassLeadTime(testId), false, 'Cannot spoof the authenticated test identity');
  for (const name of ['supabase-client.js', 'booking-modal.js', 'availability-slots.js']) {
    assert.equal(read(name).replace(/\r\n/g, '\n'), read(`public/${name}`).replace(/\r\n/g, '\n'), `${name} mirror`);
    new vm.Script(read(name));
  }
}

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    create table public.profiles(id uuid primary key, role varchar, ticket_count integer default 0, point_balance integer default 0, updated_at timestamptz);
    create table public.availability_slots(id uuid primary key, partner_id uuid, status text default 'available', slot_time text, updated_at timestamptz);
    create table public.bookings(id uuid primary key, learner_id uuid, partner_id uuid, partner_user_id uuid, slot_id uuid,
      status text default 'pending', ticket_deducted boolean default false, ticket_refunded boolean default false,
      partner_rewarded boolean default false, scheduled_at timestamptz, ended_at timestamptz, completed_at timestamptz,
      end_reason text, rating integer, updated_at timestamptz);
    create table public.ticket_lots(id uuid primary key, user_id uuid, quantity_remaining integer, quantity_issued integer,
      expires_at timestamptz, issued_at timestamptz default now(), updated_at timestamptz);
    create table public.ticket_allocations(id uuid primary key default gen_random_uuid(), booking_id uuid unique,
      ticket_lot_id uuid, quantity integer, refunded_at timestamptz, refund_reason text);
    create table public.ticket_consumption_pre_cutover_bookings(booking_id uuid primary key);
    create function public.refresh_ticket_balance_cache(p_user_id uuid) returns integer language plpgsql as $$
      declare n integer; begin select coalesce(sum(quantity_remaining),0)::integer into n from public.ticket_lots
      where user_id=p_user_id and (expires_at is null or expires_at>now());
      update public.profiles set ticket_count=n where id=p_user_id; return n; end $$;
    grant usage on schema public,auth to authenticated; grant select on public.profiles to authenticated;
    grant select,insert on public.bookings to authenticated;
  `);
  const functions = [...contract.functions].sort((a, b) => Number(b.signature === 'dayo_is_admin()') - Number(a.signature === 'dayo_is_admin()'));
  for (const f of functions) {
    await db.exec(f.definition);
    await db.exec(`revoke all on function public.${f.signature} from public,anon,authenticated,service_role;`);
    const grantees = [...f.acl.matchAll(/(?:\{|,)([^=]+)=X\//g)].map((m) => m[1]);
    for (const role of grantees) await db.exec(`grant execute on function public.${f.signature} to ${role};`);
  }
  for (const p of contract.policies) {
    await db.exec(`create policy "${p.policyname}" on public.bookings for ${p.cmd} to ${p.roles.join(',')}` +
      (p.qual ? ` using (${p.qual})` : '') + (p.with_check ? ` with check (${p.with_check})` : '') + ';');
  }
  await db.exec('alter table public.bookings enable row level security;');
  for (const t of contract.triggers) await db.exec(t.definition);
  await db.query('insert into auth.users values ($1,$2,now())', [testId, 'aliceleo2424+test@gmail.com']);
  for (const id of [testId, jenId, oldId, ordinaryId]) await db.query('insert into profiles(id,role) values ($1,$2)', [id, id === jenId ? 'partner' : 'user']);
  const before = (await db.query("select oid::regprocedure::text signature, pg_get_functiondef(oid) definition, proacl::text acl, proowner, prosecdef, proconfig, provolatile from pg_proc where pronamespace='public'::regnamespace")).rows;
  // The migration must work against exact production definitions, not rewritten fixture functions.
  for (const f of contract.functions) {
    const actual = (await db.query('select pg_get_functiondef($1::regprocedure) definition', [`public.${f.signature}`])).rows[0].definition;
    assert.equal(actual, f.definition, `Exact compatibility: ${f.signature}`);
  }
  // Identity mismatch must abort before creating the helper or changing a cutoff function.
  await db.query('update auth.users set email_confirmed_at=null where id=$1', [testId]);
  await assert.rejects(db.exec(migration), /identity does not match/);
  await db.exec('rollback;');
  assert.equal((await db.query("select to_regprocedure('public.dayo_can_bypass_booking_lead_time()') helper")).rows[0].helper, null);
  await db.query('update auth.users set email_confirmed_at=now() where id=$1', [testId]);
  const adminDefinition = contract.functions.find((f) => f.signature === 'dayo_is_admin()').definition;
  await db.exec(adminDefinition.replace("role = 'admin'", "role = 'changed'"));
  await assert.rejects(db.exec(migration), /Production booking contract changed: dayo_is_admin/);
  await db.exec('rollback;');
  await db.exec(adminDefinition);
  await db.exec(migration);
  for (const f of before) {
    const actual = (await db.query('select pg_get_functiondef($1::regprocedure) definition, proacl::text acl, proowner, prosecdef, proconfig, provolatile from pg_proc where oid=$1::regprocedure', [f.signature])).rows[0];
    const expected = { ...f }; delete expected.signature;
    if (/^(enforce_booking_four_hour_minimum|confirm_booking_with_cutoff_cleanup)\(/.test(f.signature)) {
      expected.definition = expected.definition.replace('public.dayo_can_create_preopen_booking()', 'public.dayo_can_bypass_booking_lead_time()');
    }
    assert.deepEqual(actual, expected, `No unrelated SQL/ACL change: ${f.signature}`);
  }
  async function actor(id) {
    await db.exec('set session authorization postgres;');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)", [id]);
    await db.exec('set session authorization authenticated;');
  }
  async function seed(id, hours, n, quantity = 1) {
    await db.exec('set session authorization postgres;');
    await db.query("insert into availability_slots(id,partner_id,slot_time) values ($1,$2,(now()+make_interval(hours=>$3))::text)", [uid(n), jenId, hours]);
    if (quantity) await db.query('insert into ticket_lots(id,user_id,quantity_remaining,quantity_issued) values ($1,$2,$3,$3)', [uid(n + 1000), id, quantity]);
    await actor(id);
    return uid(n);
  }
  await db.exec('set session authorization anon;');
  await assert.rejects(db.query('select public.dayo_can_bypass_booking_lead_time()'), /permission denied/);
  await db.exec('set session authorization postgres;');
  async function pending(id, slot, n) {
    await actor(id);
    await db.query('insert into bookings(id,learner_id,partner_id,partner_user_id,slot_id) values ($1,$2,$3,$3,$4)', [uid(n + 2000), id, jenId, slot]);
    return uid(n + 2000);
  }
  async function confirm(id, booking) {
    await actor(id);
    return (await db.query('select public.confirm_booking_with_cutoff_cleanup($1,$2) result', [id, booking])).rows[0].result;
  }
  for (const [id, bypass, legacy] of [[testId, true, false], [ordinaryId, false, false], [jenId, true, true], [oldId, true, true]]) {
    await actor(id);
    const r = (await db.query('select session_user,public.dayo_can_bypass_booking_lead_time() bypass,public.dayo_can_create_preopen_booking() legacy')).rows[0];
    assert.equal(r.session_user, 'authenticated', 'Cannot silently bypass via postgres session_user');
    assert.equal(r.bypass, bypass); assert.equal(r.legacy, legacy);
  }
  // A ordinary learner cannot create a <4h booking.
  let slot = await seed(ordinaryId, 1, 1);
  await assert.rejects(pending(ordinaryId, slot, 1), /at least four hours/);
  // B test learner must consume and allocate a real ticket and reserve a concrete slot.
  slot = await seed(testId, 1, 2);
  const booking = await pending(testId, slot, 2);
  assert.equal((await confirm(testId, booking)).success, true);
  assert.equal((await confirm(testId, booking)).success, true, 'Idempotent retry');
  await db.exec('set session authorization postgres;');
  assert.equal((await db.query('select quantity_remaining from ticket_lots where id=$1', [uid(1002)])).rows[0].quantity_remaining, 0);
  assert.equal((await db.query('select count(*)::int n from ticket_allocations where booking_id=$1', [booking])).rows[0].n, 1);
  assert.equal((await db.query('select status from availability_slots where id=$1', [slot])).rows[0].status, 'booked');
  // C no ticket entitlement, despite a concrete slot and the lead-time exception.
  slot = await seed(testId, 1, 3, 0);
  assert.equal((await confirm(testId, await pending(testId, slot, 3))).success, false);
  // D missing slot and recurring template must still be rejected.
  await assert.rejects(pending(testId, null, 4), /concrete booking slot/);
  await db.exec('set session authorization postgres;');
  await db.query("insert into availability_slots(id,partner_id,slot_time) values ($1,$2,'weekly:mon|15:00')", [uid(5), jenId]);
  await assert.rejects(pending(testId, uid(5), 5), /concrete booking slot/);
  // E ordinary >4h works normally with ticket consumption.
  slot = await seed(ordinaryId, 7, 6);
  const normalBooking = await pending(ordinaryId, slot, 6);
  assert.equal((await confirm(ordinaryId, normalBooking)).success, true);
  // F legacy internal learner remains eligible, including the original Jen helper identity.
  slot = await seed(oldId, 1, 7);
  assert.equal((await confirm(oldId, await pending(oldId, slot, 7))).success, true);
  // Same concrete slot cannot be allocated twice; loser retains its ticket.
  slot = await seed(testId, 1, 8);
  const first = await pending(testId, slot, 8);
  const second = await pending(testId, slot, 9);
  assert.equal((await confirm(testId, first)).success, true);
  assert.equal((await confirm(testId, second)).success, false);
  // Cancellation/refund actual production function: new learner receives no late refund.
  await actor(testId);
  const late = (await db.query('select public.cancel_my_booking($1) result', [booking])).rows[0].result;
  assert.equal(late.ticket_refunded, false); assert.equal(late.cancellation_type, 'late');
  await actor(ordinaryId);
  const early = (await db.query('select public.cancel_my_booking($1) result', [normalBooking])).rows[0].result;
  assert.equal(early.ticket_refunded, true); assert.equal(early.cancellation_type, 'early');
  await db.close();
}

(async () => {
  frontend();
  await database();
  console.log('Lead-time learner fixtures passed: exact production compatibility, A-F, isolated allowlist, ticket/allocation/slot guards, idempotency, cancellation/refund, mirrors.');
})().catch((error) => { console.error(error.message, error.query, error.where); process.exit(1); });
