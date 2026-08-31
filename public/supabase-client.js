/* DayO shared Supabase JS client (UMD CDN) — Auth + session_reports */
(function () {
  'use strict';

  var PROJECT_URL = 'https://mmhapsimcngmtefqfrcg.supabase.co';
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1taGFwc2ltY25nbXRlZnFmcmNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNDIwMTgsImV4cCI6MjEwMTkxODAxOH0.aXN0zgjWNqlxxLtygfuTdLlKIf52Ks_oyx2GTd7T0Oo';

  function normalizeUrl(url) {
    return String(url || '').replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  }

  var env = window.__DAYO_ENV__ || {};
  var url = normalizeUrl(env.NEXT_PUBLIC_SUPABASE_URL || PROJECT_URL);
  var key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ANON_KEY;

  window.SUPABASE_URL = url;
  window.SUPABASE_ANON_KEY = key;

  var sdk = window.supabase;
  if (!window.supabaseClient && sdk && typeof sdk.createClient === 'function' && url && key) {
    window.supabaseClient = sdk.createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage
      }
    });
  }

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function hasStoredSession() {
    try {
      var keys = Object.keys(localStorage);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf('sb-') !== 0 || keys[i].indexOf('-auth-token') < 0) continue;
        var raw = localStorage.getItem(keys[i]);
        if (!raw) continue;
        var parsed = JSON.parse(raw);
        if (parsed && (parsed.access_token || (parsed.currentSession && parsed.currentSession.access_token))) {
          return true;
        }
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  window.checkUserLoggedIn = function () {
    if (window._dayoAuthUser) return true;
    if (window.DayOProfileStore && typeof window.DayOProfileStore.isSignedIn === 'function') {
      try { if (window.DayOProfileStore.isSignedIn()) return true; } catch (e) { /* ignore */ }
    }
    return hasStoredSession();
  };

  window.handleNaverFastLogin = function (e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof window.DayOMode === 'object' && typeof window.DayOMode.openLogin === 'function') {
      window.DayOMode.openLogin();
      return;
    }
    var modal = document.getElementById('login-modal')
      || document.querySelector('.login-modal-overlay')
      || document.querySelector('.ms-overlay');
    if (modal) {
      modal.style.display = 'flex';
      modal.classList.add('is-open');
    }
  };

  function rememberLocalProfile(profile, email) {
    if (!profile && !email) return;
    try {
      var name = (profile && (profile.nickname || profile.user_name)) || String(email || '').split('@')[0] || '';
      if (name) {
        localStorage.setItem('userName', name);
        localStorage.setItem('dayo_user_name', name);
      }
      if (email || (profile && profile.email)) {
        var em = email || profile.email;
        localStorage.setItem('dayo_user_email', em);
        localStorage.setItem('dayo_userEmail', em);
      }
      localStorage.setItem('dayo_is_logged_in', 'true');
      localStorage.setItem('dayo.memberSession', 'active');
      if (profile && profile.ticket_count != null) {
        localStorage.setItem('ticketCount', String(profile.ticket_count));
        localStorage.setItem('dayo_ticket_count', String(profile.ticket_count));
      }
      if (profile && profile.point_balance != null) {
        localStorage.setItem('dayo_point_balance', String(profile.point_balance));
      }
    } catch (e) { /* ignore */ }
  }

  window.fetchAuthProfile = async function () {
    var client = window.supabaseClient;
    if (!client) return null;
    var sessionRes = await client.auth.getUser();
    var user = sessionRes && sessionRes.data && sessionRes.data.user;
    window._dayoAuthUser = user || null;
    if (!user) return null;
    var q = await client
      .from('profiles')
      .select('nickname, user_name, ticket_count, point_balance, email')
      .eq('user_id', user.id)
      .maybeSingle();
    if (q.error) {
      q = await client
        .from('profiles')
        .select('user_name, ticket_count, email')
        .eq('user_id', user.id)
        .maybeSingle();
    }
    var profile = q.data || {
      nickname: (user.email || '').split('@')[0],
      ticket_count: 0,
      point_balance: 0,
      email: user.email
    };
    if (!profile.nickname) profile.nickname = profile.user_name || (user.email || '').split('@')[0];
    if (profile.point_balance == null) profile.point_balance = 0;
    rememberLocalProfile(profile, user.email);
    window._dayoAuthProfile = profile;
    document.dispatchEvent(new CustomEvent('dayo:authprofile', { detail: { user: user, profile: profile } }));
    return { user: user, profile: profile };
  };

  window.handleAuthLogin = async function (email, password) {
    var client = window.supabaseClient;
    if (!client) {
      alert('로그인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    email = String(email || '').trim().toLowerCase();
    password = String(password || '');
    if (!email || !password) return;
    if (password.length < 6) {
      alert('비밀번호는 6자 이상이어야 해요.');
      return;
    }

    var signIn = await client.auth.signInWithPassword({ email: email, password: password });
    if (signIn.error) {
      var signUpRes = await client.auth.signUp({
        email: email,
        password: password,
        options: { data: { user_name: email.split('@')[0] } }
      });
      if (signUpRes.error) {
        alert(signUpRes.error.message);
        return;
      }
      var newUser = signUpRes.data && signUpRes.data.user;
      if (newUser && newUser.id) {
        try {
          await client.from('profiles').insert([{
            user_id: newUser.id,
            client_key: 'user:' + newUser.id,
            email: email,
            user_name: email.split('@')[0],
            nickname: email.split('@')[0]
          }]);
        } catch (e) { /* trigger may already have created the row */ }
      }
      if (!(signUpRes.data && signUpRes.data.session)) {
        alert('가입 확인 메일을 보냈어요. 메일함에서 인증 후 다시 로그인해 주세요.');
        return;
      }
    }
    await window.fetchAuthProfile();
    window.location.reload();
  };

  window.handleKakaoLogin = async function () {
    var client = window.supabaseClient;
    if (!client) return;
    var result = await client.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo: window.location.href.split('#')[0] }
    });
    if (result.error) alert(result.error.message);
  };

  window.persistSessionReport = async function (cardData) {
    var client = window.supabaseClient;
    var payload = cardData || {};
    var user = null;
    if (client) {
      try {
        var res = await client.auth.getUser();
        user = res && res.data && res.data.user;
      } catch (e) { user = null; }
    }

    var learnerId = window.dayoLearnerUserId
      || (function () {
        try { return localStorage.getItem('dayo_session_learner_id') || localStorage.getItem('dayo_learner_user_id') || ''; }
        catch (e) { return ''; }
      })()
      || (user && user.id)
      || '';

    if (client && learnerId) {
      var insertRes = await client.from('session_reports').insert([{
        learner_id: learnerId,
        partner_name: payload.partnerName || 'Camille',
        spoken_sentence: payload.sentence,
        keyword: payload.keyword || 'daily',
        illust_url: payload.illustUrl,
        partner_comment: payload.partnerComment,
        stamp: payload.stamp
      }]);
      if (insertRes.error) {
        console.warn('[DayO] session_reports insert failed', insertRes.error);
        try { localStorage.setItem('dayo_last_approved_card', JSON.stringify(payload)); } catch (e) { /* ignore */ }
        return { ok: false, error: insertRes.error };
      }
      if (user && user.id) {
        try {
          var current = await client.from('profiles').select('point_balance').eq('user_id', user.id).maybeSingle();
          var nextPoints = Number((current.data && current.data.point_balance) || 0) + 6000;
          await client.from('profiles').update({ point_balance: nextPoints }).eq('user_id', user.id);
        } catch (e) { /* ignore payout update failure */ }
      }
      return { ok: true, learnerId: learnerId };
    }

    try { localStorage.setItem('dayo_last_approved_card', JSON.stringify(payload)); } catch (e) { /* ignore */ }
    return { ok: false, skipped: true };
  };

  window.loadUserReports = async function () {
    var container = document.getElementById('mypage-card-feed');
    if (!container) return;
    var client = window.supabaseClient;
    var user = null;
    if (client) {
      try {
        var res = await client.auth.getUser();
        user = res && res.data && res.data.user;
      } catch (e) { user = null; }
    }

    if (!user) {
      container.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">로그인 후 대화 리포트를 확인해 보세요.</div>';
      return;
    }

    var query = await client
      .from('session_reports')
      .select('*')
      .eq('learner_id', user.id)
      .order('created_at', { ascending: false });

    var reports = query.data;
    if (query.error) {
      console.warn('[DayO] loadUserReports failed', query.error);
    }

    if (reports && reports.length > 0) {
      container.innerHTML = reports.map(function (r) {
        return (
          '<div class="dayo-report-card" style="background:#FFF9ED; border:1.5px solid #EDE4D5; border-radius:14px; padding:14px; margin-bottom:12px;">' +
            '<div style="display:flex; justify-content:space-between; font-size:11px; color:#888; margin-bottom:8px;">' +
              '<span>With <strong>' + esc(r.partner_name || 'DayO Partner') + '</strong></span>' +
              '<span>' + esc(r.created_at ? new Date(r.created_at).toLocaleDateString() : '') + '</span>' +
            '</div>' +
            '<div style="display:flex; gap:12px; align-items:center;">' +
              '<img src="' + esc(r.illust_url || 'https://api.iconify.design/fluent-emoji:sparkles.svg') + '" alt="" style="width:60px; height:60px; object-fit:contain; border-radius:10px; background:#fff; padding:4px;" />' +
              '<div>' +
                '<div style="font-weight:800; font-size:13px; color:#3E4A42;">"' + esc(r.spoken_sentence || '') + '"</div>' +
                '<div style="font-size:11px; color:#4F7460; margin-top:4px;">💬 파트너: ' + esc(r.partner_comment || '오늘 대화 훌륭했어요!') + '</div>' +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('');
    } else {
      container.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">아직 완료된 세션 리포트가 없습니다.</div>';
    }
  };

  window.bindLearnerSessionId = async function () {
    var client = window.supabaseClient;
    if (!client) return;
    try {
      var res = await client.auth.getUser();
      var user = res && res.data && res.data.user;
      if (!user) return;
      window.dayoLearnerUserId = user.id;
      localStorage.setItem('dayo_learner_user_id', user.id);
      var params = new URLSearchParams(window.location.search);
      var role = (params.get('role') || '').toLowerCase();
      if (role === 'user' || role === 'learner') {
        localStorage.setItem('dayo_session_learner_id', user.id);
      }
    } catch (e) { /* ignore */ }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.fetchAuthProfile();
      window.bindLearnerSessionId();
      if (document.getElementById('mypage-card-feed')) window.loadUserReports();
    });
  } else {
    window.fetchAuthProfile();
    window.bindLearnerSessionId();
    if (document.getElementById('mypage-card-feed')) window.loadUserReports();
  }
})();
