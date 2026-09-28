const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const nowMs = Date.parse('2026-09-28T00:00:00Z'); // 09:00 KST
let internalTest = false;

class FixedDate extends Date {
  static now() { return nowMs; }
}

const hook = {};
const windowStub = {
  __DAYO_SMART_BOOKING_TEST__: hook,
  DayOPreopenBooking: {
    isInternalTest() { return internalTest; },
  },
};

const context = {
  window: windowStub,
  document: { readyState: 'loading', addEventListener() {} },
  console,
  Date: FixedDate,
  setTimeout,
  clearTimeout,
};

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'booking-modal.js'), 'utf8');
vm.runInNewContext(source, context, { filename: 'public/booking-modal.js' });
const api = hook.api;

const jen = {
  id: 'jen',
  conversation_languages: ['en', 'es', 'fr', 'ko'],
  korean_support_level: 'fluent',
  isTest: false,
};
const alex = {
  id: 'alex',
  conversation_languages: ['en'],
  korean_support_level: 'conversational',
  isTest: false,
};
const unconfigured = {
  id: 'unconfigured',
  conversation_languages: [],
  korean_support_level: null,
  isTest: false,
};

assert.equal(api.partnerMatchesCriteria(jen, 'en', 'any'), true);
assert.equal(api.partnerMatchesCriteria(jen, 'en', 'needed'), true);
assert.equal(api.partnerMatchesCriteria(alex, 'es', 'any'), false);
assert.equal(api.partnerMatchesCriteria(unconfigured, 'en', 'any'), false);
assert.equal(api.partnerMatchesCriteria(unconfigured, 'en', 'needed'), false);

const exactlyFourHours = '2026-09-28T13:00:00+09:00';
const underFourHours = '2026-09-28T12:30:00+09:00';
const exactlySixHours = '2026-09-28T15:00:00+09:00';
assert.equal(api.isBookableStart(Date.parse(exactlyFourHours)), true);
assert.equal(api.isBookableStart(Date.parse(underFourHours)), false);
assert.equal(api.requiresNoRefundWarning(Date.parse(exactlySixHours)), true);
assert.equal(api.requiresNoRefundWarning(Date.parse('2026-09-28T15:30:00+09:00')), false);
assert.equal(api.isFutureThirtyMinuteConcreteSlot({ slot_time: 'weekly:mon|15:00' }), false);
assert.equal(api.isFutureThirtyMinuteConcreteSlot({ slot_time: exactlyFourHours }), true);

internalTest = true;
assert.equal(api.isBookableStart(Date.parse(underFourHours)), true);
assert.equal(api.requiresNoRefundWarning(Date.parse(exactlySixHours)), false);
internalTest = false;

const sharedTimeSlots = [
  { id: 's2', partner_id: 'alex', slot_time: exactlySixHours, status: 'available' },
  { id: 's1', partner_id: 'jen', slot_time: exactlySixHours, status: 'available' },
  { id: 's3', partner_id: 'jen', slot_time: '2026-09-28T16:00:00+09:00', status: 'available' },
];
const times = api.buildUniqueTimes(sharedTimeSlots);
assert.deepEqual(Array.from(times, (time) => time.label), ['15:00', '16:00']);
const partnersAtSharedTime = api.partnersForTime(sharedTimeSlots, [jen, alex], api.slotStartKey(exactlySixHours));
assert.deepEqual(Array.from(partnersAtSharedTime, (partner) => partner.id), ['jen', 'alex']);

console.log('Smart Booking fixtures passed: capability filters, 4h/6h boundaries, internal exception, weekly exclusion, unique times, multi-partner time.');
