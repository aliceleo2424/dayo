/* DayO live studio — Daily.co video, Web Speech STT, Gemini copilot, demo fallback */
(function () {
  'use strict';

  var GEMINI_MODELS = [
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-2.0-flash'
  ];

  var DEFAULT_PHRASES = [
    { en: "That sounds great — tell me more!", ko: '그거 좋네요, 좀 더 들려주세요!' },
    { en: "Same here.", ko: '저도요.' },
    { en: "Wait, can you say that another way?", ko: '잠깐, 다른 말로 해 줄 수 있어요?' }
  ];

  var micOn = true;
  var camOn = true;
  var hungUp = false;
  var demoMode = true;
  var geminiOk = false;
  var sttOn = false;

  var callFrame = null;
  var localStream = null;
  var recognition = null;
  var wantListen = true;
  var geminiBusy = false;
  var geminiTimer = 0;
  var recentLines = [];
  var lastHintsKey = '';
  var sessionTranscript = [];
  var sessionStartedAt = null;
  var sessionEndedAt = null;
  var utteranceSeq = 0;
  var sttRestartTimer = 0;
  var sttStartWatchdog = 0;
  var sttStarting = false;
  var sttPermissionBlocked = false;
  var sttResumePending = false;
  var sttMicAvailable = true;
  var sttGestureStartHandler = null;
  var boundLocalAudioTracks = typeof WeakSet === 'function' ? new WeakSet() : null;
  var preflightTimer = 0;
  var preflightMeterTimer = 0;
  var preflightAudioContext = null;
  var preflightMicDetected = false;
  var preflightFinalDetected = false;
  var transcriptSavePromise = null;
  var transcriptRevision = 0;
  var transcriptSavedRevision = -1;
  var transcriptSaveResult = null;
  var transcriptFlushPromise = null;
  var transcriptFinalized = false;

  window.sessionTranscript = window.sessionTranscript || [];
  window.dayoSessionEnded = false;

  function env(key) {
    var bag = window.__DAYO_ENV__ || {};
    return String(bag[key] || '').trim();
  }

  function t(key, vars) {
    if (window.DayOI18n) {
      return vars ? window.DayOI18n.tf(key, vars) : window.DayOI18n.t(key);
    }
    return key;
  }

  function showToast(msg, ms) {
    if (!msg) return;
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      toast.classList.remove('show');
    }, ms || 2600);
  }

  function isPartnerRoomMode() {
    if (typeof window.isPartnerRoomMode === 'function') {
      return window.isPartnerRoomMode();
    }
    try {
      if (document.body && document.body.classList.contains('theme-partner')) return true;
      if (String(localStorage.getItem('dayo_current_mode') || '').toUpperCase() === 'PARTNER') {
        return true;
      }
      var role = String(new URLSearchParams(location.search).get('role') || '').toLowerCase();
      if (role === 'partner') return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  function isObserverRoomMode() {
    if (typeof window.isObserverRoomMode === 'function') {
      return window.isObserverRoomMode();
    }
    try {
      return String(new URLSearchParams(location.search).get('role') || '').toLowerCase() === 'observer';
    } catch (e) {
      return false;
    }
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('timeout')); }, ms);
      Promise.resolve(promise).then(
        function (value) { clearTimeout(timer); resolve(value); },
        function (err) { clearTimeout(timer); reject(err); }
      );
    });
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function serializeTranscript(rows) {
    return (Array.isArray(rows) ? rows : []).map(function (row, i) {
      var ts = row && row.timestamp;
      if (ts instanceof Date) ts = ts.toISOString();
      else if (typeof ts !== 'string' || !ts.trim()) ts = null;
      return {
        id: (row && row.id) || ('t-' + i),
        speaker: String((row && row.speaker) || '').trim().toLowerCase(),
        text: String((row && row.text) || '').trim(),
        timestamp: ts
      };
    }).filter(function (row) { return row.text; });
  }

  function canonicalParticipantRole(access) {
    if (!access || !access.allowed || access.adminTest || access.observer) return '';
    if (access.role === 'user') return 'learner';
    if (access.role === 'partner') return 'partner';
    return '';
  }

  function transcriptStorageKey(access) {
    var role = canonicalParticipantRole(access);
    return role && access.bookingId ? 'dayo_session_transcript:' + String(access.bookingId) + ':' + role : '';
  }

  function timingStorageKey(access) {
    var role = canonicalParticipantRole(access);
    return role && access.bookingId ? 'dayo_session_timing:' + String(access.bookingId) + ':' + role : '';
  }

  function canonicalTranscriptSnapshot(rows, access) {
    var role = canonicalParticipantRole(access);
    if (!role) return [];
    return serializeTranscript(rows).filter(function (row) {
      return row.speaker === role && typeof row.timestamp === 'string' &&
        row.timestamp.trim() && Number.isFinite(Date.parse(row.timestamp));
    });
  }

  function restoreSessionTiming(access) {
    var key = timingStorageKey(access);
    var scheduled = access && access.scheduledAt ? Date.parse(access.scheduledAt) : NaN;
    var windowStart = Number.isFinite(scheduled) ? scheduled - 5 * 60 * 1000 : NaN;
    var windowEnd = Number.isFinite(scheduled) ? scheduled + 35 * 60 * 1000 : NaN;
    var storedState = null;
    if (key) {
      try { storedState = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) { storedState = null; }
    }
    var storedStart = storedState && typeof storedState.startedAt === 'string'
      ? Date.parse(storedState.startedAt) : NaN;
    var storedEnd = storedState && typeof storedState.endedAt === 'string'
      ? Date.parse(storedState.endedAt) : NaN;
    var validStart = Number.isFinite(storedStart) && Number.isFinite(windowStart) &&
      storedStart >= windowStart && storedStart <= windowEnd;
    sessionStartedAt = validStart ? new Date(storedStart).toISOString() : new Date().toISOString();
    var validEnd = Number.isFinite(storedEnd) && Number.isFinite(windowStart) &&
      storedEnd >= windowStart && storedEnd <= windowEnd && storedEnd >= Date.parse(sessionStartedAt);
    sessionEndedAt = validEnd ? new Date(storedEnd).toISOString() : null;
    if (key) {
      try { sessionStorage.setItem(key, JSON.stringify({ startedAt: sessionStartedAt, endedAt: sessionEndedAt })); } catch (e) { /* ignore */ }
    }
  }

  function markSessionEnded(access) {
    if (!sessionEndedAt) sessionEndedAt = new Date().toISOString();
    var key = timingStorageKey(access);
    if (key) {
      try { sessionStorage.setItem(key, JSON.stringify({ startedAt: sessionStartedAt, endedAt: sessionEndedAt })); } catch (e) { /* ignore */ }
    }
    return sessionEndedAt;
  }

  function backupTranscriptLocal() {
    var serialized = serializeTranscript(sessionTranscript);
    try {
      window.localStorage.setItem('last_session_transcript', JSON.stringify(serialized));
      var key = transcriptStorageKey(window.DayORoomAccess);
      if (key) window.localStorage.setItem(key, JSON.stringify(canonicalTranscriptSnapshot(serialized, window.DayORoomAccess)));
    } catch (e) { /* quota / private mode */ }
    window.DayOLastTranscript = serialized;
    window.sessionTranscript = serialized.slice();
    return serialized;
  }

  function recoverTranscriptForQuiz() {
    var access = window.DayORoomAccess;
    var key = transcriptStorageKey(access);
    if (!key) return [];
    try {
      var rows = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(rows) ? canonicalTranscriptSnapshot(rows, access) : [];
    } catch (e) {
      return [];
    }
  }

  function shouldKeepSttAlive() {
    return wantListen && micOn && sttMicAvailable && !hungUp && !window.dayoSessionEnded;
  }

  function sttTelemetryKey() {
    var access = window.DayORoomAccess;
    return access && access.bookingId ? 'dayo_stt_telemetry:' + String(access.bookingId) : '';
  }

  function recordSttState(type, detail) {
    var allowed = {
      stt_start: true,
      stt_audio_start: true,
      stt_speech_start: true,
      stt_result_final: true,
      stt_error: true,
      stt_end: true,
      stt_restart: true
    };
    if (!allowed[type]) return;
    var access = window.DayORoomAccess || {};
    var entry = {
      event: type,
      at: new Date().toISOString(),
      role: access.role === 'partner' ? 'partner' : 'learner'
    };
    var safe = detail || {};
    if (safe.code) entry.code = String(safe.code).slice(0, 80);
    if (safe.reason) entry.reason = String(safe.reason).slice(0, 80);
    if (Number.isFinite(Number(safe.char_count))) entry.char_count = Math.max(0, Number(safe.char_count));
    if (safe.preflight === true) entry.preflight = true;
    var key = sttTelemetryKey();
    if (key) {
      try {
        var rows = JSON.parse(sessionStorage.getItem(key) || '[]');
        if (!Array.isArray(rows)) rows = [];
        rows.push(entry);
        sessionStorage.setItem(key, JSON.stringify(rows.slice(-80)));
      } catch (e) { /* private mode / quota */ }
    }
    try {
      document.dispatchEvent(new CustomEvent('dayo:stt-state', { detail: entry }));
    } catch (e) { /* older browser */ }
  }

  function clearSttStartWatchdog() {
    clearTimeout(sttStartWatchdog);
    sttStartWatchdog = 0;
  }

  function attemptSttStart(reason) {
    if (!recognition || !shouldKeepSttAlive() || sttOn || sttStarting) return;
    if (document.visibilityState === 'hidden') {
      sttResumePending = true;
      return;
    }
    sttStarting = true;
    sttResumePending = false;
    if (reason && reason !== 'initial') recordSttState('stt_restart', { reason: reason });
    try {
      recognition.start();
      clearSttStartWatchdog();
      sttStartWatchdog = setTimeout(function () {
        if (!sttStarting || sttOn) return;
        sttStarting = false;
        recordSttState('stt_error', { code: 'start_timeout' });
        scheduleSttRestart(800, 'start-timeout');
      }, 4000);
    } catch (error) {
      sttStarting = false;
      clearSttStartWatchdog();
      recordSttState('stt_error', { code: (error && error.name) || 'start_failed' });
      if (shouldKeepSttAlive() && !sttPermissionBlocked) scheduleSttRestart(800, 'start-failed');
    }
  }

  function scheduleSttRestart(delayMs, reason) {
    if (!shouldKeepSttAlive() || sttPermissionBlocked) return;
    if (document.visibilityState === 'hidden') {
      sttResumePending = true;
      return;
    }
    clearTimeout(sttRestartTimer);
    sttRestartTimer = setTimeout(function () {
      if (!shouldKeepSttAlive() || !recognition) return;
      attemptSttStart(reason || 'scheduled');
    }, delayMs || 300);
  }

  function appendTranscriptRowToViewer(entry) {
    if (!entry || !entry.text) return;
    var viewer = document.getElementById('popup-transcript-list') ||
      document.getElementById('partner-transcript-viewer');
    if (!viewer) return;
    var speaker = String(entry.speaker || 'learner').toLowerCase();
    var isUser = speaker !== 'partner';
    var row = document.createElement('div');
    row.style.cssText = isUser
      ? 'background: #EAF8F2; padding: 9px 12px; border-radius: 10px; border: 1px solid #B8E2C8; line-height: 1.4; font-size: 12px;'
      : 'background: #FFF; padding: 9px 12px; border-radius: 10px; border: 1px solid #E5E7EB; line-height: 1.4; font-size: 12px;';
    row.innerHTML = '<strong>' + (isUser ? 'User' : 'Partner') + ':</strong> ' + escapeHtml(entry.text);
    viewer.appendChild(row);
    viewer.scrollTop = viewer.scrollHeight;
  }

  function bindMobileSttBootstrap() {
    if (window.__dayoSttBootstrapped) return;
    window.__dayoSttBootstrapped = true;
    var bootStart = function () {
      if (window.dayoSessionEnded) return;
      wantListen = true;
      if (window.__dayoPreflightActive && !window.__dayoPreflightStarted) return;
      sttPermissionBlocked = false;
      if (!recognition) startSpeech(true);
      else if (micOn) resumeSpeech('user-gesture');
    };
    sttGestureStartHandler = function () {
      bootStart();
    };
    document.addEventListener('click', sttGestureStartHandler, true);
    document.addEventListener('touchstart', sttGestureStartHandler, { capture: true, passive: true });
  }

  function preflightNode(id) {
    return document.getElementById(id);
  }

  function setPreflightConnectionCheck(id, key, state) {
    var node = preflightNode(id);
    if (node) node.setAttribute('data-i18n', key);
    setPreflightCheck(id, t(key), state);
  }

  function setPreflightCheck(id, text, state) {
    var node = preflightNode(id);
    if (!node) return;
    node.textContent = text;
    node.classList.remove('is-ok', 'is-warn');
    if (state) node.classList.add(state);
  }

  function stopPreflightMeter() {
    clearInterval(preflightMeterTimer);
    preflightMeterTimer = 0;
    if (preflightAudioContext && typeof preflightAudioContext.close === 'function') {
      try { preflightAudioContext.close(); } catch (e) { /* ignore */ }
    }
    preflightAudioContext = null;
  }

  function startPreflightMeter(stream) {
    stopPreflightMeter();
    if (!stream || typeof stream.getAudioTracks !== 'function' || !stream.getAudioTracks().length) return;
    var AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    try {
      preflightAudioContext = new AudioContextCtor();
      var source = preflightAudioContext.createMediaStreamSource(stream);
      var analyser = preflightAudioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      var data = new Uint8Array(analyser.fftSize);
      var resumeAttempt = preflightAudioContext.resume();
      if (resumeAttempt && typeof resumeAttempt.catch === 'function') {
        resumeAttempt.catch(function () { /* user gesture may be required */ });
      }
      preflightMeterTimer = setInterval(function () {
        analyser.getByteTimeDomainData(data);
        var energy = 0;
        for (var i = 0; i < data.length; i += 1) {
          var sample = (data[i] - 128) / 128;
          energy += sample * sample;
        }
        if (Math.sqrt(energy / data.length) > 0.018) {
          preflightMicDetected = true;
          setPreflightConnectionCheck('devicePreflightMic', 'room.connection.micDetected', 'is-ok');
        }
      }, 120);
    } catch (error) {
      setPreflightConnectionCheck('devicePreflightMic', 'room.connection.micInputUnavailable', 'is-warn');
    }
  }

  function bindLocalAudioTrack(stream) {
    if (!stream || typeof stream.getAudioTracks !== 'function') return;
    var track = stream.getAudioTracks()[0];
    if (!track || (boundLocalAudioTracks && boundLocalAudioTracks.has(track))) return;
    if (boundLocalAudioTracks) boundLocalAudioTracks.add(track);
    sttMicAvailable = track.readyState === 'live' && !track.muted;
    track.addEventListener('mute', function () {
      sttMicAvailable = false;
      sttResumePending = true;
      recordSttState('stt_error', { code: 'mic_track_muted' });
      pauseSpeech();
    });
    track.addEventListener('unmute', function () {
      sttMicAvailable = track.readyState === 'live';
      if (sttMicAvailable && shouldKeepSttAlive()) scheduleSttRestart(180, 'mic-track-unmuted');
    });
    track.addEventListener('ended', function () {
      sttMicAvailable = false;
      sttResumePending = false;
      clearTimeout(sttRestartTimer);
      recordSttState('stt_error', { code: 'mic_track_ended' });
      pauseSpeech();
    });
  }

  function attachPreflightStream(stream) {
    if (!stream) return;
    bindLocalAudioTrack(stream);
    var video = preflightNode('devicePreflightVideo');
    var videoTrack = typeof stream.getVideoTracks === 'function' ? stream.getVideoTracks()[0] : null;
    var audioTrack = typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks()[0] : null;
    if (video && video.srcObject !== stream) {
      video.srcObject = stream;
      var previewPlay = video.play();
      if (previewPlay && typeof previewPlay.catch === 'function') {
        previewPlay.catch(function () { /* muted preview */ });
      }
    }
    setPreflightConnectionCheck('devicePreflightCamera',
      videoTrack && videoTrack.readyState === 'live' ? 'room.connection.cameraReady' : 'room.connection.cameraUnavailable',
      videoTrack && videoTrack.readyState === 'live' ? 'is-ok' : 'is-warn');
    setPreflightConnectionCheck('devicePreflightMic',
      audioTrack && audioTrack.readyState === 'live' ? 'room.connection.micReady' : 'room.connection.micUnavailable',
      audioTrack && audioTrack.readyState === 'live' ? '' : 'is-warn');
    if (window.__dayoPreflightStarted && preflightTimer) startPreflightMeter(stream);
  }

  function currentLocalStream() {
    return window.localMediaStream || window.__localCamStream || localStream || null;
  }

  function finishDevicePreflight() {
    window.__dayoPreflightActive = false;
    clearInterval(preflightTimer);
    preflightTimer = 0;
    stopPreflightMeter();
    var overlay = preflightNode('devicePreflight');
    if (overlay) overlay.hidden = true;
    if (shouldKeepSttAlive()) {
      sttPermissionBlocked = false;
      if (!recognition) startSpeech(true);
      else resumeSpeech('preflight-finished');
    }
  }

  function startDevicePreflight() {
    window.__dayoPreflightStarted = true;
    preflightMicDetected = false;
    preflightFinalDetected = false;
    var stream = currentLocalStream();
    if (stream) {
      attachPreflightStream(stream);
      startPreflightMeter(stream);
    }
    sttPermissionBlocked = false;
    if (!recognition) startSpeech(true);
    else resumeSpeech('preflight');
    var remaining = 15;
    var button = preflightNode('devicePreflightStart');
    if (button) button.textContent = remaining + '초 동안 말해보세요';
    clearInterval(preflightTimer);
    preflightTimer = setInterval(function () {
      remaining -= 1;
      if (button) button.textContent = remaining > 0 ? remaining + '초 동안 말해보세요' : '다시 테스트';
      if (remaining > 0) return;
      clearInterval(preflightTimer);
      preflightTimer = 0;
      if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
        setPreflightCheck('devicePreflightStt', '브라우저에서 음성 인식을 사용할 수 없어요.', 'is-warn');
      } else if (preflightMicDetected && !sttOn) {
        setPreflightCheck('devicePreflightStt', '마이크는 연결됐지만 음성 인식이 시작되지 않았어요.', 'is-warn');
      } else if (!preflightFinalDetected) {
        setPreflightCheck('devicePreflightStt', '문장이 인식되지 않았어요. 다시 테스트해 주세요.', 'is-warn');
      }
    }, 1000);
  }

  function handlePreflightSttState(event) {
    if (!window.__dayoPreflightActive) return;
    var state = event && event.detail || {};
    if (state.event === 'stt_start') {
      setPreflightCheck('devicePreflightStt', '음성 인식이 시작됐어요. 한 문장 말해보세요.', '');
    } else if (state.event === 'stt_audio_start') {
      setPreflightCheck('devicePreflightStt', '음성을 듣고 있어요.', '');
    } else if (state.event === 'stt_speech_start') {
      setPreflightCheck('devicePreflightStt', '말소리를 감지했어요.', '');
    } else if (state.event === 'stt_result_final') {
      preflightFinalDetected = true;
      setPreflightCheck('devicePreflightStt', '마이크와 음성 인식이 준비됐어요.', 'is-ok');
      var button = preflightNode('devicePreflightStart');
      if (button) button.textContent = '준비 완료';
    } else if (state.event === 'stt_error' && state.code !== 'no-speech') {
      setPreflightCheck('devicePreflightStt',
        state.code === 'not-allowed' || state.code === 'service-not-allowed'
          ? '브라우저에서 음성 인식 권한을 허용해 주세요.'
          : '음성 인식이 시작되지 않았어요. 다시 테스트해 주세요.', 'is-warn');
    }
  }

  function initDevicePreflight() {
    var overlay = preflightNode('devicePreflight');
    var access = window.DayORoomAccess;
    if (!overlay || window.__dayoInAppBlocked || !access || !access.allowed || access.observer) return;
    window.__dayoPreflightActive = true;
    window.__dayoPreflightStarted = false;
    overlay.hidden = false;
    var startButton = preflightNode('devicePreflightStart');
    var continueButton = preflightNode('devicePreflightContinue');
    if (startButton) startButton.addEventListener('click', startDevicePreflight);
    if (continueButton) continueButton.addEventListener('click', finishDevicePreflight);
    document.addEventListener('dayo:stt-state', handlePreflightSttState);
    var attempts = 0;
    var streamWait = setInterval(function () {
      attempts += 1;
      var stream = currentLocalStream();
      if (stream) {
        clearInterval(streamWait);
        attachPreflightStream(stream);
      } else if (attempts >= 40) {
        clearInterval(streamWait);
        setPreflightConnectionCheck('devicePreflightCamera', 'room.connection.cameraPermission', 'is-warn');
        setPreflightConnectionCheck('devicePreflightMic', 'room.connection.micPermission', 'is-warn');
      }
    }, 250);
  }

  function pushTranscript(text, speaker) {
    if (transcriptFinalized) return null;
    var cleaned = String(text || '').trim();
    if (!cleaned) return null;
    var role = speaker || 'learner';
    var last = sessionTranscript[sessionTranscript.length - 1];
    if (last && last.speaker === role && last.text === cleaned) return last;
    utteranceSeq += 1;
    var entry = {
      id: uuid(),
      speaker: role,
      text: cleaned,
      timestamp: new Date()
    };
    sessionTranscript.push(entry);
    transcriptRevision += 1;
    window.sessionTranscript = sessionTranscript.slice();
    console.log('🎤 [STT 인식 성공]:', cleaned);
    appendTranscriptRowToViewer(entry);
    backupTranscriptLocal();
    document.dispatchEvent(new CustomEvent('dayo:transcript', { detail: entry }));
    return entry;
  }

  function localTranscriptSpeaker() {
    var access = window.DayORoomAccess;
    if (access && access.allowed) {
      return access.role === 'partner' ? 'partner' : 'learner';
    }
    return 'learner';
  }

  function saveTranscript() {
    if ((hungUp || window.dayoSessionEnded) && !transcriptFinalized) {
      return stopSpeech().then(saveTranscript);
    }
    if (transcriptSavePromise) {
      return transcriptSavePromise.then(function (result) {
        return result && result.ok && transcriptSavedRevision !== transcriptRevision ? saveTranscript() : result;
      });
    }
    if (transcriptSaveResult && transcriptSavedRevision === transcriptRevision) return Promise.resolve(transcriptSaveResult);
    var serialized = backupTranscriptLocal();
    var access = window.DayORoomAccess;
    if (!access || !access.allowed || access.adminTest || access.observer) {
      return Promise.resolve({ ok: false, local: true, transcript: serialized, skipped: true });
    }
    var canonicalTranscript = canonicalTranscriptSnapshot(serialized, access);
    var extra = {
      startedAt: sessionStartedAt,
      endedAt: markSessionEnded(access),
      bookingId: access.bookingId
    };
    var store = window.DayOProfileStore;
    var done = function (result) {
      var payload = result || { ok: false, local: true, transcript: serialized };
      document.dispatchEvent(new CustomEvent('dayo:transcriptsaved', { detail: payload }));
      return payload;
    };
    var savingRevision = transcriptRevision;
    if (store && typeof store.saveSessionLog === 'function') {
      // Re-entry must never replace a longer canonical record with an empty/local subset.
      transcriptSavePromise = (async function () {
        var db = window.supabaseClient;
        if (!db) throw new Error('canonical-transcript-read-unavailable');
        var role = canonicalParticipantRole(access);
        var participantId = role === 'learner' ? access.learnerId : access.partnerId;
        var read = await withTimeout(db.from('session_logs')
          .select('id, booking_id, participant_id, participant_role, transcript, started_at, ended_at')
          .eq('booking_id', access.bookingId).eq('participant_id', participantId)
          .eq('participant_role', role).maybeSingle(), 10000);
        if (read.error) throw read.error;
        var existing = read.data;
        if (existing && (existing.booking_id !== access.bookingId || existing.participant_id !== participantId ||
            existing.participant_role !== role || !Array.isArray(existing.transcript))) throw new Error('canonical-transcript-identity');
        var seen = new Set();
        canonicalTranscript = canonicalTranscriptSnapshot(existing ? existing.transcript : [], access)
          .concat(canonicalTranscript).filter(function (row) {
            var key = row.id + '\n' + row.timestamp;
            if (seen.has(key)) return false;
            seen.add(key); return true;
          }).sort(function (a, b) { return Date.parse(a.timestamp) - Date.parse(b.timestamp); });
        if (existing && Date.parse(existing.started_at) < Date.parse(extra.startedAt)) extra.startedAt = existing.started_at;
        if (existing && Date.parse(existing.ended_at) > Date.parse(extra.endedAt)) extra.endedAt = existing.ended_at;
        return store.saveSessionLog(canonicalTranscript, extra);
      })().then(done).catch(function (err) {
        return done({ ok: false, local: true, transcript: serialized, error: err });
      }).then(function (result) {
        transcriptSavePromise = null;
        if (result && result.ok) {
          transcriptSavedRevision = savingRevision;
          transcriptSaveResult = result;
        }
        return result;
      });
      return transcriptSavePromise.then(function (result) {
        return result && result.ok && transcriptSavedRevision !== transcriptRevision ? saveTranscript() : result;
      });
    }
    return Promise.resolve(done({ ok: false, local: true, transcript: serialized }));
  }

  function dailyDomain() {
    return env('NEXT_PUBLIC_DAILY_DOMAIN').replace(/^https?:\/\//i, '').replace(/\/+$/, '') || 'dayo-live.daily.co';
  }

  function roomName() {
    return window.DayORoomAccess && window.DayORoomAccess.allowed ? window.DayORoomAccess.roomId : '';
  }

  function dailyUrl() {
    return 'https://' + dailyDomain() + '/' + roomName();
  }

  function els() {
    return {
      stage: document.getElementById('videoStage'),
      host: document.getElementById('dailyHost'),
      column: document.getElementById('videoColumn'),
      selfVideo: document.getElementById('selfVideo'),
      selfPip: document.getElementById('selfPip'),
      phrases: document.getElementById('copilotPhrases'),
      grammar: document.getElementById('copilotGrammarText'),
      status: document.getElementById('copilotStatus')
    };
  }

  function setStatus(text, live) {
    var status = els().status;
    if (!status) return;
    status.textContent = text;
    status.classList.toggle('is-live', !!live);
  }

  function demoHints(transcript) {
    var text = String(transcript || '').toLowerCase();
    if (/coffee|cafe|latte|americano|아메리카노|커피|카페/.test(text)) {
      return {
        phrases: [
          { en: "Can I get a hot Americano, please?", ko: '따뜻한 아메리카노 주세요.' },
          { en: "What do you usually get here?", ko: '여기서 보통 뭐 시키세요?' },
          { en: "This café has such a cozy vibe.", ko: '이 카페 분위기 정말 아늑하네요.' }
        ],
        grammar: '카페 주문은 Can I get ~, please? 가 I\'d like 보다 지금 더 자주 들려요.'
      };
    }
    if (/weather|sunny|rain|날씨|기분/.test(text)) {
      return {
        phrases: [
          { en: "The weather is so nice today!", ko: '오늘 날씨 정말 좋네요!' },
          { en: "It makes me want to go for a walk.", ko: '산책하고 싶어져요.' },
          { en: "Does it rain a lot where you live?", ko: '사는 곳은 비가 많이 오나요?' }
        ],
        grammar: '날씨는 The weather is… 로 시작하고, 기분은 It makes me… 로 이어가면 좋아요.'
      };
    }
    if (/meet|hello|bonjour|안녕|처음/.test(text)) {
      return {
        phrases: [
          { en: "It's so nice to meet you!", ko: '만나서 정말 반가워요!' },
          { en: "How has your day been so far?", ko: '오늘은 어떤 하루였어요?' },
          { en: "What should we talk about first?", ko: '먼저 무슨 이야기부터 할까요?' }
        ],
        grammar: '처음 인사에는 It\'s nice to meet you 가 I meet you 보다 자연스러워요.'
      };
    }
    return {
      phrases: DEFAULT_PHRASES.slice(),
      grammar: t('room.copilotIdleGrammar')
    };
  }

  function renderHints(data) {
    var nodes = els();
    var phrases = (data && data.phrases) || DEFAULT_PHRASES;
    while (phrases.length < 3) phrases.push(DEFAULT_PHRASES[phrases.length]);
    phrases = phrases.slice(0, 3);
    if (nodes.phrases) {
      nodes.phrases.innerHTML = phrases.map(function (item, i) {
        var en = escapeHtml(item.en || item.phrase || item);
        var ko = escapeHtml(item.ko || item.meaning || '');
        return (
          '<button class="copilot-card help-copy-chip" type="button" data-phrase="' + en + '" data-text="' + en +
            '" onclick="copyHelpText(this.getAttribute(\'data-text\') || this.innerText)">' +
            '<span class="copilot-card__n">' + (i + 1) + '</span>' +
            '<span class="copilot-card__en">' + en + '</span>' +
            (ko ? '<span class="copilot-card__ko">' + ko + '</span>' : '') +
          '</button>'
        );
      }).join('');
    }
    if (nodes.grammar) {
      nodes.grammar.textContent = (data && data.grammar) || t('room.copilotIdleGrammar');
    }
  }

  function parseGeminiJson(raw) {
    var text = String(raw || '').trim();
    var fenced = text.match(/\{[\s\S]*\}/);
    if (fenced) text = fenced[0];
    var data = JSON.parse(text);
    var phrases = Array.isArray(data.phrases) ? data.phrases.map(function (item) {
      if (typeof item === 'string') return { en: item, ko: '' };
      return { en: item.en || item.phrase || '', ko: item.ko || item.meaning || '' };
    }).filter(function (item) { return item.en; }) : [];
    return {
      phrases: phrases.slice(0, 3),
      grammar: String(data.grammar || data.hint || '').trim()
    };
  }

  function geminiKey() {
    var fromEnv = env('NEXT_PUBLIC_GEMINI_API_KEY');
    if (fromEnv) return fromEnv;
    try {
      return String(window.localStorage.getItem('NEXT_PUBLIC_GEMINI_API_KEY') || '').trim();
    } catch (e) {
      return '';
    }
  }

  function askGemini(transcript) {
    var key = geminiKey();
    var blob = String(transcript || '').trim();
    if (!blob) return Promise.resolve(null);
    if (!key) return Promise.resolve(null);

    var prompt = [
      'You are DayO, a real-time English conversation copilot for Korean learners in a 1:1 video chat.',
      'Recent speech (may mix Korean and English):',
      '"""' + blob.slice(-900) + '"""',
      'Return JSON only, no markdown:',
      '{"phrases":[{"en":"natural English the learner can say NEXT","ko":"짧은 한국어 뜻"},{"en":"...","ko":"..."},{"en":"...","ko":"..."}],"grammar":"방금 나눈 이야기에서 기억하고 싶은 표현을 짧게 골라 주세요. 없으면 잘 이어진 점을 짧게 칭찬."}',
      'Exactly 3 phrases. Keep them spoken, friendly, and A2–B1 level.'
    ].join('\n');

    function post(model) {
      return fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 400 }
          })
        }
      ).then(function (res) {
        if (!res.ok) throw new Error('gemini ' + res.status);
        return res.json();
      }).then(function (json) {
        var text = '';
        try {
          text = json.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('');
        } catch (e) {
          throw new Error('empty gemini');
        }
        return parseGeminiJson(text);
      });
    }

    var chain = Promise.reject(new Error('start'));
    GEMINI_MODELS.forEach(function (model) {
      chain = chain.catch(function () { return post(model); });
    });
    return chain;
  }

  var FALLBACK_WORDS = [
    { word: 'actually', meaning: '사실은' },
    { word: 'anyway', meaning: '아무튼, 그건 그렇고' },
    { word: 'wait', meaning: '잠깐만요' }
  ];

  function recentTranscriptContext(limit) {
    var rows = serializeTranscript(sessionTranscript);
    var take = Math.min(Math.max(limit || 5, 3), 5);
    var slice = rows.slice(-take);
    return slice.map(function (row) {
      var who = row.speaker === 'partner' ? 'Partner' : 'User';
      return who + ': ' + row.text;
    }).join('\n').trim();
  }

  function parseWordHelpJson(raw) {
    var text = String(raw || '').trim();
    var fenced = text.match(/\[[\s\S]*\]/);
    if (fenced) text = fenced[0];
    var data = JSON.parse(text);
    if (data && !Array.isArray(data) && Array.isArray(data.words)) data = data.words;
    if (!Array.isArray(data)) return [];
    return data.map(function (item) {
      if (typeof item === 'string') return { word: item, meaning: '' };
      return {
        word: String((item && (item.word || item.en || item.phrase)) || '').trim(),
        meaning: String((item && (item.meaning || item.ko)) || '').trim()
      };
    }).filter(function (item) { return item.word; }).slice(0, 3);
  }

  function askGeminiWords(context) {
    var key = geminiKey();
    var blob = String(context || '').trim();
    if (!key || !blob) return Promise.resolve(null);

    var prompt = [
      "현재 유저와 파트너가 나눈 최근 대화 맥락을 파악하여, 유저가 지금 이어 말할 때 사용하기 가장 적절한 핵심 영단어 3개와 한국어 뜻을 JSON 배열 형태 [{word: '단어', meaning: '뜻'}] 로 응답해 줘.",
      'Recent conversation (3-5 lines):',
      blob.slice(-900)
    ].join('\n');

    function post(model) {
      return fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 160 }
          })
        }
      ).then(function (res) {
        if (!res.ok) throw new Error('gemini ' + res.status);
        return res.json();
      }).then(function (json) {
        var text = '';
        try {
          text = json.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('');
        } catch (e) {
          throw new Error('empty gemini');
        }
        var words = parseWordHelpJson(text);
        if (!words.length) throw new Error('no words');
        return words;
      });
    }

    var chain = Promise.reject(new Error('start'));
    GEMINI_MODELS.forEach(function (model) {
      chain = chain.catch(function () { return post(model); });
    });
    return withTimeout(chain, 4000);
  }

  function suggestWords() {
    var context = recentTranscriptContext(5);
    if (!geminiKey() || !context) {
      return Promise.resolve({ words: FALLBACK_WORDS.slice(), fallback: true });
    }
    return askGeminiWords(context).then(function (words) {
      if (words && words.length) return { words: words.slice(0, 3), fallback: false };
      return { words: FALLBACK_WORDS.slice(), fallback: true };
    }).catch(function () {
      return { words: FALLBACK_WORDS.slice(), fallback: true };
    });
  }

  var FALLBACK_SENTENCES = [
    {
      sentence: "Oh nice — tell me more!",
      translation: '오, 좋다 — 더 얘기해 줘요!'
    },
    {
      sentence: "Yeah, I get you. For me...",
      translation: '응, 무슨 말인지 알겠어요. 저는...'
    },
    {
      sentence: "Wait, can you say that a bit simpler?",
      translation: '잠깐, 조금만 쉽게 다시 말해 줄래요?'
    }
  ];

  function parseSentenceHelpJson(raw) {
    var text = String(raw || '').trim();
    var fenced = text.match(/\[[\s\S]*\]/);
    if (fenced) text = fenced[0];
    var data = JSON.parse(text);
    if (data && !Array.isArray(data) && Array.isArray(data.sentences)) data = data.sentences;
    if (!Array.isArray(data)) return [];
    return data.map(function (item) {
      if (typeof item === 'string') return { sentence: item, translation: '' };
      return {
        sentence: String((item && (item.sentence || item.en || item.phrase || item.text)) || '').trim(),
        translation: String((item && (item.translation || item.meaning || item.ko)) || '').trim()
      };
    }).filter(function (item) { return item.sentence; }).slice(0, 3);
  }

  function askGeminiSentences(context) {
    var key = geminiKey();
    var blob = String(context || '').trim();
    if (!key || !blob) return Promise.resolve(null);

    var prompt = [
      "현재 유저와 파트너가 나눈 최근 대화 맥락을 파악하여, 유저가 지금 파트너에게 이어 말하기에 가장 자연스럽고 세련된 영어 답변 문장 3개와 한국어 뜻을 JSON 배열 형태 [{sentence: '영어 문장', translation: '한국어 뜻'}] 로 응답해 줘.",
      'Recent conversation (3-5 lines):',
      blob.slice(-900)
    ].join('\n');

    function post(model) {
      return fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 280 }
          })
        }
      ).then(function (res) {
        if (!res.ok) throw new Error('gemini ' + res.status);
        return res.json();
      }).then(function (json) {
        var text = '';
        try {
          text = json.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('');
        } catch (e) {
          throw new Error('empty gemini');
        }
        var sentences = parseSentenceHelpJson(text);
        if (!sentences.length) throw new Error('no sentences');
        return sentences;
      });
    }

    var chain = Promise.reject(new Error('start'));
    GEMINI_MODELS.forEach(function (model) {
      chain = chain.catch(function () { return post(model); });
    });
    return withTimeout(chain, 4000);
  }

  function suggestSentences() {
    var context = recentTranscriptContext(5);
    if (!geminiKey() || !context) {
      return Promise.resolve({ sentences: FALLBACK_SENTENCES.slice(), fallback: true });
    }
    return askGeminiSentences(context).then(function (sentences) {
      if (sentences && sentences.length) return { sentences: sentences.slice(0, 3), fallback: false };
      return { sentences: FALLBACK_SENTENCES.slice(), fallback: true };
    }).catch(function () {
      return { sentences: FALLBACK_SENTENCES.slice(), fallback: true };
    });
  }

  function scheduleCopilot(line) {
    var cleaned = String(line || '').trim();
    if (cleaned) {
      recentLines.push(cleaned);
      if (recentLines.length > 10) recentLines = recentLines.slice(-10);
    }
    var joined = recentLines.join(' ').trim();
    if (!joined || joined === lastHintsKey) return;
    clearTimeout(geminiTimer);
    geminiTimer = setTimeout(function () {
      refreshCopilot(joined);
    }, 1200);
  }

  function refreshCopilot(transcript) {
    if (geminiBusy) return;
    var joined = String(transcript || recentLines.join(' ')).trim();
    if (!joined) {
      renderHints(demoHints(''));
      return;
    }
    lastHintsKey = joined;
    geminiBusy = true;
    setStatus(t('room.copilotThinking'), sttOn);

    askGemini(joined).then(function (data) {
      geminiBusy = false;
      if (data && data.phrases && data.phrases.length) {
        geminiOk = true;
        renderHints(data);
        setStatus(sttOn ? t('room.copilotListening') : t('room.copilotListening'), sttOn);
        return;
      }
      geminiOk = false;
      renderHints(demoHints(joined));
      setStatus(t('room.copilotListening'), false);
    }).catch(function () {
      geminiBusy = false;
      geminiOk = false;
      renderHints(demoHints(joined));
      setStatus(t('room.copilotListening'), false);
    });
  }

  function applyLocalTracks() {
    var stream = localStream || window.localMediaStream || window.__localCamStream;
    if (!stream) return;
    stream.getAudioTracks().forEach(function (track) { track.enabled = micOn; });
    stream.getVideoTracks().forEach(function (track) { track.enabled = camOn; });
    var pip = els().selfPip;
    if (!pip) return;
    if (camOn) pip.classList.add('has-stream');
    else pip.classList.remove('has-stream');
  }

  function notifyMedia() {
    document.dispatchEvent(new CustomEvent('dayo:livemedia', {
      detail: { micOn: !!micOn, camOn: !!camOn }
    }));
  }

  function dailyLocalAudio() {
    if (!callFrame || typeof callFrame.localAudio !== 'function') return micOn;
    try {
      var value = callFrame.localAudio();
      if (typeof value === 'boolean') return value;
    } catch (e) { /* ignore */ }
    try {
      var local = callFrame.participants && callFrame.participants().local;
      if (local && typeof local.audio === 'boolean') return local.audio;
    } catch (e) { /* ignore */ }
    return micOn;
  }

  function dailyLocalVideo() {
    if (!callFrame || typeof callFrame.localVideo !== 'function') return camOn;
    try {
      var value = callFrame.localVideo();
      if (typeof value === 'boolean') return value;
    } catch (e) { /* ignore */ }
    try {
      var local = callFrame.participants && callFrame.participants().local;
      if (local && typeof local.video === 'boolean') return local.video;
    } catch (e) { /* ignore */ }
    return camOn;
  }

  function syncMediaFromDaily() {
    if (!callFrame) return;
    micOn = dailyLocalAudio();
    camOn = dailyLocalVideo();
    notifyMedia();
  }

  function startDemoMedia() {
    if (isObserverRoomMode()) return Promise.resolve();
    if (window.__dayoUsePeerJS) return Promise.resolve();
    demoMode = true;
    var nodes = els();
    if (nodes.host) nodes.host.classList.remove('is-on', 'is-pending');
    if (nodes.stage) nodes.stage.classList.remove('is-daily');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.resolve();
    }
    return navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(function (stream) {
      localStream = stream;
      if (nodes.selfVideo) {
        nodes.selfVideo.srcObject = stream;
        nodes.selfVideo.muted = true;
        var playPromise = nodes.selfVideo.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(function () { /* autoplay policy */ });
        }
      }
      if (nodes.selfPip) nodes.selfPip.classList.add('has-stream');
      applyLocalTracks();
    }).catch(function () {
      /* camera guidance is handled by the single #dayo-final-single-toast in room.html */
    });
  }

  function destroyDaily() {
    if (!callFrame) return;
    try { callFrame.leave(); } catch (e) { /* ignore */ }
    try { callFrame.destroy(); } catch (e) { /* ignore */ }
    callFrame = null;
    var host = els().host;
    if (host) {
      host.innerHTML = '';
      host.classList.remove('is-on', 'is-pending');
    }
    var stage = els().stage;
    if (stage) stage.classList.remove('is-daily');
  }

  function joinDaily() {
    var Daily = window.DailyIframe;
    var host = els().host;
    var stage = els().stage;
    if (!Daily || typeof Daily.createFrame !== 'function' || !host) {
      return Promise.reject(new Error('daily sdk missing'));
    }

    host.classList.add('is-on', 'is-pending');

    try {
      callFrame = Daily.createFrame(host, {
        showLeaveButton: false,
        showFullscreenButton: true,
        showChat: false,
        showPeopleButton: false,
        iframeStyle: {
          width: '100%',
          height: '100%',
          border: '0',
          borderRadius: '24px'
        },
        theme: {
          colors: {
            accent: '#FF6B57',
            accentText: '#FFFFFF',
            background: '#FFF8F5',
            backgroundAccent: '#FFE8E3',
            baseText: '#5C4A42',
            border: '#FFD1DC',
            mainAreaBg: '#1E1A19',
            mainAreaBgAccent: '#2A2422',
            supportiveText: '#9A8580'
          }
        }
      });
    } catch (err) {
      host.classList.remove('is-on', 'is-pending');
      return Promise.reject(err);
    }

    callFrame.on('joined-meeting', function () {
      demoMode = false;
      host.classList.remove('is-pending');
      if (stage) stage.classList.add('is-daily');
      syncMediaFromDaily();
      showToast(t('room.toastDailyLive'), 2200);
      if (typeof window.updateRoomRoleText === 'function') window.updateRoomRoleText();
      document.dispatchEvent(new CustomEvent('dayo:room-ready'));
    });

    callFrame.on('participant-updated', function (ev) {
      var participant = ev && ev.participant;
      if (!participant || !participant.local) return;
      if (typeof participant.audio === 'boolean') micOn = participant.audio;
      if (typeof participant.video === 'boolean') camOn = participant.video;
      notifyMedia();
    });

    callFrame.on('error', function () {
      /* join() catch handles fallback */
    });

    callFrame.on('left-meeting', function () {
      if (hungUp) return;
      demoMode = true;
    });

    return callFrame.join({
      url: dailyUrl(),
      startAudioOff: !micOn,
      startVideoOff: !camOn
    });
  }

  function startSpeech(userInitiated) {
    if (isObserverRoomMode()) return;
    var Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      console.warn('이 브라우저는 Web Speech API를 지원하지 않습니다 (사파리/크롬 권장).');
      recordSttState('stt_error', { code: 'unsupported' });
      setStatus(t('room.copilotListening'), false);
      return;
    }

    if (recognition) {
      window.dayoSTT = recognition;
      if (micOn && shouldKeepSttAlive()) resumeSpeech();
      return;
    }

    try {
      recognition = new Ctor();
      window.dayoSTT = recognition;
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onstart = function () {
        clearSttStartWatchdog();
        sttStarting = false;
        sttOn = true;
        sttResumePending = false;
        sttPermissionBlocked = false;
        recordSttState('stt_start');
        setStatus(t('room.copilotListening'), true);
      };

      recognition.onaudiostart = function () {
        recordSttState('stt_audio_start');
      };

      recognition.onspeechstart = function () {
        recordSttState('stt_speech_start');
      };

      recognition.onresult = function (event) {
        if (transcriptFinalized) return;
        for (var i = event.resultIndex; i < event.results.length; i++) {
          if (!event.results[i].isFinal) continue;
          var chunk = event.results[i][0] && event.results[i][0].transcript;
          var finalText = String(chunk || '').trim();
          if (finalText) {
            var isPreflight = window.__dayoPreflightActive === true;
            recordSttState('stt_result_final', { char_count: finalText.length, preflight: isPreflight });
            if (!isPreflight) {
              pushTranscript(finalText, localTranscriptSpeaker());
              scheduleCopilot(finalText);
            }
          }
        }
      };

      recognition.onerror = function (event) {
        var err = event && event.error;
        clearSttStartWatchdog();
        sttStarting = false;
        sttOn = false;
        recordSttState('stt_error', { code: err || 'unknown' });
        console.warn('STT 일시 오류 (재시작 시도):', err);
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          sttPermissionBlocked = true;
          setStatus(t('room.copilotListening'), false);
          return;
        }
        if (shouldKeepSttAlive()) scheduleSttRestart(500, 'recognition-error');
      };

      recognition.onend = function () {
        clearSttStartWatchdog();
        sttStarting = false;
        sttOn = false;
        recordSttState('stt_end');
        if (shouldKeepSttAlive()) scheduleSttRestart(250, 'recognition-ended');
      };

      if (micOn && shouldKeepSttAlive() && (!window.__dayoPreflightActive || userInitiated)) {
        attemptSttStart('initial');
      }
    } catch (err) {
      sttStarting = false;
      sttOn = false;
      recordSttState('stt_error', { code: (err && err.name) || 'setup_failed' });
      setStatus(t('room.copilotListening'), false);
    }
  }

  function stopSpeech() {
    wantListen = false;
    sttOn = false;
    sttStarting = false;
    clearTimeout(sttRestartTimer);
    clearSttStartWatchdog();
    if (transcriptFlushPromise) return transcriptFlushPromise;
    transcriptFlushPromise = new Promise(function (resolve) {
      var timer;
      var settled = false;
      function finish(reason) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        transcriptFinalized = true;
        if (recognition) recognition.onend = null;
        recordSttState('stt_end', { reason: reason });
        resolve();
      }
      if (!recognition) { finish('session-stop'); return; }
      var previousEnd = recognition.onend;
      recognition.onend = function (event) {
        if (typeof previousEnd === 'function') previousEnd.call(recognition, event);
        finish('session-stop');
      };
      // Web Speech emits any final result before onend. Bound a stalled recognizer
      // and close the source there so later callbacks cannot diverge from the DB.
      timer = setTimeout(function () { finish('review-flush-timeout'); }, 2500);
      try { recognition.stop(); } catch (e) { finish('session-stop'); }
    });
    return transcriptFlushPromise;
  }

  function pauseSpeech() {
    sttOn = false;
    sttStarting = false;
    clearSttStartWatchdog();
    if (!recognition) return;
    try { recognition.stop(); } catch (e) { /* ignore */ }
    setStatus(geminiOk ? t('room.copilotListening') : t('room.copilotListening'), false);
  }

  function resumeSpeech(reason) {
    if (!recognition || hungUp) return;
    wantListen = true;
    attemptSttStart(reason || 'resume');
  }

  function toggleMic() {
    if (callFrame && typeof callFrame.setLocalAudio === 'function') {
      var next = !dailyLocalAudio();
      return Promise.resolve(callFrame.setLocalAudio(next)).then(function () {
        micOn = dailyLocalAudio();
        if (micOn) resumeSpeech();
        else pauseSpeech();
        notifyMedia();
        return micOn;
      }).catch(function (err) {
        console.warn('[DayO] setLocalAudio failed', err);
        micOn = dailyLocalAudio();
        notifyMedia();
        return micOn;
      });
    }

    micOn = !micOn;
    applyLocalTracks();
    if (micOn) resumeSpeech();
    else pauseSpeech();
    notifyMedia();
    return micOn;
  }

  function toggleCam() {
    if (callFrame && typeof callFrame.setLocalVideo === 'function') {
      var next = !dailyLocalVideo();
      return Promise.resolve(callFrame.setLocalVideo(next)).then(function () {
        camOn = dailyLocalVideo();
        notifyMedia();
        return camOn;
      }).catch(function (err) {
        console.warn('[DayO] setLocalVideo failed', err);
        camOn = dailyLocalVideo();
        notifyMedia();
        return camOn;
      });
    }

    camOn = !camOn;
    applyLocalTracks();
    notifyMedia();
    return camOn;
  }

  function hangUp() {
    hungUp = true;
    window.dayoSessionEnded = true;
    wantListen = false;
    clearTimeout(sttRestartTimer);
    stopSpeech();
    if (window.DayOPeerVideo && typeof window.DayOPeerVideo.destroy === 'function') {
      try { window.DayOPeerVideo.destroy(); } catch (e) { /* ignore */ }
    }
    destroyDaily();
    if (localStream) {
      localStream.getTracks().forEach(function (track) { track.stop(); });
      localStream = null;
    }
  }

  function bindCopilotClicks() {
    var wrap = els().phrases;
    if (!wrap) return;
    wrap.addEventListener('click', function (e) {
      var card = e.target.closest('.copilot-card');
      if (!card) return;
      var phrase = card.getAttribute('data-text') || card.getAttribute('data-phrase') || '';
      if (!phrase) return;
      if (typeof window.copyHelpText === 'function' && !card.getAttribute('onclick')) {
        window.copyHelpText(phrase);
      }
      var overlay = document.getElementById('sentenceOverlay');
      var overlayText = document.getElementById('sentenceOverlayText');
      if (overlay && overlayText) {
        overlayText.textContent = phrase;
        overlay.classList.add('show');
      }
      if (typeof window.copyHelpText !== 'function') {
        showToast(t('room.copilotCopied'));
      }
    });
  }

  function bindChatToCopilot() {
    var form = document.getElementById('chatForm');
    var input = document.getElementById('chatInput');
    if (!form || !input) return;
    form.addEventListener('submit', function () {
      var text = input.value.trim();
      if (text) scheduleCopilot(text);
    });
  }

  function start() {
    try {
      window.dayoSessionEnded = hungUp;
      restoreSessionTiming(window.DayORoomAccess);
      sessionTranscript = recoverTranscriptForQuiz();
      transcriptRevision = sessionTranscript.length;
      window.sessionTranscript = sessionTranscript.slice();
      utteranceSeq = 0;
      backupTranscriptLocal();
      bindMobileSttBootstrap();
      initDevicePreflight();
      renderHints(demoHints(''));
      setStatus(t('room.copilotListening'), false);
      bindCopilotClicks();
      bindChatToCopilot();

      if (isObserverRoomMode()) {
        demoMode = false;
        if (typeof window.updateRoomRoleText === 'function') window.updateRoomRoleText();
        document.dispatchEvent(new CustomEvent('dayo:room-ready'));
        return;
      }

      var boot;
      if (window.__dayoUsePeerJS) {
        demoMode = false;
        boot = Promise.resolve();
      } else {
        boot = withTimeout(joinDaily(), 8000).then(function () {
          demoMode = false;
        }).catch(function () {
          try { destroyDaily(); } catch (e) { /* ignore */ }
          return startDemoMedia();
        });
      }

      boot.then(function () {
        if (hungUp) return;
        if (typeof window.updateRoomRoleText === 'function') window.updateRoomRoleText();
        document.dispatchEvent(new CustomEvent('dayo:room-ready'));
        try { startSpeech(); } catch (e) { setStatus(t('room.copilotListening'), false); }
        if (!geminiKey()) {
          setStatus(t('room.copilotListening'), sttOn);
        }
      }).catch(function () {
        try { startDemoMedia(); } catch (e) { /* ignore */ }
        try { startSpeech(); } catch (e) { /* ignore */ }
      });
    } catch (err) {
      try { startDemoMedia(); } catch (e) { /* ignore */ }
      renderHints(demoHints(''));
      setStatus(t('room.copilotListening'), false);
    }
  }

  window.DayOLive = {
    isMicOn: function () { return micOn; },
    isCamOn: function () { return camOn; },
    isDemo: function () { return demoMode; },
    toggleMic: toggleMic,
    toggleCam: toggleCam,
    hangUp: hangUp,
    startSpeech: function () {
      wantListen = true;
      sttPermissionBlocked = false;
      startSpeech(true);
      if (micOn) resumeSpeech('manual');
    },
    getTranscript: function () { return serializeTranscript(sessionTranscript); },
    getSttTelemetry: function () {
      var key = sttTelemetryKey();
      if (!key) return [];
      try {
        var rows = JSON.parse(sessionStorage.getItem(key) || '[]');
        return Array.isArray(rows) ? rows : [];
      } catch (e) { return []; }
    },
    suggestWords: suggestWords,
    suggestSentences: suggestSentences,
    saveTranscript: saveTranscript,
    flushTranscript: stopSpeech,
    finalizeTranscript: function () { return stopSpeech().then(saveTranscript); }
  };

  document.addEventListener('dayo:langchange', function () {
    if (els().status) {
      setStatus(
        sttOn ? t('room.copilotListening') : t('room.copilotListening'),
        sttOn
      );
    }
    if (!lastHintsKey) renderHints(demoHints(''));
  });

  document.addEventListener('dayo:local-stream', function (event) {
    var stream = event && event.detail && event.detail.stream;
    if (!stream) return;
    bindLocalAudioTrack(stream);
    if (window.__dayoPreflightActive) attachPreflightStream(stream);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      sttResumePending = shouldKeepSttAlive();
      clearTimeout(sttRestartTimer);
      return;
    }
    if (shouldKeepSttAlive() && (sttResumePending || !sttOn)) scheduleSttRestart(180, 'foreground');
  });

  window.addEventListener('pagehide', function () {
    sttResumePending = shouldKeepSttAlive();
    clearTimeout(sttRestartTimer);
  });

  window.addEventListener('pageshow', function () {
    if (shouldKeepSttAlive() && (sttResumePending || !sttOn)) scheduleSttRestart(180, 'pageshow');
  });

  window.DayORoomAccessReady.then(function (access) {
    if (!access.allowed || window.__dayoInAppBlocked) return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  });
})();
