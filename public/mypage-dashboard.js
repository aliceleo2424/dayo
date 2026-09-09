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

  function syncMainAction() {
    var btn = document.getElementById('main-action-btn');
    if (!btn) return;
    if (hasActiveBooking()) {
      btn.textContent = '☕ 라운지 입장';
      btn.onclick = function () {
        window.location.href = 'room.html?role=user';
      };
      return;
    }
    btn.textContent = '💬 대화 파트너 예약하기';
    btn.onclick = function () {
      if (window.DayOBooking && typeof window.DayOBooking.requestOpen === 'function') {
        window.DayOBooking.requestOpen();
        return;
      }
      window.location.href = 'index.html?booking=open';
    };
  }

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
