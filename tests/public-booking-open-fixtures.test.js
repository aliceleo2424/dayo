const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const booking = read('public/booking-modal.js');
const legacy = read('public/availability-slots.js');
const client = read('public/supabase-client.js');
const landing = read('public/index.html');
const originalRpc = read('supabase/migrations/056_ticket_lot_consumption.sql');
const cutoff = read('supabase/migrations/065_booking_window_policy.sql');
const cleanup = read('supabase/migrations/066_cleanup_cutoff_pending_bookings.sql');
const opening = read('supabase/migrations/076_open_paid_public_booking.sql');

// A-C: only logged-in users with a usable ticket reach the main booking modal;
// the server's authenticated policy and lot lookup remain authoritative.
const requestOpen = booking.match(/function requestOpen\(\) \{([\s\S]*?)\n  \}/)?.[1];
assert.ok(requestOpen);
assert.ok(requestOpen.indexOf('checkUserLoggedIn()') < requestOpen.indexOf('getTicketCount() < 1'));
assert.match(requestOpen, /routeToTicketTopup\(\)/);
assert.match(requestOpen, /open\(\)/);
assert.doesNotMatch(booking, /canCreateBookingDuringPreopen|showPreopenBookingNotice/);
assert.doesNotMatch(client, /canCreatePreopenBooking|showPreopenBookingNotice/);
assert.doesNotMatch(legacy, /DayOPreopenBooking\.canCreate|DayOPreopenBooking\.showNotice/);
assert.match(opening, /for insert\s+to authenticated\s+with check/);
assert.match(opening, /learner_id = auth\.uid\(\)/);

// D-I: concrete slot, four-hour cutoff, internal lead-time exception, FIFO
// consumption and same-slot locking are unchanged by the opening migration.
assert.match(cutoff, /A concrete booking slot is required\./);
assert.match(cutoff, /dayo_can_create_preopen_booking\(\)[\s\S]*?interval '4 hours'/);
assert.match(cleanup, /booking_window_closed/);
assert.match(opening, /dayo_can_create_preopen_booking'\) = 0/);
assert.match(originalRpc, /quantity_remaining > 0/);
assert.match(originalRpc, /from public\.availability_slots[\s\S]*?for update/);
assert.match(originalRpc, /insert into public\.ticket_allocations/);
assert.match(originalRpc, /set status = 'booked'/);
assert.match(originalRpc, /if v_status in \('confirmed', 'completed'\)/);

const gatePattern = /\s+if\s+not\s+public\.dayo_can_create_preopen_booking\(\)\s+then\s+return\s+pg_catalog\.jsonb_build_object\(\s*'success'\s*,\s*false\s*,\s*'message'\s*,\s*'[^']*'\s*\)\s*;\s+end\s+if\s*;/g;
const gates = [...originalRpc.matchAll(gatePattern)];
assert.equal(gates.length, 1, '056 RPC has exactly one simple pre-open rejection IF');
const gate = gates[0][0];
assert.equal([...originalRpc.replace(gate, gate.replace(/'[^']*'(?=\s*\)\s*;)/, "'encoded message may vary'")).matchAll(gatePattern)].length, 1,
  'gate recognition must not depend on the Korean message bytes');
assert.equal([...originalRpc.replace(gate, gate.replace('return ', 'if true then return ')).matchAll(gatePattern)].length, 0,
  'nested or additional IF statements must fail closed');
assert.equal([...originalRpc.replace(gate, `${gate}${gate}`).matchAll(gatePattern)].length, 2,
  'duplicate gate blocks must not be silently accepted');
const withoutGate = originalRpc.replace(gate, '');
assert.doesNotMatch(withoutGate, /if not public\.dayo_can_create_preopen_booking\(\) then\s+return pg_catalog\.jsonb_build_object/);
assert.match(withoutGate, /public\.ticket_lots/);
assert.match(withoutGate, /public\.ticket_allocations/);
assert.match(withoutGate, /set status = 'booked'/);
assert.match(opening, /v_gate := pg_catalog\.substring\(v_rpc_definition, v_gate_pattern\)/);
assert.match(opening, /public\.dayo_can_create_preopen_booking\(', ''/);
assert.match(opening, /v_rpc_after is distinct from pg_catalog\.replace\(v_rpc_definition, v_gate, ''\)/);
assert.doesNotMatch(opening, /정식 오픈 후 예약할 수 있습니다/);
assert.match(opening, /execute pg_catalog\.replace\(v_rpc_definition, v_gate, ''\)/);
assert.match(opening, /drop trigger enforce_preopen_booking_confirmation on public\.bookings/);
assert.match(opening, /raise exception 'Expected pre-open booking INSERT policy is missing or changed\.'/);

// Quiz topic CTA now follows the ordinary booking request path, not a notice.
assert.match(landing, /dayo_quiz_topic[\s\S]*?closeQuizModal\(\);[\s\S]*?DayOBooking\.requestOpen\(\)/);
for (const match of landing.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (!/\bsrc\s*=/.test(match[1])) new Function(match[2]);
}

for (const name of ['booking-modal.js', 'availability-slots.js', 'supabase-client.js', 'index.html']) {
  const normalized = (value) => value.replace(/\r\n/g, '\n');
  assert.equal(normalized(read(name)), normalized(read(`public/${name}`)), `${name} mirror differs`);
}

console.log('Public booking opening fixtures passed (static gates, lot/slot guards, lead-time exception, mirrors).');
