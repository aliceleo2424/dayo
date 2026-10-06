/* Transcript-derived vocabulary recap. Legacy entry names retained for room lifecycle. */
(function () {
  'use strict';
  var originalOpen = window.openQuizModalImmediately;
  var state = null, questions = [], timer = null, opening = null, finalizing = false;
  function locale() { return String(window.DayOI18n && window.DayOI18n.getLang ? window.DayOI18n.getLang() : document.documentElement.lang || 'ko').toLowerCase(); }
  function labels() { return window.DayOConversationRecap.labels(locale()); }
  function bookingId() { return String(window.DayORoomAccess && window.DayORoomAccess.bookingId || ''); }
  function blocked() { return window.isPartnerRoomMode && window.isPartnerRoomMode() || window.isObserverRoomMode && window.isObserverRoomMode(); }
  function key() { return 'dayo_recap_state:' + bookingId(); }
  function write() { if (state) try { sessionStorage.setItem(key(), JSON.stringify(state)); } catch (_) { /* optional recovery */ } }
  function modal(show) {
    var node = document.getElementById('memory-game-modal'); if (!node) return;
    node.hidden = !show; node.style.display = show ? 'flex' : 'none';
    if (window.DayOScrollLock) window.DayOScrollLock[show ? 'lock' : 'unlock']();
  }
  function progress() {
    return { completed: state ? state.completed : 0, total: questions.length, reason: state && state.endReason || null };
  }
  function sync() {
    window.__dayoQuizProgress = progress();
    window.__dayoQuizScore = questions.length ? Math.round(window.__dayoQuizProgress.completed / questions.length * 100) : null;
    window.__dayoReviewReportSaved = false; window.__dayoLearnerReportPayload = null;
    window.__dayoReviewRevision = (window.__dayoReviewRevision || 0) + 1;
    write();
  }
  function stopTimer() { if (timer) clearInterval(timer); timer = null;
    var node = document.getElementById('review-quiz-timer'); if (node) { node.hidden = true; node.style.display = 'none'; }
  }
  function button(label, handler) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'recap-primary'; b.textContent = label; b.addEventListener('click', handler); return b;
  }
  function renderQuestion() {
    var q = questions[state.currentIndex]; if (!q) return finish('completed');
    var l = labels(), title = document.getElementById('memory-game-title'), badge = document.getElementById('game-round-badge');
    if (title) title.textContent = l.mini;
    if (badge) badge.textContent = state.completed + '/' + questions.length + ' ' + l.completed;
    var hint = document.getElementById('game-kr-meaning'); if (hint) hint.textContent = '“' + q.word + '”' + l[q.type];
    var pool = document.getElementById('word-pool-container'); if (!pool) return; pool.innerHTML = '';
    // Stable rotation keeps recovery deterministic without the answer always first.
    var offset = (state.currentIndex + 1) % q.options.length;
    q.options.slice(offset).concat(q.options.slice(0, offset)).forEach(function (option) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'recap-option'; b.textContent = option;
      b.addEventListener('click', function () {
        if (state.currentIndex >= questions.length || state.ended) return;
        Array.from(pool.querySelectorAll('button')).forEach(function (node) { node.disabled = true; });
        b.setAttribute('aria-pressed', 'true');
        state.completed = Math.max(state.completed, state.currentIndex + 1); sync();
        var note = document.createElement('p'); note.className = 'recap-answer'; note.setAttribute('role', 'status');
        note.textContent = q.word + ' · ' + q.answer; pool.appendChild(note);
        pool.appendChild(button(locale() === 'ko' ? '계속 보기' : 'Continue', function () { state.currentIndex += 1; write(); renderQuestion(); }));
      }); pool.appendChild(b);
    });
  }
  async function save() {
    try { return typeof window.finalizeLearnerQuiz === 'function' && await window.finalizeLearnerQuiz(); } catch (_) { return false; }
  }
  function showSaveFailure() {
    if (window.__dayoReviewReportSaved) return;
    var box = document.getElementById('quiz-content-box');
    if (!box || box.querySelector && box.querySelector('[data-recap-save-status]')) return;
    var notice = document.createElement('p'); notice.className = 'recap-save-status'; notice.setAttribute('data-recap-save-status', ''); notice.setAttribute('role', 'status');
    notice.textContent = locale() === 'ko' ? '리캡을 저장하지 못했어요. 다시 저장해 주세요.' : 'Your recap could not be saved. Please try again.';
    box.appendChild(notice);
    box.appendChild(button(locale() === 'ko' ? '기록 다시 저장하기' : 'Retry saving', async function () { if (await save()) originalOpen(); }));
  }
  async function finish(reason) {
    if (!state || finalizing) return;
    finalizing = true; stopTimer(); state.ended = true; state.endReason = reason; sync();
    await save(); finalizing = false; modal(false);
    if (typeof originalOpen === 'function') originalOpen();
    // A failed save is retryable from the recap itself; never hides the base recap.
    showSaveFailure();
  }
  window.startRecapQuestions = function () {
    if (blocked()) return;
    var report = window.getLearnerReviewSnapshot && window.getLearnerReviewSnapshot();
    var recap = window.DayOConversationRecap.saved(Object.assign({ booking_id: bookingId() }, report));
    if (!recap || !recap.supported || !recap.questions.length) return;
    questions = recap.questions;
    var fingerprint = window.DayOLearnerExpressions.contentFingerprint(bookingId(), recap.source.fingerprint, questions);
    var recovered; try { recovered = JSON.parse(sessionStorage.getItem(key()) || 'null'); } catch (_) { recovered = null; }
    state = window.DayOLearnerExpressions.normalizeQuizState(recovered, questions.length, fingerprint);
    if (state.ended || state.currentIndex >= questions.length) { if (typeof originalOpen === 'function') originalOpen(); return; }
    state.startedAt = state.startedAt || Date.now(); write(); sync();
    var record = document.getElementById('quiz-modal');
    if (record) { record.hidden = true; record.classList.remove('is-open'); record.style.removeProperty('display'); if (window.DayOScrollLock) window.DayOScrollLock.unlock(); }
    modal(true); renderQuestion();
    var skip = document.getElementById('quiz-skip-btn'); if (skip) skip.hidden = false;
    function clock() {
      var remaining = window.DayOLearnerExpressions.quizRemainingSeconds(state.startedAt, Date.now(), window.DayOConversationRecap.quizDuration(questions.length));
      var node = document.getElementById('review-quiz-timer');
      if (node) { node.hidden = false; node.style.display = 'inline-block'; node.textContent = String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0'); }
      if (!remaining) finish('timeout');
    }
    stopTimer(); clock(); if (!state.ended) timer = setInterval(clock, 1000);
  };
  async function openRecap() {
    if (blocked()) { if (typeof originalOpen === 'function') originalOpen(); return; }
    if (opening) return opening;
    stopTimer();
    var requested = bookingId();
    opening = (async function () {
      if (typeof window.prepareSessionReviewSource === 'function') await window.prepareSessionReviewSource();
      if (bookingId() !== requested) return;
      var source = window.getCanonicalReviewSource && window.getCanonicalReviewSource();
      questions = source && source.recap ? source.recap.questions : [];
      var recovered; try { recovered = JSON.parse(sessionStorage.getItem(key()) || 'null'); } catch (_) { recovered = null; }
      if (questions.length) {
        var fingerprint = window.DayOLearnerExpressions.contentFingerprint(requested, source.recap.source.fingerprint, questions);
        state = window.DayOLearnerExpressions.normalizeQuizState(recovered, questions.length, fingerprint); sync();
      } else { state = null; window.__dayoQuizProgress = { completed: 0, total: 0, reason: 'insufficient' }; window.__dayoQuizScore = null; }
      await save();
      if (typeof originalOpen === 'function') originalOpen();
      showSaveFailure();
    })();
    try { await opening; } finally { opening = null; }
  }
  window.openQuizModalImmediately = openRecap;
  window.startMemoryGameFromSession = openRecap;
  // Legacy entries may be called by older room code, but caller-supplied speech
  // cannot replace the canonical source. Reconstruction is no longer rendered.
  window.startMemoryGame = openRecap;
  window.startMultiMemoryGame = openRecap;
  window.skipToRecordCard = function () { return finish('skip'); };
  document.addEventListener('click', function (event) { if (event.target.closest && event.target.closest('[data-recap-start]')) window.startRecapQuestions(); });
})();
