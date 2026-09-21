/* Vercel serverless: POST /api/ticket-payment
 * Env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL),
 *      NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 *      PORTONE_API_KEY, PORTONE_API_SECRET
 */
var crypto = require('crypto');
var { createClient } = require('@supabase/supabase-js');

var MAX_BODY_BYTES = 16 * 1024;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body || '{}')); } catch (e) { return Promise.resolve({}); }
  }
  return new Promise(function (resolve, reject) {
    var raw = '';
    req.on('data', function (chunk) {
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) reject(new Error('request-too-large'));
    });
    req.on('end', function () {
      try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

function normalizeSupabaseUrl(url) {
  return String(url || '')
    .trim()
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}

function env() {
  var nextPublicSupabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
  var fallbackSupabaseUrl = String(process.env.SUPABASE_URL || '');
  var rawServiceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  var trimmedServiceKey = rawServiceKey.trim();
  var selectedUrl = nextPublicSupabaseUrl || fallbackSupabaseUrl;
  return {
    supabaseUrl: normalizeSupabaseUrl(selectedUrl),
    anonKey: String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
    serviceKey: trimmedServiceKey,
    portoneKey: String(process.env.PORTONE_API_KEY || '').trim(),
    portoneSecret: String(process.env.PORTONE_API_SECRET || '').trim(),
    diagnostics: {
      supabaseUrlSource: nextPublicSupabaseUrl
        ? 'NEXT_PUBLIC_SUPABASE_URL'
        : (fallbackSupabaseUrl ? 'SUPABASE_URL' : 'none'),
      serviceKeyTrimChanged: rawServiceKey.length !== trimmedServiceKey.length,
      serviceKeyEnvEmpty: rawServiceKey.length === 0
    }
  };
}

function serviceKeyPrefix(value) {
  var key = String(value || '');
  if (key.indexOf('sb_secret_') === 0) return 'sb_secret_';
  if (key.indexOf('eyJ') === 0) return 'eyJ';
  return 'other';
}

function supabaseEndpointInfo(value) {
  try {
    var parsed = new URL(value);
    var hostname = parsed.hostname;
    var projectRef = /\.supabase\.co$/i.test(hostname) ? hostname.split('.')[0] : null;
    return { hostname: hostname, projectRef: projectRef };
  } catch (error) {
    return { hostname: null, projectRef: null };
  }
}

async function logSupabaseServiceDiagnostics(config, service) {
  var endpoint = supabaseEndpointInfo(config.supabaseUrl);
  console.log('[DayO PAYMENT CONFIG DEBUG]', 'SUPABASE_CONFIG', {
    hostname: endpoint.hostname,
    project_ref: endpoint.projectRef,
    url_source: config.diagnostics.supabaseUrlSource,
    anon_key_present: !!config.anonKey,
    service_key_present: !!config.serviceKey,
    service_key_env_empty: config.diagnostics.serviceKeyEnvEmpty,
    service_key_trim_changed: config.diagnostics.serviceKeyTrimChanged,
    service_key_prefix: serviceKeyPrefix(config.serviceKey)
  });

  try {
    var probe = await service.from('profiles').select('id').limit(1);
    console.log('[DayO PAYMENT CONFIG DEBUG]', 'SERVICE_READ_PROBE', {
      status: typeof probe.status === 'number' ? probe.status : null,
      error_code: probe.error && probe.error.code ? probe.error.code : null,
      error_message: probe.error && probe.error.message
        ? String(probe.error.message).slice(0, 200)
        : null
    });
  } catch (error) {
    console.log('[DayO PAYMENT CONFIG DEBUG]', 'SERVICE_READ_PROBE', {
      status: error && typeof error.status === 'number' ? error.status : null,
      error_code: error && error.code ? error.code : null,
      error_message: error && error.message ? String(error.message).slice(0, 200) : 'unknown-error'
    });
  }
}

function bearerToken(req) {
  var header = String((req.headers && req.headers.authorization) || '');
  var match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function validTokenPart(value, max) {
  var text = String(value || '').trim();
  if (!text || text.length > max) return '';
  return /^[A-Za-z0-9_.:-]+$/.test(text) ? text : '';
}

function shortDebugId(value) {
  return value ? String(value).slice(0, 8) : null;
}

function makeClients(config) {
  if (!config.supabaseUrl || !config.anonKey || !config.serviceKey) return null;
  var options = { auth: { persistSession: false, autoRefreshToken: false } };
  return {
    auth: createClient(config.supabaseUrl, config.anonKey, options),
    service: createClient(config.supabaseUrl, config.serviceKey, options)
  };
}

async function authenticatedUser(client, req) {
  var token = bearerToken(req);
  if (!token) return null;
  var result = await client.auth.getUser(token);
  if (result.error || !result.data || !result.data.user) return null;
  return result.data.user;
}

async function fetchJson(url, options) {
  var controller = new AbortController();
  var timeout = setTimeout(function () { controller.abort(); }, 10000);
  try {
    var response = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok || Number(body && body.code) !== 0) {
      var error = new Error('upstream-request-failed');
      error.status = response.status;
      throw error;
    }
    return body && body.response;
  } finally {
    clearTimeout(timeout);
  }
}

async function portonePayment(config, impUid) {
  if (!config.portoneKey || !config.portoneSecret) throw new Error('portone-not-configured');
  var access = await fetchJson('https://api.iamport.kr/users/getToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imp_key: config.portoneKey,
      imp_secret: config.portoneSecret
    })
  });
  if (!access || !access.access_token) throw new Error('portone-auth-failed');
  return fetchJson('https://api.iamport.kr/payments/' + encodeURIComponent(impUid), {
    method: 'GET',
    headers: { Authorization: access.access_token }
  });
}

function merchantUid(productKey) {
  return 'dayo_' + productKey + '_' + Date.now() + '_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

// PRE-OPEN temporary gate: remove or replace this restriction before the official launch.
// It currently blocks ordinary users from calling the payment API directly; only a
// payment_test=1 request from an authenticated, verified admin may run the payment E2E flow.
async function prepare(service, user, body) {
  console.log('[DayO PAYMENT TEST DEBUG]', 'PREPARE_REQUEST', {
    payment_test: body.payment_test,
    payment_test_type: typeof body.payment_test,
    auth_user_id: shortDebugId(user && user.id)
  });
  if (body.payment_test !== true) {
    return { status: 403, body: { ok: false, error: 'payment-preopen' } };
  }
  var profileResult = await service
    .from('profiles')
    .select('id,role')
    .eq('id', user.id)
    .maybeSingle();
  var profileRole = profileResult.data
    ? String(profileResult.data.role || '').trim().toLowerCase()
    : '';
  var allowPaymentTest = !profileResult.error && !!profileResult.data && profileRole === 'admin';
  console.log('[DayO PAYMENT TEST DEBUG]', 'SERVER_ADMIN_CHECK', {
    query_success: !profileResult.error,
    error_code: profileResult.error && profileResult.error.code ? profileResult.error.code : null,
    error_message: profileResult.error && profileResult.error.message
      ? String(profileResult.error.message).slice(0, 200)
      : null,
    profile_found: !!profileResult.data,
    auth_user_id: shortDebugId(user && user.id),
    profile_id: shortDebugId(profileResult.data && profileResult.data.id),
    profile_role: profileRole || null,
    allow_payment_test: allowPaymentTest
  });
  if (!allowPaymentTest) {
    return { status: 403, body: { ok: false, error: 'admin-payment-test-required' } };
  }

  var productKey = validTokenPart(body.product_id, 40);
  if (!productKey) return { status: 400, body: { ok: false, error: 'invalid-product' } };

  var result = await service.rpc('prepare_verified_ticket_purchase', {
    p_user_id: user.id,
    p_product_key: productKey,
    p_merchant_uid: merchantUid(productKey)
  });
  if (result.error || !result.data || !result.data.success) {
    console.error('[DayO payment] prepare failed', result.error || result.data);
    return { status: 400, body: { ok: false, error: 'payment-prepare-failed' } };
  }
  return {
    status: 200,
    body: {
      ok: true,
      merchant_uid: result.data.merchant_uid,
      product: {
        id: result.data.product_key,
        name: result.data.product_name,
        amount: result.data.amount
      }
    }
  };
}

async function finalize(config, service, user, body) {
  var impUid = validTokenPart(body.imp_uid, 100);
  var merchant = validTokenPart(body.merchant_uid, 120);
  if (!impUid || !merchant) {
    return { status: 400, body: { ok: false, error: 'invalid-payment-identifiers' } };
  }

  var orderResult = await service
    .from('orders')
    .select('user_id, merchant_uid, product_key, product_name, amount, ticket_count, imp_uid, status')
    .eq('merchant_uid', merchant)
    .maybeSingle();
  var order = orderResult.data;
  if (orderResult.error || !order) {
    return { status: 404, body: { ok: false, error: 'payment-order-not-found' } };
  }
  if (String(order.user_id || '') !== String(user.id)) {
    return { status: 403, body: { ok: false, error: 'payment-owner-mismatch' } };
  }

  var payment = await portonePayment(config, impUid);
  if (!payment || payment.status !== 'paid') {
    return { status: 409, body: { ok: false, error: 'payment-not-paid' } };
  }
  if (String(payment.imp_uid || '') !== impUid || String(payment.merchant_uid || '') !== merchant) {
    return { status: 409, body: { ok: false, error: 'payment-identifier-mismatch' } };
  }
  if (Number(payment.amount) !== Number(order.amount)) {
    return { status: 409, body: { ok: false, error: 'payment-amount-mismatch' } };
  }
  if (String(payment.name || '') !== String(order.product_name || '')) {
    return { status: 409, body: { ok: false, error: 'payment-product-mismatch' } };
  }
  if (payment.currency && String(payment.currency).toUpperCase() !== 'KRW') {
    return { status: 409, body: { ok: false, error: 'payment-currency-mismatch' } };
  }

  var result = await service.rpc('finalize_verified_ticket_purchase', {
    p_user_id: user.id,
    p_merchant_uid: merchant,
    p_imp_uid: impUid
  });
  if (result.error || !result.data || !result.data.success) {
    console.error('[DayO payment] finalize failed', result.error || result.data);
    return { status: 409, body: { ok: false, error: 'payment-finalize-failed' } };
  }
  return {
    status: 200,
    body: {
      ok: true,
      duplicate: !!result.data.duplicate,
      ticket_count: Number(result.data.ticket_count),
      added_tickets: Number(result.data.added_tickets || 0),
      product_id: result.data.product_key
    }
  };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method-not-allowed' });

  var config = env();
  var clients = makeClients(config);
  if (!clients) return json(res, 503, { ok: false, error: 'payment-service-not-configured' });

  try {
    await logSupabaseServiceDiagnostics(config, clients.service);
    var user = await authenticatedUser(clients.auth, req);
    if (!user) return json(res, 401, { ok: false, error: 'authentication-required' });
    var body = await readBody(req);
    var action = String(body.action || '').trim();
    var result;
    if (action === 'prepare') result = await prepare(clients.service, user, body);
    else if (action === 'finalize') result = await finalize(config, clients.service, user, body);
    else result = { status: 400, body: { ok: false, error: 'invalid-action' } };
    return json(res, result.status, result.body);
  } catch (err) {
    console.error('[DayO payment] request failed', err && err.message ? err.message : err);
    return json(res, 502, { ok: false, error: 'payment-verification-unavailable' });
  }
};
