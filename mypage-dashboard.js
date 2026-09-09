/* DayO mypage compact header — greeting, ticket, primary action */
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

  function init() {
    syncMainAction();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('dayo:authchange', syncMainAction);
})();
