/* DayO partner availability slots + learner slot booking */
(function () {
  'use strict';

  var DAY_IDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var DAY_LABELS = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };
  var DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  var WEEKS_AHEAD = 6;
  var BOOKING_MIN_LEAD_MS = 4 * 60 * 60 * 1000;
  var REFUND_CUTOFF_MS = 6 * 60 * 60 * 1000;
  var bookingWarningPromise = null;
  var legacyBookingSubmitting = false;

  function t(key, vars) {
    if (!window.DayOI18n) return key;
    return vars ? window.DayOI18n.tf(key, vars) : window.DayOI18n.t(key);
  }

  // This confirmation dialog must remain readable if i18n is missing or stale.
  var BOOKING_WINDOW_COPY = {
    'book.nonRefundWarningTitle': { KO: '예약 취소 규정을 확인해 주세요', EN: 'Please check the cancellation policy' },
    'book.nonRefundWarningBody': { KO: '이 예약은 시작 6시간 이내입니다.\n지금 예약하면 이후 취소 시 사용한 티켓은 반환되지 않습니다.\n계속 예약할까요?', EN: 'This session starts within 6 hours.\nIf you book now and cancel later, your ticket will not be returned.\nWould you like to continue?' },
    'book.nonRefundWarningBack': { KO: '다시 확인하기', EN: 'Go back' },
    'book.nonRefundWarningConfirm': { KO: '확인하고 예약하기', EN: 'Confirm booking' },
    'book.nonRefundWarningClose': { KO: '닫기', EN: 'Close' },
    'book.regularConfirmTitle': { KO: '이 시간으로 예약할까요?', EN: 'Book this time?' },
    'book.regularConfirmBody': { KO: '티켓 1장을 사용해 이 시간으로 예약합니다.', EN: 'Use one ticket to book this time.' },
    'book.regularConfirmConfirm': { KO: '예약하기', EN: 'Book now' },
    'book.regularConfirmBack': { KO: '다른 시간 보기', EN: 'Choose another time' }
  };

  function bookingWindowText(key) {
    var text;
    try { text = t(key); } catch (e) { /* use the dialog's local copy */ }
    if (typeof text === 'string' && text.trim() && text !== key) return text;
    var lang = window.DayOI18n && typeof window.DayOI18n.getLang === 'function'
      ? window.DayOI18n.getLang() : (/^en/i.test(document.documentElement.lang) ? 'EN' : 'KO');
    return BOOKING_WINDOW_COPY[key][lang === 'KO' ? 'KO' : 'EN'];
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

  function isBookableStart(startMs, nowMs) {
    return isFinite(startMs) && startMs > nowMs &&
      (canBypassBookingLeadTime() || startMs - nowMs >= BOOKING_MIN_LEAD_MS);
  }

  function confirmBookingWindow(kind) {
    if (bookingWarningPromise) return bookingWarningPromise;
    var regular = kind === 'regular';
    bookingWarningPromise = new Promise(function (resolve) {
      var previousFocus = document.activeElement;
      var overlay = document.createElement('div');
      overlay.className = 'dayo-booking-window-overlay';
      overlay.innerHTML = '<div class="dayo-booking-window-dialog" role="dialog" aria-modal="true" aria-labelledby="dayo-booking-window-title" aria-describedby="dayo-booking-window-body">' +
        '<button type="button" class="dayo-booking-window-close" data-action="cancel" aria-label="Close">×</button>' +
        '<h2 id="dayo-booking-window-title"></h2><p id="dayo-booking-window-body"></p>' +
        '<div class="dayo-booking-window-actions"><button type="button" class="dayo-booking-window-back" data-action="cancel"></button>' +
        '<button type="button" class="dayo-booking-window-confirm" data-action="confirm"></button></div></div>';
      if (!document.getElementById('dayo-booking-window-style')) {
        var style = document.createElement('style');
        style.id = 'dayo-booking-window-style';
        style.textContent = '.dayo-booking-window-overlay{position:fixed;inset:0;z-index:980;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(70,52,48,.48);box-sizing:border-box}' +
          '.dayo-booking-window-dialog{position:relative;width:min(100%,440px);padding:28px;border:1px solid #ffe8e3;border-radius:22px;background:#fffcfa;box-shadow:0 24px 64px rgba(70,52,48,.2);color:#5c4a42;box-sizing:border-box}' +
          '.dayo-booking-window-dialog h2{margin:0 32px 12px 0;font-size:1.18rem;line-height:1.4}' +
          '.dayo-booking-window-dialog p{margin:0 0 24px;font-size:.9rem;line-height:1.6;white-space:pre-line}' +
          '.dayo-booking-window-close{position:absolute;top:12px;right:14px;border:0;background:none;font-size:1.5rem;color:#9a8580;cursor:pointer}' +
          '.dayo-booking-window-actions{display:flex;gap:10px}.dayo-booking-window-actions button{flex:1;min-height:44px;padding:10px;border-radius:12px;font:inherit;font-weight:700;cursor:pointer}' +
          '.dayo-booking-window-back{border:1px solid #ffe8e3;background:#fff8f5;color:#5c4a42}' +
          '.dayo-booking-window-confirm{border:0;background:#ff6b57;color:#fff}' +
          '@media(max-width:480px){.dayo-booking-window-dialog{padding:24px 20px}.dayo-booking-window-actions{flex-direction:column-reverse}}';
        document.head.appendChild(style);
      }
      function render() {
        overlay.querySelector('#dayo-booking-window-title').textContent = bookingWindowText(regular ? 'book.regularConfirmTitle' : 'book.nonRefundWarningTitle');
        overlay.querySelector('#dayo-booking-window-body').textContent = bookingWindowText(regular ? 'book.regularConfirmBody' : 'book.nonRefundWarningBody');
        overlay.querySelector('.dayo-booking-window-confirm').textContent = bookingWindowText(regular ? 'book.regularConfirmConfirm' : 'book.nonRefundWarningConfirm');
        overlay.querySelector('.dayo-booking-window-back').textContent = bookingWindowText(regular ? 'book.regularConfirmBack' : 'book.nonRefundWarningBack');
        overlay.querySelector('.dayo-booking-window-close').setAttribute('aria-label', bookingWindowText('book.nonRefundWarningClose'));
      }
      function finish(confirmed) {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('dayo:langchange', render);
        overlay.remove();
        if (window.DayOScrollLock) window.DayOScrollLock.unlock();
        if (previousFocus && previousFocus.focus) previousFocus.focus();
        bookingWarningPromise = null;
        resolve(confirmed);
      }
      function onKey(event) {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        finish(false);
      }
      overlay.addEventListener('click', function (event) {
        var action = event.target.closest('[data-action]');
        if (action) finish(action.dataset.action === 'confirm');
        else if (event.target === overlay) finish(false);
      });
      render();
      document.body.appendChild(overlay);
      if (window.DayOScrollLock) window.DayOScrollLock.lock();
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('dayo:langchange', render);
      overlay.querySelector('.dayo-booking-window-confirm').focus();
    });
    return bookingWarningPromise;
  }

  window.DayOBookingWindow = {
    isInternalTest: isInternalBookingTest,
    isBookableStart: isBookableStart,
    confirmNoRefund: function () { return confirmBookingWindow('late'); },
    confirmRegular: function () { return confirmBookingWindow('regular'); }
  };

  function displayLocale() {
    return window.DayOI18n && window.DayOI18n.getLang() === 'KO' ? 'ko-KR' : 'en-US';
  }

  function client() {
    return window.supabaseClient || null;
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function toIsoDate(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function weekdayIdFromDate(isoDate) {
    var parts = String(isoDate || '').split('-');
    if (parts.length < 3) return '';
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var map = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    return map[date.getDay()] || '';
  }

  function upcomingDatesForDay(dayId, weeksAhead) {
    var target = DAY_INDEX[dayId];
    var dates = [];
    if (target == null) return dates;
    var start = new Date();
    start.setHours(0, 0, 0, 0);
    var i;
    for (i = 0; i < 7 * (weeksAhead + 1); i += 1) {
      var cur = new Date(start.getTime() + i * 86400000);
      if (cur.getDay() === target) dates.push(toIsoDate(cur));
      if (dates.length >= weeksAhead) break;
    }
    return dates;
  }

  function formatSlotLabel(slotTime) {
    var raw = String(slotTime || '');
    if (raw.indexOf('weekly:') === 0) {
      var weekly = raw.slice(7).split('|');
      return t('partner.day.' + weekly[0]) + ' ' + (weekly[1] || '');
    }
    var match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/);
    if (match) return new Intl.DateTimeFormat(displayLocale(), { month: 'numeric', day: 'numeric' })
      .format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) + ' ' + match[4];
    return raw;
  }

  function isThirtyMinuteStart(value) {
    return /^(?:0\d|1\d|2[0-3]):(?:00|30)$/.test(String(value || ''));
  }

  function parseDatedSlotStart(value) {
    var raw = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw)) return null;
    var normalized = raw.replace(' ', 'T');
    if (/[+-]\d{2}$/.test(normalized)) normalized += ':00';
    else if (/[+-]\d{4}$/.test(normalized)) {
      normalized = normalized.slice(0, -2) + ':' + normalized.slice(-2);
    }
    var parsed = new Date(normalized);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  function isThirtyMinuteDatedSlot(value) {
    var match = String(value || '').match(/^\d{4}-\d{2}-\d{2}[T ](\d{2}:\d{2})/);
    return !!match && isThirtyMinuteStart(match[1]);
  }

  function bookingSlotStartMs(value) {
    var raw = String(value || '').trim().replace(' ', 'T');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return NaN;
    if (/[+-]\d{2}$/.test(raw)) raw += ':00';
    else if (/[+-]\d{4}$/.test(raw)) raw = raw.slice(0, -2) + ':' + raw.slice(-2);
    else if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) raw += '+09:00';
    return new Date(raw).getTime();
  }

  function isFutureBookableDatedSlot(value, nowMs) {
    var startMs = bookingSlotStartMs(value);
    return isThirtyMinuteDatedSlot(value) && isBookableStart(startMs, nowMs);
  }

  function materializationDateSet() {
    var dates = {};
    DAY_IDS.forEach(function (dayId) {
      upcomingDatesForDay(dayId, WEEKS_AHEAD).forEach(function (isoDate) {
        dates[isoDate] = true;
      });
    });
    return dates;
  }

  async function deleteAvailableSlotIds(supabase, ids) {
    for (var i = 0; i < ids.length; i += 100) {
      var result = await supabase.from('availability_slots').delete().in('id', ids.slice(i, i + 100));
      if (result.error) throw result.error;
    }
  }

  async function fetchPartnerAvailabilityRows(supabase, partnerId, columns) {
    var rows = [];
    for (var offset = 0; ; offset += 500) {
      var result = await supabase.from('availability_slots')
        .select(columns)
        .eq('partner_id', partnerId)
        .order('id', { ascending: true })
        .range(offset, offset + 499);
      if (result.error) throw result.error;
      var page = result.data || [];
      rows.push.apply(rows, page);
      if (page.length < 500) return rows;
    }
  }

  function formatBookingTime(value) {
    if (!value) return t('partner.sessions.timeUnknown');
    var date = new Date(value);
    if (isNaN(date.getTime())) return t('partner.sessions.timeUnknown');
    return new Intl.DateTimeFormat(displayLocale(), {
      timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
  }

  function formatUpcomingDay(start, shortDate) {
    if (toIsoDate(start) === toIsoDate(new Date())) return t('partner.upcoming.today');
    return new Intl.DateTimeFormat(displayLocale(), {
      month: shortDate ? 'numeric' : 'long', day: 'numeric', weekday: 'short'
    }).format(start);
  }

  var partnerHeroTimer = null;
  var partnerHeroRequest = 0;
  var partnerBriefCache = new Map();
  var partnerBriefUserId = '';
  var partnerPrepTimer = null;
  var partnerPrepOpenTimer = null;
  var partnerPrepCloseTimer = null;
  var partnerPrepRequest = 0;
  var partnerPrepRender = null;
  var lastPartnerBookingView = null;

  function getPartnerBookingBrief(supabase, bookingId) {
    if (!partnerBriefCache.has(bookingId)) {
      var pending = Promise.resolve(supabase.rpc('get_partner_booking_brief', { p_booking_id: bookingId }))
        .then(function (result) {
          if (result.error) throw result.error;
          return result.data;
        }).catch(function (error) {
          partnerBriefCache.delete(bookingId);
          throw error;
        });
      partnerBriefCache.set(bookingId, pending);
    }
    return partnerBriefCache.get(bookingId);
  }

  function bookingOptionLabel(prefix, id, allowed) {
    if (allowed.indexOf(id) < 0 || !window.DayOI18n) return '';
    var key = prefix + id;
    var label = window.DayOI18n.t(key);
    return label && label !== key ? label : '';
  }

  function partnerBriefLabels(data) {
    var display = String((data && data.learner_display_name) || '').trim();
    if (!display || /[@+]/.test(display) || /(?:\d[\s().-]*){7,}/.test(display) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(display)) display = t('partner.upcoming.userFallback');
    var languageId = data && data.language;
    var language = bookingOptionLabel('book.lang.', languageId, ['en', 'es', 'fr', 'ko', 'ja', 'zh', 'vi', 'de', 'it', 'ru']);
    var brief = data && data.conversation_brief;
    if (!brief || typeof brief !== 'object' || Array.isArray(brief)) brief = {};
    var purposeLabels = Array.isArray(brief.purposes) ? brief.purposes.map(function (id) {
      if (id === 'work_school') return !window.DayOI18n || window.DayOI18n.getLang() === 'KO' ? '일 · 학교 생활' : 'Work & school life';
      return bookingOptionLabel('book.purpose.', id, ['travel', 'opic', 'abroad', 'casual']);
    }).filter(Boolean) : [];
    var purposes = purposeLabels.join(' · ');
    var interestLabels = Array.isArray(brief.interests) ? brief.interests.map(function (id) {
      return bookingOptionLabel('book.interest.', id, [
        'drama', 'movies', 'youtube', 'music', 'travel', 'food_cafe',
        'exercise', 'games', 'fashion_beauty', 'pets', 'books_webtoon', 'work_school'
      ]);
    }).filter(Boolean) : [];
    var interests = interestLabels.join(' · ');
    var values = {
      purposes: purposes,
      interests: interests,
      chat_style: brief.schema_version === 1
        ? (brief.conversation_style === 'encourage' ? t('partner.prep.encourage')
          : bookingOptionLabel('book.style.', brief.conversation_style, ['slow', 'fast', 'correct']))
        : bookingOptionLabel('chatPrefs.style.', brief.chat_style, ['casual', 'correct', 'interview']),
      chat_request: bookingOptionLabel('chatPrefs.request.', brief.chat_request, ['praise', 'gentle', 'encourage']),
      partner_preference: brief.schema_version === 1 ? '' : bookingOptionLabel('book.style.', brief.partner_preference, ['slow', 'fast', 'correct', 'korean']),
      korean_support_preference: brief.schema_version === 1
        ? (brief.korean_support_preference === 'required' ? t('partner.prep.helpRequired')
          : brief.korean_support_preference === 'any' ? t('partner.prep.helpAny') : '')
        : ''
    };
    return { display: display, language: language, languageId: languageId, values: values,
      chips: { purposes: purposeLabels, interests: interestLabels, chat_style: values.chat_style ? [values.chat_style] : [] } };
  }

  function renderBriefRows(briefView, values, chips) {
    if (!briefView) return;
    var visible = false;
    Object.keys(values).forEach(function (key) {
      var row = briefView.querySelector('[data-brief-field="' + key + '"]');
      if (!row && key === 'korean_support_preference' && values[key]) {
        var list = briefView.querySelector('dl');
        if (list) {
          row = document.createElement('div'); row.className = 'partner-upcoming-hero-detail';
          row.setAttribute('data-brief-field', key);
          var label = document.createElement('dt');
          label.textContent = !window.DayOI18n || window.DayOI18n.getLang() === 'KO' ? '한국어 도움 선호' : 'Korean support preference';
          row.append(label, document.createElement('dd')); list.append(row);
        }
      }
      if (!row) return;
      row.hidden = !values[key];
      var content = row.querySelector('dd');
      content.replaceChildren();
      if (values[key]) {
        if (chips && chips[key]) {
          chips[key].forEach(function (text) {
            var chip = document.createElement('span');
            chip.className = 'booking-prep-chip'; chip.textContent = text;
            content.appendChild(chip);
          });
        } else content.textContent = values[key];
        visible = true;
      }
    });
    briefView.hidden = !visible;
  }

  function closePartnerBookingPrep() {
    var modal = document.getElementById('bookingPrepModal');
    if (!modal || !modal.classList.contains('is-open')) return;
    modal.classList.remove('is-open');
    partnerPrepRequest += 1;
    if (partnerPrepTimer) clearInterval(partnerPrepTimer);
    partnerPrepTimer = null;
    if (partnerPrepOpenTimer) clearTimeout(partnerPrepOpenTimer);
    if (partnerPrepCloseTimer) clearTimeout(partnerPrepCloseTimer);
    partnerPrepOpenTimer = null;
    partnerPrepCloseTimer = null;
    partnerPrepRender = null;
    if (window.DayOScrollLock) window.DayOScrollLock.unlock();
    else document.body.style.overflow = '';
  }

  function openPartnerBookingPrep(booking, supabase) {
    var modal = document.getElementById('bookingPrepModal');
    var enter = document.getElementById('booking-prep-enter');
    if (!modal || !enter) return;
    closePartnerBookingPrep();
    var request = ++partnerPrepRequest;
    var start = new Date(booking.scheduled_at);
    var name = document.getElementById('booking-prep-name');
    var briefView = document.getElementById('booking-prep-brief');
    var briefData = null;
    var briefState = 'loading';
    function renderPrep() {
      document.getElementById('booking-prep-time').textContent = formatUpcomingDay(start, false) + ' ' + pad(start.getHours()) + ':' + pad(start.getMinutes());
      var labels = partnerBriefLabels(briefData || { language: booking.language });
      name.textContent = t(labels.language ? 'partner.upcoming.conversationFormat' : 'partner.upcoming.conversationNoLanguage', {
        name: labels.display, language: labels.language
      });
      renderBriefRows(briefView, labels.values, labels.chips);
      var emptyBrief = document.getElementById('booking-prep-empty');
      if (emptyBrief) {
        emptyBrief.hidden = briefView && !briefView.hidden;
        emptyBrief.textContent = t('partner.prep.' + briefState);
      }
      updateEntry();
    }
    function updateEntry() {
      var now = Date.now();
      var canEnter = now >= start.getTime() - 5 * 60000 && now < start.getTime() + 30 * 60000;
      enter.disabled = !canEnter;
      enter.textContent = t(canEnter ? 'partner.upcoming.enter' :
        now >= start.getTime() + 30 * 60000 ? 'partner.upcoming.enterClosed' : 'partner.upcoming.enterEarly');
    }
    enter.onclick = function () {
      var now = Date.now();
      updateEntry();
      if (now >= start.getTime() - 5 * 60000 && now < start.getTime() + 30 * 60000) {
        window.location.href = 'room.html?bookingId=' + encodeURIComponent(booking.id);
      }
    };
    partnerPrepRender = renderPrep;
    renderPrep();
    partnerPrepTimer = setInterval(updateEntry, 1000);
    var untilOpen = start.getTime() - 5 * 60000 - Date.now();
    var untilClose = start.getTime() + 30 * 60000 - Date.now();
    if (untilOpen > 0) partnerPrepOpenTimer = setTimeout(updateEntry, untilOpen);
    if (untilClose > 0) partnerPrepCloseTimer = setTimeout(updateEntry, untilClose);
    modal.classList.add('is-open');
    if (window.DayOScrollLock) window.DayOScrollLock.lock();
    else document.body.style.overflow = 'hidden';
    var close = modal.querySelector('[data-close-modal]');
    if (close) close.focus();
    getPartnerBookingBrief(supabase, booking.id).then(function (data) {
      if (request !== partnerPrepRequest) return;
      briefData = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
      briefState = 'empty';
      renderPrep();
    }).catch(function (error) {
      if (request === partnerPrepRequest) {
        briefState = 'unavailable';
        renderPrep();
        console.warn('[DayO] booking brief unavailable', error);
      }
    });
  }

  var partnerPrepModal = document.getElementById('bookingPrepModal');
  if (partnerPrepModal) {
    partnerPrepModal.addEventListener('click', function (event) {
      if (event.target === partnerPrepModal || event.target.closest('[data-close-modal]')) closePartnerBookingPrep();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closePartnerBookingPrep();
    });
  }

  function closePartnerUpcomingAll() {
    var modal = document.getElementById('partnerUpcomingAllModal');
    if (!modal || !modal.classList.contains('is-open')) return;
    modal.classList.remove('is-open');
    if (window.DayOScrollLock) window.DayOScrollLock.unlock();
    else document.body.style.overflow = '';
  }

  var partnerUpcomingAllModal = document.getElementById('partnerUpcomingAllModal');
  if (partnerUpcomingAllModal) {
    partnerUpcomingAllModal.addEventListener('click', function (event) {
      if (event.target === partnerUpcomingAllModal || event.target.closest('[data-close-modal]')) closePartnerUpcomingAll();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closePartnerUpcomingAll();
    });
  }

  // Load the separate Partner cancellation UI only when requested.
  var partnerCancellationLoader = null;
  function openPartnerCancellation(booking, supabase) {
    if (window.DayOPartnerCancellation) return window.DayOPartnerCancellation.open(booking, supabase);
    if (!partnerCancellationLoader) {
      partnerCancellationLoader = new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = '/partner-booking-cancellation.js';
        script.onload = function () { resolve(); };
        script.onerror = function () { script.remove(); partnerCancellationLoader = null; reject(new Error('unavailable')); };
        document.head.appendChild(script);
      });
    }
    return partnerCancellationLoader.then(function () {
      if (!window.DayOPartnerCancellation) throw new Error('unavailable');
      return window.DayOPartnerCancellation.open(booking, supabase);
    });
  }

  function renderPartnerUpcomingList(rows, supabase, failed) {
    var list = document.getElementById('partner-upcoming-list');
    var allList = document.getElementById('partner-upcoming-all-list');
    var empty = document.getElementById('partner-upcoming-empty');
    var count = document.getElementById('partner-upcoming-count');
    if (!list || !allList || !empty || !count) return;
    partnerHeroRequest += 1;
    var request = partnerHeroRequest;
    if (partnerHeroTimer) clearInterval(partnerHeroTimer);
    partnerHeroTimer = null;
    var upcoming = (rows || []).filter(function (row) {
      var at = new Date(row.scheduled_at).getTime();
      return row.status === 'confirmed' && Number.isFinite(at) && at + 30 * 60000 > Date.now();
    }).sort(function (a, b) {
      return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
    });
    list.replaceChildren();
    allList.replaceChildren();
    count.textContent = upcoming.length ? t(upcoming.length === 1 ? 'partner.upcoming.countOne' : 'partner.upcoming.countFormat', { count: upcoming.length }) : '';
    empty.hidden = upcoming.length > 0;
    empty.textContent = t(failed ? 'partner.upcoming.loadError' : 'partner.upcoming.empty');
    if (!upcoming.length) return;

    function appendCard(booking, index, target, fullList) {
      var start = new Date(booking.scheduled_at);
      var row = document.createElement('article');
      row.className = 'partner-upcoming-row' + (index === 0 ? ' is-next' : '');
      var kind = document.createElement('span');
      kind.className = 'partner-upcoming-kind';
      kind.textContent = t(index === 0 ? 'partner.upcoming.next' : 'partner.upcoming.label');
      var main = document.createElement('button');
      main.type = 'button';
      main.className = 'partner-upcoming-main';
      var when = document.createElement('span');
      when.className = 'partner-upcoming-when';
      var day = document.createElement('span');
      day.className = 'partner-upcoming-day';
      day.textContent = formatUpcomingDay(start, true);
      var time = document.createElement('strong');
      time.className = 'partner-upcoming-time';
      time.textContent = pad(start.getHours()) + ':' + pad(start.getMinutes());
      when.append(day, time);
      var person = document.createElement('span');
      person.className = 'partner-upcoming-person';
      var name = document.createElement('span');
      name.className = 'partner-upcoming-name';
      main.setAttribute('aria-label', 'View conversation brief');
      name.textContent = t('partner.upcoming.nameFormat', { name: t('partner.upcoming.userFallback') });
      var language = document.createElement('span');
      language.className = 'partner-upcoming-meta';
      var bookingLanguage = bookingOptionLabel('book.lang.', booking.language, ['en', 'es', 'fr', 'ko', 'ja', 'zh', 'vi', 'de', 'it', 'ru']);
      language.textContent = bookingLanguage ? t('partner.upcoming.languageFormat', { language: bookingLanguage }) : '';
      var summary = document.createElement('span');
      summary.className = 'partner-upcoming-summary';
      summary.hidden = true;
      person.append(name, language, summary);
      main.append(when, person);
      var side = document.createElement('div');
      side.className = 'partner-upcoming-side';
      var prepare = document.createElement('button');
      prepare.type = 'button';
      prepare.className = 'partner-upcoming-prepare';
      prepare.textContent = t(index === 0 || fullList ? 'partner.upcoming.prepare' : 'partner.upcoming.prepareShort');
      side.appendChild(prepare);
      if (booking.status === 'confirmed' && booking.partner_user_id === partnerBriefUserId && start.getTime() > Date.now()) {
        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'partner-booking-cancel';
        if (!document.getElementById('partner-cancellation-button-style')) {
          var cancelStyle = document.createElement('style');
          cancelStyle.id = 'partner-cancellation-button-style';
          cancelStyle.textContent = '.partner-booking-cancel{display:block;margin-top:6px;background:#F8F0E3!important;color:#5F7D63!important;border:1px solid #c8d3c4!important}.partner-booking-cancel[hidden]{display:none!important}';
          document.head.appendChild(cancelStyle);
        }
        cancel.textContent = !window.DayOI18n || window.DayOI18n.getLang() === 'KO' ? '예약 취소' : 'Cancel booking';
        cancel.dataset.startsAt = String(start.getTime());
        cancel.addEventListener('click', function () {
          if (start.getTime() <= Date.now()) { cancel.hidden = true; return; }
          if (fullList) closePartnerUpcomingAll();
          cancel.disabled = true;
          Promise.resolve(openPartnerCancellation(booking, supabase)).catch(function () {
            window.alert(!window.DayOI18n || window.DayOI18n.getLang() === 'KO' ? '취소 화면을 불러오지 못했습니다. 다시 시도해 주세요.' : 'Could not load cancellation. Please retry.');
          }).finally(function () { cancel.disabled = false; });
        });
        side.appendChild(cancel);
      }
      row.append(kind, main, side);
      target.appendChild(row);
      function openPrep() {
        if (fullList) closePartnerUpcomingAll();
        openPartnerBookingPrep(booking, supabase);
      }
      main.addEventListener('click', openPrep);
      prepare.addEventListener('click', openPrep);
      row.addEventListener('click', function (event) {
        if (!event.target.closest('button')) openPrep();
      });

      getPartnerBookingBrief(supabase, booking.id).then(function (data) {
        if (request !== partnerHeroRequest || !data || typeof data !== 'object') return;
        var labels = partnerBriefLabels(data);
        name.textContent = t('partner.upcoming.nameFormat', { name: labels.display });
        language.textContent = labels.language ? t('partner.upcoming.languageFormat', { language: labels.language }) : '';
        var briefItems = [
          { label: t('partner.upcoming.purposes'), value: labels.values.purposes },
          { label: t('partner.upcoming.interests'), value: labels.values.interests }
        ].filter(function (item) { return item.value; });
        summary.replaceChildren();
        briefItems.forEach(function (item) {
          var wrap = document.createElement('span');
          wrap.className = 'partner-upcoming-brief-item';
          var label = document.createElement('strong');
          label.className = 'partner-upcoming-brief-label';
          label.textContent = item.label;
          var value = document.createElement('span');
          value.className = 'partner-upcoming-brief-value';
          value.textContent = item.value;
          wrap.append(label, value);
          summary.appendChild(wrap);
        });
        summary.hidden = briefItems.length === 0;
      }).catch(function (error) {
        if (request === partnerHeroRequest) console.warn('[DayO] learner display unavailable', error);
      });
    }

    upcoming.slice(0, 4).forEach(function (booking, index) { appendCard(booking, index, list, false); });
    if (upcoming.length > 4) {
      upcoming.forEach(function (booking, index) { appendCard(booking, index, allList, true); });
      var more = document.createElement('button');
      more.type = 'button';
      more.className = 'partner-upcoming-more';
      more.textContent = t('partner.upcoming.viewAllFormat', { count: upcoming.length - 4 });
      more.addEventListener('click', function () {
        var modal = document.getElementById('partnerUpcomingAllModal');
        if (!modal) return;
        modal.classList.add('is-open');
        if (window.DayOScrollLock) window.DayOScrollLock.lock();
        else document.body.style.overflow = 'hidden';
        var close = modal.querySelector('[data-close-modal]');
        if (close) close.focus();
      });
      list.appendChild(more);
    }

    function updateEntries() {
      if (request !== partnerHeroRequest) return;
      [list, allList].forEach(function (host) {
        host.querySelectorAll('.partner-booking-cancel').forEach(function (button) {
          button.hidden = Number(button.dataset.startsAt) <= Date.now();
        });
      });
      if (new Date(upcoming[0].scheduled_at).getTime() + 30 * 60000 <= Date.now()) {
        clearInterval(partnerHeroTimer);
        partnerHeroTimer = null;
        window.loadPartnerBookings();
        return;
      }
    }
    updateEntries();
    partnerHeroTimer = setInterval(updateEntries, 10000);
  }

  function renderPartnerBookings(recentCancellations, recentTechIssues, failed) {
    var container = document.getElementById('partnerUpcomingBookings');
    if (!container) return;
    container.innerHTML = '';
    if ((!recentCancellations || !recentCancellations.length) && (!recentTechIssues || !recentTechIssues.length)) {
      var empty = document.createElement('p');
      empty.className = 'card-subtitle';
      empty.textContent = t(failed ? 'partner.alerts.loadError' : 'partner.alerts.empty');
      container.appendChild(empty);
      return;
    }
    (recentCancellations || []).forEach(function (booking) {
      var article = document.createElement('article');
      article.className = 'session';
      var status = document.createElement('span');
      status.className = 'session-status';
      status.textContent = t('partner.alerts.lateCancellation');
      article.appendChild(status);
      var title = document.createElement('h3');
      title.className = 'session-title';
      title.textContent = t('partner.alerts.lateCompensation');
      article.appendChild(title);
      var time = document.createElement('p');
      time.className = 'session-time';
      time.textContent = formatBookingTime(booking.scheduled_at);
      article.appendChild(time);
      container.appendChild(article);
    });
    (recentTechIssues || []).forEach(function (booking) {
      var article = document.createElement('article');
      article.className = 'session';
      var status = document.createElement('span');
      status.className = 'session-status';
      var reviewing = /_review$/.test(String(booking.end_reason || ''));
      status.textContent = t(booking.end_reason === 'partner_no_show_review'
        ? 'partner.alerts.partnerNoShowReview'
        : booking.end_reason === 'learner_no_show_review'
          ? 'partner.alerts.learnerNoShowReview'
          : booking.end_reason === 'partner_no_show_resolved'
            ? 'partner.alerts.partnerNoShowResolved'
            : booking.end_reason === 'learner_no_show_resolved'
              ? 'partner.alerts.learnerNoShowResolved'
              : reviewing
                ? 'partner.alerts.techReview'
                : booking.end_reason === 'tech_issue_rejected'
                  ? 'partner.alerts.techResolved'
                  : 'partner.alerts.techEnded');
      article.appendChild(status);
      var title = document.createElement('h3');
      title.className = 'session-title';
      title.textContent = t(booking.partner_rewarded
        ? 'partner.alerts.lateCompensation'
        : reviewing ? 'partner.alerts.rewardReview' : 'partner.alerts.rewardUnpaid');
      article.appendChild(title);
      var time = document.createElement('p');
      time.className = 'session-time';
      time.textContent = formatBookingTime(booking.scheduled_at);
      article.appendChild(time);
      container.appendChild(article);
    });
  }

  window.loadPartnerBookings = async function () {
    var container = document.getElementById('partnerUpcomingBookings');
    if (!container) return [];
    var supabase = client();
    if (!supabase || !supabase.auth) return [];
    try {
      var auth = await supabase.auth.getUser();
      var user = auth && auth.data && auth.data.user;
      if (!user || auth.error) {
        lastPartnerBookingView = null;
        renderPartnerUpcomingList([], supabase);
        renderPartnerBookings([], []);
        return [];
      }
      if (partnerBriefUserId !== user.id) {
        partnerBriefCache.clear();
        partnerBriefUserId = user.id;
      }
      var result = await supabase
        .from('bookings')
        .select('id, scheduled_at, status, language, learner_id, partner_user_id')
        .eq('partner_user_id', user.id)
        .eq('status', 'confirmed')
        .order('scheduled_at', { ascending: true });
      if (result.error) throw result.error;
      var now = Date.now();
      var upcoming = (result.data || []).filter(function (booking) {
        if (!booking.scheduled_at) return true;
        var at = new Date(booking.scheduled_at).getTime();
        return !isNaN(at) && at + 30 * 60000 >= now;
      });
      lastPartnerBookingView = { upcoming: upcoming, cancellations: [], techIssues: [], supabase: supabase, failed: false };
      renderPartnerUpcomingList(upcoming, supabase);
      var recentCancellations = [];
      var cancelledResult = await supabase
        .from('bookings')
        .select('id, scheduled_at, ended_at, status, end_reason, partner_rewarded')
        .eq('partner_user_id', user.id)
        .eq('status', 'cancelled')
        .eq('end_reason', 'user_cancelled_late')
        .eq('partner_rewarded', true)
        .gte('ended_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('ended_at', { ascending: false })
        .limit(5);
      if (cancelledResult.error) {
        console.warn('[DayO] recent cancellations unavailable', cancelledResult.error);
      } else {
        recentCancellations = cancelledResult.data || [];
      }
      var recentTechIssues = [];
      var techResult = await supabase
        .from('bookings')
        .select('id, scheduled_at, ended_at, status, end_reason, partner_rewarded')
        .eq('partner_user_id', user.id)
        .in('end_reason', [
          'tech_issue', 'tech_issue_review',
          'partner_no_show_review', 'learner_no_show_review',
          'tech_issue_approved', 'tech_issue_rejected',
          'partner_no_show_resolved', 'learner_no_show_resolved'
        ])
        .gte('ended_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('ended_at', { ascending: false })
        .limit(5);
      if (techResult.error) {
        console.warn('[DayO] recent technical incidents unavailable', techResult.error);
      } else {
        recentTechIssues = techResult.data || [];
      }
      lastPartnerBookingView.cancellations = recentCancellations;
      lastPartnerBookingView.techIssues = recentTechIssues;
      renderPartnerBookings(recentCancellations, recentTechIssues);
      return upcoming;
    } catch (err) {
      console.warn('[DayO] loadPartnerBookings failed', err);
      lastPartnerBookingView = { upcoming: [], cancellations: [], techIssues: [], supabase: supabase, failed: true };
      renderPartnerUpcomingList([], supabase, true);
      renderPartnerBookings([], [], true);
      return [];
    }
  };

  document.addEventListener('dayo:langchange', function () {
    if (lastPartnerBookingView) {
      var view = lastPartnerBookingView;
      renderPartnerUpcomingList(view.upcoming, view.supabase, view.failed);
      renderPartnerBookings(view.cancellations, view.techIssues, view.failed);
    } else if (document.getElementById('partnerUpcomingBookings')) renderPartnerBookings([], []);
    if (partnerPrepRender) partnerPrepRender();
  });

  function collectScheduleSlots() {
    var schedule = window.__dayoPartnerSchedule;
    var slots = [];
    if (schedule) {
      DAY_IDS.forEach(function (dayId) {
        var set = schedule[dayId];
        if (!set) return;
        var times = [];
        if (set && typeof set.forEach === 'function') {
          set.forEach(function (time) { times.push(time); });
        }
        times.forEach(function (time) {
          if (isThirtyMinuteStart(time)) slots.push({ dayId: dayId, time: time });
        });
      });
    }
    if (!schedule && !slots.length) {
      document.querySelectorAll('.time-chip.open, .time-chip.selected, .slot-open, .slot-btn.active').forEach(function (el) {
        var time = el.getAttribute('data-time') || String(el.textContent || '').trim().slice(0, 5);
        var dayId = el.getAttribute('data-day') || (window.__dayoPartnerActiveDay || 'mon');
        if (isThirtyMinuteStart(time)) slots.push({ dayId: dayId, time: time });
      });
    }
    return slots;
  }

  function buildRows(partnerId, openSlots) {
    var rows = [];
    var seen = {};
    var nowMs = Date.now();
    openSlots.forEach(function (slot) {
      if (!DAY_INDEX.hasOwnProperty(slot.dayId) || !isThirtyMinuteStart(slot.time)) return;
      var weeklyKey = 'weekly:' + slot.dayId + '|' + slot.time;
      if (!seen[weeklyKey]) {
        seen[weeklyKey] = true;
        rows.push({ partner_id: partnerId, slot_time: weeklyKey, status: 'available' });
      }
      upcomingDatesForDay(slot.dayId, WEEKS_AHEAD).forEach(function (isoDate) {
        var dated = isoDate + 'T' + slot.time + ':00';
        var start = parseDatedSlotStart(dated);
        if (!start || start.getTime() <= nowMs) return;
        if (seen[dated]) return;
        seen[dated] = true;
        rows.push({ partner_id: partnerId, slot_time: dated, status: 'available' });
      });
    });
    return rows;
  }

  window.savePartnerSchedule = async function () {
    var saveBtn = document.querySelector('button[onclick*="스케줄"], .btn-save-schedule')
      || document.getElementById('save-schedule-btn')
      || document.getElementById('saveSchedule');
    var activeSlots = document.querySelectorAll('.slot-btn.active, .time-chip.selected, .slot-open, .time-chip.open');
    var collected = collectScheduleSlots();

    var supabase = client();
    if (!supabase) {
      alert(window.DayOI18n.t('partner.schedule.serverError'));
      return;
    }

    var original = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = window.DayOI18n.t('partner.schedule.saving');
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(window.DayOI18n.t('partner.schedule.loginRequired'));

      var openSlots = window.__dayoPartnerSchedule ? collected : Array.from(activeSlots).map(function (el) {
        return {
          dayId: el.getAttribute('data-day') || (window.__dayoPartnerActiveDay || 'mon'),
          time: el.dataset.time || String(el.innerText || '').trim().slice(0, 5)
        };
      });

      // 084 provides atomic weekly saves that retain date overrides and booked rows.
      var monthly = await supabase.rpc('save_partner_weekly_template', { p_slots: openSlots });
      if (!monthly.error) {
        alert(window.DayOI18n.t('partner.schedule.saved'));
        document.dispatchEvent(new CustomEvent('dayo:availabilitychanged'));
        return;
      }
      if (!window.DayOAvailabilityCalendar || !window.DayOAvailabilityCalendar.missingRPC(monthly.error)) throw monthly.error;
      // Older DB during staged rollout: preserve the original weekly save path.
      var slotsToInsert = buildRows(user.id, openSlots);
      var weeklyRows = slotsToInsert.filter(function (row) {
        return String(row.slot_time || '').indexOf('weekly:') === 0;
      });
      var datedRows = slotsToInsert.filter(function (row) {
        return String(row.slot_time || '').indexOf('weekly:') !== 0;
      });
      var keepWeeklyTimes = {};
      weeklyRows.forEach(function (row) {
        keepWeeklyTimes[row.slot_time] = true;
      });

      var existingRows = await fetchPartnerAvailabilityRows(supabase, user.id, 'id, slot_time, status');

      var booked = {};
      var bookedStarts = {};
      existingRows.forEach(function (row) {
        if (row.status !== 'booked') return;
        booked[row.slot_time] = true;
        var bookedStart = parseDatedSlotStart(row.slot_time);
        if (bookedStart) bookedStarts[bookedStart.getTime()] = true;
      });

      var weeklyToUpsert = weeklyRows.filter(function (row) { return !booked[row.slot_time]; });
      if (weeklyToUpsert.length) {
        const { error } = await supabase
          .from('availability_slots')
          .upsert(weeklyToUpsert, { onConflict: 'partner_id,slot_time' });
        if (error) throw error;
      }

      var staleIds = existingRows
        .filter(function (row) {
          var slotTime = String(row.slot_time || '');
          return row.status === 'available'
            && slotTime.indexOf('weekly:') === 0
            && !keepWeeklyTimes[slotTime];
        })
        .map(function (row) { return row.id; });
      if (staleIds.length) {
        await deleteAvailableSlotIds(supabase, staleIds);
      }

      var windowDates = materializationDateSet();
      var nowMs = Date.now();
      var staleDatedIds = existingRows
        .filter(function (row) {
          if (row.status !== 'available') return false;
          var start = parseDatedSlotStart(row.slot_time);
          return !!start && start.getTime() > nowMs && !!windowDates[toIsoDate(start)];
        })
        .map(function (row) { return row.id; });
      if (staleDatedIds.length) {
        await deleteAvailableSlotIds(supabase, staleDatedIds);
      }

      var datedToUpsert = datedRows.filter(function (row) {
        var start = parseDatedSlotStart(row.slot_time);
        return !booked[row.slot_time] && (!start || !bookedStarts[start.getTime()]);
      });
      if (datedToUpsert.length) {
        const { error } = await supabase
          .from('availability_slots')
          .upsert(datedToUpsert, { onConflict: 'partner_id,slot_time' });
        if (error) throw error;
      }

      alert(window.DayOI18n.t('partner.schedule.saved'));
      if (typeof window.showToast === 'function') {
        /* keep existing lounge toast if present */
      }
    } catch (err) {
      console.error('스케줄 저장 오류:', err);
      alert(window.DayOI18n.tf('partner.schedule.saveErrorFormat', { message: err && err.message ? err.message : err }));
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = original || window.DayOI18n.t('partner.schedule.save');
      }
    }
  };

  window.loadPartnerSchedule = async function () {
    var supabase = client();
    var schedule = window.__dayoPartnerSchedule;
    if (!supabase || !schedule) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      var rows = await fetchPartnerAvailabilityRows(supabase, user.id, 'id, slot_time, status');
      if (!rows.length) return;

      DAY_IDS.forEach(function (dayId) {
        if (schedule[dayId] && schedule[dayId].clear) schedule[dayId] = new Set();
      });

      rows.forEach(function (row) {
        var raw = String(row.slot_time || '');
        if (raw.indexOf('weekly:') === 0) {
          var parts = raw.slice(7).split('|');
          if (parts[0] && isThirtyMinuteStart(parts[1])) {
            if (!schedule[parts[0]]) schedule[parts[0]] = new Set();
            schedule[parts[0]].add(parts[1]);
          }
        }
      });

      if (typeof window.__dayoRenderPartnerTimes === 'function') window.__dayoRenderPartnerTimes();
    } catch (err) {
      console.warn('[DayO] loadPartnerSchedule failed', err);
    }
  };

  window.loadAvailableSlots = async function (partnerId) {
    var container = document.getElementById('partner-slots-container');
    if (!container) return;
    var supabase = client();
    if (!supabase) {
      container.innerHTML = '<div style="font-size: 12px; color: #888;">현재 예약 가능한 시간대가 없습니다.</div>';
      return;
    }

    var query = supabase
      .from('availability_slots')
      .select('*')
      .eq('status', 'available')
      .order('slot_time', { ascending: true });
    var dateFilter = window.__dayoSelectedBookingDate || '';
    var startOfSelectedDate = dateFilter ? dateFilter + ' 00:00:00' : '';
    var endOfSelectedDate = dateFilter ? dateFilter + ' 23:59:59' : '';
    if (partnerId && /^[0-9a-f-]{36}$/i.test(partnerId)) query = query.eq('partner_id', partnerId);
    if (startOfSelectedDate && endOfSelectedDate) {
      query = query.gte('slot_time', startOfSelectedDate).lte('slot_time', endOfSelectedDate);
    }

    const { data: slots, error } = await query;

    var visible = (slots || []).filter(function (s) {
      var raw = String(s.slot_time || '');
      if (raw.indexOf('weekly:') === 0) return false;
      if (dateFilter && raw.indexOf(dateFilter) !== 0) return false;
      if(window.DayOAvailabilityCalendar&&!window.DayOAvailabilityCalendar.inWindow(window.DayOAvailabilityCalendar.dateAt(bookingSlotStartMs(raw))))return false;
      return isFutureBookableDatedSlot(raw, Date.now());
    });

    if (error || !visible.length) {
      container.innerHTML = '<div style="font-size: 12px; color: #888;">현재 예약 가능한 시간대가 없습니다.</div>';
      return;
    }

    container.innerHTML = visible.map(function (s) {
      var label = formatSlotLabel(s.slot_time);
      return (
        '<button type="button" class="btn-time-slot" onclick="requestBooking(\'' + s.id + '\', \'' + s.partner_id + '\')"' +
          ' style="padding: 8px 12px; margin: 4px; border-radius: 8px; border: 1px solid #635BFF; background: #EEEDFF; color: #635BFF; font-weight: 700; cursor: pointer;">' +
          label + ' 예약' +
        '</button>'
      );
    }).join('');
  };

  window.loadAvailableSlotsForDate = async function (isoDate) {
    window.__dayoSelectedBookingDate = isoDate || '';
    return window.loadAvailableSlots();
  };

  window.requestBooking = async function (slotId, partnerId) {
    if (legacyBookingSubmitting) return;
    legacyBookingSubmitting = true;
    try {
    var supabase = client();
    if (!supabase) {
      alert('예약 처리 중 통신 오류가 발생했습니다.');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('로그인 후 예약이 가능합니다.');
      return;
    }
    var slotResult = await supabase.from('availability_slots')
      .select('id, partner_id, slot_time, status').eq('id', slotId).single();
    var selectedSlot = slotResult.data;
    if (slotResult.error || !selectedSlot || selectedSlot.status !== 'available' ||
        String(selectedSlot.partner_id) !== String(partnerId)) {
      alert('이 예약 시간은 더 이상 선택할 수 없습니다.');
      return;
    }
    var remaining = bookingSlotStartMs(selectedSlot.slot_time) - Date.now();
    if (!isBookableStart(bookingSlotStartMs(selectedSlot.slot_time), Date.now())) {
      alert(t('book.bookingWindowClosed'));
      return;
    }
    if (!isInternalBookingTest() && remaining <= REFUND_CUTOFF_MS) {
      if (!(await confirmBookingWindow('late'))) return;
    } else if (!(await confirmBookingWindow('regular'))) return;
    if (!isBookableStart(bookingSlotStartMs(selectedSlot.slot_time), Date.now())) {
      alert(t('book.bookingWindowClosed'));
      return;
    }
    if (!isInternalBookingTest() && remaining > REFUND_CUTOFF_MS &&
        bookingSlotStartMs(selectedSlot.slot_time) - Date.now() <= REFUND_CUTOFF_MS) {
      if (!(await confirmBookingWindow('late'))) return;
      if (!isBookableStart(bookingSlotStartMs(selectedSlot.slot_time), Date.now())) {
        alert(t('book.bookingWindowClosed'));
        return;
      }
    }

    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        learner_id: user.id,
        partner_id: partnerId,
        partner_user_id: partnerId,
        slot_id: slotId,
        status: 'pending'
      })
      .select()
      .single();

    if (error || !booking) {
      alert('예약 생성 실패: ' + ((error && error.message) || '알 수 없는 오류'));
      return;
    }

    try {
      localStorage.setItem('dayo_active_booking_id', booking.id);
      localStorage.setItem('dayo_session_learner_id', user.id);
      localStorage.setItem('dayo_partner_user_id', partnerId);
    } catch (e) { /* ignore */ }

    var confirmFn = window.handleConfirmBooking;
    const success = typeof confirmFn === 'function'
      ? await confirmFn(user.id, booking.id)
      : false;
    if (success) {
      await supabase.from('availability_slots').update({ status: 'booked' }).eq('id', slotId);
      alert('🎉 예약이 확정되었습니다! 마이페이지에서 입장 링크를 확인하세요.');
      location.reload();
    }
    } finally {
      legacyBookingSubmitting = false;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (window.__dayoPartnerSchedule) window.loadPartnerSchedule();
      window.loadPartnerBookings();
    });
  } else if (window.__dayoPartnerSchedule) {
    window.loadPartnerSchedule();
    window.loadPartnerBookings();
  } else {
    window.loadPartnerBookings();
  }
})();
