/* DayO room lifecycle: safe exit, safety report, review timer and report persistence. */
(function () {
  'use strict';

  var QUIZ_SECONDS = 5 * 60;
  var quizTimer = null;
  var quizRemaining = QUIZ_SECONDS;
  var submittingSafety = false;
  window.__dayoWordHelpHistory = window.__dayoWordHelpHistory || [];

  function client() {
    return window.supabaseClient || null;
  }

  function uuidOrNull(value) {
    var raw = String(value || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : null;
  }

  function stored(key) {
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }

  function context() {
    var access = window.DayORoomAccess;
    if (!access || !access.allowed || access.adminTest) return { bookingId: null, partnerId: null, learnerId: null };
    return { bookingId: uuidOrNull(access.bookingId), partnerId: uuidOrNull(access.partnerId), learnerId: uuidOrNull(access.learnerId) };
  }

  async function authUser() {
    var db = client();
    if (!db || !db.auth) return null;
    try {
      var result = await db.auth.getUser();
      return result && result.data && result.data.user || null;
    } catch (e) {
      return null;
    }
  }

  function transcriptRows() {
    var rows = [];
    if (Array.isArray(window.sessionTranscript)) rows = window.sessionTranscript;
    if (!rows.length && window.DayOLive && typeof window.DayOLive.getTranscript === 'function') {
      try { rows = window.DayOLive.getTranscript() || []; } catch (e) { rows = []; }
    }
    if (!rows.length && Array.isArray(window.DayOLastTranscript)) rows = window.DayOLastTranscript;
    if (!rows.length) {
      try { rows = JSON.parse(stored('last_session_transcript') || '[]'); } catch (e) { rows = []; }
    }
    return Array.isArray(rows) ? rows : [];
  }

  async function persistTranscript() {
    var rows = transcriptRows();
    try { localStorage.setItem('last_session_transcript', JSON.stringify(rows)); } catch (e) { /* ignore */ }
    if (window.DayOLive && typeof window.DayOLive.saveTranscript === 'function') {
      try { return await window.DayOLive.saveTranscript(); } catch (e) {
        console.error('[DayO Session] transcript save failed', e);
      }
    }
    return { ok: false, local: true, transcript: rows };
  }

  function toast(message) {
    if (typeof window.showToast === 'function') {
      window.showToast(message);
      return;
    }
    var node = document.getElementById('toastBanner') || document.getElementById('toast');
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    node.style.display = 'block';
    setTimeout(function () {
      node.hidden = true;
      node.style.display = 'none';
    }, 2800);
  }

  function stopMedia() {
    try {
      if (window.DayOLive && typeof window.DayOLive.hangUp === 'function') window.DayOLive.hangUp();
      if (window.DayOPeerVideo && typeof window.DayOPeerVideo.destroy === 'function') window.DayOPeerVideo.destroy();
    } catch (e) { /* ignore */ }
    ['__localCamStream', 'localMediaStream'].forEach(function (key) {
      var stream = window[key];
      if (stream && typeof stream.getTracks === 'function') {
        stream.getTracks().forEach(function (track) { track.stop(); });
      }
    });
  }

  function protectReporter() {
    var remote = document.getElementById('remote-video')
      || document.getElementById('tutorVideo')
      || document.querySelector('.remote-stream-video, .daily-video');
    if (remote) {
      remote.muted = true;
      if (remote.srcObject && typeof remote.srcObject.getTracks === 'function') {
        remote.srcObject.getTracks().forEach(function (track) { track.enabled = false; });
      }
      remote.style.visibility = 'hidden';
    }
    document.querySelectorAll('audio, video').forEach(function (media) {
      if (media.id === 'local-video' || media.id === 'selfVideo' || media.id === 'local-video-preview') return;
      media.muted = true;
    });
    var stage = document.getElementById('videoStage') || document.querySelector('.video-stage');
    if (stage) stage.classList.add('safety-blinded');
  }

  function showSafetyModal() {
    if (window.DayORoomAccess && window.DayORoomAccess.adminTest) {
      toast('테스트룸에서는 안전 신고를 사용할 수 없어요.');
      return;
    }
    if (typeof window.closeEarlyExitModal === 'function') window.closeEarlyExitModal();
    var modal = document.getElementById('safety-report-modal');
    if (!modal) return;
    safetyStatus('');
    modal.hidden = false;
    modal.style.setProperty('display', 'flex', 'important');
    var first = modal.querySelector('input[name="safety_reason"]');
    if (first) first.focus();
  }

  function closeSafetyModal() {
    var modal = document.getElementById('safety-report-modal');
    if (!modal) return;
    modal.hidden = true;
    modal.style.setProperty('display', 'none', 'important');
  }

  function safetyStatus(message, success) {
    var node = document.getElementById('safety-report-status');
    if (!node) return;
    node.textContent = message || '';
    node.hidden = !message;
    node.style.color = success ? '#166534' : '#BE123C';
  }

  function syncTicketCount(value) {
    if (value == null || !Number.isFinite(Number(value))) return;
    try { localStorage.setItem('ticketCount', String(value)); } catch (e) { /* ignore */ }
    document.dispatchEvent(new CustomEvent('dayo:ticketchange', { detail: { count: Number(value) } }));
  }

  async function sendEmergencyAlert(payload) {
    var db = client();
    if (!db || !db.functions || typeof db.functions.invoke !== 'function') return;
    try {
      await db.functions.invoke('safety-alert', { body: payload });
    } catch (e) {
      console.warn('[DayO Safety] emergency webhook failed; admin DB notification remains.', e);
    }
  }

  async function submitSafetyReport() {
    if (window.DayORoomAccess && window.DayORoomAccess.adminTest) {
      safetyStatus('테스트룸에서는 안전 신고를 사용할 수 없어요.');
      return;
    }
    if (submittingSafety) return;
    var modal = document.getElementById('safety-report-modal');
    var selected = modal && modal.querySelector('input[name="safety_reason"]:checked');
    var other = document.getElementById('safety-reason-other');
    var reason = selected ? String(selected.value || '') : '';
    if (reason === '기타') reason = String(other && other.value || '').trim();
    if (!reason) {
      safetyStatus('신고 사유를 선택하거나 입력해 주세요.');
      return;
    }

    var ctx = context();
    var partnerMode = window.isPartnerRoomMode && window.isPartnerRoomMode();
    var targetId = partnerMode ? ctx.learnerId : ctx.partnerId;
    var db = client();
    if (!ctx.bookingId || !db) {
      safetyStatus('로그인된 예약 세션 정보를 확인할 수 없습니다.');
      return;
    }

    submittingSafety = true;
    var submit = document.getElementById('safety-report-submit');
    if (submit) submit.disabled = true;
    safetyStatus('');
    try {
      var user = await authUser();
      if (!user || !user.id) {
        safetyStatus('로그인 정보를 확인할 수 없습니다.');
        return;
      }
      var result = await db.rpc('submit_safety_report_only', {
        p_session_id: ctx.bookingId,
        p_target_id: targetId,
        p_reason: reason,
        p_transcript_snapshot: transcriptRows().slice(-50)
      });
      var data = result && result.data || {};
      if (result.error || !data.success) {
        var duplicate = (result.error && result.error.code === '23505') || data.code === 'already_reported';
        safetyStatus(duplicate ? '이미 신고가 접수되었습니다.' : (data.message || '신고를 전송하지 못했습니다. 다시 시도해 주세요.'));
        return;
      }

      closeSafetyModal();
      toast('신고가 접수되었습니다. 대화를 계속할 수 있습니다.');
      sendEmergencyAlert({
        reportId: data.report_id,
        sessionId: ctx.bookingId,
        reporterId: user.id,
        targetId: targetId,
        reason: reason
      });
    } catch (e) {
      safetyStatus('신고를 전송하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      submittingSafety = false;
      if (submit) submit.disabled = false;
    }
  }

  function expressionList() {
    var seen = {};
    return transcriptRows().map(function (row) {
      return String(typeof row === 'string' ? row : (row && (row.text || row.message || row.transcript)) || '').trim();
    }).filter(function (text) {
      var key = text.toLowerCase();
      if (!text || text.length < 5 || seen[key]) return false;
      seen[key] = true;
      return true;
    }).slice(-5);
  }

  function selectedFeedback() {
    return Array.from(document.querySelectorAll('.feedback-chip.selected')).map(function (node) {
      return String(node.textContent || '').trim();
    }).filter(Boolean);
  }

  async function persistReviewReport() {
    if (window.__dayoReviewReportSaved) return true;
    var db = client();
    var user = await authUser();
    var ctx = context();
    if (!db || !user || !ctx.bookingId) return false;
    var expressions = expressionList();
    var summary = expressions.length
      ? '오늘 대화에서 ' + expressions.length + '개의 핵심 표현을 복습했어요.'
      : '인식된 대화 내용이 없어 핵심 표현을 생성하지 않았어요.';
    if (!ctx.learnerId || user.id !== ctx.learnerId) {
      console.error('[DayO Session] learner report identity mismatch');
      return false;
    }
    var payload = {
      summary: summary,
      key_expressions: expressions,
      quiz_score: Number(window.__dayoQuizScore || 0),
      word_help: window.__dayoWordHelpHistory.slice(-12),
      feedback: selectedFeedback(),
      spoken_sentence: expressions[0] || null,
      keyword: 'session-review'
    };
    var rating = document.querySelectorAll('.star-btn.active').length;
    if (rating > 0) payload.rating = rating;
    var result = await db.rpc('merge_learner_session_report', {
      p_booking_id: ctx.bookingId,
      p_report: payload
    });
    var resultData = result && result.data || {};
    if (result.error || !resultData.success) {
      console.warn('[DayO] review report save failed', result.error || resultData.message || 'unknown-error');
      return false;
    }
    if (rating > 0) {
      await db.from('bookings').update({ rating: rating }).eq('id', ctx.bookingId).eq('learner_id', ctx.learnerId);
    }
    window.__dayoReviewReportSaved = true;
    return true;
  }

  function renderQuizTimer() {
    var node = document.getElementById('review-quiz-timer');
    if (!node) return;
    var min = Math.floor(quizRemaining / 60);
    var sec = quizRemaining % 60;
    node.textContent = '⏱️ ' + String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }

  function startQuizClock() {
    clearInterval(quizTimer);
    quizRemaining = QUIZ_SECONDS;
    renderQuizTimer();
    quizTimer = setInterval(function () {
      quizRemaining -= 1;
      renderQuizTimer();
      if (quizRemaining <= 0) {
        clearInterval(quizTimer);
        quizTimer = null;
        window.__dayoQuizScore = Number(window.__dayoQuizScore || 0);
        if (typeof window.skipToRecordCard === 'function') window.skipToRecordCard();
      }
    }, 1000);
  }

  async function personalExit() {
    if (window.DayORoomAccess && window.DayORoomAccess.adminTest) {
      stopMedia();
      window.location.href = 'index.html';
      return;
    }
    var ctx = context();
    if (typeof window.closeEarlyExitModal === 'function') window.closeEarlyExitModal();
    window.isEarlyExit = false;
    var transcriptResult = await persistTranscript();
    if (!transcriptResult || !transcriptResult.ok) {
      console.error('[DayO Session] early-exit transcript was not stored remotely', transcriptResult && transcriptResult.error);
      toast('대화 기록을 서버에 저장하지 못해 이 기기에 임시 보관했어요.');
    }
    if (ctx.bookingId && client()) {
      var result = await client().rpc('complete_learner_session', {
        p_booking_id: ctx.bookingId,
        p_end_reason: 'personal'
      });
      if (result.error) console.warn('[DayO] complete session failed', result.error);
    }
    stopMedia();
    window.dayoSessionEnded = true;
    window.__dayoSessionEndRouted = true;
    if (typeof window.openQuizModalImmediately === 'function') {
      window.openQuizModalImmediately();
    } else {
      window.location.href = 'mypage.html';
    }
  }

  async function techIssueExit() {
    if (window.DayORoomAccess && window.DayORoomAccess.adminTest) {
      toast('테스트룸에서는 예약 관련 종료를 사용할 수 없어요.');
      return;
    }
    var ctx = context();
    if (typeof window.closeEarlyExitModal === 'function') window.closeEarlyExitModal();
    var transcriptResult = await persistTranscript();
    if (!transcriptResult || !transcriptResult.ok) {
      console.error('[DayO Session] tech-exit transcript was not stored remotely', transcriptResult && transcriptResult.error);
      toast('대화 기록을 서버에 저장하지 못해 이 기기에 임시 보관했어요.');
    }
    if (ctx.bookingId && client()) {
      var result = await client().rpc('report_session_tech_issue', { p_booking_id: ctx.bookingId });
      if (result && result.data) syncTicketCount(result.data.ticket_count);
      if (result.error) console.warn('[DayO] tech issue report failed', result.error);
    }
    stopMedia();
    toast('기술 오류가 접수되었습니다. 확인 후 이용권이 보존됩니다.');
    setTimeout(function () { window.location.href = 'mypage.html'; }, 1100);
  }

  var originalStart = window.startMultiMemoryGame;
  if (typeof originalStart === 'function') {
    window.startMultiMemoryGame = function (sentences) {
      startQuizClock();
      return originalStart(sentences);
    };
  }

  var originalWordHelp = window.openWordHelp;
  if (typeof originalWordHelp === 'function') {
    window.openWordHelp = function () {
      var result = originalWordHelp.apply(this, arguments);
      setTimeout(function () {
        var content = document.getElementById('help-modal-content') || document.getElementById('wordCards');
        var labels = content ? Array.from(content.querySelectorAll('button, [class*="card"]')).map(function (node) {
          return String(node.textContent || '').replace(/\s+/g, ' ').trim();
        }).filter(Boolean) : [];
        window.__dayoWordHelpHistory = window.__dayoWordHelpHistory.concat(labels).slice(-12);
      }, 50);
      return result;
    };
    var wordButton = document.getElementById('wordHelpBtn');
    if (wordButton) wordButton.onclick = window.openWordHelp;
  }

  window.closeEarlyExitModal = window.closeEarlyExitModal || function () {
    var modal = document.getElementById('early-exit-modal');
    if (modal) modal.style.setProperty('display', 'none', 'important');
  };
  window.confirmEarlyExit = personalExit;
  window.handleTechIssueExit = techIssueExit;
  window.handleReportExit = showSafetyModal;
  window.closeSafetyReportModal = closeSafetyModal;
  window.submitSafetyReport = submitSafetyReport;
  window.persistSessionReviewReport = persistReviewReport;

  document.addEventListener('dayo:session-ended', async function () {
    if ((window.isPartnerRoomMode && window.isPartnerRoomMode()) ||
        (window.isObserverRoomMode && window.isObserverRoomMode())) return;
    var ctx = context();
    if (ctx.bookingId && client()) {
      var result = await client().rpc('complete_learner_session', {
        p_booking_id: ctx.bookingId,
        p_end_reason: 'normal'
      });
      if (result.error) console.warn('[DayO] timed completion update failed', result.error);
    }
  });

  window.handleUserQuizComplete = async function () {
    if (window._dayoUserQuizCompleteNavigating) return;
    window._dayoUserQuizCompleteNavigating = true;
    clearInterval(quizTimer);
    if (window.DayORoomAccess && window.DayORoomAccess.adminTest) {
      window.location.href = 'index.html?view=mypage';
      return;
    }
    var saved = false;
    try {
      saved = await persistReviewReport();
    } catch (e) {
      console.error('[DayO Session] report persistence failed', e);
    }
    if (!saved) {
      console.error('[DayO Session] report was not saved; navigation paused');
      toast('대화 기록을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
      window._dayoUserQuizCompleteNavigating = false;
      return;
    }
    window.location.href = 'mypage.html';
  };
})();
