/* Vercel serverless: POST /api/send-lead-email
 * Env: RESEND_API_KEY (required), RESEND_FROM, DAYO_SITE_URL,
 *      NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY
 */
var { Resend } = require('resend');
var { createClient } = require('@supabase/supabase-js');
var sheets = require('../cheat-sheet-data.js');

var DEFAULT_SITE = 'https://dayo-black.vercel.app';
var DEFAULT_SUPABASE_URL = 'https://mmhapsimcngmtefqfrcg.supabase.co';
var COUPON_CODE = 'WELCOME9900';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

function siteUrl() {
  var fromEnv = process.env.DAYO_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || '';
  if (fromEnv) return String(fromEnv).replace(/\/+$/, '');
  return DEFAULT_SITE;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emailHtml(opts) {
  var cheatUrl = DEFAULT_SITE + '/cheat-sheet.html?lang=' + encodeURIComponent(opts.lang);
  if (opts.level) cheatUrl += '&level=' + encodeURIComponent(opts.level);
  var bookingUrl = opts.base + '/index.html#booking';
  var langName = escapeHtml(opts.langName);
  return (
    '<div style="margin:0;padding:0;background:#FFF8F5;font-family:Apple SD Gothic Neo,Pretendard,sans-serif;color:#5C4A42;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F5;padding:24px 12px;">' +
        '<tr><td align="center">' +
          '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFCFA;border:1px solid #FFE8E3;border-radius:28px;overflow:hidden;">' +
            '<tr><td style="padding:28px 28px 8px;background:linear-gradient(135deg,#FFD1DC,#FFE5B4 62%,#FFF9C4);">' +
              '<p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;color:#E55A45;font-weight:800;">DAYO 돼요</p>' +
              '<h1 style="margin:0;font-size:22px;line-height:1.4;letter-spacing:-0.03em;">신청하신 자료가 도착했어요 🎁</h1>' +
            '</td></tr>' +
            '<tr><td style="padding:22px 28px 8px;font-size:15px;line-height:1.7;">' +
              '<p style="margin:0 0 18px;">신청하신 <strong>' + langName + '</strong> 회화 치트키 자료입니다.</p>' +
              '<p style="margin:0 0 22px;text-align:center;">' +
                '<a href="' + cheatUrl + '" style="display:inline-block;background:#FF6B57;color:#fff;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:18px;">🎁 맞춤 치트키 열람하기</a>' +
              '</p>' +
              '<div style="background:#FFF8F5;border:1px solid #FFE8E3;border-radius:18px;padding:16px 18px;margin:0 0 18px;">' +
                '<p style="margin:0 0 6px;font-size:12px;font-weight:800;color:#E55A45;letter-spacing:0.04em;">첫 세션 9,900원 할인 쿠폰</p>' +
                '<p style="margin:0 0 8px;font-size:22px;font-weight:800;letter-spacing:0.04em;">' + COUPON_CODE + '</p>' +
                '<p style="margin:0;font-size:14px;line-height:1.6;color:#9A8580;">예약 화면에서 이 코드를 적용하면 첫 세션이 <strong style="color:#5C4A42;">9,900원</strong>으로 열려요.</p>' +
              '</div>' +
              '<p style="margin:0 0 8px;text-align:center;">' +
                '<a href="' + bookingUrl + '" style="display:inline-block;color:#FF6B57;font-weight:800;text-decoration:none;">🎟️ 쿠폰 적용하고 대화 시작하기 →</a>' +
              '</p>' +
            '</td></tr>' +
            '<tr><td style="padding:8px 28px 28px;font-size:12px;line-height:1.6;color:#9A8580;">' +
              '이 메일은 레벨테스트 자료 요청으로 보내드렸어요. DayO 돼요' +
            '</td></tr>' +
          '</table>' +
        '</td></tr>' +
      '</table>' +
    '</div>'
  );
}

function normalizeSupabaseUrl(url) {
  return String(url || '')
    .trim()
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}

function getSupabase() {
  var url = normalizeSupabaseUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL
  );
  var key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function insertLead(payload) {
  var client = getSupabase();
  if (!client) return { ok: false, reason: 'missing-supabase' };
  var rows = [
    {
      email: payload.email,
      language: payload.language,
      level: payload.level,
      created_at: payload.created_at
    },
    {
      email: payload.email,
      language: payload.language,
      level: payload.level
    }
  ];
  for (var i = 0; i < rows.length; i += 1) {
    try {
      var result = await client.from('leads').insert([rows[i]]);
      if (result && !result.error) return { ok: true };
    } catch (err) { /* try next shape */ }
  }
  return { ok: false, reason: 'insert-failed' };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'method-not-allowed' });
  }

  var body = await readBody(req);
  var email = String((body && body.email) || '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    return json(res, 400, { ok: false, error: 'invalid-email' });
  }

  var lang = sheets.normalizeLang(body.language || body.lang);
  var level = sheets.normalizeLevel(body.level);
  var info = sheets.meta(lang, level);
  var base = siteUrl();
  var key = process.env.RESEND_API_KEY;
  if (!key) {
    return json(res, 503, { ok: false, error: 'missing-resend-key' });
  }

  var leadPayload = {
    email: email,
    language: lang,
    level: body.level || level,
    created_at: new Date().toISOString()
  };
  var lead = await insertLead(leadPayload);

  var from = process.env.RESEND_FROM || 'DayO <onboarding@resend.dev>';
  var subject = '[DayO] 🎁 신청하신 ' + info.name + ' 실전 회화 치트키와 9,900원 체험권이 도착했습니다!';
  var cheatSheet = DEFAULT_SITE + '/cheat-sheet.html?lang=' + encodeURIComponent(lang) + '&level=' + encodeURIComponent(level);

  try {
    var resend = new Resend(key);
    var sent = await resend.emails.send({
      from: from,
      to: email,
      subject: subject,
      html: emailHtml({ base: base, lang: lang, level: level, langName: info.name })
    });
    if (sent && sent.error) {
      return json(res, 502, {
        ok: false,
        error: 'resend-failed',
        detail: sent.error,
        leadSaved: !!(lead && lead.ok)
      });
    }
    var data = (sent && sent.data) || sent || {};
    return json(res, 200, {
      ok: true,
      id: data.id || null,
      lang: lang,
      level: level,
      coupon: COUPON_CODE,
      cheatSheet: cheatSheet,
      leadSaved: !!(lead && lead.ok)
    });
  } catch (err) {
    return json(res, 500, { ok: false, error: 'send-failed', leadSaved: !!(lead && lead.ok) });
  }
};
