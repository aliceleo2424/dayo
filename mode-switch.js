/* DayO 헤더 로그인 버튼 & 인터셉트 모달 — index / mypage / partner / room 공용 */
(function () {
  'use strict';

  var USER_KEY = 'userName';
  var MEMBER_KEY = 'dayo.memberSession';

  var CSS = [
    'a.ms-btn,button.ms-btn{display:inline-flex;align-items:center;gap:.4rem;padding:.55rem 1rem;',
    'border:1px solid var(--coral-pale,#FFE8E3);border-radius:999px;background:transparent;',
    'color:var(--coral,#FF6B57);font-family:inherit;font-size:.82rem;font-weight:700;line-height:1.2;',
    'text-decoration:none;white-space:nowrap;cursor:pointer;',
    'transition:transform .2s,background .2s,border-color .2s;}',
    'a.ms-btn:hover,button.ms-btn:hover{transform:translateY(-1px);border-color:var(--coral,#FF6B57);',
    'background:var(--coral-pale,#FFE8E3);color:var(--coral,#FF6B57);}',
    'a.ms-btn .ms-avatar,button.ms-btn .ms-avatar{display:grid;place-items:center;width:22px;height:22px;',
    'border-radius:50%;background:linear-gradient(135deg,var(--pink,#FFD6DF),var(--peach,#FFE5C4));font-size:.72rem;}',
    '[data-mode-switch="block"]{display:block;margin-top:.5rem;}',
    '[data-mode-switch="block"] a.ms-btn,[data-mode-switch="block"] button.ms-btn{display:flex;width:100%;justify-content:center;}',
    '.ms-overlay{position:fixed;inset:0;z-index:400;display:flex;align-items:center;justify-content:center;',
    'padding:1.25rem;background:rgba(92,74,66,.28);backdrop-filter:blur(8px);opacity:0;visibility:hidden;',
    'transition:opacity .25s;font-family:inherit;}',
    '.ms-overlay.is-open{opacity:1;visibility:visible;}',
    '.ms-modal{width:min(400px,100%);padding:2rem 1.65rem 1.55rem;border-radius:26px;text-align:center;',
    'border:1px solid rgba(255,214,223,.75);background:#fdfbf7;color:var(--text,#5C4A42);',
    'box-shadow:0 26px 60px rgba(113,83,72,.22);transform:translateY(18px);transition:transform .28s;}',
    '.ms-overlay.is-open .ms-modal{transform:translateY(0);}',
    '.ms-key{width:62px;height:62px;display:grid;place-items:center;margin:0 auto 1rem;border-radius:50%;',
    'background:linear-gradient(135deg,var(--pink,#FFD6DF),var(--peach,#FFE5C4));font-size:1.6rem;}',
    '.ms-modal h2{font-size:1.12rem;font-weight:800;letter-spacing:-.03em;line-height:1.45;}',
    '.ms-modal .ms-sub{margin-top:.65rem;color:var(--muted,#9A8580);font-size:.86rem;line-height:1.7;}',
    '.ms-form{display:grid;gap:.65rem;margin-top:1.35rem;text-align:left;}',
    '.ms-input{width:100%;padding:.95rem 1.05rem;border:1px solid var(--coral-pale,#FFE8E3);',
    'border-radius:16px;background:#fff;color:var(--text,#5C4A42);font-family:inherit;font-size:.92rem;',
    'outline:none;box-sizing:border-box;}',
    '.ms-input:focus{border-color:var(--coral,#FF6B57);box-shadow:0 0 0 3px rgba(255,107,87,.12);}',
    '.ms-login{padding:.95rem 1rem;border:none;border-radius:16px;cursor:pointer;font-family:inherit;',
    'font-size:.9rem;font-weight:800;color:#fff;background:var(--coral,#FF6B57);',
    'box-shadow:0 4px 0 var(--coral-dark,#E55A45);}',
    '.ms-login:active{transform:translateY(2px);box-shadow:0 2px 0 var(--coral-dark,#E55A45);}',
    '.ms-dismiss{margin-top:.95rem;border:none;background:none;cursor:pointer;font-family:inherit;',
    'color:var(--muted,#9A8580);font-size:.78rem;font-weight:700;}',
    '.ms-toast{position:fixed;left:50%;bottom:1.5rem;z-index:500;width:max-content;',
    'max-width:calc(100vw - 2rem);padding:.9rem 1.2rem;border-radius:16px;font-family:inherit;',
    'border:1px solid var(--coral-pale,#FFE9E4);background:#FFFCFA;color:var(--text,#594842);',
    'box-shadow:0 12px 34px rgba(113,83,72,.16);font-size:.82rem;font-weight:800;text-align:center;',
    'opacity:0;pointer-events:none;transform:translate(-50%,70px);transition:opacity .3s,transform .38s ease;}',
    '.ms-toast.is-show{opacity:1;transform:translate(-50%,0);}'
  ].join('');

  var overlay;
  var toastEl;
  var toastTimer;
  var pendingHref = null;

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

  function startMemberSession(name) {
    try {
      window.localStorage.setItem(USER_KEY, name);
      window.localStorage.setItem(MEMBER_KEY, 'active');
    } catch (e) { /* ignore */ }
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

    return '<a class="ms-btn" href="' + config.href + '"' +
      (config.loggedIn ? '' : ' data-ms-guard') + '>' + lead + label + '</a>';
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
  }

  function openLogin(href) {
    pendingHref = href || null;
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    var input = overlay.querySelector('#msNickname');
    if (input) {
      input.value = '';
      setTimeout(function () { input.focus(); }, 50);
    }
  }

  function closeLogin() {
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    pendingHref = null;
  }

  function completeLogin(name) {
    var trimmed = String(name || '').trim();
    if (!trimmed) return;
    var next = pendingHref;
    startMemberSession(trimmed);
    pendingHref = null;
    closeLogin();
    render();
    showToast(t('login.welcomeToast', { name: trimmed }));
    if (next) {
      setTimeout(function () {
        window.location.href = next;
      }, 450);
    }
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
      '    <input class="ms-input" type="text" id="msNickname" name="nickname" autocomplete="nickname"',
      '      required maxlength="40" data-i18n="login.nicknamePlaceholder" data-i18n-attr="placeholder"',
      '      placeholder="', t('login.nicknamePlaceholder'), '">',
      '    <button class="ms-login" type="submit" data-i18n="login.startBtn">', t('login.startBtn'), '</button>',
      '  </form>',
      '  <button class="ms-dismiss" type="button" data-ms-close data-i18n="login.dismiss">', t('login.dismiss'), '</button>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.closest('[data-ms-close]')) closeLogin();
    });

    overlay.querySelector('#msLoginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      completeLogin(overlay.querySelector('#msNickname').value);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeLogin();
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
        openLogin(null);
        return;
      }

      var guarded = e.target.closest('[data-ms-guard]');
      if (!guarded || isMember()) return;
      e.preventDefault();
      showToast(t('login.required'));
      openLogin(guarded.getAttribute('href'));
    });

    document.addEventListener('dayo:langchange', function () {
      render();
      if (overlay) {
        var title = overlay.querySelector('#msLoginTitle');
        var desc = overlay.querySelector('.ms-sub');
        var input = overlay.querySelector('#msNickname');
        var submit = overlay.querySelector('.ms-login');
        var dismiss = overlay.querySelector('[data-ms-close]');
        if (title) title.textContent = t('login.title');
        if (desc) desc.textContent = t('login.desc');
        if (input) input.placeholder = t('login.nicknamePlaceholder');
        if (submit) submit.textContent = t('login.startBtn');
        if (dismiss) dismiss.textContent = t('login.dismiss');
      }
    });

    window.DayOMode = {
      isMember: isMember,
      getUserName: getUserName,
      refresh: render,
      toast: showToast,
      openLogin: openLogin
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
