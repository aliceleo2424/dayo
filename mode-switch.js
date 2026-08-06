/* DayO 헤더 로그인 버튼 & 인터셉트 모달 — index / mypage / partner / room 공용 */
(function () {
  'use strict';

  var USER_KEY = 'userName';
  var MEMBER_KEY = 'dayo.memberSession';
  var USERS_KEY = 'dayo_users';
  var EMAIL_KEY = 'dayo_userEmail';

  var CSS = [
    'a.ms-btn,button.ms-btn{display:inline-flex;align-items:center;gap:.4rem;padding:.55rem 1rem;',
    'border:1px solid var(--coral,#FF6B57);border-radius:999px;background:transparent;',
    'color:var(--coral,#FF6B57);font-family:inherit;font-size:.82rem;font-weight:700;line-height:1.2;',
    'text-decoration:none;white-space:nowrap;cursor:pointer;',
    'transition:transform .2s,background .2s,border-color .2s;}',
    'a.ms-btn:hover,button.ms-btn:hover{transform:translateY(-1px);border-color:var(--coral,#FF6B57);',
    'background:var(--coral-pale,#FFE8E3);color:var(--coral,#FF6B57);}',
    'a.ms-btn .ms-avatar,button.ms-btn .ms-avatar{display:grid;place-items:center;width:22px;height:22px;',
    'border-radius:50%;background:linear-gradient(135deg,var(--pink,#FFD6DF),var(--peach,#FFE5C4));font-size:.72rem;}',
    'button.ms-btn .ms-caret{font-size:.7rem;opacity:.75;margin-left:.05rem;}',
    '[data-mode-switch="block"]{display:block;margin-top:.5rem;}',
    '[data-mode-switch="block"] a.ms-btn,[data-mode-switch="block"] button.ms-btn{display:flex;width:100%;justify-content:center;}',
    '.ms-profile{position:relative;display:inline-flex;}',
    '.ms-menu{position:absolute;top:calc(100% + .4rem);right:0;z-index:320;min-width:160px;',
    'padding:.4rem;border-radius:16px;border:1px solid var(--coral-pale,#FFE8E3);background:#fdfbf7;',
    'box-shadow:0 12px 28px rgba(113,83,72,.16);display:none;flex-direction:column;gap:.2rem;}',
    '.ms-profile.is-open .ms-menu{display:flex;}',
    '.ms-menu a,.ms-menu button{display:flex;align-items:center;gap:.4rem;width:100%;padding:.7rem .85rem;',
    'border:none;border-radius:12px;background:transparent;color:var(--text,#5C4A42);',
    'font-family:inherit;font-size:.82rem;font-weight:700;text-decoration:none;cursor:pointer;text-align:left;}',
    '.ms-menu a:hover,.ms-menu button:hover{background:var(--coral-pale,#FFE8E3);color:var(--coral,#FF6B57);}',
    '.ms-menu-status{display:flex;align-items:center;gap:.4rem;width:100%;padding:.65rem .85rem;',
    'border-radius:12px;background:rgba(255,249,196,.55);color:var(--text,#5C4A42);',
    'font-size:.8rem;font-weight:800;pointer-events:none;}',
    '.ms-menu-sep{height:1px;margin:.15rem .35rem;background:rgba(255,209,220,.65);}',
    '[data-mode-switch="block"] .ms-profile{display:block;width:100%;}',
    '[data-mode-switch="block"] .ms-profile > .ms-btn{width:100%;justify-content:center;}',
    '[data-mode-switch="block"] .ms-menu{left:0;right:0;min-width:0;}',
    '.ms-overlay{position:fixed;inset:0;z-index:400;display:flex;align-items:center;justify-content:center;',
    'padding:1.25rem;background:rgba(92,74,66,.28);backdrop-filter:blur(8px);opacity:0;visibility:hidden;',
    'transition:opacity .25s;font-family:inherit;}',
    '.ms-overlay.is-open{opacity:1;visibility:visible;}',
    '.ms-modal{width:min(400px,100%);max-height:min(92vh,720px);overflow-y:auto;padding:1.85rem 1.5rem 1.4rem;',
    'border-radius:26px;text-align:center;border:1px solid rgba(255,214,223,.75);background:#fdfbf7;',
    'color:var(--text,#5C4A42);box-shadow:0 26px 60px rgba(113,83,72,.22);transform:translateY(18px);',
    'transition:transform .28s;}',
    '.ms-overlay.is-open .ms-modal{transform:translateY(0);}',
    '.ms-key{width:62px;height:62px;display:grid;place-items:center;margin:0 auto .9rem;border-radius:50%;',
    'background:linear-gradient(135deg,var(--pink,#FFD6DF),var(--peach,#FFE5C4));font-size:1.6rem;}',
    '.ms-modal h2{font-size:1.08rem;font-weight:800;letter-spacing:-.03em;line-height:1.45;}',
    '.ms-modal .ms-sub{margin-top:.55rem;color:var(--muted,#9A8580);font-size:.84rem;line-height:1.65;}',
    '.ms-form{display:grid;gap:.55rem;margin-top:1.2rem;text-align:left;}',
    '.ms-input{width:100%;padding:.9rem 1rem;border:1px solid var(--coral-pale,#FFE8E3);',
    'border-radius:16px;background:#fff;color:var(--text,#5C4A42);font-family:inherit;font-size:.9rem;',
    'outline:none;box-sizing:border-box;}',
    '.ms-input:focus{border-color:var(--coral,#FF6B57);box-shadow:0 0 0 3px rgba(255,107,87,.12);}',
    '.ms-login{padding:.95rem 1rem;border:none;border-radius:16px;cursor:pointer;font-family:inherit;',
    'font-size:.9rem;font-weight:800;color:#fff;background:var(--coral,#FF6B57);',
    'box-shadow:0 4px 0 var(--coral-dark,#E55A45);}',
    '.ms-login:active{transform:translateY(2px);box-shadow:0 2px 0 var(--coral-dark,#E55A45);}',
    '.ms-divider{display:flex;align-items:center;gap:.55rem;margin:1.15rem 0 .85rem;color:var(--muted,#9A8580);',
    'font-size:.72rem;font-weight:700;letter-spacing:-.01em;}',
    '.ms-divider::before,.ms-divider::after{content:"";flex:1;height:1px;background:rgba(154,133,128,.28);}',
    '.ms-social{display:grid;gap:.5rem;}',
    '.ms-social-btn{display:flex;align-items:center;justify-content:center;gap:.45rem;width:100%;',
    'padding:.85rem 1rem;border-radius:14px;border:none;cursor:pointer;font-family:inherit;',
    'font-size:.84rem;font-weight:800;transition:transform .15s,opacity .15s;}',
    '.ms-social-btn:hover{transform:translateY(-1px);opacity:.96;}',
    '.ms-social-btn--kakao{background:#FEE500;color:#191919;}',
    '.ms-social-btn--naver{background:#03C75A;color:#fff;}',
    '.ms-social-btn--google{background:#fff;color:#5C4A42;border:1px solid rgba(154,133,128,.28);}',
    '.ms-dismiss{margin-top:.9rem;border:none;background:none;cursor:pointer;font-family:inherit;',
    'color:var(--muted,#9A8580);font-size:.78rem;font-weight:700;}',
    '.ms-welcome-overlay{position:fixed;inset:0;z-index:450;display:flex;align-items:center;justify-content:center;',
    'padding:1.25rem;background:rgba(92,74,66,.32);backdrop-filter:blur(8px);opacity:0;visibility:hidden;',
    'transition:opacity .28s;font-family:inherit;}',
    '.ms-welcome-overlay.is-open{opacity:1;visibility:visible;}',
    '.ms-welcome{width:min(380px,100%);padding:2rem 1.55rem 1.5rem;border-radius:26px;text-align:center;',
    'border:1px solid rgba(255,214,223,.8);background:linear-gradient(180deg,#FFFCFA,#fdfbf7);',
    'color:var(--text,#5C4A42);box-shadow:0 26px 60px rgba(113,83,72,.24);transform:translateY(16px) scale(.97);',
    'transition:transform .3s;}',
    '.ms-welcome-overlay.is-open .ms-welcome{transform:translateY(0) scale(1);}',
    '.ms-welcome-emoji{font-size:2.2rem;margin-bottom:.7rem;}',
    '.ms-welcome h2{font-size:1.12rem;font-weight:800;line-height:1.45;letter-spacing:-.03em;}',
    '.ms-welcome p{margin-top:.7rem;color:var(--muted,#9A8580);font-size:.88rem;line-height:1.7;}',
    '.ms-welcome .ms-login{margin-top:1.25rem;width:100%;}',
    '.ms-toast{position:fixed;left:50%;bottom:1.5rem;z-index:500;width:max-content;',
    'max-width:calc(100vw - 2rem);padding:.9rem 1.2rem;border-radius:16px;font-family:inherit;',
    'border:1px solid var(--coral-pale,#FFE9E4);background:#FFFCFA;color:var(--text,#594842);',
    'box-shadow:0 12px 34px rgba(113,83,72,.16);font-size:.82rem;font-weight:800;text-align:center;',
    'opacity:0;pointer-events:none;transform:translate(-50%,70px);transition:opacity .3s,transform .38s ease;}',
    '.ms-toast.is-show{opacity:1;transform:translate(-50%,0);}'
  ].join('');

  var overlay;
  var welcomeOverlay;
  var toastEl;
  var toastTimer;
  var welcomeTimer;
  var pendingHref = null;

  var SOCIAL = {
    kakao: { name: '카카오 유저', email: 'kakao_test@dayo.app' },
    naver: { name: '네이버 유저', email: 'naver_test@dayo.app' },
    google: { name: '구글 유저', email: 'google_test@dayo.app' }
  };

  function t(key, vars) {
    if (!window.DayOI18n) return key;
    if (vars) return window.DayOI18n.tf(key, vars);
    return window.DayOI18n.t(key);
  }

  function applyI18n() {
    if (window.DayOI18n) window.DayOI18n.apply();
  }

  function getUserName() {
    try {
      return (window.localStorage.getItem(USER_KEY) || '').trim();
    } catch (e) {
      return '';
    }
  }

  function isMember() {
    return !!getUserName();
  }

  function readUsers() {
    try {
      var raw = window.localStorage.getItem(USERS_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeUsers(users) {
    try {
      window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } catch (e) { /* ignore */ }
  }

  function findUserByEmail(email) {
    var needle = String(email || '').trim().toLowerCase();
    var users = readUsers();
    for (var i = 0; i < users.length; i++) {
      if (String(users[i].email || '').toLowerCase() === needle) return users[i];
    }
    return null;
  }

  function upsertUser(user) {
    var users = readUsers();
    var email = String(user.email || '').trim().toLowerCase();
    var found = false;
    for (var i = 0; i < users.length; i++) {
      if (String(users[i].email || '').toLowerCase() === email) {
        users[i] = user;
        found = true;
        break;
      }
    }
    if (!found) users.push(user);
    writeUsers(users);
  }

  function nameFromEmail(email) {
    var local = String(email || '').split('@')[0] || 'DayO';
    return local.replace(/[._-]+/g, ' ').trim() || 'DayO';
  }

  function startMemberSession(name, email) {
    try {
      window.localStorage.setItem(USER_KEY, name);
      window.localStorage.setItem(MEMBER_KEY, 'active');
      if (email) window.localStorage.setItem(EMAIL_KEY, email);
    } catch (e) { /* ignore */ }
  }

  function markNewUserChatPreset() {
    try {
      if (window.DayOChatPrefs && typeof window.DayOChatPrefs.markFirstUser === 'function') {
        window.DayOChatPrefs.markFirstUser(true);
        window.DayOChatPrefs.applyFirstUserPresetIfNeeded();
        return;
      }
      window.localStorage.setItem('dayo.isFirstUser', '1');
    } catch (e) { /* ignore */ }
  }

  function clearMemberSession() {
    try {
      window.localStorage.removeItem(USER_KEY);
      window.localStorage.removeItem(MEMBER_KEY);
      window.localStorage.removeItem(EMAIL_KEY);
    } catch (e) { /* ignore */ }
  }

  function notifyAuthChange() {
    var loggedIn = isMember();
    document.dispatchEvent(new CustomEvent('dayo:authchange', {
      detail: {
        loggedIn: loggedIn,
        userName: getUserName()
      }
    }));
  }

  function closeAllMenus() {
    Array.prototype.forEach.call(document.querySelectorAll('.ms-profile.is-open'), function (el) {
      el.classList.remove('is-open');
      var toggle = el.querySelector('[data-ms-profile-toggle]');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    });
  }

  function logout() {
    closeAllMenus();
    clearTimeout(welcomeTimer);
    closeWelcome();
    clearMemberSession();
    render();
    notifyAuthChange();
    showToast(t('login.logoutToast'));

    var leaf = (window.location.pathname || '').split('/').pop() || '';
    if (leaf && leaf !== 'index.html' && leaf !== 'index.htm') {
      window.location.href = 'index.html';
      return;
    }
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      window.scrollTo(0, 0);
    }
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('is-show');
    }, 3200);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function buttonFor(role) {
    var name = getUserName();

    if (role === 'partner') {
      return { href: 'mypage.html', icon: '🎓', i18n: 'nav.learnerMypage' };
    }
    if (role === 'member') {
      return { href: 'partner.html', icon: '☕', i18n: 'nav.partnerStudio' };
    }

    if (name) {
      return {
        href: 'mypage.html',
        avatar: '👤',
        label: t('login.greetingFormat', { name: name }),
        loggedIn: true
      };
    }

    return {
      href: '#',
      icon: '🔑',
      i18n: 'login.headerBtn',
      openLogin: true
    };
  }

  function markup(config) {
    var lead = config.avatar
      ? '<span class="ms-avatar" aria-hidden="true">' + config.avatar + '</span>'
      : '<span aria-hidden="true">' + config.icon + '</span>';
    var label = config.label
      ? '<span>' + escapeHtml(config.label) + '</span>'
      : '<span data-i18n="' + config.i18n + '">' + t(config.i18n) + '</span>';

    if (config.openLogin) {
      return '<button class="ms-btn" type="button" data-ms-open-login>' + lead + label + '</button>';
    }

    if (config.loggedIn) {
      var ticketLabel = '☕️ 보유 티켓: 1장';
      try {
        if (window.DayOTicketWallet && typeof window.DayOTicketWallet.getCount === 'function') {
          ticketLabel = '☕️ 보유 티켓: ' + window.DayOTicketWallet.getCount() + '장';
        }
      } catch (e) { /* ignore */ }

      return [
        '<div class="ms-profile">',
        '  <button class="ms-btn" type="button" data-ms-profile-toggle aria-expanded="false" aria-haspopup="true">',
        lead, label,
        '  <span class="ms-caret" aria-hidden="true">▾</span>',
        '  </button>',
        '  <div class="ms-menu" role="menu">',
        '    <div class="ms-menu-status" role="presentation"><span data-ticket-badge-text>', ticketLabel, '</span></div>',
        '    <button type="button" role="menuitem" data-tickets-open>🎟️ 이용권 구매 / 충전</button>',
        '    <div class="ms-menu-sep" aria-hidden="true"></div>',
        '    <a href="mypage.html" role="menuitem">👤 ', t('nav.mypage'), '</a>',
        '    <button type="button" role="menuitem" data-ms-logout>🚪 ', t('login.logout'), '</button>',
        '  </div>',
        '</div>'
      ].join('');
    }

    return '<a class="ms-btn" href="' + config.href + '" data-ms-guard>' + lead + label + '</a>';
  }

  function render() {
    var role = document.body.dataset.dayoRole || 'learner';
    if (role === 'partner' || role === 'member') {
      try { window.localStorage.setItem(MEMBER_KEY, 'active'); } catch (e) { /* ignore */ }
    }

    var html = markup(buttonFor(role));
    var slots = document.querySelectorAll('[data-mode-switch]');
    Array.prototype.forEach.call(slots, function (slot) {
      slot.innerHTML = html;
    });
    applyI18n();
    if (window.DayOTicketWallet && typeof window.DayOTicketWallet.syncUI === 'function') {
      window.DayOTicketWallet.syncUI();
    }
  }

  function openLogin(href) {
    pendingHref = href || null;
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    var emailInput = overlay.querySelector('#msEmail');
    var passInput = overlay.querySelector('#msPassword');
    if (emailInput) emailInput.value = '';
    if (passInput) passInput.value = '';
    if (emailInput) setTimeout(function () { emailInput.focus(); }, 50);
  }

  function closeLogin() {
    overlay.classList.remove('is-open');
    if (!welcomeOverlay || !welcomeOverlay.classList.contains('is-open')) {
      document.body.style.overflow = '';
    }
  }

  function openWelcome(name) {
    if (!welcomeOverlay) return;
    var title = welcomeOverlay.querySelector('#msWelcomeTitle');
    var body = welcomeOverlay.querySelector('#msWelcomeBody');
    if (title) title.textContent = t('login.welcomeTitle', { name: name });
    if (body) body.textContent = t('login.welcomeBody');
    welcomeOverlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeWelcome() {
    if (!welcomeOverlay) return;
    welcomeOverlay.classList.remove('is-open');
    if (!overlay.classList.contains('is-open')) document.body.style.overflow = '';
  }

  function finishAuth(name, email, options) {
    options = options || {};
    var next = pendingHref;
    pendingHref = null;
    startMemberSession(name, email);
    closeLogin();
    render();
    notifyAuthChange();

    if (options.isNew) {
      markNewUserChatPreset();
      clearTimeout(welcomeTimer);
      welcomeTimer = setTimeout(function () {
        openWelcome(name);
      }, 1000);
      return;
    }

    showToast(t('login.welcomeToast', { name: name }));
    if (next) {
      setTimeout(function () {
        window.location.href = next;
      }, 450);
    }
  }

  function handleEmailAuth(email, password) {
    var cleanedEmail = String(email || '').trim().toLowerCase();
    var cleanedPass = String(password || '');
    if (!cleanedEmail || !cleanedPass) return;

    var existing = findUserByEmail(cleanedEmail);
    if (existing) {
      if (existing.password && existing.password !== cleanedPass) {
        showToast(t('login.passwordMismatch'));
        return;
      }
      finishAuth(existing.name || nameFromEmail(cleanedEmail), cleanedEmail, { isNew: false });
      return;
    }

    var name = nameFromEmail(cleanedEmail);
    upsertUser({ email: cleanedEmail, password: cleanedPass, name: name, provider: 'email' });
    finishAuth(name, cleanedEmail, { isNew: true });
  }

  function handleSocialAuth(provider) {
    var data = SOCIAL[provider];
    if (!data) return;
    var existing = findUserByEmail(data.email);
    var isNew = !existing;
    if (isNew) {
      upsertUser({ email: data.email, password: '', name: data.name, provider: provider });
    }
    finishAuth(data.name, data.email, { isNew: isNew });
  }

  function syncLoginI18n() {
    if (!overlay) return;
    var title = overlay.querySelector('#msLoginTitle');
    var desc = overlay.querySelector('.ms-sub');
    var email = overlay.querySelector('#msEmail');
    var pass = overlay.querySelector('#msPassword');
    var submit = overlay.querySelector('.ms-login');
    var divider = overlay.querySelector('.ms-divider');
    var kakao = overlay.querySelector('[data-ms-social="kakao"]');
    var naver = overlay.querySelector('[data-ms-social="naver"]');
    var google = overlay.querySelector('[data-ms-social="google"]');
    var dismiss = overlay.querySelector('[data-ms-close]');
    if (title) title.textContent = t('login.title');
    if (desc) desc.textContent = t('login.desc');
    if (email) email.placeholder = t('login.emailPlaceholder');
    if (pass) pass.placeholder = t('login.passwordPlaceholder');
    if (submit) submit.textContent = t('login.startBtn');
    if (divider) divider.textContent = t('login.socialDivider');
    if (kakao) kakao.textContent = t('login.social.kakao');
    if (naver) naver.textContent = t('login.social.naver');
    if (google) google.textContent = t('login.social.google');
    if (dismiss) dismiss.textContent = t('login.dismiss');
  }

  function mountLogin() {
    overlay = document.createElement('div');
    overlay.className = 'ms-overlay';
    overlay.innerHTML = [
      '<div class="ms-modal" role="dialog" aria-modal="true" aria-labelledby="msLoginTitle">',
      '  <div class="ms-key" aria-hidden="true">☕️</div>',
      '  <h2 id="msLoginTitle" data-i18n="login.title">', t('login.title'), '</h2>',
      '  <p class="ms-sub" data-i18n="login.desc">', t('login.desc'), '</p>',
      '  <form class="ms-form" id="msLoginForm">',
      '    <input class="ms-input" type="email" id="msEmail" name="email" autocomplete="email" required',
      '      data-i18n="login.emailPlaceholder" data-i18n-attr="placeholder"',
      '      placeholder="', t('login.emailPlaceholder'), '">',
      '    <input class="ms-input" type="password" id="msPassword" name="password" autocomplete="current-password" required',
      '      minlength="4" data-i18n="login.passwordPlaceholder" data-i18n-attr="placeholder"',
      '      placeholder="', t('login.passwordPlaceholder'), '">',
      '    <button class="ms-login" type="submit" data-i18n="login.startBtn">', t('login.startBtn'), '</button>',
      '  </form>',
      '  <div class="ms-divider" data-i18n="login.socialDivider">', t('login.socialDivider'), '</div>',
      '  <div class="ms-social">',
      '    <button class="ms-social-btn ms-social-btn--kakao" type="button" data-ms-social="kakao">', t('login.social.kakao'), '</button>',
      '    <button class="ms-social-btn ms-social-btn--naver" type="button" data-ms-social="naver">', t('login.social.naver'), '</button>',
      '    <button class="ms-social-btn ms-social-btn--google" type="button" data-ms-social="google">', t('login.social.google'), '</button>',
      '  </div>',
      '  <button class="ms-dismiss" type="button" data-ms-close data-i18n="login.dismiss">', t('login.dismiss'), '</button>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);

    welcomeOverlay = document.createElement('div');
    welcomeOverlay.className = 'ms-welcome-overlay';
    welcomeOverlay.innerHTML = [
      '<div class="ms-welcome" role="dialog" aria-modal="true" aria-labelledby="msWelcomeTitle">',
      '  <div class="ms-welcome-emoji" aria-hidden="true">🎉</div>',
      '  <h2 id="msWelcomeTitle"></h2>',
      '  <p id="msWelcomeBody"></p>',
      '  <button class="ms-login" type="button" data-ms-welcome-close data-i18n="login.welcomeCta">', t('login.welcomeCta'), '</button>',
      '</div>'
    ].join('');
    document.body.appendChild(welcomeOverlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.closest('[data-ms-close]')) {
        pendingHref = null;
        closeLogin();
      }
    });

    overlay.querySelector('#msLoginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      handleEmailAuth(
        overlay.querySelector('#msEmail').value,
        overlay.querySelector('#msPassword').value
      );
    });

    overlay.addEventListener('click', function (e) {
      var social = e.target.closest('[data-ms-social]');
      if (!social) return;
      handleSocialAuth(social.getAttribute('data-ms-social'));
    });

    welcomeOverlay.addEventListener('click', function (e) {
      if (e.target === welcomeOverlay || e.target.closest('[data-ms-welcome-close]')) {
        closeWelcome();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (welcomeOverlay.classList.contains('is-open')) closeWelcome();
      else if (overlay.classList.contains('is-open')) {
        pendingHref = null;
        closeLogin();
      }
      closeAllMenus();
    });
  }

  function init() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    toastEl = document.createElement('div');
    toastEl.className = 'ms-toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastEl);

    mountLogin();
    render();

    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-ms-open-login]')) {
        e.preventDefault();
        closeAllMenus();
        openLogin(null);
        return;
      }

      var logoutBtn = e.target.closest('[data-ms-logout]');
      if (logoutBtn) {
        e.preventDefault();
        logout();
        return;
      }

      var profileToggle = e.target.closest('[data-ms-profile-toggle]');
      if (profileToggle) {
        e.preventDefault();
        var wrap = profileToggle.closest('.ms-profile');
        var willOpen = !wrap.classList.contains('is-open');
        closeAllMenus();
        if (willOpen) {
          wrap.classList.add('is-open');
          profileToggle.setAttribute('aria-expanded', 'true');
        }
        return;
      }

      if (!e.target.closest('.ms-profile')) closeAllMenus();

      var ticketsOpen = e.target.closest('[data-tickets-open]');
      if (ticketsOpen) {
        closeAllMenus();
      }
      var guarded = e.target.closest('[data-ms-guard]');
      if (!guarded || isMember()) return;
      e.preventDefault();
      showToast(t('login.required'));
      openLogin(guarded.getAttribute('href'));
    });

    document.addEventListener('dayo:langchange', function () {
      render();
      syncLoginI18n();
      if (welcomeOverlay && welcomeOverlay.classList.contains('is-open')) {
        openWelcome(getUserName() || 'DayO');
        var cta = welcomeOverlay.querySelector('[data-ms-welcome-close]');
        if (cta) cta.textContent = t('login.welcomeCta');
      }
    });

    window.DayOMode = {
      isMember: isMember,
      getUserName: getUserName,
      refresh: render,
      toast: showToast,
      openLogin: openLogin,
      notifyAuthChange: notifyAuthChange
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
