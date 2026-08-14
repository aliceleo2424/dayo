/* DayO 세션 이용권 구매 모달 — mypage / index 공용 (결제 연동 전 UI)
 * 트리거: [data-tickets-open] 또는 ?tickets=open
 * 미사용 WELCOME_9900 쿠폰이 있으면 1회 이용권(19,900원)에 자동 적용 → 9,900원
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
      badge: '첫 가입 전용 ☕️',
      title: '첫 세션 체험 할인권',
      price: '9,900원',
      priceValue: 9900,
      meta: '1회',
      copy: '첫 가입 전용 체험가',
      tickets: 1,
      featured: false
    },
    {
      id: 'single',
      badge: '',
      title: '1회 단품 이용권',
      price: '19,900원',
      priceValue: 19900,
      meta: '1회',
      copy: '필요할 때 한 회씩 가볍게',
      tickets: 1,
      featured: false
    },
    {
      id: 'pack10',
      badge: '🔥 BEST! 1회 무료',
      title: '10회 패키지',
      price: '199,000원',
      priceValue: 199000,
      meta: '10회 결제 + 1회 서비스 (총 11회)',
      copy: '10회 가격에 1회(19,900원 상당) 무료 증정!',
      tickets: 11,
      featured: true
    },
    {
      id: 'pack3m',
      badge: '🚀 실속 패키지',
      title: '3개월 속성 패키지',
      price: '597,000원',
      priceValue: 597000,
      meta: '30회 결제 + 4회 서비스 (총 34회)',
      copy: '30회 가격으로 총 34회 이용! 4회(79,600원 상당) 무료 증정 / 90일 내 자유 예약',
      tickets: 34,
      featured: false
    }
  ];

  var CSS = [
    '.tk-overlay{position:fixed;inset:0;z-index:920;display:flex;align-items:center;justify-content:center;',
    'padding:1.1rem;background:rgba(92,74,66,.28);backdrop-filter:blur(10px);',
    'width:100%;max-width:100%;overflow-x:hidden;box-sizing:border-box;',
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
    '.tk-duebar{display:none;margin:0 0 1rem;padding:1.05rem 1.1rem 1.15rem;border-radius:22px;text-align:center;',
    'border:1px solid rgba(255,107,87,.28);background:linear-gradient(165deg,#FFF6F2,#FFE8E3 50%,#FFF9F4);',
    'box-shadow:0 10px 24px rgba(255,107,87,.12);}',
    '.tk-duebar.is-on{display:block;}',
    '.tk-duebar__label{font-size:.78rem;font-weight:800;color:#FF6B57;letter-spacing:.02em;}',
    '.tk-duebar__was{margin-top:.35rem;font-size:.95rem;font-weight:700;color:#9A8580;text-decoration:line-through;}',
    '.tk-duebar__now{margin-top:.1rem;font-size:clamp(1.85rem,5vw,2.35rem);font-weight:900;color:#FF6B57;',
    'letter-spacing:-.04em;line-height:1.15;}',
    '.tk-duebar__hint{margin-top:.35rem;font-size:.78rem;font-weight:700;color:#5C4A42;}',
    '.tk-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem;}',
    '.tk-card{position:relative;display:flex;flex-direction:column;gap:.45rem;padding:1.1rem 1rem 1.05rem;',
    'border-radius:22px;border:1px solid rgba(255,209,220,.7);background:linear-gradient(180deg,#FFFCFA,#FFF8F5);',
    'box-shadow:0 8px 22px rgba(113,83,72,.06);text-align:left;}',
    '.tk-card--best{border-color:rgba(255,107,87,.55);background:linear-gradient(165deg,#FFF6F2 0%,#FFE8E3 48%,#FFF9F4 100%);',
    'box-shadow:0 12px 28px rgba(255,107,87,.14),0 0 0 1px rgba(255,107,87,.08);}',
    '.tk-card--coupon{border-color:rgba(255,107,87,.45);background:linear-gradient(165deg,#FFF9F6,#FFEDE8);}',
    '.tk-badge{display:inline-flex;align-self:flex-start;padding:.28rem .65rem;border-radius:999px;',
    'background:rgba(255,249,196,.85);border:1px solid rgba(255,209,220,.7);',
    'color:#5C4A42;font-size:.72rem;font-weight:800;line-height:1.2;}',
    '.tk-card--best .tk-badge,.tk-card--coupon .tk-badge{background:linear-gradient(135deg,#FF7A68,#FF6B57);color:#fff;border-color:transparent;}',
    '.tk-card__title{font-family:Quicksand,Gowun Dodum,sans-serif;font-size:1.02rem;font-weight:800;letter-spacing:-.02em;}',
    '.tk-card__was{margin:0;font-size:.88rem;font-weight:700;color:#9A8580;text-decoration:line-through;}',
    '.tk-card__price{font-size:1.35rem;font-weight:800;color:#FF6B57;letter-spacing:-.03em;line-height:1.2;}',
    '.tk-card__price--due{font-size:1.85rem;font-weight:900;}',
    '.tk-card__meta{font-size:.78rem;font-weight:700;color:#9A8580;}',
    '.tk-card__copy{margin-top:.15rem;font-size:.8rem;font-weight:600;line-height:1.45;color:#5C4A42;}',
    '.tk-coupon{display:flex;align-items:flex-start;gap:.5rem;margin-top:.2rem;padding:.65rem .7rem;',
    'border-radius:16px;border:1px solid rgba(255,107,87,.22);background:rgba(255,255,255,.72);cursor:pointer;}',
    '.tk-coupon input{margin-top:.15rem;accent-color:#FF6B57;width:1rem;height:1rem;flex:0 0 auto;}',
    '.tk-coupon span{font-size:.78rem;font-weight:800;line-height:1.45;color:#5C4A42;}',
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
    'max-width:min(360px,calc(100% - 2rem));padding:.75rem 1.1rem;border-radius:16px;border:1px solid rgba(255,209,220,.75);',
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
  var buying = false;
  var couponState = {
    unusedWelcome: null,
    applyWelcome: true
  };

  function formatWon(n) {
    return Number(n).toLocaleString('ko-KR') + '원';
  }

  function welcomeDue() {
    var coupon = couponState.unusedWelcome;
    return {
      original: Number(coupon && coupon.original_price) || 19900,
      due: Number(coupon && coupon.discount_price) || 9900
    };
  }

  function isCouponApplied() {
    return !!(couponState.applyWelcome && couponState.unusedWelcome);
  }

  function visiblePlans() {
    return PLANS.filter(function (plan) {
      if (plan.id === 'trial' && couponState.unusedWelcome) return false;
      return true;
    });
  }

  function planCard(plan) {
    var applied = plan.id === 'single' && isCouponApplied();
    var prices = welcomeDue();
    var badge = plan.badge
      ? '<span class="tk-badge">' + plan.badge + '</span>'
      : (applied ? '<span class="tk-badge">체험 할인권 적용</span>' : '');
    var priceHtml = applied
      ? '<p class="tk-card__was">' + formatWon(prices.original) + '</p>' +
        '<p class="tk-card__price tk-card__price--due">' + formatWon(prices.due) + '</p>'
      : '<p class="tk-card__price">' + plan.price + '</p>';
    var couponHtml = '';
    if (plan.id === 'single' && couponState.unusedWelcome) {
      couponHtml =
        '<label class="tk-coupon">' +
          '<input type="checkbox" data-tk-coupon' + (couponState.applyWelcome ? ' checked' : '') + '>' +
          '<span>🎉 첫 세션 9,900원 체험 할인권 (19,900원 ➔ 9,900원)</span>' +
        '</label>';
    }
    var cls = 'tk-card';
    if (plan.featured) cls += ' tk-card--best';
    if (applied) cls += ' tk-card--coupon';
    return '' +
      '<article class="' + cls + '" data-plan="' + plan.id + '">' +
        badge +
        '<h3 class="tk-card__title">' + plan.title + '</h3>' +
        priceHtml +
        '<p class="tk-card__meta">' + plan.meta + '</p>' +
        '<p class="tk-card__copy">' + (applied ? '첫 세션 체험가로 결제돼요' : plan.copy) + '</p>' +
        couponHtml +
        '<div class="tk-card__cta">' +
          '<button type="button" class="tk-buy" data-tk-buy="' + plan.id + '">' +
            (applied ? formatWon(prices.due) + ' 결제하기' : '구매하기') +
          '</button>' +
        '</div>' +
      '</article>';
  }

  function renderPlans() {
    if (!el.grid) return;
    el.grid.innerHTML = visiblePlans().map(planCard).join('');
    if (el.duebar) {
      var on = isCouponApplied();
      el.duebar.classList.toggle('is-on', on);
      if (on) {
        var prices = welcomeDue();
        el.duebar.querySelector('[data-tk-due-was]').textContent = formatWon(prices.original);
        el.duebar.querySelector('[data-tk-due-now]').textContent = formatWon(prices.due);
      }
    }
  }

  function buildMarkup() {
    return '' +
      '<div class="tk-modal" role="dialog" aria-modal="true" aria-labelledby="tkTitle">' +
        '<button type="button" class="tk-close" data-tk-close aria-label="닫기">✕</button>' +
        '<div class="tk-head">' +
          '<p class="tk-eyebrow">TICKETS</p>' +
          '<h2 class="tk-title" id="tkTitle">DayO 세션 이용권 ☕️</h2>' +
          '<p class="tk-sub">기준 세션: 총 30분 (25분 화상 대화 + 5분 미니 퀴즈/리포트)</p>' +
        '</div>' +
        '<div class="tk-body">' +
          '<div class="tk-duebar" data-tk-duebar>' +
            '<p class="tk-duebar__label">🎉 첫 세션 체험 할인권 자동 적용</p>' +
            '<p class="tk-duebar__was" data-tk-due-was>19,900원</p>' +
            '<p class="tk-duebar__now" data-tk-due-now>9,900원</p>' +
            '<p class="tk-duebar__hint">1회 이용권 결제 예정 금액</p>' +
          '</div>' +
          '<div class="tk-grid" data-tk-grid></div>' +
          '<aside class="tk-policy" aria-label="세션 규정 및 이용 안내">' +
            '<p class="tk-policy__title">세션 규정 및 이용 안내</p>' +
            '<ul class="tk-policy__list">' +
              '<li>📌 <strong>유효기간:</strong> 모든 이용권은 결제 후 90일 내 소진 필수.</li>' +
              '<li>🔄 <strong>변경/취소:</strong> 세션 요일 및 시간 변경/취소는 세션 시작 1시간 전까지 가능.</li>' +
              '<li>💌 <strong>노쇼:</strong> 세션 시작 1시간 이내 취소 및 노쇼 발생 시 티켓이 차감되며 \'토닥토닥 리포트\'가 발송됨.</li>' +
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

  function findPlan(id) {
    for (var i = 0; i < PLANS.length; i++) {
      if (PLANS[i].id === id) return PLANS[i];
    }
    return null;
  }

  async function loadCoupons() {
    var store = window.DayOProfileStore;
    var rows = [];
    if (store && typeof store.fetchCoupons === 'function') {
      try {
        rows = await store.fetchCoupons();
      } catch (e) {
        rows = [];
      }
    }
    var welcome = store && typeof store.getUnusedWelcomeCoupon === 'function'
      ? store.getUnusedWelcomeCoupon(rows)
      : null;
    couponState.unusedWelcome = welcome || null;
    couponState.applyWelcome = !!couponState.unusedWelcome;
    renderPlans();
    return couponState.unusedWelcome;
  }

  function open() {
    lastFocused = document.activeElement;
    el.overlay.classList.add('is-open');
    if (window.DayOScrollLock) window.DayOScrollLock.lock();
    else document.body.style.overflow = 'hidden';
    var closeBtn = el.overlay.querySelector('[data-tk-close]');
    if (closeBtn) closeBtn.focus();
    loadCoupons();
  }

  function close() {
    if (!el.overlay.classList.contains('is-open')) return;
    el.overlay.classList.remove('is-open');
    if (window.DayOScrollLock) window.DayOScrollLock.unlock();
    else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.body.style.paddingRight = '';
      document.body.style.transform = '';
      document.documentElement.style.overflow = '';
    }
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  async function completePurchase(plan) {
    if (buying || !plan) return;
    buying = true;
    var applyCoupon = plan.id === 'single' && isCouponApplied();
    var coupon = couponState.unusedWelcome;
    try {
      if (applyCoupon && window.DayOProfileStore && typeof window.DayOProfileStore.markCouponUsed === 'function') {
        await window.DayOProfileStore.markCouponUsed(coupon);
        couponState.unusedWelcome = null;
        couponState.applyWelcome = false;
      }
      var wallet = window.DayOTicketWallet;
      var added = plan.tickets || 0;
      var result = wallet
        ? wallet.addTickets(added)
        : { ticketCount: added, added: added };
      renderPlans();
      if (applyCoupon) {
        showToast('🎉 9,900원 결제가 완료되었습니다! 체험 할인권이 사용되고 이용권 1장이 충전되었습니다.');
      } else {
        showToast('🎉 결제가 완료되었습니다! 이용권 ' + result.added + '장이 충전되었습니다.');
      }
    } finally {
      buying = false;
    }
  }

  function bindEvents() {
    el.overlay.addEventListener('click', function (e) {
      if (e.target === el.overlay || e.target.closest('[data-tk-close]')) close();
    });

    el.overlay.addEventListener('change', function (e) {
      var box = e.target.closest('[data-tk-coupon]');
      if (!box) return;
      couponState.applyWelcome = !!box.checked;
      renderPlans();
    });

    el.overlay.addEventListener('click', function (e) {
      var buy = e.target.closest('[data-tk-buy]');
      if (!buy) return;
      completePurchase(findPlan(buy.getAttribute('data-tk-buy')));
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.overlay.classList.contains('is-open')) close();
    });

    document.addEventListener('dayo:couponchange', function () {
      if (el.overlay && el.overlay.classList.contains('is-open')) loadCoupons();
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
    el.grid = overlay.querySelector('[data-tk-grid]');
    el.duebar = overlay.querySelector('[data-tk-duebar]');
    bindEvents();
    renderPlans();
  }

  function promptPurchase(message) {
    if (message) showToast(message);
    open();
  }

  function init() {
    mount();
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-tickets-open]');
      if (!trigger) return;
      e.preventDefault();
      e.stopPropagation();
      open();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var trigger = e.target.closest('[data-tickets-open]');
      if (!trigger || trigger.tagName === 'BUTTON' || trigger.tagName === 'A') return;
      e.preventDefault();
      open();
    });
    window.DayOTickets = {
      open: open,
      close: close,
      plans: PLANS,
      promptPurchase: promptPurchase
    };
    openFromQuery();
    loadCoupons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
