'use strict';

const { createClient } = require('@supabase/supabase-js');
const { timingSafeEqual } = require('node:crypto');
const { dispatch } = require('./_lib/booking-notifications');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body) > 1024) throw new Error('invalid_request');
    return JSON.parse(req.body || '{}');
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 1024) throw new Error('invalid_request');
  }
  return JSON.parse(raw || '{}');
}

function configFromEnv(env = process.env) {
  return {
    url: String(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, ''),
    anonKey: String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
    serviceKey: String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    resendKey: String(env.RESEND_API_KEY || '').trim()
  };
}

function sameSecret(token, secret) {
  if (!token || !secret) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function createHandler(options = {}) {
  const config = options.config || configFromEnv();
  const clients = options.clients || (() => {
    const opts = { auth: { persistSession: false, autoRefreshToken: false } };
    return { auth: createClient(config.url, config.anonKey, opts), service: createClient(config.url, config.serviceKey, opts) };
  });
  return async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    if (!config.url || !config.anonKey || !config.serviceKey || !config.resendKey) return json(res, 503, { ok: false, error: 'notification_unavailable' });
    const token = String(req.headers && req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (!token) return json(res, 401, { ok: false, error: 'authentication_required' });
    let body;
    try { body = await readBody(req); } catch (_) { return json(res, 400, { ok: false, error: 'invalid_request' }); }
    if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(k => !['bookingId', 'event'].includes(k))) {
      return json(res, 400, { ok: false, error: 'invalid_request' });
    }
    try {
      const { auth, service } = clients();
      const worker = sameSecret(token[1], config.serviceKey);
      const bookingId = body.bookingId;
      const eventType = body.event;
      if (worker && Object.keys(body).length === 0) {
        const counts = await (options.dispatch || dispatch)(service, config, {});
        return json(res, 200, { ok: true, ...counts });
      }
      if (!UUID.test(String(bookingId || '')) || !['booking_confirmed', 'booking_cancelled'].includes(eventType)) {
        return json(res, 400, { ok: false, error: 'invalid_request' });
      }
      let localeUserId = null;
      if (!worker) {
        const verified = await auth.auth.getUser(token[1]);
        const user = verified.data && verified.data.user;
        if (verified.error || !user) return json(res, 401, { ok: false, error: 'authentication_required' });
        localeUserId = user.id;
        const found = await service.from('bookings').select('id,learner_id,partner_user_id,status,ticket_deducted,end_reason,is_test_session').eq('id', bookingId).maybeSingle();
        if (found.error) throw new Error('storage_unavailable');
        const booking = found.data;
        // Conceal whether an outsider's booking exists; never return participant data.
        if (!booking || ![booking.learner_id, booking.partner_user_id].includes(user.id)) return json(res, 404, { ok: false, error: 'booking_not_available' });
        if (booking.is_test_session === true) return json(res, 200, { ok: true, skipped: 'test_session' });
        const valid = eventType === 'booking_confirmed'
          ? booking.status === 'confirmed' && booking.ticket_deducted === true
          : booking.status === 'cancelled' && ['user_cancelled_early', 'user_cancelled_late', 'partner_cancelled_early', 'partner_cancelled_late'].includes(booking.end_reason);
        if (!valid) return json(res, 409, { ok: false, error: 'event_not_committed' });
      }
      const counts = await (options.dispatch || dispatch)(service, config, { bookingId, eventType }, { localeUserId, locale: req.headers['x-dayo-ui-language'] });
      return json(res, 202, { ok: true, ...counts });
    } catch (_) {
      // This endpoint never creates/cancels bookings, consumes tickets or rewards partners.
      return json(res, 503, { ok: false, error: 'notification_unavailable' });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
