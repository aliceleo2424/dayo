/* DayO 랜딩 GNB 상태 — 로그인 레이아웃과 본인 예약 상태에 따른 헤더 CTA.
 * 랜딩 본문은 로그인과 관계없이 항상 서비스 소개를 보여 준다.
 */
(function () {
  'use strict';

  var USER_KEY = 'userName';
  var CTA_SELECTOR = '.landing-header-cta, .nav-drawer__cta';
  var rows = null;
  var owner = '';
  var pending = null;
  var loadedAt = 0;
  var preparation = null;
  var copy = {
    first: ['첫 대화 시작하기', 'Start your first conversation'],
    next: ['다음 대화 예약하기', 'Book your next conversation'],
    start: ['대화 시작하기', 'Start conversation'],
    preparation: ['예약된 대화 준비', 'Prepare for your conversation'],
    wait: ['대화 시작 5분 전부터 입장할 수 있어요.', 'You can enter 5 minutes before the conversation starts.'],
    close: ['닫기', 'Close'],
    unavailable: ['예약 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.', 'Could not check your booking. Please try again shortly.']
  };

  function label(key) {
    var en = window.DayOI18n && window.DayOI18n.getLang() === 'EN';
    return copy[key][en ? 1 : 0];
  }

  // Same confirmed-booking interval as My Page and room's existing -5/+30 minute guard.
  function conversationState(bookings, now) {
    var upcoming = (bookings || []).filter(function (row) {
      var start = Date.parse(row.scheduled_at);
      return row.status === 'confirmed' && Number.isFinite(start) && start + 30 * 60000 > now;
    }).sort(function (a, b) { return Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at); })[0];
    var completed = (bookings || []).some(function (row) {
      return row.status === 'completed' && (!row.end_reason || row.end_reason === 'normal') &&
        Date.parse(row.scheduled_at) <= now;
    });
    return { booking: upcoming || null, key: upcoming ? 'start' : completed ? 'next' : 'first',
      canEnter: !!upcoming && now >= Date.parse(upcoming.scheduled_at) - 5 * 60000 };
  }

  function currentUserId() {
    return window._dayoAuthUser && window._dayoAuthUser.id || '';
  }

  function renderConversationCta() {
    var authenticated = !!currentUserId();
    var state = conversationState(rows, Date.now());
    document.querySelectorAll(CTA_SELECTOR).forEach(function (button) {
      if (authenticated) {
        // Unknown/loading history must never claim this is the user's first conversation.
        button.removeAttribute('data-i18n');
        button.textContent = label(rows ? state.key : 'next');
      } else {
        button.setAttribute('data-i18n', 'landing.nav.start');
        button.textContent = label('first');
      }
      if (authenticated && state.booking) button.removeAttribute('data-booking-open');
      else button.setAttribute('data-booking-open', '');
      button.disabled = authenticated && rows === null;
    });
    if (preparation && preparation.open) {
      if (!authenticated || !state.booking) { preparation.close(); return; }
      preparation.querySelector('h2').textContent = label('preparation');
      preparation.querySelector('[data-when]').textContent = new Intl.DateTimeFormat(
        window.DayOI18n && window.DayOI18n.getLang() === 'EN' ? 'en-US' : 'ko-KR',
        { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }
      ).format(new Date(state.booking.scheduled_at)) + ' (KST)';
      preparation.querySelector('[data-wait]').textContent = label('wait');
      var enter = preparation.querySelector('[data-enter]');
      enter.textContent = label('start');
      enter.disabled = !state.canEnter;
      preparation.querySelector('[data-close]').textContent = label('close');
    }
  }

  async function refreshConversation(force) {
    var userId = currentUserId();
    if (owner !== userId) { owner = userId; rows = null; loadedAt = 0; pending = null; }
    renderConversationCta();
    if (!userId || !window.supabaseClient) return;
    if (pending) return pending;
    if (!force && loadedAt && Date.now() - loadedAt < 60000) return;
    loadedAt = Date.now();
    var request = (async function () {
      try {
        // One authenticated, owner-scoped read supplies both upcoming and completed status.
        // Avoid the report loader: transcripts/failed reports are not proof of completion.
        var result = await window.supabaseClient.from('bookings')
          .select('id, scheduled_at, status, end_reason')
          .eq('learner_id', userId).in('status', ['confirmed', 'completed'])
          .order('scheduled_at', { ascending: true });
        if (result.error) throw result.error;
        if (currentUserId() !== userId) return false;
        rows = result.data || [];
        loadedAt = Date.now();
        renderConversationCta();
        return true;
      } catch (error) { return false; }
    })();
    pending = request;
    try { return await request; } finally { if (pending === request) pending = null; }
  }

  async function openUpcoming() {
    if (!(await refreshConversation(true))) { window.alert(label('unavailable')); return; }
    var state = conversationState(rows, Date.now());
    if (!state.booking) {
      if (window.DayOBooking) window.DayOBooking.requestOpen();
      return;
    }
    if (state.canEnter) {
      window.location.href = 'room.html?bookingId=' + encodeURIComponent(state.booking.id);
      return;
    }
    if (!preparation) {
      preparation = document.createElement('dialog');
      preparation.style.cssText = 'box-sizing:border-box;width:min(420px,calc(100% - 32px));max-height:calc(100% - 32px);overflow:auto;padding:24px;border:1px solid #F8F0E3;border-radius:20px;background:#FFFBF4;color:#334636;font-family:inherit;';
      preparation.innerHTML = '<h2 style="margin:0 0 16px;font-size:20px"></h2><p data-when></p><p data-wait></p><div style="display:flex;gap:12px;flex-wrap:wrap"><button type="button" data-close></button><button type="button" data-enter></button></div>';
      preparation.querySelectorAll('button').forEach(function (button) {
        button.style.cssText = 'max-width:100%;padding:10px 16px;border:1px solid #5F7D63;border-radius:10px;font:inherit;cursor:pointer;';
      });
      preparation.querySelector('[data-close]').onclick = function () { preparation.close(); };
      preparation.querySelector('[data-enter]').onclick = openUpcoming;
      document.body.appendChild(preparation);
    }
    if (!preparation.open) preparation.showModal();
    renderConversationCta();
  }

  function isLoggedIn() {
    if (typeof window.checkUserLoggedIn === 'function') {
      try { return !!window.checkUserLoggedIn(); } catch (e) { /* ignore */ }
    }
    try {
      return !!(window.localStorage.getItem(USER_KEY) || '').trim();
    } catch (e) {
      return false;
    }
  }

  function syncLoggedInLayout() {
    var loggedIn = isLoggedIn();
    document.body.classList.toggle('is-logged-in', loggedIn);
    document.body.setAttribute('data-auth', loggedIn ? 'logged-in' : 'guest');
    refreshConversation(false);

    if (loggedIn && window.DayOMobileNav) {
      window.DayOMobileNav.close();
    }
  }

  function hookAuthRefresh() {
    if (!window.DayOMode || typeof window.DayOMode.refresh !== 'function') return;
    if (window.DayOMode.__loggedInHomeHooked) return;
    var original = window.DayOMode.refresh;
    window.DayOMode.refresh = function () {
      var result = original.apply(window.DayOMode, arguments);
      syncLoggedInLayout();
      return result;
    };
    window.DayOMode.__loggedInHomeHooked = true;
  }

  function init() {
    syncLoggedInLayout();
    hookAuthRefresh();
    document.addEventListener('click', function (event) {
      var button = event.target.closest(CTA_SELECTOR);
      if (!button || !currentUserId()) return;
      if (!conversationState(rows, Date.now()).booking) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openUpcoming();
    }, true);
    document.addEventListener('dayo:authprofile', function () { refreshConversation(false); });
    document.addEventListener('dayo:langchange', renderConversationCta);
    window.addEventListener('focus', function () { refreshConversation(true); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refreshConversation(true);
    });
    window.setInterval(function () {
      if (!document.hidden) refreshConversation(false);
    }, 1000);

    document.addEventListener('dayo:authchange', function () {
      syncLoggedInLayout();
    });

    var slots = document.querySelectorAll('[data-mode-switch]');
    if (slots.length && typeof MutationObserver !== 'undefined') {
      var observer = new MutationObserver(function () {
        syncLoggedInLayout();
      });
      Array.prototype.forEach.call(slots, function (slot) {
        observer.observe(slot, { childList: true, subtree: true });
      });
    }

    window.addEventListener('storage', function (e) {
      if (!e.key || e.key === USER_KEY) syncLoggedInLayout();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
