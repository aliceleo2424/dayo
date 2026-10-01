(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DayOPasswordAccount = api;
})(typeof window !== 'undefined' ? window : null, function (window) {
  'use strict';

  var MIN_PASSWORD_LENGTH = 6;
  var RESET_PATH = '/reset-password.html';
  var GENERIC_RESET_NOTICE = '입력한 이메일이 가입 정보와 일치하는 경우 메일이 발송됩니다.';

  var TEXT = {
    ko: {
      forgot: '비밀번호를 잊으셨나요?', forgotTitle: '비밀번호 재설정',
      forgotDesc: '가입할 때 사용한 이메일을 입력해 주세요.', email: '이메일 주소',
      send: '재설정 메일 보내기', close: '닫기', genericNotice: GENERIC_RESET_NOTICE,
      sentTitle: '비밀번호 재설정 메일을 보냈어요.',
      sentBody: '받은편지함에서\n“[DayO 돼요] 비밀번호 재설정 안내”\n제목의 메일을 확인해 주세요.\n\n메일이 보이지 않으면 스팸함도 확인해 주세요.',
      sentHelper: GENERIC_RESET_NOTICE,
      serviceError: '지금은 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.',
      accountTitle: '계정 설정', accountDesc: '로그인과 비밀번호를 안전하게 관리하세요.',
      change: '비밀번호 변경', socialOnly: '소셜 로그인으로 연결된 계정입니다.',
      changeTitle: '비밀번호 변경', changeDesc: '새로 사용할 비밀번호를 입력해 주세요.', newPassword: '새 비밀번호', confirmPassword: '새 비밀번호 확인',
      passwordHint: '비밀번호는 6자 이상 입력해 주세요.', save: '변경하기', cancel: '취소',
      mismatch: '새 비밀번호가 서로 일치하지 않아요.', tooShort: '비밀번호는 6자 이상이어야 해요.',
      changed: '비밀번호가 변경되었습니다.', reauth: '보안을 위해 다시 로그인한 뒤 시도해 주세요.',
      updateFailed: '비밀번호를 변경하지 못했어요. 잠시 후 다시 시도해 주세요.',
      resetPageTitle: '새 비밀번호 설정', resetPageDesc: '새로 사용할 비밀번호를 입력해 주세요.',
      checking: '재설정 링크를 확인하고 있어요.', invalidLink: '링크가 만료되었거나 유효하지 않습니다. 새 재설정 메일을 요청해 주세요.',
      requestAgain: '재설정 메일 다시 요청하기', home: 'DayO 홈으로 돌아가기',
      resetSuccess: '비밀번호가 변경되었습니다. 이제 새 비밀번호로 로그인할 수 있어요.'
    },
    en: {
      forgot: 'Forgot your password?', forgotTitle: 'Reset your password',
      forgotDesc: 'Enter the email address you used to sign up.', email: 'Email address',
      send: 'Send reset email', close: 'Close', genericNotice: 'If the email matches a registered account, a reset email will be sent.',
      sentTitle: 'Password reset email sent.',
      sentBody: 'Check your inbox for an email titled “[DayO 돼요] 비밀번호 재설정 안내”.\n\nIf you do not see it, check your spam folder.',
      sentHelper: 'The email is sent when the address matches a registered account.',
      serviceError: 'We could not process your request right now. Please try again shortly.',
      accountTitle: 'Account settings', accountDesc: 'Keep your login and password secure.',
      change: 'Change password', socialOnly: 'This account uses social login.',
      changeTitle: 'Change password', changeDesc: 'Enter the new password you want to use.', newPassword: 'New password', confirmPassword: 'Confirm new password',
      passwordHint: 'Use at least 6 characters.', save: 'Update password', cancel: 'Cancel',
      mismatch: 'The passwords do not match.', tooShort: 'Your password must be at least 6 characters.',
      changed: 'Your password has been changed.', reauth: 'For security, please log in again and retry.',
      updateFailed: 'We could not change your password. Please try again shortly.',
      resetPageTitle: 'Set a new password', resetPageDesc: 'Enter the new password you want to use.',
      checking: 'Checking your reset link…', invalidLink: 'This reset link is invalid or has expired. Please request a new one.',
      requestAgain: 'Request another reset email', home: 'Back to DayO home',
      resetSuccess: 'Your password has been changed. You can now log in with your new password.'
    }
  };

  function lang() {
    if (!window) return 'ko';
    try {
      var current = window.DayOI18n && typeof window.DayOI18n.getLang === 'function'
        ? window.DayOI18n.getLang()
        : window.localStorage.getItem('dayo_lang');
      return String(current || '').toLowerCase() === 'en' ? 'en' : 'ko';
    } catch (error) {
      return 'ko';
    }
  }

  function text(key) {
    var selected = lang();
    return TEXT[selected][key] || TEXT.ko[key] || key;
  }

  function validatePassword(password, confirmation) {
    var value = String(password || '');
    if (value.length < MIN_PASSWORD_LENGTH) return { ok: false, code: 'too_short' };
    if (value !== String(confirmation || '')) return { ok: false, code: 'mismatch' };
    return { ok: true, password: value };
  }

  function identityList(user, identityResult) {
    var fromApi = identityResult && identityResult.data && identityResult.data.identities;
    if (Array.isArray(fromApi)) return fromApi;
    return Array.isArray(user && user.identities) ? user.identities : [];
  }

  function hasEmailIdentity(user, identityResult) {
    return identityList(user, identityResult).some(function (identity) {
      return String(identity && identity.provider || '').toLowerCase() === 'email';
    });
  }

  function recoveryRedirect(locationLike) {
    var hostname = String(locationLike && locationLike.hostname || '').toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return String(locationLike.origin || '').replace(/\/$/, '') + RESET_PATH;
    }
    return 'https://www.dayotalk.com' + RESET_PATH;
  }

  function readRecoveryUrl(locationLike) {
    var search = new URLSearchParams(String(locationLike && locationLike.search || '').replace(/^\?/, ''));
    var hash = new URLSearchParams(String(locationLike && locationLike.hash || '').replace(/^#/, ''));
    return {
      error: search.get('error') || search.get('error_code') || hash.get('error') || hash.get('error_code') || '',
      hinted: search.get('type') === 'recovery' || hash.get('type') === 'recovery' || search.has('code')
    };
  }

  async function requestPasswordReset(client, email, locationLike) {
    if (!client || !client.auth || typeof client.auth.resetPasswordForEmail !== 'function') {
      return { submitted: false, unavailable: true };
    }
    try {
      await client.auth.resetPasswordForEmail(String(email || '').trim().toLowerCase(), {
        redirectTo: recoveryRedirect(locationLike)
      });
      return { submitted: true };
    } catch (error) {
      return { submitted: true };
    }
  }

  async function updatePassword(client, password, confirmation) {
    var validation = validatePassword(password, confirmation);
    if (!validation.ok) return validation;
    if (!client || !client.auth || typeof client.auth.updateUser !== 'function') {
      return { ok: false, code: 'unavailable' };
    }
    var result = await client.auth.updateUser({ password: validation.password });
    if (result && result.error) return { ok: false, code: 'auth_error', error: result.error };
    return { ok: true, data: result && result.data };
  }

  if (!window || !window.document) {
    return {
      MIN_PASSWORD_LENGTH: MIN_PASSWORD_LENGTH,
      GENERIC_RESET_NOTICE: GENERIC_RESET_NOTICE,
      validatePassword: validatePassword,
      hasEmailIdentity: hasEmailIdentity,
      recoveryRedirect: recoveryRedirect,
      readRecoveryUrl: readRecoveryUrl,
      requestPasswordReset: requestPasswordReset,
      updatePassword: updatePassword
    };
  }

  var document = window.document;
  var recoveryPage = document.documentElement.hasAttribute('data-password-recovery');
  var recoveryUrlState = readRecoveryUrl(window.location);
  var recoveryReady = false;
  var recoveryFailed = !!recoveryUrlState.error;

  function getClient() {
    return window.supabaseClient && window.supabaseClient.auth ? window.supabaseClient : null;
  }

  function injectStyle() {
    if (document.getElementById('dayo-password-style')) return;
    var style = document.createElement('style');
    style.id = 'dayo-password-style';
    style.textContent = [
      '.dayo-forgot-link{align-self:flex-end;border:0;background:transparent;color:#6b7280;font:inherit;font-size:12px;font-weight:700;cursor:pointer;padding:2px 0 5px;text-decoration:underline;text-underline-offset:3px}',
      '#login-modal[data-auth-tab="signup"] .dayo-forgot-link{display:none}',
      '.dayo-password-overlay{position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(62,50,45,.48)}',
      '.dayo-password-overlay.is-open{display:flex}.dayo-password-card{width:min(100%,390px);max-height:calc(100dvh - 32px);overflow:auto;box-sizing:border-box;padding:24px;border:1px solid #ffe0d7;border-radius:22px;background:#fff;box-shadow:0 22px 60px rgba(62,50,45,.2)}',
      '.dayo-password-card h2{margin:0 0 7px;color:#2f2926}.dayo-account-settings h3{margin:0;color:#2f2926;font-size:14px;line-height:1.35}.dayo-password-card>p{margin:0 0 16px;color:#746b66;font-size:13px;line-height:1.55}',
      '#dayoForgotDescription{white-space:pre-line}',
      '.dayo-password-form{display:grid;gap:10px}.dayo-password-form label{font-size:12px;font-weight:800;color:#4b4541}.dayo-password-input{width:100%;box-sizing:border-box;border:1px solid #ddd4cf;border-radius:12px;padding:12px 13px;font:inherit;color:#2f2926}',
      '.dayo-password-hint,.dayo-password-status{min-height:19px;margin:0!important;font-size:12px!important}.dayo-password-status.is-error{color:#c74432}.dayo-password-status.is-success{color:#247552}',
      '.dayo-password-status.is-reset-helper{margin-top:3px!important;line-height:1.55;color:#746b66}',
      '.dayo-password-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:4px}.dayo-password-actions button,.dayo-account-password-btn{border:0;border-radius:12px;padding:11px 15px;font:inherit;font-size:13px;font-weight:800;cursor:pointer}',
      '.dayo-password-primary{background:#ff6b57;color:#fff}.dayo-password-secondary{background:#f4f1ed;color:#5c4a42}.dayo-password-actions button:disabled{opacity:.6;cursor:wait}',
      '.dayo-account-settings{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:12px;height:auto;min-height:0;background:#fffdfb;border:1px solid #f1e8e3;border-radius:14px;padding:12px 14px;box-shadow:none}.dayo-account-settings[hidden]{display:none}.dayo-account-copy{min-width:0}.dayo-account-desc,.dayo-account-provider{margin:3px 0 0!important;color:#746b66!important;font-size:12px;line-height:1.4}.dayo-account-password-btn{flex:0 0 auto;padding:8px 11px;border:1px solid #e5d9d2;background:#fff;color:#5c4a42;font-size:12px;box-shadow:none}',
      '@media(max-width:600px){.dayo-password-card{padding:20px;border-radius:18px}.dayo-password-actions{flex-direction:column-reverse}.dayo-password-actions button{width:100%}.dayo-account-settings{padding:10px 12px;flex-wrap:wrap}}'
    ].join('');
    document.head.appendChild(style);
  }

  function applyLanguage() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-dp-text]'), function (element) {
      element.textContent = text(element.getAttribute('data-dp-text'));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-dp-placeholder]'), function (element) {
      element.placeholder = text(element.getAttribute('data-dp-placeholder'));
    });
  }

  function show(element) {
    if (!element) return;
    element.hidden = false;
    element.classList.add('is-open');
  }

  function hide(element) {
    if (!element) return;
    element.classList.remove('is-open');
    element.hidden = true;
  }

  function status(element, message, kind) {
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('is-error', kind === 'error');
    element.classList.toggle('is-success', kind === 'success');
  }

  function setForgotCopy(sent) {
    var title = document.getElementById('dayoForgotTitle');
    var description = document.getElementById('dayoForgotDescription');
    if (title) title.setAttribute('data-dp-text', sent ? 'sentTitle' : 'forgotTitle');
    if (description) description.setAttribute('data-dp-text', sent ? 'sentBody' : 'forgotDesc');
    applyLanguage();
  }

  function passwordFormMarkup(prefix, titleKey, descriptionKey) {
    return [
      '<h2 id="', prefix, 'Title" data-dp-text="', titleKey, '"></h2>',
      '<p data-dp-text="', descriptionKey, '"></p>',
      '<form class="dayo-password-form" id="', prefix, 'Form">',
      '  <label for="', prefix, 'Password" data-dp-text="newPassword"></label>',
      '  <input class="dayo-password-input" id="', prefix, 'Password" type="password" minlength="6" autocomplete="new-password" required data-dp-placeholder="newPassword">',
      '  <label for="', prefix, 'Confirm" data-dp-text="confirmPassword"></label>',
      '  <input class="dayo-password-input" id="', prefix, 'Confirm" type="password" minlength="6" autocomplete="new-password" required data-dp-placeholder="confirmPassword">',
      '  <p class="dayo-password-hint" data-dp-text="passwordHint"></p>',
      '  <p class="dayo-password-status" id="', prefix, 'Status" role="status" aria-live="polite"></p>',
      '  <div class="dayo-password-actions">',
      '    <button class="dayo-password-secondary" type="button" data-password-close data-dp-text="cancel"></button>',
      '    <button class="dayo-password-primary" type="submit" data-dp-text="save"></button>',
      '  </div>',
      '</form>'
    ].join('');
  }

  function bindUpdateForm(form, options) {
    if (!form || form.dataset.passwordBound === 'true') return;
    form.dataset.passwordBound = 'true';
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var password = form.querySelector('input[type="password"]');
      var fields = form.querySelectorAll('input[type="password"]');
      var confirmation = fields[1];
      var resultStatus = form.querySelector('.dayo-password-status');
      var submit = form.querySelector('button[type="submit"]');
      var validation = validatePassword(password && password.value, confirmation && confirmation.value);
      if (!validation.ok) {
        status(resultStatus, text(validation.code === 'mismatch' ? 'mismatch' : 'tooShort'), 'error');
        return;
      }
      submit.disabled = true;
      status(resultStatus, '', '');
      try {
        var result = await updatePassword(getClient(), validation.password, validation.password);
        if (!result.ok) {
          var raw = String(result.error && result.error.message || '').toLowerCase();
          var message = /reauth|nonce|current.password|recently signed/i.test(raw) ? text('reauth') : text('updateFailed');
          status(resultStatus, message, 'error');
          return;
        }
        form.reset();
        form.dataset.passwordCompleted = 'true';
        status(resultStatus, options && options.recovery ? text('resetSuccess') : text('changed'), 'success');
        if (options && typeof options.onSuccess === 'function') await options.onSuccess();
      } catch (error) {
        status(resultStatus, text('updateFailed'), 'error');
      } finally {
        submit.disabled = form.dataset.passwordCompleted === 'true';
      }
    });
  }

  function mountForgotPassword() {
    var loginForm = document.getElementById('msLoginForm');
    if (!loginForm || document.getElementById('dayoForgotPassword')) return !!loginForm;
    var passwordInput = document.getElementById('msPassword');
    if (!passwordInput) return false;
    var forgot = document.createElement('button');
    forgot.type = 'button';
    forgot.id = 'dayoForgotPassword';
    forgot.className = 'dayo-forgot-link';
    forgot.setAttribute('data-dp-text', 'forgot');
    passwordInput.insertAdjacentElement('afterend', forgot);

    var overlay = document.createElement('div');
    overlay.id = 'dayoForgotPasswordOverlay';
    overlay.className = 'dayo-password-overlay';
    overlay.hidden = true;
    overlay.innerHTML = [
      '<div class="dayo-password-card" role="dialog" aria-modal="true" aria-labelledby="dayoForgotTitle">',
      '  <h2 id="dayoForgotTitle" data-dp-text="forgotTitle"></h2>',
      '  <p id="dayoForgotDescription" data-dp-text="forgotDesc"></p>',
      '  <form class="dayo-password-form" id="dayoForgotForm">',
      '    <label for="dayoForgotEmail" data-dp-text="email"></label>',
      '    <input class="dayo-password-input" id="dayoForgotEmail" type="email" autocomplete="email" required data-dp-placeholder="email">',
      '    <p class="dayo-password-status" id="dayoForgotStatus" role="status" aria-live="polite"></p>',
      '    <div class="dayo-password-actions">',
      '      <button class="dayo-password-secondary" type="button" data-forgot-close data-dp-text="close"></button>',
      '      <button class="dayo-password-primary" type="submit" data-dp-text="send"></button>',
      '    </div>',
      '  </form>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);

    forgot.addEventListener('click', function () {
      var source = document.getElementById('msEmail');
      var email = document.getElementById('dayoForgotEmail');
      if (email && source) email.value = source.value;
      var forgotStatus = document.getElementById('dayoForgotStatus');
      setForgotCopy(false);
      if (forgotStatus) forgotStatus.classList.remove('is-reset-helper');
      status(forgotStatus, '', '');
      show(overlay);
      if (email) setTimeout(function () { email.focus(); }, 20);
    });
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay || event.target.closest('[data-forgot-close]')) hide(overlay);
    });
    overlay.querySelector('#dayoForgotForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      var email = document.getElementById('dayoForgotEmail');
      var submit = event.currentTarget.querySelector('button[type="submit"]');
      submit.disabled = true;
      var result = await requestPasswordReset(getClient(), email && email.value, window.location);
      var forgotStatus = document.getElementById('dayoForgotStatus');
      if (result.unavailable) {
        status(forgotStatus, text('serviceError'), 'error');
      } else {
        setForgotCopy(true);
        if (forgotStatus) forgotStatus.classList.add('is-reset-helper');
        status(forgotStatus, text('sentHelper'), 'success');
      }
      submit.disabled = false;
    });
    applyLanguage();
    if (new URLSearchParams(window.location.search).get('forgotPassword') === '1') {
      try { window.history.replaceState(null, '', window.location.pathname || '/'); } catch (error) { /* ignore */ }
      forgot.click();
    }
    return true;
  }

  function mountPasswordChangeModal() {
    var existing = document.getElementById('dayoPasswordChangeOverlay');
    if (existing) return existing;
    var overlay = document.createElement('div');
    overlay.id = 'dayoPasswordChangeOverlay';
    overlay.className = 'dayo-password-overlay';
    overlay.hidden = true;
    overlay.innerHTML = '<div class="dayo-password-card" role="dialog" aria-modal="true" aria-labelledby="dayoPasswordChangeTitle">' +
      passwordFormMarkup('dayoPasswordChange', 'changeTitle', 'changeDesc') + '</div>';
    document.body.appendChild(overlay);
    bindUpdateForm(overlay.querySelector('form'));
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay || event.target.closest('[data-password-close]')) hide(overlay);
    });
    return overlay;
  }

  async function mountAccountSettings() {
    if (!/\bmypage(?:\.html)?$/i.test(window.location.pathname.replace(/\/$/, '')) || document.getElementById('dayoAccountSettings')) return;
    var column = document.getElementById('right-column');
    var client = getClient();
    if (!column || !client) return;
    var section = document.createElement('section');
    section.id = 'dayoAccountSettings';
    section.className = 'dayo-account-settings';
    section.hidden = true;
    section.innerHTML = [
      '<div class="dayo-account-copy"><h3 data-dp-text="accountTitle"></h3>',
      '<p class="dayo-account-desc" data-dp-text="accountDesc"></p>',
      '<p class="dayo-account-provider" id="dayoAccountProvider"></p></div>',
      '<button type="button" class="dayo-account-password-btn" id="dayoPasswordChangeButton" data-dp-text="change" hidden></button>'
    ].join('');
    column.insertBefore(section, column.firstChild);
    try {
      var userResult = await client.auth.getUser();
      var user = userResult && userResult.data && userResult.data.user;
      if (!user || userResult.error) return;
      var identities = typeof client.auth.getUserIdentities === 'function'
        ? await client.auth.getUserIdentities()
        : null;
      section.hidden = false;
      var button = document.getElementById('dayoPasswordChangeButton');
      var provider = document.getElementById('dayoAccountProvider');
      if (hasEmailIdentity(user, identities)) {
        button.hidden = false;
        provider.hidden = true;
        button.addEventListener('click', function () {
          var modal = mountPasswordChangeModal();
          var form = modal.querySelector('form');
          form.dataset.passwordCompleted = '';
          form.reset();
          form.querySelector('button[type="submit"]').disabled = false;
          status(form.querySelector('.dayo-password-status'), '', '');
          applyLanguage();
          show(modal);
          var input = modal.querySelector('input');
          if (input) setTimeout(function () { input.focus(); }, 20);
        });
      } else {
        button.hidden = true;
        provider.hidden = false;
        provider.setAttribute('data-dp-text', 'socialOnly');
      }
      applyLanguage();
    } catch (error) {
      section.hidden = true;
    }
  }

  function setRecoveryState() {
    var form = document.getElementById('dayoRecoveryForm');
    var message = document.getElementById('dayoRecoveryMessage');
    if (!form || !message) return;
    if (recoveryFailed) {
      form.hidden = true;
      status(message, text('invalidLink'), 'error');
      return;
    }
    if (recoveryReady) {
      form.hidden = false;
      status(message, '', '');
      try { window.history.replaceState(null, '', RESET_PATH); } catch (error) { /* ignore */ }
      return;
    }
    form.hidden = true;
    status(message, text('checking'), '');
  }

  function bindRecoveryPage() {
    var form = document.getElementById('dayoRecoveryForm');
    if (!form) return;
    bindUpdateForm(form, {
      recovery: true,
      onSuccess: async function () {
        var client = getClient();
        if (client && client.auth && typeof client.auth.signOut === 'function') {
          try { await client.auth.signOut({ scope: 'local' }); } catch (error) { /* isolated recovery session cleanup */ }
        }
        Array.prototype.forEach.call(form.querySelectorAll('input,button'), function (element) { element.disabled = true; });
        var home = document.getElementById('dayoRecoveryHome');
        if (home) home.hidden = false;
      }
    });
    setRecoveryState();
    applyLanguage();
  }

  function observeRecoverySession() {
    if (!recoveryPage) return;
    var client = getClient();
    if (!client) {
      recoveryFailed = true;
      return;
    }
    client.auth.onAuthStateChange(function (event, session) {
      if (event === 'PASSWORD_RECOVERY' || ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && recoveryUrlState.hinted)) {
        recoveryReady = !!(session && session.user);
        recoveryFailed = !recoveryReady;
        setRecoveryState();
      }
    });
    setTimeout(async function () {
      if (recoveryReady || recoveryFailed) return;
      var sessionResult = await client.auth.getSession();
      var session = sessionResult && sessionResult.data && sessionResult.data.session;
      recoveryReady = !!(session && session.user);
      recoveryFailed = !recoveryReady;
      setRecoveryState();
    }, 1200);
  }

  injectStyle();
  observeRecoverySession();
  document.addEventListener('dayo:langchange', applyLanguage);
  var ready = function () {
    if (recoveryPage) bindRecoveryPage();
    else {
      var attempts = 0;
      var timer = setInterval(function () {
        attempts += 1;
        if (mountForgotPassword() || attempts > 50) clearInterval(timer);
      }, 100);
      mountAccountSettings();
    }
    applyLanguage();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();

  return {
    MIN_PASSWORD_LENGTH: MIN_PASSWORD_LENGTH,
    GENERIC_RESET_NOTICE: GENERIC_RESET_NOTICE,
    validatePassword: validatePassword,
    hasEmailIdentity: hasEmailIdentity,
    recoveryRedirect: recoveryRedirect,
    readRecoveryUrl: readRecoveryUrl,
    requestPasswordReset: requestPasswordReset,
    updatePassword: updatePassword
  };
});
