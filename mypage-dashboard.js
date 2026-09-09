/* DayO mypage compact header + past-talk report archive */
(function () {
  'use strict';

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
      return '오늘 ' + timeLabel;
    }
    return m + '월 ' + d + '일 ' + timeLabel;
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
    var map = { travel: '여행/일상', opic: 'OPIc', abroad: '워홀/유학', casual: '자유 수다' };
    if (!ids || !ids.length) return '';
    return ids.map(function (id) { return map[id] || id; }).join(', ');
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
      urgent.hidden = true;
      return;
    }

    var when = session.timeLabel && session.date
      ? formatSessionWhen(session.date + 'T' + session.timeLabel + ':00')
      : formatSessionWhen(session.scheduledAt);
    if (titleEl) titleEl.textContent = session.partnerName + ' 파트너와의 대화 (' + when + ')';
    var mins = minutesUntil(session.scheduledAt);
    if (badgeEl) {
      if (mins != null && mins <= 30 && mins >= 0) badgeEl.textContent = '🚨 30분 후 시작';
      else badgeEl.textContent = '다가오는 대화';
    }
    if (metaEl) {
      var purpose = purposeLabel(session.purposes);
      metaEl.textContent = (purpose ? '목적: ' + purpose + ' · ' : '') + '대화 시작 5분 전부터 라운지 입장이 가능합니다.';
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
      btn.textContent = '🎟️ 세션 티켓 충전하기';
      btn.onclick = function (e) {
        e.preventDefault();
        openTicketsModal();
      };
      return;
    }
    btn.textContent = '📅 대화 일정 예약하기';
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
        body.innerHTML = '<p style="text-align:center;color:#888;font-size:13px;padding:24px 8px;">열어볼 대화 리포트가 아직 없어요.</p>';
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
    var modal = document.getElementById('report-detail-modal');
    if (modal && (modal.style.display === 'flex' || modal.classList.contains('is-open'))) {
      closeReportDetailModal();
    }
  }

  window.refreshUrgentSessionBanner = loadUrgentSessionBanner;

  function init() {
    syncMainAction();
    bindStoryTopics();
    loadUrgentSessionBanner();
    document.addEventListener('keydown', onKeydown);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('dayo:authchange', function () {
    syncMainAction();
    loadUrgentSessionBanner();
  });
  document.addEventListener('dayo:ticketchange', syncMainAction);
})();
