/* DayO 티켓 지갑 — localStorage ticketCount + 실시간 UI 동기화 */
(function () {
  'use strict';

  var TICKET_KEY = 'ticketCount';
  var DEFAULT_COUNT = 0;

  function i18n(key, vars) {
    if (window.DayOI18n && typeof window.DayOI18n.tf === 'function') {
      return window.DayOI18n.tf(key, vars);
    }
    return key;
  }

  function readCount() {
    try {
      var dayoRaw = window.localStorage.getItem('dayo_ticket_count');
      if (dayoRaw != null && dayoRaw !== '') {
        var dayoN = parseInt(dayoRaw, 10);
        if (Number.isFinite(dayoN) && dayoN >= 0) return dayoN;
      }
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
      window.localStorage.setItem('dayo_ticket_count', String(value));
    } catch (e) { /* ignore */ }
    return value;
  }

  function getCount() {
    return readCount();
  }

  function persistTickets(n) {
    if (window.DayOProfileStore && typeof window.DayOProfileStore.updateProfile === 'function') {
      window.DayOProfileStore.updateProfile({ ticket_count: n }, { skipEvents: true });
    }
  }

  function setCount(n) {
    var next = writeCount(n);
    syncUI(next);
    document.dispatchEvent(new CustomEvent('dayo:ticketchange', {
      detail: { ticketCount: next, added: 0 }
    }));
    persistTickets(next);
    return next;
  }

  function addTickets(amount) {
    var add = Math.max(0, Math.floor(Number(amount) || 0));
    var next = writeCount(readCount() + add);
    syncUI(next);
    document.dispatchEvent(new CustomEvent('dayo:ticketchange', {
      detail: { ticketCount: next, added: add }
    }));
    persistTickets(next);
    return { ticketCount: next, added: add };
  }

  function syncUI(count) {
    var n = typeof count === 'number' ? count : readCount();

    Array.prototype.forEach.call(document.querySelectorAll('[data-ticket-count]'), function (el) {
      el.textContent = String(n);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-ticket-badge-text]'), function (el) {
      el.textContent = i18n('mypage.ticket.badge', { n: n });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-ticket-remaining-text]'), function (el) {
      el.textContent = i18n('mypage.ticket.count', { n: n });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-summary-ticket]'), function (el) {
      el.textContent = i18n('mypage.ticket.count', { n: n });
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
    document.addEventListener('dayo:langchange', function () {
      syncUI();
    });
    document.addEventListener('dayo:authchange', function () {
      syncUI();
    });
    window.addEventListener('storage', function (e) {
      if (!e.key || e.key === TICKET_KEY) syncUI();
    });

    document.addEventListener('click', function (e) {
      var gate = e.target.closest('[data-ticket-gate]');
      if (!gate) return;
      if (getCount() > 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (window.DayOBooking && typeof window.DayOBooking.requestOpen === 'function') {
        window.DayOBooking.requestOpen();
        return;
      }
      var msg = i18n('mypage.ticket.needMore');
      if (window.DayOTickets && typeof window.DayOTickets.promptPurchase === 'function') {
        window.DayOTickets.promptPurchase(msg);
      } else if (window.DayOTickets && typeof window.DayOTickets.open === 'function') {
        window.DayOTickets.open();
      } else {
        window.location.href = 'index.html?booking=open';
      }
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
