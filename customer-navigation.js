/* Customer navigation only. Room and Partner navigation remain on mobile-nav.js. */
(function () {
  'use strict';
  function init() {
    var body = document.body;
    var page = body.getAttribute('data-customer-page');
    if (!page) return;
    var links = [
      ['/', 'home', 'customer.nav.home', '홈', '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3z"/>'],
      ['/mypage.html', 'mypage', 'nav.mypage', '마이페이지', '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'],
      ['/#pricing', 'pricing', 'landing.nav.pricing', '티켓', '<path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4z"/><path d="M14 5v3m0 3v2m0 3v3"/>'],
      ['/mypage.html#talkArchiveTitle', 'letters', 'customer.nav.letters', '편지함', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>']
    ];
    var bottom = document.createElement('nav');
    bottom.className = 'customer-bottom-nav';
    bottom.setAttribute('aria-label', '모바일 주요 메뉴');
    bottom.innerHTML = links.map(function (l) {
      return '<a href="' + l[0] + '" data-customer-route="' + l[1] + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + l[4] + '</svg><span data-i18n="' + l[2] + '">' + l[3] + '</span></a>';
    }).join('');
    body.appendChild(bottom);
    var drawer = document.getElementById('mobileNav');
    var toggle = document.getElementById('menuToggle');
    // One account control ("Alice ▾", with tickets / My Page / logout) in the same desktop header spot on every
    // customer page; phones keep it at the top of the drawer. Logged-out visitors keep it in the drawer.
    var accountControl = drawer && drawer.querySelector('[data-mode-switch]');
    var headerActions = document.querySelector('body > header .header-actions, body > header .topbar-right');
    var accountClasses = accountControl ? accountControl.className : '';
    function accountPlacement() {
      if (!accountControl || !headerActions) return;
      var loggedIn = typeof window.checkUserLoggedIn === 'function' && window.checkUserLoggedIn();
      var inHeader = innerWidth >= 768 && loggedIn;
      if (inHeader && accountControl.parentNode !== headerActions) {
        accountControl.className = 'customer-account';
        headerActions.insertBefore(accountControl, headerActions.querySelector('.header-cta') || headerActions.firstChild);
      } else if (!inHeader && accountControl.parentNode !== drawer) {
        accountControl.className = accountClasses;
        drawer.insertBefore(accountControl, drawer.firstChild);
      } else return;
      if (window.DayOMode && typeof window.DayOMode.refresh === 'function') window.DayOMode.refresh();
    }
    accountPlacement();
    setTimeout(accountPlacement, 1500);
    document.addEventListener('dayo:authchange', accountPlacement);
    if (drawer && toggle) {
      function syncDrawer() {
        var open = toggle.getAttribute('aria-expanded') === 'true';
        drawer.inert = !open;
        drawer.setAttribute('aria-hidden', String(!open));
        if (!open && drawer.contains(document.activeElement)) toggle.focus();
      }
      new MutationObserver(syncDrawer).observe(toggle, { attributes: true, attributeFilter: ['aria-expanded'] });
      syncDrawer();
      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Tab' || toggle.getAttribute('aria-expanded') !== 'true') return;
        var items = [toggle].concat(Array.from(drawer.querySelectorAll('a[href],button:not(:disabled),select,input:not(:disabled)')).filter(function (el) { return el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'; }));
        var current = items.indexOf(document.activeElement);
        event.preventDefault();
        items[(current + (event.shiftKey ? items.length - 1 : 1)) % items.length].focus();
      });
    }
    function active() {
      var view = page === 'landing' ? body.getAttribute('data-customer-view') || 'home' : page === 'mypage' && (location.hash === '#talkArchiveTitle' || location.hash === '#letters') ? 'letters' : page;
      document.querySelectorAll('[data-customer-route]').forEach(function (a) {
        var selected = a.getAttribute('data-customer-route') === view;
        a.classList.toggle('is-current', selected);
        if (selected) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      // The letters view (letterbox.js) replaces My Page content; no archive scroll.
    }
    // Delegate view routing before the old hash-scroll handler. Existing drawer API owns locking.
    document.addEventListener('click', function (event) {
      var a = event.target.closest('a[data-customer-route]');
      if (!a || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var url = new URL(a.href, location.href);
      // Logged-out 편지함/마이페이지 opens the login modal on every customer page (home has no role-switch.js),
      // then continues to the chosen page after login via DayOMode's pending link.
      var openLogin = window.DayOMode && typeof window.DayOMode.openLogin === 'function' ? function () { window.DayOMode.openLogin(a.getAttribute('href')); }
        : typeof window.openLoginModal === 'function' ? window.openLoginModal : null;
      if ((a.dataset.customerRoute === 'mypage' || a.dataset.customerRoute === 'letters') && typeof window.checkUserLoggedIn === 'function' && !window.checkUserLoggedIn() && openLogin) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (window.DayOMobileNav) window.DayOMobileNav.close();
        openLogin();
        return;
      }
      if (page === 'landing' && url.origin === location.origin && ['/', '/index.html', '/index'].indexOf(url.pathname) !== -1 && !url.search && window.DayOLandingViews) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (window.DayOMobileNav) window.DayOMobileNav.close();
        window.DayOLandingViews.navigate(url.hash);
      } else if (window.DayOMobileNav) window.DayOMobileNav.close();
    }, true);
    window.addEventListener('hashchange', active);
    window.addEventListener('hashchange', accountPlacement);
    document.addEventListener('dayo:customer-view', active);
    function labelNavigation() {
      bottom.setAttribute('aria-label', window.DayOI18n && window.DayOI18n.getLang() === 'EN' ? 'Mobile navigation' : '모바일 주요 메뉴');
    }
    document.addEventListener('dayo:langchange', labelNavigation);
    window.addEventListener('resize', function () {
      if (innerWidth >= 768 && window.DayOMobileNav && body.classList.contains('nav-drawer-open')) window.DayOMobileNav.close();
      accountPlacement();
    });
    // Desktop logout outside My Page (owner request 2026-10-15): reuses auth.js handleLogout; phones keep the drawer button.
    var logoutHost = page !== 'mypage' && !accountControl && document.querySelector('body > header .header-actions, body > header .topbar-right');
    if (logoutHost && typeof window.handleLogout === 'function') {
      var logoutButton = document.createElement('button');
      logoutButton.type = 'button'; logoutButton.className = 'customer-logout'; logoutButton.hidden = true;
      logoutButton.setAttribute('data-i18n', 'landing.nav.logout'); logoutButton.textContent = '로그아웃';
      logoutButton.addEventListener('click', function (event) { window.handleLogout(event); });
      logoutHost.insertBefore(logoutButton, logoutHost.querySelector('.header-cta') || null);
      var syncLogout = function () { logoutButton.hidden = !(typeof window.checkUserLoggedIn === 'function' && window.checkUserLoggedIn()); };
      syncLogout(); setTimeout(syncLogout, 1500);
      try { window.supabaseClient && window.supabaseClient.auth.onAuthStateChange(function () { setTimeout(syncLogout, 0); }); } catch (_) {}
    }
    if (window.DayOI18n) window.DayOI18n.apply();
    labelNavigation();
    active();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
