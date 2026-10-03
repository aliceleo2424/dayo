'use strict';

const FROM = 'DayO <hello@dayotalk.com>';
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const LANGUAGES = { en: '영어', ko: '한국어', es: '스페인어', fr: '프랑스어', ja: '일본어', zh: '중국어', vi: '베트남어', de: '독일어', it: '이탈리아어', ru: '러시아어' };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function kstTime(value) {
  // Database timestamptz must carry an offset; never use the host's timezone.
  if (!/(?:z|[+-]\d{2}(?::?\d{2})?)$/i.test(String(value || ''))) throw new Error('invalid_event_time');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('invalid_event_time');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}년 ${parts.month}월 ${parts.day}일 ${parts.hour}:${parts.minute} (KST, UTC+09:00)`;
}

function displayName(value, email) {
  const name = String(value || '').trim();
  if (!name || name.length > 80 || /[@\r\n\u0000-\u001f]/.test(name) ||
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(name) ||
      name.toLowerCase() === String(email || '').split('@')[0].toLowerCase()) return 'DayO Partner';
  return name;
}

function buildMessage(row, recipient, partnerName) {
  const s = row.snapshot;
  const partner = row.recipient_role === 'partner';
  const cancelled = row.event_type === 'booking_cancelled';
  const time = kstTime(s.scheduled_at);
  const language = LANGUAGES[s.language] || '예약에서 확인해 주세요';
  const link = 'https://www.dayotalk.com/' + (partner ? 'partner' : 'mypage');
  const place = partner ? 'Partner Lounge' : 'My Page';
  let subject;
  let intro;
  const lines = [`날짜·시작 시간: ${time}`, `대화 언어: ${language}`];
  if (cancelled) {
    if (s.ticket_refunded !== (s.end_reason === 'user_cancelled_early') ||
        s.partner_rewarded !== (s.end_reason === 'user_cancelled_late')) throw new Error('invalid_cancellation_state');
    subject = '[DayO 돼요] 대화 예약이 취소됐어요';
    intro = 'User가 아래 대화 예약을 취소했어요.';
    lines.push(s.ticket_refunded ? 'User의 사용 티켓이 반환되었습니다.' : 'User의 사용 티켓은 반환되지 않았습니다.');
    lines.push(s.partner_rewarded ? '취소 보상이 Partner에게 반영되었습니다.' : '이번 취소에는 Partner 보상이 적용되지 않았습니다.');
  } else {
    subject = partner ? '[DayO 돼요] 새로운 대화가 예약됐어요' : '[DayO 돼요] 대화 예약이 완료됐어요';
    intro = partner ? 'DayO User와의 1:1 글로벌 대화가 예약됐어요.' : '1:1 글로벌 대화 예약이 완료됐어요.';
    if (!partner) lines.push(`Partner: ${partnerName}`);
    lines.push('대화 시작 5분 전부터 입장할 수 있어요.');
  }
  lines.push(`${place}에서 예약을 확인해 주세요.`);
  const text = `${intro}\n\n${lines.join('\n')}\n\n${place}: ${link}\nDayO 돼요`;
  const html = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;background:#fff8f3;color:#483c36;font-family:Arial,sans-serif">' +
    '<table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #ffd1dc;border-radius:20px"><tr><td style="padding:28px 24px">' +
    '<p style="color:#e25a42;font-weight:bold">DayO 돼요</p>' +
    '<h1 style="font-size:23px;line-height:1.4">' + escapeHtml(subject.replace('[DayO 돼요] ', '')) + '</h1>' +
    '<p style="line-height:1.6">' + escapeHtml(intro) + '</p>' +
    lines.map(line => '<p style="line-height:1.6;margin:10px 0">' + escapeHtml(line) + '</p>').join('') +
    '<p style="margin-top:24px"><a href="' + link + '" style="display:inline-block;background:#ff755e;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none">' + place + '에서 확인</a></p>' +
    '</td></tr></table></td></tr></table></body></html>';
  return { from: FROM, to: [recipient], reply_to: 'dayo.speak@gmail.com', subject, text, html };
}

function makeStore(service) {
  async function checked(query) {
    const result = await query;
    if (result.error) throw new Error('notification_storage_unavailable');
    return result.data;
  }
  return {
    async claim(bookingId, eventType) {
      const rows = await checked(service.rpc('claim_booking_notification', { p_booking_id: bookingId || null, p_event_type: eventType || null }));
      return rows && rows[0] || null;
    },
    async save(row, changes) {
      const saved = await checked(service.from('booking_notification_log').update(changes)
        .eq('event_key', row.event_key).eq('lease_token', row.lease_token).eq('status', 'sending').select('event_key').maybeSingle());
      if (!saved) throw new Error('notification_lease_lost');
    },
    async user(id) {
      const result = await service.auth.admin.getUserById(id);
      if (result.error || !result.data || !result.data.user) throw new Error('recipient_unavailable');
      const user = result.data.user;
      if (user.id !== id || !user.email_confirmed_at || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(user.email || ''))) throw new Error('verified_email_unavailable');
      return user;
    },
    async partnerName(id, email) {
      const profile = await checked(service.from('profiles').select('nickname').eq('id', id).maybeSingle());
      return displayName(profile && profile.nickname, email);
    }
  };
}

async function sendResend(payload, key, apiKey, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      // jsonb storage may reorder object keys. Keep the wire body byte-stable too.
      body: JSON.stringify(payload, Object.keys(payload).sort()), signal: controller.signal
    });
    if (!response.ok) throw new Error('provider_http_' + response.status);
    const data = await response.json();
    if (!data || typeof data.id !== 'string' || !data.id) throw new Error('provider_response_unknown');
    return data.id;
  } finally { clearTimeout(timer); }
}

function failureCode(error) {
  const code = String(error && error.message || '');
  // Provider bodies, emails and tokens must never reach logs or API responses.
  return /^(provider_http_\d{3}|recipient_unavailable|verified_email_unavailable|invalid_event_time|invalid_cancellation_state|notification_storage_unavailable|notification_lease_lost|provider_response_unknown)$/.test(code)
    ? code : 'delivery_outcome_unknown';
}

async function dispatch(service, config, scope, options = {}) {
  const store = options.store || makeStore(service);
  const now = options.now || Date.now;
  const send = options.send || ((payload, key) => sendResend(payload, key, config.resendKey, options.fetch || fetch));
  const result = { sent: 0, failed: 0, review: 0 };
  // Two individual messages, not a batch containing both participants' emails.
  for (let i = 0; i < 2; i += 1) {
    const row = await store.claim(scope.bookingId, scope.eventType);
    if (!row) break;
    try {
      let payload = row.delivery_payload;
      let firstAttempt = row.first_attempt_at;
      if (!payload) {
        const recipient = await store.user(row.recipient_user_id);
        let name = 'DayO Partner';
        if (row.event_type === 'booking_confirmed' && row.recipient_role === 'learner') {
          const partner = await store.user(row.snapshot.partner_user_id);
          name = await store.partnerName(partner.id, partner.email);
        }
        payload = buildMessage(row, recipient.email, name);
        await store.save(row, { delivery_payload: payload });
      }
      if (firstAttempt && now() - new Date(firstAttempt).getTime() >= RETRY_WINDOW_MS) {
        await store.save(row, { status: 'needs_review', last_error: 'idempotency_window_expired', lease_token: null, lease_until: null });
        result.review += 1;
        continue;
      }
      if (!firstAttempt) {
        firstAttempt = new Date(now()).toISOString();
        // Freeze both payload and first attempt before making an external request.
        await store.save(row, { first_attempt_at: firstAttempt });
      }
      const providerId = await send(payload, row.event_key);
      await store.save(row, { status: 'sent', provider_id: providerId, sent_at: new Date(now()).toISOString(), last_error: null, lease_token: null, lease_until: null });
      result.sent += 1;
    } catch (error) {
      const code = failureCode(error);
      const review = /^(invalid_|provider_http_(400|401|403|409|422)$)/.test(code);
      const delay = Math.min(3600, 60 * 2 ** Math.min(row.attempts - 1, 6));
      try {
        await store.save(row, { status: review ? 'needs_review' : 'failed', last_error: code,
          next_attempt_at: new Date(now() + delay * 1000).toISOString(), lease_token: null, lease_until: null });
      } catch (_) { /* Expired lease can be reclaimed; the frozen provider key still protects a retry. */ }
      result[review ? 'review' : 'failed'] += 1;
    }
  }
  return result;
}

module.exports = { dispatch, makeStore, buildMessage, kstTime, displayName, sendResend, RETRY_WINDOW_MS };
