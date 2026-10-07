const crypto = require('node:crypto');
const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_BODY = 3 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
function failure(status, code) { return Object.assign(new Error(code), { status, code }); }
function client() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw failure(503, 'image_service_unavailable');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function actor(db, req) {
  const match = String(req.headers?.authorization || '').match(/^Bearer (\S+)$/);
  if (!match) throw failure(401, 'sign_in_required');
  const result = await db.auth.getUser(match[1]);
  if (result.error || !result.data?.user?.id) throw failure(401, 'sign_in_required');
  const profile = await db.from('profiles').select('id,role').eq('id', result.data.user.id).maybeSingle();
  if (profile.error || !profile.data) throw failure(403, 'profile_required');
  return profile.data;
}
function originAllowed(req) {
  const origin = req.headers?.origin;
  if (!origin) return true;
  const allowed = ['https://www.dayotalk.com', 'https://dayotalk.com', 'https://dayo-sufk.vercel.app'];
  if (process.env.VERCEL_URL) allowed.push('https://' + process.env.VERCEL_URL);
  return allowed.includes(origin);
}
async function body(req) {
  if (Number(req.headers?.['content-length']) > MAX_BODY) throw failure(413, 'image_too_large');
  let value = req.body;
  if (!value) {
    let chunks = [], size = 0;
    for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > MAX_BODY) throw failure(413, 'image_too_large'); chunks.push(chunk); }
    value = Buffer.concat(chunks.map(x => Buffer.from(x))).toString('utf8');
  }
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') {
    if (Buffer.byteLength(value) > MAX_BODY) throw failure(413, 'image_too_large');
    try { value = JSON.parse(value); } catch { throw failure(400, 'invalid_image_request'); }
  }
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).some(k => !['mime', 'base64'].includes(k))) throw failure(400, 'invalid_image_request');
  return value;
}
async function normalize(value) {
  if (!Object.hasOwn(TYPES, value.mime) || typeof value.base64 !== 'string' || !value.base64.length) throw failure(400, 'invalid_image_type');
  if (value.base64.length > Math.ceil(MAX_BYTES / 3) * 4) throw failure(413, 'image_too_large');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.base64)) throw failure(400, 'invalid_image');
  const input = Buffer.from(value.base64, 'base64');
  if (!input.length || input.length > MAX_BYTES) throw failure(413, 'image_too_large');
  const magic = input.subarray(0, 12);
  const format = magic[0] === 255 && magic[1] === 216 && magic[2] === 255 ? 'jpeg'
    : magic.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
    : magic.subarray(0,4).toString() === 'RIFF' && magic.subarray(8,12).toString() === 'WEBP' ? 'webp' : '';
  if (format !== TYPES[value.mime]) throw failure(400, 'invalid_image_type');
  try {
    const image = sharp(input, { limitInputPixels: 40000000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (metadata.format !== format || (metadata.pages || 1) !== 1) throw Error('Unsupported image');
    // Full decode/re-encode rejects truncated payloads and strips EXIF/GPS metadata.
    const result = await image.rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    if (!result.data.length || result.data.length > MAX_BYTES) throw failure(413, 'image_too_large');
    return result;
  } catch (error) { if (error.status) throw error; throw failure(400, 'invalid_image'); }
}
async function replace(db, user, normalized) {
  if (!['user', 'partner'].includes(user.role)) throw failure(403, 'image_upload_not_allowed');
  const id = crypto.randomUUID(), bucket = user.role === 'partner' ? 'partner-profile-images' : 'user-profile-images';
  const path = user.id + '/' + id + '.webp';
  const uploaded = await db.storage.from(bucket).upload(path, normalized.data, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
  if (uploaded.error) throw failure(503, 'image_upload_failed');
  let saved;
  try { saved = await db.rpc('replace_profile_image_asset', { p_user_id: user.id, p_asset_id: id, p_bucket: bucket, p_bytes: normalized.data.length, p_width: normalized.info.width, p_height: normalized.info.height }); }
  catch (_) { saved = { error: true }; }
  if (saved.error || !saved.data?.avatar_url) {
    // An ambiguous transport failure might follow a committed RPC. Do not delete
    // an active image: reconcile the private mapping before cleanup.
    const current = await db.from('profile_image_assets').select('asset_id').eq('owner_id', user.id).maybeSingle();
    if (current.error) throw failure(503, 'image_save_unconfirmed');
    if (!current.error && current.data?.asset_id !== id) {
      try {
        const removed = await db.storage.from(bucket).remove([path]);
        if (removed.error) await db.from('profile_image_cleanup').upsert({bucket_id:bucket,object_path:path});
      } catch (_) {
        try { await db.from('profile_image_cleanup').upsert({bucket_id:bucket,object_path:path}); } catch (_) { /* original mapping remains intact */ }
      }
    }
    if (!current.error && current.data?.asset_id === id) return { avatar_url: db.storage.from(bucket).getPublicUrl(path).data.publicUrl, version: id };
    throw failure(503, 'image_save_failed');
  }
  const previous = saved.data.previous;
  if (previous?.bucket && previous?.path) {
    // Cleanup failure never rolls back the new mapping. A service-only queue
    // records old objects for a subsequent authorized cleanup run.
    try {
      const removed = await db.storage.from(previous.bucket).remove([previous.path]);
      if (!removed.error) await db.from('profile_image_cleanup').delete().eq('object_path', previous.path).eq('bucket_id', previous.bucket);
    } catch (_) { /* queued old object remains for later cleanup */ }
  }
  return { avatar_url: saved.data.avatar_url, version: id };
}
module.exports = { MAX_BYTES, UUID, TYPES, failure, client, actor, originAllowed, body, normalize, replace };
