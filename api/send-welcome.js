/* Vercel serverless: POST /api/send-welcome
 * Env: RESEND_API_KEY (required)
 */
var { prepareWelcome, markWelcomeSent } = require('./_lib/welcome-profile-state');
var { recipientLocale, buildWelcomeMessage } = require('./_lib/transactional-email');
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
  return new Promise(function (resolve) {
    var raw = '';
    req.on('data', function (chunk) { raw += chunk; if (raw.length > 1e6) req.destroy(); });
    req.on('end', function () {
      try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); }
    });
  });
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    json(res, 405, { ok: false, error: 'method not allowed' });
    return;
  }

  var apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    json(res, 500, { ok: false, error: 'RESEND_API_KEY is not configured' });
    return;
  }

  try {
    var body = await readBody(req);
    var welcome = await prepareWelcome(req, body);
    if (welcome.skip) { json(res, 200, { ok: true, skipped: true }); return; }
    var email = welcome.email;
    var nickname = welcome.nickname;
    if (!isValidEmail(email)) {
      json(res, 400, { ok: false, error: 'valid email is required' });
      return;
    }

    var payload = { ...buildWelcomeMessage(nickname, welcome.role, recipientLocale(welcome.role, welcome.metadata, body.locale)), to: [email] };

    var sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'welcome:' + welcome.userId
      },
      body: JSON.stringify(payload)
    });
    var data = await sent.json().catch(function () { return {}; });
    if (!sent.ok) {
      json(res, 502, { ok: false, error: (data && (data.message || data.error)) || 'resend failed' });
      return;
    }
    await markWelcomeSent(welcome);
    json(res, 200, { ok: true, id: data && data.id ? data.id : null });
  } catch (err) {
    json(res, err && err.status || 500, { ok: false, error: (err && err.message) || 'welcome email failed' });
  }
};
