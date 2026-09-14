/* DayO user ↔ partner segmented role switch */
(function () {
  'use strict';

  var switchBusy = false;

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
    if (!overlay) return;
    overlay.hidden = false;
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closePartnerApplyModal() {
    var overlay = document.getElementById('partner-apply-modal');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.hidden = true;
    document.body.style.overflow = '';
  }

  function isLoggedIn() {
    if (window._dayoAuthUser) return true;
    if (typeof window.checkUserLoggedIn === 'function') {
      try { return !!window.checkUserLoggedIn(); } catch (e) { /* ignore */ }
    }
    return false;
  }

  async function fetchCurrentRole() {
    var cached = window._dayoAuthProfile && window._dayoAuthProfile.role;
    var client = window.supabaseClient;
    if (!client || !client.auth) return String(cached || '').toLowerCase();
    var sessionRes = await client.auth.getSession();
    var session = sessionRes && sessionRes.data && sessionRes.data.session;
    var user = (session && session.user) || window._dayoAuthUser;
    if (!user) return String(cached || '').toLowerCase();
    var q = await client.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
    if (q.error || !q.data) {
      q = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
    }
    var role = String((q.data && q.data.role) || cached || '').toLowerCase();
    if (role && window._dayoAuthProfile) window._dayoAuthProfile.role = role;
    return role;
  }

  function canEnterPartnerLounge(role) {
    var normalized = String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return normalized === 'partner' || normalized === 'admin' || normalized === 'super_admin' || normalized === 'superadmin';
  }

  window.openPartnerApplyModal = openPartnerApplyModal;
  window.closePartnerApplyModal = closePartnerApplyModal;
  window.openLoginModal = openLoginModal;

  window.switchRoleView = async function (targetRole) {
    var goingPartner = targetRole === 'partner';
    if (goingPartner === isPartnerPage()) return;
    if (switchBusy) return;

    if (goingPartner) {
      window.location.href = '/partner.html';
      return;
    }

    setUserModeUi();
    setTimeout(function () {
      window.location.href = '/mypage.html';
    }, 180);
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
