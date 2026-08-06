/* DayO 로그인 유저 메인 대시보드 레이아웃 토글 — index.html 전용
 * (로그인/회원가입 모달·로그아웃·i18n 로직은 수정하지 않음)
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

    // 모바일 메뉴가 열린 채 로그인되면 닫아 레이아웃 충돌 방지
    if (loggedIn) {
      var mobileNav = document.getElementById('mobileNav');
      var menuToggle = document.getElementById('menuToggle');
      if (mobileNav) mobileNav.classList.remove('open');
      if (menuToggle) {
        menuToggle.setAttribute('aria-expanded', 'false');
      }
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
