/* Vercel serverless: POST /api/send-lead-email
 * Env: GMAIL_USER, GMAIL_APP_PASS (required),
 *      NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY
 */
var nodemailer = require('nodemailer');
var { createClient } = require('@supabase/supabase-js');
var sheets = require('../cheat-sheet-data.js');

var DEFAULT_SITE = 'https://dayo-black.vercel.app';
var DEFAULT_SUPABASE_URL = 'https://mmhapsimcngmtefqfrcg.supabase.co';
var COUPON_CODE = 'WELCOME9900';
var FROM_ADDRESS = 'DayO <dayo.speak@gmail.com>';

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

function defaultTemplate(langName) {
  return {
    subject: '[DayO] 🎁 신청하신 ' + langName + ' 실전 회화 치트키와 9,900원 체험권이 도착했습니다!',
    intro_text: '신청하신 ' + langName + ' 회화 치트키 자료입니다.',
    coupon_code: COUPON_CODE,
    extra_notice: '이 메일은 레벨테스트 자료 요청으로 보내드렸어요. DayO 돼요'
  };
}

async function fetchEmailTemplate(language) {
  var client = getSupabase();
  if (!client) return null;
  var wanted = String(language || 'ja').trim() || 'ja';
  var langs = wanted === 'ja' ? ['ja'] : [wanted, 'ja'];
  for (var i = 0; i < langs.length; i += 1) {
    try {
      var result = await client
        .from('email_templates')
        .select('*')
        .eq('language', langs[i])
        .single();
      if (result && result.data && !result.error) return result.data;
    } catch (err) { /* try fallback language */ }
  }
  return null;
}

function emailHtml(opts) {
  var cheatUrl = DEFAULT_SITE + '/cheat-sheet.html?lang=' + encodeURIComponent(opts.lang) +
    '&level=' + encodeURIComponent(opts.level || '');
  var bookingUrl = opts.base + '/index.html#booking';
  var intro = escapeHtml(opts.introText);
  var coupon = escapeHtml(opts.couponCode || COUPON_CODE);
  var notice = escapeHtml(opts.extraNotice || '');
  var noticeBlock = notice
    ? ('<tr><td style="padding:8px 28px 28px;font-size:12px;line-height:1.6;color:#9A8580;">' + notice + '</td></tr>')
    : '<tr><td style="padding:0 0 20px;"></td></tr>';
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
              '<p style="margin:0 0 18px;">' + intro + '</p>' +
              '<p style="margin:0 0 22px;text-align:center;">' +
                '<a href="' + cheatUrl + '" style="display:inline-block;background:#FF6B57;color:#fff;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:18px;">🎁 맞춤 치트키 열람하기</a>' +
              '</p>' +
              '<div style="background:#FFF8F5;border:1px solid #FFE8E3;border-radius:18px;padding:16px 18px;margin:0 0 18px;">' +
                '<p style="margin:0 0 6px;font-size:12px;font-weight:800;color:#E55A45;letter-spacing:0.04em;">첫 세션 9,900원 할인 쿠폰</p>' +
                '<p style="margin:0 0 8px;font-size:22px;font-weight:800;letter-spacing:0.04em;">' + coupon + '</p>' +
                '<p style="margin:0;font-size:14px;line-height:1.6;color:#9A8580;">예약 화면에서 이 코드를 적용하면 첫 세션이 <strong style="color:#5C4A42;">9,900원</strong>으로 열려요.</p>' +
              '</div>' +
              '<p style="margin:0 0 8px;text-align:center;">' +
                '<a href="' + bookingUrl + '" style="display:inline-block;color:#FF6B57;font-weight:800;text-decoration:none;">🎟️ 쿠폰 적용하고 대화 시작하기 →</a>' +
              '</p>' +
            '</td></tr>' +
            noticeBlock +
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

function getTransporter() {
  var user = String(process.env.GMAIL_USER || '').trim();
  var pass = String(process.env.GMAIL_APP_PASS || '').trim();
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: user, pass: pass }
  });
}

function smtpFailure(err) {
  var code = String((err && (err.code || err.responseCode)) || '');
  var raw = String((err && (err.response || err.message)) || '');
  if (code === 'EAUTH' || /535|534|authentication/i.test(raw + code)) {
    return {
      error: 'smtp-auth-failed',
      message: 'SMTP 인증에 실패했습니다. Gmail 앱 비밀번호를 확인해 주세요.'
    };
  }
  if (code === 'EENVELOPE' || /550|551|553|recipient|mailbox unavailable/i.test(raw)) {
    return {
      error: 'invalid-recipient',
      message: '수신 이메일 주소가 올바르지 않습니다. 주소를 다시 확인해 주세요.'
    };
  }
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET' || /connect|timeout/i.test(raw + code)) {
    return {
      error: 'smtp-connection-failed',
      message: '메일 서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.'
    };
  }
  return {
    error: 'send-failed',
    message: raw ? ('메일 전송에 실패했습니다: ' + raw) : '메일 전송에 실패했습니다.'
  };
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
    return json(res, 400, {
      ok: false,
      error: 'invalid-email',
      message: '올바른 이메일 주소 형식이 아닙니다: ' + (email || '(empty)')
    });
  }

  var lang = sheets.normalizeLang(body.language || body.lang);
  var level = sheets.normalizeLevel(body.level);
  var info = sheets.meta(lang, level);
  var base = siteUrl();
  var transporter = getTransporter();
  if (!transporter) {
    return json(res, 503, {
      ok: false,
      error: 'missing-gmail-credentials',
      message: '메일 서버 설정이 없습니다. GMAIL_USER / GMAIL_APP_PASS를 확인해 주세요.'
    });
  }

  var leadPayload = {
    email: email,
    language: lang,
    level: body.level || level,
    created_at: new Date().toISOString()
  };
  var lead = await insertLead(leadPayload);

  var dbTemplate = await fetchEmailTemplate(lang);
  var fallback = defaultTemplate(info.name);
  var template = dbTemplate || fallback;
  var subject = String(template.subject || fallback.subject);
  var introText = String(template.intro_text || fallback.intro_text);
  var couponCode = String(template.coupon_code || fallback.coupon_code || COUPON_CODE);
  var extraNotice = String(template.extra_notice != null ? template.extra_notice : fallback.extra_notice);
  var cheatSheet = DEFAULT_SITE + '/cheat-sheet.html?lang=' + encodeURIComponent(lang) +
    '&level=' + encodeURIComponent(body.level || level);

  try {
    var sent = await transporter.sendMail({
      from: FROM_ADDRESS,
      to: email,
      subject: subject,
      html: emailHtml({
        base: base,
        lang: lang,
        level: body.level || level,
        introText: introText,
        couponCode: couponCode,
        extraNotice: extraNotice
      })
    });
    return json(res, 200, {
      ok: true,
      id: (sent && (sent.messageId || sent.response)) || null,
      lang: lang,
      level: level,
      cheatSheet: cheatSheet,
      leadSaved: !!(lead && lead.ok)
    });
  } catch (err) {
    var detail = smtpFailure(err);
    return json(res, 502, {
      ok: false,
      error: detail.error,
      message: detail.message,
      leadSaved: !!(lead && lead.ok)
    });
  }
};
