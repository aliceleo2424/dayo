/* DayO global logout — always purge tokens and leave, even if the network hangs */
(function () {
  'use strict';

  function getAuthClient() {
    if (window.supabaseClient && window.supabaseClient.auth) return window.supabaseClient;
    if (window.supabase && window.supabase.auth && typeof window.supabase.auth.signOut === 'function') {
      return window.supabase;
    }
    return null;
  }

  function purgeLocalAuth() {
    try { window.localStorage.clear(); } catch (e) { /* ignore quota / private mode */ }
    try { window.sessionStorage.clear(); } catch (e) { /* ignore */ }

    window._dayoAuthUser = null;
    window._dayoAuthProfile = null;
  }

  function goHome() {
    try {
      if (window.location.protocol === 'file:') {
        window.location.replace(new URL('index.html', window.location.href).href);
        return;
      }
      window.location.replace('/');
    } catch (e) {
      window.location.href = '/';
    }
  }

  window.handleLogout = async function (event) {
    if (window.__dayoLogoutBusy) return;
    window.__dayoLogoutBusy = true;

    if (event) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
    }

    try {
      var client = getAuthClient();
      if (client && client.auth && typeof client.auth.signOut === 'function') {
        await Promise.race([
          client.auth.signOut(),
          new Promise(function (resolve) { setTimeout(resolve, 1500); })
        ]);
      }
    } catch (err) {
      console.warn('Supabase signOut API 호출 실패(로컬 정리 강제 진행):', err);
    } finally {
      purgeLocalAuth();
      goHome();
    }
  };
})();
