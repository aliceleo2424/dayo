/* Partner English final captions: presentation only, over the existing PeerJS instance. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DayOPartnerCaptions = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var LABEL = 'dayo-partner-caption-v1';
  var TTL = 8000;
  function create(options) {
    options = options || {};
    var access = options.access || {};
    var language = Object.prototype.hasOwnProperty.call(access, 'wordHelpTargetLanguage')
      ? access.wordHelpTargetLanguage : access.language;
    var valid = !!(access.allowed && !access.adminTest && !access.observer && language === 'en' &&
      access.bookingId && access.userId && access.partnerId && access.learnerId &&
      ((access.role === 'partner' && access.userId === access.partnerId) ||
       (access.role === 'user' && access.userId === access.learnerId)));
    var receiver = valid && access.role === 'user';
    var sender = valid && access.role === 'partner';
    var now = options.now || Date.now;
    var later = options.setTimeout || setTimeout;
    var cancel = options.clearTimeout || clearTimeout;
    var doc = options.document || (typeof document !== 'undefined' ? document : null);
    var render = options.render || function () {};
    var peer = null, connection = null, remoteId = '', retry = 0, expiry = 0, opening = 0;
    var stopped = false, enabled = true, available = false, lastAt = 0, current = '';
    var seen = new Set();
    function draw() { render({ text: enabled ? current : '', enabled: enabled, available: available }); }
    function clearCaption() { cancel(expiry); expiry = 0; current = ''; available = false; draw(); }
    function closeConnection() {
      cancel(opening); opening = 0;
      var old = connection; connection = null;
      if (old) { try { old.close(); } catch (_) {} }
    }
    function scheduleRetry() {
      if (!receiver || stopped || retry || !remoteId) return;
      retry = later(function () { retry = 0; connect(); }, 2000);
    }
    function receive(packet, conn) {
      if (!receiver || stopped || conn !== connection || conn.peer !== remoteId) return;
      if (!packet || packet.type !== LABEL || packet.booking_id !== access.bookingId ||
          packet.sender_id !== access.partnerId || packet.recipient_id !== access.userId ||
          packet.speaker !== 'partner' || packet.language !== 'en' ||
          typeof packet.id !== 'string' || !packet.id || packet.id.length > 80 ||
          typeof packet.text !== 'string' || !packet.text.trim() || packet.text.length > 400 ||
          !Number.isFinite(packet.sent_at) || now() - packet.sent_at > TTL ||
          packet.sent_at - now() > 2000 || packet.sent_at < lastAt || seen.has(packet.id)) return;
      seen.add(packet.id);
      if (seen.size > 200) seen.delete(seen.values().next().value);
      lastAt = packet.sent_at;
      available = true;
      current = packet.text.replace(/\s+/g, ' ').trim();
      draw();
      cancel(expiry);
      expiry = later(clearCaption, Math.max(1, TTL - (now() - packet.sent_at)));
    }
    function bindConnection(conn) {
      if (!valid || stopped || !remoteId || conn.peer !== remoteId || conn.label !== LABEL) {
        try { conn.close(); } catch (_) {} return;
      }
      closeConnection(); connection = conn;
      conn.on('open', function () { if (connection === conn) { cancel(opening); opening = 0; } });
      if (!conn.open) opening = later(function () {
        opening = 0;
        if (connection !== conn || conn.open) return;
        closeConnection(); clearCaption(); scheduleRetry();
      }, 6000);
      conn.on('data', function (packet) { receive(packet, conn); });
      function ended() {
        if (connection !== conn) return;
        cancel(opening); opening = 0; connection = null; try { conn.close(); } catch (_) {} clearCaption(); scheduleRetry();
      }
      conn.on('close', ended); conn.on('error', ended);
    }
    function connect() {
      if (!receiver || stopped || !remoteId || connection || !peer || !peer.open) {
        if (receiver && remoteId && !stopped && !connection) scheduleRetry();
        return;
      }
      try { bindConnection(peer.connect(remoteId, { reliable: true, label: LABEL })); }
      catch (_) { scheduleRetry(); }
    }
    function publish(event) {
      if (!sender || stopped || !remoteId || !connection || !connection.open ||
          connection.peer !== remoteId) return;
      var entry = event && event.detail;
      if (!entry || entry.speaker !== 'partner' || typeof entry.id !== 'string' || !entry.id ||
          typeof entry.text !== 'string' || !entry.text.trim()) return;
      // The sender's existing local final event is never added/saved again here.
      var stamp = Date.parse(entry.timestamp instanceof Date ? entry.timestamp.toISOString() : entry.timestamp);
      if (!Number.isFinite(stamp) || Math.abs(now() - stamp) > TTL) return;
      try {
        connection.send({ type: LABEL, booking_id: access.bookingId, sender_id: access.userId,
          recipient_id: access.learnerId, speaker: 'partner', language: 'en', id: entry.id,
          text: entry.text.replace(/\s+/g, ' ').trim().slice(0, 400), sent_at: stamp });
      } catch (_) { closeConnection(); }
    }
    if (sender && doc) doc.addEventListener('dayo:transcript', publish);
    return {
      bindPeer: function (instance) {
        if (!valid || stopped || peer === instance) return;
        cancel(retry); retry = 0; closeConnection(); clearCaption(); peer = instance;
        if (!peer) return;
        instance.on('connection', function (conn) {
          if (peer !== instance || stopped || conn.label !== LABEL) return;
          if (sender) bindConnection(conn); else { try { conn.close(); } catch (_) {} }
        });
        instance.on('open', function () { if (peer === instance && !stopped) connect(); });
        instance.on('disconnected', function () {
          if (peer !== instance || stopped) return;
          closeConnection(); clearCaption(); scheduleRetry();
        });
        connect();
      },
      setRemotePeer: function (id) {
        if (!valid || stopped) return;
        id = String(id || '');
        if (id === remoteId) { connect(); return; }
        cancel(retry); retry = 0; closeConnection(); clearCaption(); remoteId = id;
        if (!id) { available = false; draw(); } else connect();
      },
      toggle: function () { if (!receiver || stopped) return; enabled = !enabled; draw(); },
      destroy: function () {
        stopped = true; cancel(retry); retry = 0; closeConnection();
        available = false; clearCaption();
        if (sender && doc) doc.removeEventListener('dayo:transcript', publish);
      }
    };
  }
  return { create: create };
});
