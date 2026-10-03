/* Vercel serverless: POST /api/turn-credentials
 * Server-only env: CLOUDFLARE_TURN_KEY_ID, CLOUDFLARE_TURN_API_TOKEN,
 *                  SUPABASE_SERVICE_ROLE_KEY
 * Shared Supabase env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL),
 *                      NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
var { createClient } = require('@supabase/supabase-js');

var MAX_BODY_BYTES = 4 * 1024;
var TURN_TTL_SECONDS = 60 * 60;
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var credentialCache = new Map();

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.end(JSON.stringify(body));
}

function allowedOrigin(origin, vercelUrl) {
  if (!origin) return true;
  try {
    var parsed = new URL(origin);
    var host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1'))) return false;
    if (host === 'dayotalk.com' || host === 'www.dayotalk.com' || host === 'dayo-black.vercel.app') return true;
    return !!vercelUrl && host === String(vercelUrl).replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
  } catch (error) {
    return false;
  }
}

function cors(req, res, config) {
  var origin = String(req.headers && req.headers.origin || '');
  if (origin && allowedOrigin(origin, config.vercelUrl)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    if (req.body.length > MAX_BODY_BYTES) return Promise.reject(new Error('request-too-large'));
    try { return Promise.resolve(JSON.parse(req.body || '{}')); } catch (error) { return Promise.resolve({}); }
  }
  return new Promise(function (resolve, reject) {
    var raw = '';
    req.on('data', function (chunk) {
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) reject(new Error('request-too-large'));
    });
    req.on('end', function () {
      try { resolve(JSON.parse(raw || '{}')); } catch (error) { resolve({}); }
    });
    req.on('error', reject);
  });
}

function normalizeSupabaseUrl(url) {
  return String(url || '').trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
}

function loadConfig(source) {
  source = source || process.env;
  return {
    supabaseUrl: normalizeSupabaseUrl(source.NEXT_PUBLIC_SUPABASE_URL || source.SUPABASE_URL),
    anonKey: String(source.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
    serviceKey: String(source.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    turnKeyId: String(source.CLOUDFLARE_TURN_KEY_ID || '').trim(),
    turnApiToken: String(source.CLOUDFLARE_TURN_API_TOKEN || '').trim(),
    vercelUrl: String(source.VERCEL_URL || '').trim()
  };
}

function makeClients(config) {
  if (!config.supabaseUrl || !config.anonKey || !config.serviceKey) return null;
  var options = { auth: { persistSession: false, autoRefreshToken: false } };
  return {
    auth: createClient(config.supabaseUrl, config.anonKey, options),
    service: createClient(config.supabaseUrl, config.serviceKey, options)
  };
}

function bearerToken(req) {
  var header = String(req.headers && req.headers.authorization || '');
  var match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function authenticateUser(client, req) {
  var token = bearerToken(req);
  if (!token) return null;
  var result = await client.auth.getUser(token);
  if (result.error || !result.data || !result.data.user) return null;
  return result.data.user;
}

async function loadBooking(client, bookingId) {
  var result = await client.from('bookings')
    .select('id, learner_id, partner_id, partner_user_id, status')
    .eq('id', bookingId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

function isBookingParticipant(booking, userId) {
  if (!booking || !userId) return false;
  if (booking.learner_id === userId || booking.partner_user_id === userId) return true;
  return !booking.partner_user_id && booking.partner_id === userId;
}

function cloudflareIceUrl(keyId) {
  return 'https://rtc.live.cloudflare.com/v1/turn/keys/' + encodeURIComponent(keyId) + '/credentials/generate-ice-servers';
}

function validCloudflareUrl(value) {
  var text = String(value || '');
  var match = text.match(/^(?:stun|stuns|turn|turns):(?:\/\/)?([^:?/\s]+)(?::\d+)?(?:\?[^\s]*)?$/i);
  return !!(match && /(?:^|\.)cloudflare\.com$/i.test(match[1]));
}

function sanitizeIceServers(value) {
  if (!Array.isArray(value) || !value.length || value.length > 16) return null;
  var hasTurn = false;
  var clean = [];
  for (var i = 0; i < value.length; i += 1) {
    var source = value[i];
    if (!source || typeof source !== 'object') return null;
    var urls = Array.isArray(source.urls) ? source.urls.slice() : [source.urls];
    if (!urls.length || urls.length > 16 || !urls.every(validCloudflareUrl)) return null;
    if (urls.some(function (url) { return /^turns?:/i.test(String(url)); })) {
      if (typeof source.username !== 'string' || !source.username.trim() || source.username.length > 512 ||
          typeof source.credential !== 'string' || !source.credential.trim() || source.credential.length > 1024) return null;
      hasTurn = true;
    }
    var server = { urls: Array.isArray(source.urls) ? urls : urls[0] };
    if (typeof source.username === 'string' && source.username.length <= 512) server.username = source.username;
    if (typeof source.credential === 'string' && source.credential.length <= 1024) server.credential = source.credential;
    if (source.credentialType === 'password') server.credentialType = 'password';
    clean.push(server);
  }
  return hasTurn ? clean : null;
}

async function issueCloudflareCredentials(config, fetchImpl) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, 7000);
  try {
    var response = await fetchImpl(cloudflareIceUrl(config.turnKeyId), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + config.turnApiToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
      signal: controller.signal
    });
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error('cloudflare-request-failed');
    var iceServers = sanitizeIceServers(body && body.iceServers);
    if (!iceServers) throw new Error('cloudflare-response-invalid');
    return iceServers;
  } finally {
    clearTimeout(timer);
  }
}

function pruneCache(cache, now) {
  cache.forEach(function (entry, key) {
    if (!entry || entry.expiresAt <= now) cache.delete(key);
  });
  while (cache.size > 500) cache.delete(cache.keys().next().value);
}

function createHandler(overrides) {
  overrides = overrides || {};
  var config = overrides.config || loadConfig();
  var clientFactory = overrides.makeClients || makeClients;
  var authenticate = overrides.authenticateUser || authenticateUser;
  var findBooking = overrides.loadBooking || loadBooking;
  var issueCredentials = overrides.issueCredentials || function () {
    return issueCloudflareCredentials(config, overrides.fetch || fetch);
  };
  var now = overrides.now || function () { return Date.now(); };
  var cache = overrides.cache || credentialCache;

  return async function handler(req, res) {
    cors(req, res, config);
    var origin = String(req.headers && req.headers.origin || '');
    if (!allowedOrigin(origin, config.vercelUrl)) return json(res, 403, { error: 'origin_not_allowed' });
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
    if (!config.turnKeyId || !config.turnApiToken) return json(res, 503, { error: 'turn_unavailable' });

    var clients = clientFactory(config);
    if (!clients || !clients.auth || !clients.service) return json(res, 503, { error: 'service_unavailable' });

    try {
      var user = await authenticate(clients.auth, req);
      if (!user || !user.id) return json(res, 401, { error: 'authentication_required' });

      var body = await readBody(req);
      var bookingId = String(body && body.bookingId || '').trim();
      if (!UUID.test(bookingId)) return json(res, 400, { error: 'invalid_booking' });

      var booking = await findBooking(clients.service, bookingId);
      if (!booking || booking.status !== 'confirmed') return json(res, 404, { error: 'booking_not_available' });
      if (!isBookingParticipant(booking, user.id)) return json(res, 403, { error: 'booking_access_denied' });

      var cacheKey = bookingId + ':' + user.id;
      var currentTime = now();
      pruneCache(cache, currentTime);
      var cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > currentTime && Array.isArray(cached.iceServers)) {
        return json(res, 200, { iceServers: cached.iceServers, expiresAt: cached.credentialExpiresAt });
      }

      var iceServers = await issueCredentials();
      cache.set(cacheKey, {
        iceServers: iceServers,
        credentialExpiresAt: currentTime + TURN_TTL_SECONDS * 1000,
        expiresAt: currentTime + (55 * 60 * 1000)
      });
      return json(res, 200, { iceServers: iceServers, expiresAt: currentTime + TURN_TTL_SECONDS * 1000 });
    } catch (error) {
      console.error('[DayO TURN] credential request failed', error && error.message ? String(error.message).slice(0, 120) : 'unknown');
      return json(res, 502, { error: 'turn_unavailable' });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.isBookingParticipant = isBookingParticipant;
module.exports.sanitizeIceServers = sanitizeIceServers;
module.exports.TURN_TTL_SECONDS = TURN_TTL_SECONDS;
