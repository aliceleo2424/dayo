/* DayO 로그인 유저 메인 — 상단 대시보드 카드 + 랜딩 섹션 유지
 * 로그인/로그아웃 시 dayo:authchange 로 is-logged-in 클래스를 토글한다.
 */
(function () {
  'use strict';

  var USER_KEY = 'userName';

  function isLoggedIn() {
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
