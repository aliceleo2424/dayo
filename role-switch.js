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

  function isLoggedIn() {
    if (window._dayoAuthUser) return true;
    if (typeof window.checkUserLoggedIn === 'function') {
      try { return !!window.checkUserLoggedIn(); } catch (e) { /* ignore */ }
    }
    return false;
  }

  function normalizeRole(role) {
    return String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  /* Live DB only — never trust localStorage / user_metadata / _dayoAuthProfile cache */
  async function fetchLiveRoleFromProfiles() {
    var client = window.supabaseClient;
    if (!client || !client.auth) return '';

    var user = null;
    try {
      var userRes = await client.auth.getUser();
      user = userRes && userRes.data && userRes.data.user;
    } catch (e) { user = null; }
    if (!user) {
      try {
        var sessionRes = await client.auth.getSession();
        user = sessionRes && sessionRes.data && sessionRes.data.session && sessionRes.data.session.user;
      } catch (e2) { user = null; }
    }
    if (!user || !user.id) return '';

    try {
      var byId = await client.from('profiles').select('role').eq('id', user.id).single();
      if (byId && byId.data && byId.data.role) return normalizeRole(byId.data.role);
    } catch (e3) { /* fall through */ }
    try {
      var byUser = await client.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
      if (byUser && byUser.data && byUser.data.role) return normalizeRole(byUser.data.role);
    } catch (e4) { /* ignore */ }
    return '';
  }

  function canEnterPartnerLounge(role) {
    var normalized = normalizeRole(role);
    return normalized === 'partner'
      || normalized === 'admin'
      || normalized === 'super_admin'
      || normalized === 'superadmin';
  }

  window.openPartnerApplyModal = openPartnerApplyModal;
  window.closePartnerApplyModal = closePartnerApplyModal;
  window.openLoginModal = openLoginModal;

  window.switchRoleView = async function (targetRole) {
    var goingPartner = targetRole === 'partner';
    if (goingPartner === isPartnerPage()) return;
    if (switchBusy) return;

    if (goingPartner) {
      if (!isLoggedIn()) {
        openLoginModal();
        return;
      }
      switchBusy = true;
      try {
        var role = await fetchLiveRoleFromProfiles();
        if (canEnterPartnerLounge(role)) {
          setPartnerModeUi();
          window.location.href = 'partner.html';
          return;
        }
        setUserModeUi();
        if (!openPartnerApplyModal()) {
          window.location.href = 'partner.html';
        }
      } catch (err) {
        console.warn('[DayO] partner lounge role check failed', err);
        setUserModeUi();
        if (!openPartnerApplyModal()) {
          window.location.href = 'partner.html';
        }
      } finally {
        switchBusy = false;
      }
      return;
    }

    setUserModeUi();
    setTimeout(function () {
      window.location.href = 'mypage.html';
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
