/* DayO partner reward completion and one-shot recovery. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DayOPartnerReward = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var retryStarted = false;
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var REVIEW_HOLD_PREFIX = 'dayo_partner_reward_review:';

  function reviewHoldKey(bookingId) {
    return UUID_RE.test(String(bookingId || '')) ? REVIEW_HOLD_PREFIX + String(bookingId) : '';
  }

  function isReviewHeld(bookingId) {
    var key = reviewHoldKey(bookingId);
    if (!key || !root || !root.localStorage) return false;
    try { return !!root.localStorage.getItem(key); } catch (e) { return false; }
  }

  function holdForReview(bookingId, result) {
    var key = reviewHoldKey(bookingId);
    if (!key || !root || !root.localStorage) return;
    try {
      root.localStorage.setItem(key, JSON.stringify({
        code: String(result && result.code || 'needs_review'),
        evidence: String(result && result.evidence || ''),
        heldAt: new Date().toISOString()
      }));
    } catch (e) { /* ignore */ }
  }

  function clearReviewHold(bookingId) {
    var key = reviewHoldKey(bookingId);
    if (!key || !root || !root.localStorage) return;
    try { root.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  function normalizePayload(data) {
    var value = Array.isArray(data) ? data[0] : data;
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch (e) { value = null; }
    }
    return value && typeof value === 'object' ? value : {};
  }

  function resultFailure(code, message, extra) {
    var result = {
      success: false,
      code: code || 'reward_unavailable',
      message: message || '세션 보상을 확인하지 못했습니다.'
    };
    Object.keys(extra || {}).forEach(function (key) { result[key] = extra[key]; });
    return result;
  }

  async function authUser(client) {
    if (!client || !client.auth) return null;
    try {
      var response = await client.auth.getUser();
      return response && response.data && response.data.user || null;
    } catch (e) {
      return null;
    }
  }

  async function complete(bookingId, partnerId) {
    var client = root && root.supabaseClient;
    if (!client || typeof client.rpc !== 'function') {
      return resultFailure('client_unavailable', '보상 서버에 연결하지 못했습니다.');
    }
    var user = await authUser(client);
    var actorId = String(partnerId || (user && user.id) || '');
    if (!user || user.id !== actorId || !UUID_RE.test(String(bookingId || ''))) {
      return resultFailure('invalid_identity', '예약 또는 파트너 정보를 확인하지 못했습니다.');
    }
    try {
      var response = await client.rpc('complete_session_and_reward_partner', {
        p_booking_id: bookingId,
        p_partner_user_id: actorId,
        p_reward_amount: 6000
      });
      if (response && response.error) throw response.error;
      var payload = normalizePayload(response && response.data);
      if (payload.success === true && payload.updated_points != null) {
        try { root.localStorage.setItem('dayo_point_balance', String(payload.updated_points)); } catch (e) { /* ignore */ }
      }
      if (payload.success === true) clearReviewHold(bookingId);
      return payload.success === true
        ? payload
        : resultFailure(payload.code, payload.message, payload);
    } catch (error) {
      return resultFailure('rpc_error', '보상 처리 중 통신 오류가 발생했습니다.', { error: error });
    }
  }

  function isRetryCandidate(booking, nowMs) {
    if (!booking || booking.partner_rewarded === true) return false;
    if (booking.status !== 'confirmed' && booking.status !== 'completed') return false;
    if (booking.end_reason !== 'normal' || !booking.ended_at || !booking.scheduled_at) return false;
    var scheduledAt = new Date(booking.scheduled_at).getTime();
    return Number.isFinite(scheduledAt) && Number(nowMs) >= scheduledAt + 25 * 60 * 1000;
  }

  function notifyRetry(detail) {
    if (!root || !root.document || typeof root.CustomEvent !== 'function') return;
    root.document.dispatchEvent(new root.CustomEvent('dayo:partner-reward-retry', { detail: detail }));
  }

  function showRecoveredToast(count) {
    if (!count || !root) return;
    var message = count === 1
      ? '이전 세션 보상 6,000P가 확인되었습니다.'
      : '이전 세션 보상 ' + count + '건이 확인되었습니다.';
    if (typeof root.showDayoToast === 'function') root.showDayoToast(message);
    else if (typeof root.showToast === 'function') root.showToast(message);
  }

  async function retryRecentOnce() {
    if (retryStarted) return { attempted: 0, recovered: 0, review: 0 };
    retryStarted = true;
    var client = root && root.supabaseClient;
    var user = await authUser(client);
    if (!client || !user) return { attempted: 0, recovered: 0, review: 0 };

    var since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    var query;
    try {
      query = await client
        .from('bookings')
        .select('id,scheduled_at,status,end_reason,ended_at,partner_rewarded')
        .eq('partner_user_id', user.id)
        .eq('partner_rewarded', false)
        .in('status', ['confirmed', 'completed'])
        .gte('scheduled_at', since)
        .order('scheduled_at', { ascending: false })
        .limit(10);
    } catch (error) {
      query = { error: error, data: [] };
    }

    if (query.error) {
      var failed = { attempted: 0, recovered: 0, review: 0, error: query.error };
      notifyRetry(failed);
      return failed;
    }

    var candidates = (query.data || []).filter(function (booking) {
      return isRetryCandidate(booking, Date.now()) && !isReviewHeld(booking.id);
    }).slice(0, 3);
    var recovered = 0;
    var review = 0;
    for (var i = 0; i < candidates.length; i += 1) {
      var result = await complete(candidates[i].id, user.id);
      if (result.success === true) recovered += 1;
      else if (result.needs_review === true || result.code === 'evidence_insufficient') {
        review += 1;
        holdForReview(candidates[i].id, result);
      }
    }
    var summary = { attempted: candidates.length, recovered: recovered, review: review };
    notifyRetry(summary);
    showRecoveredToast(recovered);
    return summary;
  }

  function installLoungeRetry() {
    if (!root || !root.location || !/(?:^|\/)partner(?:\.html)?$/i.test(root.location.pathname)) return;
    var run = function () { retryRecentOnce(); };
    if (root.document && root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', run, { once: true });
    else setTimeout(run, 0);
  }

  installLoungeRetry();

  return {
    complete: complete,
    retryRecentOnce: retryRecentOnce,
    normalizePayload: normalizePayload,
    isRetryCandidate: isRetryCandidate
  };
});
