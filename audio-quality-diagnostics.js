/* QA-only inbound WebRTC metrics. No media, transcript, network requests or DB writes. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DayOAudioQualityDiagnostics = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var MAX_SAMPLES = 360, MAX_EVENTS = 100;
  var fields = ['packetsReceived', 'packetsLost', 'jitter', 'concealedSamples', 'packetsDiscarded', 'totalSamplesReceived'];
  function number(value) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
  function choice(value, allowed) { return allowed.indexOf(value) >= 0 ? value : null; }
  function state(pc) {
    return {
      connection: choice(pc.connectionState, ['new', 'connecting', 'connected', 'disconnected', 'failed', 'closed']),
      ice: choice(pc.iceConnectionState, ['new', 'checking', 'connected', 'completed', 'disconnected', 'failed', 'closed'])
    };
  }
  function readStats(report, previous) {
    var map = new Map(), audio = [], selected = null;
    report.forEach(function (row) { map.set(row.id, row); });
    map.forEach(function (row) {
      if (row.type === 'transport' && row.selectedCandidatePairId) selected = map.get(row.selectedCandidatePairId) || selected;
    });
    if (!selected) {
      var nominated = [];
      map.forEach(function (row) {
        if (row.type === 'candidate-pair' && row.state === 'succeeded') {
          if (row.selected) selected = row;
          else if (row.nominated) nominated.push(row);
        }
      });
      if (!selected && nominated.length === 1) selected = nominated[0];
    }
    var pair = null;
    if (selected) {
      var local = map.get(selected.localCandidateId) || {}, remote = map.get(selected.remoteCandidateId) || {};
      pair = {
        localType: choice(local.candidateType, ['host', 'srflx', 'prflx', 'relay']),
        remoteType: choice(remote.candidateType, ['host', 'srflx', 'prflx', 'relay']),
        protocol: choice(local.protocol, ['udp', 'tcp']),
        rttSeconds: number(selected.currentRoundTripTime)
      };
    }
    map.forEach(function (row) {
      if (row.type !== 'inbound-rtp' || row.isRemote || (row.kind || row.mediaType) !== 'audio') return;
      var old = previous.get(row.id), item = { stream: old ? old.stream : previous.size + 1 };
      fields.forEach(function (field) { item[field] = number(row[field]); });
      item.statsTimestampMs = number(row.timestamp);
      var elapsed = old && item.statsTimestampMs !== null && old.timestamp !== null ? item.statsTimestampMs - old.timestamp : null;
      item.intervalMs = elapsed > 0 ? elapsed : null;
      item.receivedDelta = old && item.intervalMs !== null && item.packetsReceived !== null && old.received !== null && item.packetsReceived >= old.received ? item.packetsReceived - old.received : null;
      // packetsLost can decrease when late packets arrive; retain the signed delta.
      item.lostDelta = old && item.intervalMs !== null && item.receivedDelta !== null && item.packetsLost !== null && old.lost !== null ? item.packetsLost - old.lost : null;
      item.counterReset = !!old && item.packetsReceived !== null && old.received !== null && item.packetsReceived < old.received;
      var codec = map.get(row.codecId) || {};
      item.codec = typeof codec.mimeType === 'string' && /^audio\/[a-z0-9.+-]{1,40}$/i.test(codec.mimeType) ? codec.mimeType : null;
      previous.set(row.id, { stream: item.stream, timestamp: item.statsTimestampMs, received: item.packetsReceived, lost: item.packetsLost });
      audio.push(item);
    });
    return { audio: audio, selectedPair: pair };
  }
  function enabled(access, optIn) {
    return !!(optIn && access && access.allowed && access.internalTest === true && !access.adminTest && !access.observer &&
      (access.role === 'user' || access.role === 'partner') && /^[0-9a-f-]{36}$/i.test(access.bookingId || ''));
  }
  function create(options) {
    options = options || {};
    var noop = function () {};
    if (!enabled(options.access, options.optIn)) return { enabled: false, bind: noop, detach: noop, event: noop, captureLocal: noop, destroy: noop, snapshot: function () { return null; } };
    var access = options.access, now = options.now || Date.now;
    var timers = options.timers || globalThis, doc = options.document || null, page = options.page || null;
    var storage = options.storage || null, key = 'dayo_audio_qa:v1:' + access.bookingId + ':' + access.role;
    var data = { version: 1, bookingId: access.bookingId, role: access.role, direction: access.role === 'user' ? 'partner_to_user' : 'user_to_partner', timestampSource: 'client_clock', samples: [], events: [] };
    var pc = null, segment = 0, previous = new Map(), removers = [], pageRemovers = [], tracks = new WeakSet();
    var stopped = false, inFlight = new WeakSet(), lastPersist = 0;
    try {
      var stored = storage && storage.getItem(key);
      var restored = stored && stored.length < 500000 ? JSON.parse(stored) : null;
      if (restored && restored.version === 1 && restored.bookingId === data.bookingId && restored.role === data.role &&
          typeof restored.savedAtMs === 'number' && now() - restored.savedAtMs >= 0 && now() - restored.savedAtMs < 7200000) {
        data.samples = Array.isArray(restored.samples) ? restored.samples.slice(-MAX_SAMPLES) : [];
        data.events = Array.isArray(restored.events) ? restored.events.slice(-MAX_EVENTS) : [];
        segment = Number.isSafeInteger(restored.lastSegment) && restored.lastSegment >= 0 ? restored.lastSegment : 0;
      }
    } catch (_) { /* diagnostics must not block a call */ }
    function persist(force) {
      if (!storage || (!force && now() - lastPersist < 30000)) return;
      lastPersist = now();
      try { storage.setItem(key, JSON.stringify(Object.assign({}, data, { savedAtMs: now(), lastSegment: segment }))); } catch (_) { /* memory-only when storage unavailable */ }
    }
    var events = ['connection', 'ice', 'track_initial', 'track_mute', 'track_unmute', 'track_ended', 'segment_start', 'segment_end', 'recovery', 'playback_blocked', 'playback_retry', 'visibility', 'stats_unavailable', 'stats_slow', 'stopped'];
    var reasons = ['audio-muted', 'audio-ended', 'peer-failed', 'peer-disconnected', 'foreground-audio-muted', 'closed', 'replaced', 'hidden', 'visible'];
    function event(type, reason, audioTrack) {
      if (stopped || events.indexOf(type) < 0) return;
      data.events.push({ at: new Date(now()).toISOString(), segment: segment, type: type, reason: choice(reason, reasons), state: pc ? state(pc) : null, audioTrack: audioTrack ? { muted: audioTrack.muted === true, enabled: audioTrack.enabled === true, readyState: choice(audioTrack.readyState, ['live', 'ended']) } : null });
      data.events = data.events.slice(-MAX_EVENTS);
      persist(true);
    }
    function listen(target, name, handler, bucket) {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(name, handler);
      bucket.push(function () { target.removeEventListener(name, handler); });
    }
    function track(track) {
      if (!track || track.kind !== 'audio' || tracks.has(track)) return;
      tracks.add(track);
      event('track_initial', null, track);
      ['mute', 'unmute', 'ended'].forEach(function (name) { listen(track, name, function () { event('track_' + name, null, track); }, removers); });
    }
    function detach(reason) {
      if (!pc) return;
      event('segment_end', reason);
      removers.splice(0).forEach(function (remove) { remove(); });
      tracks = new WeakSet(); pc = null; previous = new Map();
    }
    function sample() {
      if (stopped || !pc || inFlight.has(pc) || (doc && doc.visibilityState === 'hidden')) return;
      if (typeof pc.getStats !== 'function') { event('stats_unavailable'); return; }
      var source = pc, sourceSegment = segment;
      inFlight.add(source);
      // A slow/hung browser promise never causes overlapping getStats calls.
      var timeout = timers.setTimeout(function () { if (!stopped && pc === source) event('stats_slow'); }, 2000);
      Promise.resolve().then(function () { return source.getStats(); }).then(function (report) {
        if (stopped || pc !== source || segment !== sourceSegment) return;
        var metrics = readStats(report, previous);
        data.samples.push({ at: new Date(now()).toISOString(), segment: segment, state: state(source), audio: metrics.audio, selectedPair: metrics.selectedPair });
        data.samples = data.samples.slice(-MAX_SAMPLES); persist(false);
      }).catch(function () { if (!stopped && pc === source) event('stats_unavailable'); }).finally(function () { inFlight.delete(source); timers.clearTimeout(timeout); });
    }
    function bind(connection) {
      if (stopped || !connection) return;
      try {
        if (connection !== pc) {
          detach('replaced'); pc = connection; segment += 1;
          event('segment_start');
          listen(pc, 'connectionstatechange', function () { event('connection'); if (pc && pc.connectionState === 'closed') detach('closed'); }, removers);
          listen(pc, 'iceconnectionstatechange', function () { event('ice'); }, removers);
          listen(pc, 'track', function (e) { track(e.track); }, removers);
          sample();
        }
        if (typeof connection.getReceivers === 'function') connection.getReceivers().forEach(function (receiver) { track(receiver.track); });
      } catch (_) { event('stats_unavailable'); }
    }
    function captureLocal(stream) {
      if (stopped || !stream || typeof stream.getAudioTracks !== 'function') return;
      try {
        data.localAudioSettings = stream.getAudioTracks().slice(0, 2).map(function (t) {
          var settings = typeof t.getSettings === 'function' ? t.getSettings() : {};
          var safe = {};
          ['echoCancellation', 'noiseSuppression', 'autoGainControl'].forEach(function (k) { safe[k] = typeof settings[k] === 'boolean' ? settings[k] : null; });
          ['sampleRate', 'channelCount', 'latency'].forEach(function (k) { safe[k] = number(settings[k]); });
          return safe;
        });
        persist(true);
      } catch (_) { /* effective settings unavailable */ }
    }
    var interval = timers.setInterval(sample, 5000);
    listen(doc, 'visibilitychange', function () { event('visibility', doc.visibilityState); if (doc.visibilityState === 'visible') sample(); }, pageRemovers);
    listen(page, 'pagehide', function () { persist(true); }, pageRemovers);
    function destroy() {
      if (stopped) return;
      detach('closed'); event('stopped'); stopped = true;
      timers.clearInterval(interval); pageRemovers.splice(0).forEach(function (remove) { remove(); }); persist(true);
    }
    return { enabled: true, bind: bind, detach: detach, event: event, captureLocal: captureLocal, destroy: destroy,
      snapshot: function () { return JSON.parse(JSON.stringify(data)); } };
  }
  return { create: create, readStats: readStats, enabled: enabled };
});
