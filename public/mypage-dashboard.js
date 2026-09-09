/* DayO mypage compact header + past-talk report archive */
(function () {
  'use strict';

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
    var urgent = document.getElementById('urgent-session-banner');
    var showUrgent = hasSoonSession();
    if (urgent && urgent.getAttribute('data-demo-soon') !== '0') showUrgent = true;
    if (urgent) urgent.hidden = !showUrgent;
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

  function init() {
    syncMainAction();
    bindStoryTopics();
    document.addEventListener('keydown', onKeydown);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('dayo:authchange', syncMainAction);
  document.addEventListener('dayo:ticketchange', syncMainAction);
})();
