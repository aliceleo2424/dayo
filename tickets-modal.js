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
    // REMOVE BEFORE PUBLIC LAUNCH: rendered only after the real admin payment-test gate succeeds.
    {
      id: 'admin_test_1000',
      payId: 'admin_test_1000',
      tier: 'single',
      title: '결제 테스트 1,000원',
      orderName: '결제 테스트 1,000원',
      price: '1,000원',
      priceValue: 1000,
      meta: '관리자 전용 · 이용권 1장',
      copy: 'PortOne 전체 결제 흐름을 확인하는 정식 오픈 전 임시 상품입니다.',
      tickets: 1,
      cta: '1,000원 테스트 결제'
    },
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
    '.tk-admin-test{margin-top:.85rem;padding-top:.85rem;border-top:1px dashed rgba(255,107,87,.35);}',
    '.tk-admin-test .tk-badge{margin-bottom:.45rem;background:#5C4A42;color:#fff;border-color:transparent;}',
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
    '}',
    '.tk-modal{border-radius:20px;border-color:#E7DDD0;background:#FFFBF4;box-shadow:0 18px 48px rgba(64,54,47,.16);color:#40362F;}',
    '.tk-close{width:44px;height:44px;background:#FFFBF4;color:#506B55;border:1px solid #DDE8D9;}',
    '.tk-close:hover,.tk-close:focus-visible{background:#DDE8D9;color:#40362F;}',
    '.tk-head{background:linear-gradient(135deg,#FFF2C9,#F8F0E3);}',
    '.tk-title,.tk-card__title{font-family:inherit;color:#40362F;}',
    '.tk-eyebrow,.tk-card__benefit{color:#B85D37;}',
    '.tk-sub,.tk-card__meta,.tk-single__ask{color:#6B625B;}',
    '.tk-banner{border:1px solid #DDE8D9;border-radius:18px;background:#F1F5EE;box-shadow:0 2px 10px rgba(64,54,47,.05);}',
    '.tk-card,.tk-card--starter,.tk-card--deal{border:1px solid #E7DDD0;border-radius:18px;background:#FFFBF4;box-shadow:0 2px 10px rgba(64,54,47,.05);}',
    '.tk-card--best{border:1px solid #5F7D63;border-radius:18px;background:#F1F5EE;box-shadow:0 2px 10px rgba(64,54,47,.07);}',
    '.tk-card__price{color:#40362F;}',
    '.tk-card--best .tk-badge,.tk-banner .tk-badge{background:#FFF2C9;color:#40362F;border:1px solid #E7DDD0;}',
    '.tk-buy,.tk-card--best .tk-buy,.tk-buy--slim{min-height:44px;border-radius:15px;background:#5F7D63;color:#fff;box-shadow:0 2px 8px rgba(64,54,47,.1);}',
    '.tk-buy:hover,.tk-buy:focus-visible,.tk-card--best .tk-buy:hover{background:#506B55;transform:none;box-shadow:0 3px 10px rgba(64,54,47,.12);}',
    '.tk-buy:active{background:#506B55;transform:none;box-shadow:0 1px 5px rgba(64,54,47,.1);}',
    '.tk-buy:disabled,.tk-buy.is-disabled{background:#CBD5E1;color:#64748B;box-shadow:none;transform:none;}',
    '.tk-single,.tk-policy,.tk-consent,.tk-notice__card{border:1px solid #E7DDD0;border-radius:16px;background:#FFFBF4;box-shadow:none;}',
    '.tk-policy__list strong,.tk-consent a,.tk-consent [data-terms-mini],.tk-consent [data-refund-mini]{color:#506B55;}',
    '.tk-consent input{accent-color:#5F7D63;}',
    '.tk-notice__kicker{color:#506B55;}',
    '.tk-price-unit{margin:.25rem 0 0;color:#5F7D63;line-height:1.5;}',
    '.tk-price-compare{margin:.2rem 0 0;font-size:.76rem;line-height:1.5;color:#506B55;}',
    '@media (max-width:860px){.tk-banner__copy{flex:0 1 auto;}}',
    "\n.tk-eligibility{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:12px;font-size:12px;line-height:1.6;color:#64776B}.tk-eligibility button{font:inherit;border:1px solid #5F7D63;border-radius:8px;background:white;color:#435F4C;padding:6px 10px;cursor:pointer}\n.tk-modal{max-width:900px;background:#FFFBF4;color:#263F35;border-color:#DDE5D9;box-shadow:0 18px 48px rgba(38,63,53,.12)}\n.tk-head{padding:20px 24px 12px;text-align:left;background:none}.tk-eyebrow{color:#5F7D63}.tk-title{white-space:pre-line;font-size:24px;line-height:1.3;color:#263F35;max-width:650px}.tk-sub{margin:8px 0 0;max-width:650px;white-space:pre-line;font-weight:400;color:#64776B}.tk-perks{display:flex;flex-wrap:wrap;gap:12px;font-size:13px;color:#435F4C;margin:10px 0 0;padding:0;list-style:none}.tk-perks li:before{content:'✓';display:inline-block;background:#EEF3EA;border-radius:50%;padding:2px 5px;margin-right:5px}\n.tk-body{padding:8px 24px 18px}.tk-section-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:0 0 12px;font-size:16px}.tk-section-heading small{font-size:12px;font-weight:400;color:#64776B}\n.tk-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.tk-grid .tk-choice{flex-direction:column}.tk-grid .tk-choice__content{flex:initial}.tk-choice{position:relative;display:flex;min-width:0;cursor:pointer;padding:14px;border:1px solid #DDE5D9;border-radius:17px;background:white;gap:12px;align-items:stretch;text-align:left;box-sizing:border-box}.tk-choice__content{min-width:0;flex:1}.tk-choice__top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.tk-choice .tk-card__title{margin:0;color:#263F35;font-size:17px}.tk-choice .tk-card__copy{text-wrap:balance;margin:5px 0 0;font-weight:400;color:#64776B}.tk-choice input{flex:0 0 auto;width:18px;height:18px;margin:0;accent-color:#5F7D63;position:absolute;right:18px;top:20px}.tk-choice:has(input:focus-visible){outline:3px solid #5F7D63;outline-offset:3px}.tk-choice.is-selected{border:2px solid #5F7D63;padding:13px;background:#F4F6E9}.tk-choice.is-selected input{right:17px;top:19px}\n.tk-choice__price{margin:14px 0 0}.tk-total-label{font-size:12px;color:#64776B;margin:0 0 5px}.tk-choice .tk-card__price{font-size:26px;color:#263F35;margin:0;line-height:1.2;white-space:nowrap}.tk-price-unit{font-size:12px;font-weight:400;color:#64776B;margin:7px 0 0;line-height:1.6}.tk-price-compare{font-size:12px;font-weight:700;color:#5F7D63;margin:14px 0 0;line-height:1.5}.tk-choice .tk-badge{background:#EEF3EA;color:#5F7D63;border:0;border-radius:5px;font-size:11px;padding:3px 6px}.tk-choice__top{padding-right:20px}\n.tk-choice--trial{margin-bottom:12px;align-items:center;background:#F8F8ED}.tk-choice--trial .tk-choice__price{margin:0 40px 0 0;text-align:right}.tk-trial-kicker{font-size:12px;color:#5F7D63;font-weight:700;margin:0 0 10px}.tk-choice--33{margin-top:12px;align-items:center;background:#F8FAF5}.tk-choice--33 .tk-choice__price{margin:0 40px 0 0;text-align:right}.tk-choice--33 .tk-price-compare{margin-top:8px}.tk-price-footnote{font-size:12px;line-height:1.7;color:#64776B;margin:12px 0 0}\n.tk-experience{margin:16px 0;padding-top:14px;border-top:1px solid #DDE5D9}.tk-experience h3{font-size:17px;margin:0 0 18px}.tk-experience__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}.tk-experience__item{display:flex;gap:14px}.tk-experience__item em{color:#5F7D63;font-family:Georgia,serif}.tk-experience strong{font-size:14px}.tk-experience p{font-size:13px;line-height:1.7;color:#64776B;margin:5px 0 0}\n.tk-comparison{border:1px solid #DDE5D9;border-radius:16px;background:white;margin:20px 0}.tk-comparison>summary{cursor:pointer;padding:20px;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px}.tk-comparison>summary:after{content:'+';font-size:22px}.tk-comparison[open]>summary:after{content:'−'}.tk-comparison summary small{display:block;font-size:12px;color:#64776B;margin-top:6px;line-height:1.6}.tk-comparison__body{border-top:1px solid #DDE5D9;padding:20px}.tk-comparison__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tk-comparison__card{padding:18px;background:#F8FAF5;border:1px solid #E0E7DB;border-radius:14px;min-width:0}.tk-comparison__card:first-child{background:#EEF3EA;border-color:#C2D2BE}.tk-comparison__card h4{margin:0 0 6px}.tk-comparison__card dl{font-size:13px;line-height:1.7;margin:12px 0 0}.tk-comparison__card dt{font-weight:700;margin:10px 0 3px}.tk-comparison__card dd{margin:0;color:#52685A;white-space:pre-line}.tk-comparison__card p{font-size:12px;color:#64776B;margin:0}.tk-comparison a{color:#506B55;text-underline-offset:3px;overflow-wrap:anywhere}.tk-sources{font-size:12px;line-height:1.7;margin-top:12px}.tk-sources li{margin:8px 0}.tk-comparison__note{font-size:12px;color:#64776B;line-height:1.7;margin:0 0 14px}\n.tk-footer{flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;gap:20px;padding:12px 24px calc(12px + env(safe-area-inset-bottom));border-top:1px solid #CDD9C8;background:#FFFBF4}.tk-footer__price{font-size:24px;font-weight:800;margin:4px 0}.tk-footer small{font-size:12px;color:#64776B;line-height:1.6}.tk-footer__action{min-width:220px;max-width:50%}.tk-footer .tk-buy{white-space:normal;padding:13px 18px}.tk-footer__policy{display:block;margin-top:8px;border:0;background:none;color:#64776B;text-decoration:underline;font:inherit;font-size:12px;cursor:pointer;text-align:right;width:100%}.tk-policy{background:white;border-color:#DDE5D9;margin:18px 0 0}.tk-policy summary{cursor:pointer;font-weight:700}.tk-policy__list{margin-top:16px}.tk-used{margin-top:12px}.tk-used .tk-card__cta{display:none}.tk-single:empty{display:none}.tk-single{border:0;background:none;padding:0}.tk-admin-test{margin:18px 0}.tk-close{z-index:3}\n.tk-modal [hidden]{display:none!important}.tk-modal button:focus-visible,.tk-modal summary:focus-visible,.tk-modal a:focus-visible{outline:3px solid #5F7D63;outline-offset:3px}\n.tk-footer{box-sizing:border-box}.tk-footer>div:first-child{min-width:0;flex:1}.tk-footer__action{flex:0 1 48%;min-width:0}.tk-footer small{overflow-wrap:anywhere}.tk-footer .tk-buy{box-sizing:border-box;max-width:100%;min-width:0;overflow-wrap:anywhere}.tk-experience>summary{cursor:pointer;font-size:14px;font-weight:700;line-height:1.6}.tk-experience__grid{margin-top:12px}\n@media(max-width:680px){.tk-overlay{padding:8px}.tk-modal{max-height:96dvh;border-radius:22px}.tk-head{padding:16px 14px 10px}.tk-title{font-size:22px;padding-right:26px}.tk-sub{font-size:13px;line-height:1.8;margin-top:14px}.tk-perks{gap:6px;font-size:11px;margin-top:14px}.tk-body{padding:6px 14px 16px}.tk-grid{grid-template-columns:1fr;gap:8px}.tk-grid .tk-choice{flex-direction:row}.tk-section-heading{font-size:14px;gap:8px}.tk-section-heading small{font-size:11px;max-width:110px;text-align:right}.tk-choice{padding:12px;align-items:center;gap:10px}.tk-choice.is-selected{padding:11px}.tk-choice__top{padding-right:0}.tk-choice .tk-card__title{font-size:15px}.tk-choice .tk-card__copy{font-size:12px;line-height:1.6}.tk-choice input{top:50%;right:13px;transform:translateY(-50%)}.tk-choice.is-selected input{top:50%;right:12px}.tk-choice__price,.tk-choice--trial .tk-choice__price,.tk-choice--33 .tk-choice__price{margin:0 25px 0 0;text-align:right;flex:0 0 auto;max-width:53%}.tk-choice .tk-card__price{font-size:24px}.tk-choice .tk-price-unit{font-size:11px}.tk-choice .tk-price-compare{font-size:11px;margin-top:8px}.tk-total-label{font-size:11px}.tk-trial-kicker{font-size:11px;margin-bottom:7px}.tk-choice--33{margin-top:8px}.tk-price-footnote{font-size:11px}.tk-experience{margin-top:22px}.tk-experience__grid{grid-template-columns:1fr;gap:18px}.tk-experience h3{font-size:16px}.tk-comparison>summary,.tk-comparison__body{padding:16px}.tk-comparison__grid{grid-template-columns:1fr}.tk-footer{padding:12px 16px calc(12px + env(safe-area-inset-bottom));gap:12px}.tk-footer__action{min-width:0;width:52%;max-width:52%}.tk-footer__price{font-size:23px}.tk-footer small{font-size:11px}.tk-footer .tk-buy{font-size:12px;padding:12px 10px}.tk-footer__policy{font-size:10px}.tk-experience__item{gap:14px}.tk-close{width:36px;height:36px;top:10px;right:10px}}\n"
    ,'#pricing .ticket-price-card--trial{grid-column:1/-1}#pricing .ticket-price-card:disabled{background:#F1F2EF;border-color:#D4D7D0;color:#6B706B;cursor:not-allowed;box-shadow:none}#pricing .ticket-price-card:disabled:hover{transform:none}#pricing .ticket-landing-total{display:block;color:#263F35;font-size:1.25rem;font-weight:700;margin-top:8px}#pricing .tk-price-unit,#pricing .tk-price-compare{font-size:12px;line-height:1.6;margin:8px 0 0}#pricing .ticket-price-card:focus-visible{outline:3px solid #5F7D63;outline-offset:3px}#pricing [data-landing-trial-retry]{margin:0 0 16px;padding:8px 14px;border:1px solid #5F7D63;background:#FFFBF4;color:#435F4C;border-radius:8px;font:inherit;cursor:pointer}#pricing [hidden]{display:none!important}'
    ,'.tk-choice--disabled{background:#F1F2EF;border-color:#D4D7D0;cursor:not-allowed}.tk-choice--disabled .tk-card__title,.tk-choice--disabled .tk-card__price,.tk-choice--disabled .tk-trial-kicker{color:#6B706B}.tk-trial-unavailable{margin:8px 0 0;color:#626862;font-size:12px;line-height:1.6}'
  ].join('');

  function priceText(n) {
    var value = Number(n).toLocaleString('ko-KR');
    return window.DayOI18n && window.DayOI18n.getLang() === 'EN' ? '₩' + value : value + '원';
  }
  function priceDetails(plan, savingKey) {
    if (!plan || plan.id === 'admin_test_1000' || plan.id === 'trial') return '';
    var amount = Number(plan.priceValue), count = Number(plan.tickets);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(count) || count <= 0) return '';
    var exactUnit = amount / count;
    var copy = t(exactUnit === Math.round(exactUnit) ? 'tickets.price.unit' : 'tickets.price.unitApprox', { price: priceText(Math.round(exactUnit)) });
    var single = findPlan('single'), saving = single ? Number(single.priceValue) * count - amount : 0;
    return '<p class="tk-price-unit">' + (count > 1 ? t('tickets.v2.totalCount', { count: count }) + ' · ' : '') + copy + '</p>' +
      (saving > 0 ? '<p class="tk-price-compare">' + t(savingKey || 'tickets.v2.saving', { count: count, saving: priceText(saving) }) + '</p>' : '');
  }
  function pricePlanText(plan, field) {
    if (plan.id === 'admin_test_1000') return plan[field] || '';
    return t('tickets.v2.' + plan.id + '.' + field);
  }

  var el = {};
  var lastFocused = null;
  var toastTimer = null;
  var buying = false;
  var selectedPlanId = null;
  var trialState = { status: 'loading', userId: null };
  var trialReadVersion = 0;
  var trialReadPromise = null;
  var trialReadController = null;
  var trialAuthBound = false;
  var trialAuthTimer = null;
  var adminPaymentTestVisible = false;
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
    var amount = Number(plan.priceValue);
    var orderName = plan.orderName || plan.title;
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
    if (!(opts && opts.cta) && window.DayOI18n && window.DayOI18n.getLang() === 'EN' && plan.id !== 'admin_test_1000') {
      label = plan.id === 'trial'
        ? t('tickets.modal.trialCta', { price: '₩' + Number(plan.priceValue).toLocaleString('ko-KR') })
        : t('tickets.modal.buyCta');
    }
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

  function planCard(plan, disabled) {
    if (!plan) return '';
    disabled = disabled === true;
    var badge = plan.id === 'pack11' ? '<span class="tk-badge">10+1</span>' : plan.id === 'trial' && disabled && trialCompletionBadge() ? '<span class="tk-badge">' + trialCompletionBadge() + '</span>' : '';
    var cls = 'tk-choice' + (plan.id === 'trial' ? ' tk-choice--trial' : plan.id === 'pack33' ? ' tk-choice--33' : '');
    if (disabled) cls += ' tk-choice--disabled';
    return '<label class="' + cls + '" data-plan="' + plan.id + '"' + (disabled ? ' aria-disabled="true"' : '') + '>' +
      '<input type="radio" name="tkPlan" value="' + plan.id + '"' + (disabled ? ' disabled aria-disabled="true" aria-describedby="tkTrialUnavailable"' : '') + ' aria-label="' + pricePlanText(plan, 'title') + ', ' + priceText(plan.priceValue) + '">' +
      '<div class="tk-choice__content">' + (plan.id === 'trial' ? '<p class="tk-trial-kicker">' + t('tickets.v2.trial.badge') + '</p>' : '') +
      '<div class="tk-choice__top"><h3 class="tk-card__title">' + pricePlanText(plan, 'title') + '</h3>' + badge + '</div>' +
      '<p class="tk-card__copy">' + pricePlanText(plan, 'copy') + '</p>' + (disabled ? '<p class="tk-trial-unavailable" id="tkTrialUnavailable">' + trialUnavailableCopy() + '</p>' : '') + '</div>' +
      '<div class="tk-choice__price"><p class="tk-total-label">' + t('tickets.v2.total') + '</p><p class="tk-card__price">' + priceText(plan.priceValue) + '</p>' + priceDetails(plan) + '</div></label>';
  }

  function singleRow(plan) {
    return '<div class="tk-single__row"><p>' + plan.title + ' | ' + priceText(plan.priceValue) + '</p>' + buyButton(plan) + '</div>';
  }

  function canShowTrialPurchase() {
    return trialState.status === 'eligible';
  }

  function trialUnavailableCopy() {
    return t(trialState.trialStatus === 'trial_paid' || trialState.trialStatus === 'trial_completed' ? 'tickets.v2.trial.appliedNotice' : 'tickets.v2.eligibility.unavailable');
  }

  function trialCompletionBadge() {
    if (trialState.trialStatus === 'trial_completed') return t('tickets.v2.trial.completed');
    if (trialState.trialStatus === 'trial_paid') return t('tickets.v2.trial.applied');
    return '';
  }

  function trialStatusMarkup() {
    if (trialState.status === 'loading') return t('tickets.v2.eligibility.loading');
    if (trialState.status === 'loggedout') return t('tickets.v2.eligibility.loggedout');
    if (trialState.status === 'error') return '<span>' + t('tickets.v2.eligibility.error') + '</span> <button type="button" data-tk-eligibility-retry>' + t('tickets.v2.eligibility.retry') + '</button>';
    return '';
  }

  function setTrialMarkupIfChanged(node, markup) {
    // Compare browser-normalized HTML: bare data attributes/entities serialize differently.
    var expected = document.createElement('template');
    expected.innerHTML = markup;
    if (node.innerHTML !== expected.innerHTML) node.innerHTML = expected.innerHTML;
  }

  function renderLandingTicketCards() {
    document.querySelectorAll('#pricing [data-landing-ticket]').forEach(function (node) {
      var plan = findPlan(node.getAttribute('data-landing-ticket'));
      if (!plan) return;
      var isTrial = plan.id === 'trial';
      var disabled = isTrial && trialState.status !== 'eligible' && trialState.status !== 'loggedout';
      if (node.hidden) node.hidden = false;
      if (node.style.display) node.style.display = '';
      if (node.disabled !== disabled) node.disabled = disabled;
      if (node.getAttribute('aria-disabled') !== String(disabled)) node.setAttribute('aria-disabled', String(disabled));
      var note = !isTrial ? pricePlanText(plan, 'copy') : trialState.status === 'ineligible' ? trialUnavailableCopy() : trialState.status === 'eligible' ? t('landing.pricing.trialBenefit') : trialState.status === 'loggedout' ? t('landing.pricing.trialSignup') : trialState.status === 'error' ? t('tickets.v2.eligibility.error') : t('tickets.v2.eligibility.loading');
      setTrialMarkupIfChanged(node, '<strong>' + pricePlanText(plan, 'title') + '</strong>' + (isTrial && trialCompletionBadge() ? '<small>' + trialCompletionBadge() + '</small>' : '') + '<span class="ticket-landing-total">' + priceText(plan.priceValue) + '</span><small>' + note + '</small>' + priceDetails(plan, 'tickets.v2.landingSaving'));
    });
    var retry = document.querySelector('#pricing [data-landing-trial-retry]');
    if (retry && retry.hidden !== (trialState.status !== 'error')) retry.hidden = trialState.status !== 'error';
  }

  function renderTrialSalesSurfaces() {
    var visible = canShowTrialPurchase();
    var trial = findPlan('trial');
    renderLandingTicketCards();
    document.querySelectorAll('[data-coupon-wallet]').forEach(function (wallet) {
      var eligibility = visible ? 'true' : 'false';
      if (wallet.getAttribute('data-trial-eligible') !== eligibility) wallet.setAttribute('data-trial-eligible', eligibility);
      var proposals = wallet.querySelectorAll('[data-coupon-code="WELCOME_9900"], [data-coupon-code="WELCOME9900"]');
      if (!visible) {
        proposals.forEach(function (node) { node.remove(); });
        if (!wallet.children.length && !wallet.hidden) wallet.hidden = true;
        return;
      }
      var proposal = proposals[0];
      if (!proposal) {
        proposal = document.createElement('article');
        proposal.className = 'coupon-item';
        proposal.setAttribute('data-coupon-code', 'WELCOME_9900');
        wallet.appendChild(proposal);
      }
      Array.prototype.slice.call(proposals, 1).forEach(function (node) { node.remove(); });
      var markup = '<p class="coupon-item__title">' + t('mypage.welcomeBenefit.title') + '</p><p class="coupon-item__price"><strong>' + priceText(trial.priceValue) + '</strong></p><button type="button" class="primary-btn" data-tickets-open="">' + t('mypage.welcomeBenefit.cta') + '</button>';
      setTrialMarkupIfChanged(proposal, markup);
      if (wallet.hidden) wallet.hidden = false;
    });
  }

  function invalidateTrialEligibility(status) {
    ++trialReadVersion;
    if (trialReadController) trialReadController.abort();
    trialReadController = null;
    trialReadPromise = null;
    trialState = { status: status || 'loading', userId: null };
    renderPlans();
  }

  function refreshTrialEligibility(force) {
    if (trialReadPromise && !force) return trialReadPromise;
    if (force) invalidateTrialEligibility('loading');
    var version = ++trialReadVersion;
    trialState = { status: 'loading', userId: null };
    renderPlans();
    var controller = new AbortController();
    trialReadController = controller;
    var timeout;
    var timedOut = new Promise(function (_, reject) {
      timeout = setTimeout(function () { controller.abort(); reject(new Error('trial-eligibility-timeout')); }, 10000);
    });
    var work = (async function () {
      var client = getSupabase();
      if (!client || !client.auth || typeof client.auth.getSession !== 'function') {
        // Authentication restoration may not have loaded yet: do not claim logout or eligibility.
        throw new Error('trial-auth-unavailable');
      }
      var sessionResult = await client.auth.getSession();
      if (sessionResult.error) throw new Error('trial-auth-unavailable');
      var session = sessionResult.data && sessionResult.data.session;
      if (!session || !session.user) return { status: 'loggedout', userId: null };
      if (!session.access_token) throw new Error('trial-auth-unavailable');
      var response = await fetch('/api/ticket-payment', {
        method: 'POST', cache: 'no-store', signal: controller.signal,
        headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trial_eligibility' })
      });
      var data = await response.json();
      if (!response.ok || data.ok !== true || typeof data.eligible !== 'boolean') throw new Error('trial-eligibility-unavailable');
      // Even if an auth event was missed, an old account response cannot be applied to the current account.
      var current = await client.auth.getSession();
      if (current.error) throw new Error('trial-auth-unavailable');
      var currentSession = current.data && current.data.session;
      if (!currentSession || !currentSession.user || currentSession.user.id !== session.user.id) throw new Error('trial-auth-changed');
      return { status: data.eligible ? 'eligible' : 'ineligible', userId: session.user.id, trialStatus: !data.eligible && ['trial_paid', 'trial_completed'].indexOf(data.trial_status) !== -1 ? data.trial_status : null };
    })();
    trialReadPromise = Promise.race([work, timedOut]).then(function (result) {
      if (version !== trialReadVersion) return;
      trialState = result;
      renderPlans();
    }).catch(function (error) {
      if (version !== trialReadVersion) return;
      trialState = { status: error.message === 'trial-auth-changed' ? 'loading' : 'error', userId: null };
      renderPlans();
      if (error.message === 'trial-auth-changed') setTimeout(function () { refreshTrialEligibility(); }, 0);
    }).finally(function () {
      clearTimeout(timeout);
      if (version === trialReadVersion) {
        trialReadPromise = null;
        trialReadController = null;
      }
    });
    return trialReadPromise;
  }

  function scheduleTrialAuthRefresh(loggedOut) {
    invalidateTrialEligibility(loggedOut ? 'loggedout' : 'loading');
    clearTimeout(trialAuthTimer);
    // Never await another Supabase auth call inside its synchronous auth callback.
    trialAuthTimer = setTimeout(function () { refreshTrialEligibility(); }, 0);
  }

  function bindTrialAuthListener() {
    var client = getSupabase();
    if (trialAuthBound || !client || !client.auth || typeof client.auth.onAuthStateChange !== 'function') return;
    trialAuthBound = true;
    client.auth.onAuthStateChange(function (event, session) {
      if (event === 'TOKEN_REFRESHED') return;
      scheduleTrialAuthRefresh(!session || !session.user);
    });
  }

  // Presentation state only. The checkout receives the original plan through buyButton/completePurchase.
  function syncSelection() {
    var plan = findPlan(selectedPlanId);
    if (!plan) return;
    el.overlay.querySelectorAll('input[name="tkPlan"]').forEach(function (input) {
      input.checked = input.value === selectedPlanId;
      input.closest('.tk-choice').classList.toggle('is-selected', input.checked);
    });
    el.overlay.querySelector('[data-tk-selection]').textContent = pricePlanText(plan, 'title') + ' / ' + t('tickets.v2.total');
    el.overlay.querySelector('[data-tk-total]').textContent = priceText(plan.priceValue);
    el.overlay.querySelector('[data-tk-action]').innerHTML = buyButton(plan, { cta: t('tickets.v2.continue', { price: priceText(plan.priceValue) }) });
  }

  function renderPlans() {
    if (!el.overlay) return;
    el.overlay.querySelectorAll('[data-tk-copy]').forEach(function (node) { node.textContent = t(node.getAttribute('data-tk-copy')); });
    el.overlay.querySelector('[data-tk-close]').setAttribute('aria-label', t('tickets.v2.close'));
    var legacyConsent = el.overlay.querySelector('.tk-consent');
    if (legacyConsent) legacyConsent.style.display = adminPaymentTestVisible ? '' : 'none';
    var trialVisible = canShowTrialPurchase();
    var showTrialCard = trialVisible || trialState.status === 'ineligible';
    var statusNode = el.overlay.querySelector('[data-tk-eligibility]');
    var statusMarkup = trialStatusMarkup();
    statusNode.hidden = !statusMarkup;
    statusNode.innerHTML = statusMarkup;
    renderTrialSalesSurfaces();
    if (el.banner) { el.banner.hidden = !showTrialCard; el.banner.innerHTML = showTrialCard ? planCard(findPlan('trial'), !trialVisible) : ''; }
    if (el.grid) el.grid.innerHTML = [findPlan('single'), findPlan('pack3'), findPlan('pack11')].map(planCard).join('');
    el.overlay.querySelector('[data-tk-large]').innerHTML = planCard(findPlan('pack33'));
    if (el.single) el.single.innerHTML = adminPaymentTestVisible ? '<div class="tk-admin-test" data-tk-admin-test><span class="tk-badge">ADMIN TEST</span>' + singleRow(findPlan('admin_test_1000')) + '</div>' : '';
    if (el.used) { el.used.hidden = true; el.used.innerHTML = ''; }
    if (!selectedPlanId || (selectedPlanId === 'trial' && !trialVisible)) selectedPlanId = trialVisible ? 'trial' : 'single';
    syncSelection();
    el.overlay.querySelector('[data-tk-experience]').innerHTML = experienceMarkup();
    el.overlay.querySelector('[data-tk-comparison-body]').innerHTML = comparisonMarkup();
    el.overlay.querySelector('[data-tk-price-footnote]').textContent = t('tickets.v2.priceNote', { single: priceText(findPlan('single').priceValue) });
  }

  function copyNode(tag, key, cls) { return '<' + tag + (cls ? ' class="' + cls + '"' : '') + ' data-tk-copy="' + key + '">' + t(key) + '</' + tag + '>'; }
  function experienceMarkup() {
    return '<summary>' + t('tickets.v2.experience.title') + '</summary><div class="tk-experience__grid">' + [1, 2, 3].map(function (n) {
      return '<div class="tk-experience__item"><em>0' + n + '</em><div><strong>' + t('tickets.v2.experience.' + n + '.title') + '</strong><p>' + t('tickets.v2.experience.' + n + '.copy') + '</p></div></div>';
    }).join('') + '</div><p class="tk-price-footnote">' + t('tickets.v2.experience.note') + '</p>';
  }
  var COMPARISON_SOURCES = [
    ['Cambly — Private+', 'https://studentsupport.cambly.com/hc/ko/articles/19045434656013-나에게-맞는-플랜-선택하기'],
    ['Cambly — weekly plans', 'https://studentsupport.cambly.com/hc/ko/articles/360000312583-플랜-작동-방식'],
    ['Preply — subscription / trial', 'https://help.preply.com/en/articles/4966680-how-does-my-preply-subscription-work'],
    ['Episoden — free / conditions', 'https://www.episoden.com/faq/1-2'],
    ['Episoden — Buddy / extensions', 'https://www.episoden.com/faq/3-6'],
    ['Episoden — 1:1 / Host Room', 'https://www.episoden.com/en/faq/1-13'],
    ['Episoden — Host Room', 'https://www.episoden.com/faq/1-12']
  ];
  function comparisonMarkup() {
    var vars = { single: priceText(findPlan('single').priceValue) };
    return '<p class="tk-comparison__note">' + t('tickets.v2.comparison.intro') + '</p><div class="tk-comparison__grid">' +
      ['dayo', 'cambly', 'preply', 'episoden'].map(function (service) {
        return '<article class="tk-comparison__card"><h4>' + t('tickets.v2.comparison.' + service + '.name') + '</h4><p>' + t('tickets.v2.comparison.' + service + '.about') + '</p><dl>' +
          ['regular', 'partner', 'conversation'].map(function (field) {
            return '<dt>' + t('tickets.v2.comparison.' + field) + '</dt><dd>' + t('tickets.v2.comparison.' + service + '.' + field, vars) + '</dd>';
          }).join('') + '</dl></article>';
      }).join('') + '</div><p class="tk-price-footnote">' + t('tickets.v2.comparison.note') + '</p><details class="tk-sources"><summary>' + t('tickets.v2.comparison.sources') + '</summary><ol>' +
      COMPARISON_SOURCES.map(function (source) { return '<li><a target="_blank" rel="noopener noreferrer" href="' + source[1] + '">' + source[0] + '</a></li>'; }).join('') + '</ol></details>';
  }

  function buildMarkup() {
    return '<div class="tk-modal" role="dialog" aria-modal="true" aria-labelledby="tkTitle">' +
      '<button type="button" class="tk-close" data-tk-close>✕</button><div class="tk-head">' +
      copyNode('p', 'tickets.v2.eyebrow', 'tk-eyebrow') + '<h2 class="tk-title" id="tkTitle" data-tk-copy="tickets.v2.title">' + t('tickets.v2.title') + '</h2>' +
      copyNode('p', 'tickets.v2.subtitle', 'tk-sub') + '<ul class="tk-perks">' + [1, 2, 3].map(function (n) { return copyNode('li', 'tickets.v2.perk.' + n); }).join('') + '</ul></div>' +
      '<div class="tk-body"><h3 class="tk-section-heading">' + copyNode('span', 'tickets.v2.choose') + copyNode('small', 'tickets.v2.duration') + '</h3>' +
      '<div class="tk-eligibility" data-tk-eligibility role="status" aria-live="polite" hidden></div><div data-tk-banner></div><div class="tk-grid" data-tk-grid></div><div data-tk-large></div><p class="tk-price-footnote" data-tk-price-footnote></p><div class="tk-single" data-tk-single></div><div data-tk-used></div>' +
      '<details class="tk-experience" data-tk-experience></details><details class="tk-comparison"><summary><span>' + copyNode('strong', 'tickets.v2.comparison.title') + copyNode('small', 'tickets.v2.comparison.subtitle') + '</span></summary><div class="tk-comparison__body" data-tk-comparison-body></div></details>' +
      '<div class="tk-consent"><label for="tkRefundAgree"><input type="checkbox" id="tkRefundAgree" name="tkRefundAgree"><span>' + copyNode('span', 'tickets.v2.consent') + ' <button type="button" data-refund-mini data-terms-check="#tkRefundAgree">' + t('tickets.v2.view') + '</button></span></label></div>' +
      '<details class="tk-policy"><summary data-tk-copy="tickets.v2.policy.title">' + t('tickets.v2.policy.title') + '</summary><ul class="tk-policy__list">' + [1, 2, 3, 4].map(function (n) { return copyNode('li', 'tickets.v2.policy.' + n); }).join('') + '</ul></details></div>' +
      '<footer class="tk-footer"><div><small data-tk-selection></small><p class="tk-footer__price" data-tk-total></p>' + copyNode('small', 'tickets.v2.noRenewal') + '</div><div class="tk-footer__action"><div data-tk-action></div><button type="button" class="tk-footer__policy" data-tk-policy-link data-tk-copy="tickets.v2.policy.title">' + t('tickets.v2.policy.title') + '</button></div></footer></div>';
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
        var bookingRes = await client.from('bookings').select('id, status').eq('learner_id', userId).eq('is_test_session', false).limit(20);
        if (bookingRes.error) {
          bookingRes = await client.from('bookings').select('id, status').eq('user_id', userId).eq('is_test_session', false).limit(20);
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

  async function loadCoupons(couponRows) {
    var store = window.DayOProfileStore;
    var rows = Array.isArray(couponRows) ? couponRows : [];
    if (!Array.isArray(couponRows) && store && typeof store.fetchCoupons === 'function') {
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

  async function loadAdminPaymentTestAccess() {
    adminPaymentTestVisible = false;
    renderPlans();
    var gate = window.DayOPaymentTestAccess;
    if (!gate || typeof gate.isAllowed !== 'function') return false;
    try {
      adminPaymentTestVisible = (await gate.isAllowed()) === true;
    } catch (error) {
      adminPaymentTestVisible = false;
    }
    renderPlans();
    return adminPaymentTestVisible;
  }

  function open() {
    if (el.overlay.classList.contains('is-open')) return;
    lastFocused = document.activeElement;
    el.overlay.classList.add('is-open');
    if (window.DayOScrollLock) window.DayOScrollLock.lock();
    else document.body.style.overflow = 'hidden';
    var closeBtn = el.overlay.querySelector('[data-tk-close]');
    if (closeBtn) closeBtn.focus();
    refreshTrialEligibility(true);
    loadAdminPaymentTestAccess();
  }

  function close() {
    if (window.DayOCheckout) window.DayOCheckout.cancel();
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
    if (plan.id === 'trial' && !canShowTrialPurchase()) return;
    var payId = plan.payId || plan.id;
    if (typeof window.requestPay === 'function') {
      return window.requestPay(payId);
    }
    showToast('결제 기능을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.');
    return;
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
      if (e.target.closest('[data-tk-eligibility-retry]')) { refreshTrialEligibility(); return; }
      if (e.target.closest('[data-tk-notice-close]')) {
        hideNotice();
        return;
      }
      if (e.target === el.overlay || e.target.closest('[data-tk-close]')) close();
    });

    el.overlay.addEventListener('change', function (e) {
      var choice = e.target.closest('input[name="tkPlan"]');
      if (choice && choice.disabled) return;
      if (choice) { selectedPlanId = choice.value; syncSelection(); return; }
      var box = e.target.closest('[data-tk-coupon]');
      if (!box) return;
      couponState.applyWelcome = !!box.checked;
      renderPlans();
    });

    el.overlay.addEventListener('click', function (e) {
      var policyLink = e.target.closest('[data-tk-policy-link]');
      if (policyLink) { var policy = el.overlay.querySelector('.tk-policy'); policy.open = true; policy.scrollIntoView({ block: 'nearest' }); policy.querySelector('summary').focus(); return; }
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
      if (e.key === 'Tab' && el.overlay.classList.contains('is-open')) {
        var focusable = Array.from(el.overlay.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href], summary')).filter(function (node) { return node.getClientRects().length > 0; });
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      if (e.key !== 'Escape') return;
      if (el.notice && el.notice.classList.contains('is-open')) {
        hideNotice();
        return;
      }
      if (el.overlay.classList.contains('is-open')) close();
    });

    document.addEventListener('dayo:couponchange', function () { renderTrialSalesSurfaces(); refreshTrialEligibility(); });
    document.addEventListener('dayo:ticketpurchase', function () { refreshTrialEligibility(true); });
    document.addEventListener('dayo:authchange', function (event) { bindTrialAuthListener(); scheduleTrialAuthRefresh(event.detail && event.detail.loggedIn === false); });
    document.addEventListener('dayo:authprofile', function () { bindTrialAuthListener(); scheduleTrialAuthRefresh(false); });
    document.addEventListener('dayo:langchange', renderPlans);
    window.addEventListener('focus', function () { refreshTrialEligibility(); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refreshTrialEligibility(); });
    window.addEventListener('storage', function (event) {
      if (!event.key || /^sb-.*-auth-token$/.test(event.key)) scheduleTrialAuthRefresh(false);
    });
    bindTrialAuthListener();
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

  async function selectLandingPlan(id) {
    if (id === 'trial') {
      if (trialState.status !== 'eligible' && trialState.status !== 'loggedout') return;
      var trialUser = trialState.userId;
      open();
      await refreshTrialEligibility();
      if (trialUser && trialState.userId === trialUser && canShowTrialPurchase() && el.overlay.classList.contains('is-open')) {
        selectedPlanId = 'trial';
        syncSelection();
      }
      return;
    }
    if (['single', 'starter3', 'light11', 'full33'].indexOf(id) === -1) return;
    var plan = findPlan(id);
    if (!plan) return;
    selectedPlanId = plan.id;
    syncSelection();
    open();
  }

  function init() {
    mount();
    document.addEventListener('click', function (e) {
      if (e.target.closest('#pricing [data-landing-trial-retry]')) { refreshTrialEligibility(true); return; }
      var card = e.target.closest('#pricing [data-landing-ticket]');
      if (card) {
        e.preventDefault();
        if (!card.disabled) selectLandingPlan(card.getAttribute('data-landing-ticket'));
        return;
      }
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
      isTrialUsed: function () { return trialState.status === 'ineligible'; },
      refreshTrialEligibility: refreshTrialEligibility,
      renderTrialSalesSurfaces: renderTrialSalesSurfaces
    };
    window.openTicketModal = open;
    window.closeTicketModal = close;
    window.openPaymentModal = function () {
      open();
    };
    openFromQuery();
    refreshTrialEligibility();
    loadAdminPaymentTestAccess();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
