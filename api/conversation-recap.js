/* Read-only canonical recap for the authenticated learner's own booking.
 * Partner raw speech never leaves this server. No new env, RPC, grants or writes. */
const recap = require('../public/conversation-recap.js');
const partnerLetter = require('./_lib/partner-letter.js');
const quizHistory = require('./_lib/quiz-history.js');
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
    if (!input || Array.isArray(input) || !uuid(input.booking_id) || Object.keys(input).some(k => !['booking_id', 'learner_version', 'action', 'topic_id', 'source_version'].includes(k))) return json(res, 400, { error: 'invalid_request' });
    if (input.learner_version != null && (typeof input.learner_version !== 'string' || input.learner_version.length > 100)) return json(res, 400, { error: 'invalid_request' });
    const url = String(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
    const anon = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !anon) return json(res, 503, { error: 'source_unavailable' });
    const partnerAction = ['partner_letter_topics', 'partner_letter_blocks', 'partner_illustration_status'].includes(input.action);
    if (input.action && !partnerAction) return json(res, 400, { error: 'invalid_request' });
    if (!partnerAction && Object.keys(input).some(k => !['booking_id','learner_version'].includes(k))) return json(res,400,{error:'invalid_request'});
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), partnerAction ? 45000 : 6500);
    const headers = { apikey: anon, Authorization: 'Bearer ' + token[1] };
    async function read(route, h = headers) { const result = await fetchImpl(url + route, { headers: h, signal: controller.signal }); if (!result.ok) throw Error('read'); return result.json(); }
    try {
      const auth = await fetchImpl(url + '/auth/v1/user', { headers, signal: controller.signal });
      if (!auth.ok) return json(res, 401, { error: 'auth_required' });
      const user = await auth.json(); if (!uuid(user.id)) return json(res, 401, { error: 'auth_required' });
      if (partnerAction) {
        const result = await partnerLetter.handle({input, read, user, env, signal:controller.signal, fetchImpl});
        return json(res,result.status,result.body);
      }
      // Ownership checked with the user's JWT/RLS BEFORE any privileged read.
      const bookings = await read('/rest/v1/bookings?' + new URLSearchParams({ id: 'eq.' + input.booking_id, learner_id: 'eq.' + user.id, select: 'id,learner_id,partner_user_id,language,status,scheduled_at,is_test_session', limit: '1' }));
      const booking = Array.isArray(bookings) && bookings[0];
      if (!booking || booking.id !== input.booking_id || booking.learner_id !== user.id || !uuid(booking.partner_user_id) || !['confirmed', 'completed'].includes(booking.status)) return json(res, 403, { error: 'not_learner_booking' });
      const select = 'id,booking_id,participant_id,participant_role,transcript';
      const own = await read('/rest/v1/session_logs?' + new URLSearchParams({ booking_id: 'eq.' + booking.id, participant_id: 'eq.' + user.id, participant_role: 'eq.learner', select, limit: '1' }));
      const learnerLog = Array.isArray(own) && own[0];
      let chatMessages=[],chatStatus='unavailable';
      try {
        const chatAbort=new AbortController(),chatTimer=setTimeout(()=>chatAbort.abort(),1200);
        let messages;try{const result=await fetchImpl(url+'/rest/v1/booking_chat_messages?'+new URLSearchParams({booking_id:'eq.'+booking.id,select:'booking_id,id,sender_id,sender_role,text,created_at',order:'created_at.asc,id.asc',limit:'500'}),{headers,signal:chatAbort.signal});if(!result.ok)throw Error('chat-read');messages=await result.json();}finally{clearTimeout(chatTimer);}
        if(!Array.isArray(messages))throw Error('chat-shape');
        chatMessages=messages;chatStatus='available';
      }catch(_){/* Chat failure never removes canonical speech or existing quiz. */}
      if (!recap.rows(learnerLog, booking.id, user.id, 'learner') && !chatMessages.length) return json(res, 200, { recap: null, status: 'no_canonical_source' });
      let partnerLog = null;
      const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
      if (key) {
        try {
          const other = await read('/rest/v1/session_logs?' + new URLSearchParams({ booking_id: 'eq.' + booking.id, participant_id: 'eq.' + booking.partner_user_id, participant_role: 'eq.partner', select, limit: '1' }), { apikey: key, Authorization: 'Bearer ' + key });
          const candidate = Array.isArray(other) && other[0];
          if (recap.rows(candidate, booking.id, booking.partner_user_id, 'partner')) partnerLog = candidate;
        } catch (_) { /* Missing Partner source leaves an honest partial recap. */ }
      }
      // Only the authenticated user's completed sessions, exact canonical logs.
      // A missing/error record is unknown, never fabricated as zero or substituted.
      let history = [], previousVolume = null, historyStatus = 'unavailable';
      if (booking.is_test_session !== true && recap.language(booking.language) === 'en' && Number.isFinite(Date.parse(booking.scheduled_at))) {
        try {
          const previous = await read('/rest/v1/bookings?' + new URLSearchParams({ learner_id: 'eq.' + user.id, status: 'eq.completed', is_test_session: 'eq.false', scheduled_at: 'lt.' + booking.scheduled_at, id: 'neq.' + booking.id, select: 'id,learner_id,language,status,scheduled_at,is_test_session', order: 'scheduled_at.desc,id.desc', limit: '4' }));
          historyStatus = 'available';
          const safe = (Array.isArray(previous) ? previous : []).filter(b => uuid(b.id) && b.id !== booking.id && b.learner_id === user.id && b.status === 'completed' && b.is_test_session === false && Number.isFinite(Date.parse(b.scheduled_at)) && Date.parse(b.scheduled_at) < Date.parse(booking.scheduled_at)).sort((a, b) => Date.parse(b.scheduled_at) - Date.parse(a.scheduled_at)).slice(0, 4);
          if (safe.length) {
            const logs = await read('/rest/v1/session_logs?' + new URLSearchParams({ booking_id: 'in.(' + safe.map(b => b.id).join(',') + ')', participant_id: 'eq.' + user.id, participant_role: 'eq.learner', select, limit: String(safe.length) }));
            history = safe.map(b => {
              const log = (Array.isArray(logs) ? logs : []).find(l => l.booking_id === b.id);
              const speech = recap.language(b.language) === 'en' ? recap.rows(log, b.id, user.id, 'learner') : null;
              return speech && speech.length ? { booking_id: b.id, scheduled_at: b.scheduled_at, word_count: speech.reduce((n, r) => n + recap.words(r.text).length, 0) } : null;
            }).filter(Boolean);
            const previous = history.find(item => item.booking_id === safe[0].id);
            previousVolume = { booking_id: safe[0].id, word_count: previous ? previous.word_count : null };
          }
        } catch (_) { historyStatus = 'unavailable'; }
      }
      // Restore persisted targets/progress; never regenerate an existing quiz on reload.
      let storedQuiz = null, quizState = {status:'unavailable',words:[]};
      try {
        const reports = await read('/rest/v1/session_reports?' + new URLSearchParams({
          booking_id:'eq.'+booking.id, learner_id:'eq.'+user.id,
          select:'booking_id,learner_id,feedback',limit:'1'
        }));
        if (!Array.isArray(reports)) throw Error('report-shape');
        const current = reports.find(r=>r.booking_id===booking.id && r.learner_id===user.id);
        storedQuiz = recap.saved(current);
        if (storedQuiz && storedQuiz.quiz_history_status === 'unavailable' && !storedQuiz.questions.length) storedQuiz = null;
        if (!storedQuiz) quizState = await quizHistory.load(read,booking,user.id);
      } catch (_) { /* Unknown history never authorizes repeated quiz targets. */ }
      const value = recap.build({ chatMessages, chatStatus, bookingId: booking.id, learnerId: user.id, partnerId: booking.partner_user_id, language: booking.language, learnerLog, partnerLog, history, historyStatus, previousVolume, scheduledAt: booking.scheduled_at, isTestSession: booking.is_test_session === true, quizExcludedWords: quizState.words, quizHistoryStatus: quizState.status });
      if (storedQuiz) {
        value.word_expansion = storedQuiz.word_expansion;
        value.questions = storedQuiz.questions;
        value.progress = storedQuiz.progress;
        value.quiz_history_status = storedQuiz.quiz_history_status || 'saved';
      }
      if (input.learner_version && value.source.learner_version !== input.learner_version) return json(res, 409, { error: 'canonical_revision_changed' });
      return json(res, 200, { recap: value, status: partnerLog ? 'complete' : 'partner_record_unavailable' });
    } catch (_) { return json(res, 502, { error: 'source_unavailable' }); }
    finally { clearTimeout(timer); }
  };
}
module.exports = createHandler(); module.exports.createHandler = createHandler;
