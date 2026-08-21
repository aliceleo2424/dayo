/* DayO 스마트 대화 예약 모달 — index.html / room.html 공용 */
(function () {
  'use strict';

  function t(key, vars) {
    if (!window.DayOI18n) return key;
    return vars ? window.DayOI18n.tf(key, vars) : window.DayOI18n.t(key);
  }

  var LANG_IDS = ['en', 'es', 'fr', 'ja', 'zh', 'vi', 'de', 'it', 'ru', 'ko'];
  var PURPOSE_IDS = ['travel', 'opic', 'abroad', 'casual'];
  var STYLE_IDS = ['slow', 'fast', 'correct', 'korean'];

  function LANGUAGES() {
    return LANG_IDS.map(function (id) {
      return { id: id, label: t('book.lang.' + id), flag: window.DayOI18n ? window.DayOI18n.langFlag(id) : '' };
    });
  }

  function PURPOSES() {
    return PURPOSE_IDS.map(function (id) { return { id: id, label: t('book.purpose.' + id) }; });
  }

  function STYLES() {
    return STYLE_IDS.map(function (id) { return { id: id, label: t('book.style.' + id) }; });
  }

  var TIME_SLOTS = ['10:00', '14:00', '19:30', '21:00', '22:00'];
  var PARTNER_SLOTS_A = ['10:00', '19:30', '22:00'];
  var PARTNER_SLOTS_B = ['14:00', '19:30', '21:00'];
  var AVAILABLE_PARTNERS = [
    { id: 'layna', language: 'en', name: 'Layna from UK', initial: 'L', rating: '5.0', korean: true, styles: ['slow', 'correct'], slots: PARTNER_SLOTS_A },
    { id: 'kate', language: 'en', name: 'Kate from USA', initial: 'K', rating: '4.9', korean: true, styles: ['fast', 'correct'], slots: PARTNER_SLOTS_B },
    { id: 'olivia', language: 'en', name: 'Olivia from UK', initial: 'O', rating: '4.8', korean: true, styles: ['slow', 'casual'], slots: PARTNER_SLOTS_B },
    { id: 'sofia', language: 'es', name: 'Sofia from Spain', initial: 'S', rating: '5.0', korean: true, styles: ['slow', 'correct'], slots: PARTNER_SLOTS_A },
    { id: 'elena', language: 'es', name: 'Elena from Spain', initial: 'E', rating: '4.9', korean: true, styles: ['fast', 'slow'], slots: PARTNER_SLOTS_B },
    { id: 'lucia', language: 'es', name: 'Lucía from Mexico', initial: 'L', rating: '4.8', korean: true, styles: ['correct', 'slow'], slots: PARTNER_SLOTS_B },
    { id: 'emma', language: 'fr', name: 'Emma from Belgium', initial: 'E', rating: '5.0', korean: true, styles: ['slow', 'correct'], slots: PARTNER_SLOTS_A },
    { id: 'camille', language: 'fr', name: 'Camille from France', initial: 'C', rating: '4.9', korean: true, styles: ['slow', 'correct'], slots: PARTNER_SLOTS_B },
    { id: 'chloe', language: 'fr', name: 'Chloé from Canada', initial: 'C', rating: '4.8', korean: true, styles: ['fast', 'slow'], slots: PARTNER_SLOTS_B },
    { id: 'yui', language: 'ja', name: 'Yui from Japan', initial: 'Y', rating: '5.0', korean: true, styles: ['slow', 'correct'], slots: PARTNER_SLOTS_A },
    { id: 'aoi', language: 'ja', name: 'Aoi from Japan', initial: 'A', rating: '4.9', korean: true, styles: ['fast', 'correct'], slots: PARTNER_SLOTS_B },
    { id: 'mei', language: 'zh', name: 'Mei from China', initial: 'M', rating: '4.9', korean: true, styles: ['slow', 'correct'], slots: PARTNER_SLOTS_A },
    { id: 'lili', language: 'zh', name: 'Lili from Taiwan', initial: 'L', rating: '4.8', korean: true, styles: ['fast', 'slow'], slots: PARTNER_SLOTS_B },
    { id: 'linh', language: 'vi', name: 'Linh from Vietnam', initial: 'L', rating: '4.9', korean: true, styles: ['slow', 'correct'], slots: PARTNER_SLOTS_A },
    { id: 'an', language: 'vi', name: 'An from Vietnam', initial: 'A', rating: '4.8', korean: true, styles: ['fast', 'slow'], slots: PARTNER_SLOTS_B },
    { id: 'anna', language: 'de', name: 'Anna from Germany', initial: 'A', rating: '4.9', korean: true, styles: ['correct', 'slow'], slots: PARTNER_SLOTS_A },
    { id: 'lena', language: 'de', name: 'Lena from Germany', initial: 'L', rating: '4.8', korean: true, styles: ['fast', 'slow'], slots: PARTNER_SLOTS_B },
    { id: 'marco', language: 'it', name: 'Marco from Italy', initial: 'M', rating: '4.9', korean: true, styles: ['fast', 'correct'], slots: PARTNER_SLOTS_A },
    { id: 'giulia', language: 'it', name: 'Giulia from Italy', initial: 'G', rating: '4.8', korean: true, styles: ['slow', 'correct'], slots: PARTNER_SLOTS_B },
    { id: 'sasha', language: 'ru', name: 'Sasha from Russia', initial: 'S', rating: '4.9', korean: true, styles: ['slow', 'correct'], slots: PARTNER_SLOTS_A },
    { id: 'mila', language: 'ru', name: 'Mila from Russia', initial: 'M', rating: '4.8', korean: true, styles: ['fast', 'slow'], slots: PARTNER_SLOTS_B },
    { id: 'jiwoo', language: 'ko', name: 'Jiwoo from Seoul', initial: 'J', rating: '4.9', korean: true, styles: ['slow', 'correct'], slots: PARTNER_SLOTS_A },
    { id: 'minseo', language: 'ko', name: 'Minseo from Busan', initial: 'M', rating: '4.8', korean: true, styles: ['fast', 'slow'], slots: PARTNER_SLOTS_B }
  ];
  function weekdays() {
    return window.DayOI18n ? window.DayOI18n.weekdayNames() : ['일', '월', '화', '수', '목', '금', '토'];
  }
  function stepLabel(step) {
    return t('book.step' + step);
  }

  var CSS = [
    '.bk-overlay{position:fixed;inset:0;z-index:900;display:flex;align-items:center;justify-content:center;',
    'padding:1.25rem;background:rgba(92,74,66,.28);backdrop-filter:blur(10px);',
    'width:100%;max-width:100%;overflow-x:hidden;box-sizing:border-box;',
    'opacity:0;visibility:hidden;pointer-events:none;transition:opacity .3s ease,visibility .3s ease;}',
    '.bk-overlay.is-open{opacity:1;visibility:visible;pointer-events:auto;}',
    '.bk-modal{position:relative;display:flex;flex-direction:column;width:100%;max-width:520px;',
    'max-height:min(88vh,88dvh);background:var(--bg-card,#FFFCFA);border:1px solid var(--coral-pale,#FFE8E3);',
    'border-radius:var(--radius-lg,24px);box-shadow:0 24px 64px rgba(255,107,87,.18);overflow:hidden;',
    'transform:translateY(18px) scale(.96);transition:transform .38s cubic-bezier(.34,1.4,.64,1);',
    'font-family:inherit;color:var(--text,#5C4A42);text-align:left;}',
    '.bk-overlay.is-open .bk-modal{transform:translateY(0) scale(1);}',
    '.bk-head{padding:1.35rem 1.5rem 1rem;background:linear-gradient(135deg,var(--pink,#FFD1DC),var(--peach,#FFE5B4));}',
    '.bk-eyebrow{font-size:.74rem;font-weight:700;letter-spacing:.04em;color:var(--coral,#FF6B57);}',
    '.bk-title{margin-top:.3rem;font-family:Quicksand,sans-serif;font-size:1.18rem;font-weight:700;line-height:1.45;}',
    '.bk-progress{margin-top:.9rem;height:7px;border-radius:999px;background:rgba(255,255,255,.65);overflow:hidden;}',
    '.bk-progress-bar{height:100%;width:20%;border-radius:999px;background:var(--coral,#FF6B57);transition:width .4s ease;}',
    '.bk-progress-label{margin-top:.35rem;font-size:.72rem;font-weight:700;color:var(--text-muted,#9A8580);text-align:right;}',
    '.bk-close{position:absolute;top:.9rem;right:.9rem;width:34px;height:34px;border:none;border-radius:50%;',
    'background:rgba(255,255,255,.75);color:var(--coral,#FF6B57);font-size:.95rem;cursor:pointer;line-height:1;}',
    '.bk-close:hover{background:var(--coral,#FF6B57);color:#fff;}',
    '.bk-body{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:1.25rem 1.5rem;}',
    '.bk-step{display:none;}',
    '.bk-step.is-active{display:block;animation:bkFade .32s ease;}',
    '@keyframes bkFade{from{opacity:0;transform:translateX(18px);}to{opacity:1;transform:translateX(0);}}',
    '.bk-label{margin-bottom:.6rem;font-size:.86rem;font-weight:700;}',
    '.bk-hint{margin-bottom:.6rem;font-size:.76rem;color:var(--text-muted,#9A8580);}',
    '.bk-summary+.bk-hint{margin-top:.85rem;margin-bottom:0;line-height:1.55;}',
    '.bk-group{margin-bottom:1.4rem;}',
    '.bk-group:last-child{margin-bottom:0;}',
    '.bk-chips{display:flex;flex-wrap:wrap;gap:.5rem;}',
    '.bk-chips--stack{flex-direction:column;flex-wrap:nowrap;}',
    '.bk-chip{padding:.6rem .95rem;border:1px solid var(--coral-pale,#FFE8E3);border-radius:999px;',
    'background:var(--cream,#FFF8F5);font-family:inherit;font-size:.85rem;color:inherit;cursor:pointer;',
    'text-align:left;transition:background .2s,border-color .2s,transform .2s;}',
    '.bk-chip:hover{border-color:var(--coral,#FF6B57);transform:translateY(-1px);}',
    '.bk-chip.is-on{background:var(--coral,#FF6B57);border-color:var(--coral,#FF6B57);color:#fff;font-weight:700;}',
    '.bk-chips--stack .bk-chip{border-radius:var(--radius,18px);line-height:1.5;}',
    '.bk-first-tip{margin:0 0 1rem;padding:.75rem .9rem;border-radius:16px;border:1px solid rgba(255,209,220,.75);',
    'background:linear-gradient(135deg,rgba(255,246,242,.95),rgba(255,241,216,.9));font-size:.8rem;font-weight:700;line-height:1.55;color:var(--text,#5C4A42);}',
    '.bk-first-tip[hidden]{display:none;}',
    '.bk-comfort{margin-bottom:1.35rem;padding:1rem;border-radius:18px;border:1px dashed rgba(255,209,220,.85);background:rgba(255,252,250,.8);}',
    '.bk-comfort .bk-group{margin-bottom:1rem;}',
    '.bk-comfort .bk-group:last-child{margin-bottom:0;}',
    '.bk-cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;}',
    '.bk-cal-title{font-family:Quicksand,sans-serif;font-size:.95rem;font-weight:700;}',
    '.bk-cal-nav{width:32px;height:32px;border:1px solid var(--coral-pale,#FFE8E3);border-radius:50%;',
    'background:var(--cream,#FFF8F5);color:var(--coral,#FF6B57);cursor:pointer;font-size:.85rem;line-height:1;}',
    '.bk-cal-nav:disabled{opacity:.35;cursor:not-allowed;}',
    '.bk-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:.3rem;}',
    '.bk-cal-dow{padding:.3rem 0;font-size:.7rem;font-weight:700;color:var(--text-muted,#9A8580);text-align:center;}',
    '.bk-day{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border:1px solid transparent;',
    'border-radius:50%;background:var(--cream,#FFF8F5);font-family:inherit;font-size:.82rem;color:inherit;cursor:pointer;}',
    '.bk-day:hover:not(:disabled){border-color:var(--coral,#FF6B57);}',
    '.bk-day:disabled{background:transparent;color:#D9CFC9;cursor:not-allowed;}',
    '.bk-day.is-empty{background:transparent;cursor:default;pointer-events:none;}',
    '.bk-day.is-on{background:var(--coral,#FF6B57);border-color:var(--coral,#FF6B57);color:#fff;font-weight:700;}',
    '.bk-slots{margin-top:1.2rem;}',
    '.bk-slots[hidden]{display:none;}',
    '.bk-partners{display:flex;flex-direction:column;gap:.65rem;}',
    '.bk-partner{width:100%;display:flex;align-items:center;gap:.85rem;padding:.8rem;border:1px solid var(--coral-pale,#FFE8E3);',
    'border-radius:var(--radius,18px);background:var(--cream,#FFF8F5);font-family:inherit;color:inherit;text-align:left;cursor:pointer;',
    'transition:transform .2s,border-color .2s,background .2s;}',
    '.bk-partner:hover{transform:translateY(-1px);border-color:var(--coral,#FF6B57);}',
    '.bk-partner.is-on{border-color:var(--coral,#FF6B57);background:var(--coral-pale,#FFE8E3);box-shadow:0 0 0 2px rgba(255,107,87,.1);}',
    '.bk-partner-avatar{flex:0 0 46px;height:46px;display:flex;align-items:center;justify-content:center;border-radius:50%;',
    'background:linear-gradient(135deg,var(--pink,#FFD1DC),var(--peach,#FFE5B4));border:2px solid #fff;',
    'font-family:Quicksand,sans-serif;font-size:1rem;font-weight:700;color:var(--coral,#FF6B57);box-shadow:0 4px 10px rgba(92,74,66,.08);}',
    '.bk-partner-copy{min-width:0;flex:1;}.bk-partner-name{display:block;font-size:.88rem;font-weight:700;}',
    '.bk-partner-meta{display:block;margin-top:.2rem;font-size:.72rem;color:var(--text-muted,#9A8580);line-height:1.45;}',
    '.bk-partner-check{font-size:1rem;color:var(--coral,#FF6B57);opacity:0;}.bk-partner.is-on .bk-partner-check{opacity:1;}',
    '.bk-summary{padding:1.1rem 1.25rem;border-radius:var(--radius,18px);',
    'background:linear-gradient(135deg,var(--pink,#FFD1DC),var(--peach,#FFE5B4));}',
    '.bk-row{display:flex;gap:.75rem;padding:.5rem 0;font-size:.86rem;line-height:1.5;}',
    '.bk-row+.bk-row{border-top:1px dashed rgba(255,255,255,.7);}',
    '.bk-row dt{flex:0 0 4.6rem;font-weight:700;color:var(--coral,#FF6B57);}',
    '.bk-row dd{flex:1;margin:0;}',
    '.bk-foot{display:flex;gap:.6rem;padding:1rem 1.5rem 1.25rem;border-top:1px solid var(--coral-pale,#FFE8E3);',
    'background:var(--bg-card,#FFFCFA);}',
    '.bk-btn{flex:1;padding:.9rem 1rem;border:none;border-radius:var(--radius,18px);font-family:inherit;',
    'font-size:.9rem;font-weight:700;cursor:pointer;transition:transform .15s,opacity .2s;}',
    '.bk-btn:active{transform:translateY(1px);}',
    '.bk-btn--ghost{flex:0 0 auto;padding:.9rem 1.15rem;background:var(--cream,#FFF8F5);',
    'border:1px solid var(--coral-pale,#FFE8E3);color:var(--text-muted,#9A8580);}',
    '.bk-btn--primary{background:var(--coral,#FF6B57);color:#fff;box-shadow:0 4px 0 var(--coral-dark,#E55A45);}',
    '.bk-btn--primary:disabled{opacity:.45;cursor:not-allowed;box-shadow:none;}',
    '.bk-toast{position:fixed;left:50%;bottom:2rem;z-index:960;max-width:min(420px,calc(100% - 2rem));',
    'padding:.95rem 1.4rem;border:1px solid var(--coral-pale,#FFE8E3);border-radius:var(--radius,18px);',
    'background:var(--bg-card,#FFFCFA);color:var(--text,#5C4A42);font-family:inherit;font-size:.88rem;',
    'font-weight:600;line-height:1.5;text-align:center;box-shadow:0 12px 32px rgba(255,107,87,.2);',
    'opacity:0;transform:translateX(-50%) translateY(70px);transition:opacity .3s,transform .4s ease;pointer-events:none;}',
    '.bk-toast.is-on{opacity:1;transform:translateX(-50%) translateY(0);}',
    '@media (max-width:600px){',
    '.bk-overlay{padding:0;align-items:flex-end;}',
    '.bk-modal{max-width:none;max-height:min(92vh,92dvh);border-radius:var(--radius-lg,24px) var(--radius-lg,24px) 0 0;}',
    '.bk-head{padding:1.15rem 1.15rem .9rem;}.bk-body{padding:1.1rem 1.15rem;}',
    '.bk-foot{padding:.85rem 1.15rem calc(.85rem + env(safe-area-inset-bottom));}',
    '.bk-chip{font-size:.82rem;}}'
  ].join('');

  var state = {
    step: 0,
    language: null,
    purposes: [],
    style: null,
    chatSpeed: 'slow',
    chatStyle: 'casual',
    chatRequest: 'praise',
    date: null,
    time: null,
    partner: null,
    viewYear: 0,
    viewMonth: 0
  };

  var el = {};
  var lastFocused = null;
  var toastTimer = null;
  var DRAFT_KEY = 'dayo.bookingDraft';
  var PENDING_OPEN_KEY = 'dayo.pendingBookingOpen';
  var RESUME_KEY = 'dayo.bookingResumeAfterTopup';
  var ZERO_TICKET_MSG = '보유하신 세션 티켓이 없습니다. 첫 체험권(9,900원) 또는 세션 패스를 충전해 주세요.';
  var BOOKING_TRIGGER = '[data-booking-open], a[href="#booking"], a[href*="#booking"], a[href*="booking=open"]';

  function startOfToday() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function chipsMarkup(items, group) {
    return items.map(function (item) {
      var label = item.flag ? item.flag + ' ' + item.label : item.label;
      return '<button type="button" class="bk-chip" data-group="' + group + '" data-id="' + item.id +
        '" aria-pressed="false">' + label + '</button>';
    }).join('');
  }

  function buildMarkup() {
    return '' +
      '<div class="bk-modal" role="dialog" aria-modal="true" aria-labelledby="bkTitle">' +
        '<button type="button" class="bk-close" data-bk-close aria-label="' + t('book.closeAria') + '">✕</button>' +
        '<div class="bk-head">' +
          '<p class="bk-eyebrow">SMART BOOKING</p>' +
          '<h2 class="bk-title" id="bkTitle">' + t('book.title') + '</h2>' +
          '<div class="bk-progress"><div class="bk-progress-bar" id="bkProgressBar"></div></div>' +
          '<p class="bk-progress-label" id="bkProgressLabel"></p>' +
        '</div>' +
        '<div class="bk-body">' +
          '<section class="bk-step" data-step="0">' +
            '<div class="bk-group">' +
              '<p class="bk-label">' + t('book.languageQuestion') + '</p>' +
              '<div class="bk-chips" id="bkLanguages">' + chipsMarkup(LANGUAGES(), 'language') + '</div>' +
            '</div>' +
            '<div class="bk-group">' +
              '<p class="bk-label">' + t('book.purposeQuestion') + '</p>' +
              '<p class="bk-hint">' + t('book.purposeHint') + '</p>' +
              '<div class="bk-chips" id="bkPurposes">' + chipsMarkup(PURPOSES(), 'purpose') + '</div>' +
            '</div>' +
          '</section>' +
          '<section class="bk-step" data-step="1">' +
            '<div class="bk-first-tip" id="bkFirstTip" hidden></div>' +
            '<div class="bk-comfort" id="bkComfort">' +
              '<p class="bk-label">' + t('book.comfortTitle') + '</p>' +
              '<div class="bk-group">' +
                '<p class="bk-hint">' + t('chatPrefs.speedLabel') + '</p>' +
                '<div class="bk-chips" id="bkChatSpeeds"></div>' +
              '</div>' +
              '<div class="bk-group">' +
                '<p class="bk-hint">' + t('chatPrefs.styleLabel') + '</p>' +
                '<div class="bk-chips" id="bkChatStyles"></div>' +
              '</div>' +
              '<div class="bk-group">' +
                '<p class="bk-hint">' + t('chatPrefs.requestLabel') + '</p>' +
                '<div class="bk-chips bk-chips--stack" id="bkChatRequests"></div>' +
              '</div>' +
            '</div>' +
            '<div class="bk-group">' +
              '<p class="bk-label">' + t('book.styleQuestion') + '</p>' +
              '<p class="bk-hint">' + t('book.styleHint') + '</p>' +
              '<div class="bk-chips bk-chips--stack" id="bkStyles">' + chipsMarkup(STYLES(), 'style') + '</div>' +
            '</div>' +
          '</section>' +
          '<section class="bk-step" data-step="2">' +
            '<div class="bk-group">' +
              '<p class="bk-label">' + t('book.dateQuestion') + '</p>' +
              '<p class="bk-hint">' + t('book.dateHint') + '</p>' +
              '<div class="bk-cal-head">' +
                '<button type="button" class="bk-cal-nav" id="bkPrevMonth" aria-label="' + t('book.prevMonthAria') + '">‹</button>' +
                '<span class="bk-cal-title" id="bkCalTitle" aria-live="polite"></span>' +
                '<button type="button" class="bk-cal-nav" id="bkNextMonth" aria-label="' + t('book.nextMonthAria') + '">›</button>' +
              '</div>' +
              '<div class="bk-cal-grid" id="bkCalGrid"></div>' +
            '</div>' +
            '<div class="bk-slots" id="bkSlots" hidden>' +
              '<p class="bk-label">' + t('book.slotsLabel') + '</p>' +
              '<div class="bk-chips" id="bkTimes"></div>' +
            '</div>' +
          '</section>' +
          '<section class="bk-step" data-step="3">' +
            '<div class="bk-group">' +
              '<p class="bk-label">' + t('book.partnerQuestion') + '</p>' +
              '<p class="bk-hint" id="bkPartnerHint"></p>' +
              '<div class="bk-partners" id="bkPartners"></div>' +
            '</div>' +
          '</section>' +
          '<section class="bk-step" data-step="4">' +
            '<div class="bk-group">' +
              '<p class="bk-label">' + t('book.summaryTitle') + '</p>' +
              '<dl class="bk-summary" id="bkSummary"></dl>' +
              '<p class="bk-hint" id="bkPolicyNote">' + t('book.policyNote') + '</p>' +
            '</div>' +
          '</section>' +
        '</div>' +
        '<div class="bk-foot">' +
          '<button type="button" class="bk-btn bk-btn--ghost" id="bkPrev">' + t('book.prev') + '</button>' +
          '<button type="button" class="bk-btn bk-btn--primary" id="bkNext">' + t('book.next') + '</button>' +
        '</div>' +
      '</div>';
  }

  function mount() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.className = 'bk-overlay';
    overlay.id = 'booking-modal';
    document.body.appendChild(overlay);

    var toast = document.createElement('div');
    toast.className = 'bk-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);

    el.overlay = overlay;
    el.toast = toast;

    renderMarkup();
    bindStaticEvents();
  }

  function renderMarkup() {
    el.overlay.innerHTML = buildMarkup();

    el.modal = el.overlay.querySelector('.bk-modal');
    el.steps = el.overlay.querySelectorAll('.bk-step');
    el.progressBar = el.overlay.querySelector('#bkProgressBar');
    el.progressLabel = el.overlay.querySelector('#bkProgressLabel');
    el.prevBtn = el.overlay.querySelector('#bkPrev');
    el.nextBtn = el.overlay.querySelector('#bkNext');
    el.calTitle = el.overlay.querySelector('#bkCalTitle');
    el.calGrid = el.overlay.querySelector('#bkCalGrid');
    el.prevMonth = el.overlay.querySelector('#bkPrevMonth');
    el.nextMonth = el.overlay.querySelector('#bkNextMonth');
    el.slots = el.overlay.querySelector('#bkSlots');
    el.times = el.overlay.querySelector('#bkTimes');
    el.partners = el.overlay.querySelector('#bkPartners');
    el.partnerHint = el.overlay.querySelector('#bkPartnerHint');
    el.summary = el.overlay.querySelector('#bkSummary');
    el.firstTip = el.overlay.querySelector('#bkFirstTip');
    el.chatSpeeds = el.overlay.querySelector('#bkChatSpeeds');
    el.chatStyles = el.overlay.querySelector('#bkChatStyles');
    el.chatRequests = el.overlay.querySelector('#bkChatRequests');

    el.times.innerHTML = TIME_SLOTS.map(function (slot) {
      return '<button type="button" class="bk-chip" data-group="time" data-id="' + slot + '" aria-pressed="false">' + slot + '</button>';
    }).join('');

    renderComfortChips();
    bindDynamicEvents();
  }

  function prefsApi() {
    return window.DayOChatPrefs || null;
  }

  function comfortChipHtml(ids, group, labelFn) {
    return ids.map(function (id) {
      return '<button type="button" class="bk-chip" data-group="' + group + '" data-id="' + id + '" aria-pressed="false">' +
        labelFn(id) + '</button>';
    }).join('');
  }

  function renderComfortChips() {
    var api = prefsApi();
    if (!el.chatSpeeds || !api) return;
    el.chatSpeeds.innerHTML = comfortChipHtml(api.SPEED_IDS, 'chatSpeed', api.speedLabel);
    el.chatStyles.innerHTML = comfortChipHtml(api.STYLE_IDS, 'chatStyle', api.styleLabel);
    el.chatRequests.innerHTML = comfortChipHtml(api.REQUEST_IDS, 'chatRequest', api.requestLabel);
    syncChips('chatSpeed');
    syncChips('chatStyle');
    syncChips('chatRequest');
    updateFirstTip();
  }

  function updateFirstTip() {
    if (!el.firstTip) return;
    var api = prefsApi();
    var show = !!(api && api.isFirstUser());
    el.firstTip.hidden = !show;
    if (show) el.firstTip.textContent = api.firstUserTip();
  }

  function bindStaticEvents() {
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.overlay.classList.contains('is-open')) close();
    });
  }

  function bindDynamicEvents() {
    el.overlay.addEventListener('click', function (e) {
      if (e.target === el.overlay) close();
      if (e.target.closest('[data-bk-close]')) close();
    });

    el.overlay.addEventListener('click', function (e) {
      var chip = e.target.closest('.bk-chip');
      if (!chip) return;
      selectChip(chip);
    });

    el.partners.addEventListener('click', function (e) {
      var partner = e.target.closest('.bk-partner');
      if (!partner) return;
      state.partner = partner.dataset.id;
      renderAvailablePartners();
      updateFooter();
    });

    el.prevMonth.addEventListener('click', function () { shiftMonth(-1); });
    el.nextMonth.addEventListener('click', function () { shiftMonth(1); });

    el.calGrid.addEventListener('click', function (e) {
      var day = e.target.closest('.bk-day');
      if (!day || day.disabled || !day.dataset.date) return;
      state.date = day.dataset.date;
      state.time = null;
      state.partner = null;
      renderCalendar();
      el.slots.hidden = false;
      syncChips('time');
      updateFooter();
    });

    el.prevBtn.addEventListener('click', function () { goTo(state.step - 1); });
    el.nextBtn.addEventListener('click', function () {
      if (state.step === 4) { confirmBooking(); return; }
      if (state.step === 0 && isStepReady(0) && needsTicketTopup()) {
        routeToTicketTopup();
        return;
      }
      goTo(state.step + 1);
    });
  }

  function refreshOnLangChange() {
    var wasOpen = el.overlay.classList.contains('is-open');
    renderMarkup();
    ['language', 'purpose', 'style', 'time', 'chatSpeed', 'chatStyle', 'chatRequest'].forEach(syncChips);
    el.slots.hidden = !state.date;
    renderCalendar();
    Array.prototype.forEach.call(el.steps, function (section, i) {
      section.classList.toggle('is-active', i === state.step);
    });
    if (state.step === 3) renderAvailablePartners();
    if (state.step === 4) renderSummary();
    el.progressBar.style.width = ((state.step + 1) / 5 * 100) + '%';
    el.progressLabel.textContent = t('book.progressFormat', { step: state.step + 1, label: stepLabel(state.step) });
    updateFooter();
    if (wasOpen) el.overlay.classList.add('is-open');
  }

  function selectChip(chip) {
    var group = chip.dataset.group;
    var id = chip.dataset.id;

    if (group === 'purpose') {
      var at = state.purposes.indexOf(id);
      if (at > -1) state.purposes.splice(at, 1);
      else state.purposes.push(id);
    } else if (group === 'language') {
      state.language = id;
      state.partner = null;
    } else if (group === 'style') {
      state.style = id;
      state.partner = null;
    } else if (group === 'time') {
      state.time = id;
      state.partner = null;
    } else if (group === 'chatSpeed' || group === 'chatStyle' || group === 'chatRequest') {
      state[group] = id;
      persistComfortPrefs(true);
    } else {
      return;
    }

    syncChips(group);
    updateFooter();
  }

  function persistComfortPrefs(clearFirst) {
    var api = prefsApi();
    if (!api) return;
    api.setPrefs({
      speed: state.chatSpeed,
      style: state.chatStyle,
      request: state.chatRequest
    }, { clearFirstUser: !!clearFirst });
    updateFirstTip();
  }

  function syncChips(group) {
    var chips = el.overlay.querySelectorAll('.bk-chip[data-group="' + group + '"]');
    Array.prototype.forEach.call(chips, function (chip) {
      var on = group === 'purpose'
        ? state.purposes.indexOf(chip.dataset.id) > -1
        : state[group] === chip.dataset.id;
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function shiftMonth(delta) {
    var view = new Date(state.viewYear, state.viewMonth + delta, 1);
    state.viewYear = view.getFullYear();
    state.viewMonth = view.getMonth();
    renderCalendar();
  }

  function renderCalendar() {
    var today = startOfToday();
    var first = new Date(state.viewYear, state.viewMonth, 1);
    var daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();
    var dow = weekdays();

    el.calTitle.textContent = window.DayOI18n ? window.DayOI18n.monthTitle(state.viewYear, state.viewMonth) : (state.viewYear + '년 ' + (state.viewMonth + 1) + '월');
    el.prevMonth.disabled = state.viewYear === today.getFullYear() && state.viewMonth === today.getMonth();

    var cells = dow.map(function (d) {
      return '<span class="bk-cal-dow">' + d + '</span>';
    });

    for (var blank = 0; blank < first.getDay(); blank++) {
      cells.push('<span class="bk-day is-empty" aria-hidden="true"></span>');
    }

    for (var day = 1; day <= daysInMonth; day++) {
      var date = new Date(state.viewYear, state.viewMonth, day);
      var iso = toISO(date);
      var selectable = date > today;
      cells.push(
        '<button type="button" class="bk-day' + (state.date === iso ? ' is-on' : '') + '"' +
        ' data-date="' + iso + '"' + (selectable ? '' : ' disabled') +
        ' aria-label="' + formatDate(iso) + '">' + day + '</button>'
      );
    }

    el.calGrid.innerHTML = cells.join('');
  }

  function toISO(date) {
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + m + '-' + d;
  }

  function formatDate(iso) {
    var parts = iso.split('-');
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var lang = window.DayOI18n ? window.DayOI18n.getLang() : 'KO';
    var dow = weekdays()[date.getDay()];
    if (lang === 'KO') return Number(parts[1]) + '월 ' + Number(parts[2]) + '일 (' + dow + ')';
    if (lang === 'ZH' || lang === 'JA') return Number(parts[1]) + '月 ' + Number(parts[2]) + '日 (' + dow + ')';
    return window.DayOI18n.monthTitle(Number(parts[0]), Number(parts[1]) - 1).split(' ')[0] + ' ' + Number(parts[2]) + ' (' + dow + ')';
  }

  function labelOf(getList, id) {
    var list = getList();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i].flag ? list[i].flag + ' ' + list[i].label : list[i].label;
    }
    return '';
  }

  function getPartner(id) {
    for (var i = 0; i < AVAILABLE_PARTNERS.length; i++) {
      if (AVAILABLE_PARTNERS[i].id === id) return AVAILABLE_PARTNERS[i];
    }
    return null;
  }

  function getAvailablePartners() {
    return AVAILABLE_PARTNERS.filter(function (partner) {
      return partner.language === state.language && partner.slots.indexOf(state.time) > -1;
    }).sort(function (a, b) {
      var aStyle = a.styles.indexOf(state.style) > -1 ? 1 : 0;
      var bStyle = b.styles.indexOf(state.style) > -1 ? 1 : 0;
      return bStyle - aStyle || Number(b.rating) - Number(a.rating);
    });
  }

  function renderAvailablePartners() {
    var available = getAvailablePartners();
    var language = labelOf(LANGUAGES, state.language);
    el.partnerHint.textContent = t('book.partnerHintFormat', { date: formatDate(state.date), time: state.time, language: language });
    el.partners.innerHTML = available.map(function (partner) {
      var styleMatch = state.style === 'korean' ? partner.korean : partner.styles.indexOf(state.style) > -1;
      var meta = '⭐ ' + partner.rating + t('book.koreanAvailable') + (styleMatch ? t('book.styleMatchSuffix') : '');
      return '<button type="button" class="bk-partner' + (state.partner === partner.id ? ' is-on' : '') +
        '" data-id="' + partner.id + '" aria-pressed="' + (state.partner === partner.id ? 'true' : 'false') + '">' +
          '<span class="bk-partner-avatar" aria-hidden="true">' + partner.initial + '</span>' +
          '<span class="bk-partner-copy"><span class="bk-partner-name">' + partner.name + '</span>' +
          '<span class="bk-partner-meta">' + meta + '</span></span>' +
          '<span class="bk-partner-check" aria-hidden="true">✓</span>' +
        '</button>';
    }).join('');
  }

  function isStepReady(step) {
    if (step === 0) return !!state.language && state.purposes.length > 0;
    if (step === 1) return !!state.style;
    if (step === 2) return !!state.date && !!state.time;
    if (step === 3) return !!state.partner;
    return true;
  }

  function renderSummary() {
    var api = prefsApi();
    var purposeText = state.purposes.map(function (id) {
      return labelOf(PURPOSES, id);
    }).join(', ');

    el.summary.innerHTML = '' +
      row(t('book.summaryLanguage'), labelOf(LANGUAGES, state.language)) +
      row(t('book.summaryPurpose'), purposeText) +
      row(t('chatPrefs.speedLabel'), api ? api.speedLabel(state.chatSpeed) : state.chatSpeed) +
      row(t('chatPrefs.styleLabel'), api ? api.styleLabel(state.chatStyle) : state.chatStyle) +
      row(t('chatPrefs.requestLabel'), api ? api.requestLabel(state.chatRequest) : state.chatRequest) +
      row(t('book.summaryStyle'), labelOf(STYLES, state.style)) +
      row(t('book.summaryDatetime'), formatDate(state.date) + ' · ' + state.time) +
      row(t('book.summaryPartner'), getPartner(state.partner).name);
  }

  function row(term, value) {
    return '<div class="bk-row"><dt>' + term + '</dt><dd>' + value + '</dd></div>';
  }

  function goTo(step) {
    if (step < 0 || step > 4) return;
    if (step > state.step && !isStepReady(state.step)) return;

    state.step = step;
    Array.prototype.forEach.call(el.steps, function (section, i) {
      section.classList.toggle('is-active', i === step);
    });
    if (step === 3) renderAvailablePartners();
    if (step === 4) renderSummary();

    el.progressBar.style.width = ((step + 1) / 5 * 100) + '%';
    el.progressLabel.textContent = t('book.progressFormat', { step: step + 1, label: stepLabel(step) });
    el.overlay.querySelector('.bk-body').scrollTop = 0;
    updateFooter();
  }

  function updateFooter() {
    el.prevBtn.style.display = state.step === 0 ? 'none' : '';
    el.nextBtn.textContent = state.step === 4 ? t('book.confirm') : t('book.next');
    el.nextBtn.disabled = !isStepReady(state.step);
  }

  function showToast(message) {
    el.toast.textContent = message;
    el.toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.classList.remove('is-on');
    }, 3600);
  }

  function confirmBooking() {
    if (!isStepReady(3)) return;
    persistComfortPrefs(true);
    clearDraft();
    clearFlag(RESUME_KEY);
    close();
    showToast(t('book.confirmToastFormat', { partner: getPartner(state.partner).name }));
  }

  function storageGet(key) {
    try { return window.sessionStorage.getItem(key); } catch (e) { return null; }
  }

  function storageSet(key, value) {
    try { window.sessionStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }

  function storageRemove(key) {
    try { window.sessionStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  function setFlag(key) { storageSet(key, '1'); }
  function hasFlag(key) { return storageGet(key) === '1'; }
  function clearFlag(key) { storageRemove(key); }

  function saveDraft() {
    storageSet(DRAFT_KEY, JSON.stringify({
      language: state.language,
      purposes: state.purposes.slice(),
      style: state.style,
      chatSpeed: state.chatSpeed,
      chatStyle: state.chatStyle,
      chatRequest: state.chatRequest,
      date: state.date,
      time: state.time,
      partner: state.partner,
      step: state.step
    }));
  }

  function loadDraft() {
    try {
      var raw = storageGet(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearDraft() {
    storageRemove(DRAFT_KEY);
  }

  function applyDraft(draft) {
    if (!draft) return;
    state.language = draft.language || null;
    state.purposes = Array.isArray(draft.purposes) ? draft.purposes.slice() : [];
    state.style = draft.style || null;
    if (draft.chatSpeed) state.chatSpeed = draft.chatSpeed;
    if (draft.chatStyle) state.chatStyle = draft.chatStyle;
    if (draft.chatRequest) state.chatRequest = draft.chatRequest;
    state.date = draft.date || null;
    state.time = draft.time || null;
    state.partner = draft.partner || null;
    if (state.date) {
      var parts = String(state.date).split('-');
      if (parts.length === 3) {
        state.viewYear = Number(parts[0]);
        state.viewMonth = Number(parts[1]) - 1;
      }
    }
    ['language', 'purpose', 'style', 'time', 'chatSpeed', 'chatStyle', 'chatRequest'].forEach(syncChips);
    updateFirstTip();
    el.slots.hidden = !state.date;
    renderCalendar();
    goTo(typeof draft.step === 'number' ? draft.step : 0);
  }

  function getTicketCount() {
    if (window.DayOTicketWallet && typeof window.DayOTicketWallet.getCount === 'function') {
      var n = Number(window.DayOTicketWallet.getCount());
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    return 0;
  }

  function needsTicketTopup() {
    return getTicketCount() <= 0;
  }

  function isLoggedIn() {
    if (window.DayOMode && typeof window.DayOMode.isMember === 'function') {
      return !!window.DayOMode.isMember();
    }
    try {
      return !!(window.localStorage.getItem('userName') || '').trim();
    } catch (e) {
      return false;
    }
  }

  function findBookingTrigger(target) {
    if (!target || !target.closest) return null;
    return target.closest(BOOKING_TRIGGER);
  }

  function zeroTicketMessage() {
    if (window.DayOI18n && typeof window.DayOI18n.t === 'function') {
      var msg = window.DayOI18n.t('book.needTicketsToast');
      if (msg && msg !== 'book.needTicketsToast') return msg;
    }
    return ZERO_TICKET_MSG;
  }

  function routeToTicketTopup() {
    saveDraft();
    setFlag(RESUME_KEY);
    showToast(zeroTicketMessage());
    close();
    if (window.DayOTickets && typeof window.DayOTickets.open === 'function') {
      window.DayOTickets.open();
      return;
    }
    var pricing = document.getElementById('pricing');
    if (pricing && typeof pricing.scrollIntoView === 'function') {
      pricing.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    window.location.href = 'index.html?tickets=open';
  }

  function openLoginForBooking() {
    setFlag(PENDING_OPEN_KEY);
    function showLogin() {
      if (!window.DayOMode || typeof window.DayOMode.openLogin !== 'function') return false;
      if (typeof window.DayOMode.toast === 'function') {
        window.DayOMode.toast(t('login.required'));
      }
      window.DayOMode.openLogin(null);
      return true;
    }
    if (showLogin()) return;
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (showLogin() || tries > 40) clearInterval(timer);
    }, 50);
  }

  function welcomeOpen() {
    var welcome = document.querySelector('.ms-welcome-overlay.is-open');
    return !!(welcome);
  }

  function tryOpenPendingBooking() {
    if (!isLoggedIn() || !hasFlag(PENDING_OPEN_KEY)) return;
    if (welcomeOpen()) return;
    clearFlag(PENDING_OPEN_KEY);
    open();
  }

  function loadComfortIntoState() {
    var api = prefsApi();
    if (api) api.applyFirstUserPresetIfNeeded();
    var prefs = api ? api.getPrefs() : { speed: 'slow', style: 'casual', request: 'praise' };
    state.chatSpeed = prefs.speed;
    state.chatStyle = prefs.style;
    state.chatRequest = prefs.request;
  }

  function reset() {
    var today = startOfToday();
    state.language = null;
    state.purposes = [];
    state.style = null;
    state.date = null;
    state.time = null;
    state.partner = null;
    state.viewYear = today.getFullYear();
    state.viewMonth = today.getMonth();
    loadComfortIntoState();

    ['language', 'purpose', 'style', 'time', 'chatSpeed', 'chatStyle', 'chatRequest'].forEach(syncChips);
    updateFirstTip();
    el.slots.hidden = true;
    renderCalendar();
    goTo(0);
  }

  function open(opts) {
    opts = opts || {};
    lastFocused = document.activeElement;
    reset();
    var draft = loadDraft();
    if (draft) applyDraft(draft);
    if (opts.resume && getTicketCount() > 0 && state.step === 0 && isStepReady(0)) {
      goTo(1);
    }
    el.overlay.classList.add('is-open');
    if (window.DayOScrollLock) window.DayOScrollLock.lock();
    else document.body.style.overflow = 'hidden';
    el.modal.querySelector('.bk-close').focus();
  }

  function requestOpen() {
    if (!isLoggedIn()) {
      openLoginForBooking();
      return;
    }
    open();
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

  function openFromQuery() {
    var fromQuery = /[?&]booking=open(&|$)/.test(window.location.search);
    var fromHash = window.location.hash === '#booking';
    if (!fromQuery && !fromHash) return;
    requestOpen();
    if (fromQuery && window.history && window.history.replaceState) {
      var clean = window.location.search.replace(/([?&])booking=open(&|$)/, '$1').replace(/[?&]$/, '');
      window.history.replaceState({}, '', window.location.pathname + clean + window.location.hash);
    }
  }

  function init() {
    mount();
    document.addEventListener('click', function (e) {
      var trigger = findBookingTrigger(e.target);
      if (!trigger) return;
      e.preventDefault();
      e.stopPropagation();
      requestOpen();
    });
    document.addEventListener('dayo:langchange', refreshOnLangChange);
    document.addEventListener('dayo:authchange', function (e) {
      if (!e.detail || !e.detail.loggedIn) return;
      setTimeout(tryOpenPendingBooking, 350);
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('[data-ms-welcome-close]')) return;
      setTimeout(tryOpenPendingBooking, 350);
    });
    document.addEventListener('dayo:ticketchange', function (e) {
      var count = e.detail && typeof e.detail.ticketCount === 'number'
        ? e.detail.ticketCount
        : getTicketCount();
      if (count <= 0 || !hasFlag(RESUME_KEY)) return;
      clearFlag(RESUME_KEY);
      if (window.DayOTickets && typeof window.DayOTickets.close === 'function') {
        window.DayOTickets.close();
      }
      open({ resume: true });
    });
    window.DayOBooking = { open: open, close: close, requestOpen: requestOpen };
    openFromQuery();
    if (isLoggedIn()) tryOpenPendingBooking();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
