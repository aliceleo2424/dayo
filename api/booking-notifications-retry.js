'use strict';

const { createClient } = require('@supabase/supabase-js');
const { timingSafeEqual } = require('node:crypto');
const { dispatch } = require('./_lib/booking-notifications');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BATCHES = 5;
const TIME_BUDGET_MS = 40000;

function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(body));
}

function authorized(header, secret) {
  const token = String(header || '').match(/^Bearer\s+([^\s]+)$/i);
  if (!token || typeof secret !== 'string' || secret.length < 32) return false;
  const a = Buffer.from(token[1]), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readScope(req) {
  let body = req.body;
  if (body != null && typeof body !== 'string' && typeof body !== 'object') throw new Error('invalid_request');
  if (!body || typeof body !== 'object') {
    let raw = typeof body === 'string' ? body : '';
    if (body == null) for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > 1024) throw new Error('invalid_request');
    }
    if (Buffer.byteLength(raw) > 1024) throw new Error('invalid_request');
    body = JSON.parse(raw || '{}');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['bookingId', 'event'].includes(k))) throw new Error('invalid_request');
  if (Object.keys(body).length === 0) return {};
  if (!UUID.test(String(body.bookingId || '')) || !['booking_confirmed', 'booking_cancelled'].includes(body.event)) throw new Error('invalid_request');
  return { bookingId: body.bookingId, eventType: body.event };
}

function createRetryHandler(options = {}) {
  const env = options.env || process.env;
  const config = options.config || {
    url: String(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, ''),
    serviceKey: String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    resendKey: String(env.RESEND_API_KEY || '').trim(),
    retrySecret: String(env.BOOKING_NOTIFICATION_RETRY_SECRET || '').trim()
  };
  const now = options.now || Date.now;
  return async function handler(req, res) {
    if (req.method !== 'POST') return reply(res, 405, { ok: false, error: 'method_not_allowed' });
    // Reject before creating a database client or reading any notification rows.
    if (!authorized(req.headers && req.headers.authorization, config.retrySecret)) return reply(res, 401, { ok: false, error: 'authentication_required' });
    if (!config.url || !config.serviceKey || !config.resendKey) return reply(res, 503, { ok: false, error: 'notification_unavailable' });
    let scope;
    try { scope = await readScope(req); } catch (_) { return reply(res, 400, { ok: false, error: 'invalid_request' }); }
    try {
      const service = options.service || createClient(config.url, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const totals = { sent: 0, failed: 0, review: 0, batches: 0 };
      const started = now();
      for (let batch = 0; batch < MAX_BATCHES && now() - started < TIME_BUDGET_MS; batch += 1) {
        const counts = await (options.dispatch || dispatch)(service, config, scope);
        totals.batches += 1;
        for (const key of ['sent', 'failed', 'review']) totals[key] += counts[key];
        if (!counts.sent && !counts.failed && !counts.review) break;
      }
      return reply(res, 200, { ok: true, ...totals });
    } catch (_) {
      return reply(res, 503, { ok: false, error: 'notification_unavailable' });
    }
  };
}

module.exports = createRetryHandler();
module.exports.createRetryHandler = createRetryHandler;
module.exports.MAX_BATCHES = MAX_BATCHES;
module.exports.TIME_BUDGET_MS = TIME_BUDGET_MS;
