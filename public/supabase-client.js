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

  var NICKNAME_KEY = 'dayo_user_nickname';

  function emailPrefix(email) {
    var raw = String(email || '').trim();
    if (!raw || raw.indexOf('@') < 1) return '';
    return raw.split('@')[0];
  }

  window.getCachedNickname = function () {
    try {
      return String(localStorage.getItem(NICKNAME_KEY) || '').trim();
    } catch (e) {
      return '';
    }
  };

  window.cacheNickname = function (name) {
    var next = String(name || '').trim();
    if (!next) return;
    try {
      localStorage.setItem(NICKNAME_KEY, next);
      localStorage.setItem('userName', next);
      localStorage.setItem('dayo_user_name', next);
    } catch (e) { /* ignore */ }
  };

  window.updateProfileUI = function (name) {
    var next = String(name || '').trim();
    if (!next) return;
    window.cacheNickname(next);
    window._dayoAuthProfile = Object.assign({}, window._dayoAuthProfile || {}, {
      nickname: next,
      user_name: next
    });
    if (window.DayOMode && typeof window.DayOMode.refresh === 'function') {
      window.DayOMode.refresh();
    }
    if (window.DayOGreeting && typeof window.DayOGreeting.refresh === 'function') {
      window.DayOGreeting.refresh();
    }
    document.dispatchEvent(new CustomEvent('dayo:authprofile', {
      detail: { user: window._dayoAuthUser, profile: window._dayoAuthProfile }
    }));
  };

  window.persistNickname = async function (newNickname) {
    var next = String(newNickname || '').trim();
    var client = window.supabaseClient;
    if (!next) throw new Error('닉네임을 입력해 주세요.');
    if (!client || !client.auth) throw new Error('로그인 세션을 찾지 못했어요.');
    var sessionRes = await client.auth.getSession();
    var session = sessionRes && sessionRes.data && sessionRes.data.session;
    if (!session || !session.user) throw new Error('로그인이 필요해요.');
    var payload = { nickname: next, user_name: next };
    var res = await client.from('profiles').update(payload).eq('user_id', session.user.id).select('nickname, user_id');
    if (res.error || !res.data || !res.data.length) {
      res = await client.from('profiles').update(payload).eq('id', session.user.id).select('nickname');
    }
    if (res.error) throw res.error;
    if (!res.data || !res.data.length) throw new Error('프로필을 찾지 못했어요.');
    window.updateProfileUI(next);
    return next;
  };

  function rememberLocalProfile(profile, email) {
    if (!profile && !email) return;
    try {
      var cached = window.getCachedNickname();
      var name = (profile && (profile.nickname || profile.user_name)) || cached || emailPrefix(email);
      if (name) {
        window.cacheNickname(name);
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
    var profileCols = 'nickname, role, user_name, ticket_count, point_balance, email, speaking_level, last_test_score, last_test_date, streak_count';
    var q = await client
      .from('profiles')
      .select(profileCols)
      .eq('user_id', user.id)
      .maybeSingle();
    if ((q.error || !q.data) && user.id) {
      q = await client
        .from('profiles')
        .select(profileCols)
        .eq('id', user.id)
        .maybeSingle();
    }
    if (q.error) {
      q = await client
        .from('profiles')
        .select('user_name, ticket_count, email')
        .eq('user_id', user.id)
        .maybeSingle();
    }
    var profile = q.data || {
      nickname: window.getCachedNickname() || emailPrefix(user.email),
      ticket_count: 0,
      point_balance: 0,
      email: user.email
    };
    var dbNick = String((profile && profile.nickname) || '').trim();
    var dbUserName = String((profile && profile.user_name) || '').trim();
    var cachedNickname = window.getCachedNickname();
    var fallback = emailPrefix(user.email);
    if (dbNick && !(cachedNickname && dbNick === fallback && cachedNickname !== fallback)) {
      profile.nickname = dbNick;
    } else if (cachedNickname) {
      profile.nickname = cachedNickname;
    } else if (dbUserName && dbUserName !== fallback) {
      profile.nickname = dbUserName;
    } else {
      profile.nickname = fallback;
    }
    if (profile.point_balance == null) profile.point_balance = 0;
    rememberLocalProfile(profile, user.email);
    window._dayoAuthProfile = profile;
    window.updateProfileUI(profile.nickname);
    if (cachedNickname && profile.nickname === cachedNickname && dbNick !== cachedNickname) {
      client.from('profiles').update({ nickname: cachedNickname, user_name: cachedNickname }).eq('user_id', user.id)
        .then(function (heal) {
          if (heal && (heal.error || !heal.data)) {
            client.from('profiles').update({ nickname: cachedNickname, user_name: cachedNickname }).eq('id', user.id);
          }
        })
        .catch(function () { /* ignore heal */ });
    }
    try {
      var hist = JSON.parse(localStorage.getItem('dayo_speaking_test_history') || '[]');
      var latest = Array.isArray(hist) ? hist[0] : null;
      if (latest && latest.last_test_date) {
        var remoteDate = profile.last_test_date ? new Date(profile.last_test_date).getTime() : 0;
        var localDate = new Date(latest.last_test_date).getTime();
        if (!remoteDate || localDate > remoteDate) {
          var speakingUpdate = {
            speaking_level: latest.speaking_level,
            last_test_score: latest.last_test_score,
            last_test_date: latest.last_test_date
          };
          var synced = await client.from('profiles').update(speakingUpdate).eq('user_id', user.id);
          if (synced && !synced.error) {
            profile.speaking_level = latest.speaking_level;
            profile.last_test_score = latest.last_test_score;
            profile.last_test_date = latest.last_test_date;
            window._dayoAuthProfile = profile;
          }
        }
      }
    } catch (e) { /* ignore pending speaking sync */ }
    var createdAt = user.created_at ? new Date(user.created_at).getTime() : 0;
    var isNewUser = createdAt && (Date.now() - createdAt < 24 * 60 * 60 * 1000);
    var wantsWelcome = !!(user.user_metadata && user.user_metadata.welcome_ticket);
    if ((wantsWelcome || isNewUser) && Number(profile.ticket_count) < 1) {
      try {
        await client.from('profiles').update({ ticket_count: 1 }).eq('user_id', user.id);
        profile.ticket_count = 1;
        rememberLocalProfile(profile, user.email);
        window._dayoAuthProfile = profile;
      } catch (e) { /* ignore */ }
    }
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
    window.location.href = '/mypage.html';
  };

  var AUTH_REDIRECT = 'https://www.dayotalk.com/mypage.html';

  function getSupabaseAuth() {
    if (window.supabaseClient && window.supabaseClient.auth) return window.supabaseClient;
    if (window.supabase && window.supabase.auth && typeof window.supabase.auth.signUp === 'function') {
      return window.supabase;
    }
    return null;
  }

  async function grantWelcomeTicket(client, user, email) {
    if (!client || !user || !user.id) return;
    var nickname = (email || user.email || '').split('@')[0] || 'DayO';
    try {
      var existing = await client
        .from('profiles')
        .select('ticket_count, user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing.data && existing.data.user_id) {
        if (Number(existing.data.ticket_count) < 1) {
          await client.from('profiles').update({ ticket_count: 1 }).eq('user_id', user.id);
        }
      } else {
        await client.from('profiles').insert([{
          user_id: user.id,
          client_key: 'user:' + user.id,
          email: email || user.email || '',
          user_name: nickname,
          nickname: nickname,
          ticket_count: 1,
          has_welcome_coupon: true
        }]);
      }
    } catch (e) { /* trigger may already have created the row */ }
    if (typeof window.fetchAuthProfile === 'function') {
      try { await window.fetchAuthProfile(); } catch (err) { /* ignore */ }
    }
  }

  window.handleEmailSignUp = async function (email, password) {
    var supabase = getSupabaseAuth();
    email = String(email || '').trim().toLowerCase();
    password = String(password || '');
    if (!email || !password) return;
    if (password.length < 6) {
      alert('비밀번호는 6자리 이상이어야 해요.');
      return;
    }
    if (!supabase || !supabase.auth) {
      alert('로그인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        emailRedirectTo: AUTH_REDIRECT,
        data: { user_name: email.split('@')[0], welcome_ticket: true }
      }
    });

    if (error) {
      alert('회원가입 오류: ' + error.message);
      return;
    }

    if (data.session) {
      await grantWelcomeTicket(supabase, data.user, email);
      alert('환영합니다! 웰컴 티켓 1장이 지급되었습니다 🎟️');
      window.location.href = '/mypage.html';
    } else {
      alert('인증 메일이 발송되었습니다. 메일함에서 링크를 클릭해 가입을 완료해 주세요!');
    }
  };

  window.handleEmailSignIn = async function (email, password) {
    var supabase = getSupabaseAuth();
    email = String(email || '').trim().toLowerCase();
    password = String(password || '');
    if (!email || !password) return;
    if (password.length < 6) {
      alert('비밀번호는 6자리 이상이어야 해요.');
      return;
    }
    if (!supabase || !supabase.auth) {
      alert('로그인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      alert('로그인 실패: ' + error.message);
      return;
    }
    if (data && data.user && data.user.user_metadata && data.user.user_metadata.welcome_ticket) {
      await grantWelcomeTicket(supabase, data.user, email);
    } else if (typeof window.fetchAuthProfile === 'function') {
      try { await window.fetchAuthProfile(); } catch (e) { /* ignore */ }
    }
    window.location.href = '/mypage.html';
  };

  window.handleKakaoLogin = async function () {
    var supabase = getSupabaseAuth();
    if (!supabase || !supabase.auth) {
      alert('카카오 로그인 처리 중 오류가 발생했습니다.');
      return;
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        redirectTo: AUTH_REDIRECT
      }
    });
    if (error) {
      console.error('카카오 로그인 에러:', error);
      alert('카카오 로그인 처리 중 오류가 발생했습니다.');
    }
  };

  window.handleGoogleLogin = async function () {
    var supabase = getSupabaseAuth();
    if (!supabase || !supabase.auth) {
      alert('로그인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: AUTH_REDIRECT
      }
    });
    if (error) alert('구글 로그인 실패: ' + error.message);
  };

  window.openPaymentModal = function () {
    if (window.DayOTickets && typeof window.DayOTickets.open === 'function') {
      window.DayOTickets.open();
      return;
    }
    var trigger = document.querySelector('[data-tickets-open]');
    if (trigger) trigger.click();
  };

  function getRpcClient() {
    return window.supabaseClient || null;
  }

  function normalizeRpcPayload(data) {
    var payload = data;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (e) { payload = { success: false, message: payload }; }
    }
    if (Array.isArray(payload) && payload[0]) payload = payload[0];
    return payload && typeof payload === 'object' ? payload : { success: false, message: '응답이 올바르지 않습니다.' };
  }

  function syncRemainingTickets(remaining) {
    if (remaining == null || remaining === '') return;
    var n = Number(remaining);
    if (!Number.isFinite(n) || n < 0) return;
    if (window.DayOTicketWallet && typeof window.DayOTicketWallet.setCount === 'function') {
      window.DayOTicketWallet.setCount(n);
      return;
    }
    try {
      localStorage.setItem('ticketCount', String(n));
      localStorage.setItem('dayo_ticket_count', String(n));
    } catch (e) { /* ignore */ }
  }

  window.handleConfirmBooking = async function (learnerId, bookingId, extras) {
    var supabase = getRpcClient();
    if (!supabase || typeof supabase.rpc !== 'function') {
      alert('예약 처리 중 통신 오류가 발생했습니다.');
      return false;
    }
    extras = extras || {};
    var params = {
      p_learner_id: learnerId,
      p_booking_id: bookingId
    };
    if (extras.slotId) params.p_slot_id = extras.slotId;
    if (extras.partnerId) params.p_partner_id = extras.partnerId;

    try {
      var result = await supabase.rpc('deduct_ticket_and_confirm_booking', params);
      if (result.error && (params.p_slot_id || params.p_partner_id)) {
        result = await supabase.rpc('deduct_ticket_and_confirm_booking', {
          p_learner_id: learnerId,
          p_booking_id: bookingId
        });
      }

      if (result.error) throw result.error;

      var payload = normalizeRpcPayload(result.data);
      if (!payload.success) {
        if (String(payload.message || '').includes('부족')) {
          alert('보유하신 티켓이 없습니다. 단건 체험권을 충전해 주세요!');
          if (typeof openPaymentModal === 'function') openPaymentModal();
        } else {
          alert(payload.message || '예약을 확정할 수 없습니다.');
        }
        return false;
      }

      syncRemainingTickets(payload.remaining_tickets);
      console.log('✅ 잔여 티켓:', payload.remaining_tickets);
      return true;
    } catch (err) {
      console.error('티켓 차감 실패:', err);
      alert('예약 처리 중 통신 오류가 발생했습니다.');
      return false;
    }
  };

  window.handleCompleteSession = async function (bookingId, partnerUserId) {
    var supabase = getRpcClient();
    if (!supabase || typeof supabase.rpc !== 'function') return false;
    try {
      const { data, error } = await supabase.rpc('complete_session_and_reward_partner', {
        p_booking_id: bookingId,
        p_partner_user_id: partnerUserId,
        p_reward_amount: 6000
      });

      if (error) throw error;

      var payload = normalizeRpcPayload(data);
      if (payload.success) {
        if (payload.updated_points != null) {
          try { localStorage.setItem('dayo_point_balance', String(payload.updated_points)); } catch (e) { /* ignore */ }
        }
        console.log('✅ 파트너 정산 완료! 누적 포인트:', payload.updated_points);
        return true;
      }
      console.warn('정산 안내:', payload.message);
      return false;
    } catch (err) {
      console.error('파트너 정산 오류:', err);
      return false;
    }
  };

  window.createPendingBooking = async function (fields) {
    var supabase = getRpcClient();
    var row = fields || {};
    if (!supabase) return null;
    var insertRes = await supabase.from('bookings').insert([{
      learner_id: row.learner_id,
      partner_user_id: row.partner_user_id || row.partner_id || null,
      partner_id: row.partner_id || row.partner_user_id || null,
      partner_name: row.partner_name || '',
      language: row.language || '',
      scheduled_at: row.scheduled_at || null,
      slot_id: row.slot_id || null,
      status: 'pending'
    }]).select('id').single();
    if (insertRes.error) {
      console.warn('[DayO] booking insert failed', insertRes.error);
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
      return null;
    }
    return insertRes.data && insertRes.data.id;
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
      return { ok: true, learnerId: learnerId };
    }

    try { localStorage.setItem('dayo_last_approved_card', JSON.stringify(payload)); } catch (e) { /* ignore */ }
    return { ok: false, skipped: true };
  };

  function normalizeReportCard(r) {
    if (!r) return null;
    return {
      partner_name: r.partner_name || r.partnerName || 'DayO Partner',
      spoken_sentence: r.spoken_sentence || r.sentence || '',
      keyword: r.keyword || 'daily',
      illust_url: r.illust_url || r.illustUrl || ('https://image.pollinations.ai/prompt/' + encodeURIComponent('cute coffee, cute 3d pastel clay illustration, warm cozy aesthetic') + '?width=400&height=400&nologo=true'),
      partner_comment: r.partner_comment || r.partnerComment || '',
      created_at: r.created_at || r.approvedAt || r.createdAt || ''
    };
  }

  function readLocalApprovedCard() {
    try {
      return normalizeReportCard(JSON.parse(localStorage.getItem('dayo_last_approved_card') || 'null'));
    } catch (e) {
      return null;
    }
  }

  function talkQuoteLabel(r) {
    return String((r && r.partner_name) || '파트너').split(/\s+/)[0] || '파트너';
  }

  function talkQuoteText(r) {
    var raw = String((r && r.partner_comment) || '').replace(/^\s+|\s+$/g, '');
    var banned = /발화량|점수|레벨|훌륭했어요|망원한강|성수동 서울숲|성수동 소품/;
    if (!raw || banned.test(raw)) return '';
    return raw.replace(/^["“”']+|["“”']+$/g, '');
  }

  function isPlaceholderReport(r) {
    if (!r) return true;
    var sentence = String(r.spoken_sentence || '').trim();
    var keyword = String(r.keyword || '').toLowerCase();
    var partner = String(r.partner_name || '').toLowerCase();
    if (!sentence) return true;
    if (/small talk makes a big day/i.test(sentence)) return true;
    if (keyword === 'small' && partner.indexOf('camille') !== -1) return true;
    return false;
  }

  function homeEmptyStateHtml() {
    return (
      '<div class="auth-report-empty">' +
        '<p class="auth-report-empty__title">아직 도착한 대화 리포트가 없어요 ☕</p>' +
        '<p class="auth-report-empty__desc">다정한 파트너와 첫 1:1 대화를 나누고 나면, 파트너의 따뜻한 칭찬 카드와 AI 복습 리포트가 여기에 기록돼요!</p>' +
        '<a href="#auth-partners" class="auth-report-empty__cta">첫 대화 파트너 둘러보기</a>' +
      '</div>'
    );
  }

  function utteranceFromLog(row) {
    var transcript = row && row.transcript;
    if (!Array.isArray(transcript)) return '';
    var line = null;
    for (var i = transcript.length - 1; i >= 0; i -= 1) {
      var item = transcript[i] || {};
      var role = String(item.role || item.speaker || '').toLowerCase();
      var text = String(item.text || item.content || item.message || '').trim();
      if (text && (role === 'user' || role === 'learner' || role === 'me')) {
        line = text;
        break;
      }
      if (!line && text) line = text;
    }
    return line || '';
  }

  function reportFromSessionLog(row) {
    if (!row) return null;
    return normalizeReportCard({
      partner_name: row.partner_name || 'DayO Partner',
      spoken_sentence: utteranceFromLog(row) || '오늘도 따뜻한 대화 한 잔',
      keyword: row.keyword || 'daily',
      partner_comment: row.partner_comment || '',
      created_at: row.ended_at || row.created_at || ''
    });
  }

  function topicLabel(r) {
    var k = String((r && r.keyword) || '').toLowerCase();
    if (/korea|한국|korean/.test(k)) return '한국에서 발견한 것들';
    if (/taste|취향|compare|집순/.test(k)) return '우리의 취향 비교';
    if (/daily|일상|americano|smalltalk|cafe|pottery|취미/.test(k)) return '요즘 나의 일상';
    var raw = String((r && r.keyword) || '').replace(/^#/, '').trim();
    return raw || '요즘 나의 일상';
  }

  function topicEmoji(r) {
    var k = String((r && r.keyword) || '').toLowerCase();
    if (/korea|한국|korean/.test(k)) return '🇰🇷';
    if (/taste|취향|compare/.test(k)) return '⚖️';
    return '🌸';
  }

  function memorablePhrase(r) {
    var phrase = String((r && r.spoken_sentence) || '').replace(/^\s+|\s+$/g, '');
    return phrase || "I've been into pottery lately.";
  }

  function formatAlbumDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1);
      var day = String(d.getDate());
      if (m.length < 2) m = '0' + m;
      if (day.length < 2) day = '0' + day;
      return y + '.' + m + '.' + day;
    } catch (e) {
      return '';
    }
  }

  function renderTalkThumb(r, idx) {
    var name = talkQuoteLabel(r);
    var dateLabel = formatAlbumDate(r.created_at);
    var keyword = String((r && r.keyword) || 'SmallTalk').replace(/^#/, '');
    var img = esc((r && r.illust_url) || '');
    return (
      '<button type="button" class="card-thumb-item" onclick="openCardDetailModal(' + idx + ')" style="background: #FFF9F5; border-radius: 16px; padding: 14px; border: 1px solid #FFEBE4; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; text-align: center; font-family: inherit; width: 100%;">' +
        '<div style="font-size: 11px; color: #999; margin-bottom: 6px; display: flex; justify-content: space-between;">' +
          '<span>With ' + esc(name) + '</span>' +
          '<span>' + esc(dateLabel) + '</span>' +
        '</div>' +
        '<div style="width: 100%; aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: #fff; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; box-shadow: inset 0 0 4px rgba(0,0,0,0.04);">' +
          (img
            ? '<img src="' + img + '" alt="오늘의 픽" style="width: 100%; height: 100%; object-fit: cover;">'
            : '<span style="font-size:40px" aria-hidden="true">☕</span>') +
        '</div>' +
        '<div style="font-size: 12px; font-weight: 700; color: #333; margin-bottom: 2px;">#' + esc(keyword) + '</div>' +
        '<div style="font-size: 11px; color: #FF5A36; font-weight: 600;">카드 열기 ➔</div>' +
      '</button>'
    );
  }

  function renderReportArchiveItem(r, idx) {
    var name = talkQuoteLabel(r);
    var dateLabel = formatAlbumDate(r.created_at) || '날짜 미정';
    var topic = topicLabel(r);
    var img = esc((r && r.illust_url) || '');
    var icon = img
      ? '<img src="' + img + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">'
      : '<span aria-hidden="true">' + topicEmoji(r) + '</span>';
    return (
      '<button type="button" class="mypage-report-item" onclick="openReportDetailModal(\'report-' + (idx + 1) + '\')" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; padding: 14px 16px; background: #FFF9F5; border: 1px solid #FFEBE4; border-radius: 14px; cursor: pointer; transition: all 0.2s ease; text-align: left; font-family: inherit;">' +
        '<div style="display: flex; align-items: center; gap: 12px; min-width: 0;">' +
          '<div style="width: 44px; height: 44px; border-radius: 10px; background: #FFE5DC; display: flex; align-items: center; justify-content: center; font-size: 20px; overflow: hidden; flex: 0 0 auto;">' + icon + '</div>' +
          '<div style="min-width: 0;">' +
            '<div style="font-size: 14px; font-weight: 700; color: #333;">' + esc(name) + ' 파트너와의 대화</div>' +
            '<div style="font-size: 12px; color: #888; margin-top: 2px;">' + esc(dateLabel) + ' · 주제: ' + esc(topic) + '</div>' +
          '</div>' +
        '</div>' +
        '<span style="font-size: 12px; color: #FF5A36; font-weight: 700; white-space: nowrap;">리포트 &amp; 카드 보기 ➔</span>' +
      '</button>'
    );
  }

  function renderViralReportCard(r, isPrimary, opts) {
    opts = opts || {};
    var captureId = isPrimary ? ' id="insta-card-capture"' : '';
    var btnId = isPrimary ? ' id="btn-save-card"' : '';
    var dateLabel = '';
    try {
      dateLabel = r.created_at ? new Date(r.created_at).toLocaleDateString() : '';
    } catch (e) { dateLabel = ''; }
    var card =
      '<div' + captureId + ' class="viral-card" style="width:100%; max-width:320px; aspect-ratio:4/5; background:linear-gradient(135deg,#FFF9ED 0%,#FEE8D6 100%); border:1.5px solid #EDE4D5; border-radius:16px; padding:16px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 10px 24px rgba(113,83,72,0.12);">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; width:100%;">' +
          '<span style="font-size:10px; font-weight:800; color:#4F7460; background:#FFFFFF; padding:4px 10px; border-radius:12px; border:1px solid #EDE4D5;">From DayO</span>' +
          '<span style="font-size:11px; font-weight:800; color:#D97706;">✨ 오늘의 원픽</span>' +
        '</div>' +
        '<div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:8px 0; min-height:0;">' +
          '<img src="' + esc(r.illust_url) + '" alt="" crossorigin="anonymous" referrerpolicy="no-referrer" onerror="this.onerror=null;this.removeAttribute(\'crossorigin\');this.style.display=\'none\';this.insertAdjacentHTML(\'afterend\',\'<span style=&quot;font-size:48px&quot;>✨</span>\')" style="width:56%; max-width:180px; aspect-ratio:1; object-fit:contain; border-radius:16px; filter:drop-shadow(0 4px 10px rgba(0,0,0,0.08));" />' +
          '<div style="font-size:12px; color:#6E7A72; font-weight:700; margin-top:8px;">#' + esc(r.keyword) + '</div>' +
        '</div>' +
        '<div style="background:#FFFFFF; border-radius:12px; padding:12px 14px; text-align:center; border:1px solid #EDE4D5;">' +
          '<div style="font-size:14px; font-weight:800; color:#3E4A42; line-height:1.4; word-break:keep-all;">"' + esc(r.spoken_sentence) + '"</div>' +
        '</div>' +
      '</div>';
    if (opts.bare) return card;
    return (
      '<div class="insta-card-export-wrap dayo-report-card" style="display:flex; flex-direction:column; align-items:center; margin-bottom:18px;">' +
        '<div style="display:flex; justify-content:space-between; width:100%; max-width:400px; font-size:11px; color:#888; margin-bottom:8px;">' +
          '<span>With <strong>' + esc(r.partner_name) + '</strong></span>' +
          '<span>' + esc(dateLabel) + '</span>' +
        '</div>' +
        card +
        (talkQuoteText(r)
          ? ('<div class="talk-quote-box" style="margin-top: 12px; font-size: 13px; color: #444; background: #FFF9F5; padding: 10px 14px; border-radius: 10px; width:100%; max-width:400px; box-sizing:border-box;">' +
              '<span>☕ <strong>' + esc(talkQuoteLabel(r)) + '의 한마디:</strong> "' + esc(talkQuoteText(r)) + '"</span>' +
            '</div>')
          : '') +
        '<div style="display: flex; gap: 8px; margin-top: 14px; width: 100%; max-width: 400px;">' +
          '<button' + btnId + ' class="btn-save-card" type="button" onclick="saveInstaCard(event)" style="flex: 1; padding: 12px; background: #635BFF; color: #fff; font-weight: 700; border: none; border-radius: 12px; cursor: pointer; font-size: 13px;">' +
            '📸 카드 이미지 저장하기' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  window.renderViralReportCardForModal = function (r) {
    return renderViralReportCard(r, true);
  };

  window.renderReportDetailHtml = function (r) {
    var name = talkQuoteLabel(r);
    var dateLabel = formatAlbumDate(r.created_at);
    var timeLabel = '';
    try {
      var d = r.created_at ? new Date(r.created_at) : null;
      if (d && !isNaN(d.getTime())) {
        var hh = String(d.getHours());
        var mm = String(d.getMinutes());
        if (hh.length < 2) hh = '0' + hh;
        if (mm.length < 2) mm = '0' + mm;
        timeLabel = hh + ':' + mm;
      }
    } catch (e) { timeLabel = ''; }
    var when = [dateLabel, timeLabel].filter(Boolean).join(' ');
    return (
      '<div style="padding-top: 8px;">' +
        '<h3 style="margin: 0 0 4px; font-size: 17px; color: #222;">' + esc(name) + ' 파트너와의 대화</h3>' +
        '<p style="margin: 0 0 14px; font-size: 12px; color: #888;">' + esc(when || '날짜 미정') + '</p>' +
        '<div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">' +
          '<div class="report-meta-row">💡 나눈 주제: ' + esc(topicLabel(r) === '요즘 나의 일상' ? '서울의 숨은 카페와 각자의 주말' : topicLabel(r)) + '</div>' +
          '<div class="report-meta-row">☕ 파트너 추천: "' + esc(talkQuoteText(r)) + '"</div>' +
          '<div class="report-meta-row">✨ 기억하고 싶은 표현: "' + esc(memorablePhrase(r)) + '"</div>' +
        '</div>' +
        '<div class="insta-card-export-wrap" style="display:flex; flex-direction:column; align-items:center;">' +
          renderViralReportCard(r, true, { bare: true }) +
        '</div>' +
        '<div style="display: flex; gap: 8px; margin-top: 16px;">' +
          '<button id="btn-save-card" class="btn-save-card" type="button" onclick="saveInstaCard(event)" style="flex: 1; padding: 12px; background: #635BFF; color: #fff; font-weight: 700; border: none; border-radius: 12px; cursor: pointer; font-size: 13px;">📸 카드 이미지 저장하기</button>' +
          '<button type="button" onclick="closeReportDetailModal()" style="padding: 12px 16px; background: #F1F3F5; color: #444; font-weight: 700; border: none; border-radius: 12px; cursor: pointer; font-size: 13px; font-family: inherit;">닫기</button>' +
        '</div>' +
      '</div>'
    );
  };

  window.loadUserReports = async function () {
    var reportList = document.querySelector('.mypage-report-list');
    var album = document.querySelector('.talk-cards-grid');
    var container = reportList || album || document.getElementById('mypage-card-feed');
    if (!container) return;
    var client = window.supabaseClient;
    var user = null;
    if (client) {
      try {
        var res = await client.auth.getUser();
        user = res && res.data && res.data.user;
      } catch (e) { user = null; }
    }

    var reports = [];
    if (user && client) {
      var query = await client
        .from('session_reports')
        .select('*')
        .eq('learner_id', user.id)
        .order('created_at', { ascending: false });

      if (query.error) {
        console.warn('[DayO] loadUserReports failed', query.error);
      }
      reports = (query.data || []).map(normalizeReportCard).filter(Boolean);

      if (!reports.length) {
        var logQ = await client
          .from('session_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('ended_at', { ascending: false })
          .limit(8);
        if (logQ.error) {
          logQ = await client
            .from('session_logs')
            .select('*')
            .eq('learner_id', user.id)
            .order('ended_at', { ascending: false })
            .limit(8);
        }
        if (!logQ.error) {
          reports = (logQ.data || []).map(reportFromSessionLog).filter(Boolean);
        }
      }
    }

    if (!reports.length) {
      var localCard = readLocalApprovedCard();
      if (localCard && localCard.spoken_sentence && (localCard.created_at || localCard.approvedAt)) {
        reports = [localCard];
      }
    }
    reports = reports.filter(function (r) { return !isPlaceholderReport(r); });

    window.__dayoTalkAlbum = reports;
    document.dispatchEvent(new CustomEvent('dayo:reportsloaded', { detail: { reports: reports } }));

    var countEl = document.getElementById('talk-album-count');
    if (countEl) {
      countEl.textContent = reportList
        ? ('총 ' + reports.length + '개의 대화 기록')
        : ('총 ' + reports.length + '장 보관');
    }

    if (reportList) {
      if (reports.length > 0) {
        reportList.innerHTML = reports.map(function (r, idx) {
          return renderReportArchiveItem(r, idx);
        }).join('');
      } else if (!user) {
        reportList.innerHTML = '<div class="talk-album-empty">로그인 후 지난 대화 리포트를 확인해 보세요.</div>';
      } else {
        reportList.innerHTML = '<div class="talk-album-empty">아직 지난 대화 기록이 없어요.</div>';
      }
      return;
    }

    if (album) {
      if (reports.length > 0) {
        album.innerHTML = reports.map(function (r, idx) {
          return renderTalkThumb(r, idx);
        }).join('');
      } else if (!user) {
        album.innerHTML = '<div class="talk-album-empty">로그인 후 대화 리포트를 확인해 보세요.</div>';
      } else {
        album.innerHTML = '<div class="talk-album-empty">아직 대화 기록이 없습니다.</div>';
      }
      return;
    }

    if (reports.length > 0) {
      container.innerHTML = reports.map(function (r, idx) {
        return renderViralReportCard(r, idx === 0);
      }).join('');
    } else {
      container.innerHTML = homeEmptyStateHtml();
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

  function hideAdminDashboardLinks() {
    var links = document.querySelectorAll('[data-admin-dashboard-link]');
    Array.prototype.forEach.call(links, function (el) {
      el.style.display = 'none';
      el.setAttribute('hidden', '');
      el.setAttribute('aria-hidden', 'true');
    });
    document.body.classList.remove('is-admin');
  }

  function showAdminDashboardLinks() {
    var links = document.querySelectorAll('[data-admin-dashboard-link]');
    Array.prototype.forEach.call(links, function (el) {
      var inDrawer = !!(el.closest && el.closest('.nav-drawer'));
      var inMenu = !!(el.closest && el.closest('.ms-menu'));
      el.style.display = inDrawer || inMenu ? 'flex' : 'inline-flex';
      el.removeAttribute('hidden');
      el.setAttribute('aria-hidden', 'false');
    });
    document.body.classList.add('is-admin');
  }

  async function fetchProfileRole(userId) {
    var supabase = window.supabaseClient;
    if (!supabase || !userId) return null;
    try {
      var byId = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      if (byId.data && byId.data.role) return byId.data.role;
    } catch (e) { /* fall through to user_id */ }
    try {
      var byUserId = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();
      if (byUserId.data && byUserId.data.role) return byUserId.data.role;
    } catch (e2) { /* ignore */ }
    return null;
  }

  window.syncAdminDashboardLink = async function (session) {
    try {
      var supabase = window.supabaseClient;
      if (!session && supabase && supabase.auth) {
        var sessionRes = await supabase.auth.getSession();
        session = sessionRes && sessionRes.data && sessionRes.data.session;
      }
      if (!session || !session.user) {
        hideAdminDashboardLinks();
        return false;
      }
      var role = await fetchProfileRole(session.user.id);
      if (role === 'admin') {
        showAdminDashboardLinks();
        return true;
      }
      hideAdminDashboardLinks();
      return false;
    } catch (err) {
      hideAdminDashboardLinks();
      return false;
    }
  };

  function bindAdminDashboardNav() {
    hideAdminDashboardLinks();
    var supabase = window.supabaseClient;
    if (!supabase || !supabase.auth) return;
    supabase.auth.getSession().then(function (res) {
      window.syncAdminDashboardLink(res && res.data && res.data.session);
    });
    if (window._dayoAdminNavBound) return;
    window._dayoAdminNavBound = true;
    supabase.auth.onAuthStateChange(function (event, session) {
      if (event === 'TOKEN_REFRESHED') return;
      window.syncAdminDashboardLink(session);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      var cached = window.getCachedNickname();
      if (cached) window.updateProfileUI(cached);
      window.fetchAuthProfile();
      window.bindLearnerSessionId();
      bindAdminDashboardNav();
      if (document.getElementById('mypage-card-feed')) window.loadUserReports();
    });
  } else {
    var cachedNow = window.getCachedNickname();
    if (cachedNow) window.updateProfileUI(cachedNow);
    window.fetchAuthProfile();
    window.bindLearnerSessionId();
    bindAdminDashboardNav();
    if (document.getElementById('mypage-card-feed')) window.loadUserReports();
  }
})();
