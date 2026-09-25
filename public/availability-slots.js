/* DayO partner availability slots + learner slot booking */
(function () {
  'use strict';

  var DAY_IDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var DAY_LABELS = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };
  var DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  var WEEKS_AHEAD = 6;

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
      return (DAY_LABELS[weekly[0]] || weekly[0]) + ' ' + (weekly[1] || '');
    }
    var match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/);
    if (match) return Number(match[2]) + '/' + Number(match[3]) + ' ' + match[4];
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

  function isFutureBookableDatedSlot(value, nowMs) {
    var start = parseDatedSlotStart(value);
    return !!start && isThirtyMinuteDatedSlot(value) && start.getTime() > nowMs;
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
    if (!value) return window.DayOI18n.t('partner.sessions.timeUnknown');
    var date = new Date(value);
    if (isNaN(date.getTime())) return window.DayOI18n.t('partner.sessions.timeUnknown');
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
  }

  var partnerHeroTimer = null;
  var partnerHeroRequest = 0;
  var partnerBriefCache = new Map();
  var partnerBriefUserId = '';
  var partnerPrepTimer = null;
  var partnerPrepOpenTimer = null;
  var partnerPrepCloseTimer = null;
  var partnerPrepRequest = 0;

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
    if (!display || /[@+]/.test(display) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(display)) display = 'DayO User';
    var languageId = data && data.language;
    var language = bookingOptionLabel('book.lang.', languageId, ['en', 'es', 'fr', 'ko', 'ja', 'zh', 'vi', 'de', 'it', 'ru']);
    var brief = data && data.conversation_brief;
    if (!brief || typeof brief !== 'object' || Array.isArray(brief)) brief = {};
    var purposes = Array.isArray(brief.purposes) ? brief.purposes.map(function (id) {
      return bookingOptionLabel('book.purpose.', id, ['travel', 'opic', 'abroad', 'casual']);
    }).filter(Boolean).join(' · ') : '';
    var interests = Array.isArray(brief.interests) ? brief.interests.map(function (id) {
      return bookingOptionLabel('book.interest.', id, [
        'drama', 'movies', 'youtube', 'music', 'travel', 'food_cafe',
        'exercise', 'games', 'fashion_beauty', 'pets', 'books_webtoon', 'work_school'
      ]);
    }).filter(Boolean).join(' · ') : '';
    return { display: display, language: language, languageId: languageId, values: {
      purposes: purposes,
      interests: interests,
      chat_style: bookingOptionLabel('chatPrefs.style.', brief.chat_style, ['casual', 'correct', 'interview']),
      chat_request: bookingOptionLabel('chatPrefs.request.', brief.chat_request, ['praise', 'gentle', 'encourage']),
      partner_preference: bookingOptionLabel('book.style.', brief.partner_preference, ['slow', 'fast', 'correct', 'korean'])
    } };
  }

  function renderBriefRows(briefView, values) {
    if (!briefView) return;
    var visible = false;
    Object.keys(values).forEach(function (key) {
      var row = briefView.querySelector('[data-brief-field="' + key + '"]');
      if (!row) return;
      row.hidden = !values[key];
      if (values[key]) {
        row.querySelector('dd').textContent = values[key];
        visible = true;
      }
    });
    briefView.hidden = !visible;
  }

  function renderPartnerHeroBrief(data, name) {
    var labels = partnerBriefLabels(data);
    name.textContent = labels.display + (labels.language ? ' 님과의 ' + labels.language + ' 대화' : ' 님과의 대화');
    var languageView = document.getElementById('partner-upcoming-hero-language');
    if (languageView) {
      var flag = window.DayOI18n && typeof window.DayOI18n.langFlag === 'function'
        ? window.DayOI18n.langFlag(labels.languageId) : '';
      languageView.textContent = labels.language ? (flag ? flag + ' ' : '') + labels.language : '';
      languageView.hidden = !labels.language;
    }
    var briefView = document.getElementById('partner-upcoming-hero-brief');
    renderBriefRows(briefView, labels.values);
    if (briefView && labels.language) briefView.hidden = false;
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
    var day = toIsoDate(start) === toIsoDate(new Date()) ? '오늘' :
      new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(start);
    document.getElementById('booking-prep-time').textContent = day + ' ' + pad(start.getHours()) + ':' + pad(start.getMinutes());
    var name = document.getElementById('booking-prep-name');
    var language = bookingOptionLabel('book.lang.', booking.language, ['en', 'es', 'fr', 'ko', 'ja', 'zh', 'vi', 'de', 'it', 'ru']);
    name.textContent = 'DayO User 님과의 ' + (language ? language + ' ' : '') + '대화';
    var briefView = document.getElementById('booking-prep-brief');
    renderBriefRows(briefView, { purposes: '', interests: '', chat_style: '', chat_request: '', partner_preference: '' });
    function updateEntry() {
      var now = Date.now();
      var canEnter = now >= start.getTime() - 5 * 60000 && now < start.getTime() + 30 * 60000;
      enter.disabled = !canEnter;
      enter.textContent = canEnter ? '대화방 입장' :
        now >= start.getTime() + 30 * 60000 ? '입장 시간이 지났어요' : '5분 전부터 입장 가능';
    }
    enter.onclick = function () {
      var now = Date.now();
      updateEntry();
      if (now >= start.getTime() - 5 * 60000 && now < start.getTime() + 30 * 60000) {
        window.location.href = 'room.html?bookingId=' + encodeURIComponent(booking.id);
      }
    };
    updateEntry();
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
      if (request !== partnerPrepRequest || !data || typeof data !== 'object') return;
      var labels = partnerBriefLabels(data);
      name.textContent = labels.display + (labels.language ? ' 님과의 ' + labels.language + ' 대화' : ' 님과의 대화');
      renderBriefRows(briefView, labels.values);
    }).catch(function (error) {
      if (request === partnerPrepRequest) console.warn('[DayO] booking brief unavailable', error);
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

  function renderPartnerUpcomingHero(rows, supabase) {
    var bookingView = document.getElementById('partner-upcoming-hero-booking');
    var emptyView = document.getElementById('partner-upcoming-hero-empty');
    var ctaView = document.getElementById('partner-upcoming-hero-cta');
    var enter = document.getElementById('partner-upcoming-hero-enter');
    if (!bookingView || !emptyView || !ctaView || !enter) return;

    partnerHeroRequest += 1;
    var request = partnerHeroRequest;
    if (partnerHeroTimer) clearInterval(partnerHeroTimer);
    partnerHeroTimer = null;
    var booking = (rows || []).find(function (row) {
      var at = new Date(row.scheduled_at).getTime();
      return row.status === 'confirmed' && Number.isFinite(at) && at + 30 * 60000 > Date.now();
    });
    bookingView.hidden = !booking;
    ctaView.hidden = !booking;
    emptyView.hidden = !!booking;
    if (!booking) return;

    var start = new Date(booking.scheduled_at);
    document.getElementById('partner-upcoming-hero-day').textContent =
      toIsoDate(start) === toIsoDate(new Date()) ? '오늘' :
        new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(start);
    document.getElementById('partner-upcoming-hero-time').textContent = pad(start.getHours()) + ':' + pad(start.getMinutes());
    var name = document.getElementById('partner-upcoming-hero-name');
    name.textContent = 'DayO User 님과의 대화';
    document.getElementById('partner-upcoming-hero-brief').hidden = true;

    function updateEntry() {
      var now = Date.now();
      if (now >= start.getTime() + 30 * 60000) {
        clearInterval(partnerHeroTimer);
        partnerHeroTimer = null;
        window.loadPartnerBookings();
        return;
      }
      var canEnter = now >= start.getTime() - 5 * 60000 && now < start.getTime() + 30 * 60000;
      enter.disabled = false;
      enter.textContent = '대화 준비하기';
      document.getElementById('partner-upcoming-hero-hint').hidden = canEnter;
    }
    enter.onclick = function () {
      openPartnerBookingPrep(booking, supabase);
    };
    updateEntry();
    partnerHeroTimer = setInterval(updateEntry, 10000);

    getPartnerBookingBrief(supabase, booking.id)
      .then(function (data) {
        if (request !== partnerHeroRequest) return;
        if (data && typeof data === 'object') renderPartnerHeroBrief(data, name);
      })
      .catch(function (error) {
        console.warn('[DayO] learner display unavailable', error);
      });
  }

  function renderPartnerBookings(rows, recentCancellations, recentTechIssues, supabase) {
    var container = document.getElementById('partnerUpcomingBookings');
    if (!container) return;
    container.innerHTML = '';
    if ((!rows || !rows.length) && (!recentCancellations || !recentCancellations.length) &&
        (!recentTechIssues || !recentTechIssues.length)) {
      var empty = document.createElement('p');
      empty.className = 'card-subtitle';
      empty.textContent = window.DayOI18n.t('partner.sessions.empty');
      container.appendChild(empty);
      return;
    }
    rows.forEach(function (booking) {
      var article = document.createElement('article');
      article.className = 'session';
      article.setAttribute('data-booking-prep', '');
      article.setAttribute('role', 'button');
      article.tabIndex = 0;
      article.setAttribute('aria-label', '대화 준비하기');
      article.addEventListener('click', function () { openPartnerBookingPrep(booking, supabase); });
      article.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openPartnerBookingPrep(booking, supabase);
        }
      });

      var status = document.createElement('span');
      status.className = 'session-status';
      status.textContent = window.DayOI18n.t('partner.sessions.confirmed');
      article.appendChild(status);

      var title = document.createElement('h3');
      title.className = 'session-title';
      title.textContent = window.DayOI18n.t('partner.sessions.bookedTitle');
      article.appendChild(title);

      var purpose = document.createElement('p');
      purpose.className = 'session-purpose';
      purpose.textContent = window.DayOI18n.tf('partner.sessions.topicFormat', {
        topic: booking.language || window.DayOI18n.t('partner.sessions.defaultTopic')
      });
      article.appendChild(purpose);

      var time = document.createElement('p');
      time.className = 'session-time';
      time.textContent = formatBookingTime(booking.scheduled_at);
      article.appendChild(time);

      var actions = document.createElement('div');
      actions.className = 'session-actions';
      var detail = document.createElement('span');
      detail.className = 'studio-link btn-partner-mint';
      detail.textContent = '대화 준비하기';
      actions.appendChild(detail);
      article.appendChild(actions);
      container.appendChild(article);
    });
    (recentCancellations || []).forEach(function (booking) {
      var article = document.createElement('article');
      article.className = 'session';
      var status = document.createElement('span');
      status.className = 'session-status';
      status.textContent = 'User cancelled · less than 6 hours before start';
      article.appendChild(status);
      var title = document.createElement('h3');
      title.className = 'session-title';
      title.textContent = '6,000P compensation paid';
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
      status.textContent = booking.end_reason === 'partner_no_show_review'
        ? '파트너 미입장 신고 · 확인 중'
        : booking.end_reason === 'learner_no_show_review'
          ? '유저 미입장 신고 · 확인 중'
          : booking.end_reason === 'partner_no_show_resolved'
            ? '파트너 미입장 신고 · 처리 완료'
            : booking.end_reason === 'learner_no_show_resolved'
              ? '유저 미입장 신고 · 처리 완료'
              : reviewing
                ? '기술 문제 신고 · 확인 중'
                : booking.end_reason === 'tech_issue_rejected'
                  ? '기술 문제 처리 완료'
                  : '기술 문제로 종료 · 노쇼 처리 아님';
      article.appendChild(status);
      var title = document.createElement('h3');
      title.className = 'session-title';
      title.textContent = booking.partner_rewarded
        ? '보상 6,000P 지급'
        : reviewing ? '보상 여부 확인 중' : '보상 미지급';
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
        renderPartnerUpcomingHero([], supabase);
        renderPartnerBookings([]);
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
      renderPartnerUpcomingHero(upcoming, supabase);
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
      renderPartnerBookings(upcoming, recentCancellations, recentTechIssues, supabase);
      return upcoming;
    } catch (err) {
      console.warn('[DayO] loadPartnerBookings failed', err);
      renderPartnerUpcomingHero([], supabase);
      renderPartnerBookings([]);
      return [];
    }
  };

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
    if (!window.DayOPreopenBooking ||
        typeof window.DayOPreopenBooking.canCreate !== 'function' ||
        !window.DayOPreopenBooking.canCreate()) {
      if (window.DayOPreopenBooking && typeof window.DayOPreopenBooking.showNotice === 'function') {
        window.DayOPreopenBooking.showNotice();
      }
      return;
    }
    if (!confirm('티켓 1장을 사용하여 이 시간대로 예약하시겠습니까?')) return;

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
    if (!window.DayOPreopenBooking.canCreate(user.id)) {
      window.DayOPreopenBooking.showNotice();
      return;
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
