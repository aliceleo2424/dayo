'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const { createHandler } = require('../api/booking-notifications');
const { dispatch, sendResend, kstTime, displayName } = require('../api/_lib/booking-notifications');
// Read the parallel Work's audited contract; never rewrite its fixture or RPCs.
const contract = require('./fixtures/internal-test-learner-production-contract.json');
const sql = fs.readFileSync(path.join(__dirname, '../supabase/proposals/booking_notifications.sql'), 'utf8');
const learner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const partner = '1bc0eab5-9399-4da8-a90c-145ab0c4409d';
const outsider = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const internal = '131a43d2-8a90-41bb-a17a-2217b1ef283f';
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const config = { url: 'https://fixture.supabase.test', anonKey: 'fixture-anon', serviceKey: 'fixture-service', resendKey: 'fixture-provider' };
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks += 1; }

async function frontend() {
  const source = fs.readFileSync(path.join(__dirname, '../public/supabase-client.js'), 'utf8');
  const dashboard = fs.readFileSync(path.join(__dirname, '../public/mypage-dashboard.js'), 'utf8');
  const calls = [];
  let rpcResult = { data: { success: false }, error: null };
  const storage = { setItem() {}, getItem() { return null; }, removeItem() {} };
  const window = { localStorage: storage, confirm: () => true, alert() {}, supabaseClient: {
    rpc: async () => rpcResult,
    auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-session' } } }) }
  } };
  const context = { window, localStorage: storage, console: { log() {}, warn() {}, error() {} }, alert() {},
    getRpcClient: () => window.supabaseClient, readLocalNextSession: () => null, loadUrgentSessionBanner: async () => {},
    fetch: async (url, options) => { calls.push({ url, options }); throw new Error('fixture network failure'); } };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  function normalizeRpcPayload'), source.indexOf('  window.handleCompleteSession')), context);
  const id = uid(9999);
  check(await window.handleConfirmBooking(learner, id) === false && calls.length === 0, 'Real confirmation frontend does not notify on RPC failure');
  rpcResult = { data: { success: true, remaining_tickets: 0 }, error: null };
  check(await window.handleConfirmBooking(learner, id) === true, 'Real confirmation frontend stays successful when notification transport fails');
  await new Promise(setImmediate);
  check(calls.length === 1 && JSON.parse(calls[0].options.body).event === 'booking_confirmed', 'Real confirmation hook dispatches only after committed success');
  check(calls[0].options.keepalive && calls[0].options.headers.Authorization === 'Bearer fixture-session', 'Hook uses session token and survives normal navigation');
  check(Object.keys(JSON.parse(calls[0].options.body)).sort().join(',') === 'bookingId,event', 'Frontend never sends recipient addresses or cancellation flags');
  vm.runInContext(dashboard.slice(dashboard.indexOf('  var cancellationPending'), dashboard.indexOf('  function renderAdditionalBookingList')), context);
  const button = { disabled: false };
  rpcResult = { data: { success: false }, error: null };
  await context.cancelUpcomingBooking(id, new Date(Date.now() + 8 * 3600000).toISOString(), learner, button);
  await new Promise(setImmediate);
  check(calls.length === 1, 'Real cancellation frontend does not notify on RPC failure');
  rpcResult = { data: { success: true, cancellation_type: 'early' }, error: null };
  await context.cancelUpcomingBooking(id, new Date(Date.now() + 8 * 3600000).toISOString(), learner, button);
  await new Promise(setImmediate);
  check(calls.length === 2 && JSON.parse(calls[1].options.body).event === 'booking_cancelled' && button.disabled === false,
    'Real cancellation frontend remains successful and usable when notification transport fails');
  for (const file of ['supabase-client.js', 'mypage-dashboard.js']) {
    check(fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n') ===
      fs.readFileSync(path.join(__dirname, '../public', file), 'utf8').replace(/\r\n/g, '\n'), file + ' canonical/root mirror');
  }
}

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
      create table profiles(id uuid primary key, role varchar, nickname text, ticket_count integer default 0, point_balance integer default 0, updated_at timestamptz);
      create table availability_slots(id uuid primary key, partner_id uuid, status text default 'available', slot_time text, updated_at timestamptz);
      create table bookings(id uuid primary key, learner_id uuid, partner_id uuid, partner_user_id uuid, slot_id uuid,
        status text default 'pending', ticket_deducted boolean default false, ticket_refunded boolean default false,
        partner_rewarded boolean default false, scheduled_at timestamptz, language text, ended_at timestamptz,
        completed_at timestamptz, end_reason text, rating integer, updated_at timestamptz);
      create table ticket_lots(id uuid primary key, user_id uuid, quantity_remaining integer, quantity_issued integer,
        expires_at timestamptz, issued_at timestamptz default now(), updated_at timestamptz);
      create table ticket_allocations(id uuid primary key default gen_random_uuid(), booking_id uuid unique,
        ticket_lot_id uuid, quantity integer, refunded_at timestamptz, refund_reason text);
      create table ticket_consumption_pre_cutover_bookings(booking_id uuid primary key);
      create function refresh_ticket_balance_cache(p_user_id uuid) returns integer language plpgsql as $$
        declare n integer; begin select coalesce(sum(quantity_remaining),0)::integer into n from public.ticket_lots
        where user_id=p_user_id and (expires_at is null or expires_at>now());
        update public.profiles set ticket_count=n where id=p_user_id; return n; end $$;
      grant usage on schema public,auth to authenticated,service_role;
      grant select on profiles,bookings,auth.users to service_role;
      grant select on profiles,bookings to authenticated;
      grant insert on bookings to authenticated;
    `);
    for (const f of [...contract.functions].sort((a, b) => Number(b.signature === 'dayo_is_admin()') - Number(a.signature === 'dayo_is_admin()'))) {
      await db.exec(f.definition);
      await db.exec(`revoke all on function public.${f.signature} from public, anon, authenticated, service_role;`);
      await db.exec(`grant execute on function public.${f.signature} to authenticated;`);
    }
    for (const p of contract.policies) await db.exec(`create policy "${p.policyname}" on bookings for ${p.cmd} to ${p.roles.join(',')}` +
      (p.qual ? ` using (${p.qual})` : '') + (p.with_check ? ` with check (${p.with_check})` : '') + ';');
    await db.exec('alter table bookings enable row level security;');
    for (const t of contract.triggers) await db.exec(t.definition);
    for (const [id, email, role, nickname] of [
      [learner, 'user@fixture.test', 'user', 'Private User Name'],
      [partner, 'partner@fixture.test', 'partner', 'Jen <b>'],
      [outsider, 'outsider@fixture.test', 'user', 'Outsider'],
      [internal, 'internal@fixture.test', 'user', 'Internal']
    ]) {
      await db.query('insert into auth.users values($1,$2,now())', [id, email]);
      await db.query('insert into profiles(id,role,nickname) values($1,$2,$3)', [id, role, nickname]);
    }
    const rpcBefore = (await db.query("select oid::regprocedure::text signature, pg_get_functiondef(oid) definition, proacl::text acl from pg_proc where pronamespace='public'::regnamespace")).rows;
    await db.exec(sql);
    for (const f of rpcBefore) {
      const current = (await db.query('select pg_get_functiondef(oid) definition, proacl::text acl from pg_proc where oid=$1::regprocedure', [f.signature])).rows[0];
      assert.deepEqual(current, { definition: f.definition, acl: f.acl }, 'Booking RPC/ACL unchanged: ' + f.signature);
    }
    check(true, 'New proposal preserves every existing RPC and its permissions');

    async function owner() { await db.exec('set session authorization postgres; reset role;'); }
    async function actor(id, role = 'authenticated') {
      await owner();
      await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role',$2,false)", [id, role]);
      await db.exec('set session authorization ' + role + ';');
    }
    let sequence = 100;
    async function booking(hours = 8, tickets = 1, user = learner) {
      await owner();
      const n = sequence++;
      const id = uid(n), slot = uid(n + 1000), lot = uid(n + 2000);
      await db.query("insert into availability_slots(id,partner_id,slot_time) values($1,$2,(now()+($3::text || ' hours')::interval)::text)", [slot, partner, hours]);
      if (tickets) await db.query("insert into ticket_lots(id,user_id,quantity_remaining,quantity_issued,expires_at) values($1,$2,$3,$3,now()+interval '1 day')", [lot, user, tickets]);
      await actor(user);
      await db.query("insert into bookings(id,learner_id,partner_id,partner_user_id,slot_id,language) values($1,$2,$3,$3,$4,'en')", [id, user, partner, slot]);
      return { id, slot, lot, user };
    }
    async function confirm(b) {
      await actor(b.user);
      return (await db.query('select confirm_booking_with_cutoff_cleanup($1,$2) result', [b.user, b.id])).rows[0].result;
    }
    async function cancel(b) {
      await actor(b.user);
      return (await db.query('select cancel_my_booking($1) result', [b.id])).rows[0].result;
    }
    async function logs(id) {
      await owner();
      return (await db.query('select * from booking_notification_log where booking_id=$1 order by event_key', [id])).rows;
    }
    async function state(id) {
      await owner();
      return (await db.query('select * from bookings where id=$1', [id])).rows[0];
    }
    // Small PostgREST adapter exercises the real SQL claim and conditional updates.
    const userLookups = [];
    const service = {
      auth: { admin: { async getUserById(id) {
        userLookups.push(id);
        const user = (await db.query('select * from auth.users where id=$1', [id])).rows[0];
        return { data: { user }, error: null };
      } } },
      async rpc(name, params) {
        assert.equal(name, 'claim_booking_notification');
        try {
          return { data: (await db.query('select * from claim_booking_notification($1,$2)', [params.p_booking_id, params.p_event_type])).rows, error: null };
        } catch (error) { return { data: null, error }; }
      },
      from(table) {
        assert.ok(['bookings', 'profiles', 'booking_notification_log'].includes(table));
        const filters = [], values = [];
        let columns = '*', updates;
        return {
          select(value) { columns = value; return this; },
          update(value) { updates = value; return this; },
          eq(key, value) { filters.push([key, value]); return this; },
          async maybeSingle() {
            const ident = value => { assert.match(value, /^[a-z_]+$/); return '"' + value + '"'; };
            let query;
            const selected = columns.split(',').map(ident).join(',');
            if (updates) {
              const set = Object.entries(updates).map(([key, value]) => { values.push(value); return ident(key) + '=$' + values.length; }).join(',');
              query = 'update ' + ident(table) + ' set ' + set;
            } else query = 'select ' + selected + ' from ' + ident(table);
            query += ' where ' + filters.map(([key, value]) => { values.push(value); return ident(key) + '=$' + values.length; }).join(' and ');
            if (updates) query += ' returning ' + selected;
            try { return { data: (await db.query(query, values)).rows[0] || null, error: null }; }
            catch (error) { return { data: null, error }; }
          }
        };
      }
    };
    const provider = new Map();
    const requests = [];
    let providerMode = 'success';
    const fetchProvider = async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(options.headers.Authorization, 'Bearer fixture-provider');
      const key = options.headers['Idempotency-Key'];
      const payload = JSON.parse(options.body);
      requests.push({ key, payload });
      if (providerMode === 'reject') return { ok: false, status: 503 };
      if (!provider.has(key)) provider.set(key, { payload: options.body, id: 'provider-' + provider.size });
      assert.equal(provider.get(key).payload, options.body, 'Payload stays identical for provider idempotency');
      if (providerMode === 'accepted_unknown') throw new Error('Connection lost after provider acceptance');
      return { ok: true, json: async () => ({ id: provider.get(key).id }) };
    };
    const deliver = async (b, event = 'booking_confirmed', opts = {}) => {
      await owner();
      await db.exec('set role service_role;');
      return dispatch(service, config, { bookingId: b.id, eventType: event }, { fetch: fetchProvider, ...opts });
    };
    const invoke = async (b, user = learner, event = 'booking_confirmed', extra = {}, token) => {
      await owner();
      await db.exec('set role service_role;');
      const handler = createHandler({ config, clients: () => ({ service, auth: { auth: { getUser: async () => ({ data: { user: user ? { id: user } : null }, error: null }) } } }),
        dispatch: (svc, cfg, scope) => dispatch(svc, cfg, scope, { fetch: fetchProvider }) });
      const res = { statusCode: 0, setHeader() {}, end(value) { this.body = JSON.parse(value); } };
      await handler({ method: 'POST', headers: { authorization: token || 'Bearer fixture-user' }, body: { bookingId: b.id, event, ...extra } }, res);
      return res;
    };

    // A: real slot -> pending -> allocation/deduction -> confirmed -> two emails.
    const a = await booking();
    check((await logs(a.id)).length === 0, 'Pending insert sends no mail');
    check((await confirm(a)).success === true, 'Actual confirmation RPC succeeds');
    check((await state(a.id)).ticket_deducted === true, 'Ticket deduction committed before delivery');
    await owner();
    check((await db.query('select count(*)::int n from ticket_allocations where booking_id=$1', [a.id])).rows[0].n === 1, 'One actual ticket allocation');
    const aResult = await invoke(a);
    check(aResult.statusCode === 202 && aResult.body.sent === 2, 'Partner and User each notified once');
    const aLogs = await logs(a.id);
    check(aLogs.length === 2 && aLogs.every(row => row.status === 'sent'), 'Both successes durably recorded');
    check(requests.filter(r => r.key.includes(a.id)).every(r => r.payload.to.length === 1), 'Separate envelopes for each participant');

    // B/C: insufficient tickets / invalid slot / idempotent confirmation.
    const b = await booking(8, 0, outsider);
    check((await confirm(b)).success === false, 'Actual confirmation with no tickets fails');
    check((await logs(b.id)).length === 0, 'Failed booking produces no events');
    check((await invoke(b, outsider)).statusCode === 409, 'Endpoint cannot send an uncommitted confirmation');
    await assert.rejects(booking(2, 0, outsider), /four hours/i);
    check(true, 'Concrete slot cutoff rejection remains intact');
    const beforeRetry = requests.length;
    check((await confirm(a)).success === true, 'Actual idempotent booking call succeeds');
    check((await invoke(a)).body.sent === 0 && requests.length === beforeRetry, 'Retry/refresh never resends sent events');

    // D/E: actual cancellation and its retry; failed cancellation stays confirmed.
    const d = await cancel(a);
    check(d.success && d.ticket_refunded === true, '>6h refund follows actual cancellation RPC');
    check((await invoke(a, learner, 'booking_cancelled')).body.sent === 1, 'Cancellation sends exactly one Partner email');
    check((await logs(a.id)).filter(row => row.event_type === 'booking_cancelled').length === 1, 'No unnecessary self cancellation email');
    const afterCancel = requests.length;
    check((await cancel(a)).already_cancelled === true, 'Actual cancellation retry is idempotent');
    check((await invoke(a, learner, 'booking_cancelled')).body.sent === 0 && requests.length === afterCancel, 'Cancellation retry cannot resend');
    const e = await booking(8, 1, outsider);
    check((await confirm(e)).success, 'Second booking succeeds');
    await actor(learner);
    await assert.rejects(db.query('select cancel_my_booking($1)', [e.id]), /Learner booking access/i);
    check((await state(e.id)).status === 'confirmed', 'Failed cancellation leaves booking confirmed');
    check((await invoke(e, outsider, 'booking_cancelled')).statusCode === 409, 'Failed cancellation sends no cancellation email');
    check((await logs(e.id)).every(row => row.event_type === 'booking_confirmed'), 'Failed cancellation emits no cancellation event');
    const late = await booking(5);
    check((await confirm(late)).success, '4–6h booking confirms');
    const lateCancel = await cancel(late);
    check(lateCancel.ticket_refunded === false && lateCancel.partner_rewarded === true, '4–6h actual no-refund/compensation contract');
    await invoke(late, learner, 'booking_cancelled');
    const lateMail = requests.find(r => r.key === `booking_cancelled:${late.id}:partner`).payload;
    check(lateMail.text.includes('반환되지 않았습니다') && lateMail.text.includes('보상이 Partner에게 반영'), 'Cancellation text uses recorded flags');
    check((await deliver(late)).sent === 0, 'An unsent confirmation is suppressed after cancellation');
    const short = await booking(2, 1, internal);
    check((await confirm(short)).success, 'Existing internal <4h exception survives');
    const shortCancel = await cancel(short);
    check(shortCancel.success, 'Existing <4h internal cancellation contract survives unchanged');

    // F: provider failure and ambiguous acceptance; retries use the exact saved payload.
    const f = await booking();
    check((await confirm(f)).success, 'Booking commits before a provider failure');
    providerMode = 'reject';
    check((await deliver(f)).failed === 2, 'Provider failure records both recipients as failed');
    check((await state(f.id)).status === 'confirmed', 'Email failure never rolls booking back');
    check((await logs(f.id)).every(row => row.status === 'failed' && row.last_error === 'provider_http_503' && row.next_attempt_at), 'Failure records have retry dates without provider body leakage');
    providerMode = 'success';
    await owner();
    await db.query("update booking_notification_log set next_attempt_at=now()-interval '1 second' where booking_id=$1", [f.id]);
    check((await deliver(f)).sent === 2, 'Provider failures can be retried');
    check((await cancel(f)).success, 'Cancellation commits before email provider failure');
    providerMode = 'reject';
    check((await deliver(f, 'booking_cancelled')).failed === 1, 'Cancellation delivery failure recorded');
    check((await state(f.id)).status === 'cancelled', 'Email failure never rolls cancellation back');
    providerMode = 'success';
    const unknown = await booking();
    check((await confirm(unknown)).success, 'Ambiguous-delivery booking succeeds');
    providerMode = 'accepted_unknown';
    check((await deliver(unknown)).failed === 2, 'Lost provider response is retryable');
    const acceptedCount = provider.size;
    await owner();
    await db.query("update profiles set nickname='Changed Name' where id=$1", [partner]);
    await db.query("update auth.users set email='changed@fixture.test' where id=$1", [learner]);
    await db.query("update booking_notification_log set next_attempt_at=now()-interval '1 second' where booking_id=$1", [unknown.id]);
    providerMode = 'success';
    check((await deliver(unknown)).sent === 2 && provider.size === acceptedCount, 'A lost response never duplicates accepted mail, even after email/name changes');
    const old = await booking();
    check((await confirm(old)).success, 'Retry window fixture confirms');
    providerMode = 'accepted_unknown';
    await deliver(old);
    await owner();
    await db.query("update booking_notification_log set first_attempt_at=now()-interval '24 hours', next_attempt_at=now()-interval '1 second' where booking_id=$1", [old.id]);
    const beforeExpired = requests.length;
    await deliver(old);
    check(requests.length === beforeExpired && (await logs(old.id)).every(row => row.status === 'needs_review'), 'Expired provider idempotency window requires review, never blind resend');
    providerMode = 'success';

    // G/H: exact KST day boundaries and participant privacy.
    check(kstTime('2026-10-02T15:30:00Z') === '2026년 10월 03일 00:30 (KST, UTC+09:00)', 'KST midnight and date are correct');
    check(kstTime('2026-10-03T00:30:00+09:00') === kstTime('2026-10-02T15:30:00Z'), 'Explicit offsets render the same KST instant');
    assert.throws(() => kstTime('2026-10-03T00:30:00'), /invalid_event_time/);
    check(displayName('partner', 'partner@fixture.test') === 'DayO Partner', 'Email local part is not exposed as a name');
    const mailA = requests.filter(r => r.key.startsWith('booking_confirmed:' + a.id));
    check(mailA.every(r => !r.payload.text.includes('Private User Name') && !r.payload.text.includes('@fixture.test')), 'Body reveals no learner private name or participant email');
    const learnerMail = mailA.find(r => r.payload.to[0] === 'user@fixture.test').payload;
    check(learnerMail.text.includes('Jen <b>') && learnerMail.html.includes('Jen &lt;b&gt;'), 'Partner display name is escaped in HTML');
    const requestsBeforeOutsider = requests.length;
    check((await invoke(e, learner)).statusCode === 404 && requests.length === requestsBeforeOutsider, 'Other booking participants cannot access this booking or trigger its mail');
    check((await invoke(e, outsider, 'booking_confirmed', { email: 'attacker@fixture.test' })).statusCode === 400, 'Client cannot override recipient email');
    check((await invoke(e, null)).statusCode === 401, 'Anonymous/auth-invalid request is denied');
    check(userLookups.every(id => [learner, partner, outsider, internal].includes(id)), 'Recipients only resolved by server participant identities');
    await actor(learner);
    await assert.rejects(db.query('select * from booking_notification_log'), /permission denied/);
    await assert.rejects(db.query('select * from claim_booking_notification(null,null)'), /permission denied/);
    check(true, 'Authenticated clients cannot read private logs or claim worker jobs');

    // Two workers cannot claim the same event; an old lease cannot write success.
    const lease = await booking();
    check((await confirm(lease)).success, 'Lease test booking confirms');
    await owner();
    await db.exec('set role service_role;');
    const first = (await service.rpc('claim_booking_notification', { p_booking_id: lease.id, p_event_type: 'booking_confirmed' })).data[0];
    const second = (await service.rpc('claim_booking_notification', { p_booking_id: lease.id, p_event_type: 'booking_confirmed' })).data[0];
    const third = (await service.rpc('claim_booking_notification', { p_booking_id: lease.id, p_event_type: 'booking_confirmed' })).data[0];
    check(first.event_key !== second.event_key && !third, 'Active leases prevent concurrent duplicate claims');
    await owner();
    await db.query("update booking_notification_log set lease_until=now()-interval '1 second' where event_key=$1", [first.event_key]);
    await db.exec('set role service_role;');
    const reclaimed = (await service.rpc('claim_booking_notification', { p_booking_id: lease.id, p_event_type: 'booking_confirmed' })).data[0];
    check(first.lease_token !== reclaimed.lease_token, 'An expired lease is recoverable');
    const { makeStore } = require('../api/_lib/booking-notifications');
    await assert.rejects(makeStore(service).save(first, { status: 'sent' }), /lease_lost/);
    check(true, 'Stale worker cannot overwrite a new lease');

    // Notification storage failure and booking rollback are isolated both ways.
    const queueFailure = await booking();
    await owner();
    await db.exec("create function reject_notification_fixture() returns trigger language plpgsql as $$ begin raise exception 'fixture queue failure'; end $$; create trigger reject_notification_fixture before insert on booking_notification_log for each row execute function reject_notification_fixture();");
    check((await confirm(queueFailure)).success, 'Queue insertion failure does not fail actual booking');
    check((await state(queueFailure.id)).status === 'confirmed' && (await logs(queueFailure.id)).length === 0, 'Queue failure is logged to DB warning while booking remains committed');
    await owner();
    await db.exec('drop trigger reject_notification_fixture on booking_notification_log; drop function reject_notification_fixture();');
    const rolledBack = await booking();
    await actor(rolledBack.user);
    await db.exec('begin;');
    await db.query('select confirm_booking_with_cutoff_cleanup($1,$2)', [rolledBack.user, rolledBack.id]);
    await db.exec('rollback;');
    check((await logs(rolledBack.id)).length === 0 && (await state(rolledBack.id)).status === 'pending', 'Rolled-back booking leaves no notification to dispatch');

    // Server-only worker route can drain due jobs without an end-user session.
    await owner();
    await db.exec('set role service_role;');
    const workerHandler = createHandler({ config, clients: () => ({ service, auth: {} }), dispatch: async () => ({ sent: 0, failed: 0, review: 0 }) });
    const workerRes = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
    await workerHandler({ method: 'POST', headers: { authorization: 'Bearer fixture-service' }, body: {} }, workerRes);
    check(workerRes.statusCode === 200, 'Existing service credential authenticates the isolated retry worker');
    check(!JSON.stringify(aResult.body).includes('@') && !JSON.stringify(aResult.body).includes('provider-'), 'API response contains no private email or provider ID');

    await frontend();
    console.log(`Booking notifications: A–H, actual frontend hooks and reliability guards passed (${checks} checks). No external emails sent.`);
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
