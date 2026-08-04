/* DayO 헤더 진입 버튼 & 로그인 안내 — index.html / mypage.html / partner.html 공용 */
(function () {
  'use strict';

  var MEMBER_KEY = 'dayo.memberSession';

  var CSS = [
    'a.ms-btn{display:inline-flex;align-items:center;gap:.4rem;padding:.55rem 1rem;',
    'border:1px solid var(--coral-pale,#FFE8E3);border-radius:999px;background:var(--cream,#FFF8F5);',
    'color:var(--coral,#FF6B57);font-family:inherit;font-size:.82rem;font-weight:700;line-height:1.2;',
    'text-decoration:none;white-space:nowrap;cursor:pointer;',
    'transition:transform .2s,background .2s,border-color .2s;}',
    'a.ms-btn:hover{transform:translateY(-1px);border-color:var(--coral,#FF6B57);',
    'background:var(--coral-pale,#FFE8E3);color:var(--coral,#FF6B57);}',
    'a.ms-btn .ms-avatar{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;',
    'background:linear-gradient(135deg,var(--pink,#FFD6DF),var(--peach,#FFE5C4));font-size:.72rem;}',
    '[data-mode-switch="block"]{display:block;margin-top:.5rem;}',
    '[data-mode-switch="block"] a.ms-btn{display:flex;width:100%;justify-content:center;}',
    /* 로그인 안내 모달 */
    '.ms-overlay{position:fixed;inset:0;z-index:400;display:flex;align-items:center;justify-content:center;',
    'padding:1.25rem;background:rgba(89,72,66,.34);backdrop-filter:blur(6px);opacity:0;visibility:hidden;',
    'transition:opacity .25s;font-family:inherit;}',
    '.ms-overlay.is-open{opacity:1;visibility:visible;}',
    '.ms-modal{width:min(400px,100%);padding:1.9rem 1.6rem 1.6rem;border-radius:26px;text-align:center;',
    'border:1px solid rgba(255,214,223,.75);background:#FFFCFA;color:var(--text,#594842);',
    'box-shadow:0 26px 60px rgba(113,83,72,.24);transform:translateY(18px);transition:transform .28s;}',
    '.ms-overlay.is-open .ms-modal{transform:translateY(0);}',
    '.ms-key{width:62px;height:62px;display:grid;place-items:center;margin:0 auto 1rem;border-radius:50%;',
    'background:linear-gradient(135deg,var(--pink,#FFD6DF),var(--peach,#FFE5C4));font-size:1.6rem;}',
    '.ms-modal h2{font-size:1.15rem;font-weight:800;letter-spacing:-.03em;}',
    '.ms-modal p{margin-top:.6rem;color:var(--muted,#927E77);font-size:.85rem;line-height:1.7;}',
    '.ms-actions{display:grid;gap:.55rem;margin-top:1.4rem;}',
    '.ms-login{padding:.9rem 1rem;border:none;border-radius:16px;cursor:pointer;font-family:inherit;',
    'font-size:.86rem;font-weight:800;color:#fff;background:var(--coral,#FF6B57);',
    'box-shadow:0 4px 0 var(--coral-dark,#E85B48);}',
    '.ms-login:active{transform:translateY(2px);box-shadow:0 2px 0 var(--coral-dark,#E85B48);}',
    '.ms-login--soft{color:var(--text,#594842);background:var(--cream,#FFF8F3);box-shadow:none;',
    'border:1px solid var(--line,rgba(146,126,119,.14));}',
    '.ms-login--soft:active{transform:translateY(1px);}',
    '.ms-foot{margin-top:1.1rem;font-size:.78rem;color:var(--muted,#927E77);}',
    '.ms-foot a{color:var(--coral,#FF6B57);font-weight:800;text-decoration:none;}',
    '.ms-foot a:hover{text-decoration:underline;}',
    '.ms-dismiss{margin-top:.9rem;border:none;background:none;cursor:pointer;font-family:inherit;',
    'color:var(--muted,#927E77);font-size:.78rem;font-weight:700;}',
    /* 토스트 */
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

  function isMember() {
    try {
      return window.localStorage.getItem(MEMBER_KEY) === 'active';
    } catch (e) {
      return false;
    }
  }

  function startMemberSession() {
    try {
      window.localStorage.setItem(MEMBER_KEY, 'active');
    } catch (e) {
      /* 저장소를 못 써도 현재 페이지 기준으로 회원 UI를 보여줍니다 */
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

  function buttonFor(role) {
    if (role === 'partner') {
      return { href: 'mypage.html', icon: '🎓', label: '학습자 마이페이지로 이동' };
    }
    if (role === 'member') {
      return { href: 'partner.html', icon: '☕', label: '파트너 스튜디오로 이동' };
    }
    return { href: 'mypage.html', label: '마이페이지', avatar: '👤', guard: true };
  }

  function markup(config) {
    var lead = config.avatar
      ? '<span class="ms-avatar" aria-hidden="true">' + config.avatar + '</span>'
      : '<span aria-hidden="true">' + config.icon + '</span>';
    return '<a class="ms-btn" href="' + config.href + '"' +
      (config.guard ? ' data-ms-guard' : '') + '>' + lead + config.label + '</a>';
  }

  function render() {
    var role = document.body.dataset.dayoRole || 'learner';
    if (role === 'partner' || role === 'member') startMemberSession();

    var html = markup(buttonFor(role));
    var slots = document.querySelectorAll('[data-mode-switch]');
    Array.prototype.forEach.call(slots, function (slot) {
      slot.innerHTML = html;
    });
  }

  function openLogin() {
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    overlay.querySelector('.ms-login').focus();
  }

  function closeLogin() {
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function mockLogin() {
    startMemberSession();
    closeLogin();
    showToast('로그인되었습니다! 마이페이지로 이동할게요 💖');
    setTimeout(function () {
      window.location.href = 'mypage.html';
    }, 900);
  }

  function mountLogin() {
    overlay = document.createElement('div');
    overlay.className = 'ms-overlay';
    overlay.innerHTML = [
      '<div class="ms-modal" role="dialog" aria-modal="true" aria-labelledby="msLoginTitle">',
      '  <div class="ms-key" aria-hidden="true">🔑</div>',
      '  <h2 id="msLoginTitle">로그인이 필요한 서비스예요</h2>',
      '  <p>로그인하면 예약한 대화 세션과 나의 학습 리포트를<br>마이페이지에서 한눈에 확인할 수 있어요.</p>',
      '  <div class="ms-actions">',
      '    <button class="ms-login" type="button" data-ms-login>☕ 3초 만에 로그인하기</button>',
      '    <button class="ms-login ms-login--soft" type="button" data-ms-login>✉️ 이메일로 로그인</button>',
      '  </div>',
      '  <p class="ms-foot">대화 파트너로 활동하고 싶다면? <a href="partner.html">파트너 스튜디오 둘러보기</a></p>',
      '  <button class="ms-dismiss" type="button" data-ms-close>다음에 할게요</button>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.closest('[data-ms-close]')) {
        closeLogin();
        return;
      }
      if (e.target.closest('[data-ms-login]')) mockLogin();
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
      var guarded = e.target.closest('[data-ms-guard]');
      if (!guarded || isMember()) return;
      e.preventDefault();
      showToast('로그인이 필요한 서비스입니다 🔑');
      openLogin();
    });

    window.DayOMode = { isMember: isMember, refresh: render, toast: showToast };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
