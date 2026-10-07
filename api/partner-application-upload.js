/* Existing video URL stays unchanged. Profile requests use a separate handler. */
function createDispatcher(video = require('./_lib/partner-application-video'), image = require('./_lib/profile-image-handler')) {
  return async function handler(req, res) {
    const action = req.query && req.query.action;
    if (action === undefined) return video(req, res);
    if (action !== 'profile-image') {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.end(JSON.stringify({ error: 'invalid_upload_action' }));
    }
    const query = req.query;
    req.query = Object.fromEntries(Object.entries(query).filter(([key]) => key !== 'action'));
    try { return await image(req, res); }
    finally { req.query = query; }
  };
}
module.exports = createDispatcher();
module.exports.createDispatcher = createDispatcher;
