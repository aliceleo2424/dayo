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

  window.handleConfirmBooking = async function (learnerId, bookingId) {
    var supabase = getRpcClient();
    if (!supabase || typeof supabase.rpc !== 'function') {
      alert('예약 처리 중 통신 오류가 발생했습니다.');
      return false;
    }
    try {
      const { data, error } = await supabase.rpc('deduct_ticket_and_confirm_booking', {
        p_learner_id: learnerId,
        p_booking_id: bookingId
      });

      if (error) throw error;

      var payload = normalizeRpcPayload(data);
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
      partner_comment: r.partner_comment || r.partnerComment || '오늘 대화 훌륭했어요!',
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

  function renderViralReportCard(r, isPrimary) {
    var captureId = isPrimary ? ' id="insta-card-capture"' : '';
    var btnId = isPrimary ? ' id="btn-save-card"' : '';
    var dateLabel = '';
    try {
      dateLabel = r.created_at ? new Date(r.created_at).toLocaleDateString() : '';
    } catch (e) { dateLabel = ''; }
    return (
      '<div class="insta-card-export-wrap dayo-report-card" style="display:flex; flex-direction:column; align-items:center; margin-bottom:18px;">' +
        '<div style="display:flex; justify-content:space-between; width:100%; max-width:400px; font-size:11px; color:#888; margin-bottom:8px;">' +
          '<span>With <strong>' + esc(r.partner_name) + '</strong></span>' +
          '<span>' + esc(dateLabel) + '</span>' +
        '</div>' +
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
        '</div>' +
        '<p class="dayo-card-comment" style="width:100%; max-width:400px;">💬 파트너: ' + esc(r.partner_comment) + '</p>' +
        '<div style="display: flex; gap: 8px; margin-top: 14px; width: 100%; max-width: 400px;">' +
          '<button' + btnId + ' class="btn-save-card" type="button" onclick="saveInstaCard(event)" style="flex: 1; padding: 12px; background: #635BFF; color: #fff; font-weight: 700; border: none; border-radius: 12px; cursor: pointer; font-size: 13px;">' +
            '📸 카드 이미지 저장하기' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

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
    }

    if (!reports.length) {
      var localCard = readLocalApprovedCard();
      if (localCard && localCard.spoken_sentence) reports = [localCard];
    }

    if (!user && !reports.length) {
      container.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">로그인 후 대화 리포트를 확인해 보세요.</div>';
      return;
    }

    if (reports.length > 0) {
      container.innerHTML = reports.map(function (r, idx) {
        return renderViralReportCard(r, idx === 0);
      }).join('');
    } else {
      container.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">아직 오늘의 대화 기록이 없습니다.</div>';
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
