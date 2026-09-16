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
    var params = new URLSearchParams(location.search || '');
    var bookingId = uuidOrNull(
      params.get('bookingId') || params.get('booking_id') ||
      stored('dayo_active_booking_id') || stored('dayo_booking_id')
    );
    var partnerId = uuidOrNull(
      params.get('partnerId') || params.get('partner_id') ||
      stored('dayo_partner_user_id') || stored('dayo_selected_partner_id')
    );
    var learnerId = uuidOrNull(
      params.get('learnerId') || params.get('learner_id') ||
      stored('dayo_session_learner_id') || stored('dayo_learner_user_id')
    );
    return { bookingId: bookingId, partnerId: partnerId, learnerId: learnerId };
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
      try { return await window.DayOLive.saveTranscript(); } catch (e) { /* local copy is retained */ }
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
    protectReporter();
    if (typeof window.closeEarlyExitModal === 'function') window.closeEarlyExitModal();
    var modal = document.getElementById('safety-report-modal');
    if (!modal) return;
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
    if (submittingSafety) return;
    var modal = document.getElementById('safety-report-modal');
    var selected = modal && modal.querySelector('input[name="safety_reason"]:checked');
    var other = document.getElementById('safety-reason-other');
    var reason = selected ? String(selected.value || '') : '';
    if (reason === '기타') reason = String(other && other.value || '').trim();
    if (!reason) {
      toast('신고 사유를 선택하거나 입력해 주세요.');
      return;
    }

    var ctx = context();
    var user = await authUser();
    var reporterId = user && user.id || null;
    var partnerMode = window.isPartnerRoomMode && window.isPartnerRoomMode();
    var targetId = partnerMode ? ctx.learnerId : ctx.partnerId;
    if (!ctx.bookingId || !reporterId || !client()) {
      toast('로그인된 예약 세션 정보를 확인할 수 없습니다.');
      return;
    }

    submittingSafety = true;
    var submit = document.getElementById('safety-report-submit');
    if (submit) submit.disabled = true;
    var result = await client().rpc('submit_safety_report', {
      p_session_id: ctx.bookingId,
      p_target_id: targetId,
      p_reason: reason,
      p_transcript_snapshot: transcriptRows()
    });
    var data = result && result.data || {};
    if (result.error || !data.success) {
      submittingSafety = false;
      if (submit) submit.disabled = false;
      toast((result.error && result.error.message) || data.message || '신고 접수에 실패했습니다.');
      return;
    }

    syncTicketCount(data.ticket_count);
    await sendEmergencyAlert({
      reportId: data.report_id,
      sessionId: ctx.bookingId,
      reporterId: reporterId,
      targetId: targetId,
      reason: reason
    });
    stopMedia();
    closeSafetyModal();
    toast('신고가 접수되었습니다. 이용권은 즉시 보호 처리됩니다.');
    setTimeout(function () { window.location.href = 'mypage.html'; }, 900);
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
    var partnerName = stored('dayo_partner_name') || stored('bookedPartnerName') || 'DayO Partner';
    var summary = expressions.length
      ? '오늘 대화에서 ' + expressions.length + '개의 핵심 표현을 복습했어요.'
      : '오늘의 1:1 대화 복습을 완료했어요.';
    var payload = {
      booking_id: ctx.bookingId,
      learner_id: ctx.learnerId || user.id,
      partner_id: ctx.partnerId,
      partner_user_id: ctx.partnerId,
      partner_name: partnerName,
      summary: summary,
      key_expressions: expressions,
      quiz_score: Number(window.__dayoQuizScore || 0),
      word_help: window.__dayoWordHelpHistory.slice(-12),
      feedback: selectedFeedback(),
      spoken_sentence: expressions[0] || '오늘의 대화 복습 완료',
      keyword: 'session-review'
    };
    var rating = document.querySelectorAll('.star-btn.active').length;
    if (rating > 0) payload.rating = rating;
    var result = await db.from('session_reports').upsert(payload, { onConflict: 'booking_id' });
    if (result.error) {
      console.warn('[DayO] review report save failed', result.error);
      return false;
    }
    if (rating > 0) {
      await db.from('bookings').update({ rating: rating }).eq('id', ctx.bookingId).eq('learner_id', payload.learner_id);
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
    var ctx = context();
    if (typeof window.closeEarlyExitModal === 'function') window.closeEarlyExitModal();
    window.isEarlyExit = false;
    await persistTranscript();
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
    var ctx = context();
    if (typeof window.closeEarlyExitModal === 'function') window.closeEarlyExitModal();
    await persistTranscript();
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
    await persistReviewReport();
    window.location.href = 'mypage.html';
  };
})();
