/* DayO in-app terms mini modal — no target=_blank, auto-check on confirm */
(function () {
  'use strict';

  var CONTENTS = {
    terms: {
      title: '이용약관 요약',
      checkbox: 'msAgreeTerms',
      body: [
        '<p><strong>서비스 목적</strong></p>',
        '<p>DayO는 학습자와 글로벌 대화 파트너가 1:1 화상으로 일상 대화를 나누는 플랫폼입니다.</p>',
        '<p><strong>에스크로 결제</strong></p>',
        '<p>이용권 결제 대금은 세션 완료 전까지 안전하게 보관되며, 세션 완료 후 파트너 활동비 정산에 사용됩니다.</p>',
        '<p><strong>부정행위 제재</strong></p>',
        '<p>허위 예약, 무단 노쇼 반복, 욕설·괴롭힘, 결제 부정 이용 시 이용 제한·환불 거부·계정 정지 조치가 가능합니다.</p>',
        '<p>전문은 사이트 하단 이용약관에서 확인할 수 있습니다.</p>'
      ].join('')
    },
    privacy: {
      title: '개인정보 수집·이용 요약',
      checkbox: 'msAgreePrivacy',
      body: [
        '<p><strong>수집 항목</strong></p>',
        '<p>이메일, 닉네임, 로그인 식별자, 결제·환불 기록, 세션 이용 기록, 서비스 이용 로그.</p>',
        '<p><strong>이용 목적</strong></p>',
        '<p>회원 관리, 예약·화상 세션 제공, 결제/정산, 고객 문의 대응, 서비스 개선.</p>',
        '<p><strong>보유 기간</strong></p>',
        '<p>회원 탈퇴 시 지체 없이 파기. 단, 관련 법령에 따른 결제·거래 기록 등은 법정 기간 동안 보관합니다.</p>',
        '<p>전문은 사이트 하단 개인정보처리방침에서 확인할 수 있습니다.</p>'
      ].join('')
    },
    refund: {
      title: '취소 및 환불규정 요약',
      checkbox: 'tkRefundAgree',
      body: [
        '<p><strong>세션 시작 24시간 전 취소</strong> — 결제 금액 100% 환불</p>',
        '<p><strong>세션 시작 24시간 이내 ~ 1시간 전 취소</strong> — 결제 금액 50% 환불</p>',
        '<p><strong>세션 시작 1시간 이내 취소 또는 노쇼</strong> — 환불 불가 (티켓 차감)</p>',
        '<p>파트너 귀책(지각·미입장 등) 또는 DayO 서버 장애 시에는 100% 환불/보상 티켓이 적용됩니다.</p>',
        '<p>전문은 사이트 하단 취소 및 환불규정에서 확인할 수 있습니다.</p>'
      ].join('')
    }
  };

  var modal = null;
  var activeType = null;
  var activeCheckbox = null;
  var styleInjected = false;

  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;
    var style = document.createElement('style');
    style.id = 'dayo-terms-mini-style';
    style.textContent = [
      '#terms-mini-modal{position:fixed;inset:0;z-index:12000;display:none;align-items:center;justify-content:center;',
      'padding:1.1rem;background:rgba(62,50,45,.42);backdrop-filter:blur(6px);box-sizing:border-box;}',
      '#terms-mini-modal.is-open{display:flex !important;}',
      '.terms-mini-card{width:min(420px,100%);max-height:min(78vh,560px);overflow:auto;background:#FFFCFA;',
      'border:1px solid #EDE4D5;border-radius:20px;box-shadow:0 22px 48px rgba(113,83,72,.22);padding:1.15rem 1.1rem 1rem;}',
      '.terms-mini-card h3{margin:0 0 .7rem;font-size:1.02rem;font-weight:800;color:#3E322D;letter-spacing:-.02em;}',
      '.terms-mini-body{font-size:.82rem;line-height:1.55;color:#5C4A42;}',
      '.terms-mini-body p{margin:0 0 .55rem;}',
      '.terms-mini-body strong{color:#3E322D;}',
      '.terms-mini-actions{display:grid;gap:.45rem;margin-top:.95rem;}',
      '.terms-mini-confirm{border:none;border-radius:12px;padding:.85rem 1rem;background:#FF6B57;color:#fff;',
      'font-family:inherit;font-size:.88rem;font-weight:800;cursor:pointer;}',
      '.terms-mini-cancel{border:none;border-radius:12px;padding:.7rem 1rem;background:#F4F1ED;color:#5C4A42;',
      'font-family:inherit;font-size:.8rem;font-weight:700;cursor:pointer;}',
      '[data-terms-mini]{border:none;background:none;padding:0;margin:0 0 0 .2rem;color:#E85B48;font:inherit;',
      'font-weight:800;text-decoration:underline;text-underline-offset:2px;cursor:pointer;}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureModal() {
    injectStyle();
    if (modal && document.body.contains(modal)) return modal;
    modal = document.getElementById('terms-mini-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'terms-mini-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'terms-mini-title');
      modal.innerHTML = [
        '<div class="terms-mini-card">',
        '  <h3 id="terms-mini-title"></h3>',
        '  <div class="terms-mini-body" id="terms-mini-body"></div>',
        '  <div class="terms-mini-actions">',
        '    <button type="button" class="terms-mini-confirm" id="terms-mini-confirm">확인 및 동의</button>',
        '    <button type="button" class="terms-mini-cancel" id="terms-mini-cancel">닫기</button>',
        '  </div>',
        '</div>'
      ].join('');
      document.body.appendChild(modal);
    }
    if (!modal._dayoBound) {
      modal._dayoBound = true;
      modal.addEventListener('click', function (e) {
        if (e.target === modal) close();
      });
      var confirmBtn = modal.querySelector('#terms-mini-confirm');
      var cancelBtn = modal.querySelector('#terms-mini-cancel');
      if (confirmBtn) confirmBtn.addEventListener('click', confirmAndAgree);
      if (cancelBtn) cancelBtn.addEventListener('click', close);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) close();
      });
    }
    return modal;
  }

  function resolveCheckbox(type, explicitSelector) {
    if (explicitSelector) {
      var bySel = document.querySelector(explicitSelector);
      if (bySel) return bySel;
    }
    var conf = CONTENTS[type];
    if (!conf || !conf.checkbox) return null;
    return document.getElementById(conf.checkbox);
  }

  function open(type, checkboxOrSelector) {
    var conf = CONTENTS[type];
    if (!conf) return;
    var root = ensureModal();
    activeType = type;
    if (checkboxOrSelector && checkboxOrSelector.nodeType === 1) {
      activeCheckbox = checkboxOrSelector;
    } else {
      activeCheckbox = resolveCheckbox(type, checkboxOrSelector);
    }
    var title = root.querySelector('#terms-mini-title');
    var body = root.querySelector('#terms-mini-body');
    if (title) title.textContent = conf.title;
    if (body) body.innerHTML = conf.body;
    root.classList.add('is-open');
    root.style.display = 'flex';
    root.setAttribute('aria-hidden', 'false');
  }

  function close() {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    activeType = null;
    activeCheckbox = null;
  }

  function confirmAndAgree() {
    var box = activeCheckbox || resolveCheckbox(activeType);
    if (box) {
      box.checked = true;
      try {
        box.dispatchEvent(new Event('change', { bubbles: true }));
        box.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (e) { /* ignore */ }
    }
    close();
  }

  function bindDelegatedClicks(root) {
    var scope = root || document;
    scope.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-terms-mini]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      var type = btn.getAttribute('data-terms-mini');
      var checkSel = btn.getAttribute('data-terms-check');
      open(type, checkSel);
    }, true);
  }

  window.DayOTermsMini = {
    open: open,
    close: close,
    confirmAndAgree: confirmAndAgree,
    ensure: ensureModal,
    bind: bindDelegatedClicks
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      ensureModal();
      bindDelegatedClicks(document);
    });
  } else {
    ensureModal();
    bindDelegatedClicks(document);
  }
})();
