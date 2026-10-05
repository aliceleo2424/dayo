/* Read-only canonical recap for the authenticated learner's own booking.
 * Partner raw speech never leaves this server. No new env, RPC, grants or writes. */
const recap = require('../public/conversation-recap.js');
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
function json(res, status, body) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'private, no-store'); res.end(JSON.stringify(body)); }
function originAllowed(origin, vercelUrl) {
  if (!origin) return true;
  try { const u = new URL(origin); return u.protocol === 'https:' && ['dayotalk.com', 'www.dayotalk.com', 'dayo-black.vercel.app', String(vercelUrl || '')].includes(u.host); } catch (_) { return false; }
}
async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { if (req.body.length > 1024) throw Error('size'); return JSON.parse(req.body); }
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 1024) throw Error('size'); } return JSON.parse(raw || '{}');
}
function createHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async function handler(req, res) {
    if (!originAllowed(req.headers && req.headers.origin, env.VERCEL_URL)) return json(res, 403, { error: 'origin_not_allowed' });
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
    const token = /^Bearer ([A-Za-z0-9._-]+)$/.exec(String(req.headers && req.headers.authorization || ''));
    if (!token) return json(res, 401, { error: 'auth_required' });
    let input; try { input = await body(req); } catch (_) { return json(res, 400, { error: 'invalid_request' }); }
    if (!input || Array.isArray(input) || !uuid(input.booking_id) || Object.keys(input).some(k => !['booking_id', 'learner_version'].includes(k))) return json(res, 400, { error: 'invalid_request' });
    if (input.learner_version != null && (typeof input.learner_version !== 'string' || input.learner_version.length > 100)) return json(res, 400, { error: 'invalid_request' });
    const url = String(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
    const anon = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !anon) return json(res, 503, { error: 'source_unavailable' });
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6500);
    const headers = { apikey: anon, Authorization: 'Bearer ' + token[1] };
    async function read(route, h = headers) { const result = await fetchImpl(url + route, { headers: h, signal: controller.signal }); if (!result.ok) throw Error('read'); return result.json(); }
    try {
      const auth = await fetchImpl(url + '/auth/v1/user', { headers, signal: controller.signal });
      if (!auth.ok) return json(res, 401, { error: 'auth_required' });
      const user = await auth.json(); if (!uuid(user.id)) return json(res, 401, { error: 'auth_required' });
      // Ownership checked with the user's JWT/RLS BEFORE any privileged read.
      const bookings = await read('/rest/v1/bookings?' + new URLSearchParams({ id: 'eq.' + input.booking_id, learner_id: 'eq.' + user.id, select: 'id,learner_id,partner_user_id,language,status,scheduled_at', limit: '1' }));
      const booking = Array.isArray(bookings) && bookings[0];
      if (!booking || booking.id !== input.booking_id || booking.learner_id !== user.id || !uuid(booking.partner_user_id) || !['confirmed', 'completed'].includes(booking.status)) return json(res, 403, { error: 'not_learner_booking' });
      const select = 'id,booking_id,participant_id,participant_role,transcript';
      const own = await read('/rest/v1/session_logs?' + new URLSearchParams({ booking_id: 'eq.' + booking.id, participant_id: 'eq.' + user.id, participant_role: 'eq.learner', select, limit: '1' }));
      const learnerLog = Array.isArray(own) && own[0];
      if (!recap.rows(learnerLog, booking.id, user.id, 'learner')) return json(res, 200, { recap: null, status: 'no_canonical_source' });
      let partnerLog = null;
      const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
      if (key) {
        try {
          const other = await read('/rest/v1/session_logs?' + new URLSearchParams({ booking_id: 'eq.' + booking.id, participant_id: 'eq.' + booking.partner_user_id, participant_role: 'eq.partner', select, limit: '1' }), { apikey: key, Authorization: 'Bearer ' + key });
          const candidate = Array.isArray(other) && other[0];
          if (recap.rows(candidate, booking.id, booking.partner_user_id, 'partner')) partnerLog = candidate;
        } catch (_) { /* Missing Partner source leaves an honest partial recap. */ }
      }
      const value = recap.build({ bookingId: booking.id, learnerId: user.id, partnerId: booking.partner_user_id, language: booking.language, learnerLog, partnerLog });
      if (input.learner_version && value.source.learner_version !== input.learner_version) return json(res, 409, { error: 'canonical_revision_changed' });
      return json(res, 200, { recap: value, status: partnerLog ? 'complete' : 'partner_record_unavailable' });
    } catch (_) { return json(res, 502, { error: 'source_unavailable' }); }
    finally { clearTimeout(timer); }
  };
}
module.exports = createHandler(); module.exports.createHandler = createHandler;
