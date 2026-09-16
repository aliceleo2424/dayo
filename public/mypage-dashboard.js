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
    var raw = String(iso);
    var timeMatch = raw.match(/T(\d{2}:\d{2})/) || raw.match(/\s(\d{2}:\d{2})/);
    var dateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    var timeLabel = timeMatch ? timeMatch[1] : '';
    if (!dateMatch) return timeLabel;
    var y = Number(dateMatch[1]);
    var m = Number(dateMatch[2]);
    var d = Number(dateMatch[3]);
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

  async function loadUrgentSessionBanner() {
    var urgent = document.getElementById('urgent-session-banner');
    if (!urgent) return;
    var titleEl = document.getElementById('urgent-session-title');
    var metaEl = document.getElementById('urgent-session-meta');
    var badgeEl = document.getElementById('urgent-session-badge');

    var session = readLocalNextSession();
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
            .select('id, partner_name, scheduled_at, status, language')
            .eq('learner_id', userId)
            .in('status', ['confirmed', 'pending'])
            .order('scheduled_at', { ascending: true })
            .limit(5);
          var now = Date.now();
          var upcoming = (q.data || []).filter(function (row) {
            if (!row.scheduled_at) return true;
            var at = new Date(row.scheduled_at).getTime();
            return !isNaN(at) && at + 30 * 60000 >= now;
          })[0];
          if (upcoming) {
            session = {
              partnerName: upcoming.partner_name,
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
    window.location.href = 'room.html?role=user';
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
    if (typeof window.getCachedNickname === 'function') {
      var cached = window.getCachedNickname();
      if (cached) return cached;
    }
    var profile = window._dayoAuthProfile || {};
    var name = String(profile.nickname || profile.user_name || '').trim();
    if (name) return name;
    var email = profile.email
      || (window._dayoAuthUser && window._dayoAuthUser.email)
      || '';
    try {
      if (!email) email = localStorage.getItem('dayo_user_email') || localStorage.getItem('dayo_userEmail') || '';
    } catch (e) { /* ignore */ }
    var fromEmail = emailPrefix(email);
    if (fromEmail) return fromEmail;
    try {
      return (localStorage.getItem('dayo_user_nickname') || localStorage.getItem('userName') || localStorage.getItem('dayo_user_name') || '').trim();
    } catch (e) {
      return '';
    }
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
    renderSpeakingGrowth();
    renderLearningLanguageBadge();
  });
})();
