// Database Webhook receiver. Never called by, or awaited by, the public form.
const { createClient } = require('@supabase/supabase-js');
const { createHash, timingSafeEqual } = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const line = value => String(value ?? '—').replace(/\s+/g, ' ').trim();
function respond(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return respond(res, 405, { error: 'Method not allowed.' }); }
  const secret = String(process.env.PARTNER_APPLICATION_NOTIFICATION_SECRET || '');
  if (secret.length < 32) return respond(res, 503, { error: 'Notification service unavailable.' });
  const supplied = String(req.headers.authorization || '');
  const digest = value => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(digest(supplied), digest('Bearer ' + secret))) return respond(res, 401, { error: 'Unauthorized.' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return respond(res, 400, { error: 'Invalid request.' }); }
  // Also accept {application_id} for an authenticated, explicit failed-job retry.
  const webhook = body?.type === 'INSERT' && body?.schema === 'public' && body?.table === 'partner_application_notifications';
  const id = webhook ? body.record?.application_id : !body?.type ? body?.application_id : null;
  if (typeof id !== 'string' || !UUID.test(id)) return respond(res, 400, { error: 'Invalid application ID.' });
  const to = String(process.env.PARTNER_APPLICATION_NOTIFICATION_TO || '').trim();
  // Same sender as the existing send-welcome Resend integration.
  const from = String(process.env.RESEND_FROM || 'DayO <hello@dayotalk.com>').trim();
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to) || !from || /[\r\n]/.test(from) || !apiKey || !key || !url) {
    return respond(res, 503, { error: 'Notification service unavailable.' });
  }
  let client, job;
  try {
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const claimed = await client.rpc('claim_partner_application_notification', { p_application_id: id });
    if (claimed.error) throw new Error('claim_failed');
    job = claimed.data;
    if (!job) return respond(res, 200, { skipped: true });
    const app = job.payload;
    const languages = (app.partner_languages || []).map(line).join(', ');
    const country = line(app.current_country);
    const korea = ['korea','south korea','republic of korea','한국','대한민국'].includes(country.toLowerCase());
    const location = korea ? 'Korea resident' : app.current_country ? 'Overseas — ' + country : ['outside_korea','not_applicable_overseas'].includes(app.visa_type) ? 'Overseas' : 'Not collected';
    const visa = ['outside_korea','not_applicable_overseas'].includes(app.visa_type) ? 'Not applicable — living outside Korea' : app.visa_type === 'Other' ? 'Other visa' : line(app.visa_type);
    const text = [
      'New DayO Partner Application', '', 'Name: ' + line(app.full_name), 'Nationality: ' + line(app.nationality),
      'Native languages: ' + ((app.native_languages || []).map(line).join(', ') || 'Not collected'),
      'Session languages: ' + languages, 'Location: ' + location, 'Visa: ' + visa,
      'Weekly capacity: ' + line(app.weekly_session_capacity),
      'Review: ' + line(app.review_status) + ' / ' + line(app.review_score) + '/7', '',
      'Review application: https://dayo-sufk.vercel.app/admin/partner-applications?application=' + id,
    ].join('\n');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json', 'Idempotency-Key': 'partner-application/' + id },
      body: JSON.stringify({ from, to: [to], subject: ('[DayO] New Partner Application — ' + line(app.full_name) + ' / ' + languages).slice(0, 256), text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('provider_' + response.status);
    const result = await response.json();
    if (!result.id || typeof result.id !== 'string') throw new Error('invalid_provider_response');
    const finished = await client.rpc('finish_partner_application_notification', {
      p_application_id: id, p_lease_token: job.lease_token, p_provider_id: result.id, p_error: null,
    });
    if (finished.error || !finished.data) return respond(res, 503, { error: 'Notification acknowledgement pending.' });
    return respond(res, 200, { sent: true });
  } catch (error) {
    if (client && job) {
      // Never persist provider response bodies, applicant details, or credentials.
      const code = /^provider_\d{3}$/.test(error.message) ? error.message : 'delivery_failed';
      try { await client.rpc('finish_partner_application_notification', {
        p_application_id: id, p_lease_token: job.lease_token, p_provider_id: null, p_error: code,
      }); } catch { /* lease expires; the queue remains retryable */ }
    }
    return respond(res, 503, { error: 'Notification pending retry.' });
  }
};
