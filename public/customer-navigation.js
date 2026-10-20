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
    // Logged-out visitors get the "see it first" set (how it works, example letterbox / bookshelf, log in); members keep their tabs.
    var guestLinks = [
      links[0],
      ['/#how', 'how', 'landing.nav.how', '이용 방법', '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>'],
      ['/letters-demo.html', 'letters', 'customer.nav.letters', '편지함', links[3][4]],
      ['/demo-story.html', 'shelf', 'customer.nav.shelf', '책장', '<path d="M4 5a2 2 0 0 1 2-2h6v16H6a2 2 0 0 0-2 2z"/><path d="M20 5a2 2 0 0 0-2-2h-6v16h6a2 2 0 0 1 2 2z"/>'],
      ['#login', 'login', 'customer.nav.login', '로그인', links[1][4]]
    ];
    var bottom = document.createElement('nav');
    bottom.className = 'customer-bottom-nav';
    bottom.setAttribute('aria-label', '모바일 주요 메뉴');
    function isMember() { return typeof window.checkUserLoggedIn === 'function' && window.checkUserLoggedIn(); }
    var bottomMode = '';
    function renderBottom() {
      var mode = isMember() ? 'in' : 'out';
      if (mode === bottomMode) return;
      bottomMode = mode;
      bottom.innerHTML = (mode === 'in' ? links : guestLinks).map(function (l) {
        return '<a href="' + l[0] + '" data-customer-route="' + l[1] + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + l[4] + '</svg><span data-i18n="' + l[2] + '">' + l[3] + '</span></a>';
      }).join('');
      if (window.DayOI18n) window.DayOI18n.apply();
      active();
    }
    // Desktop top menu: My Page lives in the account menu / login button; logged-out visitors also see the example bookshelf.
    var desktopNav = document.querySelector('.customer-desktop-nav');
    var navLetters = desktopNav && desktopNav.querySelector('[data-customer-route="letters"]');
    var navShelf = null;
    function syncDesktopNav() {
      if (!desktopNav) return;
      var member = isMember();
      var mine = desktopNav.querySelector('[data-customer-route="mypage"]');
      if (mine) mine.hidden = true;
      if (navLetters) navLetters.setAttribute('href', member ? '/mypage.html#talkArchiveTitle' : '/letters-demo.html');
      if (!navShelf && navLetters) {
        navShelf = document.createElement('a');
        navShelf.href = '/demo-story.html'; navShelf.setAttribute('data-customer-route', 'shelf');
        navShelf.setAttribute('data-i18n', 'customer.nav.shelf'); navShelf.textContent = '책장';
        navLetters.insertAdjacentElement('afterend', navShelf);
        if (window.DayOI18n) window.DayOI18n.apply();
      }
      if (navShelf) navShelf.hidden = member;
    }
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
      var inHeader = innerWidth >= 768;
      if (inHeader && accountControl.parentNode !== headerActions) {
        accountControl.className = 'customer-account';
        headerActions.insertBefore(accountControl, headerActions.querySelector('.header-cta') || headerActions.firstChild);
      } else if (!inHeader && accountControl.parentNode !== drawer) {
        accountControl.className = accountClasses;
        drawer.insertBefore(accountControl, drawer.firstChild);
      } else return;
      if (window.DayOMode && typeof window.DayOMode.refresh === 'function') window.DayOMode.refresh();
    }
    function syncAuthUi() { accountPlacement(); renderBottom(); syncDesktopNav(); }
    syncAuthUi();
    setTimeout(syncAuthUi, 1500);
    document.addEventListener('dayo:authchange', function () { setTimeout(syncAuthUi, 0); });
    try { window.supabaseClient && window.supabaseClient.auth.onAuthStateChange(function () { setTimeout(syncAuthUi, 0); }); } catch (_) {}
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
      var view = page === 'letters-demo' ? 'letters' : page === 'landing' ? body.getAttribute('data-customer-view') || 'home' : page === 'mypage' && (location.hash === '#talkArchiveTitle' || location.hash === '#letters') ? 'letters' : page;
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
      if (a.dataset.customerRoute === 'login' && openLogin) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (window.DayOMobileNav) window.DayOMobileNav.close();
        if (window.DayOMode && typeof window.DayOMode.openLogin === 'function') window.DayOMode.openLogin(location.pathname + location.search); else openLogin();
        return;
      }
      if (a.dataset.customerRoute === 'mypage' && typeof window.checkUserLoggedIn === 'function' && !window.checkUserLoggedIn() && openLogin) {
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
