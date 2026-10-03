/* Signed uploads only. Existing SUPABASE_SERVICE_ROLE_KEY stays on the server. */
const { createClient } = require('@supabase/supabase-js');
const { createHmac } = require('node:crypto');
const TYPES = {
  video: { bucket: 'partner-application-videos', max: 50 * 1024 * 1024, extensions: { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' } }
};
function respond(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return respond(res, 405, { error: 'Method not allowed.' }); }
  const origin = req.headers.origin;
  const sameOrigin = 'https://' + req.headers.host;
  if (origin && !['https://www.dayotalk.com', 'https://dayotalk.com', sameOrigin].includes(origin)) return respond(res, 403, { error: 'Invalid origin.' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return respond(res, 400, { error: 'Invalid request.' }); }
  if (!body || !body.video || body.photo) return respond(res, 400, { error: 'An introduction video is required; photos are not collected.' });
  for (const kind of ['video']) {
    const file = body[kind];
    if (file && (!Object.hasOwn(TYPES[kind].extensions, file.type) || !Number.isInteger(file.size) || file.size < 1 || file.size > TYPES[kind].max)) {
      return respond(res, 400, { error: 'Invalid ' + kind + ' type or size.' });
    }
  }
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '');
  if (!key || !url) return respond(res, 503, { error: 'Upload service unavailable.' });
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    // Vercel sets this header; store only a keyed hash, not the IP itself.
    const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    const requestHash = createHmac('sha256', key).update(ip).digest('hex');
    const issued = await client.rpc('issue_partner_application_upload', {
      p_request_hash: requestHash,
      p_video_extension: TYPES.video.extensions[body.video.type]
    });
    if (issued.error) return respond(res, issued.error.code === 'P0001' ? 429 : 503, { error: issued.error.code === 'P0001' ? 'Too many uploads. Please try again in 10 minutes.' : 'Upload service unavailable.' });
    const media = { id: issued.data.id };
    for (const kind of ['video']) {
      if (!body[kind]) continue;
      const path = issued.data[kind + '_path'];
      const signed = await client.storage.from(TYPES[kind].bucket).createSignedUploadUrl(path);
      if (signed.error || !signed.data?.token) return respond(res, 503, { error: 'Could not prepare upload.' });
      media[kind] = { bucket: TYPES[kind].bucket, path, token: signed.data.token };
    }
    return respond(res, 200, media);
  } catch { return respond(res, 503, { error: 'Upload service unavailable.' }); }
};
