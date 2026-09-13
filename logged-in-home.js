/* DayO 랜딩 GNB 상태 — 로그인 여부로 is-logged-in 만 토글한다.
 * 랜딩 본문은 로그인과 관계없이 항상 서비스 소개를 보여 준다.
 */
(function () {
  'use strict';

  var USER_KEY = 'userName';

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
