/* DayO 학습자 ⇄ 대화 파트너 모드 스위처 — index.html / partner.html 공용 */
(function () {
  'use strict';

  var SESSION_KEY = 'dayo.partnerSession';

  /* 셀렉터를 한 단계 중첩해 두 페이지의 기존 a 태그 스타일보다 우선하도록 합니다 */
  var CSS = [
    'a.ms-join{display:inline-flex;align-items:center;gap:.35rem;padding:.55rem 1rem;',
    'border:1px solid var(--coral-pale,#FFE8E3);border-radius:999px;background:var(--cream,#FFF8F5);',
    'color:var(--coral,#FF6B57);font-family:inherit;font-size:.82rem;font-weight:700;text-decoration:none;',
    'line-height:1.2;white-space:nowrap;transition:transform .2s,background .2s,border-color .2s;}',
    'a.ms-join:hover{transform:translateY(-1px);border-color:var(--coral,#FF6B57);',
    'background:var(--coral-pale,#FFE8E3);color:var(--coral,#FF6B57);}',
    '.ms-switch{display:inline-flex;align-items:center;gap:.2rem;padding:.25rem;',
    'border:1px solid var(--coral-pale,#FFE8E3);border-radius:999px;background:var(--cream,#FFF8F5);}',
    '.ms-switch .ms-opt{display:inline-flex;align-items:center;justify-content:center;gap:.3rem;',
    'padding:.45rem .8rem;border-radius:999px;color:var(--text-muted,#9A8580);font-family:inherit;',
    'font-size:.78rem;font-weight:700;line-height:1.2;text-decoration:none;white-space:nowrap;',
    'transition:background .2s,color .2s;}',
    '.ms-switch .ms-opt:hover{color:var(--coral,#FF6B57);background:transparent;}',
    '.ms-switch .ms-opt.is-active,.ms-switch .ms-opt.is-active:hover{color:#fff;',
    'background:var(--coral,#FF6B57);box-shadow:0 3px 10px rgba(255,107,87,.22);}',
    '.ms-sep{color:var(--text-muted,#9A8580);font-size:.72rem;}',
    '[data-mode-switch="block"]{display:block;margin-top:.5rem;}',
    '[data-mode-switch="block"] a.ms-join,[data-mode-switch="block"] .ms-switch{',
    'display:flex;width:100%;justify-content:center;}',
    '[data-mode-switch="block"] .ms-switch .ms-opt{flex:1;}'
  ].join('');

  function isPartner() {
    try {
      return window.localStorage.getItem(SESSION_KEY) === 'active';
    } catch (e) {
      return false;
    }
  }

  function startPartnerSession() {
    try {
      window.localStorage.setItem(SESSION_KEY, 'active');
    } catch (e) {
      /* 저장소를 못 써도 현재 페이지 기준으로 파트너 UI를 보여줍니다 */
    }
  }

  function currentMode() {
    return document.body.dataset.dayoRole === 'partner' ? 'partner' : 'learner';
  }

  function switcherMarkup(mode) {
    var learnerActive = mode === 'learner' ? ' is-active' : '';
    var partnerActive = mode === 'partner' ? ' is-active' : '';
    return '<div class="ms-switch" role="group" aria-label="학습자와 대화 파트너 모드 전환">' +
      '<a class="ms-opt' + learnerActive + '" href="index.html"' +
      (mode === 'learner' ? ' aria-current="page"' : '') + '>🎓 학습자 모드</a>' +
      '<span class="ms-sep" aria-hidden="true">⇄</span>' +
      '<a class="ms-opt' + partnerActive + '" href="partner.html"' +
      (mode === 'partner' ? ' aria-current="page"' : '') + '>☕ 파트너 스튜디오</a>' +
      '</div>';
  }

  function joinMarkup() {
    return '<a class="ms-join" href="partner.html">🌐 파트너 참여</a>';
  }

  function render() {
    var mode = currentMode();
    if (mode === 'partner') startPartnerSession();

    var markup = isPartner() ? switcherMarkup(mode) : joinMarkup();
    var slots = document.querySelectorAll('[data-mode-switch]');
    Array.prototype.forEach.call(slots, function (slot) {
      slot.innerHTML = markup;
    });
  }

  function init() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    render();
    window.DayOMode = { isPartner: isPartner, refresh: render };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
