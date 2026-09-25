/* DayO mypage compact header + past-talk report archive */
(function () {
  'use strict';

  function i18n(key, vars) {
    if (window.DayOI18n && typeof window.DayOI18n.tf === 'function') {
      return window.DayOI18n.tf(key, vars);
    }
    return key;
  }

  function formatSessionWhen(iso) {
    if (!iso) return '';
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    var timeLabel = String(date.getHours()).padStart(2, '0') + ':'
      + String(date.getMinutes()).padStart(2, '0');
    var y = date.getFullYear();
    var m = date.getMonth() + 1;
    var d = date.getDate();
    var now = new Date();
    if (now.getFullYear() === y && now.getMonth() + 1 === m && now.getDate() === d) {
      return i18n('mypage.session.todayTime', { time: timeLabel });
    }
    return i18n('mypage.session.mdTime', { m: m, d: d, time: timeLabel });
  }

  function minutesUntil(iso) {
    if (!iso) return null;
    var parsed = new Date(iso);
    if (isNaN(parsed.getTime())) {
      parsed = new Date(String(iso).replace(' ', 'T'));
    }
    if (isNaN(parsed.getTime())) return null;
    return Math.round((parsed.getTime() - Date.now()) / 60000);
  }

  function readLocalNextSession() {
    try {
      return JSON.parse(window.localStorage.getItem('dayo_next_session') || 'null');
    } catch (e) {
      return null;
    }
  }

  function purposeLabel(ids) {
    if (!ids || !ids.length) return '';
    return ids.map(function (id) {
      return i18n('mypage.purpose.' + id);
    }).join(', ');
  }

  function roomUrl(bookingId) {
    return 'room.html?bookingId=' + encodeURIComponent(String(bookingId || ''));
  }

  function syncRoomEntryLinks(bookingId) {
    window.__dayoUpcomingBookingId = bookingId || '';
    var link = document.querySelector('.mypage-welcome-cta--room');
    if (link) link.setAttribute('href', bookingId ? roomUrl(bookingId) : 'index.html?booking=open');
  }

  var cancellationPending = false;
  async function cancelUpcomingBooking(bookingId, scheduledAt, userId, button) {
    if (cancellationPending || !bookingId || !userId) return;
    var remaining = new Date(scheduledAt).getTime() - Date.now();
    if (!isFinite(remaining) || remaining <= 0) return;
    var message = remaining >= 6 * 60 * 60 * 1000
      ? '지금 취소하면 사용한 티켓이 원래 유효기간 그대로 돌아와요. 예약을 취소할까요?'
      : '대화 시작까지 6시간 미만 남았을 때는 티켓이 반환되지 않아요. 파트너가 이 시간을 비워둔 만큼, 취소 시 티켓은 사용 처리됩니다. 그래도 취소할까요?';
    if (!window.confirm(message)) return;
    cancellationPending = true;
    button.disabled = true;
    try {
      var result = await window.supabaseClient.rpc('cancel_my_booking', { p_booking_id: bookingId });
      if (result.error || !result.data || result.data.success !== true) {
        throw result.error || new Error((result.data && result.data.message) || '예약 취소에 실패했습니다.');
      }
      try {
        if (window.localStorage.getItem('dayo_active_booking_id') === bookingId) {
          window.localStorage.removeItem('dayo_active_booking_id');
        }
        var localSession = readLocalNextSession();
        if (localSession && localSession.bookingId === bookingId) {
          window.localStorage.removeItem('dayo_next_session');
          window.localStorage.removeItem('dayo_next_session_soon');
        }
      } catch (storageError) { /* server state is authoritative */ }
      await loadUrgentSessionBanner();
      if (window.DayOTicketWallet && window.DayOTicketWallet.loadUserTicketBalance) {
        try {
          await window.DayOTicketWallet.loadUserTicketBalance(userId, 0);
        } catch (walletError) {
          console.warn('[DayO] ticket balance refresh failed', walletError);
        }
      }
      window.alert(result.data.cancellation_type === 'early'
        ? '예약이 취소되었어요. 티켓은 원래 유효기간으로 반환됩니다.'
        : '예약이 취소되었어요. 시작까지 6시간 미만 남았을 때 취소하여 티켓은 반환되지 않습니다.');
    } catch (error) {
      console.warn('[DayO] booking cancellation failed', error);
      window.alert('예약을 취소하지 못했어요. 예약 상태를 확인한 뒤 다시 시도해주세요.');
    } finally {
      cancellationPending = false;
      button.disabled = false;
    }
  }

  function renderAdditionalBookingList(rows, primaryId, userId) {
    var list = document.getElementById('upcoming-booking-list');
    if (!list) return;
    list.replaceChildren();
    var additional = (rows || []).filter(function (row) { return row.id !== primaryId; });
    list.hidden = additional.length === 0;
    additional.forEach(function (booking) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 16px;margin-top:8px;border:1px solid #eee;border-radius:12px;background:#fff;';
      var label = document.createElement('span');
      label.textContent = '추가 예약 · ' + formatSessionWhen(booking.scheduled_at)
        + (booking.language ? ' · ' + booking.language : '');
      row.appendChild(label);
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = '예약 취소';
      button.style.cssText = 'padding:8px 14px;border:1px solid #ccc;border-radius:10px;background:#fff;cursor:pointer;font-family:inherit;';
      button.onclick = function () {
        cancelUpcomingBooking(booking.id, booking.scheduled_at, userId, button);
      };
      row.appendChild(button);
      list.appendChild(row);
    });
  }

  async function loadUrgentSessionBanner() {
    var urgent = document.getElementById('urgent-session-banner');
    if (!urgent) return;
    var titleEl = document.getElementById('urgent-session-title');
    var metaEl = document.getElementById('urgent-session-meta');
    var badgeEl = document.getElementById('urgent-session-badge');
    var cancelButton = document.getElementById('urgent-session-cancel');
    if (cancelButton) {
      cancelButton.hidden = true;
      cancelButton.onclick = null;
    }

    var session = readLocalNextSession();
    var futureBookings = [];
    var confirmedBookingId = '';
    syncRoomEntryLinks('');
    var supabase = window.supabaseClient;
    var userId = (window._dayoAuthUser && window._dayoAuthUser.id) || '';
    if (supabase) {
      try {
        if (!userId) {
          var authRes = await supabase.auth.getUser();
          userId = authRes && authRes.data && authRes.data.user && authRes.data.user.id || '';
        }
        if (userId) {
          var q = await supabase
            .from('bookings')
            .select('id, partner_user_id, partner_id, scheduled_at, status, language')
            .eq('learner_id', userId)
            .eq('status', 'confirmed')
            .gte('scheduled_at', new Date(Date.now() - 30 * 60000).toISOString())
            .order('scheduled_at', { ascending: true });
          if (q.error) throw q.error;
          var now = Date.now();
          var upcoming = (q.data || []).filter(function (row) {
            if (!row.scheduled_at) return true;
            var at = new Date(row.scheduled_at).getTime();
            return !isNaN(at) && at + 30 * 60000 >= now;
          })[0];
          futureBookings = (q.data || []).filter(function (row) {
            return row.scheduled_at && new Date(row.scheduled_at).getTime() > now;
          });
          session = null;
          if (upcoming) {
            confirmedBookingId = upcoming.id;
            var partnerName = 'DayO Partner';
            try {
              var partnerProfiles = await supabase.rpc('list_public_partner_profiles');
              if (!partnerProfiles.error) {
                var profiles = partnerProfiles.data || [];
                var partnerUserId = String(upcoming.partner_user_id || '');
                var partnerProfile = profiles.find(function (row) {
                  return row && partnerUserId && String(row.id) === partnerUserId;
                }) || profiles.find(function (row) {
                  return row && partnerUserId && String(row.user_id) === partnerUserId;
                }) || profiles.find(function (row) {
                  return row && upcoming.partner_id && String(row.id) === String(upcoming.partner_id);
                });
                var nickname = String((partnerProfile && partnerProfile.nickname) || '').trim();
                if (nickname && !/[@+]/.test(nickname)) partnerName = nickname;
              }
            } catch (nameError) { /* keep neutral name */ }
            session = {
              partnerName: partnerName,
              scheduledAt: upcoming.scheduled_at,
              bookingId: upcoming.id,
              language: upcoming.language,
              purposes: session && session.purposes
            };
          }
        }
      } catch (err) {
        console.warn('다가오는 예약 로드 실패:', err);
      }
    }

    syncRoomEntryLinks(confirmedBookingId);
    renderAdditionalBookingList(futureBookings, confirmedBookingId, userId);
    if (session && /[@+]/.test(String(session.partnerName || ''))) session.partnerName = 'DayO Partner';

    if (!session || !session.partnerName) {
      if (titleEl) titleEl.textContent = i18n('mypage.urgent.empty');
      if (badgeEl) badgeEl.textContent = i18n('mypage.urgent.badge');
      if (metaEl) metaEl.textContent = i18n('mypage.urgent.meta');
      urgent.hidden = true;
      return;
    }

    var when = session.timeLabel && session.date
      ? formatSessionWhen(session.date + 'T' + session.timeLabel + ':00')
      : formatSessionWhen(session.scheduledAt);
    if (titleEl) titleEl.textContent = i18n('mypage.urgent.titleFormat', { name: session.partnerName, when: when });
    var mins = minutesUntil(session.scheduledAt);
    if (badgeEl) {
      if (mins != null && mins <= 30 && mins >= 0) badgeEl.textContent = i18n('mypage.urgent.soon');
      else badgeEl.textContent = i18n('mypage.urgent.badge');
    }
    if (metaEl) {
      var purpose = purposeLabel(session.purposes);
      metaEl.textContent = (purpose ? i18n('mypage.urgent.purposePrefix', { purpose: purpose }) : '') + i18n('mypage.urgent.meta');
    }
    urgent.hidden = false;
    if (cancelButton && confirmedBookingId && session.scheduledAt
        && new Date(session.scheduledAt).getTime() > Date.now()) {
      cancelButton.hidden = false;
      cancelButton.onclick = function () {
        cancelUpcomingBooking(confirmedBookingId, session.scheduledAt, userId, cancelButton);
      };
    }
  }

  async function loadRecentTechIssueResults() {
    var section = document.getElementById('recent-tech-issue-results');
    var list = document.getElementById('recent-tech-issue-list');
    var db = window.supabaseClient;
    if (!section || !list || !db) return;
    section.hidden = true;
    list.replaceChildren();
    try {
      var userId = window._dayoAuthUser && window._dayoAuthUser.id;
      if (!userId) {
        var auth = await db.auth.getUser();
        userId = auth && auth.data && auth.data.user && auth.data.user.id;
      }
      if (!userId) return;
      var result = await db.from('bookings')
        .select('id,scheduled_at,ended_at,end_reason,ticket_refunded')
        .eq('learner_id', userId)
        .in('end_reason', [
          'tech_issue_review', 'partner_no_show_review', 'learner_no_show_review',
          'tech_issue_approved', 'tech_issue_rejected',
          'partner_no_show_resolved', 'learner_no_show_resolved'
        ])
        .order('ended_at', { ascending: false })
        .limit(5);
      if (result.error) throw result.error;
      (result.data || []).forEach(function (booking) {
        var row = document.createElement('p');
        row.style.cssText = 'margin:0;font-size:12px;line-height:1.5;color:#5C5C5C;';
        var reason = String(booking.end_reason || '');
        var label = reason.indexOf('no_show') >= 0 ? '미입장 신고' : '기술 문제 신고';
        var outcome = /_review$/.test(reason)
          ? '확인 중 · 티켓 반환 여부 검토 중'
          : booking.ticket_refunded
            ? '처리 완료 · 사용한 티켓을 원래 유효기간으로 반환'
            : '처리 완료 · 티켓 미반환';
        var when = booking.scheduled_at
          ? new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          }).format(new Date(booking.scheduled_at)) : '예약 시간 확인';
        row.textContent = when + ' · ' + label + ' · ' + outcome;
        list.appendChild(row);
      });
      section.hidden = !list.children.length;
    } catch (error) {
      console.warn('[DayO] technical incident history unavailable', error);
    }
  }

  function hasActiveBooking() {
    try {
      return !!(window.localStorage.getItem('dayo_active_booking_id'));
    } catch (e) {
      return false;
    }
  }

  function hasSoonSession() {
    if (hasActiveBooking()) return true;
    try {
      return window.localStorage.getItem('dayo_next_session_soon') === '1';
    } catch (e) {
      return false;
    }
  }

  function ticketCount() {
    if (window.DayOTicketWallet && typeof window.DayOTicketWallet.getCount === 'function') {
      return window.DayOTicketWallet.getCount();
    }
    return 0;
  }

  function openBookingModal() {
    if (window.DayOBooking && typeof window.DayOBooking.requestOpen === 'function') {
      window.DayOBooking.requestOpen();
      return;
    }
    window.location.href = 'index.html?booking=open';
  }

  function openTicketsModal() {
    if (window.DayOTickets && typeof window.DayOTickets.open === 'function') {
      window.DayOTickets.open();
      return;
    }
    var trigger = document.querySelector('[data-tickets-open]');
    if (trigger) trigger.click();
  }

  function bindStoryTopics() {
    var cards = document.querySelectorAll('[data-story-topic]');
    Array.prototype.forEach.call(cards, function (card) {
      card.addEventListener('click', function () {
        Array.prototype.forEach.call(cards, function (other) {
          var on = other === card;
          other.setAttribute('aria-pressed', on ? 'true' : 'false');
          other.style.background = on ? '#FFF9F5' : '#F8F9FA';
          other.style.borderColor = on ? '#FFEBE4' : '#EDEDED';
        });
      });
    });
  }

  function syncMainAction() {
    var btn = document.getElementById('main-action-btn');
    if (!btn) return;
    btn.hidden = false;
    if (ticketCount() <= 0) {
      btn.textContent = i18n('mypage.cta.charge');
      btn.onclick = function (e) {
        e.preventDefault();
        openTicketsModal();
      };
      return;
    }
    btn.textContent = i18n('mypage.cta.book');
    btn.onclick = function (e) {
      e.preventDefault();
      openBookingModal();
    };
  }

  function resolveReportIndex(key) {
    if (typeof key === 'number' && key >= 0) return key;
    var raw = String(key == null ? '' : key);
    if (raw.indexOf('report-') === 0) {
      var n = parseInt(raw.slice(7), 10);
      return Number.isFinite(n) && n > 0 ? n - 1 : 0;
    }
    var parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  function openReportDetailModal(key) {
    var modal = document.getElementById('report-detail-modal');
    var body = document.getElementById('report-detail-body');
    if (!modal) return;
    var reports = window.__dayoTalkAlbum || [];
    var idx = resolveReportIndex(key);
    var report = reports[idx];
    if (body) {
      if (report && typeof window.renderReportDetailHtml === 'function') {
        body.innerHTML = window.renderReportDetailHtml(report);
      } else if (report && typeof window.renderViralReportCardForModal === 'function') {
        body.innerHTML = window.renderViralReportCardForModal(report);
      } else {
        body.innerHTML = '<p style="text-align:center;color:#888;font-size:13px;padding:24px 8px;">' + i18n('mypage.archive.empty') + '</p>';
      }
    }
    modal.style.display = 'flex';
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    var closeBtn = modal.querySelector('.card-detail-close');
    if (closeBtn && closeBtn.focus) closeBtn.focus();
  }

  function closeReportDetailModal() {
    var modal = document.getElementById('report-detail-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('is-open');
    }
    document.body.style.overflow = 'auto';
  }

  window.enterStudio = function () {
    var bookingId = window.__dayoUpcomingBookingId || '';
    if (bookingId) {
      window.location.href = roomUrl(bookingId);
      return;
    }
    openBookingModal();
  };

  window.openBookingModal = openBookingModal;
  window.openBookingSlots = openBookingModal;
  window.openTicketsModal = openTicketsModal;
  window.openReportDetailModal = openReportDetailModal;
  window.closeReportDetailModal = closeReportDetailModal;
  window.openCardDetailModal = openReportDetailModal;
  window.closeCardDetailModal = closeReportDetailModal;

  function onKeydown(e) {
    if (e.key !== 'Escape') return;
    var profileModal = document.getElementById('edit-profile-modal');
    if (profileModal && profileModal.classList.contains('is-open')) {
      closeNicknameModal();
      return;
    }
    var modal = document.getElementById('report-detail-modal');
    if (modal && (modal.style.display === 'flex' || modal.classList.contains('is-open'))) {
      closeReportDetailModal();
    }
  }

  window.refreshUrgentSessionBanner = loadUrgentSessionBanner;

  function formatLearningLanguageLabel(raw) {
    var text = String(raw || '').trim().replace(/^\[|\]$/g, '').replace(/^"|"$/g, '').trim();
    if (!text) return '';
    var lower = text.toLowerCase();
    if (/\b(us|en|english|영어)\b/i.test(text) || lower === 'en' || lower === 'us') return '🇺🇸 영어';
    if (/\b(es|spanish|스페인어)\b/i.test(text) || lower === 'es') return '🇪🇸 스페인어';
    if (/\b(fr|french|프랑스어)\b/i.test(text) || lower === 'fr') return '🇫🇷 프랑스어';
    if (/\b(kr|ko|korean|한국어)\b/i.test(text) || lower === 'kr' || lower === 'ko') return '🇰🇷 한국어';
    return text;
  }

  function renderLearningLanguageBadge() {
    var el = document.getElementById('mypage-learning-lang');
    if (!el) return;
    var profile = window._dayoAuthProfile || {};
    var label = formatLearningLanguageLabel(profile.learning_languages);
    if (!label) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.innerHTML = '관심 언어: <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;background:#F5F5F4;color:#44403C;font-size:11.5px;font-weight:700;">' + label + '</span>';
  }

  function emailPrefix(email) {
    var raw = String(email || '').trim();
    if (!raw || raw.indexOf('@') < 1) return '';
    return raw.split('@')[0];
  }

  function displayName() {
    var user = window._dayoAuthUser;
    if (!user || !user.id) return '';
    var profile = window._dayoAuthProfile;
    if (!profile || profile._authUserId !== user.id) profile = {};
    var name = String(profile.nickname || profile.user_name || '').trim();
    if (name) return name;
    var metadata = user.user_metadata || {};
    var metaName = String(metadata.user_name || metadata.full_name || metadata.name || '').trim();
    return metaName || emailPrefix(user.email);
  }

  function applyDisplayName(name) {
    if (typeof window.updateProfileUI === 'function') {
      window.updateProfileUI(name);
      return;
    }
    var next = String(name || '').trim();
    if (!next) return;
    window._dayoAuthProfile = Object.assign({}, window._dayoAuthProfile || {}, {
      user_name: next,
      nickname: next
    });
    try {
      localStorage.setItem('dayo_user_nickname', next);
      localStorage.setItem('userName', next);
      localStorage.setItem('dayo_user_name', next);
    } catch (e) { /* ignore */ }
    if (window.DayOMode && typeof window.DayOMode.refresh === 'function') {
      window.DayOMode.refresh();
    }
    if (window.DayOGreeting && typeof window.DayOGreeting.refresh === 'function') {
      window.DayOGreeting.refresh();
    }
  }

  function latestSpeakingRecord() {
    var profile = window._dayoAuthProfile || {};
    var latest = null;
    try {
      var hist = JSON.parse(localStorage.getItem('dayo_speaking_test_history') || '[]');
      if (Array.isArray(hist) && hist[0]) latest = hist[0];
    } catch (e) { latest = null; }
    if (profile.last_test_date || profile.speaking_level || profile.last_test_score != null) {
      var remote = {
        speaking_level: profile.speaking_level,
        last_test_score: profile.last_test_score,
        last_test_date: profile.last_test_date
      };
      if (!latest) return remote;
      var remoteTs = remote.last_test_date ? new Date(remote.last_test_date).getTime() : 0;
      var localTs = latest.last_test_date ? new Date(latest.last_test_date).getTime() : 0;
      return remoteTs >= localTs ? remote : latest;
    }
    return latest;
  }

  function isLoggedInUser() {
    if (window._dayoAuthUser) return true;
    if (typeof window.checkUserLoggedIn === 'function') {
      try { return !!window.checkUserLoggedIn(); } catch (e) { /* ignore */ }
    }
    return false;
  }

  function sessionCount() {
    var reports = window.__dayoTalkAlbum;
    if (Array.isArray(reports)) return reports.length;
    if (window.__dayoCompletedSessionCount != null) {
      var n = Number(window.__dayoCompletedSessionCount);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    var profile = window._dayoAuthProfile || {};
    if (profile.session_count != null && Number.isFinite(Number(profile.session_count))) {
      return Math.max(0, Number(profile.session_count));
    }
    return 0;
  }

  function streakCount() {
    var profile = window._dayoAuthProfile || {};
    if (profile.streak_count != null && Number.isFinite(Number(profile.streak_count))) {
      return Math.max(0, Number(profile.streak_count));
    }
    try {
      var n = parseInt(localStorage.getItem('streakCount'), 10);
      if (Number.isFinite(n) && n >= 0) return n;
    } catch (e) { /* ignore */ }
    return 0;
  }

  function renderSpeakingGrowth() {
    var paceEl = document.getElementById('progress-pace');
    var sessionEl = document.getElementById('progress-sessions');
    var streakEl = document.getElementById('progress-streak');
    if (!paceEl && !sessionEl && !streakEl) return;
    var record = latestSpeakingRecord();
    var sessions = sessionCount();
    if (paceEl) {
      if (!record || (!record.speaking_level && record.last_test_score == null)) {
        paceEl.textContent = i18n('mypage.progress.beforeDiagnosis');
      } else {
        var level = record.speaking_level || i18n('mypage.progress.levelFallback');
        paceEl.textContent = record.last_test_score != null
          ? i18n('mypage.progress.scoreFormat', { level: level, score: record.last_test_score })
          : level;
      }
    }
    if (sessionEl) {
      sessionEl.textContent = sessions > 0
        ? i18n('mypage.progress.sessionsDone', { n: sessions })
        : i18n('mypage.progress.sessionsNone');
    }
    if (streakEl) {
      var streak = streakCount();
      streakEl.textContent = streak > 0
        ? i18n('mypage.progress.streakDays', { n: streak })
        : i18n('mypage.progress.streakNone');
    }
  }

  function nicknameModalEls() {
    return {
      overlay: document.getElementById('edit-profile-modal'),
      input: document.getElementById('edit-profile-input'),
      error: document.getElementById('edit-profile-error'),
      save: document.getElementById('edit-profile-save')
    };
  }

  function openNicknameModal() {
    var els = nicknameModalEls();
    if (!els.overlay) return;
    if (els.input) els.input.value = displayName() === 'DayO' ? '' : displayName();
    if (els.error) els.error.textContent = '';
    els.overlay.hidden = false;
    els.overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    if (els.input && els.input.focus) els.input.focus();
  }

  function closeNicknameModal() {
    var els = nicknameModalEls();
    if (!els.overlay) return;
    els.overlay.classList.remove('is-open');
    els.overlay.hidden = true;
    document.body.style.overflow = '';
  }

  async function saveNickname() {
    var els = nicknameModalEls();
    var next = els.input ? String(els.input.value || '').trim() : '';
    if (!next) {
      if (els.error) els.error.textContent = i18n('mypage.nick.empty');
      return;
    }
    if (next.length < 2) {
      if (els.error) els.error.textContent = i18n('mypage.nick.tooShort');
      return;
    }
    if (els.save) els.save.disabled = true;
    if (els.error) els.error.textContent = '';
    try {
      if (typeof window.persistNickname === 'function') {
        await window.persistNickname(next);
      } else {
        var supabase = window.supabaseClient;
        if (!supabase || !supabase.auth) throw new Error(i18n('mypage.nick.needSession'));
        var sessionRes = await supabase.auth.getSession();
        var session = sessionRes && sessionRes.data && sessionRes.data.session;
        if (!session || !session.user) throw new Error(i18n('mypage.nick.needLogin'));
        var payload = { nickname: next, user_name: next };
        var res = await supabase.from('profiles').update(payload).eq('id', session.user.id).select('nickname');
        if (res && (res.error || !res.data || !res.data.length)) {
          res = await supabase.from('profiles').update(payload).eq('user_id', session.user.id).select('nickname');
        }
        if (res && res.error) throw res.error;
        applyDisplayName(next);
      }
      closeNicknameModal();
      alert(i18n('mypage.nick.saved'));
    } catch (err) {
      console.error('닉네임 저장 실패:', err);
      var message = (err && err.message) ? err.message : i18n('mypage.nick.needSession');
      if (els.error) els.error.textContent = i18n('mypage.nick.saveFail', { message: message });
      alert(i18n('mypage.nick.saveFail', { message: message }));
    } finally {
      if (els.save) els.save.disabled = false;
    }
  }

  function bindNicknameEditor() {
    var openBtn = document.getElementById('edit-nickname-btn');
    var cancelBtn = document.getElementById('edit-profile-cancel');
    var saveBtn = document.getElementById('edit-profile-save');
    var overlay = document.getElementById('edit-profile-modal');
    var input = document.getElementById('edit-profile-input');
    var retestBtn = document.getElementById('speaking-retest-btn');
    var speakBtn = document.getElementById('mypage-speak-btn');
    function markOpenQuiz() {
      try { sessionStorage.setItem('dayo_open_quiz', '1'); } catch (e) { /* ignore */ }
    }
    if (retestBtn) retestBtn.addEventListener('click', markOpenQuiz);
    if (speakBtn) speakBtn.addEventListener('click', markOpenQuiz);
    if (openBtn) openBtn.addEventListener('click', openNicknameModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeNicknameModal);
    if (saveBtn) saveBtn.addEventListener('click', function () { saveNickname(); });
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveNickname();
        }
      });
    }
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeNicknameModal();
      });
    }
  }

  function maybeOpenBookingFromQuery() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      if (params.get('openBooking') !== 'true' && params.get('booking') !== 'open') return;
      params.delete('openBooking');
      params.delete('booking');
      var next = window.location.pathname + (params.toString() ? ('?' + params.toString()) : '') + (window.location.hash || '');
      window.history.replaceState({}, '', next);
      setTimeout(function () {
        openBookingModal();
      }, 120);
    } catch (e) { /* ignore */ }
  }

  function init() {
    syncMainAction();
    bindStoryTopics();
    bindNicknameEditor();
    loadUrgentSessionBanner();
    loadRecentTechIssueResults();
    renderSpeakingGrowth();
    renderLearningLanguageBadge();
    document.addEventListener('keydown', onKeydown);
    maybeOpenBookingFromQuery();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.renderSpeakingGrowth = renderSpeakingGrowth;
  window.renderLearningLanguageBadge = renderLearningLanguageBadge;

  document.addEventListener('dayo:authchange', function () {
    syncMainAction();
    loadUrgentSessionBanner();
    loadRecentTechIssueResults();
    renderSpeakingGrowth();
    renderLearningLanguageBadge();
  });
  document.addEventListener('dayo:authprofile', function () {
    renderSpeakingGrowth();
    renderLearningLanguageBadge();
  });
  document.addEventListener('dayo:reportsloaded', renderSpeakingGrowth);
  document.addEventListener('dayo:ticketchange', syncMainAction);
  document.addEventListener('dayo:langchange', function () {
    syncMainAction();
    loadUrgentSessionBanner();
    loadRecentTechIssueResults();
    renderSpeakingGrowth();
    renderLearningLanguageBadge();
  });
})();
