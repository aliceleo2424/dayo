/* DayO 티켓 지갑 — DB 확정 전 깜빡임 방지 + 신규 가입 재시도 */
(function () {
  'use strict';

  var TICKET_KEY = 'ticketCount';
  var DAYO_TICKET_KEY = 'dayo_ticket_count';
  var hydrated = false;
  var loadSeq = 0;

  function i18n(key, vars) {
    if (window.DayOI18n && typeof window.DayOI18n.tf === 'function') {
      return window.DayOI18n.tf(key, vars);
    }
    return key;
  }

  function readCount() {
    try {
      var dayoRaw = window.localStorage.getItem(DAYO_TICKET_KEY);
      if (dayoRaw != null && dayoRaw !== '') {
        var dayoN = parseInt(dayoRaw, 10);
        if (Number.isFinite(dayoN) && dayoN >= 0) return dayoN;
      }
      var raw = window.localStorage.getItem(TICKET_KEY);
      if (raw == null || raw === '') return null;
      var n = parseInt(raw, 10);
      return Number.isFinite(n) && n >= 0 ? n : null;
    } catch (e) {
      return null;
    }
  }

  function writeCount(n) {
    var value = Math.max(0, Math.floor(Number(n) || 0));
    try {
      window.localStorage.setItem(TICKET_KEY, String(value));
      window.localStorage.setItem(DAYO_TICKET_KEY, String(value));
    } catch (e) { /* ignore */ }
    return value;
  }

  function getCount() {
    var n = readCount();
    return n == null ? 0 : n;
  }

  function isHydrated() {
    return hydrated;
  }

  function persistTickets(n) {
    if (window.DayOProfileStore && typeof window.DayOProfileStore.updateProfile === 'function') {
      window.DayOProfileStore.updateProfile({ ticket_count: n }, { skipEvents: true });
    }
  }

  function syncPendingUI() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-ticket-count], #user-ticket-count, .ticket-count-display'), function (el) {
      el.textContent = '-';
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-ticket-badge-text]'), function (el) {
      el.textContent = '☕️ 보유 티켓: -장';
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-ticket-remaining-text], [data-summary-ticket]'), function (el) {
      if (el.matches('[data-ticket-count], #user-ticket-count, .ticket-count-display')) return;
      el.textContent = '-장';
    });
  }

  function syncUI(count) {
    if (!hydrated && (count == null || typeof count !== 'number')) {
      syncPendingUI();
      return;
    }
    var n = typeof count === 'number' ? count : readCount();
    if (n == null) {
      syncPendingUI();
      return;
    }

    Array.prototype.forEach.call(document.querySelectorAll('[data-ticket-count], #user-ticket-count, .ticket-count-display'), function (el) {
      el.textContent = String(n);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-ticket-badge-text]'), function (el) {
      el.textContent = i18n('mypage.ticket.badge', { n: n });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-ticket-remaining-text]'), function (el) {
      el.textContent = i18n('mypage.ticket.count', { n: n });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-summary-ticket]'), function (el) {
      if (el.matches('[data-ticket-count], #user-ticket-count, .ticket-count-display')) return;
      el.textContent = i18n('mypage.ticket.count', { n: n });
    });
  }

  function setCount(n) {
    var next = writeCount(n);
    hydrated = true;
    syncUI(next);
    document.dispatchEvent(new CustomEvent('dayo:ticketchange', {
      detail: { ticketCount: next, added: 0 }
    }));
    persistTickets(next);
    return next;
  }

  function addTickets(amount) {
    var add = Math.max(0, Math.floor(Number(amount) || 0));
    var base = readCount();
    var next = writeCount((base == null ? 0 : base) + add);
    hydrated = true;
    syncUI(next);
    document.dispatchEvent(new CustomEvent('dayo:ticketchange', {
      detail: { ticketCount: next, added: add }
    }));
    persistTickets(next);
    return { ticketCount: next, added: add };
  }

  function resolveTicketBalance(profile) {
    if (!profile) return null;
    if (profile.ticket_count != null && profile.ticket_count !== '') {
      var a = Number(profile.ticket_count);
      if (Number.isFinite(a) && a >= 0) return a;
    }
    if (profile.tickets != null && profile.tickets !== '') {
      var b = Number(profile.tickets);
      if (Number.isFinite(b) && b >= 0) return b;
    }
    return null;
  }

  async function loadUserTicketBalance(userId, retryCount) {
    retryCount = retryCount || 0;
    var mySeq = ++loadSeq;
    var client = window.supabaseClient;
    if (!client || !userId) {
      if (!hydrated) syncPendingUI();
      return null;
    }

    var profile = null;
    try {
      var q = await client
        .from('profiles')
        .select('ticket_count, tickets, created_at')
        .eq('id', userId)
        .maybeSingle();
      if (q.error || !q.data) {
        q = await client
          .from('profiles')
          .select('ticket_count, tickets, created_at')
          .eq('user_id', userId)
          .maybeSingle();
      }
      profile = q.data || null;
    } catch (e) {
      profile = null;
    }

    if (mySeq !== loadSeq) return null;

    var balance = resolveTicketBalance(profile);
    if (balance == null) balance = 0;

    var isNewUser = false;
    try {
      if (profile && profile.created_at) {
        isNewUser = (Date.now() - new Date(profile.created_at).getTime()) < 60000;
      } else if (window._dayoAuthUser && window._dayoAuthUser.created_at) {
        isNewUser = (Date.now() - new Date(window._dayoAuthUser.created_at).getTime()) < 60000;
      }
    } catch (e2) { isNewUser = false; }

    /* 신규 가입 직후 웰컴 티켓 트리거 지연 — 0으로 확정하지 말고 재시도 */
    if (balance === 0 && isNewUser && retryCount < 2) {
      if (!hydrated) syncPendingUI();
      setTimeout(function () {
        loadUserTicketBalance(userId, retryCount + 1);
      }, 500);
      return null;
    }

    setCount(balance);
    return balance;
  }

  function ensureInitialized() {
    /* Do NOT write default 0 into localStorage — that causes 1→0 flicker for new signups */
    if (!hydrated) syncPendingUI();
  }

  window.DayOTicketWallet = {
    getCount: getCount,
    setCount: setCount,
    addTickets: addTickets,
    syncUI: syncUI,
    syncPendingUI: syncPendingUI,
    ensureInitialized: ensureInitialized,
    isHydrated: isHydrated,
    resolveTicketBalance: resolveTicketBalance,
    loadUserTicketBalance: loadUserTicketBalance
  };

  window.loadUserTicketBalance = loadUserTicketBalance;

  function init() {
    ensureInitialized();
    document.addEventListener('dayo:ticketchange', function (e) {
      if (e.detail && typeof e.detail.ticketCount === 'number') {
        hydrated = true;
        syncUI(e.detail.ticketCount);
      }
    });
    document.addEventListener('dayo:langchange', function () {
      if (hydrated) syncUI();
      else syncPendingUI();
    });
    document.addEventListener('dayo:authchange', function () {
      if (!hydrated) syncPendingUI();
    });
    document.addEventListener('dayo:authprofile', function (e) {
      var profile = e.detail && e.detail.profile;
      var user = e.detail && e.detail.user;
      var balance = resolveTicketBalance(profile);
      var isNew = false;
      try {
        if (user && user.created_at) {
          isNew = (Date.now() - new Date(user.created_at).getTime()) < 60000;
        }
      } catch (err) { isNew = false; }

      if (balance != null && !(balance === 0 && isNew)) {
        setCount(balance);
        return;
      }
      if (user && user.id) {
        loadUserTicketBalance(user.id, 0);
      } else if (!hydrated) {
        syncPendingUI();
      }
    });
    window.addEventListener('storage', function (e) {
      if (!e.key || (e.key !== TICKET_KEY && e.key !== DAYO_TICKET_KEY)) return;
      var n = readCount();
      if (n == null) return;
      hydrated = true;
      syncUI(n);
    });

    document.addEventListener('click', function (e) {
      var gate = e.target.closest('[data-ticket-gate]');
      if (!gate) return;
      if (!hydrated) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
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
