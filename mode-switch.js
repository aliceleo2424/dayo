/* DayO 헤더 진입 버튼 — index.html / mypage.html / partner.html 공용 */
(function () {
  'use strict';

  var MEMBER_KEY = 'dayo.memberSession';

  var CSS = [
    'a.ms-btn{display:inline-flex;align-items:center;gap:.4rem;padding:.55rem 1rem;',
    'border:1px solid var(--coral-pale,#FFE8E3);border-radius:999px;background:var(--cream,#FFF8F5);',
    'color:var(--coral,#FF6B57);font-family:inherit;font-size:.82rem;font-weight:700;line-height:1.2;',
    'text-decoration:none;white-space:nowrap;',
    'transition:transform .2s,background .2s,border-color .2s;}',
    'a.ms-btn:hover{transform:translateY(-1px);border-color:var(--coral,#FF6B57);',
    'background:var(--coral-pale,#FFE8E3);color:var(--coral,#FF6B57);}',
    'a.ms-btn .ms-avatar{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;',
    'background:linear-gradient(135deg,var(--pink,#FFD6DF),var(--peach,#FFE5C4));font-size:.72rem;}',
    '[data-mode-switch="block"]{display:block;margin-top:.5rem;}',
    '[data-mode-switch="block"] a.ms-btn{display:flex;width:100%;justify-content:center;}'
  ].join('');

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

  function buttonFor(role) {
    if (role === 'partner') {
      return { href: 'mypage.html', icon: '🎓', label: '학습자 마이페이지' };
    }
    if (role === 'member') {
      return { href: 'partner.html', icon: '☕', label: '파트너 스튜디오' };
    }
    if (isMember()) {
      return { href: 'mypage.html', icon: '', label: '마이페이지', avatar: '👤' };
    }
    return { href: 'partner.html', icon: '🌐', label: '파트너 참여' };
  }

  function markup(config) {
    var lead = config.avatar
      ? '<span class="ms-avatar" aria-hidden="true">' + config.avatar + '</span>'
      : '<span aria-hidden="true">' + config.icon + '</span>';
    return '<a class="ms-btn" href="' + config.href + '">' + lead + config.label + '</a>';
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

  function init() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    render();
    window.DayOMode = { isMember: isMember, refresh: render };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
