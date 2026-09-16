/* Vercel serverless: POST /api/send-welcome
 * Env: RESEND_API_KEY (required)
 */
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
  var cta = 'https://dayotalk.com/#partners';
  return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>DayO 웰컴 쿠폰</title></head>' +
    '<body style="margin:0;padding:0;background:#FFF8F3;font-family:\'Apple SD Gothic Neo\',Pretendard,sans-serif;color:#5C4A42;">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FFF8F3;padding:24px 12px;"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#FFFCFA;border:1px solid #FFD1DC;border-radius:24px;overflow:hidden;">' +
    '<tr><td style="padding:28px 24px 18px;background:linear-gradient(135deg,#FFD1DC,#FFE5B4 55%,#FFF1D8);text-align:center;">' +
    '<p style="margin:0;font-size:13px;letter-spacing:.08em;font-weight:800;color:#FF755E;">DAYO</p>' +
    '<h1 style="margin:8px 0 0;font-size:28px;line-height:1.3;">DayO (돼요)</h1></td></tr>' +
    '<tr><td style="padding:28px 24px 8px;font-size:16px;line-height:1.7;">' +
    '<p style="margin:0 0 16px;">안녕하세요, <strong>' + name + '</strong>님!</p>' +
    '<p style="margin:0 0 16px;">약정 없이 가볍게, 친구와 카페에서 이야기 나누듯 편안한 1:1 글로벌 캐주얼 라운지 DayO입니다.</p>' +
    '<p style="margin:0 0 20px;">가입해 주신 <strong>' + name + '</strong>님을 위해 신규 회원 전용 <strong>[첫 세션 9,900원 체험 할인권]</strong>을 계정 쿠폰함에 넣어드렸어요.</p>' +
    '<p style="margin:0 0 8px;font-weight:800;">💡 DayO는 이렇게 가볍고 편안해요</p>' +
    '<ul style="margin:0 0 20px;padding-left:18px;line-height:1.7;">' +
    '<li><strong>약정 없이 가볍게:</strong> 큰 비용 묶이는 장기 약정 없이, 깔끔한 1회 티켓과 산뜻한 3회 패키지로 필요한 만큼만 충전해요.</li>' +
    '<li><strong>다양한 파트너, 다양한 언어:</strong> 여러 나라에서 온 현지 파트너들과 취향과 일상을 다채로운 언어로 자유롭게 나눠보세요.</li>' +
    '<li><strong>실시간 AI 매니저:</strong> 대화 중 단어가 생각나지 않아도 화면 속 AI 매니저가 자연스러운 표현 힌트를 살짝 띄워드려요.</li>' +
    '</ul>' +
    '<p style="margin:0 0 24px;">지금 나와 관심사가 맞는 글로벌 파트너를 확인하고, 편안한 첫 대화를 예약해 보세요.</p>' +
    '<p style="margin:0 0 28px;text-align:center;"><a href="' + cta + '" style="display:inline-block;background:#FF755E;color:#ffffff;text-decoration:none;font-weight:800;border-radius:999px;padding:14px 22px;">첫 세션 파트너 예약하기 ☕</a></p>' +
    '<p style="margin:0 0 8px;font-size:13px;color:#9A8580;">(내 스피킹 감각 진단은 언제든 무료로 이용하실 수 있습니다.)</p>' +
    '<p style="margin:0;font-size:13px;color:#9A8580;">문의: <a href="mailto:dayo.speak@gmail.com" style="color:#9A8580;">dayo.speak@gmail.com</a> | DayO 팀 드림</p>' +
    '</td></tr><tr><td style="padding:0 24px 28px;"></td></tr></table></td></tr></table></body></html>';
}

function welcomeText(nickname) {
  return '안녕하세요, ' + nickname + '님!\n' +
    '약정 없이 가볍게, 친구와 카페에서 이야기 나누듯 편안한 1:1 글로벌 캐주얼 라운지 DayO입니다.\n\n' +
    '가입해 주신 ' + nickname + '님을 위해 신규 회원 전용 [첫 세션 9,900원 체험 할인권]을 계정 쿠폰함에 넣어드렸어요.\n\n' +
    '💡 DayO는 이렇게 가볍고 편안해요\n' +
    '• 약정 없이 가볍게: 큰 비용 묶이는 장기 약정 없이, 깔끔한 1회 티켓과 산뜻한 3회 패키지로 필요한 만큼만 충전해요.\n' +
    '• 다양한 파트너, 다양한 언어: 여러 나라에서 온 현지 파트너들과 취향과 일상을 다채로운 언어로 자유롭게 나눠보세요.\n' +
    '• 실시간 AI 매니저: 대화 중 단어가 생각나지 않아도 화면 속 AI 매니저가 자연스러운 표현 힌트를 살짝 띄워드려요.\n\n' +
    '지금 나와 관심사가 맞는 글로벌 파트너를 확인하고, 편안한 첫 대화를 예약해 보세요.\n\n' +
    '[첫 세션 파트너 예약하기 ☕]\nhttps://dayotalk.com/#partners\n\n---\n' +
    '(내 스피킹 감각 진단은 언제든 무료로 이용하실 수 있습니다.)\n' +
    '문의: dayo.speak@gmail.com | DayO 팀 드림';
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
    var email = String(body.email || '').trim().toLowerCase();
    var nickname = String(body.nickname || '회원').trim() || '회원';
    if (!isValidEmail(email)) {
      json(res, 400, { ok: false, error: 'valid email is required' });
      return;
    }

    var payload = {
      from: 'DayO <hello@dayotalk.com>',
      to: [email],
      reply_to: 'dayo.speak@gmail.com',
      subject: '[DayO] ' + nickname + '님, 첫 세션 9,900원 체험 할인권이 도착했습니다 ☕',
      html: welcomeHtml(nickname),
      text: welcomeText(nickname)
    };

    var sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    var data = await sent.json().catch(function () { return {}; });
    if (!sent.ok) {
      json(res, 502, { ok: false, error: (data && (data.message || data.error)) || 'resend failed' });
      return;
    }
    json(res, 200, { ok: true, id: data && data.id ? data.id : null });
  } catch (err) {
    json(res, 500, { ok: false, error: (err && err.message) || 'welcome email failed' });
  }
};
