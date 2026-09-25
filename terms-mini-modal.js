/* DayO in-app terms/refund mini modals — no target=_blank, auto-check on confirm */
(function () {
  'use strict';

  var CONTENTS = {
    terms: {
      title: '📋 이용약관 안내',
      checkbox: 'msAgreeTerms',
      body: [
        '<p class="terms-mini-section">[서비스 목적]</p>',
        '<ul>',
        '<li>DayO는 학습자와 글로벌 대화 파트너가 1:1 화상으로 일상 대화를 나누는 플랫폼입니다.</li>',
        '</ul>',
        '<p class="terms-mini-section">[에스크로 결제]</p>',
        '<ul>',
        '<li>이용권 결제 대금은 세션 완료 전까지 안전하게 보관되며, 세션 완료 후 파트너 활동비 정산에 사용됩니다.</li>',
        '</ul>',
        '<p class="terms-mini-section">[부정행위 제재]</p>',
        '<ul>',
        '<li>허위 예약, 무단 노쇼 반복, 욕설·괴롭힘, 결제 부정 이용 시 이용 제한·환불 거부·계정 정지 조치가 가능합니다.</li>',
        '</ul>'
      ].join('')
    },
    privacy: {
      title: '📋 개인정보 수집·이용 안내',
      checkbox: 'msAgreePrivacy',
      body: [
        '<p class="terms-mini-section">[수집 항목]</p>',
        '<ul>',
        '<li>이메일, 닉네임, 로그인 식별자, 결제·환불 기록, 세션 이용 기록, 서비스 이용 로그</li>',
        '</ul>',
        '<p class="terms-mini-section">[이용 목적]</p>',
        '<ul>',
        '<li>회원 관리, 예약·화상 세션 제공, 결제/정산, 고객 문의 대응, 서비스 개선</li>',
        '</ul>',
        '<p class="terms-mini-section">[보유 기간]</p>',
        '<ul>',
        '<li>회원 탈퇴 시 지체 없이 파기. 단, 관련 법령에 따른 결제·거래 기록 등은 법정 기간 동안 보관합니다.</li>',
        '</ul>'
      ].join('')
    },
    refund: {
      title: '📋 취소 및 환불 규정 안내',
      checkbox: 'tkRefundAgree',
      body: [
        '<p class="terms-mini-section">[세션 취소/환불 기준]</p>',
        '<ul>',
        '<li>대화 시작 <strong>6시간 전까지</strong> 취소: 사용한 티켓을 <strong>원래 유효기간으로 반환</strong></li>',
        '<li>대화 시작까지 <strong>6시간 미만</strong> 남았을 때 취소: <strong>티켓 미반환</strong></li>',
        '</ul>',
        '<p class="terms-mini-section">[플랫폼 / 파트너 귀책사유]</p>',
        '<ul>',
        '<li>DayO 또는 파트너 사정으로 대화가 진행되지 못한 경우: 별도 환불 기준에 따라 <strong>티켓 반환</strong></li>',
        '</ul>',
        '<p class="terms-mini-section">[유효기간 및 기타]</p>',
        '<ul>',
        '<li>티켓은 발급일로부터 <strong>90일 내</strong> 사용</li>',
        '<li>디지털 콘텐츠(PDF 등) 다운로드 완료 후 청약철회 불가</li>',
        '</ul>'
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
      '#terms-mini-modal,#refund-mini-modal{position:fixed;inset:0;z-index:1000002;display:none;',
      'align-items:center;justify-content:center;padding:1.1rem;background:rgba(62,50,45,.45);',
      'backdrop-filter:blur(6px);box-sizing:border-box;}',
      '#terms-mini-modal.is-open,#refund-mini-modal.is-open{display:flex !important;}',
      '.terms-mini-card{width:min(420px,100%);max-height:min(78vh,560px);display:flex;flex-direction:column;',
      'background:#FFFFFF;border:1px solid #EDE4D5;border-radius:20px;',
      'box-shadow:0 22px 48px rgba(113,83,72,.24);padding:20px;box-sizing:border-box;}',
      '.terms-mini-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;margin-bottom:.75rem;flex-shrink:0;}',
      '.terms-mini-head h3{margin:0;font-size:1.02rem;font-weight:800;color:#3E322D;letter-spacing:-.02em;line-height:1.35;}',
      '.terms-mini-x{width:30px;height:30px;border:none;border-radius:50%;background:#F4F1ED;color:#5C4A42;',
      'font-size:.9rem;line-height:1;cursor:pointer;flex:0 0 auto;}',
      '.terms-mini-body{flex:1 1 auto;min-height:0;overflow-y:auto;font-size:12.5px;line-height:1.55;color:#5C4A42;}',
      '.terms-mini-body p{margin:0 0 .45rem;}',
      '.terms-mini-section{margin:0.85rem 0 0.35rem !important;font-weight:800;color:#3E322D;}',
      '.terms-mini-section:first-child{margin-top:0 !important;}',
      '.terms-mini-body ul{margin:0 0 .55rem;padding-left:1.1rem;}',
      '.terms-mini-body li{margin:0 0 .28rem;}',
      '.terms-mini-body strong{color:#3E322D;}',
      '.terms-mini-actions{display:grid;gap:.45rem;margin-top:1rem;flex-shrink:0;}',
      '.terms-mini-confirm{border:none;border-radius:12px;padding:12px 1rem;background:#FF6B57;color:#fff;',
      'font-family:inherit;font-size:.88rem;font-weight:800;cursor:pointer;}',
      '.terms-mini-confirm:hover{background:#E85B48;}',
      '[data-terms-mini],[data-refund-mini]{border:none;background:none;padding:0;margin:0 0 0 .2rem;color:#E85B48;',
      'font:inherit;font-weight:800;text-decoration:underline;text-underline-offset:2px;cursor:pointer;}'
    ].join('');
    document.head.appendChild(style);
  }

  function modalIdFor(type) {
    return type === 'refund' ? 'refund-mini-modal' : 'terms-mini-modal';
  }

  function ensureModal(type) {
    injectStyle();
    var id = modalIdFor(type || 'terms');
    var existing = document.getElementById(id);
    if (existing) {
      modal = existing;
      return modal;
    }
    modal = document.createElement('div');
    modal.id = id;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', id + '-title');
    modal.innerHTML = [
      '<div class="terms-mini-card">',
      '  <div class="terms-mini-head">',
      '    <h3 id="' + id + '-title"></h3>',
      '    <button type="button" class="terms-mini-x" data-terms-mini-close aria-label="닫기">✕</button>',
      '  </div>',
      '  <div class="terms-mini-body" data-terms-mini-body></div>',
      '  <div class="terms-mini-actions">',
      '    <button type="button" class="terms-mini-confirm" data-terms-mini-confirm>확인 및 동의</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.closest('[data-terms-mini-close]')) {
        close();
      }
    });
    var confirmBtn = modal.querySelector('[data-terms-mini-confirm]');
    if (confirmBtn) confirmBtn.addEventListener('click', confirmAndAgree);
    return modal;
  }

  function resolveCheckbox(type, explicitSelector) {
    if (explicitSelector) {
      if (explicitSelector.nodeType === 1) return explicitSelector;
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
    var root = ensureModal(type);
    activeType = type;
    activeCheckbox = resolveCheckbox(type, checkboxOrSelector);
    var title = root.querySelector('h3');
    var body = root.querySelector('[data-terms-mini-body]');
    if (title) title.textContent = conf.title;
    if (body) body.innerHTML = conf.body;
    root.classList.add('is-open');
    root.style.display = 'flex';
    root.setAttribute('aria-hidden', 'false');
    /* Keep above tickets / auth overlays even if CSS load order changes */
    root.style.zIndex = '1000002';
  }

  function close() {
    ['terms-mini-modal', 'refund-mini-modal'].forEach(function (id) {
      var node = document.getElementById(id);
      if (!node) return;
      node.classList.remove('is-open');
      node.style.display = 'none';
      node.setAttribute('aria-hidden', 'true');
    });
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
      } catch (e) {
        try {
          var evt = document.createEvent('HTMLEvents');
          evt.initEvent('change', true, false);
          box.dispatchEvent(evt);
        } catch (e2) { /* ignore */ }
      }
    }
    close();
  }

  function openRefundMiniModal(checkboxOrSelector) {
    open('refund', checkboxOrSelector || '#tkRefundAgree');
  }

  function bindDelegatedClicks(root) {
    var scope = root || document;
    scope.addEventListener('click', function (e) {
      var refundBtn = e.target.closest && e.target.closest('[data-refund-mini], [data-open-refund-mini]');
      if (refundBtn) {
        e.preventDefault();
        e.stopPropagation();
        openRefundMiniModal(refundBtn.getAttribute('data-terms-check') || '#tkRefundAgree');
        return;
      }

      var btn = e.target.closest && e.target.closest('[data-terms-mini]');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        var type = btn.getAttribute('data-terms-mini');
        var checkSel = btn.getAttribute('data-terms-check');
        if (type === 'refund') openRefundMiniModal(checkSel || '#tkRefundAgree');
        else open(type, checkSel);
        return;
      }

      /* Catch any leftover external refund/terms/privacy links inside auth/tickets modals */
      var link = e.target.closest && e.target.closest('a[href]');
      if (!link) return;
      var href = String(link.getAttribute('href') || '');
      var inAuthOrTickets = !!(link.closest('.tk-overlay, .ms-overlay, .tk-consent, .ms-consent'));
      if (!inAuthOrTickets) return;
      if (/\/refund\/?(\?|#|$)/i.test(href)) {
        e.preventDefault();
        e.stopPropagation();
        openRefundMiniModal('#tkRefundAgree');
        return;
      }
      if (/\/terms\/?(\?|#|$)/i.test(href)) {
        e.preventDefault();
        e.stopPropagation();
        open('terms', '#msAgreeTerms');
        return;
      }
      if (/\/privacy\/?(\?|#|$)/i.test(href)) {
        e.preventDefault();
        e.stopPropagation();
        open('privacy', '#msAgreePrivacy');
      }
    }, true);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var openMini = document.querySelector('#terms-mini-modal.is-open, #refund-mini-modal.is-open');
    if (openMini) {
      e.stopPropagation();
      close();
    }
  }, true);

  window.DayOTermsMini = {
    open: open,
    close: close,
    confirmAndAgree: confirmAndAgree,
    ensure: ensureModal,
    bind: bindDelegatedClicks,
    openRefund: openRefundMiniModal
  };
  window.openRefundMiniModal = openRefundMiniModal;
  window.openTermsMiniModal = function () { open('terms', '#msAgreeTerms'); };
  window.openPrivacyMiniModal = function () { open('privacy', '#msAgreePrivacy'); };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      injectStyle();
      bindDelegatedClicks(document);
    });
  } else {
    injectStyle();
    bindDelegatedClicks(document);
  }
})();
