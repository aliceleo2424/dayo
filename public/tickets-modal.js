/* DayO 세션 이용권 구매 모달 — mypage / index 공용
 * 트리거: [data-tickets-open] 또는 ?tickets=open
 * 3단 위계: 신규 체험 배너 / 정규 패키지 3종 / 깔끔한 1회 티켓
 * 구매 시 amount·orderName·ticketCount 매핑
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
      payId: 'trial',
      tier: 'banner',
      badge: '☕ 신규 회원 전용',
      title: '첫 세션 9,900원 체험 할인권',
      orderName: '첫 세션 체험 할인권',
      price: '9,900원',
      priceValue: 9900,
      meta: '1회 30분 세션',
      copy: '외국인 울렁증 없이 가볍게 시작하는 1:1 첫 대화 (AI 매니저 + 5분 터치 퀴즈 포함)',
      tickets: 1,
      cta: '9,900원에 시작하기'
    },
    {
      id: 'pack3',
      payId: 'starter3',
      tier: 'pack',
      badge: '🌱 첫 대화 후 추천',
      title: '산뜻한 3회 패키지',
      orderName: 'DayO 산뜻한 3회 패키지',
      price: '54,900원',
      priceValue: 54900,
      meta: '3회 이용권',
      benefit: '회당 약 18,300원 / 정가 대비 약 8% 할인',
      copy: '부담 없는 5만 원대로 가볍게 이어가는 3주 대화 루틴',
      tickets: 3,
      cta: '구매하기'
    },
    {
      id: 'pack11',
      payId: 'light11',
      tier: 'pack',
      badge: '🔥 BEST! 1회 보너스',
      title: '가벼운 11 패키지',
      orderName: '가벼운 11 패키지',
      price: '179,000원',
      priceValue: 179000,
      meta: '10회 + 1회 무료 증정 (총 11회)',
      benefit: '회당 약 16,270원 / 정가 대비 18% 할인',
      copy: '1회 무료 증정! 가장 인기 있는 꾸준한 대화 루틴',
      tickets: 11,
      featured: true,
      cta: '구매하기'
    },
    {
      id: 'pack33',
      payId: 'full33',
      tier: 'pack',
      badge: '🎉 최대 24% 할인',
      title: '마음껏 33 패키지',
      orderName: '마음껏 33 패키지',
      price: '499,000원',
      priceValue: 499000,
      meta: '30회 + 3회 무료 증정 (총 33회)',
      benefit: '회당 약 15,120원 / 정가 대비 24% 할인',
      copy: '3회 무료 증정! 90일간 자유롭게 완성하는 실전 회화 감각',
      tickets: 33,
      cta: '구매하기'
    },
    {
      id: 'single',
      payId: 'single',
      tier: 'single',
      title: '깔끔한 1회 티켓',
      orderName: 'DayO 깔끔한 1회 티켓',
      price: '19,900원',
      priceValue: 19900,
      meta: '1회',
      copy: '약정 없이 필요할 때 딱 한 번만 만나고 싶다면? 깔끔한 1회 티켓 | 19,900원',
      tickets: 1,
      cta: '구매하기'
    }
  ];

  var CSS = [
    '.tk-overlay{position:fixed;inset:0;z-index:920;display:flex;align-items:center;justify-content:center;',
    'padding:1.1rem;background:rgba(92,74,66,.28);backdrop-filter:blur(10px);',
    'width:100%;max-width:100%;overflow-x:hidden;box-sizing:border-box;',
    'opacity:0;visibility:hidden;pointer-events:none;transition:opacity .28s ease,visibility .28s ease;}',
    '.tk-overlay.is-open{opacity:1;visibility:visible;pointer-events:auto;}',
    '.tk-modal{position:relative;width:100%;max-width:960px;max-height:min(92vh,92dvh);',
    'display:flex;flex-direction:column;overflow:hidden;',
    'border-radius:28px;border:1px solid rgba(255,209,220,.75);background:#FFFCFA;',
    'box-shadow:0 28px 64px rgba(113,83,72,.2);color:#5C4A42;font-family:inherit;',
    'transform:translateY(18px) scale(.97);transition:transform .36s cubic-bezier(.34,1.3,.64,1);}',
    '.tk-overlay.is-open .tk-modal{transform:translateY(0) scale(1);}',
    '.tk-close{position:absolute;top:.95rem;right:.95rem;z-index:2;width:36px;height:36px;',
    'border:none;border-radius:50%;background:rgba(255,255,255,.8);color:#FF6B57;',
    'font-size:1rem;cursor:pointer;line-height:1;}',
    '.tk-close:hover{background:#FF6B57;color:#fff;}',
    '.tk-head{padding:1.45rem 1.55rem 1.05rem;background:linear-gradient(135deg,#FFD1DC,#FFE5B4 55%,#FFF1D8);',
    'text-align:center;}',
    '.tk-eyebrow{font-size:.72rem;font-weight:800;letter-spacing:.06em;color:#FF6B57;text-transform:uppercase;}',
    '.tk-title{margin-top:.35rem;font-family:Quicksand,Gowun Dodum,sans-serif;font-size:clamp(1.25rem,3.2vw,1.55rem);',
    'font-weight:800;letter-spacing:-.03em;line-height:1.35;}',
    '.tk-sub{margin:.55rem auto 0;max-width:32rem;font-size:.88rem;line-height:1.6;color:#9A8580;font-weight:600;}',
    '.tk-body{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:1.15rem 1.25rem 1.35rem;}',
    '.tk-banner{display:flex;flex-wrap:wrap;align-items:center;gap:.85rem 1.15rem;margin:0 0 1rem;',
    'padding:1.05rem 1.15rem;border-radius:22px;text-align:left;',
    'border:1.5px solid rgba(255,107,87,.55);background:linear-gradient(120deg,#FFF4EE,#FFE0D6 42%,#FFF1E4);',
    'box-shadow:0 10px 26px rgba(255,107,87,.16);}',
    '.tk-banner__copy{flex:1 1 16rem;min-width:0;}',
    '.tk-banner .tk-badge{margin-bottom:.4rem;}',
    '.tk-banner .tk-card__title{margin:0;font-size:1.08rem;}',
    '.tk-banner .tk-card__price{margin:.2rem 0 0;font-size:1.55rem;}',
    '.tk-banner .tk-card__meta,.tk-banner .tk-card__copy{margin:.2rem 0 0;}',
    '.tk-banner .tk-card__cta{flex:0 0 auto;min-width:9.5rem;}',
    '.tk-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;}',
    '.tk-card{position:relative;display:flex;flex-direction:column;gap:.4rem;padding:1.05rem .95rem 1rem;',
    'border-radius:22px;border:1px solid rgba(255,209,220,.7);background:linear-gradient(180deg,#FFFCFA,#FFF8F5);',
    'box-shadow:0 8px 22px rgba(113,83,72,.06);text-align:left;}',
    '.tk-card--starter{border-color:rgba(122,184,140,.45);background:linear-gradient(165deg,#F7FBF6 0%,#EEF7F0 48%,#FFFDF8 100%);}',
    '.tk-card--best{border:2px solid rgba(255,107,87,.72);background:linear-gradient(165deg,#FFF6F2 0%,#FFE8E3 48%,#FFF9F4 100%);',
    'box-shadow:0 12px 28px rgba(255,107,87,.16),0 0 0 3px rgba(255,107,87,.08);transform:translateY(-2px);}',
    '.tk-card--deal{border-color:rgba(255,154,80,.5);background:linear-gradient(165deg,#FFF9F1 0%,#FFE9D2 48%,#FFF8F0 100%);',
    'box-shadow:0 12px 28px rgba(255,154,80,.12);}',
    '.tk-badge{display:inline-flex;align-self:flex-start;padding:.28rem .65rem;border-radius:999px;',
    'background:rgba(255,249,196,.85);border:1px solid rgba(255,209,220,.7);',
    'color:#5C4A42;font-size:.72rem;font-weight:800;line-height:1.2;}',
    '.tk-card--best .tk-badge,.tk-banner .tk-badge{background:linear-gradient(135deg,#FF7A68,#FF6B57);color:#fff;border-color:transparent;}',
    '.tk-card--starter .tk-badge{background:rgba(214,237,218,.95);border-color:rgba(122,184,140,.35);}',
    '.tk-card__title{font-family:Quicksand,Gowun Dodum,sans-serif;font-size:1.02rem;font-weight:800;letter-spacing:-.02em;}',
    '.tk-card__price{font-size:1.28rem;font-weight:800;color:#FF6B57;letter-spacing:-.03em;line-height:1.2;}',
    '.tk-card__meta{font-size:.78rem;font-weight:700;color:#9A8580;}',
    '.tk-card__benefit{font-size:.76rem;font-weight:800;color:#FF6B57;line-height:1.4;}',
    '.tk-card__copy{margin-top:.1rem;font-size:.78rem;font-weight:600;line-height:1.5;color:#5C4A42;}',
    '.tk-card__cta{margin-top:auto;padding-top:.6rem;}',
    '.tk-buy{width:100%;padding:.7rem .9rem;border:none;border-radius:999px;cursor:pointer;',
    'font-family:inherit;font-size:.86rem;font-weight:800;color:#fff;',
    'background:linear-gradient(135deg,#FF7A68,#FF6B57 55%,#FF8A4C);',
    'box-shadow:0 4px 0 #E55A45,0 8px 18px rgba(255,107,87,.22);',
    'transition:transform .15s ease,box-shadow .15s ease;}',
    '.tk-buy:hover{transform:translateY(-1px);box-shadow:0 5px 0 #E55A45,0 10px 20px rgba(255,107,87,.26);}',
    '.tk-buy:active{transform:translateY(2px);box-shadow:0 2px 0 #E55A45,0 4px 10px rgba(255,107,87,.18);}',
    '.tk-card--best .tk-buy{background:linear-gradient(135deg,#FF6B57,#FF8A4C);}',
    '.tk-buy--slim{width:auto;min-width:8.8rem;padding:.55rem 1.05rem;font-size:.82rem;',
    'box-shadow:0 3px 0 #E55A45,0 6px 14px rgba(255,107,87,.18);}',
    '.tk-single{margin-top:1rem;padding:.95rem 1.05rem;border-radius:20px;text-align:left;',
    'border:1px dashed rgba(154,133,128,.45);background:rgba(255,255,255,.72);}',
    '.tk-single__ask{margin:0 0 .55rem;font-size:.84rem;font-weight:700;line-height:1.5;color:#9A8580;}',
    '.tk-single__row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.65rem;}',
    '.tk-single__name{margin:0;font-size:.95rem;font-weight:800;color:#5C4A42;}',
    '.tk-policy{margin-top:1.1rem;padding:1rem 1.05rem;border-radius:20px;',
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
    '.tk-toast.is-long{white-space:pre-line;max-width:min(420px,calc(100% - 2rem));text-align:left;line-height:1.55;}',
    '.tk-buy:disabled,.tk-buy.is-disabled{cursor:not-allowed;background:#CBD5E1;color:#64748B;',
    'box-shadow:none;transform:none;opacity:.9;}',
    '.tk-buy:disabled:hover,.tk-buy.is-disabled:hover{transform:none;box-shadow:none;}',
    '.tk-consent{margin:1rem 0 .2rem;padding:.9rem 1rem;border:1px solid #EDE4D5;border-radius:14px;background:#FFFCFA;text-align:left;}',
    '.tk-consent label{display:flex;align-items:flex-start;gap:.5rem;margin:0;color:#5C4A42;font-size:.8rem;font-weight:700;line-height:1.45;cursor:pointer;}',
    '.tk-consent input{margin-top:.12rem;accent-color:#FF6B57;flex:0 0 auto;}',
    '.tk-consent a,.tk-consent [data-terms-mini],.tk-consent [data-refund-mini]{color:#E85B48;font-weight:800;text-decoration:underline;text-underline-offset:2px;}',
    '.tk-consent [data-terms-mini],.tk-consent [data-refund-mini]{border:none;background:none;padding:0;margin:0 0 0 .15rem;font:inherit;cursor:pointer;}',
    '.tk-used{margin-top:1rem;display:flex;flex-wrap:wrap;align-items:center;gap:.75rem 1rem;',
    'padding:1rem 1.05rem;border-radius:20px;text-align:left;opacity:.75;',
    'background:#F8FAFC;border:1px solid #E2E8F0;color:#94A3B8;}',
    '.tk-used .tk-badge{background:#E2E8F0;border-color:#CBD5E1;color:#64748B;}',
    '.tk-used .tk-card__title,.tk-used .tk-card__price,.tk-used .tk-card__meta,.tk-used .tk-card__copy{color:#94A3B8;}',
    '.tk-used .tk-card__price{font-size:1.15rem;}',
    '.tk-used .tk-card__cta{flex:1 1 100%;}',
    '[data-tk-banner]:empty,[data-tk-used]:empty{display:none;}',
    '.tk-notice{position:fixed;inset:0;z-index:960;display:flex;align-items:center;justify-content:center;',
    'padding:1.1rem;background:rgba(62,74,66,.45);backdrop-filter:blur(6px);',
    'opacity:0;visibility:hidden;pointer-events:none;transition:opacity .22s ease,visibility .22s ease;}',
    '.tk-notice.is-open{opacity:1;visibility:visible;pointer-events:auto;}',
    '.tk-notice__card{width:min(420px,100%);padding:1.45rem 1.35rem 1.25rem;border-radius:24px;text-align:center;',
    'background:#FFFCFA;border:1px solid rgba(255,209,220,.75);box-shadow:0 22px 48px rgba(113,83,72,.18);}',
    '.tk-notice__kicker{margin:0 0 .7rem;font-size:.72rem;font-weight:800;letter-spacing:.08em;color:#FF6B57;}',
    '.tk-notice__body{margin:0 0 1.1rem;font-size:.92rem;font-weight:700;line-height:1.7;color:#5C4A42;white-space:pre-line;}',
    '@media (max-width:860px){',
    '.tk-grid{grid-template-columns:1fr;}',
    '.tk-card--best{transform:none;}',
    '.tk-banner{flex-direction:column;align-items:stretch;}',
    '.tk-banner .tk-card__cta{width:100%;}',
    '.tk-head{padding:1.3rem 1.15rem .95rem;}',
    '.tk-body{padding:1rem .95rem 1.2rem;}',
    '.tk-single__row{flex-direction:column;align-items:stretch;}',
    '.tk-buy--slim{width:100%;}',
    '}'
  ].join('');

  var el = {};
  var lastFocused = null;
  var toastTimer = null;
  var buying = false;
  var couponState = {
    unusedWelcome: null,
    applyWelcome: true,
    trialUsed: false
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

  function paymentPayload(plan) {
    var applyCoupon = plan.id === 'single' && isCouponApplied();
    var amount = applyCoupon ? welcomeDue().due : Number(plan.priceValue);
    var orderName = applyCoupon ? '첫 세션 체험 할인권' : (plan.orderName || plan.title);
    return {
      planId: plan.id,
      amount: amount,
      orderName: orderName,
      ticketCount: Number(plan.tickets) || 1
    };
  }

  function buyButton(plan, opts) {
    var payload = paymentPayload(plan);
    var disabled = !!(opts && opts.disabled);
    var label = (opts && opts.cta) || plan.cta || '구매하기';
    return '' +
      '<button type="button" class="tk-buy' + (plan.tier === 'single' ? ' tk-buy--slim' : '') + (disabled ? ' is-disabled' : '') + '"' +
        (disabled ? ' disabled aria-disabled="true"' : '') +
        ' data-tk-buy="' + plan.id + '"' +
        ' data-amount="' + payload.amount + '"' +
        ' data-order-name="' + payload.orderName + '"' +
        ' data-ticket-count="' + payload.ticketCount + '">' +
        label +
      '</button>';
  }

  function planCard(plan) {
    if (!plan) return '';
    var badge = plan.badge ? '<span class="tk-badge">' + plan.badge + '</span>' : '';
    var benefit = plan.benefit ? '<p class="tk-card__benefit">' + plan.benefit + '</p>' : '';
    var cls = 'tk-card';
    if (plan.id === 'pack3') cls += ' tk-card--starter';
    if (plan.id === 'pack11') cls += ' tk-card--best';
    if (plan.id === 'pack33') cls += ' tk-card--deal';
    return '' +
      '<article class="' + cls + '" data-plan="' + plan.id + '">' +
        badge +
        '<h3 class="tk-card__title">' + plan.title + '</h3>' +
        '<p class="tk-card__price">' + plan.price + '</p>' +
        '<p class="tk-card__meta">' + plan.meta + '</p>' +
        benefit +
        '<p class="tk-card__copy">' + plan.copy + '</p>' +
        '<div class="tk-card__cta">' + buyButton(plan) + '</div>' +
      '</article>';
  }

  function bannerCard(plan) {
    if (!plan) return '';
    var badge = plan.badge ? '<span class="tk-badge">' + plan.badge + '</span>' : '';
    return '' +
      '<article class="tk-banner" data-plan="' + plan.id + '">' +
        '<div class="tk-banner__copy">' +
          badge +
          '<h3 class="tk-card__title">' + plan.title + '</h3>' +
          '<p class="tk-card__price">' + plan.price + '</p>' +
          '<p class="tk-card__meta">' + plan.meta + '</p>' +
          '<p class="tk-card__copy">' + plan.copy + '</p>' +
        '</div>' +
        '<div class="tk-card__cta">' + buyButton(plan) + '</div>' +
      '</article>';
  }

  function singleRow(plan) {
    if (!plan) return '';
    return '' +
      '<p class="tk-single__ask">' + plan.copy + '</p>' +
      '<div class="tk-single__row">' +
        '<p class="tk-single__name">' + plan.title + ' | ' + plan.price + '</p>' +
        buyButton(plan) +
      '</div>';
  }

  function usedTrialCard(plan) {
    if (!plan) return '';
    return '' +
      '<article class="tk-used" data-plan="trial-used">' +
        '<div class="tk-banner__copy">' +
          '<span class="tk-badge">🔒 1회 혜택 사용 완료</span>' +
          '<h3 class="tk-card__title">' + plan.title + '</h3>' +
          '<p class="tk-card__price">' + plan.price + '</p>' +
          '<p class="tk-card__meta">' + plan.meta + '</p>' +
        '</div>' +
        '<div class="tk-card__cta">' +
          buyButton(plan, { disabled: true, cta: '이미 1회 한정 특별 혜택을 이용하셨습니다 ☕' }) +
        '</div>' +
      '</article>';
  }

  function renderPlans() {
    var used = !!couponState.trialUsed;
    if (el.banner) {
      el.banner.hidden = used;
      el.banner.innerHTML = used ? '' : bannerCard(findPlan('trial'));
    }
    if (el.grid) {
      el.grid.innerHTML = [findPlan('pack3'), findPlan('pack11'), findPlan('pack33')].map(planCard).join('');
    }
    if (el.single) el.single.innerHTML = singleRow(findPlan('single'));
    if (el.used) {
      el.used.hidden = !used;
      el.used.innerHTML = used ? usedTrialCard(findPlan('trial')) : '';
    }
  }

  function buildMarkup() {
    return '' +
      '<div class="tk-modal" role="dialog" aria-modal="true" aria-labelledby="tkTitle">' +
        '<button type="button" class="tk-close" data-tk-close aria-label="닫기">✕</button>' +
        '<div class="tk-head">' +
          '<p class="tk-eyebrow">TICKETS</p>' +
          '<h2 class="tk-title" id="tkTitle">DayO 세션 이용권 ☕️</h2>' +
          '<p class="tk-sub">1회 30분 세션 (25분 대화 + 5분 퀴즈) · 약정 없이 필요할 만큼만</p>' +
        '</div>' +
        '<div class="tk-body">' +
          '<div data-tk-banner></div>' +
          '<div class="tk-grid" data-tk-grid></div>' +
          '<div class="tk-single" data-tk-single></div>' +
          '<div data-tk-used></div>' +
          '<div class="tk-consent">' +
            '<label for="tkRefundAgree">' +
              '<input type="checkbox" id="tkRefundAgree" name="tkRefundAgree">' +
              '<span>[필수] 취소 및 환불 규정을 확인하였으며 이에 동의합니다. ' +
                '<button type="button" data-refund-mini data-terms-check="#tkRefundAgree" onclick="event.preventDefault();event.stopPropagation();if(window.openRefundMiniModal){window.openRefundMiniModal(\'#tkRefundAgree\');}return false;">보기</button>' +
              '</span>' +
            '</label>' +
          '</div>' +
          '<aside class="tk-policy" aria-label="세션 규정 및 이용 안내">' +
            '<p class="tk-policy__title">세션 규정 및 이용 안내</p>' +
            '<ul class="tk-policy__list">' +
              '<li>📌 <strong>유효기간:</strong> 모든 이용권은 결제 후 90일 내 소진 필수, 이후 사라지니 꼭 90일 안에 사용해주세요. (메일/카카오톡으로 소진 알림을 보내드려요!)</li>' +
              '<li>🔄 <strong>변경/취소:</strong> 세션 요일 및 시간 변경/취소는 세션 시작 1시간 전까지 가능해요.</li>' +
              '<li>💌 <strong>노쇼:</strong> 세션 시작 1시간 이내 취소 및 노쇼 발생 시 티켓이 차감되며 \'토닥토닥 리포트\'가 발송됩니다.</li>' +
            '</ul>' +
          '</aside>' +
        '</div>' +
      '</div>';
  }

  function showToast(message, opts) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.toggle('is-long', !!(opts && opts.long) || /[\n\r]/.test(String(message || '')));
    el.toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.classList.remove('is-on');
    }, (opts && opts.ms) || 4200);
  }

  function hideNotice() {
    if (!el.notice) return;
    el.notice.classList.remove('is-open');
    el.notice.hidden = true;
  }

  function showNotice(message) {
    if (!el.notice || !el.noticeBody) {
      showToast(message, { long: true, ms: 7000 });
      return;
    }
    el.noticeBody.textContent = message;
    el.notice.hidden = false;
    el.notice.classList.add('is-open');
  }

  function truthyFlag(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  function isWelcomeCouponRow(row) {
    var code = String((row && row.code) || '').toUpperCase().replace(/[\s_-]/g, '');
    var title = String((row && (row.title || row.product_name)) || '');
    return code === 'WELCOME9900' || /체험/.test(title);
  }

  function isTrialOrderRow(row) {
    var name = String((row && (row.product_name || row.name || row.title)) || '');
    var amount = Number(row && row.amount);
    return amount === 9900 || /체험/.test(name) || /trial/i.test(name);
  }

  function getAuthUserId() {
    var store = window.DayOProfileStore;
    if (store && typeof store.getUserId === 'function') {
      try { return store.getUserId(); } catch (e) { /* ignore */ }
    }
    var sessionUser = window._dayoAuthProfile && (window._dayoAuthProfile.user_id || window._dayoAuthProfile.id);
    return sessionUser || null;
  }

  function getSupabase() {
    if (window.supabaseClient && window.supabaseClient.auth) return window.supabaseClient;
    if (window.DayOProfileStore && typeof window.DayOProfileStore.getClient === 'function') {
      return window.DayOProfileStore.getClient();
    }
    return null;
  }

  async function detectTrialUsed(couponRows) {
    var rows = couponRows || [];
    var unusedWelcome = window.DayOProfileStore && typeof window.DayOProfileStore.getUnusedWelcomeCoupon === 'function'
      ? window.DayOProfileStore.getUnusedWelcomeCoupon(rows)
      : null;
    var usedWelcomeCoupon = rows.some(function (row) {
      return isWelcomeCouponRow(row) && row.is_used === true;
    });

    var profile = window._dayoAuthProfile || null;
    if (window.DayOProfileStore && typeof window.DayOProfileStore.getCachedProfile === 'function') {
      profile = window.DayOProfileStore.getCachedProfile() || profile;
    }
    var flagged = !!(profile && (
      truthyFlag(profile.has_used_welcome_ticket) ||
      truthyFlag(profile.has_used_trial)
    ));

    var trialOrder = false;
    var anyPaidOrder = false;
    var anyBooking = false;
    var client = getSupabase();
    var userId = getAuthUserId();
    if (client && userId) {
      try {
        var profileRes = await client
          .from('profiles')
          .select('has_used_welcome_ticket')
          .eq('user_id', userId)
          .maybeSingle();
        if (profileRes.error) {
          profileRes = await client
            .from('profiles')
            .select('has_used_welcome_ticket')
            .eq('id', userId)
            .maybeSingle();
        }
        if (profileRes && profileRes.data && truthyFlag(profileRes.data.has_used_welcome_ticket)) {
          flagged = true;
        }
      } catch (e) { /* column may not exist yet */ }

      try {
        var orderRes = await client.from('orders').select('product_name, amount, status').eq('user_id', userId);
        var orders = (orderRes && orderRes.data) || [];
        anyPaidOrder = orders.some(function (row) {
          var status = String(row.status || 'paid').toLowerCase();
          return status === 'paid' || status === 'complete' || status === 'completed';
        });
        trialOrder = orders.some(isTrialOrderRow);
      } catch (e) { /* orders table may be missing */ }

      try {
        var bookingRes = await client.from('bookings').select('id, status').eq('learner_id', userId).limit(20);
        if (bookingRes.error) {
          bookingRes = await client.from('bookings').select('id, status').eq('user_id', userId).limit(20);
        }
        var bookings = (bookingRes && bookingRes.data) || [];
        anyBooking = bookings.length > 0;
      } catch (e) { /* ignore */ }
    }

    if (flagged || usedWelcomeCoupon || trialOrder) return true;
    if (unusedWelcome) return false;
    if (anyPaidOrder || anyBooking) return true;
    return false;
  }

  function findPlan(id) {
    for (var i = 0; i < PLANS.length; i++) {
      if (PLANS[i].id === id || PLANS[i].payId === id) return PLANS[i];
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
    try {
      couponState.trialUsed = await detectTrialUsed(rows);
    } catch (err) {
      couponState.trialUsed = rows.some(function (row) {
        return isWelcomeCouponRow(row) && row.is_used === true;
      });
    }
    renderPlans();
    return couponState.unusedWelcome;
  }

  function open() {
    if (el.overlay.classList.contains('is-open')) return;
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

  async function requestPayment(payload) {
    if (window.DayOPay && typeof window.DayOPay.request === 'function') {
      return window.DayOPay.request(payload);
    }
    if (window.TossPayments && window.__DAYO_TOSS_CLIENT_KEY__) {
      var toss = window.TossPayments(window.__DAYO_TOSS_CLIENT_KEY__);
      return toss.requestPayment('카드', {
        amount: payload.amount,
        orderName: payload.orderName,
        orderId: 'dayo-' + payload.planId + '-' + Date.now(),
        successUrl: window.location.origin + '/mypage.html?pay=success&tickets=' + payload.ticketCount,
        failUrl: window.location.origin + '/mypage.html?pay=fail'
      });
    }
    return { skipped: true, payload: payload };
  }

  function hasRefundConsent() {
    var box = document.getElementById('tkRefundAgree');
    return !!(box && box.checked);
  }

  function ensureRefundConsent() {
    if (hasRefundConsent()) return true;
    showToast('취소 및 환불 규정에 동의해 주세요.');
    var box = document.getElementById('tkRefundAgree');
    if (box && box.focus) {
      try { box.focus(); } catch (e) { /* ignore */ }
    }
    return false;
  }

  async function completePurchase(plan) {
    if (buying || !plan) return;
    if (plan.id === 'trial' && couponState.trialUsed) return;
    if (!ensureRefundConsent()) return;
    var payId = plan.payId || plan.id;
    if (typeof window.requestPay === 'function') {
      return window.requestPay(payId);
    }
    buying = true;
    var payload = paymentPayload(plan);
    window.DayOTickets = window.DayOTickets || {};
    window.DayOTickets.lastPayment = payload;
    var applyWelcome = plan.id === 'trial' && couponState.unusedWelcome;
    try {
      var paid = await requestPayment(payload);
      if (paid && paid.cancelled) return;
      if (!(paid && paid.skipped)) return;
      if (applyWelcome && window.DayOProfileStore && typeof window.DayOProfileStore.markCouponUsed === 'function') {
        await window.DayOProfileStore.markCouponUsed(couponState.unusedWelcome);
        couponState.unusedWelcome = null;
        couponState.applyWelcome = false;
      }
      var wallet = window.DayOTicketWallet;
      var added = payload.ticketCount || 0;
      var result = wallet
        ? wallet.addTickets(added)
        : { ticketCount: added, added: added };
      renderPlans();
      if (plan.id === 'trial') {
        showToast('🎉 9,900원 결제가 완료되었습니다! 체험 할인권으로 이용권 1장이 충전되었습니다.');
      } else {
        showToast('🎉 결제가 완료되었습니다! 이용권 ' + result.added + '장이 충전되었습니다.');
      }
    } finally {
      buying = false;
    }
  }

  function bindEvents() {
    el.overlay.addEventListener('click', function (e) {
      if (e.target.closest('[data-tk-notice-close]')) {
        hideNotice();
        return;
      }
      if (e.target === el.overlay || e.target.closest('[data-tk-close]')) close();
    });

    el.overlay.addEventListener('change', function (e) {
      var box = e.target.closest('[data-tk-coupon]');
      if (!box) return;
      couponState.applyWelcome = !!box.checked;
      renderPlans();
    });

    el.overlay.addEventListener('click', function (e) {
      var refundView = e.target.closest('[data-refund-mini], [data-open-refund-mini]');
      if (refundView) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.openRefundMiniModal === 'function') {
          window.openRefundMiniModal('#tkRefundAgree');
        } else if (window.DayOTermsMini && typeof window.DayOTermsMini.openRefund === 'function') {
          window.DayOTermsMini.openRefund('#tkRefundAgree');
        }
        return;
      }
      var legacyRefund = e.target.closest('a[href="/refund"], a[href="/refund.html"], a[href*="/refund"]');
      if (legacyRefund && legacyRefund.closest('.tk-consent, .tk-modal')) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.openRefundMiniModal === 'function') window.openRefundMiniModal('#tkRefundAgree');
        return;
      }
      var buy = e.target.closest('[data-tk-buy]');
      if (!buy || buy.disabled || buy.classList.contains('is-disabled')) return;
      e.preventDefault();
      completePurchase(findPlan(buy.getAttribute('data-tk-buy')));
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (el.notice && el.notice.classList.contains('is-open')) {
        hideNotice();
        return;
      }
      if (el.overlay.classList.contains('is-open')) close();
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
    overlay.id = 'ticketModal';
    overlay.setAttribute('data-tk-overlay', '1');
    overlay.innerHTML = buildMarkup();
    document.body.appendChild(overlay);

    var toast = document.createElement('div');
    toast.className = 'tk-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);

    el.overlay = overlay;
    el.toast = toast;
    el.banner = overlay.querySelector('[data-tk-banner]');
    el.grid = overlay.querySelector('[data-tk-grid]');
    el.single = overlay.querySelector('[data-tk-single]');
    el.used = overlay.querySelector('[data-tk-used]');

    var notice = document.createElement('div');
    notice.className = 'tk-notice';
    notice.setAttribute('data-tk-notice', '1');
    notice.hidden = true;
    notice.innerHTML =
      '<div class="tk-notice__card" role="dialog" aria-modal="true" aria-labelledby="tkNoticeBody">' +
        '<p class="tk-notice__kicker">PRE-OPEN</p>' +
        '<p class="tk-notice__body" id="tkNoticeBody" data-tk-notice-body></p>' +
        '<button type="button" class="tk-buy" data-tk-notice-close>확인</button>' +
      '</div>';
    document.body.appendChild(notice);
    el.notice = notice;
    el.noticeBody = notice.querySelector('[data-tk-notice-body]');
    notice.addEventListener('click', function (e) {
      if (e.target === notice || e.target.closest('[data-tk-notice-close]')) hideNotice();
    });

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
      paymentPayload: paymentPayload,
      promptPurchase: promptPurchase,
      showNotice: showNotice,
      toast: showToast,
      ensureRefundConsent: ensureRefundConsent,
      hasRefundConsent: hasRefundConsent,
      isTrialUsed: function () { return !!couponState.trialUsed; }
    };
    window.openTicketModal = open;
    window.closeTicketModal = close;
    window.openPaymentModal = function () {
      open();
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
