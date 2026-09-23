/* DayO 스마트 대화 예약 모달 — index.html / room.html 공용 */
(function () {
  'use strict';

  function t(key, vars) {
    if (!window.DayOI18n) return key;
    return vars ? window.DayOI18n.tf(key, vars) : window.DayOI18n.t(key);
  }

  var LANG_IDS = ['en', 'es', 'fr', 'ja', 'zh', 'vi', 'de', 'it', 'ru', 'ko'];
  var ACTIVE_LANG_IDS = ['en', 'es', 'fr', 'ko'];
  var PURPOSE_IDS = ['travel', 'opic', 'abroad', 'casual'];
  var STYLE_IDS = ['slow', 'fast', 'correct', 'korean'];

  function isActiveBookingLang(id) {
    return ACTIVE_LANG_IDS.indexOf(String(id || '').toLowerCase()) !== -1;
  }

  function LANGUAGES() {
    return LANG_IDS.map(function (id) {
      return {
        id: id,
        label: t('book.lang.' + id),
        flag: window.DayOI18n ? window.DayOI18n.langFlag(id) : '',
        disabled: !isActiveBookingLang(id)
      };
    });
  }

  function PURPOSES() {
    return PURPOSE_IDS.map(function (id) { return { id: id, label: t('book.purpose.' + id) }; });
  }

  function STYLES() {
    return STYLE_IDS.map(function (id) { return { id: id, label: t('book.style.' + id) }; });
  }

  var TEST_PARTNER_ID = '00000000-0000-0000-0000-000000000001';
  var TEST_PARTNER_FALLBACK = {
    id: TEST_PARTNER_ID,
    name: 'DayO Test Partner 🤖',
    avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=dayo-test',
    bio: '화상 연결 테스트용 상시 파트너',
    native_lang: '',
    isTest: true,
    initial: 'D'
  };
  var allPartners = [];
  var livePartners = [];
  var liveSlots = [];
  var partnersLoaded = false;
  var partnersLoading = false;
  var slotLoadSeq = 0;
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
    '.bk-chip.is-disabled,.bk-chip:disabled{background:#F5F5F4 !important;color:#A8A29E !important;',
    'border:1px solid #E7E5E4 !important;opacity:0.55;cursor:not-allowed !important;pointer-events:none;',
    'transform:none !important;box-shadow:none !important;}',
    '.bk-chip.is-disabled:hover,.bk-chip:disabled:hover{border-color:#E7E5E4 !important;transform:none !important;}',
    '.bk-chip__soon{display:inline-block;margin-left:.35rem;padding:.08rem .35rem;border-radius:999px;',
    'background:#E7E5E4;color:#78716C;font-size:.62rem;font-weight:800;letter-spacing:-.01em;vertical-align:middle;}',
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
    '.bk-live-slots{display:flex;flex-wrap:wrap;gap:4px;margin-top:.45rem;min-height:2rem;}',
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
    '.bk-partner-avatar img{width:100%;height:100%;object-fit:cover;border-radius:50%;}',
    '.bk-test-badge{display:inline-block;margin-left:.4rem;padding:.12rem .45rem;border-radius:999px;',
    'background:#EEF2FF;color:#4338CA;font-size:.64rem;font-weight:800;vertical-align:middle;letter-spacing:-.02em;}',
    '.bk-partner-meta{display:block;margin-top:.2rem;font-size:.72rem;color:var(--text-muted,#9A8580);line-height:1.45;}',
    '.bk-partner-check{font-size:1rem;color:var(--coral,#FF6B57);opacity:0;}.bk-partner.is-on .bk-partner-check{opacity:1;}',
    '.bk-slot-empty{font-size:.78rem;color:var(--text-muted,#9A8580);padding:.35rem 0;}',
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
    slotId: null,
    selectedSlot: null,
    viewYear: 0,
    viewMonth: 0
  };

  var el = {};
  var lastFocused = null;
  var toastTimer = null;
  var DRAFT_KEY = 'dayo.bookingDraft';
  var PENDING_OPEN_KEY = 'dayo.pendingBookingOpen';
  var RESUME_KEY = 'dayo.bookingResumeAfterTopup';
  var ZERO_TICKET_MSG = '보유 이용권이 없습니다. 이용권을 충전해 주세요.';
  var BOOKING_TRIGGER = '[data-booking-open], a[href="#booking"], a[href*="#booking"], a[href*="booking=open"]';

  function canCreateBookingDuringPreopen(userId) {
    return !!(window.DayOPreopenBooking &&
      typeof window.DayOPreopenBooking.canCreate === 'function' &&
      window.DayOPreopenBooking.canCreate(userId));
  }

  function showPreopenBookingNotice() {
    if (window.DayOPreopenBooking && typeof window.DayOPreopenBooking.showNotice === 'function') {
      window.DayOPreopenBooking.showNotice();
      return;
    }
    alert('10월 정식 오픈 준비 중이에요\n\n현재 화상 연결과 세션 흐름을 최종 점검하고 있어요.\n정식 오픈 후 1:1 대화를 예약할 수 있습니다.');
  }

  function startOfToday() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function chipsMarkup(items, group) {
    return items.map(function (item) {
      var label = item.flag ? item.flag + ' ' + item.label : item.label;
      var disabled = group === 'language' && (item.disabled || !isActiveBookingLang(item.id));
      if (disabled) {
        return '<button type="button" class="bk-chip is-disabled" data-group="' + group + '" data-id="' + item.id +
          '" aria-pressed="false" aria-disabled="true" disabled tabindex="-1">' + label +
          '<span class="bk-chip__soon">준비중</span></button>';
      }
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
          '</section>' +
          '<section class="bk-step" data-step="3">' +
            '<div class="bk-group">' +
              '<p class="bk-label">' + t('book.partnerQuestion') + '</p>' +
              '<p class="bk-hint" id="bkPartnerHint"></p>' +
              '<div class="bk-partners" id="bkPartners"></div>' +
            '</div>' +
            '<div class="bk-slots" id="bkSlots" hidden>' +
              '<p class="bk-label">' + t('book.slotsLabel') + '</p>' +
              '<div id="partner-slots-container" class="bk-live-slots bk-chips"></div>' +
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
    el.slotBox = el.overlay.querySelector('#partner-slots-container');
    el.partners = el.overlay.querySelector('#bkPartners');
    el.partnerHint = el.overlay.querySelector('#bkPartnerHint');
    el.summary = el.overlay.querySelector('#bkSummary');
    el.firstTip = el.overlay.querySelector('#bkFirstTip');
    el.chatSpeeds = el.overlay.querySelector('#bkChatSpeeds');
    el.chatStyles = el.overlay.querySelector('#bkChatStyles');
    el.chatRequests = el.overlay.querySelector('#bkChatRequests');

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
      if (chip.disabled || chip.getAttribute('aria-disabled') === 'true' || chip.classList.contains('is-disabled')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (chip.dataset.group === 'language' && !isActiveBookingLang(chip.dataset.id)) {
        e.preventDefault();
        return;
      }
      selectChip(chip);
    });

    el.partners.addEventListener('click', function (e) {
      var partner = e.target.closest('.bk-partner');
      if (!partner) return;
      state.partner = partner.dataset.id;
      state.time = null;
      state.slotId = null;
      state.selectedSlot = null;
      liveSlots = [];
      renderPartnerCards();
      if (el.slots) el.slots.hidden = false;
      fetchPartnerSlots(state.partner, state.date);
      updateFooter();
    });

    el.prevMonth.addEventListener('click', function () { shiftMonth(-1); });
    el.nextMonth.addEventListener('click', function () { shiftMonth(1); });

    el.calGrid.addEventListener('click', function (e) {
      var day = e.target.closest('.bk-day');
      if (!day || day.disabled || !day.dataset.date) return;
      if (!ensureLoggedInForBooking()) return;
      state.date = day.dataset.date;
      state.time = null;
      state.slotId = null;
      state.selectedSlot = null;
      liveSlots = [];
      renderCalendar();
      updateFooter();
      if (state.partner) fetchPartnerSlots(state.partner, state.date);
    });

    el.prevBtn.addEventListener('click', function () { goTo(state.step - 1); });
    el.nextBtn.addEventListener('click', function () {
      if (state.step === 4) { confirmBooking(); return; }
      if (state.step === 0 && isStepReady(0)) {
        persistLearningLanguage(state.language);
        if (needsTicketTopup()) {
          routeToTicketTopup();
          return;
        }
      }
      goTo(state.step + 1);
    });
  }

  function refreshOnLangChange() {
    var wasOpen = el.overlay.classList.contains('is-open');
    renderMarkup();
    ['language', 'purpose', 'style', 'time', 'chatSpeed', 'chatStyle', 'chatRequest'].forEach(syncChips);
    el.slots.hidden = !state.partner;
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
      if (!isActiveBookingLang(id)) return;
      state.language = id;
    } else if (group === 'style') {
      state.style = id;
    } else if (group === 'slot') {
      if (!ensureLoggedInForBooking()) return;
      var slotId = chip.dataset.slotId || chip.getAttribute('data-slot-id') || '';
      var clickedSlot = liveSlots.find(function (slot) { return String(slot.id) === String(slotId); });
      if (!clickedSlot) return;
      state.selectedSlot = {
        id: clickedSlot.id,
        slot_time: clickedSlot.slot_time,
        partner: state.partner,
        date: state.date
      };
      state.time = slotTimeLabel(clickedSlot.slot_time);
      state.slotId = clickedSlot.id;
    } else if (group === 'time') {
      if (!ensureLoggedInForBooking()) return;
      state.time = id;
      state.slotId = null;
      state.selectedSlot = null;
    } else if (group === 'chatSpeed' || group === 'chatStyle' || group === 'chatRequest') {
      state[group] = id;
      persistComfortPrefs(true);
    } else {
      return;
    }

    syncChips(group);
    if (group === 'slot') renderSlotChips();
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
      var selectable = date >= today;
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

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function learningLanguageValue(langId) {
    var id = String(langId || '').toLowerCase();
    if (id === 'en') return 'US 영어';
    if (id === 'es') return 'ES 스페인어';
    if (id === 'fr') return 'FR 프랑스어';
    if (id === 'ko') return 'KR 한국어';
    return '';
  }

  function persistLearningLanguage(langId) {
    var value = learningLanguageValue(langId);
    if (!value) return;
    var client = dbClient();
    if (!client || !client.auth) return;

    // Fire-and-forget — never block booking next-step UX
    Promise.resolve()
      .then(function () { return client.auth.getSession(); })
      .then(function (res) {
        var session = res && res.data && res.data.session;
        var user = session && session.user;
        if (!user || !user.id) return null;
        var payload = { learning_languages: value, updated_at: new Date().toISOString() };
        return client.from('profiles').update(payload).eq('id', user.id).select('id').then(function (byId) {
          if (byId && byId.data && byId.data.length) return byId;
          return client.from('profiles').update(payload).eq('user_id', user.id).select('id');
        });
      })
      .catch(function (err) {
        console.warn('[DayO] learning_languages sync failed', err);
      });
  }

  function dbClient() {
    if (window.supabaseClient && typeof window.supabaseClient.from === 'function') return window.supabaseClient;
    if (window.supabase && typeof window.supabase.from === 'function') return window.supabase;
    return null;
  }

  function isTestPartnerId(id) {
    return String(id || '') === TEST_PARTNER_ID;
  }

  function normalizePartner(row) {
    if (!row) return null;
    var id = row.user_id || row.id;
    if (!id) return null;
    var name = row.full_name || row.nickname || row.user_name || 'DayO Partner';
    var initial = String(name).charAt(0).toUpperCase() || 'P';
    return {
      id: id,
      profileId: row.id || id,
      name: name,
      avatar_url: row.avatar_url || '',
      bio: row.bio || '',
      native_lang: row.native_lang || '',
      isTest: isTestPartnerId(id) || String(name).indexOf('DayO Test Partner') === 0,
      initial: initial
    };
  }

  function withTestPartnerFallback(list) {
    var partners = (list || []).filter(Boolean);
    var hasTest = partners.some(function (p) { return isTestPartnerId(p.id); });
    if (!hasTest) partners.unshift(TEST_PARTNER_FALLBACK);
    return partners.sort(function (a, b) {
      if (isTestPartnerId(a.id)) return -1;
      if (isTestPartnerId(b.id)) return 1;
      return 0;
    });
  }

  async function loadAvailablePartners() {
    var supabase = dbClient();
    var partners = [];
    if (supabase) {
      var res = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, bio, native_lang')
        .eq('role', 'partner');
      if (res.error) {
        res = await supabase
          .from('profiles')
          .select('id, user_id, full_name, user_name, nickname, avatar_url, role')
          .eq('role', 'partner');
      }
      if (res.error) {
        console.error('파트너 로드 실패:', res.error);
      } else {
        partners = (res.data || []).map(normalizePartner);
      }
    }
    allPartners = withTestPartnerFallback(partners);
    livePartners = allPartners.slice();
    partnersLoaded = true;
    return livePartners;
  }

  function slotTimeLabel(slotTime) {
    var raw = String(slotTime || '');
    if (raw.indexOf('weekly:') === 0) {
      var weekly = raw.slice(7).split('|');
      return weekly[1] || raw;
    }
    var match = raw.match(/T(\d{2}:\d{2})/) || raw.match(/\s(\d{2}:\d{2})/);
    return match ? match[1] : raw;
  }

  function isFutureThirtyMinuteConcreteSlot(slot) {
    var raw = String(slot && slot.slot_time || '');
    if (raw.indexOf('weekly:') === 0) return false;
    var match = raw.match(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:(\d{2})/);
    if (!match || (match[1] !== '00' && match[1] !== '30')) return false;
    var normalized = raw.replace(' ', 'T');
    if (/[+-]\d{2}$/.test(normalized)) normalized += ':00';
    else if (/[+-]\d{4}$/.test(normalized)) {
      normalized = normalized.slice(0, -2) + ':' + normalized.slice(-2);
    }
    var start = new Date(normalized);
    return !isNaN(start.getTime()) && start.getTime() > Date.now();
  }

  async function fetchAvailablePartnerIds(isoDate) {
    var available = {};
    var supabase = dbClient();
    if (!supabase || !isoDate) return available;

    try {
      var result = await supabase
        .from('availability_slots')
        .select('partner_id, slot_time, status')
        .eq('status', 'available')
        .like('slot_time', isoDate + '%')
        .order('slot_time', { ascending: true });
      if (result.error) {
        console.warn('파트너 가용시간 로드 실패:', result.error);
        return available;
      }
      (result.data || []).filter(isFutureThirtyMinuteConcreteSlot).forEach(function (slot) {
        if (slot.partner_id) available[String(slot.partner_id)] = true;
      });
    } catch (err) {
      console.warn('파트너 가용시간 로드 실패:', err);
    }
    return available;
  }

  async function fetchPartnerSlots(partnerId, isoDate) {
    var requestSeq = ++slotLoadSeq;
    var container = el.slotBox || document.getElementById('partner-slots-container');
    if (!container) return [];
    if (!partnerId || !isoDate) {
      container.innerHTML = '<div class="bk-slot-empty">날짜와 파트너를 먼저 선택해 주세요.</div>';
      liveSlots = [];
      return liveSlots;
    }

    container.innerHTML = '<div class="bk-slot-empty">가능한 시간을 불러오는 중…</div>';
    var supabase = dbClient();
    if (!supabase) {
      container.innerHTML = '<div class="bk-slot-empty">현재 예약 가능한 시간대가 없습니다.</div>';
      liveSlots = [];
      return liveSlots;
    }

    var startOfSelectedDate = isoDate + ' 00:00:00';
    var endOfSelectedDate = isoDate + ' 23:59:59';
    var selectedPartnerId = partnerId;
    var slots = [];

    try {
      var res = await supabase
        .from('availability_slots')
        .select('id, slot_time, status')
        .eq('partner_id', selectedPartnerId)
        .eq('status', 'available')
        .gte('slot_time', startOfSelectedDate)
        .lte('slot_time', endOfSelectedDate)
        .order('slot_time', { ascending: true });

      if (res.error) {
        console.warn('슬롯 로드 실패, 날짜 접두 재시도:', res.error);
      } else {
        slots = res.data || [];
      }

      if (!slots.length) {
        var likeRes = await supabase
          .from('availability_slots')
          .select('id, slot_time, status')
          .eq('partner_id', selectedPartnerId)
          .eq('status', 'available')
          .like('slot_time', isoDate + '%')
          .order('slot_time', { ascending: true });
        if (!likeRes.error) slots = likeRes.data || [];
      }

    } catch (err) {
      console.error('슬롯 로드 실패:', err);
      slots = [];
    }

    if (requestSeq !== slotLoadSeq || state.partner !== selectedPartnerId || state.date !== isoDate) return [];
    liveSlots = (slots || []).filter(isFutureThirtyMinuteConcreteSlot);
    if (state.selectedSlot && !liveSlots.some(function (slot) { return slot.id === state.selectedSlot.id; })) {
      state.time = null;
      state.slotId = null;
      state.selectedSlot = null;
    }
    renderSlotChips();
    return liveSlots;
  }

  function renderSlotChips() {
    var container = el.slotBox || document.getElementById('partner-slots-container');
    if (!container) return;
    if (!liveSlots.length) {
      container.innerHTML = '<div class="bk-slot-empty">현재 예약 가능한 시간대가 없습니다.</div>';
      updateFooter();
      return;
    }
    container.innerHTML = liveSlots.map(function (slot) {
      var label = slotTimeLabel(slot.slot_time);
      var on = !!(state.selectedSlot && state.selectedSlot.id === slot.id);
      return '<button type="button" class="bk-chip' + (on ? ' is-on' : '') +
        '" data-group="slot" data-id="' + label + '" data-slot-id="' + slot.id +
        '" aria-pressed="' + (on ? 'true' : 'false') + '">' + label + '</button>';
    }).join('');
    updateFooter();
  }

  function getPartner(id) {
    for (var i = 0; i < livePartners.length; i++) {
      if (livePartners[i].id === id) return livePartners[i];
    }
    if (isTestPartnerId(id)) return TEST_PARTNER_FALLBACK;
    return null;
  }

  function renderPartnerCards() {
    if (!el.partners) return;
    var language = labelOf(LANGUAGES, state.language);
    var dateLabel = state.date ? formatDate(state.date) : '';
    el.partnerHint.textContent = dateLabel
      ? (language ? dateLabel + ' · ' + language : dateLabel)
      : t('book.partnerQuestion');
    if (!livePartners.length) {
      el.partners.innerHTML = '<p class="bk-hint">대화 파트너를 불러오는 중…</p>';
      return;
    }
    el.partners.innerHTML = livePartners.map(function (partner) {
      var on = state.partner === partner.id;
      var badge = partner.isTest ? '<span class="bk-test-badge">🧪 상시 테스트 가능</span>' : '';
      var avatar = partner.avatar_url
        ? '<img src="' + escapeHtml(partner.avatar_url) + '" alt="">'
        : escapeHtml(partner.initial || 'P');
      var meta = partner.isTest
        ? '화상 연결 테스트 시 언제든 선택할 수 있어요'
        : (partner.bio || partner.native_lang || '지금 대화 가능한 파트너');
      return '<button type="button" class="bk-partner' + (on ? ' is-on' : '') +
        '" data-id="' + partner.id + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
          '<span class="bk-partner-avatar" aria-hidden="true">' + avatar + '</span>' +
          '<span class="bk-partner-copy"><span class="bk-partner-name">' + escapeHtml(partner.name) + badge + '</span>' +
          '<span class="bk-partner-meta">' + escapeHtml(meta) + '</span></span>' +
          '<span class="bk-partner-check" aria-hidden="true">✓</span>' +
        '</button>';
    }).join('');
  }

  async function renderAvailablePartners() {
    var requestedDate = state.date;
    partnersLoading = true;
    if (el.partners) el.partners.innerHTML = '<p class="bk-hint">대화 파트너를 불러오는 중…</p>';
    if (!partnersLoaded || !allPartners.length) {
      await loadAvailablePartners();
    }
    if (requestedDate !== state.date) return;
    var availablePartnerIds = await fetchAvailablePartnerIds(requestedDate);
    if (requestedDate !== state.date) return;
    livePartners = allPartners.filter(function (partner) {
      return partner.isTest || isTestPartnerId(partner.id) || !!availablePartnerIds[String(partner.id)];
    });
    if (state.partner && !livePartners.some(function (partner) { return partner.id === state.partner; })) {
      state.partner = null;
      state.time = null;
      state.slotId = null;
      state.selectedSlot = null;
      liveSlots = [];
    }
    partnersLoading = false;
    renderPartnerCards();
    if (el.slots) el.slots.hidden = !state.partner;
    if (state.partner && state.date) await fetchPartnerSlots(state.partner, state.date);
    updateFooter();
  }

  function isStepReady(step) {
    if (step === 0) return isActiveBookingLang(state.language) && state.purposes.length > 0;
    if (step === 1) return !!state.style;
    if (step === 2) return !!state.date;
    if (step === 3) return !!(
      !partnersLoading &&
      state.partner &&
      state.slotId &&
      state.selectedSlot &&
      state.selectedSlot.id === state.slotId &&
      state.selectedSlot.partner === state.partner &&
      state.selectedSlot.date === state.date
    );
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
      row(t('book.summaryDatetime'), formatDate(state.date) + ' · ' + (state.time || '')) +
      row(t('book.summaryPartner'), (getPartner(state.partner) || {}).name || '');
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
    settleConfirmedBooking();
  }

  async function settleConfirmedBooking() {
    if (el.nextBtn) el.nextBtn.disabled = true;
    var learnerId = (window._dayoAuthUser && window._dayoAuthUser.id) || '';
    if (!learnerId && window.supabaseClient) {
      try {
        var authRes = await window.supabaseClient.auth.getUser();
        learnerId = authRes && authRes.data && authRes.data.user && authRes.data.user.id || '';
      } catch (e) { learnerId = ''; }
    }
    if (!canCreateBookingDuringPreopen(learnerId)) {
      if (el.nextBtn) el.nextBtn.disabled = !isStepReady(state.step);
      close();
      showPreopenBookingNotice();
      return;
    }

    var partnerId = state.partner;
    var partner = getPartner(partnerId) || {};
    var selectedSlot = state.selectedSlot && {
      id: state.selectedSlot.id,
      slot_time: state.selectedSlot.slot_time,
      partner: state.selectedSlot.partner,
      date: state.selectedSlot.date
    };
    if (!selectedSlot || selectedSlot.id !== state.slotId || selectedSlot.partner !== partnerId || selectedSlot.date !== state.date) {
      if (el.nextBtn) el.nextBtn.disabled = !isStepReady(state.step);
      return;
    }
    var scheduledAt = selectedSlot.slot_time;

    var bookingId = null;
    if (typeof window.createPendingBooking === 'function' && learnerId) {
      bookingId = await window.createPendingBooking({
        learner_id: learnerId,
        partner_id: partnerId,
        partner_user_id: partnerId,
        partner_name: partner.name || '',
        language: state.language || '',
        scheduled_at: scheduledAt,
        slot_id: selectedSlot.id
      });
    } else if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      bookingId = crypto.randomUUID();
    }

    var deducted = true;
    if (typeof window.handleConfirmBooking === 'function' && learnerId && bookingId) {
      deducted = await window.handleConfirmBooking(learnerId, bookingId, {
        slotId: selectedSlot.id,
        partnerId: partnerId
      });
    } else if (typeof window.handleConfirmBooking === 'function') {
      deducted = false;
      alert('예약 처리 중 통신 오류가 발생했습니다.');
    }

    if (el.nextBtn) el.nextBtn.disabled = !isStepReady(state.step);
    if (!deducted) return;

    try {
      if (bookingId) localStorage.setItem('dayo_active_booking_id', bookingId);
      if (learnerId) localStorage.setItem('dayo_session_learner_id', learnerId);
      if (partnerId) localStorage.setItem('dayo_partner_user_id', partnerId);
      if (partner.name) localStorage.setItem('dayo_partner_name', partner.name);
      localStorage.setItem('dayo_next_session', JSON.stringify({
        partnerName: partner.name || '',
        scheduledAt: scheduledAt,
        timeLabel: state.time || '',
        date: state.date || '',
        purposes: state.purposes.slice(),
        bookingId: bookingId
      }));
      localStorage.setItem('dayo_next_session_soon', '1');
    } catch (e) { /* ignore */ }

    clearDraft();
    clearFlag(RESUME_KEY);
    close();
    showToast(t('book.confirmToastFormat', { partner: partner.name || '' }));
    if (typeof window.refreshUrgentSessionBanner === 'function') {
      window.refreshUrgentSessionBanner();
    }
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
      slotId: state.slotId,
      selectedSlot: state.selectedSlot,
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
    state.language = isActiveBookingLang(draft.language) ? draft.language : null;
    state.purposes = Array.isArray(draft.purposes) ? draft.purposes.slice() : [];
    state.style = draft.style || null;
    if (draft.chatSpeed) state.chatSpeed = draft.chatSpeed;
    if (draft.chatStyle) state.chatStyle = draft.chatStyle;
    if (draft.chatRequest) state.chatRequest = draft.chatRequest;
    state.date = draft.date || null;
    state.time = draft.time || null;
    state.partner = draft.partner || null;
    state.slotId = draft.slotId || null;
    state.selectedSlot = draft.selectedSlot &&
      draft.selectedSlot.id === state.slotId &&
      draft.selectedSlot.partner === state.partner &&
      draft.selectedSlot.date === state.date
      ? draft.selectedSlot
      : null;
    if (!state.selectedSlot) {
      state.time = null;
      state.slotId = null;
    }
    if (state.date) {
      var parts = String(state.date).split('-');
      if (parts.length === 3) {
        state.viewYear = Number(parts[0]);
        state.viewMonth = Number(parts[1]) - 1;
      }
    }
    ['language', 'purpose', 'style', 'time', 'chatSpeed', 'chatStyle', 'chatRequest'].forEach(syncChips);
    updateFirstTip();
    el.slots.hidden = !state.partner;
    renderCalendar();
    goTo(typeof draft.step === 'number' ? draft.step : 0);
  }

  function getTicketCount() {
    try {
      var fromDayo = parseInt(localStorage.getItem('dayo_ticket_count'), 10);
      if (Number.isFinite(fromDayo) && fromDayo >= 0) return fromDayo;
    } catch (err) { /* ignore */ }
    if (window.DayOTicketWallet && typeof window.DayOTicketWallet.getCount === 'function') {
      var n = Number(window.DayOTicketWallet.getCount());
      if (Number.isFinite(n) && n >= 0) return n;
    }
    try {
      var fromWallet = parseInt(localStorage.getItem('ticketCount'), 10);
      if (Number.isFinite(fromWallet) && fromWallet >= 0) return fromWallet;
    } catch (err2) { /* ignore */ }
    return 0;
  }

  function needsTicketTopup() {
    return getTicketCount() <= 0;
  }

  function checkUserLoggedIn() {
    if (typeof window.checkUserLoggedIn === 'function' && window.checkUserLoggedIn !== checkUserLoggedIn) {
      try { return !!window.checkUserLoggedIn(); } catch (e) { /* ignore */ }
    }
    if (window.DayOMode && typeof window.DayOMode.isMember === 'function') {
      return !!window.DayOMode.isMember();
    }
    if (window._dayoAuthUser) return true;
    return false;
  }

  function isLoggedIn() {
    return checkUserLoggedIn();
  }

  function ensureLoggedInForBooking() {
    if (!checkUserLoggedIn()) {
      close();
      openLoginForBooking();
      return false;
    }
    if (getTicketCount() < 1) {
      routeToTicketTopup();
      return false;
    }
    return true;
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
    showToast(ZERO_TICKET_MSG);
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
      var modal = document.getElementById('login-modal')
        || document.querySelector('.login-modal-overlay')
        || document.querySelector('.ms-overlay');
      if (window.DayOMode && typeof window.DayOMode.openLogin === 'function') {
        if (typeof window.DayOMode.toast === 'function') {
          window.DayOMode.toast(t('login.required'));
        }
        window.DayOMode.openLogin(null);
        return true;
      }
      if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('is-open');
        return true;
      }
      return false;
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
    state.slotId = null;
    state.selectedSlot = null;
    liveSlots = [];
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
    if (!canCreateBookingDuringPreopen()) {
      showPreopenBookingNotice();
      return;
    }
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
    if (!checkUserLoggedIn()) {
      openLoginForBooking();
      return;
    }
    if (!canCreateBookingDuringPreopen()) {
      showPreopenBookingNotice();
      return;
    }
    if (getTicketCount() < 1) {
      routeToTicketTopup();
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
    window.loadAvailablePartners = loadAvailablePartners;
    window.fetchPartnerSlots = fetchPartnerSlots;
    openFromQuery();
    if (isLoggedIn()) tryOpenPendingBooking();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
