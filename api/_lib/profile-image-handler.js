/* Images only. Public URLs only; service credentials stay on the server. */
const lib = require('./profile-image');
function json(res, status, value) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)); }
function createHandler(makeClient = lib.client) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const method = req.method;
    if (!['POST', 'DELETE', 'OPTIONS'].includes(method)) { res.setHeader('Allow', 'POST, DELETE, OPTIONS'); return json(res, 405, { error: 'method_not_allowed' }); }
    try {
      if (!lib.originAllowed(req)) throw lib.failure(403, 'invalid_origin');
      if (req.headers?.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      if (method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
      const db = makeClient();
      if (method === 'POST') {
        const user = await lib.actor(db, req);
        if (Object.keys(req.query || {}).length) throw lib.failure(400, 'invalid_image_request');
        const value = await lib.body(req), normalized = await lib.normalize(value);
        return json(res, 200, await lib.replace(db, user, normalized));
      }
      if (method === 'DELETE') {
        const user = await lib.actor(db, req);
        if (user.role !== 'user') throw lib.failure(403, 'partner_photo_replacement_required');
        if (Object.keys(req.query || {}).length) throw lib.failure(400, 'invalid_image_request');
        if (req.body && (typeof req.body !== 'object' || Object.keys(req.body).length)) throw lib.failure(400, 'invalid_image_request');
        const deleted = await db.rpc('remove_user_profile_image_asset', { p_user_id: user.id });
        if (deleted.error || !deleted.data) throw lib.failure(503, 'image_save_failed');
        if (deleted.data.previous) {
          const old = deleted.data.previous;
          try { const removed = await db.storage.from(old.bucket).remove([old.path]); if (!removed.error) await db.from('profile_image_cleanup').delete().eq('bucket_id', old.bucket).eq('object_path', old.path); } catch (_) { /* retained in cleanup queue */ }
        }
        return json(res, 200, { avatar_url: deleted.data.avatar_url });
      }
    } catch (error) { return json(res, error.status || 503, { error: error.code || 'image_service_unavailable' }); }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
