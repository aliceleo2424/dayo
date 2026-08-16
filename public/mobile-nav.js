/* DayO hamburger slide-drawer + in-page nav hashes — index / mypage / partner / room */
(function () {
  'use strict';

  var HASH_ALIASES = {
    about: 'service-intro',
    tutors: 'partners',
    pricing: 'booking'
  };

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
      body.style.overflow = 'auto';
      body.style.pointerEvents = 'auto';
      body.classList.remove('dayo-scroll-locked');
    }
  }

  function navHashId(link) {
    var raw = (link.getAttribute('href') || '').trim();
    if (!raw || raw === '#') return '';
    if (/^(https?:|mailto:|tel:)/i.test(raw)) return '';
    if (raw.charAt(0) === '#') return decodeURIComponent(raw.slice(1).split('?')[0]);
    var hashIdx = raw.indexOf('#');
    if (hashIdx < 0) return '';
    var path = raw.slice(0, hashIdx).replace(/^\.\//, '');
    var there = path.split('/').pop();
    var here = (window.location.pathname.split('/').pop() || 'index.html');
    if (there && there !== here) return '';
    return decodeURIComponent(raw.slice(hashIdx + 1).split('?')[0]);
  }

  function resolveNavTarget(id) {
    var mapped = HASH_ALIASES[id] || id;
    return document.getElementById(mapped) || document.getElementById(id);
  }

  function init() {
    var toggle = document.getElementById('menuToggle');
    var drawer = document.getElementById('mobileNav');
    var backdrop = document.getElementById('mobileNavBackdrop');
    var isRoom = document.body.classList.contains('is-room');

    function isOpen() {
      return !!(drawer && drawer.classList.contains('is-open'));
    }

    function setOpen(open) {
      if (!toggle || !drawer) return;
      var wasOpen = isOpen();
      drawer.classList.toggle('is-open', open);
      drawer.classList.toggle('open', open);
      if (backdrop) {
        backdrop.classList.toggle('is-open', open);
        backdrop.classList.toggle('open', open);
        backdrop.style.pointerEvents = open ? 'auto' : 'none';
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

    document.addEventListener('click', function (e) {
      var link = e.target.closest('a');
      if (!link) return;
      if (!link.closest('header, .nav-desktop, .nav-drawer, .header-inner')) return;
      if (link.hasAttribute('data-booking-open') || link.hasAttribute('data-chat-open') || link.hasAttribute('data-tickets-open')) {
        close();
        return;
      }

      var hash = navHashId(link);
      if (!hash) {
        close();
        return;
      }

      var target = resolveNavTarget(hash);
      if (!target) return;
      e.preventDefault();
      close();
      window.requestAnimationFrame(function () {
        if (typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      if (window.history && window.history.replaceState) {
        try { window.history.replaceState(null, '', '#' + hash); } catch (err) { /* ignore */ }
      }
    });

    if (toggle && drawer) {
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

      close();
    }

    if (window.location.hash) {
      var initial = resolveNavTarget(String(window.location.hash).replace(/^#/, ''));
      if (initial && typeof initial.scrollIntoView === 'function') {
        window.setTimeout(function () {
          initial.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
    }

    window.DayOMobileNav = {
      open: open,
      close: close,
      toggle: function () { setOpen(!isOpen()); }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
