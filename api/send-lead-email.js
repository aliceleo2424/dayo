/* Vercel serverless: POST /api/send-lead-email
 * Env: RESEND_API_KEY (required), RESEND_FROM, DAYO_SITE_URL
 */
var sheets = require('../cheat-sheet-data.js');

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

function siteUrl(req, body) {
  var fromEnv = process.env.DAYO_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || '';
  if (fromEnv) return String(fromEnv).replace(/\/+$/, '');
  if (body && body.origin) return String(body.origin).replace(/\/+$/, '');
  var proto = (req.headers && (req.headers['x-forwarded-proto'] || req.headers['x-forwarded-protocol'])) || 'https';
  var host = (req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '';
  if (host) return proto + '://' + host;
  return 'https://dayo.kr';
}

function emailHtml(opts) {
  var cheatUrl = opts.base + '/cheat-sheet.html?lang=' + encodeURIComponent(opts.lang) + '&level=' + encodeURIComponent(opts.level);
  var bookingUrl = opts.base + '/index.html?booking=open';
  var info = sheets.meta(opts.lang, opts.level);
  return (
    '<div style="margin:0;padding:0;background:#FFF8F5;font-family:Apple SD Gothic Neo,Pretendard,sans-serif;color:#5C4A42;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F5;padding:24px 12px;">' +
        '<tr><td align="center">' +
          '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFCFA;border:1px solid #FFE8E3;border-radius:28px;overflow:hidden;">' +
            '<tr><td style="padding:28px 28px 8px;background:linear-gradient(135deg,#FFD1DC,#FFE5B4 62%,#FFF9C4);">' +
              '<p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;color:#E55A45;font-weight:800;">DAYO 돼요</p>' +
              '<h1 style="margin:0;font-size:22px;line-height:1.4;letter-spacing:-0.03em;">퀴즈 완주 축하해요 🎉</h1>' +
            '</td></tr>' +
            '<tr><td style="padding:22px 28px 8px;font-size:15px;line-height:1.7;">' +
              '<p style="margin:0 0 12px;">10초 레벨테스트를 끝까지 열어 주셔서 고마워요. ' +
              info.flag + ' <strong>' + info.name + ' · ' + info.levelName + '</strong> 페이스에 맞춰 바로 쓸 수 있는 회화 치트키를 보내드려요.</p>' +
              '<p style="margin:0 0 18px;color:#9A8580;font-size:14px;">' + info.title + '</p>' +
              '<p style="margin:0 0 22px;text-align:center;">' +
                '<a href="' + cheatUrl + '" style="display:inline-block;background:#FF6B57;color:#fff;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:18px;">🎁 맞춤 회화 치트키 확인하기</a>' +
              '</p>' +
              '<div style="background:#FFF8F5;border:1px solid #FFE8E3;border-radius:18px;padding:16px 18px;margin:0 0 18px;">' +
                '<p style="margin:0 0 6px;font-size:12px;font-weight:800;color:#E55A45;letter-spacing:0.04em;">첫 세션 체험 쿠폰</p>' +
                '<p style="margin:0 0 8px;font-size:22px;font-weight:800;letter-spacing:0.04em;">' + info.coupon + '</p>' +
                '<p style="margin:0;font-size:14px;line-height:1.6;color:#9A8580;">첫 세션이 <strong style="color:#5C4A42;">9,900원</strong>으로 열려요. 예약할 때 이 코드가 자동으로 적용돼요.</p>' +
              '</div>' +
              '<p style="margin:0 0 8px;text-align:center;">' +
                '<a href="' + bookingUrl + '" style="display:inline-block;color:#FF6B57;font-weight:800;text-decoration:none;">파트너와 첫 세션 예약하기 →</a>' +
              '</p>' +
            '</td></tr>' +
            '<tr><td style="padding:8px 28px 28px;font-size:12px;line-height:1.6;color:#9A8580;">' +
              '이 메일은 레벨테스트 자료 요청으로 보내드렸어요. 대화·세션·파트너와 함께 천천히 열어 보세요.<br>DayO 돼요' +
            '</td></tr>' +
          '</table>' +
        '</td></tr>' +
      '</table>' +
    '</div>'
  );
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
  var base = siteUrl(req, body);
  var key = process.env.RESEND_API_KEY;
  if (!key) {
    return json(res, 200, { ok: false, skipped: true, reason: 'missing-resend-key', lang: lang, level: level });
  }

  var from = process.env.RESEND_FROM || 'DayO <onboarding@resend.dev>';
  var subject = '🎁 [' + info.levelName + '] ' + info.name + ' 회화 치트키와 9,900원 체험 쿠폰이 도착했어요';

  try {
    var resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: from,
        to: [email],
        subject: subject,
        html: emailHtml({ base: base, lang: lang, level: level })
      })
    });
    var payload = await resp.json().catch(function () { return {}; });
    if (!resp.ok) {
      return json(res, 502, { ok: false, error: 'resend-failed', detail: payload });
    }
    return json(res, 200, {
      ok: true,
      id: payload.id || null,
      lang: lang,
      level: level,
      coupon: info.coupon,
      cheatSheet: base + '/cheat-sheet.html?lang=' + encodeURIComponent(lang) + '&level=' + encodeURIComponent(level)
    });
  } catch (err) {
    return json(res, 500, { ok: false, error: 'send-failed' });
  }
};
