const { REPLY_TO, sender } = require('./transactional-email');
// Guidebook delivery and optional marketing consent are independent.
const { createHash, randomUUID } = require('node:crypto');
const GUIDE = 'https://www.dayotalk.com/guidebook/level-1';
const SOURCE = 'speaking_sense_guidebook';
const SUBJECT = '첫 대화 전, 이 가이드북부터 가볍게 읽어보세요 ☕';

function leadId(email) {
  // Stable UUID v5 makes the existing leads primary key a per-email deduplication key.
  const namespace = Buffer.from('eb1525909c0b40f085ee99200ffbf2b0', 'hex');
  const bytes = createHash('sha1').update(namespace).update(SOURCE + '/' + email).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

const text = [
  '안녕하세요, DayO 돼요입니다.', '',
  '첫 외국어 대화가 조금 긴장된다면 처음부터 끝까지 다 읽지 않아도 괜찮아요.',
  '막히는 순간에 필요한 문장부터 골라보세요.', '', '가이드북 열기: ' + GUIDE, '',
  '이 메일은 요청하신 PDF 가이드북 전달용입니다. 마케팅 수신 동의로 사용하지 않습니다.',
  '수신 동의 철회·이메일 정보 삭제 요청: hello@dayotalk.com'
].join('\n');
const html = `<div style="background:#FFFBF4;padding:24px;color:#594842;font-family:Apple SD Gothic Neo,Malgun Gothic,sans-serif;line-height:1.7">
  <div style="max-width:560px;margin:auto;background:#F8F0E3;border:1px solid #E8DDBD;border-radius:20px;padding:28px">
    <p>안녕하세요, DayO 돼요입니다.</p>
    <h1 style="font-size:23px;line-height:1.4">영어가 막혀도 대화는 계속돼요</h1>
    <p>첫 외국어 대화가 조금 긴장된다면<br>처음부터 끝까지 다 읽지 않아도 괜찮아요.</p>
    <p>막히는 순간에 필요한 문장부터 골라보세요.</p>
    <p><a href="${GUIDE}" style="display:inline-block;background:#5F7D63;color:white;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700">가이드북 열기</a></p>
    <p style="font-size:12px;color:#706259">요청하신 PDF 가이드북 전달용 메일입니다. 마케팅 수신 동의로 사용하지 않습니다.<br>
    수신 동의 철회·이메일 정보 삭제 요청: <a href="mailto:hello@dayotalk.com" style="color:#4F7C59">hello@dayotalk.com</a></p>
  </div>
</div>`;

module.exports = async function guidebook(body, email, res, { json, getSupabase }) {
  if (email.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) {
    return json(res, 400, { ok: false, error: 'invalid-email' });
  }
  if (body.consent !== true) return json(res, 400, { ok: false, error: 'consent-required' });
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = sender(process.env.RESEND_FROM);
  if (!apiKey || !process.env.SUPABASE_SERVICE_ROLE_KEY || !from || /[\r\n]/.test(from)) {
    return json(res, 503, { ok: false, error: 'delivery-unavailable' });
  }

  let saved = false;
  try {
    const client = getSupabase();
    if (!client) throw Error('storage-unavailable');
    const row = { id: leadId(email), email, source: SOURCE, marketing_consent: false, marketing_consented_at: null, marketing_withdrawn_at: null, guidebook_sent_at: null, marketing_unsubscribe_token: randomUUID() };
    const inserted = await client.from('leads').insert([row]).abortSignal(AbortSignal.timeout(2500));
    if (inserted.error && inserted.error.code !== '23505') throw Error('storage-unavailable');
    const existing = await client.from('leads').select('email,source,marketing_unsubscribe_token').eq('id', row.id)
      .maybeSingle().abortSignal(AbortSignal.timeout(1500));
    if (existing.error || !existing.data || existing.data.email !== email || existing.data.source !== SOURCE
        || !/^[0-9a-f-]{36}$/i.test(existing.data.marketing_unsubscribe_token || '')) throw Error('storage-unavailable');
    const unsubscribe = 'https://www.dayotalk.com/unsubscribe#token=' + existing.data.marketing_unsubscribe_token;
    if (body.marketingConsent === true) {
      // Unchecked repeat requests are not opt-outs. Only explicit opt-in changes consent.
      // Existing consent timestamp and created_at survive repeat requests and retries.
      const optedIn = await client.from('leads')
        .update({ marketing_consent: true, marketing_consented_at: new Date().toISOString() })
        .eq('id', row.id).eq('source', SOURCE).eq('marketing_consent', false)
        .abortSignal(AbortSignal.timeout(2500));
      if (optedIn.error) throw Error('storage-unavailable');
    }
    saved = true;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'guidebook/level-1/' + createHash('sha256').update(email).digest('hex')
      },
      body: JSON.stringify({ from, reply_to: REPLY_TO, to: [email], subject: SUBJECT, text: text + '\n광고성 이메일 수신 거부: ' + unsubscribe, html: html.replace('</div>\n</div>', '<p style="font-size:12px"><a href="' + unsubscribe + '" style="color:#4F7C59">수신 거부</a></p></div>\n</div>'), tags: [{ name: 'source', value: SOURCE }] }),
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) throw Error('delivery-failed');
    const data = await response.json();
    if (!data || typeof data.id !== 'string' || !data.id) throw Error('delivery-failed');
    // Keep the first successful delivery timestamp: provider idempotency retries
    // must not extend the 30-day retention period. No timestamp on failed delivery.
    const marked = await client.from('leads').update({ guidebook_sent_at: new Date().toISOString() })
      .eq('id', row.id).eq('source', SOURCE).is('guidebook_sent_at', null)
      .abortSignal(AbortSignal.timeout(2500));
    if (marked.error) throw Error('delivery-record-failed');
    return json(res, 200, { ok: true, guidebook: GUIDE, leadSaved: true });
  } catch (error) {
    // No provider details, addresses, keys or raw errors are exposed in logs/UI.
    return json(res, saved ? 502 : 503, { ok: false, error: saved ? 'delivery-failed' : 'storage-unavailable', leadSaved: saved });
  }
};
module.exports.leadId = leadId;
