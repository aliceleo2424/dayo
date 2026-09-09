/* DayO mypage compact header + talk-card album modal */
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

  function syncMainAction() {
    var btn = document.getElementById('main-action-btn');
    var urgent = document.getElementById('urgent-session-banner');
    var showUrgent = hasSoonSession();
    if (urgent && urgent.getAttribute('data-demo-soon') !== '0') showUrgent = true;
    if (urgent) urgent.hidden = !showUrgent;
    if (btn) {
      btn.hidden = false;
      btn.textContent = '대화 파트너 둘러보기 ➔';
      btn.onclick = function (e) {
        e.preventDefault();
        var target = document.getElementById('partners-list');
        if (target && typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        window.location.hash = 'partners-list';
      };
    }
  }

  window.enterStudio = function () {
    window.location.href = 'room.html?role=user';
  };

  window.openCardDetailModal = function (index) {
    var modal = document.getElementById('card-detail-modal');
    var body = document.getElementById('card-detail-body');
    if (!modal) return;
    var reports = window.__dayoTalkAlbum || [];
    var idx = (typeof index === 'number' && index >= 0) ? index : 0;
    var report = reports[idx];
    if (body) {
      if (report && typeof window.renderViralReportCardForModal === 'function') {
        body.innerHTML = window.renderViralReportCardForModal(report);
      } else if (!report) {
        body.innerHTML = '<p style="text-align:center;color:#888;font-size:13px;padding:24px 8px;">열어볼 대화 카드가 아직 없어요.</p>';
      }
    }
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    var closeBtn = modal.querySelector('.card-detail-close');
    if (closeBtn && closeBtn.focus) closeBtn.focus();
  };

  window.closeCardDetailModal = function () {
    var modal = document.getElementById('card-detail-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = 'auto';
  };

  function onKeydown(e) {
    if (e.key !== 'Escape') return;
    var modal = document.getElementById('card-detail-modal');
    if (modal && modal.style.display === 'flex') window.closeCardDetailModal();
  }

  function init() {
    syncMainAction();
    document.addEventListener('keydown', onKeydown);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('dayo:authchange', syncMainAction);
})();
