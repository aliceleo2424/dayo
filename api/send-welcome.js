/* Vercel serverless: POST /api/send-welcome
 * Env: RESEND_API_KEY (required)
 */
var { prepareWelcome, markWelcomeSent } = require('./_lib/welcome-profile-state');
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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function welcomeHtml(nickname) {
  var name = escapeHtml(nickname || '회원');
  var cta = 'https://www.dayotalk.com/#how';
  return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>DayO 첫 대화 안내</title></head>' +
    '<body style="margin:0;padding:0;background:#FFF8F3;font-family:\'Apple SD Gothic Neo\',Pretendard,sans-serif;color:#5C4A42;">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FFF8F3;padding:24px 12px;"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#FFFCFA;border:1px solid #FFD1DC;border-radius:24px;overflow:hidden;">' +
    '<tr><td style="padding:28px 24px 18px;background:linear-gradient(135deg,#FFD1DC,#FFE5B4 55%,#FFF1D8);text-align:center;">' +
    '<p style="margin:0;font-size:13px;letter-spacing:.08em;font-weight:800;color:#FF755E;">DAYO</p>' +
    '<h1 style="margin:8px 0 0;font-size:28px;line-height:1.3;">DayO (돼요)</h1></td></tr>' +
    '<tr><td style="padding:28px 24px 8px;font-size:16px;line-height:1.7;">' +
    '<p style="margin:0 0 16px;">안녕하세요, <strong>' + name + '</strong>님!</p>' +
    '<p style="margin:0 0 16px;">배운 외국어를 실제 사람과 써보고 싶을 때, DayO에서 외국인 파트너와 편하게 1:1 화상 대화를 나눠 보세요.</p>' +
    '<p style="margin:0 0 8px;font-weight:800;">DayO에서는 이렇게 대화해요</p>' +
    '<ul style="margin:0 0 20px;padding-left:18px;line-height:1.7;">' +
    '<li>외국인 파트너를 선택하고, 한국어 도움이 필요하다면 한국어 가능한 파트너를 고를 수 있어요.</li>' +
    '<li>Talk Card(이야기 카드)로 대화를 시작하고, 막히는 순간에는 AI 단어 도움을 직접 열어 표현을 확인해요.</li>' +
    '<li>정기결제 없이 1회부터 필요한 만큼 선택할 수 있어요.</li>' +
    '</ul>' +
    '<p style="margin:0 0 20px;"><strong>첫 이용 9,900원 할인 혜택</strong>이 준비돼 있어요. 이용권은 결제 후 지급돼요.</p>' +
    '<p style="margin:0 0 24px;">예약 기능은 정식 오픈을 준비 중이에요. 먼저 DayO에서 대화 방식을 살펴보세요.</p>' +
    '<p style="margin:0 0 28px;text-align:center;"><a href="' + cta + '" style="display:inline-block;background:#FF755E;color:#ffffff;text-decoration:none;font-weight:800;border-radius:999px;padding:14px 22px;">DayO 둘러보기 ☕</a></p>' +
    '<p style="margin:0;font-size:13px;color:#9A8580;">문의: <a href="mailto:hello@dayotalk.com" style="color:#9A8580;">hello@dayotalk.com</a> | DayO 팀 드림</p>' +
    '</td></tr><tr><td style="padding:0 24px 28px;"></td></tr></table></td></tr></table></body></html>';
}

function welcomeText(nickname) {
  return '안녕하세요, ' + nickname + '님!\n' +
    '배운 외국어를 실제 사람과 써보고 싶을 때, DayO에서 외국인 파트너와 편하게 1:1 화상 대화를 나눠 보세요.\n\n' +
    'DayO에서는 이렇게 대화해요\n' +
    '• 외국인 파트너를 선택하고, 한국어 도움이 필요하다면 한국어 가능한 파트너를 고를 수 있어요.\n' +
    '• Talk Card(이야기 카드)로 대화를 시작하고, 막히는 순간에는 AI 단어 도움을 직접 열어 표현을 확인해요.\n' +
    '• 정기결제 없이 1회부터 필요한 만큼 선택할 수 있어요.\n\n' +
    '첫 이용 9,900원 할인 혜택이 준비돼 있어요. 이용권은 결제 후 지급돼요.\n\n' +
    '예약 기능은 정식 오픈을 준비 중이에요. 먼저 DayO에서 대화 방식을 살펴보세요.\n\n' +
    '[DayO 둘러보기 ☕]\nhttps://www.dayotalk.com/#how\n\n---\n' +
    '문의: hello@dayotalk.com | DayO 팀 드림';
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

    var payload = {
      from: 'DayO <hello@dayotalk.com>',
      to: [email],
      reply_to: 'dayo.speak@gmail.com',
      subject: '[DayO 돼요] 외국인 파트너와 첫 대화를 준비해 보세요 ☕',
      html: welcomeHtml(nickname),
      text: welcomeText(nickname)
    };

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
