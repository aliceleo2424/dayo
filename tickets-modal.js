/* DayO 세션 이용권 구매 모달 — mypage / index 공용 (결제 연동 전 UI)
 * 트리거: [data-tickets-open] 또는 ?tickets=open
 */
(function () {
  'use strict';

  function t(key, vars) {
    if (!window.DayOI18n) return key;
    return vars ? window.DayOI18n.tf(key, vars) : window.DayOI18n.t(key);
  }

  var PLANS = [
    {
      id: 'trial',
      badge: '첫 방문 전용 ☕️',
      title: '첫 1회 체험권',
      price: '9,900원',
      meta: '1장',
      copy: '1초 찍먹 체험가',
      tickets: 1,
      featured: false
    },
    {
      id: 'single',
      badge: '',
      title: '1회 단품권',
      price: '16,000원',
      meta: '1장',
      copy: '필요할 때 가볍게 구매하는 기본 티켓',
      tickets: 1,
      featured: false
    },
    {
      id: 'pack10',
      badge: '🔥 BEST! 1장 무료',
      title: '10회 패키지',
      price: '160,000원',
      meta: '10장 + 1장 증정 (총 11장)',
      copy: '회당 약 14,545원꼴',
      tickets: 11,
      featured: true
    },
    {
      id: 'month',
      badge: '🚀 1일 1스피킹 챌린지',
      title: '한 달 완주 패키지',
      price: '400,000원',
      meta: '25장 + 3장 증정 (총 28장)',
      copy: '3장 무료 증정',
      tickets: 28,
      featured: false
    }
  ];

  var CSS = [
    '.tk-overlay{position:fixed;inset:0;z-index:920;display:flex;align-items:center;justify-content:center;',
    'padding:1.1rem;background:rgba(92,74,66,.28);backdrop-filter:blur(10px);',
    'opacity:0;visibility:hidden;transition:opacity .28s ease,visibility .28s ease;}',
    '.tk-overlay.is-open{opacity:1;visibility:visible;}',
    '.tk-modal{position:relative;width:100%;max-width:720px;max-height:min(90vh,90dvh);',
    'display:flex;flex-direction:column;overflow:hidden;',
    'border-radius:28px;border:1px solid rgba(255,209,220,.75);background:#FFFCFA;',
    'box-shadow:0 28px 64px rgba(113,83,72,.2);color:#5C4A42;font-family:inherit;',
    'transform:translateY(18px) scale(.97);transition:transform .36s cubic-bezier(.34,1.3,.64,1);}',
    '.tk-overlay.is-open .tk-modal{transform:translateY(0) scale(1);}',
    '.tk-close{position:absolute;top:.95rem;right:.95rem;z-index:2;width:36px;height:36px;',
    'border:none;border-radius:50%;background:rgba(255,255,255,.8);color:#FF6B57;',
    'font-size:1rem;cursor:pointer;line-height:1;}',
    '.tk-close:hover{background:#FF6B57;color:#fff;}',
    '.tk-head{padding:1.55rem 1.55rem 1.15rem;background:linear-gradient(135deg,#FFD1DC,#FFE5B4 55%,#FFF1D8);',
    'text-align:center;}',
    '.tk-eyebrow{font-size:.72rem;font-weight:800;letter-spacing:.06em;color:#FF6B57;text-transform:uppercase;}',
    '.tk-title{margin-top:.35rem;font-family:Quicksand,Gowun Dodum,sans-serif;font-size:clamp(1.25rem,3.2vw,1.55rem);',
    'font-weight:800;letter-spacing:-.03em;line-height:1.35;}',
    '.tk-sub{margin:.55rem auto 0;max-width:28rem;font-size:.88rem;line-height:1.6;color:#9A8580;font-weight:600;}',
    '.tk-body{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:1.2rem 1.25rem 1.4rem;}',
    '.tk-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem;}',
    '.tk-card{position:relative;display:flex;flex-direction:column;gap:.45rem;padding:1.1rem 1rem 1.05rem;',
    'border-radius:22px;border:1px solid rgba(255,209,220,.7);background:linear-gradient(180deg,#FFFCFA,#FFF8F5);',
    'box-shadow:0 8px 22px rgba(113,83,72,.06);text-align:left;}',
    '.tk-card--best{border-color:rgba(255,107,87,.55);background:linear-gradient(165deg,#FFF6F2 0%,#FFE8E3 48%,#FFF9F4 100%);',
    'box-shadow:0 12px 28px rgba(255,107,87,.14),0 0 0 1px rgba(255,107,87,.08);}',
    '.tk-badge{display:inline-flex;align-self:flex-start;padding:.28rem .65rem;border-radius:999px;',
    'background:rgba(255,249,196,.85);border:1px solid rgba(255,209,220,.7);',
    'color:#5C4A42;font-size:.72rem;font-weight:800;line-height:1.2;}',
    '.tk-card--best .tk-badge{background:linear-gradient(135deg,#FF7A68,#FF6B57);color:#fff;border-color:transparent;}',
    '.tk-card__title{font-family:Quicksand,Gowun Dodum,sans-serif;font-size:1.02rem;font-weight:800;letter-spacing:-.02em;}',
    '.tk-card__price{font-size:1.35rem;font-weight:800;color:#FF6B57;letter-spacing:-.03em;line-height:1.2;}',
    '.tk-card__meta{font-size:.78rem;font-weight:700;color:#9A8580;}',
    '.tk-card__copy{margin-top:.15rem;font-size:.8rem;font-weight:600;line-height:1.45;color:#5C4A42;}',
    '.tk-card__cta{margin-top:auto;padding-top:.65rem;}',
    '.tk-buy{width:100%;padding:.7rem .9rem;border:none;border-radius:999px;cursor:pointer;',
    'font-family:inherit;font-size:.86rem;font-weight:800;color:#fff;',
    'background:linear-gradient(135deg,#FF7A68,#FF6B57 55%,#FF8A4C);',
    'box-shadow:0 4px 0 #E55A45,0 8px 18px rgba(255,107,87,.22);',
    'transition:transform .15s ease,box-shadow .15s ease;}',
    '.tk-buy:hover{transform:translateY(-1px);box-shadow:0 5px 0 #E55A45,0 10px 20px rgba(255,107,87,.26);}',
    '.tk-buy:active{transform:translateY(2px);box-shadow:0 2px 0 #E55A45,0 4px 10px rgba(255,107,87,.18);}',
    '.tk-card--best .tk-buy{background:linear-gradient(135deg,#FF6B57,#FF8A4C);}',
    '.tk-policy{margin-top:1.15rem;padding:1rem 1.05rem;border-radius:20px;',
    'border:1px solid rgba(255,209,220,.65);background:linear-gradient(160deg,rgba(255,246,242,.95),rgba(255,249,230,.9));}',
    '.tk-policy__title{margin:0 0 .7rem;font-size:.88rem;font-weight:800;}',
    '.tk-policy__list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:.55rem;}',
    '.tk-policy__list li{font-size:.8rem;font-weight:600;line-height:1.55;color:#5C4A42;}',
    '.tk-policy__list strong{font-weight:800;color:#FF6B57;}',
    '.tk-toast{position:fixed;left:50%;bottom:1.5rem;z-index:940;transform:translateX(-50%) translateY(12px);',
    'max-width:min(360px,90vw);padding:.75rem 1.1rem;border-radius:16px;border:1px solid rgba(255,209,220,.75);',
    'background:#FFFCFA;box-shadow:0 12px 28px rgba(113,83,72,.16);font-size:.86rem;font-weight:700;',
    'opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;text-align:center;}',
    '.tk-toast.is-on{opacity:1;transform:translateX(-50%) translateY(0);}',
    '@media (max-width:640px){',
    '.tk-grid{grid-template-columns:1fr;}',
    '.tk-head{padding:1.35rem 1.15rem 1rem;}',
    '.tk-body{padding:1rem .95rem 1.2rem;}',
    '}'
  ].join('');

  var el = {};
  var lastFocused = null;
  var toastTimer = null;

  function planCard(plan) {
    var badge = plan.badge
      ? '<span class="tk-badge">' + plan.badge + '</span>'
      : '';
    return '' +
      '<article class="tk-card' + (plan.featured ? ' tk-card--best' : '') + '" data-plan="' + plan.id + '">' +
        badge +
        '<h3 class="tk-card__title">' + plan.title + '</h3>' +
        '<p class="tk-card__price">' + plan.price + '</p>' +
        '<p class="tk-card__meta">' + plan.meta + '</p>' +
        '<p class="tk-card__copy">' + plan.copy + '</p>' +
        '<div class="tk-card__cta">' +
          '<button type="button" class="tk-buy" data-tk-buy="' + plan.id + '">구매하기</button>' +
        '</div>' +
      '</article>';
  }

  function buildMarkup() {
    return '' +
      '<div class="tk-modal" role="dialog" aria-modal="true" aria-labelledby="tkTitle">' +
        '<button type="button" class="tk-close" data-tk-close aria-label="닫기">✕</button>' +
        '<div class="tk-head">' +
          '<p class="tk-eyebrow">TICKETS</p>' +
          '<h2 class="tk-title" id="tkTitle">DayO 세션 이용권 ☕️</h2>' +
          '<p class="tk-sub">1회 20분 1:1 라이브 대화 + AI 코파일럿 &amp; 분석 리포트 포함</p>' +
        '</div>' +
        '<div class="tk-body">' +
          '<div class="tk-grid">' + PLANS.map(planCard).join('') + '</div>' +
          '<aside class="tk-policy" aria-label="이용 및 취소 정책">' +
            '<p class="tk-policy__title">이용 · 취소 · 노쇼 안내</p>' +
            '<ul class="tk-policy__list">' +
              '<li>📌 <strong>유효기간:</strong> 결제일로부터 90일 (넉넉한 사용 기간)</li>' +
              '<li>🔄 <strong>취소 규정:</strong> 수업 시작 1시간 전까지 100% 무료 취소 (티켓 복구)</li>' +
              '<li>💌 <strong>노쇼 &amp; 1시간 이내 취소:</strong> 티켓 1회 차감 + <strong>☕️ 복습용 토닥토닥 1분 리포트</strong> 이메일 자동 발송</li>' +
              '<li>⚠️ <strong>환불 안내:</strong> 구매 후 미사용 티켓은 환불 불가</li>' +
            '</ul>' +
          '</aside>' +
        '</div>' +
      '</div>';
  }

  function showToast(message) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.classList.remove('is-on');
    }, 2800);
  }

  function open() {
    lastFocused = document.activeElement;
    el.overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    var closeBtn = el.overlay.querySelector('[data-tk-close]');
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    el.overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function bindEvents() {
    el.overlay.addEventListener('click', function (e) {
      if (e.target === el.overlay || e.target.closest('[data-tk-close]')) close();
    });

    el.overlay.addEventListener('click', function (e) {
      var buy = e.target.closest('[data-tk-buy]');
      if (!buy) return;
      var plan = null;
      for (var i = 0; i < PLANS.length; i++) {
        if (PLANS[i].id === buy.getAttribute('data-tk-buy')) {
          plan = PLANS[i];
          break;
        }
      }
      if (!plan) return;

      var wallet = window.DayOTicketWallet;
      var added = plan.tickets || 0;
      var result = wallet
        ? wallet.addTickets(added)
        : { ticketCount: added, added: added };

      showToast('🎉 결제가 완료되었습니다! 이용권 ' + result.added + '장이 충전되었습니다.');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.overlay.classList.contains('is-open')) close();
    });
  }

  function openFromQuery() {
    if (!/[?&]tickets=open(&|$)/.test(window.location.search)) return;
    open();
    if (window.history && window.history.replaceState) {
      var clean = window.location.search.replace(/([?&])tickets=open(&|$)/, '$1').replace(/[?&]$/, '');
      window.history.replaceState({}, '', window.location.pathname + clean + window.location.hash);
    }
  }

  function mount() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.className = 'tk-overlay';
    overlay.id = 'tkOverlay';
    overlay.innerHTML = buildMarkup();
    document.body.appendChild(overlay);

    var toast = document.createElement('div');
    toast.className = 'tk-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);

    el.overlay = overlay;
    el.toast = toast;
    bindEvents();
  }

  function init() {
    mount();
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-tickets-open]');
      if (!trigger) return;
      e.preventDefault();
      open();
    });
    window.DayOTickets = {
      open: open,
      close: close,
      plans: PLANS
    };
    openFromQuery();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
