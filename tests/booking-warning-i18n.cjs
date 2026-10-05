const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const expected = {
  KO: ['예약 취소 규정을 확인해 주세요', '이 예약은 시작 6시간 이내입니다.\n지금 예약하면 이후 취소 시 사용한 티켓은 반환되지 않습니다.\n계속 예약할까요?', '다시 확인하기', '확인하고 예약하기'],
  EN: ['Please check the cancellation policy', 'This session starts within 6 hours.\nIf you book now and cancel later, your ticket will not be returned.\nWould you like to continue?', 'Go back', 'Confirm booking']
};
const keys = ['Title', 'Body', 'Back', 'Confirm'].map(s => 'book.nonRefundWarning' + s);
async function run(lang, failure) {
  const dom = new JSDOM(`<html lang="${lang.toLowerCase()}"><head></head><body><button id="previous">Previous</button></body></html>`, { url: 'https://example.test', runScripts: 'outside-only' });
  const w = dom.window;
  w.localStorage.setItem('dayo_lang', lang);
  w.eval(read('public/i18n.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  keys.forEach((key, i) => assert.equal(w.DayOI18n.t(key), expected[lang][i], 'actual flat dictionary lookup'));
  assert.equal(w.DayOI18n.tf('book.confirmToastFormat', { partner: 'Clara' }, 'ES'), '¡Reserva confirmada! Nos vemos con Clara 💖');
  for (const key of ['book.bookingWindowClosed', 'book.bookingCutoffPassed', 'book.regularConfirmTitle']) assert.notEqual(w.DayOI18n.t(key), key);
  if (failure === 'missing') delete w.DayOI18n;
  if (failure === 'stale') w.DayOI18n = { getLang: () => lang, t: key => key };
  if (failure === 'empty') w.DayOI18n = { getLang: () => lang, t: () => '' };
  if (failure === 'throws') w.DayOI18n = { getLang: () => lang, t: () => { throw Error('unavailable'); } };
  let writes = 0;
  w.supabaseClient = { from() { writes++; throw Error('unexpected booking write'); } };
  w.DayOScrollLock = { lock() {}, unlock() {} };
  const source = read('public/availability-slots.js');
  w.eval(source.slice(0, source.indexOf('  function displayLocale()')) + '\n})();');
  w.document.querySelector('#previous').focus();
  let pending = w.DayOBookingWindow.confirmNoRefund();
  const selectors = ['#dayo-booking-window-title', '#dayo-booking-window-body', '.dayo-booking-window-back', '.dayo-booking-window-confirm'];
  selectors.forEach((selector, i) => assert.equal(w.document.querySelector(selector).textContent, expected[lang][i]));
  assert.doesNotMatch(w.document.body.textContent, /book\.(?:nonRefundWarning|regularConfirm)/);
  w.document.querySelector('.dayo-booking-window-back').click();
  assert.equal(await pending, false);
  assert.equal(w.document.querySelector('.dayo-booking-window-overlay'), null);
  assert.equal(w.document.activeElement.id, 'previous');
  assert.equal(writes, 0, 'back never creates a booking');
  pending = w.DayOBookingWindow.confirmNoRefund();
  w.document.querySelector('.dayo-booking-window-confirm').click();
  assert.equal(await pending, true, 'confirmation returns the existing flow result');
  pending = w.DayOBookingWindow.confirmRegular();
  assert.doesNotMatch(w.document.body.textContent, /book\.|within 6 hours|시작 6시간 이내/);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(await pending, false);
  dom.window.close();
}
(async () => {
  for (const lang of ['KO', 'EN']) for (const failure of [null, 'missing', 'stale', 'empty', 'throws']) await run(lang, failure);
  for (const name of ['i18n.js', 'availability-slots.js']) assert.equal(read(name), read('public/' + name), name + ' root/public mirror');
  console.log('PASS KO/EN actual lookup, missing/stale/empty/throwing i18n fallback, modal back/confirm/Escape, no booking write, regular copy, Spanish toast and mirrors.');
})().catch(error => { console.error(error); process.exitCode = 1; });
