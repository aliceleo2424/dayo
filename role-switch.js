/* DayO user ↔ partner segmented role switch */
(function () {
  'use strict';

  function isPartnerPage() {
    var path = String(window.location.pathname || '');
    return path.indexOf('partner') !== -1;
  }

  function setUserModeUi() {
    var glider = document.getElementById('segmented-glider');
    var userTab = document.getElementById('tab-user-mode');
    var partnerTab = document.getElementById('tab-partner-mode');
    if (glider) glider.style.transform = 'translateX(0%)';
    if (userTab) {
      userTab.style.color = '#111';
      userTab.setAttribute('aria-pressed', 'true');
    }
    if (partnerTab) {
      partnerTab.style.color = '#888';
      partnerTab.setAttribute('aria-pressed', 'false');
    }
  }

  function setPartnerModeUi() {
    var glider = document.getElementById('segmented-glider');
    var userTab = document.getElementById('tab-user-mode');
    var partnerTab = document.getElementById('tab-partner-mode');
    if (glider) glider.style.transform = 'translateX(100%)';
    if (partnerTab) {
      partnerTab.style.color = '#111';
      partnerTab.setAttribute('aria-pressed', 'true');
    }
    if (userTab) {
      userTab.style.color = '#888';
      userTab.setAttribute('aria-pressed', 'false');
    }
  }

  function initRoleSwitchState() {
    if (!document.getElementById('segmented-glider')) return;
    if (isPartnerPage()) setPartnerModeUi();
    else setUserModeUi();
  }

  function openLoginModal() {
    if (window.DayOMode && typeof window.DayOMode.openLogin === 'function') {
      window.DayOMode.openLogin();
      return;
    }
    if (typeof window.handleNaverFastLogin === 'function') {
      window.handleNaverFastLogin();
    }
  }

  function openPartnerApplyModal() {
    var overlay = document.getElementById('partner-apply-modal');
    if (!overlay) return false;
    overlay.hidden = false;
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    return true;
  }

  function closePartnerApplyModal() {
    var overlay = document.getElementById('partner-apply-modal');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.hidden = true;
    document.body.style.overflow = '';
  }

  window.openPartnerApplyModal = openPartnerApplyModal;
  window.closePartnerApplyModal = closePartnerApplyModal;
  window.openLoginModal = openLoginModal;

  /* Partner lounge gate runs on partner.html — navigate immediately from mypage toggle */
  window.switchRoleView = function (targetRole) {
    var goingPartner = targetRole === 'partner';
    if (goingPartner === isPartnerPage()) return;

    if (goingPartner) {
      setPartnerModeUi();
      window.location.href = 'partner.html';
      return;
    }

    setUserModeUi();
    window.location.href = 'mypage.html';
  };

  function bindPartnerApplyModal() {
    var overlay = document.getElementById('partner-apply-modal');
    if (!overlay) return;
    var closeBtn = document.getElementById('partner-apply-close');
    if (closeBtn) closeBtn.addEventListener('click', closePartnerApplyModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closePartnerApplyModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) {
        closePartnerApplyModal();
      }
    });
  }

  function bindPartnerLinks() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest && e.target.closest('a[href="partner.html"], a[href="/partner.html"]');
      if (!link) return;
      if (isPartnerPage()) return;
      e.preventDefault();
      window.switchRoleView('partner');
    });
  }

  function init() {
    initRoleSwitchState();
    bindPartnerApplyModal();
    bindPartnerLinks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
