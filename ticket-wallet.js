/* DayO 티켓 지갑 — localStorage ticketCount + 실시간 UI 동기화 */
(function () {
  'use strict';

  var TICKET_KEY = 'ticketCount';
  var DEFAULT_COUNT = 1;

  function readCount() {
    try {
      var raw = window.localStorage.getItem(TICKET_KEY);
      if (raw == null || raw === '') return DEFAULT_COUNT;
      var n = parseInt(raw, 10);
      return Number.isFinite(n) && n >= 0 ? n : DEFAULT_COUNT;
    } catch (e) {
      return DEFAULT_COUNT;
    }
  }

  function writeCount(n) {
    var value = Math.max(0, Math.floor(Number(n) || 0));
    try {
      window.localStorage.setItem(TICKET_KEY, String(value));
    } catch (e) { /* ignore */ }
    return value;
  }

  function getCount() {
    return readCount();
  }

  function setCount(n) {
    var next = writeCount(n);
    syncUI(next);
    document.dispatchEvent(new CustomEvent('dayo:ticketchange', {
      detail: { ticketCount: next, added: 0 }
    }));
    return next;
  }

  function addTickets(amount) {
    var add = Math.max(0, Math.floor(Number(amount) || 0));
    var next = writeCount(readCount() + add);
    syncUI(next);
    document.dispatchEvent(new CustomEvent('dayo:ticketchange', {
      detail: { ticketCount: next, added: add }
    }));
    return { ticketCount: next, added: add };
  }

  function syncUI(count) {
    var n = typeof count === 'number' ? count : readCount();

    Array.prototype.forEach.call(document.querySelectorAll('[data-ticket-count]'), function (el) {
      el.textContent = String(n);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-ticket-badge-text]'), function (el) {
      el.textContent = '☕️ 보유 티켓: ' + n + '장';
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-ticket-remaining-text]'), function (el) {
      el.textContent = n + '회 남음';
    });
  }

  function ensureInitialized() {
    try {
      if (window.localStorage.getItem(TICKET_KEY) == null) {
        writeCount(DEFAULT_COUNT);
      }
    } catch (e) { /* ignore */ }
    syncUI();
  }

  window.DayOTicketWallet = {
    getCount: getCount,
    setCount: setCount,
    addTickets: addTickets,
    syncUI: syncUI,
    ensureInitialized: ensureInitialized
  };

  function init() {
    ensureInitialized();
    document.addEventListener('dayo:ticketchange', function (e) {
      syncUI(e.detail && e.detail.ticketCount);
    });
    document.addEventListener('dayo:authchange', function () {
      syncUI();
    });
    window.addEventListener('storage', function (e) {
      if (!e.key || e.key === TICKET_KEY) syncUI();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
