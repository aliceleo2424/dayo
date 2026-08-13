/* DayO hamburger slide-drawer — index / mypage / partner / room */
(function () {
  'use strict';

  function t(key, fallback) {
    if (window.DayOI18n && typeof window.DayOI18n.t === 'function') {
      return window.DayOI18n.t(key);
    }
    return fallback;
  }

  function lockScroll() {
    if (window.DayOScrollLock) window.DayOScrollLock.lock();
  }

  function unlockScroll() {
    if (window.DayOScrollLock) window.DayOScrollLock.unlock();
    else {
      var html = document.documentElement;
      var body = document.body;
      ['overflow', 'overflowX', 'overflowY', 'position', 'top', 'left', 'right', 'width', 'paddingRight', 'transform'].forEach(function (prop) {
        html.style[prop] = '';
        body.style[prop] = '';
      });
      body.classList.remove('dayo-scroll-locked');
    }
  }

  function init() {
    var toggle = document.getElementById('menuToggle');
    var drawer = document.getElementById('mobileNav');
    var backdrop = document.getElementById('mobileNavBackdrop');
    if (!toggle || !drawer) return;

    var isRoom = document.body.classList.contains('is-room');

    function isOpen() {
      return drawer.classList.contains('is-open');
    }

    function setOpen(open) {
      var wasOpen = isOpen();
      drawer.classList.toggle('is-open', open);
      drawer.classList.toggle('open', open);
      if (backdrop) {
        backdrop.classList.toggle('is-open', open);
        backdrop.classList.toggle('open', open);
      }
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? t('nav.menuClose', '메뉴 닫기') : t('nav.menuOpen', '메뉴 열기'));
      toggle.textContent = open ? '✕' : '☰';
      document.body.classList.toggle('nav-drawer-open', open);

      if (isRoom) return;
      if (open && !wasOpen) lockScroll();
      if (!open && wasOpen) unlockScroll();
    }

    function close() { setOpen(false); }
    function open() { setOpen(true); }

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!isOpen());
    });

    if (backdrop) backdrop.addEventListener('click', close);

    drawer.addEventListener('click', function (e) {
      if (e.target.closest('.i18n-wrap')) return;
      var target = e.target.closest('a, button, [data-nav-close], [data-booking-open], [data-chat-open], [data-tickets-open]');
      if (target) close();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) close();
    });

    document.addEventListener('dayo:langchange', function () {
      toggle.setAttribute('aria-label', isOpen() ? t('nav.menuClose', '메뉴 닫기') : t('nav.menuOpen', '메뉴 열기'));
    });

    window.DayOMobileNav = { open: open, close: close, toggle: function () { setOpen(!isOpen()); } };
    close();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
