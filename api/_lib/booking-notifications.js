'use strict';

const { FROM, REPLY_TO, locale, recipientLocale, renderEmail } = require('./transactional-email');
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

function buildMessage(row, recipient, partnerName, language = row.recipient_role === 'partner' ? 'en' : 'ko') {
  const s = row.snapshot;
  const partner = row.recipient_role === 'partner';
  const en = language === 'en';
  const cancelled = row.event_type === 'booking_cancelled';
  const canonicalTime = kstTime(s.scheduled_at); // One validated instant, converted once to KST.
  const [, year, month, day, clock] = canonicalTime.match(/^(\d{4})년 (\d{2})월 (\d{2})일 (\d{2}:\d{2})/);
  const date = en ? year + '-' + month + '-' + day : year + '년 ' + month + '월 ' + day + '일';
  const languagesEN = {en:'English',ko:'Korean',es:'Spanish',fr:'French',ja:'Japanese',zh:'Chinese',vi:'Vietnamese',de:'German',it:'Italian',ru:'Russian'};
  const spokenLanguage = (en ? languagesEN : LANGUAGES)[s.language] || (en ? 'See your booking' : '예약에서 확인해 주세요');
  const link = 'https://www.dayotalk.com/' + (partner ? 'partner' : 'mypage');
  const place = partner ? 'Partner Lounge' : 'My Page';
  const title = cancelled ? (en ? 'Session cancelled' : '대화 예약 취소') : (en ? 'Session booked' : '대화 예약 완료');
  let intro;
  const lines = [
    (en ? 'Status: ' : '예약 상태: ') + (cancelled ? (en ? 'Cancelled' : '취소됨') : (en ? 'Confirmed' : '예약됨')),
    (en ? 'Date: ' : '날짜: ') + date,
    (en ? 'Start time: ' : '시작 시간: ') + clock,
    (en ? 'Time zone: ' : '시간대: ') + 'KST (UTC+09:00)',
    en ? 'Conversation: 25 minutes' : '대화 시간: 25분',
    (en ? 'Conversation language: ' : '대화 언어: ') + spokenLanguage
  ];
  if (cancelled) {
    if (['partner_cancelled_early', 'partner_cancelled_late'].includes(s.end_reason)) {
      if (s.cancelled_by !== 'partner' || s.ticket_refunded !== true || s.partner_rewarded !== false ||
          s.late_cancel !== (s.end_reason === 'partner_cancelled_late') ||
          !Number.isInteger(s.penalty_amount) || (s.late_cancel ? s.penalty_amount <= 0 : s.penalty_amount !== 0)) {
        throw new Error('invalid_cancellation_state');
      }
      const reasons = en ? {schedule_change:'Unexpected schedule change',health:'Health reasons',school_exam:'School or exam schedule',technical:'Internet or device issues',personal:'Personal reasons',other:'Other'} :
        {schedule_change:'갑작스러운 일정 변경',health:'건강 문제',school_exam:'학교/시험 일정',technical:'인터넷·기기 문제',personal:'개인 사정',other:'기타'};
      intro = partner ? (en ? 'Your session below has been cancelled.' : '아래 대화 예약의 취소가 완료됐어요.') :
        s.public_reason === 'schedule_change' ? (en ? 'Your booked session has been cancelled due to a change in your partner’s schedule.' : '파트너 일정 변경으로 예약이 취소되었습니다.') :
        (en ? 'Your booked session has been cancelled due to your partner’s circumstances.' : '파트너 사정으로 예약이 취소되었습니다.');
      if (partner) {
        if (!Object.hasOwn(reasons, s.reason_code)) throw new Error('invalid_cancellation_state');
        lines.push((en ? 'Cancellation reason: ' : '취소 사유: ') + reasons[s.reason_code]);
        lines.push(s.late_cancel ? (en ? 'Late cancellation penalty: ' : '늦은 취소 패널티: ') + s.penalty_amount.toLocaleString(en ? 'en-US' : 'ko-KR') + 'P' :
          (en ? 'No separate penalty applies.' : '별도 패널티가 적용되지 않습니다.'));
        if (s.late_cancel) lines.push(en ? 'Your current balance is unchanged. The penalty will be offset against future eligible conversation earnings.' : '기존 잔액은 차감하지 않고 향후 정상 대화 보상에서 상계됩니다.');
      }
      lines.push(en ? 'The user’s original ticket has been returned with its original expiry date.' : '사용한 원래 티켓 1장이 반환되었습니다. 기존 유효기간이 유지됩니다.');
      if (!partner) lines.push(en ? 'Check your returned ticket and book another conversation in My Page.' : 'My Page에서 반환된 티켓을 확인하고 다른 대화를 예약해 주세요.');
    } else {
      if (s.ticket_refunded !== (s.end_reason === 'user_cancelled_early') ||
          s.partner_rewarded !== (s.end_reason === 'user_cancelled_late')) throw new Error('invalid_cancellation_state');
      intro = en ? 'The user has cancelled the session below.' : 'User가 아래 대화 예약을 취소했어요.';
      lines.push(s.ticket_refunded ? (en ? 'The user’s ticket has been returned.' : 'User의 사용 티켓이 반환되었습니다.') : (en ? 'The user’s ticket has not been returned.' : 'User의 사용 티켓은 반환되지 않았습니다.'));
      lines.push(s.partner_rewarded ? (en ? 'Cancellation compensation has been credited to the partner.' : '취소 보상이 Partner에게 반영되었습니다.') : (en ? 'No partner compensation applies to this cancellation.' : '이번 취소에는 Partner 보상이 적용되지 않았습니다.'));
    }
  } else {
    intro = partner ? (en ? 'A new 1:1 global conversation with a DayO user is confirmed.' : 'DayO User와의 1:1 글로벌 대화가 예약됐어요.') : (en ? 'Your 1:1 global conversation is confirmed.' : '1:1 글로벌 대화 예약이 완료됐어요.');
    if (!partner) lines.push('Partner: ' + partnerName);
    lines.push(en ? 'You can enter the room 5 minutes before the start.' : '대화 시작 5분 전부터 입장할 수 있어요.');
  }
  lines.push(en ? 'Check your booking in ' + place + '.' : place + '에서 예약을 확인해 주세요.');
  // Retries preserve the original event: never describe a retried confirmation as a new update.
  const subject = partner && en ? (cancelled ? '⚠️ [DayO] Session Cancelled — ' : '📅 [DayO] New Session Booked — ') + date + ', ' + clock :
    '[DayO] ' + title + ' — ' + date + ', ' + clock;
  const cta = en ? (partner ? 'View My Schedule' : 'View My Booking') : '예약 확인하기';
  return {from: FROM, to: [recipient], reply_to: REPLY_TO, subject,
    text: [intro, '', ...lines, '', cta + ': ' + link, (en ? 'Contact: ' : '문의: ') + REPLY_TO, 'DayO'].join('\n'),
    html: renderEmail({language, title, intro, lines, link, cta})};
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
    async previousLocale(row) {
      if (row.event_type !== 'booking_cancelled' || row.recipient_role === 'partner') return null;
      // Reuse this exact recipient/booking's already frozen confirmation, not another person's locale.
      try {
        const result = await service.from('booking_notification_log').select('delivery_payload')
          .eq('booking_id', row.booking_id).eq('recipient_user_id', row.recipient_user_id)
          .eq('event_type', 'booking_confirmed').maybeSingle();
        if (result.error) return null;
        const match = String(result.data?.delivery_payload?.html || '').match(/<html\s+lang=["'](en|ko)["']/i);
        return match ? match[1].toLowerCase() : null;
      } catch (_) { return null; } // Unknown locale must not block an existing notification.
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
        let requestedLocale = options.localeUserId === row.recipient_user_id ? locale(options.locale) : null;
        if (!requestedLocale && store.previousLocale) requestedLocale = await store.previousLocale(row);
        payload = buildMessage(row, recipient.email, name, recipientLocale(row.recipient_role, recipient.user_metadata, requestedLocale));
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
