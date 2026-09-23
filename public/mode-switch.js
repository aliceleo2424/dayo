/* DayO 헤더 로그인 버튼 & 인터셉트 모달 — index / mypage / partner / room 공용 */
(function () {
  'use strict';

  window.handleNaverFastLogin = function(e) {
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    if (typeof window.DayOMode === 'object' && typeof window.DayOMode.openLogin === 'function') {
      window.DayOMode.openLogin();
      return;
    }
    var modal = document.getElementById('login-modal')
      || document.querySelector('.login-modal-overlay')
      || document.querySelector('.ms-overlay');
    if (modal) {
      modal.style.display = 'flex';
      modal.classList.add('is-open');
    }
  };

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
    '.ms-overlay{position:fixed;inset:0;z-index:400;display:none;align-items:center;justify-content:center;',
    'padding:1.25rem;background:rgba(92,74,66,.28);backdrop-filter:blur(8px);opacity:0;visibility:hidden;',
    'pointer-events:none;width:100%;max-width:100%;overflow-x:hidden;box-sizing:border-box;',
    'transition:opacity .25s;font-family:inherit;}',
    '.ms-overlay.is-open{display:flex;opacity:1;visibility:visible;pointer-events:auto;}',
    '.ms-modal{width:min(400px,100%);max-height:min(92vh,720px);overflow-y:auto;padding:1.85rem 1.5rem 1.4rem;',
    'border-radius:26px;text-align:center;border:1px solid rgba(255,214,223,.75);background:#fdfbf7;',
    'color:var(--text,#5C4A42);box-shadow:0 26px 60px rgba(113,83,72,.22);transform:translateY(18px);',
    'transition:transform .28s;}',
    '.ms-overlay.is-open .ms-modal{transform:translateY(0);}',
    '.ms-key{display:flex;align-items:center;justify-content:center;margin:0 auto .75rem;background:transparent;}',
    '.ms-key img{display:block;height:56px;width:auto;max-width:180px;object-fit:contain;object-position:center;background:transparent;}',
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
    '.ms-login:disabled{opacity:.62;pointer-events:none;transform:none;box-shadow:none;}',
    '.ms-consent{display:none;gap:.45rem;margin:.15rem 0 .35rem;padding:.75rem .85rem;',
    'border:1px solid #EDE4D5;border-radius:14px;background:#FFFCFA;text-align:left;}',
    '.ms-overlay[data-auth-tab="signup"] .ms-consent{display:grid;}',
    '.ms-consent label{display:flex;align-items:flex-start;gap:.45rem;margin:0;color:#5C4A42;',
    'font-size:.74rem;font-weight:650;line-height:1.45;cursor:pointer;}',
    '.ms-consent input{margin-top:.15rem;flex:0 0 auto;accent-color:#FF6B57;}',
    '.ms-consent a,.ms-consent [data-terms-mini]{color:#E85B48;font-weight:800;text-decoration:underline;text-underline-offset:2px;}',
    '.ms-consent [data-terms-mini]{border:none;background:none;padding:0;margin:0 0 0 .15rem;font:inherit;cursor:pointer;}',
    '.ms-consent__hint{margin:0;color:#C07868;font-size:.7rem;font-weight:700;min-height:1em;}',
    '.ms-divider{display:flex;align-items:center;gap:.55rem;margin:1.15rem 0 .85rem;color:var(--muted,#9A8580);',
    'font-size:.72rem;font-weight:700;letter-spacing:-.01em;}',
    '.ms-divider::before,.ms-divider::after{content:"";flex:1;height:1px;background:rgba(154,133,128,.28);}',
    '.ms-social{display:grid;gap:.5rem;}',
    '.ms-social-btn{display:flex;align-items:center;justify-content:center;gap:.45rem;width:100%;',
    'padding:.9rem 1rem;border-radius:14px;border:none;cursor:pointer;font-family:inherit;',
    'font-size:.84rem;font-weight:700;transition:transform .15s,opacity .15s;}',
    '.ms-social-btn:hover{transform:translateY(-1px);opacity:.96;}',
    '.ms-social-btn:disabled{opacity:.6;pointer-events:none;transform:none;}',
    '.ms-social-btn--kakao{background:#FEE500;color:#191919;font-weight:700;}',
    '.ms-social-btn--google{background:#FFFFFF;color:#374151;border:1px solid #E2E8F0;font-weight:700;}',
    '.ms-dismiss{margin-top:.9rem;border:none;background:none;cursor:pointer;font-family:inherit;',
    'color:var(--muted,#9A8580);font-size:.78rem;font-weight:700;}',
    '.ms-welcome-overlay{position:fixed;inset:0;z-index:450;display:none;align-items:center;justify-content:center;',
    'padding:1.25rem;background:rgba(92,74,66,.32);backdrop-filter:blur(8px);opacity:0;visibility:hidden;',
    'pointer-events:none;width:100%;max-width:100%;overflow-x:hidden;box-sizing:border-box;',
    'transition:opacity .28s;font-family:inherit;}',
    '.ms-welcome-overlay.is-open{display:flex;opacity:1;visibility:visible;pointer-events:auto;}',
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
    'max-width:min(420px,calc(100% - 2rem));padding:.9rem 1.2rem;border-radius:16px;font-family:inherit;',
    'border:1px solid var(--coral-pale,#FFE9E4);background:#FFFCFA;color:var(--text,#594842);',
    'box-shadow:0 12px 34px rgba(113,83,72,.16);font-size:.82rem;font-weight:800;text-align:center;',
    'opacity:0;pointer-events:none;transform:translate(-50%,70px);transition:opacity .3s,transform .38s ease;}',
    '.ms-toast.is-show{opacity:1;transform:translate(-50%,0);}',
    '.ms-tabs{display:flex;gap:.35rem;margin:0 0 1.05rem;padding:.28rem;border-radius:16px;',
    'background:rgba(255,232,227,.62);}',
    '.ms-tab{flex:1;padding:.62rem .4rem;border:none;border-radius:12px;background:transparent;',
    'color:var(--muted,#9A8580);font-family:inherit;font-size:.84rem;font-weight:800;cursor:pointer;',
    'transition:background .18s,color .18s,box-shadow .18s;}',
    '.ms-tab.is-active{background:#fff;color:var(--coral,#FF6B57);box-shadow:0 2px 8px rgba(113,83,72,.1);}',
    '.ms-auth-in{display:inline-flex;align-items:center;gap:.4rem;max-width:100%;}',
    '.ms-menu .ms-logout-btn{width:100%;justify-content:flex-start;border:none;border-radius:0;',
    'background:transparent;color:var(--text,#5C4A42);font-family:inherit;font-size:.82rem;font-weight:800;',
    'padding:.7rem .85rem;cursor:pointer;}',
    '.ms-menu .ms-logout-btn:hover{background:var(--coral-pale,#FFE8E3);color:var(--coral,#FF6B57);}',
    '[data-mode-switch="block"] .ms-auth-in{display:flex;width:100%;}',
    '[data-mode-switch="block"] .ms-auth-in .ms-btn{flex:1;justify-content:center;}',
    '@media(max-width:767px){',
    '[data-mode-switch="inline"].ms-slot-guest{flex:0 0 auto!important;min-width:36px!important;max-width:none!important;}',
    '[data-mode-switch="inline"] .ms-login-trigger{display:inline-flex;width:36px;height:36px;',
    'min-width:36px;min-height:36px;flex:0 0 36px;padding:0!important;align-items:center;justify-content:center;',
    'gap:0;border:1px solid #EDE4D5;border-radius:11px;background:#FFFCFA;box-shadow:none;line-height:1;}',
    '[data-mode-switch="inline"] .ms-login-trigger:hover{transform:none;background:var(--coral-pale,#FFE8E3);}',
    '[data-mode-switch="inline"] .ms-login-trigger>span:not([aria-hidden="true"]){display:none!important;}',
    '[data-mode-switch="inline"] .ms-login-trigger>span[aria-hidden="true"]{display:block;font-size:17px;line-height:1;}',
    '}'
  ].join('');

  var overlay;
  var welcomeOverlay;
  var toastEl;
  var toastTimer;
  var welcomeTimer;
  var pendingHref = null;
  var authTab = 'login';

  var LOGIN_I18N = {
    ko: {
      title: '대화 라운지 로그인',
      desc: '글로벌 파트너와의 가벼운 일상 대화를 시작해 보세요',
      tabLogin: '로그인',
      tabSignup: '회원가입',
      signupTitle: 'DayO 라운지 첫 방문을 환영해요! 🎉',
      signupDesc: '가입하고 DayO 오픈 소식을 확인해보세요.',
      signupBtn: '가입하고 시작하기',
      loungeBtn: '대화 라운지 로그인',
      emailPlaceholder: '이메일 주소 입력',
      passwordPlaceholder: '비밀번호 입력',
      passwordPlaceholderSignup: '비밀번호 입력 (6자리 이상)',
      startBtn: '이메일로 시작하기',
      socialDivider: '간편 로그인',
      social: { kakao: '카카오로 1초 만에 시작하기', google: 'Google 계정으로 계속하기' },
      dismiss: '다음에 하기'
    },
    en: {
      title: 'Welcome to DayO',
      desc: 'Start casual conversations with global partners',
      tabLogin: 'Log in',
      tabSignup: 'Sign up',
      signupTitle: 'Welcome to the DayO lounge! 🎉',
      signupDesc: 'Sign up to stay updated on the DayO launch.',
      signupBtn: 'Sign up and start',
      loungeBtn: 'Lounge login',
      emailPlaceholder: 'Enter your email',
      passwordPlaceholder: 'Enter your password',
      passwordPlaceholderSignup: 'Password (6+ characters)',
      startBtn: 'Continue with Email',
      socialDivider: 'Social Login',
      social: { kakao: 'Start in 1 second with Kakao', google: 'Continue with Google' },
      dismiss: 'Maybe later'
    },
    fr: {
      title: 'Connexion à DayO',
      desc: 'Échangez naturellement avec des partenaires du monde entier',
      tabLogin: 'Connexion',
      tabSignup: 'Inscription',
      signupTitle: 'Bienvenue au salon DayO ! 🎉',
      signupDesc: 'Inscrivez-vous pour suivre le lancement de DayO.',
      signupBtn: 'S’inscrire et commencer',
      loungeBtn: 'Connexion au salon',
      emailPlaceholder: 'Adresse e-mail',
      passwordPlaceholder: 'Mot de passe',
      passwordPlaceholderSignup: 'Mot de passe (6 caractères min.)',
      startBtn: "Continuer avec l'e-mail",
      socialDivider: 'Connexion rapide',
      social: { kakao: 'Commencer en 1 seconde avec Kakao', google: 'Continuer avec Google' },
      dismiss: 'Plus tard'
    },
    es: {
      title: 'Iniciar sesión en DayO',
      desc: 'Inicia conversaciones casuales con compañeros globales',
      tabLogin: 'Iniciar',
      tabSignup: 'Registrarse',
      signupTitle: '¡Bienvenido al lounge DayO! 🎉',
      signupDesc: 'Regístrate para recibir noticias sobre el lanzamiento de DayO.',
      signupBtn: 'Registrarse y empezar',
      loungeBtn: 'Iniciar en el lounge',
      emailPlaceholder: 'Correo electrónico',
      passwordPlaceholder: 'Contraseña',
      passwordPlaceholderSignup: 'Contraseña (mín. 6 caracteres)',
      startBtn: 'Continuar con el correo',
      socialDivider: 'Acceso rápido',
      social: { kakao: 'Empezar en 1 segundo con Kakao', google: 'Continuar con Google' },
      dismiss: 'Más tarde'
    }
  };

  function loginLang() {
    var lang = 'ko';
    try {
      if (window.DayOI18n && typeof window.DayOI18n.getLang === 'function') {
        lang = String(window.DayOI18n.getLang() || 'KO').toLowerCase();
      } else {
        lang = String(localStorage.getItem('dayo_lang') || 'KO').toLowerCase();
      }
    } catch (e) {
      lang = 'ko';
    }
    if (lang === 'zh' || lang === 'ja' || lang === 'cn' || lang === 'kr') lang = 'ko';
    return LOGIN_I18N[lang] ? lang : 'ko';
  }

  function loginText(key, lang) {
    var parts = String(key || '').replace(/^login\./, '').split('.');
    var cur = LOGIN_I18N[lang] || LOGIN_I18N.ko;
    for (var i = 0; i < parts.length; i++) {
      if (!cur || typeof cur !== 'object') return null;
      cur = cur[parts[i]];
    }
    return typeof cur === 'string' ? cur : null;
  }

  function t(key, vars) {
    if (window.DayOI18n) {
      var translated = vars ? window.DayOI18n.tf(key, vars) : window.DayOI18n.t(key);
      if (translated && translated !== key) return translated;
    }
    return loginText(key, loginLang()) || loginText(key, 'ko') || key;
  }

  function applyI18n() {
    if (window.DayOI18n) window.DayOI18n.apply();
  }

  function checkUserLoggedIn() {
    if (window._dayoAuthUser) return true;
    if (window.DayOProfileStore && typeof window.DayOProfileStore.isSignedIn === 'function') {
      try { if (window.DayOProfileStore.isSignedIn()) return true; } catch (e) { /* ignore */ }
    }
    try {
      var keys = Object.keys(localStorage);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf('sb-') !== 0 || keys[i].indexOf('-auth-token') < 0) continue;
        var raw = localStorage.getItem(keys[i]);
        if (!raw) continue;
        var parsed = JSON.parse(raw);
        if (parsed && (parsed.access_token || (parsed.currentSession && parsed.currentSession.access_token))) return true;
      }
    } catch (err) { /* ignore */ }
    return false;
  }
  window.checkUserLoggedIn = checkUserLoggedIn;

  function getUserName() {
    try {
      var user = window._dayoAuthUser;
      if (!user || !user.id) return '';
      var profile = window._dayoAuthProfile;
      if (profile && profile._authUserId === user.id && (profile.nickname || profile.user_name)) {
        return String(profile.nickname || profile.user_name).trim();
      }
      var meta = user.user_metadata || {};
      return String(meta.user_name || meta.full_name || meta.name || '').trim()
        || String(user.email || '').split('@')[0];
    } catch (e) {
      return '';
    }
  }

  function isMember() {
    return checkUserLoggedIn();
  }

  function waitForStore() {
    if (window.DayOProfileStore && typeof window.DayOProfileStore.signInWithEmail === 'function') {
      return Promise.resolve(window.DayOProfileStore);
    }
    return new Promise(function (resolve) {
      var n = 0;
      var timer = setInterval(function () {
        n += 1;
        if (window.DayOProfileStore && typeof window.DayOProfileStore.signInWithEmail === 'function') {
          clearInterval(timer);
          resolve(window.DayOProfileStore);
        } else if (n > 50) {
          clearInterval(timer);
          resolve(null);
        }
      }, 50);
    });
  }

  function setLoginBusy(busy) {
    if (!overlay) return;
    var submit = overlay.querySelector('#msAuthSubmit') || overlay.querySelector('.ms-login');
    var kakao = overlay.querySelector('[data-ms-social="kakao"]');
    var google = overlay.querySelector('[data-ms-social="google"]');
    var form = overlay.querySelector('#msLoginForm');
    if (submit) {
      if (busy) {
        submit.disabled = true;
        submit.textContent = t('login.busy');
      } else {
        submit.textContent = authTab === 'signup' ? t('login.signupBtn') : t('login.startBtn');
        syncSignupConsentState();
      }
    }
    if (kakao) kakao.disabled = !!busy;
    if (google) google.disabled = !!busy;
    if (form) {
      var inputs = form.querySelectorAll('input');
      Array.prototype.forEach.call(inputs, function (input) {
        if (input.matches('[data-ms-required-consent], #msAgreeMarketing')) return;
        input.disabled = !!busy;
      });
    }
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
    var local = String(email || '').split('@')[0] || '';
    return local.replace(/[._-]+/g, ' ').trim();
  }

  function startMemberSession(name, email) {
    try {
      window.localStorage.setItem(USER_KEY, name);
      window.localStorage.setItem(MEMBER_KEY, 'active');
      if (email) window.localStorage.setItem(EMAIL_KEY, email);
    } catch (e) { /* ignore */ }
    if (window.DayOProfileStore && typeof window.DayOProfileStore.rebindIdentity === 'function') {
      window.DayOProfileStore.rebindIdentity(name, email || '');
    } else if (window.DayOProfileStore && typeof window.DayOProfileStore.updateProfile === 'function') {
      window.DayOProfileStore.updateProfile({
        user_name: name,
        email: email || ''
      }, { skipEvents: true });
    }
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
      window.localStorage.removeItem('dayo_is_logged_in');
      window.localStorage.removeItem('dayo_user_name');
      window.localStorage.removeItem('dayo_user_nickname');
      window.localStorage.removeItem('dayo_user_email');
      window.localStorage.removeItem('dayo_userEmail');
      window.localStorage.removeItem('dayo_point_balance');
    } catch (e) { /* ignore */ }
    window._dayoAuthUser = null;
    window._dayoAuthProfile = null;
    try {
      if (window.supabaseClient && window.supabaseClient.auth) window.supabaseClient.auth.signOut();
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

  function logout(event) {
    if (typeof window.handleLogout === 'function') {
      return window.handleLogout(event);
    }
    closeAllMenus();
    clearTimeout(welcomeTimer);
    closeWelcome();
    clearMemberSession();
    notifyAuthChange();
    window.location.replace('index.html');
  }

  function showToast(message, ms) {
    toastEl.textContent = message;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('is-show');
    }, ms || 3200);
  }

  function authToastMessage(err) {
    var code = err && err.code;
    if (code === 'password_length') return t('login.passwordTooShort');
    if (code === 'password') return t('login.passwordMismatch');
    if (code === 'confirm_email') return t('login.confirmEmail');
    var raw = String((err && (err.userMessage || err.message)) || '').trim();
    if (raw && raw !== 'unavailable' && raw !== 'supabase unavailable' && raw !== 'missing credentials' && raw !== 'missing') {
      return raw;
    }
    return t('login.authError');
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function isLandingPage() {
    var path = String((window.location && window.location.pathname) || '');
    return path === '/' || path === '' || /\/index\.html?$/.test(path);
  }

  function afterLoginHref(pending) {
    var next = String(pending || '').trim();
    if (next && /(?:^|\/)(?:mypage|room|partner)\.html/i.test(next)) return next;
    return '/mypage.html';
  }

  function buttonFor(role) {
    var name = getUserName();
    var loggedIn = checkUserLoggedIn();

    if (!loggedIn) {
      return {
        href: '#',
        icon: '🔑',
        label: '로그인',
        openLogin: true
      };
    }

    if (isLandingPage()) {
      return {
        href: '/mypage.html',
        icon: '👤',
        label: '마이페이지',
        landingMypage: true
      };
    }

    if (name) {
      var initial = name.charAt(0).toUpperCase();
      return {
        href: 'mypage.html',
        avatar: initial || '👤',
        label: t('login.greetingFormat', { name: name }),
        loggedIn: true
      };
    }

    return {
      href: 'mypage.html',
      avatar: '👤',
      label: t('login.greetingFormat', { name: 'DayO' }),
      loggedIn: true
    };
  }

  function markup(config) {
    var lead = '';
    if (config.avatar) {
      lead = '<span class="ms-avatar" aria-hidden="true">' + config.avatar + '</span>';
    } else if (config.icon) {
      lead = '<span aria-hidden="true">' + config.icon + '</span>';
    }
    var label = config.label
      ? '<span>' + escapeHtml(config.label) + '</span>'
      : '<span data-i18n="' + config.i18n + '">' + t(config.i18n) + '</span>';

    if (config.openLogin) {
      return '<button class="ms-btn ms-login-trigger" type="button" data-ms-open-login aria-label="로그인">' + lead + label + '</button>';
    }

    if (config.landingMypage) {
      return '<a class="ms-btn header-mypage-cta" href="/mypage.html">' + lead + label + '</a>';
    }

    if (config.loggedIn) {
      var ticketCount = null;
      try {
        if (window.DayOTicketWallet && typeof window.DayOTicketWallet.isHydrated === 'function' && !window.DayOTicketWallet.isHydrated()) {
          ticketCount = null;
        } else if (window._dayoAuthProfile) {
          var p = window._dayoAuthProfile;
          if (p.ticket_count != null) ticketCount = Number(p.ticket_count);
          else if (p.tickets != null) ticketCount = Number(p.tickets);
        }
        if (ticketCount == null && window.DayOTicketWallet && typeof window.DayOTicketWallet.isHydrated === 'function' && window.DayOTicketWallet.isHydrated()) {
          ticketCount = window.DayOTicketWallet.getCount();
        }
      } catch (e) { ticketCount = null; }
      var ticketLabel = ticketCount == null
        ? '☕️ 보유 티켓: -장'
        : ('☕️ 보유 티켓: ' + ticketCount + '장');

      return [
        '<div class="ms-auth-in">',
        '  <div class="ms-profile">',
        '    <button class="ms-btn" type="button" data-ms-profile-toggle aria-expanded="false" aria-haspopup="true">',
        lead, label,
        '    <span class="ms-caret" aria-hidden="true">▾</span>',
        '    </button>',
        '    <div class="ms-menu" id="userDropdown" role="menu">',
        '      <div class="ms-menu-status" role="presentation"><span data-ticket-badge-text>', ticketLabel, '</span></div>',
        '      <button type="button" role="menuitem" data-tickets-open>🎟️ 이용권 구매 / 충전</button>',
        '      <div class="ms-menu-sep" aria-hidden="true"></div>',
        '      <a href="mypage.html" role="menuitem">👤 ', t('nav.mypage'), '</a>',
        '      <button type="button" role="menuitem" class="btn-logout ms-logout-btn" data-ms-logout>🚪 로그아웃</button>',
        '      <a href="https://dayo-sufk.vercel.app/admin/dashboard" role="menuitem" data-admin-dashboard-link target="_blank" rel="noopener noreferrer" style="display:none" hidden aria-hidden="true">🛠 관리자 대시보드</a>',
        '    </div>',
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
      slot.classList.toggle('ms-slot-guest', !checkUserLoggedIn());
      slot.innerHTML = html;
    });
    applyI18n();
    if (window.DayOTicketWallet && typeof window.DayOTicketWallet.syncUI === 'function') {
      window.DayOTicketWallet.syncUI();
    }
    if (typeof window.syncAdminDashboardLink === 'function') {
      window.syncAdminDashboardLink();
    }
  }

  function hideAuthLayer(el) {
    if (!el) return;
    el.classList.remove('is-open');
    el.style.display = 'none';
    el.style.pointerEvents = 'none';
    el.setAttribute('aria-hidden', 'true');
  }

  function showAuthLayer(el) {
    if (!el) return;
    el.style.display = 'flex';
    el.style.pointerEvents = 'auto';
    el.removeAttribute('aria-hidden');
    el.classList.add('is-open');
  }

  function restorePageInteraction() {
    if (window.DayOScrollLock && typeof window.DayOScrollLock.unlockAll === 'function') {
      window.DayOScrollLock.unlockAll();
    } else if (window.DayOScrollLock && typeof window.DayOScrollLock.unlock === 'function') {
      window.DayOScrollLock.unlock();
    }
    var html = document.documentElement;
    var body = document.body;
    if (html) {
      html.style.overflow = '';
      html.style.overflowX = '';
      html.style.overflowY = '';
      html.style.pointerEvents = '';
    }
    if (body) {
      body.style.overflow = 'auto';
      body.style.overflowX = '';
      body.style.overflowY = '';
      body.style.pointerEvents = 'auto';
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.bottom = '';
      body.style.width = '';
      body.style.height = '';
      body.style.paddingRight = '';
      body.style.transform = '';
      body.style.touchAction = '';
      body.classList.remove('dayo-scroll-locked');
      body.removeAttribute('data-dayo-scroll-lock');
    }
  }

  function closeAuthModal() {
    hideAuthLayer(overlay);
    hideAuthLayer(welcomeOverlay);
    if (window.DayOMobileNav && typeof window.DayOMobileNav.close === 'function') {
      window.DayOMobileNav.close();
    }
    restorePageInteraction();
  }

  function setAuthTab(tab) {
    authTab = tab === 'signup' ? 'signup' : 'login';
    if (!overlay) return;
    overlay.setAttribute('data-auth-tab', authTab);
    var tabs = overlay.querySelectorAll('[data-ms-tab]');
    Array.prototype.forEach.call(tabs, function (btn) {
      var active = btn.getAttribute('data-ms-tab') === authTab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    var pass = overlay.querySelector('#msPassword');
    if (pass) pass.setAttribute('autocomplete', authTab === 'signup' ? 'new-password' : 'current-password');
    syncLoginI18n();
    syncSignupConsentState();
  }

  function requiredConsentsChecked() {
    if (!overlay) return true;
    var boxes = overlay.querySelectorAll('[data-ms-required-consent]');
    for (var i = 0; i < boxes.length; i += 1) {
      if (!boxes[i].checked) return false;
    }
    return true;
  }

  function syncSignupConsentState() {
    if (!overlay) return;
    var submit = overlay.querySelector('#msAuthSubmit') || overlay.querySelector('.ms-login');
    var hint = overlay.querySelector('#msConsentHint');
    if (authTab !== 'signup') {
      if (submit) submit.disabled = false;
      if (hint) hint.textContent = '';
      return;
    }
    var ok = requiredConsentsChecked();
    if (submit) submit.disabled = !ok;
    if (hint) {
      hint.textContent = ok ? '' : '필수 동의 항목을 모두 체크해 주세요.';
    }
  }

  function openLogin(href, options) {
    if (window.__dayoPartnerLoungeLocked || (document.body && document.body.classList.contains('is-partner-lounge'))) {
      hideAuthLayer(overlay);
      hideAuthLayer(welcomeOverlay);
      return;
    }
    pendingHref = href || null;
    setAuthTab(options && options.tab === 'signup' ? 'signup' : 'login');
    showAuthLayer(overlay);
    if (window.DayOScrollLock) window.DayOScrollLock.lock();
    else document.body.style.overflow = 'hidden';
    var emailInput = overlay.querySelector('#msEmail');
    var passInput = overlay.querySelector('#msPassword');
    if (emailInput) emailInput.value = '';
    if (passInput) passInput.value = '';
    if (emailInput) setTimeout(function () { emailInput.focus(); }, 50);
  }

  function closeLogin() {
    closeAuthModal();
  }

  function openWelcome(name) {
    if (!welcomeOverlay) return;
    var title = welcomeOverlay.querySelector('#msWelcomeTitle');
    var body = welcomeOverlay.querySelector('#msWelcomeBody');
    if (title) title.textContent = t('login.welcomeTitle', { name: name });
    if (body) body.textContent = t('login.welcomeBody');
    showAuthLayer(welcomeOverlay);
    if (window.DayOScrollLock) window.DayOScrollLock.lock();
    else document.body.style.overflow = 'hidden';
  }

  function closeWelcome() {
    hideAuthLayer(welcomeOverlay);
    if (!overlay || !overlay.classList.contains('is-open')) restorePageInteraction();
  }

  function finishAuth(name, email, options) {
    options = options || {};
    var next = pendingHref;
    pendingHref = null;
    startMemberSession(name, email);
    closeAuthModal();
    render();
    notifyAuthChange();

    var dest = afterLoginHref(next);
    if (options.isNew) {
      markNewUserChatPreset();
      showToast(t('login.signupWelcome'), 4200);
    } else {
      showToast(t('login.welcomeToast', { name: name }));
    }
    window.location.href = dest;
  }

  function handleEmailAuth(email, password) {
    var cleanedEmail = String(email || '').trim().toLowerCase();
    var cleanedPass = String(password || '');
    if (!cleanedEmail || !cleanedPass) return;
    if (cleanedPass.length < 6) {
      showToast(t('login.passwordTooShort'));
      return;
    }
    if (authTab === 'signup' && !requiredConsentsChecked()) {
      syncSignupConsentState();
      showToast('필수 동의 항목을 모두 체크해 주세요.');
      return;
    }

    setLoginBusy(true);
    if (authTab === 'signup' && typeof window.handleEmailSignUp === 'function') {
      Promise.resolve(window.handleEmailSignUp(cleanedEmail, cleanedPass)).catch(function (err) {
        showToast((err && err.message) || t('login.authError'));
      }).finally(function () {
        setLoginBusy(false);
      });
      return;
    }
    if (typeof window.handleEmailSignIn === 'function') {
      Promise.resolve(window.handleEmailSignIn(cleanedEmail, cleanedPass)).catch(function (err) {
        showToast((err && err.message) || t('login.authError'));
      }).finally(function () {
        setLoginBusy(false);
      });
      return;
    }
    if (typeof window.handleAuthLogin === 'function') {
      Promise.resolve(window.handleAuthLogin(cleanedEmail, cleanedPass)).catch(function (err) {
        setLoginBusy(false);
        showToast((err && err.message) || t('login.authError'));
      });
      return;
    }

    waitForStore().then(function (store) {
      if (!store || typeof store.signInWithEmail !== 'function') {
        throw new Error('unavailable');
      }
      return store.signInWithEmail(cleanedEmail, cleanedPass);
    }).then(function (result) {
      setLoginBusy(false);
      if (!result) {
        showToast(t('login.authError'));
        return;
      }
      if (result.needsEmail) {
        closeLogin();
        showToast(t('login.confirmEmail'), 4200);
        return;
      }
      try {
        finishAuth(result.name || nameFromEmail(cleanedEmail), result.email || cleanedEmail, {
          isNew: !!result.isNew
        });
      } catch (finishErr) {
        console.warn('[DayO] finishAuth failed', finishErr);
        startMemberSession(result.name || nameFromEmail(cleanedEmail), result.email || cleanedEmail);
        closeAuthModal();
        render();
        if (result.isNew) showToast(t('login.signupWelcome'), 4200);
        else showToast(t('login.welcomeToast', { name: result.name || nameFromEmail(cleanedEmail) }));
      }
    }).catch(function (err) {
      setLoginBusy(false);
      showToast(authToastMessage(err));
    });
  }

  function handleSocialAuth(provider) {
    if (provider === 'kakao' && typeof window.handleKakaoLogin === 'function') {
      window.handleKakaoLogin();
      return;
    }
    if (provider === 'google' && typeof window.handleGoogleLogin === 'function') {
      window.handleGoogleLogin();
      return;
    }
  }

  function syncLoginI18n() {
    if (!overlay) return;
    var signup = authTab === 'signup';
    var title = overlay.querySelector('#msLoginTitle');
    var desc = overlay.querySelector('.ms-sub');
    var email = overlay.querySelector('#msEmail');
    var pass = overlay.querySelector('#msPassword');
    var submit = overlay.querySelector('#msAuthSubmit') || overlay.querySelector('.ms-login');
    var divider = overlay.querySelector('.ms-divider');
    var kakao = overlay.querySelector('[data-ms-social="kakao"]');
    var google = overlay.querySelector('[data-ms-social="google"]');
    var dismiss = overlay.querySelector('[data-ms-close]');
    var tabLogin = overlay.querySelector('[data-ms-tab="login"]');
    var tabSignup = overlay.querySelector('[data-ms-tab="signup"]');
    if (title) title.textContent = signup ? t('login.signupTitle') : t('login.title');
    if (desc) desc.textContent = signup ? t('login.signupDesc') : t('login.desc');
    if (email) email.placeholder = t('login.emailPlaceholder');
    if (pass) pass.placeholder = signup ? t('login.passwordPlaceholderSignup') : t('login.passwordPlaceholder');
    if (submit) submit.textContent = signup ? t('login.signupBtn') : t('login.startBtn');
    if (divider) divider.textContent = t('login.socialDivider');
    if (kakao) kakao.textContent = t('login.social.kakao');
    if (google) google.textContent = t('login.social.google');
    if (dismiss) dismiss.textContent = t('login.dismiss');
    if (tabLogin) tabLogin.textContent = t('login.tabLogin');
    if (tabSignup) tabSignup.textContent = t('login.tabSignup');
    applyI18n();
    syncSignupConsentState();
  }

  function mountLogin() {
    overlay = document.createElement('div');
    overlay.id = 'login-modal';
    overlay.className = 'ms-overlay login-modal-overlay';
    overlay.innerHTML = [
      '<div class="ms-modal" role="dialog" aria-modal="true" aria-labelledby="msLoginTitle">',
      '  <div class="ms-tabs" role="tablist" aria-label="로그인 또는 회원가입">',
      '    <button type="button" class="ms-tab is-active" role="tab" id="msTabLogin" data-ms-tab="login" aria-selected="true">', t('login.tabLogin'), '</button>',
      '    <button type="button" class="ms-tab" role="tab" id="msTabSignup" data-ms-tab="signup" aria-selected="false">', t('login.tabSignup'), '</button>',
      '  </div>',
      '  <div class="ms-key" aria-hidden="true"><img src="/images/logo.png" alt=""></div>',
      '  <h2 id="msLoginTitle">', t('login.title'), '</h2>',
      '  <p class="ms-sub">', t('login.desc'), '</p>',
      '  <form class="ms-form" id="msLoginForm">',
      '    <input class="ms-input" type="email" id="msEmail" name="email" autocomplete="email" required',
      '      placeholder="', t('login.emailPlaceholder'), '">',
      '    <input class="ms-input" type="password" id="msPassword" name="password" autocomplete="current-password" required',
      '      minlength="6"',
      '      placeholder="', t('login.passwordPlaceholder'), '">',
      '    <div class="ms-consent" id="msSignupConsent" aria-label="회원가입 필수 동의">',
      '      <label><input type="checkbox" id="msAgreeAge" data-ms-required-consent> [필수] 만 14세 이상입니다.</label>',
      '      <label><input type="checkbox" id="msAgreeTerms" data-ms-required-consent> [필수] DayO 이용약관 동의 <button type="button" data-terms-mini="terms" data-terms-check="#msAgreeTerms" onclick="event.preventDefault();event.stopPropagation();if(window.openTermsMiniModal){window.openTermsMiniModal();}return false;">보기</button></label>',
      '      <label><input type="checkbox" id="msAgreePrivacy" data-ms-required-consent> [필수] 개인정보 수집 및 이용 동의 <button type="button" data-terms-mini="privacy" data-terms-check="#msAgreePrivacy" onclick="event.preventDefault();event.stopPropagation();if(window.openPrivacyMiniModal){window.openPrivacyMiniModal();}return false;">보기</button></label>',
      '      <label><input type="checkbox" id="msAgreeMarketing"> [선택] 세션 알림 및 이벤트 혜택 수신 동의</label>',
      '      <p class="ms-consent__hint" id="msConsentHint" role="status"></p>',
      '    </div>',
      '    <button class="ms-login" type="submit" id="msAuthSubmit">', t('login.startBtn'), '</button>',
      '  </form>',
      '  <div class="ms-divider">', t('login.socialDivider'), '</div>',
      '  <div class="ms-social">',
      '    <button class="ms-social-btn ms-social-btn--kakao" type="button" data-ms-social="kakao" onclick="handleKakaoLogin()">', t('login.social.kakao'), '</button>',
      '    <button class="ms-social-btn ms-social-btn--google" type="button" data-ms-social="google" onclick="handleGoogleLogin()">', t('login.social.google'), '</button>',
      '  </div>',
      '  <button class="ms-dismiss" type="button" data-ms-close>', t('login.dismiss'), '</button>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);
    hideAuthLayer(overlay);

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
    hideAuthLayer(welcomeOverlay);

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

    overlay.addEventListener('change', function (e) {
      if (e.target && (e.target.matches('[data-ms-required-consent]') || e.target.id === 'msAgreeMarketing')) {
        syncSignupConsentState();
      }
    });

    syncSignupConsentState();

    overlay.addEventListener('click', function (e) {
      var tabBtn = e.target.closest('[data-ms-tab]');
      if (tabBtn) {
        setAuthTab(tabBtn.getAttribute('data-ms-tab'));
        return;
      }
      var social = e.target.closest('[data-ms-social]');
      if (!social) return;
      if (social.getAttribute('data-ms-social') === 'google' || social.getAttribute('data-ms-social') === 'kakao') return;
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
    syncLoginI18n();
    render();

    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-ms-open-login]')) {
        e.preventDefault();
        closeAllMenus();
        openLogin(null);
        return;
      }

      var logoutBtn = e.target.closest('[data-ms-logout], .btn-logout');
      if (logoutBtn) {
        e.preventDefault();
        e.stopPropagation();
        logout(e);
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

      var bookingTrigger = e.target.closest('[data-booking-open], a[href="#booking"], a[href*="#booking"], a[href*="booking=open"]');
      if (bookingTrigger) {
        if (window.DayOBooking && typeof window.DayOBooking.requestOpen === 'function') {
          return;
        }
        e.preventDefault();
        var dest = 'index.html?booking=open';
        if (!checkUserLoggedIn()) {
          showToast(t('login.required'));
          openLogin(dest);
          return;
        }
        window.location.href = dest;
        return;
      }

      var guarded = e.target.closest('[data-ms-guard]');
      if (!guarded || checkUserLoggedIn()) return;
      e.preventDefault();
      showToast(t('login.required'));
      openLogin(guarded.getAttribute('href'));
    });

    document.addEventListener('dayo:langchange', function () {
      render();
      syncLoginI18n();
      if (welcomeOverlay && welcomeOverlay.classList.contains('is-open')) {
        openWelcome(getUserName());
        var cta = welcomeOverlay.querySelector('[data-ms-welcome-close]');
        if (cta) cta.textContent = t('login.welcomeCta');
      }
    });

    document.addEventListener('dayo:authchange', function () {
      render();
    });

    document.addEventListener('dayo:authprofile', function () {
      render();
    });

    waitForStore().then(function () {
      render();
    });

    window.DayOMode = {
      isMember: isMember,
      checkUserLoggedIn: checkUserLoggedIn,
      getUserName: getUserName,
      getUserId: function () {
        if (window.DayOProfileStore && typeof window.DayOProfileStore.getUserId === 'function') {
          return window.DayOProfileStore.getUserId();
        }
        return '';
      },
      refresh: render,
      toast: showToast,
      openLogin: openLogin,
      closeLogin: closeLogin,
      closeAuthModal: closeAuthModal,
      notifyAuthChange: notifyAuthChange,
      logout: function (event) {
        return window.handleLogout ? window.handleLogout(event) : logout(event);
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
