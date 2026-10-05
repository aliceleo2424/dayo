const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/logged-in-home.js'), 'utf8');
assert.equal(source, fs.readFileSync(path.join(__dirname, '../logged-in-home.js'), 'utf8'));
const now = Date.parse('2026-10-05T09:00:00Z');
function booking(id, minutes, status = 'confirmed', end_reason = null) {
  return { id, scheduled_at: new Date(now + minutes * 60000).toISOString(), status, end_reason };
}
function harness(user = { id: 'learner' }, data = []) {
  const events = {}, windowEvents = {}, attrs = new Map();
  const buttons = [0, 1].map(() => ({ textContent: '', disabled: false,
    setAttribute(k, v) { attrs.set(k, v); }, removeAttribute(k) { attrs.delete(k); } }));
  let queries = 0, opened = 0, interval, dialog, clock = now;
  const query = { select(fields) { assert.equal(fields, 'id, scheduled_at, status, end_reason'); return this; },
    eq(field, id) { assert.equal(field, 'learner_id'); assert.equal(id, 'learner'); return this; },
    in(field, values) { assert.equal(field, 'status'); assert.deepEqual(Array.from(values), ['confirmed', 'completed']); return this; },
    async order() { queries++; return { data }; } };
  const document = { readyState: 'loading', hidden: false,
    body: { classList: { toggle() {} }, setAttribute() {} },
    querySelectorAll(selector) { return selector.includes('header-cta') ? buttons : []; },
    addEventListener(name, fn) { (events[name] ||= []).push(fn); },
    createElement() {
      const nodes = Object.fromEntries(['h2', '[data-when]', '[data-wait]', '[data-enter]', '[data-close]'].map(k => [k, { style: {} }]));
      dialog = { style: {}, open: false, querySelector(k) { return nodes[k]; }, querySelectorAll() { return [nodes['[data-enter]'], nodes['[data-close]']]; },
        showModal() { this.open = true; }, close() { this.open = false; } };
      return dialog;
    } };
  document.body.appendChild = () => {};
  const window = { _dayoAuthUser: user, supabaseClient: { from(table) { assert.equal(table, 'bookings'); return query; } },
    checkUserLoggedIn: () => !!window._dayoAuthUser, DayOI18n: { getLang: () => 'KO' },
    DayOBooking: { requestOpen() { opened++; } }, location: {}, alert() {},
    addEventListener(name, fn) { windowEvents[name] = fn; }, setInterval(fn) { interval = fn; } };
  const TestDate = class extends Date { static now() { return clock; } };
  vm.runInNewContext(source.replace("  var USER_KEY = 'userName';", "  window.testState = conversationState; window.testLabel = label; window.testOpen = openUpcoming; window.testRefresh = refreshConversation;\n  var USER_KEY = 'userName';"), { window, document, Date: TestDate, Intl, Number });
  return { window, document, buttons, events, windowEvents, get queries() { return queries; }, get opened() { return opened; }, get dialog() { return dialog; }, advance(ms) { clock += ms; }, tick: () => interval() };
}
(async () => {
  const h = harness();
  const state = (rows, at = now) => h.window.testState(rows, at);
  assert.equal(state([]).key, 'first');
  assert.equal(state([booking('past', -60, 'completed', 'normal')]).key, 'next');
  for (const status of ['cancelled', 'no_show', 'tech_issue', 'failed']) assert.equal(state([booking('past', -60, status)]).key, 'first');
  assert.equal(state([booking('past', -60, 'completed', 'learner_no_show')]).key, 'first');
  assert.equal(state([booking('future', 20)]).canEnter, false);
  assert.equal(state([booking('future', 5)]).canEnter, true);
  assert.equal(state([booking('future', 5)], now - 1).canEnter, false);
  assert.equal(state([booking('future', 4)]).canEnter, true);
  assert.equal(state([booking('later', 60), booking('nearest', 20)]).booking.id, 'nearest');
  assert.equal(state([booking('past', -60, 'completed', 'normal'), booking('future', 20)]).key, 'start');
  assert.equal(state([booking('invalid', 0), { status: 'confirmed', scheduled_at: 'bad' }]).booking.id, 'invalid');
  assert.equal(state([booking('expired', -30)]).booking, null);
  h.window.DayOI18n.getLang = () => 'EN';
  assert.equal(h.window.testLabel('start'), 'Start conversation');
  assert.equal(h.window.testLabel('next'), 'Book your next conversation');
  const guest = harness(null);
  await guest.window.testRefresh(false);
  assert.equal(guest.queries, 0);
  assert.equal(guest.buttons[0].textContent, '첫 대화 시작하기');
  const upcoming = harness({ id: 'learner' }, [booking('next-id', 4)]);
  await upcoming.window.testRefresh(false);
  await upcoming.window.testRefresh(false);
  assert.equal(upcoming.queries, 1, 'cached repeated layout refresh must not duplicate reads');
  assert.equal(upcoming.buttons[0].textContent, '대화 시작하기');
  assert.equal(upcoming.buttons[1].textContent, '대화 시작하기');
  await upcoming.window.testOpen();
  assert.equal(upcoming.window.location.href, 'room.html?bookingId=next-id');
  assert.equal(upcoming.opened, 0, 'upcoming CTA must not open new booking flow');
  const prep = harness({ id: 'learner' }, [booking('future', 20)]);
  await prep.window.testOpen();
  assert.equal(prep.window.location.href, undefined, 'early booking must never navigate to room');
  assert.equal(prep.opened, 0);
  assert.equal(prep.dialog.querySelector('[data-enter]').disabled, true);
  prep.advance(15 * 60000);
  await prep.window.testRefresh(false);
  assert.equal(prep.dialog.querySelector('[data-enter]').disabled, false, 'open preparation automatically enables entry at -5 minutes');
  prep.dialog.querySelector('[data-close]').onclick();
  assert.equal(prep.dialog.open, false);
  assert.equal(prep.opened, 0, 'closing preparation never creates a booking');
  const completed = harness({ id: 'learner' }, [booking('past', -60, 'completed', 'normal')]);
  await completed.window.testRefresh(false);
  assert.equal(completed.buttons[0].textContent, '다음 대화 예약하기');
  completed.window._dayoAuthUser = null;
  await completed.window.testRefresh(false);
  assert.equal(completed.buttons[0].textContent, '첫 대화 시작하기');
  console.log('PASS header CTA: first/completed/upcoming, -5/+30 boundaries, cancelled/failed exclusion, nearest booking, priority, KO/EN, guest, cache, direct room, preparation, logout, mirrors');
})().catch(error => { console.error(error); process.exitCode = 1; });
