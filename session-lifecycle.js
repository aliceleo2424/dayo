/* DayO room lifecycle: safe exit, safety report, review timer and report persistence. */
(function () {
  'use strict';

  var submittingSafety = false;
  var submittingTechIssue = false;
  var sessionEndedEventLogged = false;
  var reviewSource = null;
  var reviewSourcePromise = null;
  var reviewSourceBookingId = '';
  var reviewSavePromise = null;
  window.__dayoWordHelpHistory = [];
  window.__dayoWordHelpBookingId = '';

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
    if (!access || !access.allowed || access.adminTest || access.observer) return { bookingId: null, partnerId: null, learnerId: null };
    return { bookingId: uuidOrNull(access.bookingId), partnerId: uuidOrNull(access.partnerId), learnerId: uuidOrNull(access.learnerId) };
  }

  function wordHelpHistory() {
    var bookingId = context().bookingId || '';
    if (window.__dayoWordHelpBookingId !== bookingId) {
      window.__dayoWordHelpBookingId = bookingId;
      window.__dayoWordHelpHistory = [];
    }
    if (!Array.isArray(window.__dayoWordHelpHistory)) window.__dayoWordHelpHistory = [];
    return window.__dayoWordHelpHistory;
  }

  function isObserver() {
    return !!(window.isObserverRoomMode && window.isObserverRoomMode());
  }

  function logSessionEndedEvent(reason) {
    var access = window.DayORoomAccess;
    if (sessionEndedEventLogged || !access || !access.allowed || access.adminTest || access.observer ||
        (access.role !== 'user' && access.role !== 'partner') || !access.bookingId ||
        typeof window.logSessionEvent !== 'function') return;
    sessionEndedEventLogged = true;
    window.logSessionEvent('session_ended', { reason: reason });
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

  function canonicalReviewSource() {
    var ctx = context();
    return reviewSource && reviewSource.bookingId === ctx.bookingId
      ? reviewSource : { bookingId: ctx.bookingId, sourceId: '', version: '', rows: [], available: false };
  }

  function reviewDeadline(operation) {
    var timer;
    var deadline = new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(new Error('canonical-review-timeout')); }, 10000);
    });
    return Promise.race([operation, deadline]).then(function (result) {
      clearTimeout(timer);
      return result;
    }, function (error) {
      clearTimeout(timer);
      throw error;
    });
  }

  async function prepareReviewSource() {
    var ctx = context();
    if (!ctx.bookingId || !ctx.learnerId || !window.dayoSessionEnded || window.DayORoomAccess.role !== 'user') return canonicalReviewSource();
    if (reviewSourceBookingId !== ctx.bookingId) {
      reviewSourceBookingId = ctx.bookingId;
      reviewSource = null;
      reviewSourcePromise = null;
      window.__dayoReviewReportSaved = false;
      window.__dayoLearnerReportPayload = null;
    }
    if (reviewSource) return reviewSource;
    if (reviewSourcePromise) return reviewSourcePromise;
    var pending = (async function () {
      try {
        var live = window.DayOLive;
        if (!live || typeof live.finalizeTranscript !== 'function') return canonicalReviewSource();
        var saved = await reviewDeadline(live.finalizeTranscript());
        if (!saved || !saved.ok) return canonicalReviewSource();
        var user = await authUser();
        var db = client();
        if (!db || !user || user.id !== ctx.learnerId) return canonicalReviewSource();
        var result = await reviewDeadline(db.from('session_logs')
          .select('id, booking_id, participant_id, participant_role, transcript')
          .eq('booking_id', ctx.bookingId).eq('participant_id', ctx.learnerId)
          .eq('participant_role', 'learner').maybeSingle());
        var row = result && result.data;
        if (result.error || !row || !row.id || row.booking_id !== ctx.bookingId ||
            row.participant_id !== ctx.learnerId || row.participant_role !== 'learner' ||
            !Array.isArray(row.transcript) || context().bookingId !== ctx.bookingId) return canonicalReviewSource();
        var recapApi = window.DayOConversationRecap;
        var rows = recapApi.rows(row, ctx.bookingId, ctx.learnerId, 'learner').map(function (item) { return Object.freeze(item); });
        var recap = recapApi.build({ bookingId: ctx.bookingId, learnerId: ctx.learnerId, partnerId: ctx.partnerId,
          language: window.DayORoomAccess.language, learnerLog: row });
        var version = recap.source.learner_version;
        try {
          var session = await db.auth.getSession();
          var token = session && session.data && session.data.session && session.data.session.access_token;
          if (token) {
            var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 7000);
            try {
              var response = await fetch('/api/conversation-recap', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ booking_id: ctx.bookingId, learner_version: version }), signal: controller.signal });
              var data = response.ok ? await response.json() : null;
              if (data && data.recap && data.recap.generator === recapApi.VERSION && data.recap.booking_id === ctx.bookingId && data.recap.source.learner_version === version) recap = data.recap;
            } finally { clearTimeout(timeout); }
          }
        } catch (_) { /* Canonical learner recap remains available without server enrichment. */ }
        if (context().bookingId !== ctx.bookingId) return canonicalReviewSource();
        reviewSource = Object.freeze({ bookingId: ctx.bookingId, sourceId: row.id, version: version, rows: Object.freeze(rows), recap: recap, available: true });
        return reviewSource;
      } catch (error) {
        console.warn('[DayO Review] canonical source unavailable');
        return canonicalReviewSource();
      }
    })();
    reviewSourcePromise = pending;
    try { return await pending; }
    finally { if (reviewSourcePromise === pending) reviewSourcePromise = null; }
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
    if (isObserver()) return;
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
    if (isObserver()) return;
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

  function selectedFeedback() {
    return Array.from(document.querySelectorAll('.feedback-chip.selected')).map(function (node) {
      return String(node.textContent || '').trim();
    }).filter(Boolean);
  }

  function buildReviewSnapshot() {
    var api = window.DayOLearnerExpressions;
    if (!api) return null;
    var source = canonicalReviewSource(), recap = source.recap;
    if (!recap) return { summary: '', key_expressions: [], quiz_score: null, word_help: [], feedback: [], spoken_sentence: null };
    recap = Object.assign({}, recap, { progress: Object.assign({}, window.__dayoQuizProgress || recap.progress) });
    var existing = window.__dayoLearnerReportPayload;
    return {
      summary: window.DayOConversationRecap.labels('ko')[recap.comment] || '',
      key_expressions: recap.expressions.map(function (item) { return item.text; }),
      spoken_sentence: recap.expressions.length ? recap.expressions[0].text : null,
      quiz_score: window.__dayoQuizScore == null ? null : Number(window.__dayoQuizScore),
      word_help: wordHelpHistory(),
      feedback: window.DayOConversationRecap.mergeFeedback(existing && existing.feedback || selectedFeedback(), recap)
    };
  }

  async function persistReviewReport() {
    if (reviewSavePromise) {
      await reviewSavePromise;
      return persistReviewReport();
    }
    var pending = saveReviewReport();
    reviewSavePromise = pending;
    try { return await pending; }
    finally { if (reviewSavePromise === pending) reviewSavePromise = null; }
  }

  async function saveReviewReport() {
    if (isObserver()) return false;

    var db = client();
    var user = await authUser();
    var ctx = context();
    if (!db || !user || !ctx.bookingId) return false;
    var source = await prepareReviewSource();
    if (!source.available) return false;
    if (window.__dayoReviewReportSaved) return true;
    var payload = buildReviewSnapshot();
    if (!payload) return false;
    var saveRevision = window.__dayoReviewRevision || 0;
    if (!ctx.learnerId || user.id !== ctx.learnerId) {
      console.error('[DayO Session] learner report identity mismatch');
      return false;
    }
    var rating = document.querySelectorAll('.star-btn.active').length;
    if (rating > 0) payload.rating = rating;
    var reportPayload = payload;
    var result = await db.rpc('merge_learner_session_report', {
      p_booking_id: ctx.bookingId,
      p_report: reportPayload
    });
    var resultData = result && result.data || {};
    if (result.error || !resultData.success) {
      console.warn('[DayO] review report save failed', result.error || resultData.message || 'unknown-error');
      return false;
    }
    if (rating > 0) {
      await db.from('bookings').update({ rating: rating }).eq('id', ctx.bookingId).eq('learner_id', ctx.learnerId);
    }
    window.__dayoReviewReportSaved = saveRevision === (window.__dayoReviewRevision || 0);
    window.__dayoLearnerReportPayload = payload;
    return true;
  }

  async function personalExit() {
    if (isObserver()) return;
    if (window.DayORoomAccess && window.DayORoomAccess.adminTest) {
      stopMedia();
      window.location.href = 'index.html';
      return;
    }
    var ctx = context();
    logSessionEndedEvent('personal');
    if (typeof window.closeEarlyExitModal === 'function') window.closeEarlyExitModal();
    window.isEarlyExit = false;
    persistTranscript().then(function (transcriptResult) {
      if (!transcriptResult || !transcriptResult.ok) {
        console.error('[DayO Session] early-exit transcript was not stored remotely', transcriptResult && transcriptResult.error);
        toast('대화 기록을 서버에 저장하지 못해 이 기기에 임시 보관했어요.');
      }
    }).catch(function (error) {
      console.error('[DayO Session] early-exit transcript save failed', error);
    });
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

  async function submitTechIssueReport() {
    if (isObserver()) return;
    if (window.DayORoomAccess && window.DayORoomAccess.adminTest) {
      toast('테스트룸에서는 예약 관련 종료를 사용할 수 없어요.');
      return;
    }
    if (submittingTechIssue) return;
    var type = document.getElementById('tech-issue-type');
    var detail = document.getElementById('tech-issue-detail');
    var status = document.getElementById('tech-issue-submit-status');
    var button = document.getElementById('tech-issue-submit');
    if (!type || !type.value) {
      if (type && typeof type.reportValidity === 'function') type.reportValidity();
      return;
    }
    var detailText = String(detail && detail.value || '').trim();
    if (detailText.length > 300) {
      if (status) status.textContent = '상세 내용은 300자 이내로 입력해 주세요.';
      return;
    }
    var ctx = context();
    if (!ctx.bookingId || !client()) {
      if (status) status.textContent = '예약을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.';
      return;
    }
    submittingTechIssue = true;
    if (button) button.disabled = true;
    if (status) status.textContent = '신고 내용을 저장하고 있어요…';
    try {
      var result = await client().rpc('report_session_tech_issue', {
        p_booking_id: ctx.bookingId,
        p_issue_type: type.value,
        p_detail: detailText || null
      });
      var data = result && result.data || {};
      if (result.error || !data.success) {
        if (result.error) console.warn('[DayO] tech issue report failed', result.error);
        var rejected = data.code === 'tech_issue_window_closed' ||
          data.code === 'booking_cancelled' || data.code === 'booking_terminal' ||
          data.code === 'already_refunded';
        if (status) status.textContent = rejected
          ? '자동 환불 가능 시간이 지났거나 환불 조건에 해당하지 않습니다. 도움이 필요하면 문의해 주세요.'
          : '신고를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.';
        return;
      }
      if (data.refunded === true && typeof data.ticket_count === 'number') {
        syncTicketCount(data.ticket_count);
      }
      logSessionEndedEvent('tech_issue');
      var transcriptResult = await persistTranscript();
      if (!transcriptResult || !transcriptResult.ok) {
        console.warn('[DayO Session] tech-exit transcript was not stored remotely');
      }
      if (typeof window.closeTechIssueModal === 'function') window.closeTechIssueModal();
      window.dayoSessionEnded = true;
      window.__dayoSessionEndRouted = true;
      stopMedia();
      var message = data.decision === 'approved' && data.refunded === true
        ? '기술 문제로 종료되었습니다. 티켓이 반환되었습니다.'
        : data.no_show_candidate || data.issue_type === 'counterpart_absent'
          ? '미입장 신고가 접수되었습니다. 노쇼 여부를 확인 후 안내드릴게요.'
          : '기술 문제 신고가 접수되었습니다. 확인 후 처리 결과를 안내드릴게요.';
      toast(message);
      setTimeout(function () { window.location.href = 'mypage.html'; }, 2800);
    } catch (error) {
      console.warn('[DayO] tech issue report failed', error);
      if (status) status.textContent = '신고를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.';
    } finally {
      submittingTechIssue = false;
      if (button) button.disabled = false;
    }
  }

  var originalSessionEventLogger = window.logSessionEvent;
  if (typeof originalSessionEventLogger === 'function') {
    window.logSessionEvent = function (eventType, payload) {
      if (eventType === 'word_help_clicked' && payload && Array.isArray(payload.items)) {
        var finalItems = payload.items.slice(0, 6).map(function (item) {
          return {
            text: String(item && item.text || '').trim(),
            ko: String(item && item.ko || '').trim()
          };
        }).filter(function (item) { return item.text; });
        var combined = wordHelpHistory().concat(finalItems);
        window.__dayoWordHelpHistory = combined.filter(function (item, index, rows) {
          var key = item.text.toLowerCase() + '\n' + item.ko.toLowerCase();
          return rows.findIndex(function (candidate) {
            return candidate.text.toLowerCase() + '\n' + candidate.ko.toLowerCase() === key;
          }) === index;
        }).slice(-12);
      }
      return originalSessionEventLogger.apply(this, arguments);
    };
  }

  window.closeEarlyExitModal = window.closeEarlyExitModal || function () {
    var modal = document.getElementById('early-exit-modal');
    if (modal) modal.style.setProperty('display', 'none', 'important');
  };
  window.confirmEarlyExit = personalExit;
  window.submitTechIssueReport = submitTechIssueReport;
  window.handleTechIssueExit = window.openTechIssueModal;
  window.handleReportExit = showSafetyModal;
  window.closeSafetyReportModal = closeSafetyModal;
  window.submitSafetyReport = submitSafetyReport;
  window.persistSessionReviewReport = persistReviewReport;
  window.prepareSessionReviewSource = prepareReviewSource;
  window.getCanonicalReviewSource = canonicalReviewSource;
  window.getLearnerReviewSnapshot = function () {
    return canonicalReviewSource().available && window.__dayoReviewReportSaved && window.__dayoLearnerReportPayload
      ? window.__dayoLearnerReportPayload : buildReviewSnapshot();
  };
  window.finalizeLearnerQuiz = async function () {
    if (window.DayORoomAccess && window.DayORoomAccess.adminTest) {
      window.__dayoLearnerReportPayload = buildReviewSnapshot();
      window.__dayoReviewReportSaved = true;
      return true;
    }
    return persistReviewReport();
  };

  document.addEventListener('dayo:session-ended', async function () {
    logSessionEndedEvent('normal');
    if ((window.isPartnerRoomMode && window.isPartnerRoomMode()) ||
        (window.isObserverRoomMode && window.isObserverRoomMode())) return;
    var ctx = context();
    // Persist independently of opening or dismissing the recap/rating UI.
    var recapSave = persistReviewReport().then(function (saved) {
      if (!saved) toast('리캡을 저장하지 못했어요. 리캡 화면에서 다시 저장해 주세요.');
      return saved;
    }).catch(function () {
      toast('리캡을 저장하지 못했어요. 리캡 화면에서 다시 저장해 주세요.');
      return false;
    });
    if (ctx.bookingId && client()) {
      var result = await client().rpc('complete_learner_session', {
        p_booking_id: ctx.bookingId,
        p_end_reason: 'normal'
      });
      if (result.error) console.warn('[DayO] timed completion update failed', result.error);
    }
    await recapSave;
  });

  window.handleUserQuizComplete = async function () {
    if (isObserver()) return;
    if (window._dayoUserQuizCompleteNavigating) return;
    window._dayoUserQuizCompleteNavigating = true;
    if (window.DayORoomAccess && window.DayORoomAccess.adminTest) {
      window.location.href = 'index.html?view=mypage';
      return;
    }
    var saved = window.__dayoReviewReportSaved === true;
    if (!saved) {
      try { saved = await persistReviewReport(); }
      catch (e) { console.error('[DayO Session] report persistence failed', e); }
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
