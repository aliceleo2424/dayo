/* Transcript-derived vocabulary recap. Legacy entry names retained for room lifecycle. */
(function () {
  'use strict';
  var originalOpen = window.openQuizModalImmediately;
  var state = null, questions = [], timer = null, opening = null, finalizing = false, reviewing = false, practicing = false;
  function locale() { return String(window.DayOI18n && window.DayOI18n.getLang ? window.DayOI18n.getLang() : document.documentElement.lang || 'ko').toLowerCase(); }
  function labels() { return window.DayOConversationRecap.labels(locale()); }
  function bookingId() { return String(window.DayORoomAccess && window.DayORoomAccess.bookingId || ''); }
  function blocked() { return window.isPartnerRoomMode && window.isPartnerRoomMode() || window.isObserverRoomMode && window.isObserverRoomMode(); }
  function key() { return 'dayo_recap_state:' + bookingId(); }
  function write() { if (practicing) return; if (state) try { sessionStorage.setItem(key(), JSON.stringify(state)); } catch (_) { /* optional recovery */ } }
  function modal(show) {
    var node = document.getElementById('memory-game-modal'); if (!node) return;
    node.hidden = !show; node.style.display = show ? 'flex' : 'none';
    if (window.DayOScrollLock) window.DayOScrollLock[show ? 'lock' : 'unlock']();
  }
  function recoverState(recap, fingerprint) {
    var recovered; try { recovered = JSON.parse(sessionStorage.getItem(key()) || 'null'); } catch (_) { recovered = null; }
    var result = window.DayOLearnerExpressions.normalizeQuizState(recovered, questions.length, fingerprint);
    // DB progress is the floor, including after a fresh login on another device.
    var saved = recap.progress || {};
    if (Number.isInteger(saved.completed) && saved.completed >= 0 && saved.completed <= questions.length && saved.completed >= result.completed) {
      result.completed = saved.completed; result.currentIndex = Math.max(result.currentIndex, saved.completed);
      if (saved.reason) { result.ended = true; result.endReason = saved.reason; }
    }
    var validRecovered=recovered && recovered.fingerprint===fingerprint && recovered.total===questions.length ? recovered : null;
    var evidence=saved.completed>=result.completed && (!validRecovered || (saved.answers||[]).length>=(validRecovered.answers||[]).length) ? saved : validRecovered || {};
    var p=window.DayOConversationRecap.quizProgress({questions:questions,progress:Object.assign({},evidence,{completed:result.completed})});
    result.answers=p.answers;result.correct=p.correct;
    result.currentIndex=Math.max(result.currentIndex,result.completed);
    return result;
  }
  function progress() {
    return window.DayOConversationRecap.quizProgress({questions:questions,progress:{completed:state?state.completed:0,reason:state&&state.endReason||null,answers:state&&state.answers||[]}});
  }
  function sync() {
    if (practicing) return;
    var next = progress(), source = window.getCanonicalReviewSource && window.getCanonicalReviewSource();
    var prior = window.__dayoQuizProgress || source && source.recap && source.recap.progress;
    var unchanged = prior && JSON.stringify(window.DayOConversationRecap.quizProgress({questions:questions,progress:prior})) === JSON.stringify(next);
    window.__dayoQuizProgress = next;
    if (unchanged && window.__dayoReviewReportSaved) { write(); return; }
    // Leave the historical quiz_score field intact; new results live in recap.progress.
    window.__dayoReviewReportSaved = false;
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
    // Visual progress only (outside the answer pool); the saved progress model is unchanged.
    try {
      var parent = pool.parentNode, track = document.getElementById('recap-quiz-progress');
      if (parent && typeof parent.insertBefore === 'function') {
        if (!track) { track = document.createElement('div'); track.id = 'recap-quiz-progress'; track.className = 'recap-quiz-progress'; track.setAttribute('aria-hidden', 'true'); track.appendChild(document.createElement('span')); parent.insertBefore(track, pool); }
        track.hidden = false; if (track.firstChild && track.firstChild.style) track.firstChild.style.width = Math.round(state.currentIndex / Math.max(1, questions.length) * 100) + '%';
        var light = document.getElementById('recap-quiz-light');
        if (!light) { light = document.createElement('p'); light.id = 'recap-quiz-light'; light.className = 'recap-quiz-light'; parent.insertBefore(light, track); }
        light.textContent = locale() === 'ko' ? '점수 없이 가볍게 풀어보세요 · 리포트에서 언제든 다시 풀 수 있어요' : 'No scores — just a light review. You can retry anytime from your report.';
        light.hidden = state.currentIndex !== 0;
      }
    } catch (_) { /* decoration only */ }
    // Stable rotation keeps recovery deterministic without the answer always first.
    var answered=false, offset = (state.currentIndex + 1) % q.options.length;
    q.options.slice(offset).concat(q.options.slice(0, offset)).forEach(function (option) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'recap-option'; b.textContent = option;
      b.addEventListener('click', function () {
        if (answered || state.currentIndex >= questions.length || state.ended) return;
        answered=true;
        Array.from(pool.querySelectorAll('button')).forEach(function (node) { node.disabled = true; });
        b.setAttribute('aria-pressed', 'true');
        Array.from(pool.querySelectorAll('.recap-option')).forEach(function (node) { node.classList.add(node.textContent === q.answer ? 'is-correct' : node === b ? 'is-wrong' : 'is-dim'); });
        state.answers=state.answers||[];state.answers.push({question_id:q.id,selected:option});
        state.completed = Math.max(state.completed, state.currentIndex + 1); state.correct=progress().correct; sync();
        save().then(function (saved) { if (!saved) showSaveFailure(); });
        var note = document.createElement('p'); note.className = 'recap-answer'; note.setAttribute('role', 'status');
        var correct=option===q.answer;note.setAttribute('data-answer-result',correct?'correct':'incorrect');
        note.textContent = correct ? (locale()==='ko'?'정답':'Correct') : (locale()==='ko'?'오답 · 올바른 답: ':'Incorrect · Correct answer: ')+q.answer; pool.appendChild(note);
        pool.appendChild(button(locale() === 'ko' ? '계속 보기' : 'Continue', function () { state.currentIndex += 1; write(); renderQuestion(); }));
      }); pool.appendChild(b);
    });
  }
  async function save() {
    if (practicing) return true;
    try { return typeof window.finalizeLearnerQuiz === 'function' && await window.finalizeLearnerQuiz(); } catch (_) { return false; }
  }
  function showSaveFailure() {
    if (window.__dayoReviewReportSaved) return;
    var box = document.getElementById('quiz-content-box');
    if (!box || box.querySelector && box.querySelector('[data-recap-save-status]')) return;
    var notice = document.createElement('p'); notice.className = 'recap-save-status'; notice.setAttribute('data-recap-save-status', ''); notice.setAttribute('role', 'status');
    notice.textContent = locale() === 'ko' ? '대화 기록을 저장하지 못했어요. 다시 저장해 주세요.' : 'Your recap could not be saved. Please try again.';
    box.appendChild(notice);
    box.appendChild(button(locale() === 'ko' ? '기록 다시 저장하기' : 'Retry saving', async function () { if (await save()) originalOpen(); }));
  }
  function renderResults(recap) {
    stopTimer();var badge=document.getElementById('game-round-badge'),hint=document.getElementById('game-kr-meaning'),pool=document.getElementById('word-pool-container');
    if(badge)badge.textContent=window.DayOConversationRecap.quizResult(recap,locale());
    if(hint)hint.textContent='';if(!pool)return;pool.innerHTML='';
    ['recap-quiz-progress','recap-quiz-light'].forEach(function(id){var n=document.getElementById(id);if(n)n.hidden=true;});
    // Review summary, not a grade: what each word was and the right answer.
    var p=window.DayOConversationRecap.quizProgress(recap),ko=locale()==='ko',l=labels(),list=document.createElement('div');list.className='recap-result-list';
    var lead=document.createElement('p');lead.className='recap-result-lead';
    lead.textContent=p.correct===null?(ko?'오늘 대화의 단어를 복습했어요.':'You reviewed words from today’s conversation.'):p.correct===p.total?(ko?'모두 맞혔어요! 오늘 쓴 단어를 잘 기억하고 있어요.':'All correct! You remember today’s words well.'):(ko?(p.total-p.correct)+'개 단어를 한 번 더 살펴보면 좋아요.':'Take another look at '+(p.total-p.correct)+(p.total-p.correct===1?' word.':' words.'));
    list.appendChild(lead);
    (recap.questions||[]).forEach(function(q){var a=(p.answers||[]).find(function(x){return x.question_id===q.id;});if(!a)return;var ok=a.selected===q.answer,row=document.createElement('p');row.className='recap-result-row '+(ok?'is-correct':'is-wrong');
      row.textContent=q.word+' · '+(q.type==='synonym'?l.synonyms:l.antonyms)+': '+q.answer+(ok?'':(ko?' (내 답: ':' (your answer: ')+a.selected+')');list.appendChild(row);});
    var note=document.createElement('small');note.className='recap-result-note';note.textContent=ko?'점수가 아닌 복습 기록이에요 · 리포트에서 언제든 다시 풀 수 있어요':'This is a review, not a score · Retry anytime from your report';list.appendChild(note);
    pool.appendChild(list);
    pool.appendChild(button(locale()==='ko'?'리캡으로 돌아가기':'Return to recap',function(){practicing=false;reviewing=false;modal(false);if(typeof originalOpen==='function')originalOpen();}));
    var skip=document.getElementById('quiz-skip-btn');if(skip){skip.hidden=true;skip.style.display='none';}modal(true);
  }
  async function finish(reason) {
    if (!state || finalizing || state.ended) return;
    if (practicing) {
      stopTimer(); state.ended=true; state.endReason=reason;
      if(reason==='completed'){renderResults({questions:questions,progress:progress()});return;}
      practicing=false;modal(false);if(typeof originalOpen==='function')originalOpen();
      return;
    }
    finalizing = true; stopTimer(); state.ended = true; state.endReason = reason; sync();
    var saved=await save(); finalizing = false;
    if(reason==='completed' && saved){renderResults({questions:questions,progress:progress()});return;}
    modal(false);if (typeof originalOpen === 'function') originalOpen();
    // A failed save is retryable from the recap itself; never hides the base recap.
    showSaveFailure();
  }
  window.startRecapQuestions = function (options) {
    if (blocked()) return;
    var report = window.getLearnerReviewSnapshot && window.getLearnerReviewSnapshot();
    var recap = window.DayOConversationRecap.saved(Object.assign({ booking_id: bookingId() }, report));
    if (!recap || !recap.supported || !recap.questions.length) return;
    var replay=!!(options && options.practice);
    if (replay && !(recap.progress && (recap.progress.reason==='completed' || recap.progress.completed>=recap.questions.length))) return;
    practicing=replay;
    reviewing = false; questions = recap.questions;
    var fingerprint = window.DayOLearnerExpressions.contentFingerprint(bookingId(), recap.source.learner_version || recap.source.fingerprint, questions);
    state = replay ? {completed:0,correct:0,answers:[],currentIndex:0,startedAt:Date.now(),ended:false,endReason:null} : recoverState(recap, fingerprint);
    if (state.ended || state.currentIndex >= questions.length) { if (typeof originalOpen === 'function') originalOpen(); return; }
    state.startedAt = state.startedAt || Date.now(); write(); sync();
    var record = document.getElementById('quiz-modal');
    if (record) { record.hidden = true; record.classList.remove('is-open'); record.style.removeProperty('display'); if (window.DayOScrollLock) window.DayOScrollLock.unlock(); }
    modal(true); renderQuestion();
    var skip = document.getElementById('quiz-skip-btn'); if (skip){skip.hidden=false;skip.style.removeProperty('display');}
    function clock() {
      var remaining = window.DayOLearnerExpressions.quizRemainingSeconds(state.startedAt, Date.now(), window.DayOConversationRecap.quizDuration(questions.length));
      var node = document.getElementById('review-quiz-timer');
      if (node) { node.hidden = false; node.style.display = 'inline-block'; node.textContent = String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0'); }
      if (!remaining) finish('timeout');
    }
    stopTimer(); clock(); if (!state.ended) timer = setInterval(clock, 1000);
  };
  window.reviewRecapQuestions = function () {
    if(blocked())return;
    var report=window.getLearnerReviewSnapshot && window.getLearnerReviewSnapshot();
    var recap=window.DayOConversationRecap.saved(Object.assign({booking_id:bookingId()},report));
    if(!recap || !recap.questions.length)return;
    practicing=false;reviewing=true;stopTimer();
    var record=document.getElementById('quiz-modal');if(record){record.hidden=true;record.classList.remove('is-open');record.style.removeProperty('display');if(window.DayOScrollLock)window.DayOScrollLock.unlock();}
    var title=document.getElementById('memory-game-title');if(title)title.textContent=labels().mini;
    var badge=document.getElementById('game-round-badge');if(badge)badge.textContent=window.DayOConversationRecap.quizResult(recap,locale());
    var hint=document.getElementById('game-kr-meaning');if(hint)hint.textContent='';
    var pool=document.getElementById('word-pool-container');if(!pool)return;pool.innerHTML='';
    recap.questions.forEach(function(q){var p=document.createElement('p');p.className='recap-answer';p.textContent=q.word+' · '+(q.type==='synonym'?(locale()==='ko'?'유사어':'Synonym'):(locale()==='ko'?'반의어':'Antonym'))+' · '+q.answer;pool.appendChild(p);});
    var skip=document.getElementById('quiz-skip-btn');if(skip){skip.hidden=false;skip.style.removeProperty('display');}
    modal(true);
  };
  async function openRecap() {
    if (blocked()) { if (typeof originalOpen === 'function') originalOpen(); return; }
    if (opening) return opening;
    if (practicing) { stopTimer(); practicing=false; modal(false); if(typeof originalOpen==='function')originalOpen(); return; }
    stopTimer();
    var requested = bookingId();
    opening = (async function () {
      if (typeof window.prepareSessionReviewSource === 'function') await window.prepareSessionReviewSource();
      if (bookingId() !== requested) return;
      var source = window.getCanonicalReviewSource && window.getCanonicalReviewSource();
      questions = source && source.recap ? source.recap.questions : [];
      if (questions.length) {
        var fingerprint = window.DayOLearnerExpressions.contentFingerprint(requested, source.recap.source.learner_version || source.recap.source.fingerprint, questions);
        state = recoverState(source.recap, fingerprint); sync();
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
  window.skipToRecordCard = function () { if(reviewing){reviewing=false;modal(false);if(typeof originalOpen==='function')originalOpen();return;}return finish('skip'); };
  document.addEventListener('click', function (event) {
    if(!event.target.closest)return;
    if(event.target.closest('[data-recap-start]'))window.startRecapQuestions();
    if(event.target.closest('[data-recap-review]'))window.reviewRecapQuestions();
    if(event.target.closest('[data-recap-replay]'))window.startRecapQuestions({practice:true});
    if(event.target.closest('[data-recap-home]')){var done=document.getElementById('quiz-done-btn');if(done)done.click();else window.location.href='mypage.html';}
  });
})();
