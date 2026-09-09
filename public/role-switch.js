/* DayO user ↔ partner segmented role switch */
(function () {
  'use strict';

  function isPartnerPage() {
    var path = String(window.location.pathname || '');
    return path.indexOf('partner') !== -1;
  }

  function initRoleSwitchState() {
    var glider = document.getElementById('segmented-glider');
    var userTab = document.getElementById('tab-user-mode');
    var partnerTab = document.getElementById('tab-partner-mode');
    if (!glider || !userTab || !partnerTab) return;

    if (isPartnerPage()) {
      glider.style.transform = 'translateX(100%)';
      partnerTab.style.color = '#111';
      userTab.style.color = '#888';
      partnerTab.setAttribute('aria-pressed', 'true');
      userTab.setAttribute('aria-pressed', 'false');
    } else {
      glider.style.transform = 'translateX(0%)';
      userTab.style.color = '#111';
      partnerTab.style.color = '#888';
      userTab.setAttribute('aria-pressed', 'true');
      partnerTab.setAttribute('aria-pressed', 'false');
    }
  }

  window.switchRoleView = function (targetRole) {
    var glider = document.getElementById('segmented-glider');
    var userTab = document.getElementById('tab-user-mode');
    var partnerTab = document.getElementById('tab-partner-mode');
    var goingPartner = targetRole === 'partner';

    if (goingPartner === isPartnerPage()) return;

    if (goingPartner) {
      if (glider) glider.style.transform = 'translateX(100%)';
      if (partnerTab) {
        partnerTab.style.color = '#111';
        partnerTab.setAttribute('aria-pressed', 'true');
      }
      if (userTab) {
        userTab.style.color = '#888';
        userTab.setAttribute('aria-pressed', 'false');
      }
      setTimeout(function () {
        window.location.href = 'partner.html';
      }, 180);
      return;
    }

    if (glider) glider.style.transform = 'translateX(0%)';
    if (userTab) {
      userTab.style.color = '#111';
      userTab.setAttribute('aria-pressed', 'true');
    }
    if (partnerTab) {
      partnerTab.style.color = '#888';
      partnerTab.setAttribute('aria-pressed', 'false');
    }
    setTimeout(function () {
      window.location.href = 'mypage.html';
    }, 180);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRoleSwitchState);
  } else {
    initRoleSwitchState();
  }
})();
