/* DayO 스마트 대화 예약 모달 — index.html / room.html 공용 */
(function () {
  'use strict';

  function t(key, vars) {
    if (!window.DayOI18n) return key;
    return vars ? window.DayOI18n.tf(key, vars) : window.DayOI18n.t(key);
  }

  function loadPhotoResolver() {
    return window.DayOProfileImageURL ? Promise.resolve() : new Promise(function(resolve){var script=document.createElement('script');script.src='/profile-image-resolver.js';script.onload=resolve;script.onerror=resolve;document.head.appendChild(script);});
  }

  var LANG_IDS = ['en', 'es', 'fr', 'ja', 'zh', 'vi', 'de', 'it', 'ru', 'ko'];
  var ACTIVE_LANG_IDS = ['en', 'es', 'fr', 'ko'];
  var PURPOSE_IDS = ['travel', 'work_school', 'abroad', 'casual'];
  var INTEREST_IDS = ['drama', 'movies', 'youtube', 'music', 'travel', 'food_cafe', 'exercise', 'games', 'fashion_beauty', 'pets', 'books_webtoon', 'work_school'];
  var STYLE_IDS = ['slow', 'fast', 'correct', 'encourage'];
  // Keep semantic section IDs: timing/slot code continues to use its original IDs.
  var STEP_ORDER = [0, 3, 1, 2, 4];

  function ux(ko, en) {
    return !window.DayOI18n || window.DayOI18n.getLang() === 'KO' ? ko : en;
  }

  function isActiveBookingLang(id) {
    return ACTIVE_LANG_IDS.indexOf(String(id || '').toLowerCase()) !== -1;
  }

  function canonicalBookingLanguages(values) {
    var aliases = { en: 'en', english: 'en', es: 'es', spanish: 'es', fr: 'fr', french: 'fr', ko: 'ko', korean: 'ko' };
    return (Array.isArray(values) ? values : []).reduce(function (languages, value) {
      var key = String(value || '').trim().toLowerCase();
      var language = Object.prototype.hasOwnProperty.call(aliases, key) ? aliases[key] : null;
      if (language && isActiveBookingLang(language) && languages.indexOf(language) === -1) languages.push(language);
      return languages;
    }, []);
  }

  function LANGUAGES() {
    return LANG_IDS.map(function (id) {
      return {
        id: id,
        label: t('book.lang.' + id),
        code: id.toUpperCase(),
        disabled: !isActiveBookingLang(id)
      };
    });
  }

  function PURPOSES() {
    var labels = [ux('여행 · 일상', 'Travel & everyday life'), ux('일 · 학교 생활', 'Work & school life'), ux('워홀 · 유학 준비', 'Working holiday & study abroad'), ux('자유 수다', 'Casual conversation')];
    return PURPOSE_IDS.map(function (id, i) { return { id: id, label: labels[i] }; });
  }

  function INTERESTS() {
    var labels = [ux('드라마','TV series'),ux('영화','Movies'),ux('유튜브 · 쇼츠','YouTube / shorts'),ux('음악','Music'),ux('여행','Travel'),ux('맛집 · 카페','Food / cafés'),ux('운동','Exercise'),ux('게임','Games'),ux('패션 · 뷰티','Fashion / beauty'),ux('반려동물','Pets'),ux('책 · 웹툰','Books / webtoons'),ux('일 · 학교','Work / school')];
    return INTEREST_IDS.map(function (id, i) { return { id: id, label: labels[i] }; });
  }

  function STYLES() {
    return STYLE_IDS.map(function (id) {
      return { id: id, label: id === 'encourage' ? ux('💚 따뜻하게 칭찬하고 응원해주는 파트너', 'Praise & encouragement') : t('book.style.' + id) };
    });
  }

  var TEST_PARTNER_ID = '00000000-0000-0000-0000-000000000001';
  var BOOKING_MIN_LEAD_MS = 4 * 60 * 60 * 1000;
  var REFUND_CUTOFF_MS = 6 * 60 * 60 * 1000;
  var bookingSubmitting = false;
  var TEST_PARTNER_FALLBACK = {
    id: TEST_PARTNER_ID,
    name: 'DayO Test Partner 🤖',
    avatar_url: '',
    bio: '화상 연결 테스트용 상시 파트너',
    native_lang: '',
    isTest: true,
    initial: 'D'
  };
  var allPartners = [];
  var livePartners = [];
  var liveSlots = [];
  var liveTimes = [];
  var partnersLoaded = false;
  var partnerCriteriaKey = null, partnerLoadSeq = 0;
  var partnerRequest = null, partnerRequestKey = null;
  var partnersLoading = false;
  var availabilityLoadSeq = 0;
  var calendarSeq = 0, calendarKey = '', calendarRows = null, calendarLoading = false, calendarError = false;
  function weekdays() {
    return window.DayOI18n ? window.DayOI18n.weekdayNames() : ['일', '월', '화', '수', '목', '금', '토'];
  }
  function stepLabel(step) {
    return step === 3 ? ux('대화 설정', 'Conversation settings') : t('book.step' + step);
  }

  var CSS = [
    '.bk-overlay{--bk-surface:var(--cafe-ivory,#FFFBF4);--bk-secondary:var(--cafe-beige,#F8F0E3);',
    '--bk-primary:var(--cafe-sage,#5F7D63);--bk-primary-hover:var(--cafe-sage-hover,#506B55);',
    '--bk-selected:var(--cafe-sage-soft,#DDE8D9);--bk-border:#E7DDD0;}',
    '.bk-overlay{position:fixed;inset:0;z-index:900;display:flex;align-items:center;justify-content:center;',
    'padding:1.25rem;background:rgba(92,74,66,.28);backdrop-filter:blur(10px);',
    'width:100%;max-width:100%;overflow-x:hidden;box-sizing:border-box;',
    'opacity:0;visibility:hidden;pointer-events:none;transition:opacity .3s ease,visibility .3s ease;}',
    '.bk-overlay.is-open{opacity:1;visibility:visible;pointer-events:auto;}',
    '.bk-modal{position:relative;display:flex;flex-direction:column;width:100%;max-width:520px;',
    'max-height:min(88vh,88dvh);background:var(--bk-surface);border:1px solid var(--bk-border);',
    'border-radius:var(--radius-lg,24px);box-shadow:0 24px 64px rgba(64,54,47,.16);overflow:hidden;',
    'transform:translateY(18px) scale(.96);transition:transform .38s cubic-bezier(.34,1.4,.64,1);',
    'font-family:inherit;color:var(--text,#5C4A42);text-align:left;}',
    '.bk-overlay.is-open .bk-modal{transform:translateY(0) scale(1);}',
    '.bk-head{padding:1.35rem 1.5rem 1rem;background:var(--bk-secondary);}',
    '.bk-eyebrow{font-size:.74rem;font-weight:700;letter-spacing:.04em;color:var(--bk-primary);}',
    '.bk-title{margin-top:.3rem;font-family:Quicksand,sans-serif;font-size:1.18rem;font-weight:700;line-height:1.45;}',
    '.bk-progress{margin-top:.9rem;height:7px;border-radius:999px;background:var(--bk-border);overflow:hidden;}',
    '.bk-progress-bar{height:100%;width:20%;border-radius:999px;background:var(--bk-primary);transition:width .4s ease;}',
    '.bk-progress-label{margin-top:.35rem;font-size:.72rem;font-weight:700;color:var(--text-muted,#9A8580);text-align:right;}',
    '.bk-close{position:absolute;top:.9rem;right:.9rem;width:34px;height:34px;border:none;border-radius:50%;',
    'background:var(--bk-surface);color:var(--bk-primary);font-size:.95rem;cursor:pointer;line-height:1;}',
    '.bk-close:hover{background:var(--bk-primary);color:#fff;}',
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
    '.bk-chip{padding:.6rem .95rem;border:1px solid var(--bk-border);border-radius:999px;',
    'background:var(--bk-secondary);font-family:inherit;font-size:.85rem;color:inherit;cursor:pointer;',
    'text-align:left;transition:background .2s,border-color .2s,transform .2s;}',
    '.bk-chip:hover{border-color:var(--bk-primary);transform:translateY(-1px);}',
    '.bk-chip.is-on{background:var(--bk-selected);border-color:var(--bk-primary);color:var(--bk-primary-hover);font-weight:700;}',
    '.bk-chip.is-disabled,.bk-chip:disabled{background:#F5F5F4 !important;color:#A8A29E !important;',
    'border:1px solid #E7E5E4 !important;opacity:0.55;cursor:not-allowed !important;pointer-events:none;',
    'transform:none !important;box-shadow:none !important;}',
    '.bk-chip.is-disabled:hover,.bk-chip:disabled:hover{border-color:#E7E5E4 !important;transform:none !important;}',
    '.bk-chip__soon{display:inline-block;margin-left:.35rem;padding:.08rem .35rem;border-radius:999px;',
    'background:#E7E5E4;color:#78716C;font-size:.62rem;font-weight:800;letter-spacing:-.01em;vertical-align:middle;}',
    '.bk-chips--stack .bk-chip{border-radius:var(--radius,18px);line-height:1.5;}',
    '.bk-first-tip{margin:0 0 1rem;padding:.75rem .9rem;border-radius:16px;border:1px solid var(--bk-border);',
    'background:var(--bk-secondary);font-size:.8rem;font-weight:700;line-height:1.55;color:var(--text,#5C4A42);}',
    '.bk-first-tip[hidden]{display:none;}',
    '.bk-comfort{margin-bottom:1.35rem;padding:1rem;border-radius:18px;border:1px dashed var(--bk-border);background:var(--bk-surface);}',
    '.bk-comfort .bk-group{margin-bottom:1rem;}',
    '.bk-comfort .bk-group:last-child{margin-bottom:0;}',
    '.bk-cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;}',
    '.bk-cal-title{font-family:Quicksand,sans-serif;font-size:.95rem;font-weight:700;}',
    '.bk-cal-nav{width:32px;height:32px;border:1px solid var(--bk-border);border-radius:50%;',
    'background:var(--bk-secondary);color:var(--bk-primary);cursor:pointer;font-size:.85rem;line-height:1;}',
    '.bk-cal-nav:disabled{opacity:.35;cursor:not-allowed;}',
    '.bk-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:.3rem;}',
    '.bk-cal-dow{padding:.3rem 0;font-size:.7rem;font-weight:700;color:var(--text-muted,#9A8580);text-align:center;}',
    '.bk-day{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border:1px solid transparent;',
    'border-radius:50%;background:var(--bk-secondary);font-family:inherit;font-size:.82rem;color:inherit;cursor:pointer;}',
    '.bk-day:hover:not(:disabled){border-color:var(--bk-primary);}',
    '.bk-day:disabled{background:transparent;color:#D9CFC9;cursor:not-allowed;}',
    '.bk-day.is-empty{background:transparent;cursor:default;pointer-events:none;}',
    '.bk-day.is-on{background:var(--bk-primary);border-color:var(--bk-primary);color:#fff;font-weight:700;}',
    '.bk-slots{margin-top:1.2rem;}',
    '.bk-slots[hidden]{display:none;}',
    '.bk-live-slots{display:flex;flex-wrap:wrap;gap:4px;margin-top:.45rem;min-height:2rem;}',
    '.bk-partners{display:flex;flex-direction:column;gap:.65rem;}',
    '.bk-partner{width:100%;display:flex;align-items:center;gap:.85rem;padding:.8rem;border:1px solid var(--bk-border);',
    'border-radius:var(--radius,18px);background:var(--bk-secondary);font-family:inherit;color:inherit;text-align:left;cursor:pointer;',
    'transition:transform .2s,border-color .2s,background .2s;}',
    '.bk-partner:hover{transform:translateY(-1px);border-color:var(--bk-primary);}',
    '.bk-partner.is-on{border-color:var(--bk-primary);background:var(--bk-selected);box-shadow:0 0 0 2px rgba(95,125,99,.12);}',
    '.bk-partner-avatar{flex:0 0 46px;height:46px;display:flex;align-items:center;justify-content:center;border-radius:50%;',
    'background:var(--bk-selected);border:2px solid var(--bk-surface);',
    'font-family:Quicksand,sans-serif;font-size:1rem;font-weight:700;color:var(--bk-primary);box-shadow:0 4px 10px rgba(92,74,66,.08);}',
    '.bk-partner-copy{min-width:0;flex:1;}.bk-partner-name{display:block;font-size:.88rem;font-weight:700;}',
    '.bk-partner-avatar img{width:100%;height:100%;object-fit:cover;border-radius:50%;}',
    '.bk-test-badge{display:inline-block;margin-left:.4rem;padding:.12rem .45rem;border-radius:999px;',
    'background:#EEF2FF;color:#4338CA;font-size:.64rem;font-weight:800;vertical-align:middle;letter-spacing:-.02em;}',
    '.bk-partner-meta{display:block;margin-top:.2rem;font-size:.72rem;color:var(--text-muted,#9A8580);line-height:1.45;}',
    '.bk-partner-check{font-size:1rem;color:var(--bk-primary);opacity:0;}.bk-partner.is-on .bk-partner-check{opacity:1;}',
    '.bk-slot-empty{font-size:.78rem;color:var(--text-muted,#9A8580);padding:.35rem 0;}',
    '.bk-inline-action{display:block;margin-top:.65rem;padding:.55rem .75rem;border:1px solid var(--bk-border);',
    'border-radius:999px;background:var(--bk-surface);color:var(--bk-primary);font:inherit;font-weight:700;cursor:pointer;}',
    '.bk-summary{padding:1.1rem 1.25rem;border-radius:var(--radius,18px);',
    'background:var(--bk-secondary);border:1px solid var(--bk-border);}',
    '.bk-row{display:flex;gap:.75rem;padding:.5rem 0;font-size:.86rem;line-height:1.5;}',
    '.bk-row+.bk-row{border-top:1px dashed var(--bk-border);}',
    '.bk-row dt{flex:0 0 4.6rem;font-weight:700;color:var(--bk-primary);}',
    '.bk-row dd{flex:1;margin:0;}',
    '.bk-foot{display:flex;flex-shrink:0;gap:.6rem;padding:1rem 1.5rem 1.25rem;border-top:1px solid var(--bk-border);',
    'background:var(--bk-surface);}',
    '.bk-btn{flex:1;padding:.9rem 1rem;border:none;border-radius:var(--radius,18px);font-family:inherit;',
    'font-size:.9rem;font-weight:700;cursor:pointer;transition:transform .15s,opacity .2s;}',
    '.bk-btn:active{transform:translateY(1px);}',
    '.bk-btn--ghost{flex:0 0 auto;padding:.9rem 1.15rem;background:var(--bk-secondary);',
    'border:1px solid var(--bk-border);color:var(--text,#5C4A42);}',
    '.bk-btn--primary{background:var(--bk-primary);color:#fff;box-shadow:0 4px 0 var(--bk-primary-hover);}',
    '.bk-btn--primary:hover:not(:disabled){background:var(--bk-primary-hover);}',
    '.bk-btn--ghost:hover:not(:disabled){border-color:var(--bk-primary);color:var(--bk-primary-hover);}',
    '.bk-modal button:focus-visible,.bk-modal summary:focus-visible{outline:2px solid var(--bk-primary);outline-offset:3px;}',
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
    '.bk-chip{font-size:.82rem;}}',
    '.bk-recent[hidden],.bk-group[hidden],.bk-step[hidden]{display:none!important;}',
    '.bk-recent p{margin:0 0 .65rem;line-height:1.5;}.bk-recent .bk-summary{margin:0;}',
    '.bk-optional{margin-bottom:1rem;}.bk-optional>summary{cursor:pointer;font-size:.8rem;font-weight:700;padding:.6rem 0;}',
    '.bk-optional .bk-comfort{margin-bottom:0;}.bk-row dd{min-width:0;overflow-wrap:anywhere;}'
  ].join('');

  var state = {
    step: 0,
    language: null,
    koreanHelp: 'any',
    purposes: [],
    interests: [],
    style: null,
    chatStyle: 'casual',
    chatRequest: 'praise',
    date: null,
    time: null,
    timeKey: null,
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
  var RECENT_KEY = 'dayo.confirmedPreferences.v1:';
  var recentSummary = false;
  var recentLoading = false;
  var recentSeq = 0;
  var bookingOwner = null;
  var PENDING_OPEN_KEY = 'dayo.pendingBookingOpen';
  var RESUME_KEY = 'dayo.bookingResumeAfterTopup';
  var ZERO_TICKET_MSG = '보유 이용권이 없습니다. 이용권을 충전해 주세요.';
  var BOOKING_TRIGGER = '[data-booking-open], a[href="#booking"], a[href*="#booking"], a[href*="booking=open"]';

  function uniqueKeys(value, allowed, max) {
    return Array.isArray(value) ? value.filter(function (id, i, all) {
      return allowed.indexOf(id) >= 0 && all.indexOf(id) === i;
    }).slice(0, max) : [];
  }

  function canonicalStyle(brief) {
    if (brief.schema_version === 1 && STYLE_IDS.indexOf(brief.conversation_style) >= 0) return brief.conversation_style;
    if (['slow', 'fast', 'correct'].indexOf(brief.partner_preference) >= 0) return brief.partner_preference;
    // Legacy 'korean' denotes capability, not a conversation style. Never alias it.
    if (!brief.partner_preference && brief.chat_request === 'praise') return 'encourage';
    return null;
  }

  function preferencesFromBooking(booking, supplement) {
    var brief = booking.conversation_brief || {};
    var help = brief.schema_version === 1 ? brief.korean_support_preference : null;
    // A session-only supplement is valid solely for this exact confirmed booking.
    if (!help && supplement && supplement.bookingId === booking.id) help = supplement.koreanSupport;
    return {
      language: isActiveBookingLang(booking.language) ? booking.language : null,
      koreanHelp: booking.language === 'ko' ? null : help === 'required' ? 'needed' : help === 'any' ? 'any' : null,
      purposes: uniqueKeys(brief.purposes, PURPOSE_IDS, 4),
      interests: uniqueKeys(brief.interests, INTEREST_IDS, 4),
      style: canonicalStyle(brief),
      chatStyle: ['casual', 'correct', 'interview'].indexOf(brief.chat_style) >= 0 ? brief.chat_style : null,
      chatRequest: ['praise', 'gentle', 'encourage'].indexOf(brief.chat_request) >= 0 ? brief.chat_request : null
    };
  }

  function currentUserId() {
    return window._dayoAuthUser && window._dayoAuthUser.id || null;
  }

  function resolveRecentPreferences(prefs) {
    var resolved = Object.assign({}, prefs);
    // Resolve this new booking only; never rewrite an unknown historical snapshot.
    if (resolved.language !== 'ko' && resolved.koreanHelp !== 'needed' && resolved.koreanHelp !== 'any') {
      resolved.koreanHelp = 'any';
    }
    return resolved;
  }

  function recentRequiredFields() {
    var missing = [];
    if (!isActiveBookingLang(state.language)) missing.push(t('book.summaryLanguage'));
    if (!state.purposes.length) missing.push(t('book.summaryPurpose'));
    if (STYLE_IDS.indexOf(state.style) < 0) missing.push(t('book.summaryStyle'));
    return missing;
  }

  async function readRecentBooking(client, userId) {
    // completed is a successfully confirmed booking; pending/cancelled never supply defaults.
    var result = await client.from('bookings').select('id,language,conversation_brief,created_at')
      .eq('learner_id', userId).eq('is_test_session', false).in('status', ['confirmed', 'completed'])
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1);
    if (result.error) throw result.error;
    return result.data && result.data[0] || null;
  }

  function koreanHelpLabel() {
    return state.koreanHelp === 'needed' ? t('book.koreanHelpNeeded') : state.koreanHelp === 'any'
      ? t('book.koreanHelpAny') : ux('미확인 — 선택해 주세요', 'Unknown — please choose');
  }

  function updateKoreanVisibility() {
    var question = el.overlay && el.overlay.querySelector('#bkKoreanQuestion');
    if (question) question.parentElement.hidden = state.language === 'ko';
  }

  function renderProgress() {
    var position = STEP_ORDER.indexOf(state.step) + 1;
    el.progressBar.style.width = (position / STEP_ORDER.length * 100) + '%';
    el.progressLabel.textContent = recentSummary ? ux('지난 설정', 'Last settings')
      : position + '/' + STEP_ORDER.length + ' · ' + stepLabel(state.step);
  }

  function renderRecentSummary() {
    el.recent.hidden = !recentSummary;
    Array.prototype.forEach.call(el.steps, function (section) { section.hidden = recentSummary; });
    if (!recentSummary) return;
    if (recentLoading) { el.recent.textContent = ux('지난 예약 설정을 확인하고 있어요…', 'Loading your last booking settings…'); return; }
    var interestLabels = state.interests.slice(0, 3).map(function (id) { return labelOf(INTERESTS, id); });
    var overflow = state.interests.length > 3 ? ' +' + (state.interests.length - 3) : '';
    var languageText = state.language ? state.language.toUpperCase() + ' ' + t('book.lang.' + state.language) : ux('미확인', 'Unknown');
    var rows = row(t('book.summaryLanguage'), languageText) +
      (state.language === 'ko' ? '' : row(t('book.summaryKoreanHelp'), koreanHelpLabel())) +
      row(t('book.summaryPurpose'), state.purposes.map(function (id) { return labelOf(PURPOSES, id); }).join(' · ') || ux('미선택', 'Not selected')) +
      row(ux('관심사', 'Interests'), interestLabels.join(' · ') + overflow || ux('미선택', 'Not selected')) +
      row(t('book.summaryStyle'), labelOf(STYLES, state.style) || ux('미확인', 'Unknown'));
    el.recent.innerHTML = '<p class="bk-label">' + ux('지난 설정', 'Last settings') + '</p><dl class="bk-summary">' + rows + '</dl>' +
      '<p class="bk-hint">' + ux('목적은 이번 대화에 맞게 수정할 수 있어요.', 'You can change the purpose for this conversation.') + '</p>' +
      (recentRequiredFields().length ? '<p class="bk-hint">' + ux('수정하기에서 필수 항목을 선택해 주세요: ', 'Choose required settings in Edit: ') + recentRequiredFields().join(' · ') + '</p>' : '');
  }

  async function loadRecentPreferences() {
    var seq = ++recentSeq;
    recentSummary = true;
    recentLoading = true;
    renderRecentSummary(); renderProgress(); updateFooter();
    try {
      var client = window.supabaseClient;
      if (!client || !client.auth || !client.auth.getSession) return;
      var auth = await client.auth.getSession();
      var user = auth.data && auth.data.session && auth.data.session.user;
      if (!user || auth.error || (currentUserId() && currentUserId() !== user.id)) return;
      bookingOwner = user.id;
      var booking = await readRecentBooking(client, user.id);
      var defaults = await client.from('user_conversation_preferences')
        .select('language,korean_support_preference,conversation_style,purposes,interests,source_booking_id').eq('user_id', user.id).maybeSingle();
      // Only defaults linked to an actually confirmed booking can replace its choices.
      var saved = !defaults.error && defaults.data;
      if (saved && saved.source_booking_id && (!booking || saved.source_booking_id === booking.id)) {
        booking = { id: saved.source_booking_id, language: saved.language, conversation_brief: {schema_version: 1,
          korean_support_preference: saved.korean_support_preference, conversation_style: saved.conversation_style,
          purposes: saved.purposes, interests: saved.interests} };
      }
      if (seq !== recentSeq || currentUserId() && currentUserId() !== user.id || !booking) return;
      var supplement;
      try { supplement = JSON.parse(storageGet(RECENT_KEY + user.id) || 'null'); } catch (e) { /* no supplement */ }
      var prefs = resolveRecentPreferences(preferencesFromBooking(booking, supplement));
      Object.keys(prefs).forEach(function (key) { state[key] = prefs[key]; });
      recentSummary = true;
      ['language', 'koreanHelp', 'purpose', 'interest', 'style', 'chatStyle', 'chatRequest'].forEach(syncChips);
      updateKoreanVisibility();
      return;
    } catch (e) {
      // RLS/network failures must leave the ordinary booking flow available.
    } finally {
      if (seq === recentSeq) {
        recentLoading = false;
        // Only an actual recent language/preferences record produces the shortcut screen.
        recentSummary = !!state.language;
        renderRecentSummary(); renderProgress(); updateFooter();
      }
    }
  }

  function preferenceSnapshot() {
    return {
      language: state.language,
      koreanSupport: state.language === 'ko' ? 'any' : state.koreanHelp === 'needed' ? 'required' : state.koreanHelp === 'any' ? 'any' : null,
      conversationStyle: state.style,
      brief: {
        schema_version: 1,
        korean_support_preference: state.language === 'ko' ? 'any' : state.koreanHelp === 'needed' ? 'required' : state.koreanHelp === 'any' ? 'any' : null,
        purposes: state.purposes.slice(), interests: state.interests.slice(),
        conversation_style: state.style
      }
    };
  }

  function isInternalBookingTest() {
    return !!(window.DayOPreopenBooking &&
      typeof window.DayOPreopenBooking.isInternalTest === 'function' &&
      window.DayOPreopenBooking.isInternalTest());
  }

  function canBypassBookingLeadTime() {
    if (window.DayOPreopenBooking && typeof window.DayOPreopenBooking.canBypassLeadTime === 'function') {
      return !!window.DayOPreopenBooking.canBypassLeadTime();
    }
    return isInternalBookingTest();
  }

  function isBookableStart(startMs) {
    var nowMs = Date.now();
    return isFinite(startMs) && startMs > nowMs &&
      (canBypassBookingLeadTime() || startMs - nowMs >= BOOKING_MIN_LEAD_MS);
  }

  function requiresNoRefundWarning(startMs) {
    var remaining = startMs - Date.now();
    return !isInternalBookingTest() && isFinite(startMs) && remaining > 0 && remaining <= REFUND_CUTOFF_MS;
  }

  function startOfToday() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function chipsMarkup(items, group) {
    return items.map(function (item) {
      var label = item.code ? item.code + ' ' + item.label : item.label;
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
          '<section class="bk-recent" id="bkRecent" hidden aria-live="polite"></section>' +
          '<section class="bk-step" data-step="0">' +
            '<div class="bk-group">' +
              '<p class="bk-label">' + t('book.languageQuestion') + '</p>' +
              '<div class="bk-chips" id="bkLanguages">' + chipsMarkup(LANGUAGES(), 'language') + '</div>' +
            '</div>' +
            '<div class="bk-group">' +
              '<p class="bk-label" id="bkKoreanQuestion">' + t('book.koreanHelpQuestion') + '</p>' +
              '<div class="bk-chips bk-chips--stack" id="bkKoreanHelp">' +
                '<button type="button" class="bk-chip" data-group="koreanHelp" data-id="needed" aria-pressed="false">' + t('book.koreanHelpNeeded') + '</button>' +
                '<button type="button" class="bk-chip" data-group="koreanHelp" data-id="any" aria-pressed="true">' + t('book.koreanHelpAny') + '</button>' +
              '</div>' +
            '</div>' +
          '</section>' +
          '<section class="bk-step" data-step="1">' +
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
              '<div id="partner-slots-container" class="bk-live-slots bk-chips"></div>' +
            '</div>' +
          '</section>' +
          '<section class="bk-step" data-step="2">' +
            '<div class="bk-group">' +
              '<p class="bk-label">' + t('book.partnerQuestion') + '</p>' +
              '<p class="bk-hint" id="bkPartnerHint"></p>' +
              '<div class="bk-partners" id="bkPartners"></div>' +
            '</div>' +
          '</section>' +
          '<section class="bk-step" data-step="3">' +
            '<div class="bk-group">' +
              '<p class="bk-label">' + t('book.purposeQuestion') + '</p>' +
              '<p class="bk-hint">' + t('book.purposeHint') + '</p>' +
              '<div class="bk-chips" id="bkPurposes">' + chipsMarkup(PURPOSES(), 'purpose') + '</div>' +
            '</div>' +
            '<div class="bk-group">' +
              '<p class="bk-label">' + ux('관심사', 'Interests') + '</p>' +
              '<p class="bk-hint">' + t('book.interestsHint') + '</p>' +
              '<div class="bk-chips" id="bkInterests">' + chipsMarkup(INTERESTS(), 'interest') + '</div>' +
            '</div>' +
            '<div class="bk-group">' +
              '<p class="bk-label">' + t('book.styleQuestion') + '</p>' +
              '<p class="bk-hint">' + ux('원하는 대화 분위기를 골라주세요.', 'Choose the conversation style you prefer.') + '</p>' +
              '<div class="bk-chips bk-chips--stack" id="bkStyles">' + chipsMarkup(STYLES(), 'style') + '</div>' +
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
    el.chatStyles = el.overlay.querySelector('#bkChatStyles');
    el.chatRequests = el.overlay.querySelector('#bkChatRequests');
    el.recent = el.overlay.querySelector('#bkRecent');
    updateKoreanVisibility();

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
    if (!el.chatStyles || !el.chatRequests || !api) return;
    el.chatStyles.innerHTML = comfortChipHtml(api.STYLE_IDS, 'chatStyle', api.styleLabel);
    el.chatRequests.innerHTML = comfortChipHtml(api.REQUEST_IDS, 'chatRequest', api.requestLabel);
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
      var matchingSlot = liveSlots.find(function (slot) {
        return String(slot.partner_id) === String(state.partner) && slotStartKey(slot.slot_time) === state.timeKey;
      });
      state.slotId = matchingSlot ? matchingSlot.id : null;
      state.selectedSlot = matchingSlot ? {
        id: matchingSlot.id,
        slot_time: matchingSlot.slot_time,
        partner: state.partner,
        date: state.date
      } : null;
      renderPartnerCards();
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
      state.timeKey = null;
      state.partner = null;
      state.slotId = null;
      state.selectedSlot = null;
      liveSlots = [];
      liveTimes = [];
      livePartners = [];
      renderCalendar();
      updateFooter();
      loadDateAvailability();
    });

    el.overlay.addEventListener('click', function (e) {
      var relax = e.target.closest('[data-relax-korean]');
      if (!relax) return;
      state.koreanHelp = 'any';
      resetAfterCriteriaChange(false);
      syncChips('koreanHelp');
      loadDateAvailability();
    });

    el.prevBtn.addEventListener('click', function () {
      if (recentSummary) { recentSummary = false; goTo(0); return; }
      goTo(STEP_ORDER[STEP_ORDER.indexOf(state.step) - 1]);
    });
    el.nextBtn.addEventListener('click', function () {
      if (recentSummary) {
        if (recentRequiredFields().length) return;
        recentSummary = false;
        state.step = 3;
        goTo(1);
        return;
      }
      if (state.step === 4) { confirmBooking(); return; }
      if (state.step === 0 && isStepReady(0)) {
        if (needsTicketTopup()) {
          routeToTicketTopup();
          return;
        }
      }
      goTo(STEP_ORDER[STEP_ORDER.indexOf(state.step) + 1]);
    });
  }

  function refreshOnLangChange() {
    var wasOpen = el.overlay.classList.contains('is-open');
    renderMarkup();
    ['language', 'koreanHelp', 'purpose', 'interest', 'style', 'time', 'chatStyle', 'chatRequest'].forEach(syncChips);
    el.slots.hidden = !state.date;
    renderCalendar();
    Array.prototype.forEach.call(el.steps, function (section, i) {
      section.classList.toggle('is-active', i === state.step);
    });
    if (state.step === 1 && state.date) loadDateAvailability();
    if (state.step === 2) renderAvailablePartners();
    if (state.step === 4) renderSummary();
    renderRecentSummary();
    renderProgress();
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
    } else if (group === 'interest') {
      var interestAt = state.interests.indexOf(id);
      if (interestAt > -1) state.interests.splice(interestAt, 1);
      else if (state.interests.length >= 4) {
        showToast(t('book.interestsMax'));
        return;
      } else state.interests.push(id);
    } else if (group === 'language') {
      if (!isActiveBookingLang(id)) return;
      if (state.language !== id) resetAfterCriteriaChange(false);
      state.language = id;
      if (id === 'ko') { state.koreanHelp = null; syncChips('koreanHelp'); }
    } else if (group === 'koreanHelp') {
      if (id !== 'needed' && id !== 'any') return;
      if (state.koreanHelp !== id) resetAfterCriteriaChange(false);
      state.koreanHelp = id;
    } else if (group === 'style') {
      state.style = id;
      if (id === 'encourage') { state.chatRequest = 'praise'; syncChips('chatRequest'); }
    } else if (group === 'time') {
      if (!ensureLoggedInForBooking()) return;
      var selectedTime = liveTimes.find(function (time) { return time.key === id; });
      if (!selectedTime) return;
      state.timeKey = selectedTime.key;
      state.time = selectedTime.label;
      state.partner = null;
      state.slotId = null;
      state.selectedSlot = null;
      derivePartnersForSelectedTime();
    } else if (group === 'chatStyle' || group === 'chatRequest') {
      state[group] = id;
      if (group === 'chatRequest' && id !== 'praise' && state.style === 'encourage') { state.style = null; syncChips('style'); }
      persistComfortPrefs(true);
    } else {
      return;
    }

    syncChips(group);
    updateKoreanVisibility();
    if (group === 'time') renderTimeChips();
    updateFooter();
  }

  function resetAfterCriteriaChange(clearDate) {
    availabilityLoadSeq += 1;
    calendarSeq += 1; calendarKey = ''; calendarRows = null;
    state.time = null;
    state.timeKey = null;
    state.partner = null;
    state.slotId = null;
    state.selectedSlot = null;
    liveSlots = [];
    liveTimes = [];
    livePartners = [];
    if (clearDate) state.date = null;
  }

  function persistComfortPrefs(clearFirst) {
    var api = prefsApi();
    if (!api) return;
    api.setPrefs({
      style: state.chatStyle,
      request: state.chatRequest
    }, { clearFirstUser: !!clearFirst });
    updateFirstTip();
  }

  function syncChips(group) {
    var chips = el.overlay.querySelectorAll('.bk-chip[data-group="' + group + '"]');
    Array.prototype.forEach.call(chips, function (chip) {
      var on = group === 'purpose' || group === 'interest'
        ? state[group === 'purpose' ? 'purposes' : 'interests'].indexOf(chip.dataset.id) > -1
        : group === 'time'
          ? state.timeKey === chip.dataset.id
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

  async function loadCalendarSlots(ids) {
    var rules = window.DayOAvailabilityCalendar, db = dbClient(), w = rules.windowDates();
    if (!ids.length) return [];
    var result = await db.rpc('get_booking_calendar_slots', { p_partner_ids: ids });
    if (!result.error) {
      if (!Array.isArray(result.data)) throw new Error('Invalid calendar response');
      return result.data;
    }
    if (!rules.missingRPC(result.error)) throw result.error;
    // During rollout use real existing slots, never synthetic weekly occurrences.
    var rows = [];
    for (var offset = 0; ; offset += 500) {
      var page = await db.from('availability_slots').select('id,partner_id,slot_time,status')
        .eq('status','available').in('partner_id',ids).gte('slot_time',w.start).lt('slot_time',rules.addDays(w.end,1))
        .order('id',{ascending:true}).range(offset,offset+499);
      if (page.error) throw page.error;
      rows.push.apply(rows,page.data||[]);
      if ((page.data||[]).length<500) return rows;
    }
  }

  async function refreshBookingCalendar() {
    var rules=window.DayOAvailabilityCalendar;
    if (!rules || !state.language || state.step!==1) return;
    var key=state.language+'|'+state.koreanHelp+'|'+rules.windowDates().start;
    if (calendarKey===key) return;
    calendarKey=key;calendarRows=null;calendarLoading=true;calendarError=false;
    var seq=++calendarSeq,language=state.language,help=state.koreanHelp;
    try {
      await ensureMatchingPartners();
      var ids=allPartners.filter(function(p){return partnerMatchesCriteria(p,language,help);}).map(function(p){return String(p.id);});
      var rows=await loadCalendarSlots(ids);
      if(seq!==calendarSeq||key!==calendarKey)return;
      calendarRows=rows.filter(function(s){var ms=rules.slotMs(s.slot_time);return s.status==='available'&&isFinite(ms)&&rules.inWindow(rules.dateAt(ms))&&isVisibleFutureThirtyMinuteConcreteSlot(s);});
    } catch(error) {if(seq===calendarSeq){calendarError=true;calendarRows=[];}}
    finally {if(seq===calendarSeq){calendarLoading=false;renderCalendar();}}
  }

  function renderCalendar() {
    var rules = window.DayOAvailabilityCalendar;
    var windowRange = rules && rules.windowDates();
    var today = windowRange ? new Date(windowRange.start+'T00:00:00') : startOfToday();
    if (state.step===1 && rules) refreshBookingCalendar();
    var first = new Date(state.viewYear, state.viewMonth, 1);
    var daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();
    var dow = weekdays();

    el.calTitle.textContent = window.DayOI18n ? window.DayOI18n.monthTitle(state.viewYear, state.viewMonth) : (state.viewYear + '년 ' + (state.viewMonth + 1) + '월');
    el.prevMonth.disabled = state.viewYear === today.getFullYear() && state.viewMonth === today.getMonth();

    if (windowRange) el.nextMonth.disabled = state.viewYear+'-'+String(state.viewMonth+1).padStart(2,'0') >= windowRange.end.slice(0,7);
    var cells = dow.map(function (d) {
      return '<span class="bk-cal-dow">' + d + '</span>';
    });

    for (var blank = 0; blank < first.getDay(); blank++) {
      cells.push('<span class="bk-day is-empty" aria-hidden="true"></span>');
    }

    for (var day = 1; day <= daysInMonth; day++) {
      var date = new Date(state.viewYear, state.viewMonth, day);
      var iso = toISO(date);
      var hasSlots = !rules || (calendarRows || []).some(function(s){return rules.dateAt(rules.slotMs(s.slot_time))===iso;});
      var selectable = date >= today && (!windowRange || iso<=windowRange.end) && hasSlots && !calendarLoading;
      var holiday = rules ? rules.holiday(iso, !window.DayOI18n || window.DayOI18n.getLang()==='KO') : '';
      cells.push(
        '<button type="button" class="bk-day' + (hasSlots ? ' has-open' : '') + (state.date === iso ? ' is-on' : '') + '"' +
        ' data-date="' + iso + '"' + (selectable ? '' : ' disabled') +
        ' aria-label="' + formatDate(iso) + (holiday ? ' · '+holiday : '') + '">' + day + (holiday ? '<span class="bk-holiday" aria-hidden="true">✦</span>' : '') + '</button>'
      );
    }

    el.calGrid.innerHTML = cells.join('');
    var calendarNote=el.calGrid.parentElement.querySelector('.bk-calendar-status');if(!calendarNote){calendarNote=document.createElement('p');calendarNote.className='bk-calendar-status';calendarNote.setAttribute('role','status');el.calGrid.after(calendarNote);}
    calendarNote.textContent=calendarLoading?ux('예약 가능 날짜 확인 중…','Checking available dates…'):calendarError?ux('날짜를 불러오지 못했어요. 다시 열어 주세요.','Could not load dates. Please reopen.'):calendarRows&&calendarRows.length===0?ux('선택한 조건에 맞는 예약 가능 시간이 없어요.','No available dates for these settings.'):ux('KST · 오늘 포함 30일','KST · 30 calendar days, including today');
    var dateDetail=el.calGrid.parentElement.querySelector('.bk-selected-date');if(!dateDetail){dateDetail=document.createElement('p');dateDetail.className='bk-selected-date';calendarNote.after(dateDetail);}
    var selectedHoliday=state.date&&rules?rules.holiday(state.date,!window.DayOI18n||window.DayOI18n.getLang()==='KO'):'';
    dateDetail.hidden=!state.date;
    dateDetail.textContent=state.date?formatDate(state.date)+(selectedHoliday?' · '+selectedHoliday+' · '+ux('공휴일','Public holiday'):'')+' · KST':'';
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
      if (list[i].id === id) return list[i].code ? list[i].code + ' ' + list[i].label : list[i].label;
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
    var id = row.id;
    if (!id) return null;
    var nickname = row.public_name_ready === true ? String(row.nickname || '').trim() : '';
    var name = (nickname && !/[@+]/.test(nickname) ? nickname : '') || 'DayO Partner';
    var initial = String(name).charAt(0).toUpperCase() || 'P';
    return {
      id: id,
      profileId: id,
      name: name,
      avatar_url: row.avatar_url || '',
      bio: row.bio || '',
      native_lang: row.native_lang || '',
      conversation_languages: canonicalBookingLanguages(row.conversation_languages),
      korean_support_level: typeof row.korean_support_level === 'string' ? row.korean_support_level : null,
      conversation_preferences: row.conversation_preferences || null,
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

  async function ensureMatchingPartners() {
    var key = currentUserId() + '|' + state.language + '|' + state.koreanHelp;
    if (partnersLoaded && partnerCriteriaKey === key) return allPartners;
    if (!partnerRequest || partnerRequestKey !== key) {
      partnerRequestKey = key;
      partnerRequest = loadAvailablePartners();
    }
    var pending = partnerRequest;
    try { return await pending; }
    finally { if (partnerRequest === pending) { partnerRequest = null; partnerRequestKey = null; } }
  }

  async function loadAvailablePartners() {
    var supabase = dbClient();
    var partners = [], seq = ++partnerLoadSeq, language = state.language, help = state.koreanHelp, owner = currentUserId();
    // Alpha keeps the chosen help value in the booking snapshot, not eligibility.
    var support = help === 'needed' && language !== 'ko' ? 'required' : 'any';
    if (!language || !support) return [];
    if (supabase) {
      var res = await supabase.rpc('list_matching_partner_profiles', {p_language: language, p_korean_support_preference: support});
      if (res.error) {
        console.error('파트너 로드 실패:', res.error);
        throw res.error;
      } else {
        partners = (res.data || []).map(normalizePartner);
      }
    }
    if (seq !== partnerLoadSeq || language !== state.language || help !== state.koreanHelp || owner !== currentUserId()) return [];
    partnerCriteriaKey = owner + '|' + language + '|' + help;
    allPartners = partners.filter(Boolean);
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

  function bookingSlotStartMs(slotTime) {
    var raw = String(slotTime || '').trim().replace(' ', 'T');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return NaN;
    var normalized = raw;
    if (/[+-]\d{2}$/.test(normalized)) normalized += ':00';
    else if (/[+-]\d{4}$/.test(normalized)) normalized = normalized.slice(0, -2) + ':' + normalized.slice(-2);
    else if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized)) normalized += '+09:00';
    return new Date(normalized).getTime();
  }

  function isFutureThirtyMinuteConcreteSlot(slot) {
    var raw = String(slot && slot.slot_time || '');
    if (raw.indexOf('weekly:') === 0) return false;
    var match = raw.match(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:(\d{2})/);
    if (!match || (match[1] !== '00' && match[1] !== '30')) return false;
    var startMs = bookingSlotStartMs(raw);
    return isBookableStart(startMs);
  }

  function isVisibleFutureThirtyMinuteConcreteSlot(slot) {
    var raw = String(slot && slot.slot_time || '');
    if (!slot || !slot.id || raw.indexOf('weekly:') === 0) return false;
    var match = raw.match(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:(\d{2})/);
    var startMs = bookingSlotStartMs(raw);
    return !!match && (match[1] === '00' || match[1] === '30') && isFinite(startMs) && startMs > Date.now();
  }

  async function fetchVisibleDateAvailability(isoDate, eligiblePartnerIds) {
    var rules = window.DayOAvailabilityCalendar;
    if (!rules) return fetchDateAvailability(isoDate, eligiblePartnerIds);
    if (!rules.inWindow(isoDate)) return [];
    var rows = await loadCalendarSlots(eligiblePartnerIds);
    return rows.filter(function (slot) {
      return slot.status === 'available' && eligiblePartnerIds.indexOf(String(slot.partner_id)) >= 0 &&
        isVisibleFutureThirtyMinuteConcreteSlot(slot) && rules.dateAt(rules.slotMs(slot.slot_time)) === isoDate;
    });
  }

  function supportsKoreanHelp(partner) {
    return partner && (partner.korean_support_level === 'conversational' || partner.korean_support_level === 'fluent');
  }

  function partnerMatchesCriteria(partner, language, koreanHelp) {
    if (!partner || !Array.isArray(partner.conversation_languages)) return false;
    // Public RPC supplies approved Partners with resolved canonical languages.
    return canonicalBookingLanguages(partner.conversation_languages).indexOf(language) !== -1;
  }

  function slotStartKey(slotTime) {
    var startMs = bookingSlotStartMs(slotTime);
    return isFinite(startMs) ? String(startMs) : '';
  }

  function buildUniqueTimes(slots) {
    var seen = {};
    return (slots || []).slice().sort(function (a, b) {
      return bookingSlotStartMs(a.slot_time) - bookingSlotStartMs(b.slot_time);
    }).reduce(function (times, slot) {
      var key = slotStartKey(slot.slot_time);
      if (!key || seen[key]) return times;
      seen[key] = true;
      times.push({ key: key, label: slotTimeLabel(slot.slot_time), slot_time: slot.slot_time });
      return times;
    }, []);
  }

  async function fetchDateAvailability(isoDate, eligiblePartnerIds) {
    if (window.DayOAvailabilityCalendar) {
      if (!window.DayOAvailabilityCalendar.inWindow(isoDate)) return [];
      var resolved=await loadCalendarSlots(eligiblePartnerIds);
      return resolved.filter(function(slot){var ms=window.DayOAvailabilityCalendar.slotMs(slot.slot_time);return slot.status==='available'&&isFinite(ms)&&window.DayOAvailabilityCalendar.dateAt(ms)===isoDate&&isFutureThirtyMinuteConcreteSlot(slot);});
    }
    var supabase = dbClient();
    if (!supabase || !isoDate || !eligiblePartnerIds.length) return [];

    try {
      var result = await supabase
        .from('availability_slots')
        .select('id, partner_id, slot_time, status')
        .eq('status', 'available')
        .in('partner_id', eligiblePartnerIds)
        .like('slot_time', isoDate + '%')
        .order('slot_time', { ascending: true });
      if (result.error) {
        console.warn('파트너 가용시간 로드 실패:', result.error);
        throw result.error;
      }
      var allowed = {};
      eligiblePartnerIds.forEach(function (id) { allowed[String(id)] = true; });
      return (result.data || []).filter(function (slot) {
        return slot.status === 'available' && allowed[String(slot.partner_id)] &&
          String(slot.slot_time || '').indexOf(isoDate) === 0 && isFutureThirtyMinuteConcreteSlot(slot);
      });
    } catch (err) {
      console.warn('파트너 가용시간 로드 실패:', err);
      throw err;
    }
  }

  async function loadDateAvailability() {
    var requestSeq = ++availabilityLoadSeq;
    var requestedDate = state.date;
    var requestedLanguage = state.language;
    var requestedKoreanHelp = state.koreanHelp;
    var container = el.slotBox || document.getElementById('partner-slots-container');
    if (!container) return [];
    if (!requestedDate || !isActiveBookingLang(requestedLanguage)) {
      liveSlots = [];
      liveTimes = [];
      return liveSlots;
    }

    partnersLoading = true;
    el.slots.hidden = false;
    container.innerHTML = '<div class="bk-slot-empty">' + t('book.slotsLoading') + '</div>';
    try {
      await ensureMatchingPartners();
      var eligiblePartnerIds = allPartners.filter(function (partner) {
        return partnerMatchesCriteria(partner, requestedLanguage, requestedKoreanHelp);
      }).map(function (partner) { return String(partner.id); });
      var visibleSlots = await fetchVisibleDateAvailability(requestedDate, eligiblePartnerIds);
      var slots = visibleSlots.filter(isFutureThirtyMinuteConcreteSlot);
      if (requestSeq !== availabilityLoadSeq || requestedDate !== state.date ||
          requestedLanguage !== state.language || requestedKoreanHelp !== state.koreanHelp) return [];
      liveSlots = slots;
      liveTimes = buildUniqueTimes(visibleSlots);
      if (state.timeKey && !slots.some(function (slot) { return slotStartKey(slot.slot_time) === state.timeKey; })) {
        state.time = null;
        state.timeKey = null;
        state.partner = null;
        state.slotId = null;
        state.selectedSlot = null;
      }
      derivePartnersForSelectedTime();
      partnersLoading = false;
      renderTimeChips();
      updateFooter();
      return liveSlots;
    } catch (err) {
      if (requestSeq === availabilityLoadSeq && requestedDate === state.date &&
          requestedLanguage === state.language && requestedKoreanHelp === state.koreanHelp) {
        partnersLoading = false;
        liveSlots = [];
        liveTimes = [];
        livePartners = [];
        container.innerHTML = '<div class="bk-slot-empty">' + t('book.slotsLoadError') + '</div>';
        updateFooter();
      }
      return [];
    }
  }

  function derivePartnersForSelectedTime() {
    if (!state.timeKey) {
      livePartners = [];
      return livePartners;
    }
    livePartners = rankPartners(partnersForTime(liveSlots, allPartners, state.timeKey), preferenceSnapshot().brief);
    if (state.partner && !livePartners.some(function (partner) { return String(partner.id) === String(state.partner); })) {
      state.partner = null;
      state.slotId = null;
      state.selectedSlot = null;
    }
    return livePartners;
  }

  function partnersForTime(slots, partners, timeKey) {
    var partnerIds = {};
    (slots || []).forEach(function (slot) {
      if (slotStartKey(slot.slot_time) === timeKey) partnerIds[String(slot.partner_id)] = true;
    });
    return (partners || []).filter(function (partner) { return !!partnerIds[String(partner.id)]; });
  }

  function matchingScore(partner, brief) {
    var value = partner && partner.conversation_preferences;
    var pref = value && value.schema_version === 1 ? value : {};
    function overlaps(values, available) { return (values || []).filter(function (id) { return Array.isArray(available) && available.indexOf(id) >= 0; }).length; }
    return overlaps(brief.purposes, pref.comfortable_purposes) * 3 +
      (Array.isArray(pref.conversation_styles) && pref.conversation_styles.indexOf(brief.conversation_style) >= 0 ? 2 : 0) +
      overlaps(brief.interests, pref.interests);
  }

  function rankPartners(partners, brief) {
    return partners.map(function (partner, index) { return {partner: partner, index: index, score: matchingScore(partner, brief)}; })
      .sort(function (a, b) { return b.score - a.score || a.index - b.index; })
      .map(function (item) { return item.partner; });
  }

  function renderTimeChips() {
    var container = el.slotBox || document.getElementById('partner-slots-container');
    if (!container) return;
    if (!liveTimes.length) {
      var message = t('book.noSlotsOnDate');
      var action = '';
      container.innerHTML = '<div class="bk-slot-empty">' + message + action + '</div>';
      updateFooter();
      return;
    }
    var restrictedCount = 0;
    container.innerHTML = liveTimes.map(function (time) {
      var disabled = !isBookableStart(Number(time.key));
      if (disabled) restrictedCount += 1;
      var on = !disabled && state.timeKey === time.key;
      return '<button type="button" class="bk-chip' + (on ? ' is-on' : '') + (disabled ? ' is-disabled' : '') +
        '" data-group="time" data-id="' + time.key +
        '" aria-pressed="' + (on ? 'true' : 'false') + '"' +
        (disabled ? ' disabled aria-disabled="true" title="' + ux('4시간 전까지 예약할 수 있어요.', 'Book at least 4 hours before the session.') + '"' : '') + '>' + time.label + '</button>';
    }).join('');
    if (restrictedCount) {
      var note = document.createElement('p');
      note.className = 'bk-slot-cutoff-note';
      note.style.cssText = 'grid-column:1/-1;flex-basis:100%;margin:6px 0 0;font-size:13px;line-height:1.5;overflow-wrap:anywhere';
      note.textContent = ux('4시간 전까지 예약할 수 있어요.', 'Book at least 4 hours before the session.');
      container.appendChild(note);
    }
    updateFooter();
  }

  function getPartner(id) {
    for (var i = 0; i < livePartners.length; i++) {
      if (livePartners[i].id === id) return livePartners[i];
    }
    return null;
  }

  function renderPartnerCards() {
    if (!el.partners) return;
    var language = labelOf(LANGUAGES, state.language);
    var dateLabel = state.date ? formatDate(state.date) : '';
    el.partnerHint.textContent = dateLabel && state.time
      ? t('book.partnerHintFormat', { date: dateLabel, time: state.time, language: language })
      : t('book.partnerQuestion');
    if (!livePartners.length) {
      el.partners.innerHTML = '<p class="bk-hint">' + t('book.partnerAvailabilityChanged') + '</p>';
      return;
    }
    el.partners.innerHTML = livePartners.map(function (partner) {
      var on = state.partner === partner.id;
      var badge = partner.isTest ? '<span class="bk-test-badge">🧪 상시 테스트 가능</span>' : '';
      var photo = window.DayOProfileImageURL && window.DayOProfileImageURL.resolve(partner.avatar_url);
      var avatar = photo ? '<img src="' + escapeHtml(photo) + '" alt="" onerror="this.hidden=true">' : '';
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
    derivePartnersForSelectedTime();
    renderPartnerCards();
    updateFooter();
  }

  function isStepReady(step) {
    if (step === 0) return isActiveBookingLang(state.language) && (state.language === 'ko' || state.koreanHelp === 'any' || state.koreanHelp === 'needed');
    if (step === 1) return !!(!partnersLoading && state.date && state.timeKey && liveTimes.some(function (time) { return time.key === state.timeKey; }));
    if (step === 2) return !!(
      !partnersLoading &&
      state.partner &&
      state.slotId &&
      state.selectedSlot &&
      state.selectedSlot.id === state.slotId &&
      state.selectedSlot.partner === state.partner &&
      state.selectedSlot.date === state.date &&
      isBookableStart(bookingSlotStartMs(state.selectedSlot.slot_time))
    );
    if (step === 3) return state.purposes.length > 0 && STYLE_IDS.indexOf(state.style) >= 0;
    return true;
  }

  function renderSummary() {
    var api = prefsApi();
    var purposeText = state.purposes.map(function (id) {
      return labelOf(PURPOSES, id);
    }).join(', ');
    var interestText = state.interests.map(function (id) {
      return labelOf(INTERESTS, id);
    }).join(', ');

    el.summary.innerHTML = '' +
      row(t('book.summaryLanguage'), labelOf(LANGUAGES, state.language)) +
      (state.language === 'ko' ? '' : row(t('book.summaryKoreanHelp'), koreanHelpLabel())) +
      row(t('book.summaryPurpose'), purposeText) +
      (interestText ? row(ux('관심사', 'Interests'), interestText) : '') +
      row(t('book.summaryStyle'), labelOf(STYLES, state.style)) +
      row(t('book.summaryDatetime'), formatDate(state.date) + ' · ' + (state.time || '')) +
      row(t('book.summaryPartner'), (getPartner(state.partner) || {}).name || '');
  }

  function row(term, value) {
    return '<div class="bk-row"><dt>' + term + '</dt><dd>' + value + '</dd></div>';
  }

  function goTo(step) {
    if (STEP_ORDER.indexOf(step) < 0) return;
    if (STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(state.step) && !isStepReady(state.step)) return;

    state.step = step;
    Array.prototype.forEach.call(el.steps, function (section, i) {
      section.classList.toggle('is-active', i === step);
    });
    if (step === 1) { renderCalendar(); if (state.date) loadDateAvailability(); }
    if (step === 2) renderAvailablePartners();
    if (step === 4) renderSummary();

    renderRecentSummary();
    renderProgress();
    el.overlay.querySelector('.bk-body').scrollTop = 0;
    updateFooter();
  }

  function updateFooter() {
    el.prevBtn.style.display = recentSummary || state.step !== 0 ? '' : 'none';
    el.prevBtn.textContent = recentSummary ? ux('수정하기', 'Edit') : t('book.prev');
    el.nextBtn.textContent = recentSummary ? ux('그대로 예약', 'Use these settings') : state.step === 4 ? t('book.confirm') : t('book.next');
    el.nextBtn.disabled = recentLoading || bookingSubmitting || (recentSummary ? recentRequiredFields().length > 0 : !isStepReady(state.step));
    el.prevBtn.disabled = recentLoading || bookingSubmitting;
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
    if (bookingSubmitting) return;
    if (!isStepReady(3)) {
      showToast(t('book.bookingWindowClosed'));
      return;
    }
    bookingSubmitting = true;
    persistComfortPrefs(true);
    settleConfirmedBooking().finally(function () {
      bookingSubmitting = false;
      updateFooter();
    });
  }

  async function settleConfirmedBooking() {
    if (el.nextBtn) el.nextBtn.disabled = true;
    // Copy preferences before any async confirmation work; previous booking snapshots stay immutable.
    var chosenPreferences = preferenceSnapshot();
    var learnerId = (window._dayoAuthUser && window._dayoAuthUser.id) || '';
    if (!learnerId && window.supabaseClient) {
      try {
        var authRes = await window.supabaseClient.auth.getUser();
        learnerId = authRes && authRes.data && authRes.data.user && authRes.data.user.id || '';
      } catch (e) { learnerId = ''; }
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

    if (!isBookableStart(bookingSlotStartMs(scheduledAt))) {
      if (el.nextBtn) el.nextBtn.disabled = !isStepReady(state.step);
      showToast(t('book.bookingWindowClosed'));
      return;
    }
    if (requiresNoRefundWarning(bookingSlotStartMs(scheduledAt))) {
      if (!window.DayOBookingWindow || !(await window.DayOBookingWindow.confirmNoRefund())) {
        goTo(1);
        return;
      }
    }
    if (!isBookableStart(bookingSlotStartMs(scheduledAt))) {
      if (el.nextBtn) el.nextBtn.disabled = !isStepReady(state.step);
      showToast(t('book.bookingWindowClosed'));
      goTo(1);
      return;
    }

    var bookingId = null;
    if (typeof window.createPendingBooking === 'function' && learnerId) {
      bookingId = await window.createPendingBooking({
        learner_id: learnerId,
        partner_id: partnerId,
        partner_user_id: partnerId,
        partner_name: partner.name || '',
        language: chosenPreferences.language || '',
        conversation_brief: chosenPreferences.brief,
        scheduled_at: scheduledAt,
        slot_id: selectedSlot.id
      });
    }

    var deducted = false;
    if (typeof window.handleConfirmBooking === 'function' && learnerId && bookingId) {
      deducted = await window.handleConfirmBooking(learnerId, bookingId, {
        slotId: selectedSlot.id,
        partnerId: partnerId
      });
    } else {
      alert('예약 처리 중 통신 오류가 발생했습니다.');
    }

    if (el.nextBtn) el.nextBtn.disabled = !isStepReady(state.step);
    if (!deducted) return;

    // No profile preference writes. This supplement expires with the browser session
    // and is reused only after the server confirms the same booking is still the latest.
    if (learnerId && bookingId) storageSet(RECENT_KEY + learnerId, JSON.stringify({
      bookingId: bookingId, koreanSupport: chosenPreferences.koreanSupport
    }));

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
      ownerId: currentUserId(),
      language: state.language,
      koreanHelp: state.koreanHelp,
      purposes: state.purposes.slice(),
      interests: state.interests.slice(),
      style: state.style,
      chatStyle: state.chatStyle,
      chatRequest: state.chatRequest,
      date: state.date,
      time: state.time,
      timeKey: state.timeKey,
      partner: state.partner,
      slotId: state.slotId,
      selectedSlot: state.selectedSlot,
      step: state.step
    }));
  }

  function loadDraft() {
    try {
      var raw = storageGet(DRAFT_KEY);
      var draft = raw ? JSON.parse(raw) : null;
      return draft && draft.ownerId && draft.ownerId === currentUserId() ? draft : null;
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
    state.koreanHelp = state.language === 'ko' ? null : draft.koreanHelp === 'needed' ? 'needed' : draft.koreanHelp === 'any' ? 'any' : null;
    state.purposes = Array.isArray(draft.purposes) ? draft.purposes.slice() : [];
    state.interests = Array.isArray(draft.interests) ? draft.interests.filter(function (id, index, all) {
      return INTEREST_IDS.indexOf(id) > -1 && all.indexOf(id) === index;
    }).slice(0, 4) : [];
    state.style = draft.style || null;
    if (draft.chatStyle) state.chatStyle = draft.chatStyle;
    if (draft.chatRequest) state.chatRequest = draft.chatRequest;
    state.date = draft.date || null;
    state.time = draft.time || null;
    state.timeKey = draft.timeKey || null;
    state.partner = draft.partner || null;
    state.slotId = draft.slotId || null;
    state.selectedSlot = draft.selectedSlot &&
      draft.selectedSlot.id === state.slotId &&
      draft.selectedSlot.partner === state.partner &&
      draft.selectedSlot.date === state.date &&
      slotStartKey(draft.selectedSlot.slot_time) === state.timeKey
      ? draft.selectedSlot
      : null;
    if (!state.selectedSlot) {
      state.time = null;
      state.timeKey = null;
      state.slotId = null;
    }
    if (state.date) {
      var parts = String(state.date).split('-');
      if (parts.length === 3) {
        state.viewYear = Number(parts[0]);
        state.viewMonth = Number(parts[1]) - 1;
      }
    }
    ['language', 'koreanHelp', 'purpose', 'interest', 'style', 'time', 'chatStyle', 'chatRequest'].forEach(syncChips);
    updateFirstTip();
    el.slots.hidden = !state.date;
    renderCalendar();
    updateKoreanVisibility();
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

  var pendingPostPrefill = null;

  function tryOpenPendingBooking() {
    if (!isLoggedIn() || !hasFlag(PENDING_OPEN_KEY)) return;
    if (welcomeOpen()) return;
    clearFlag(PENDING_OPEN_KEY);
    open();
  }

  function loadComfortIntoState() {
    var api = prefsApi();
    if (api) api.applyFirstUserPresetIfNeeded();
    var prefs = api ? api.getPrefs() : { style: 'casual', request: 'praise' };
    state.chatStyle = prefs.style;
    state.chatRequest = prefs.request;
  }

  function reset() {
    var today = startOfToday();
    state.language = null;
    state.koreanHelp = 'any';
    state.purposes = [];
    state.interests = [];
    state.style = null;
    state.date = null;
    state.time = null;
    state.timeKey = null;
    state.partner = null;
    state.slotId = null;
    state.selectedSlot = null;
    liveSlots = [];
    liveTimes = [];
    livePartners = [];
    var kstToday=window.DayOAvailabilityCalendar&&window.DayOAvailabilityCalendar.windowDates().start;
    state.viewYear = kstToday?Number(kstToday.slice(0,4)):today.getFullYear();
    state.viewMonth = kstToday?Number(kstToday.slice(5,7))-1:today.getMonth();
    loadComfortIntoState();

    ['language', 'koreanHelp', 'purpose', 'interest', 'style', 'time', 'chatStyle', 'chatRequest'].forEach(syncChips);
    updateFirstTip();
    el.slots.hidden = true;
    renderCalendar();
    updateKoreanVisibility();
    recentSummary = false;
    recentLoading = false;
    goTo(0);
  }

  function open(opts) {
    opts = opts || {};
    lastFocused = document.activeElement;
    ++recentSeq;
    ++calendarSeq;calendarKey='';calendarRows=null;calendarLoading=false;calendarError=false;
    if(window.DayOAvailabilityCalendar){var initial=window.DayOAvailabilityCalendar.windowDates().start.split('-');state.viewYear=Number(initial[0]);state.viewMonth=Number(initial[1])-1;}
    bookingOwner = currentUserId();
    ++partnerLoadSeq; partnersLoaded = false; partnerCriteriaKey = null; partnerRequest = null; partnerRequestKey = null;
    reset();
    var draft = loadDraft();
    if (draft) applyDraft(draft);
    var postPrefill = opts.conversationPost || pendingPostPrefill;
    if (postPrefill) {
      state.interests = uniqueKeys(postPrefill.interests, INTEREST_IDS, 4);
      state.purposes = uniqueKeys(postPrefill.purposes, PURPOSE_IDS, 4);
      state.date = state.time = state.timeKey = state.partner = state.slotId = state.selectedSlot = null;
      syncChips('interest'); syncChips('purpose'); goTo(0);
      pendingPostPrefill = null;
    }
    if (opts.resume && !postPrefill && getTicketCount() > 0 && state.step === 0 && isStepReady(0)) {
      goTo(3);
    }
    el.overlay.classList.add('is-open');
    if (window.DayOScrollLock) window.DayOScrollLock.lock();
    else document.body.style.overflow = 'hidden';
    el.modal.querySelector('.bk-close').focus();
    if (!draft && !postPrefill) loadRecentPreferences();
  }

  function requestOpen() {
    if (!checkUserLoggedIn()) {
      openLoginForBooking();
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
    ++recentSeq;
    ++calendarSeq;calendarKey='';
    recentLoading = false;
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
    var postKey = new URLSearchParams(window.location.search).get('post');
    if (postKey && window.DayOConversationPosts) {
      window.DayOConversationPosts.read(postKey).then(function(post) {
        if (post) pendingPostPrefill = window.DayOConversationPosts.prefill(post);
        requestOpen();
      }).catch(function(){ requestOpen(); });
      return;
    }
    requestOpen();
    if (fromQuery && window.history && window.history.replaceState) {
      var clean = window.location.search.replace(/([?&])booking=open(&|$)/, '$1').replace(/[?&]$/, '');
      window.history.replaceState({}, '', window.location.pathname + clean + window.location.hash);
    }
  }

  function init() {
    loadPhotoResolver().then(function(){if(livePartners.length)renderPartnerCards();});
    mount();
    document.addEventListener('click', function (e) {
      var trigger = findBookingTrigger(e.target);
      if (!trigger) return;
      e.preventDefault();
      e.stopPropagation();
      requestOpen();
    });
    document.addEventListener('dayo:langchange', refreshOnLangChange);
    // Re-read concrete availability when returning from another tab/window.
    // The existing date loader clears any selected slot that is no longer open.
    function refreshVisibleCalendar() {
      if(document.visibilityState==='hidden'||!el.overlay.classList.contains('is-open')||state.step!==1)return;
      calendarKey=null;renderCalendar();if(state.date)loadDateAvailability();
    }
    document.addEventListener('dayo:availabilitychanged',refreshVisibleCalendar);
    document.addEventListener('visibilitychange',refreshVisibleCalendar);
    window.addEventListener('focus',refreshVisibleCalendar);
    document.addEventListener('dayo:authchange', function (e) {
      if (el.overlay.classList.contains('is-open') && (!e.detail || !e.detail.loggedIn || bookingOwner !== currentUserId())) close();
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
    openFromQuery();
    if (isLoggedIn()) tryOpenPendingBooking();
  }

  if (window.__DAYO_SMART_BOOKING_TEST__) {
    window.__DAYO_SMART_BOOKING_TEST__.api = {
      canonicalBookingLanguages: canonicalBookingLanguages,
      normalizePartner: normalizePartner,
      ensureMatchingPartners: ensureMatchingPartners,
      matchingScore: matchingScore,
      rankPartners: rankPartners,
      partnerMatchesCriteria: partnerMatchesCriteria,
      buildUniqueTimes: buildUniqueTimes,
      partnersForTime: partnersForTime,
      isFutureThirtyMinuteConcreteSlot: isFutureThirtyMinuteConcreteSlot,
      isBookableStart: isBookableStart,
      requiresNoRefundWarning: requiresNoRefundWarning,
      slotStartKey: slotStartKey,
      preferencesFromBooking: preferencesFromBooking,
      resolveRecentPreferences: resolveRecentPreferences,
      recentRequiredFields: recentRequiredFields,
      canonicalStyle: canonicalStyle,
      preferenceSnapshot: preferenceSnapshot,
      readRecentBooking: readRecentBooking,
      loadCalendarSlots: loadCalendarSlots,
      fetchDateAvailability: fetchDateAvailability,
      fetchVisibleDateAvailability: fetchVisibleDateAvailability,
      isVisibleFutureThirtyMinuteConcreteSlot: isVisibleFutureThirtyMinuteConcreteSlot,
      stepOrder: STEP_ORDER.slice(),
      state: state,
      isStepReady: isStepReady
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
