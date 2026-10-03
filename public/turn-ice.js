(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DayOTurnIce = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var FALLBACK_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  function copyIceServer(server) {
    var copy = { urls: Array.isArray(server.urls) ? server.urls.slice() : server.urls };
    if (typeof server.username === 'string') copy.username = server.username;
    if (typeof server.credential === 'string') copy.credential = server.credential;
    if (typeof server.credentialType === 'string') copy.credentialType = server.credentialType;
    return copy;
  }

  function validIceServer(server) {
    if (!server || typeof server !== 'object') return false;
    var urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    var hasTurn = urls.some(function (url) { return /^turns?:/i.test(String(url || '')); });
    if (hasTurn && (typeof server.username !== 'string' || !server.username.trim() ||
        typeof server.credential !== 'string' || !server.credential.trim())) return false;
    return urls.length > 0 && urls.every(function (url) {
      return /^(?:stun|stuns|turn|turns):[^\s]+$/i.test(String(url || ''));
    });
  }

  function mergeIceServers(providerServers) {
    var merged = [];
    var seen = {};
    (Array.isArray(providerServers) ? providerServers : []).concat(FALLBACK_ICE_SERVERS)
      .filter(validIceServer)
      .forEach(function (server) {
        var key = JSON.stringify([server.urls, server.username || '', server.credential || '']);
        if (seen[key]) return;
        seen[key] = true;
        merged.push(copyIceServer(server));
      });
    return merged.length ? merged : FALLBACK_ICE_SERVERS.map(copyIceServer);
  }

  function safeFailureCode(error) {
    var code = String(error && error.code || '').toLowerCase();
    if (/^(?:missing_access_token|invalid_response|http_\d{3}|network_error)$/.test(code)) return code;
    return 'network_error';
  }

  function candidateType(candidate) {
    if (!candidate) return '';
    var direct = String(candidate.type || '').toLowerCase();
    if (/^(?:host|srflx|relay)$/.test(direct)) return direct;
    var match = String(candidate.candidate || '').match(/\btyp\s+(host|srflx|relay)\b/i);
    return match ? match[1].toLowerCase() : '';
  }

  function reportSelectedPair(pc, logEvent) {
    if (!pc || typeof pc.getStats !== 'function') return;
    Promise.resolve(pc.getStats()).then(function (stats) {
      var rows = [];
      if (stats && typeof stats.forEach === 'function') stats.forEach(function (row) { rows.push(row); });
      var byId = {};
      rows.forEach(function (row) { if (row && row.id) byId[row.id] = row; });
      var transport = rows.find(function (row) { return row && row.type === 'transport' && row.selectedCandidatePairId; });
      var pair = transport && byId[transport.selectedCandidatePairId];
      if (!pair) {
        pair = rows.find(function (row) {
          return row && row.type === 'candidate-pair' && row.state === 'succeeded' && (row.nominated || row.selected);
        });
      }
      if (!pair) return;
      var local = byId[pair.localCandidateId] || {};
      var remote = byId[pair.remoteCandidateId] || {};
      var localType = String(local.candidateType || '').toLowerCase();
      var remoteType = String(remote.candidateType || '').toLowerCase();
      logEvent('ice_selected_pair', {
        local_candidate_type: /^(?:host|srflx|relay)$/.test(localType) ? localType : 'unknown',
        remote_candidate_type: /^(?:host|srflx|relay)$/.test(remoteType) ? remoteType : 'unknown',
        relay_selected: localType === 'relay' || remoteType === 'relay'
      });
    }).catch(function () { /* ICE stats are best-effort telemetry only */ });
  }

  function createManager(options) {
    options = options || {};
    var fetchImpl = options.fetch;
    var getAccessToken = options.getAccessToken;
    var logEvent = typeof options.logEvent === 'function' ? options.logEvent : function () {};
    var warn = typeof options.warn === 'function' ? options.warn : function () {};
    var now = typeof options.now === 'function' ? options.now : Date.now;
    var cachedIceServers = null;
    var cachedUntil = 0;
    var pendingIceServers = null;
    var observedCandidateTypes = {};

    function fallback() {
      return FALLBACK_ICE_SERVERS.map(copyIceServer);
    }

    function getIceServers(access) {
      if (cachedIceServers && cachedUntil > now()) return Promise.resolve(cachedIceServers);
      if (pendingIceServers) return pendingIceServers;
      if (!access || !access.allowed || access.adminTest || access.observer || !access.bookingId) {
        cachedIceServers = fallback();
        cachedUntil = Infinity;
        return Promise.resolve(cachedIceServers);
      }

      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var requestTimer;
      var requestTimeout = new Promise(function (resolve, reject) {
        requestTimer = setTimeout(function () {
          if (controller) controller.abort();
          var timeoutError = new Error('credential request timed out');
          timeoutError.code = 'network_error';
          reject(timeoutError);
        }, options.requestTimeoutMs || 10000);
      });
      pendingIceServers = Promise.race([Promise.resolve()
        .then(function () {
          if (typeof getAccessToken !== 'function') {
            var tokenError = new Error('missing access token');
            tokenError.code = 'missing_access_token';
            throw tokenError;
          }
          return getAccessToken();
        })
        .then(function (token) {
          if (!token) {
            var tokenError = new Error('missing access token');
            tokenError.code = 'missing_access_token';
            throw tokenError;
          }
          if (typeof fetchImpl !== 'function') {
            var fetchError = new Error('fetch unavailable');
            fetchError.code = 'network_error';
            throw fetchError;
          }
          return fetchImpl('/api/turn-credentials', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + token,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ bookingId: access.bookingId }),
            signal: controller ? controller.signal : undefined
          });
        })
        .then(function (response) {
          if (!response || !response.ok) {
            var statusError = new Error('credential request failed');
            statusError.code = 'http_' + String(response && response.status || 0);
            throw statusError;
          }
          return response.json();
        }), requestTimeout])
        .then(function (body) {
          var providerServers = body && body.iceServers;
          var hasTurn = Array.isArray(providerServers) && providerServers.some(function (server) {
            var urls = Array.isArray(server && server.urls) ? server.urls : [server && server.urls];
            return urls.some(function (url) { return /^turns?:/i.test(String(url || '')); });
          });
          if (!hasTurn || !providerServers.every(validIceServer)) {
            var responseError = new Error('invalid credential response');
            responseError.code = 'invalid_response';
            throw responseError;
          }
          cachedIceServers = mergeIceServers(providerServers);
          cachedUntil = typeof body.expiresAt === 'number' && Number.isFinite(body.expiresAt)
            ? body.expiresAt - 60000 : now() + 55 * 60 * 1000;
          if (cachedUntil <= now()) {
            var expiryError = new Error('expired credential response');
            expiryError.code = 'invalid_response';
            throw expiryError;
          }
          logEvent('turn_credentials_ok', {
            turn_server_count: providerServers.reduce(function (count, server) {
              var urls = Array.isArray(server.urls) ? server.urls : [server.urls];
              return count + urls.filter(function (url) { return /^turns?:/i.test(String(url || '')); }).length;
            }, 0)
          });
          return cachedIceServers;
        })
        .catch(function (error) {
          var reason = safeFailureCode(error);
          cachedIceServers = fallback();
          cachedUntil = now() + 30000;
          logEvent('turn_credentials_failed', { reason: reason });
          warn('[DayO TURN] Temporary credentials unavailable; using STUN fallback (' + reason + ').');
          return cachedIceServers;
        }).finally(function () {
          clearTimeout(requestTimer);
          pendingIceServers = null;
        });

      return pendingIceServers;
    }

    function bindCall(call) {
      var pc = call && call.peerConnection;
      if (!pc || pc.__dayoTurnTelemetryBound || typeof pc.addEventListener !== 'function') return;
      pc.__dayoTurnTelemetryBound = true;
      pc.addEventListener('icecandidate', function (event) {
        var type = candidateType(event && event.candidate);
        if (!type || observedCandidateTypes[type]) return;
        observedCandidateTypes[type] = true;
        logEvent('ice_candidate_type', {
          candidate_type: type,
          relay_observed: type === 'relay'
        });
      });
      pc.addEventListener('iceconnectionstatechange', function () {
        if (pc.__dayoSelectedPairReported || (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed')) return;
        pc.__dayoSelectedPairReported = true;
        reportSelectedPair(pc, logEvent);
      });
    }

    return {
      getIceServers: getIceServers,
      bindCall: bindCall,
      getCachedIceServers: function () { return cachedIceServers; }
    };
  }

  return {
    FALLBACK_ICE_SERVERS: FALLBACK_ICE_SERVERS,
    mergeIceServers: mergeIceServers,
    candidateType: candidateType,
    reportSelectedPair: reportSelectedPair,
    createManager: createManager
  };
});
