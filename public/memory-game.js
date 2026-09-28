/* DayO learner-only session review quiz. */
(function () {
  'use strict';

  var gameSentenceQueue = [];
  var currentRoundIndex = 0;
  var userPickedWords = [];
  var currentCorrectWords = [];
  var remainingPool = [];
  var completing = false;
  var roundTimer = null;
  var quizState = null;
  var QUIZ_SECONDS = 5 * 60;

  function isPartner() {
    try {
      return typeof window.isPartnerRoomMode === 'function' && window.isPartnerRoomMode();
    } catch (e) {
      return false;
    }
  }

  function shuffle(list) {
    var arr = list.slice();
    var i;
    var j;
    var tmp;
    for (i = arr.length - 1; i > 0; i -= 1) {
      j = Math.floor(Math.random() * (i + 1));
      tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function normalizeSentence(raw) {
    return String(raw || '')
      .replace(/[.,?!]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function collectTranscriptRows() {
    if (window.DayOReviewQuiz && typeof window.DayOReviewQuiz.getTranscript === 'function') {
      try { return window.DayOReviewQuiz.getTranscript() || []; } catch (e) { /* ignore */ }
    }
    if (Array.isArray(window.sessionTranscript) && window.sessionTranscript.length) {
      return window.sessionTranscript;
    }
    if (window.DayOLive && typeof window.DayOLive.getTranscript === 'function') {
      try { return window.DayOLive.getTranscript() || []; } catch (e) { /* ignore */ }
    }
    if (Array.isArray(window.DayOLastTranscript)) return window.DayOLastTranscript;
    try {
      return JSON.parse(localStorage.getItem('last_session_transcript') || '[]');
    } catch (e) {
      return [];
    }
  }

  function extractSessionSentences() {
    var api = window.DayOLearnerExpressions;
    if (!api) return [];
    return api.extractExpressions(collectTranscriptRows(), { limit: 3, quizQuality: true }).map(function (text) {
      return { en: text, kr: meaningFor(text) };
    });
  }

  function meaningFor(en) {
    return '오늘 대화에서 나온 표현이에요';
  }

  function bookingId() {
    var access = window.DayORoomAccess;
    return access && access.bookingId ? String(access.bookingId) : '';
  }

  function recoveryKey() {
    var id = bookingId();
    return id ? 'dayo_quiz_state:' + id : '';
  }

  function readRecovery() {
    var key = recoveryKey();
    if (!key) return null;
    try {
      var parsed = JSON.parse(sessionStorage.getItem(key) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) { return null; }
  }

  function writeRecovery() {
    var key = recoveryKey();
    if (!key || !quizState) return;
    try { sessionStorage.setItem(key, JSON.stringify(quizState)); } catch (e) { /* ignore */ }
  }

  function clearRecovery() {
    var key = recoveryKey();
    if (!key) return;
    try { sessionStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  function scoreForState() {
    var api = window.DayOLearnerExpressions;
    return api ? api.quizScore(quizState && quizState.completed, quizState && quizState.total) : null;
  }

  function stopQuizClock() {
    if (window.__dayoQuizClockTimer) clearInterval(window.__dayoQuizClockTimer);
    window.__dayoQuizClockTimer = null;
  }

  function renderQuizClock() {
    var node = document.getElementById('review-quiz-timer');
    if (!node || !quizState || !quizState.startedAt) return;
    var remaining = window.DayOLearnerExpressions.quizRemainingSeconds(quizState.startedAt, Date.now(), QUIZ_SECONDS);
    node.hidden = false;
    node.textContent = '⏱️ ' + String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');
    if (remaining <= 0 && !quizState.ended) finishQuiz('timeout');
  }

  function startQuizClock() {
    stopQuizClock();
    renderQuizClock();
    if (quizState && !quizState.ended) window.__dayoQuizClockTimer = setInterval(renderQuizClock, 1000);
  }

  function stateButton(label, handler) {
    var pool = document.getElementById('word-pool-container');
    if (!pool) return;
    pool.innerHTML = '';
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'rq-cta';
    button.textContent = label;
    button.addEventListener('click', handler);
    pool.appendChild(button);
  }

  function renderPanel(title, badgeText, message) {
    var titleNode = document.getElementById('memory-game-title');
    var badge = document.getElementById('game-round-badge');
    var hint = document.getElementById('game-kr-meaning');
    var slots = document.getElementById('answer-slot-container');
    if (titleNode) titleNode.textContent = title;
    if (badge) badge.textContent = badgeText;
    if (hint) {
      hint.textContent = message;
      hint.style.whiteSpace = 'pre-line';
    }
    if (slots) slots.innerHTML = '';
  }

  function openTalkRecord() {
    stopQuizClock();
    window.__dayoMemoryGameDone = true;
    hideMemoryModal();
    if (typeof origOpenTalkRecord === 'function') origOpenTalkRecord();
  }

  function showSaveFailure(reason) {
    var skip = document.getElementById('quiz-skip-btn');
    if (skip) skip.hidden = true;
    renderPanel('대화 기록 저장을 다시 시도해 주세요', '저장 대기', '네트워크 상태를 확인한 뒤 다시 시도할 수 있어요.');
    stateButton('다시 저장하기', function () { finishQuiz(reason, true); });
  }

  function showFinished() {
    var skip = document.getElementById('quiz-skip-btn');
    if (skip) skip.hidden = true;
    var total = quizState.total;
    var completed = quizState.completed;
    var score = scoreForState();
    renderPanel(
      total ? '5분 대화 퀴즈 완료' : '이번 퀴즈는 건너뛸게요',
      total ? completed + ' / ' + total + ' 완료' : '표현 부족',
      total
        ? total + '문제 중 ' + completed + '문제 완료 · ' + score + '점'
        : '이번 세션에서는 퀴즈로 만들 수 있는 영어 표현이 충분하지 않았어요.\n대화 기록은 그대로 확인할 수 있어요.'
    );
    stateButton('대화 기록 확인하기', openTalkRecord);
  }

  function finishQuiz(reason, retry) {
    if (!quizState || (window.__dayoQuizFinalizing && !retry)) return;
    stopQuizClock();
    quizState.ended = true;
    quizState.endReason = reason || 'completed';
    writeRecovery();
    window.__dayoQuizScore = scoreForState();
    window.__dayoQuizProgress = { completed: quizState.completed, total: quizState.total, reason: quizState.endReason };
    var skip = document.getElementById('quiz-skip-btn');
    if (skip) skip.hidden = true;
    renderPanel(
      quizState.total ? '퀴즈 결과를 저장하고 있어요' : '이번 세션의 대화 기록을 준비하고 있어요',
      quizState.total ? quizState.completed + ' / ' + quizState.total + ' 완료' : '표현 부족',
      quizState.total
        ? quizState.total + '문제 중 ' + quizState.completed + '문제 완료 · ' + scoreForState() + '점'
        : '이번 세션에서는 퀴즈로 만들 수 있는 영어 표현이 충분하지 않았어요.\n대화 기록은 그대로 확인할 수 있어요.'
    );
    stateButton('저장 중…', function () {});
    window.__dayoQuizFinalizing = true;
    var saver = typeof window.finalizeLearnerQuiz === 'function' ? window.finalizeLearnerQuiz() : Promise.resolve(false);
    Promise.resolve(saver).then(function (saved) {
      window.__dayoQuizFinalizing = false;
      if (!saved) return showSaveFailure(reason);
      clearRecovery();
      showFinished();
    }).catch(function () {
      window.__dayoQuizFinalizing = false;
      showSaveFailure(reason);
    });
  }

  function showMemoryModal() {
    var modal = document.getElementById('memory-game-modal');
    if (!modal) return;
    modal.hidden = false;
    modal.style.display = 'flex';
    if (window.DayOScrollLock) window.DayOScrollLock.lock();
  }

  function hideMemoryModal() {
    var modal = document.getElementById('memory-game-modal');
    if (!modal) return;
    modal.hidden = true;
    modal.style.display = 'none';
    if (window.DayOScrollLock) window.DayOScrollLock.unlock();
  }

  function renderGameUI(availableWords) {
    var slotContainer = document.getElementById('answer-slot-container');
    var poolContainer = document.getElementById('word-pool-container');
    if (!slotContainer || !poolContainer) return;

    slotContainer.innerHTML = '';
    userPickedWords.forEach(function (word, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'memory-slot-chip';
      btn.textContent = word + ' ✕';
      btn.addEventListener('click', function () {
        window.removeWordFromSlot(idx);
      });
      slotContainer.appendChild(btn);
    });

    poolContainer.innerHTML = '';
    availableWords.forEach(function (word, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'memory-pool-chip';
      btn.textContent = word;
      btn.addEventListener('click', function () {
        window.pickWordToSlot(word, idx);
      });
      poolContainer.appendChild(btn);
    });
  }

  function checkGameResult() {
    if (completing) return;
    var isMatch = userPickedWords.join(' ') === currentCorrectWords.join(' ');
    var slotContainer = document.getElementById('answer-slot-container');
    if (isMatch) {
      completing = true;
      if (slotContainer) slotContainer.style.borderColor = '#10B981';
      quizState.completed += 1;
      quizState.currentIndex = Math.min(currentRoundIndex + 1, quizState.total);
      writeRecovery();
      if (currentRoundIndex + 1 < gameSentenceQueue.length) {
        if (typeof window.confetti === 'function') {
          window.confetti({ particleCount: 50, spread: 50, origin: { y: 0.6 } });
        }
        clearTimeout(roundTimer);
        roundTimer = setTimeout(function () {
          currentRoundIndex += 1;
          loadRound(currentRoundIndex);
        }, 700);
        return;
      }
      if (typeof window.confetti === 'function') {
        window.confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } });
      }
      clearTimeout(roundTimer);
      roundTimer = setTimeout(function () {
        finishQuiz('completed');
      }, 900);
      return;
    }
    if (slotContainer) slotContainer.style.animation = 'shake 0.3s ease';
    setTimeout(function () {
      if (slotContainer) {
        slotContainer.style.animation = '';
        slotContainer.style.borderColor = '#E2E8F0';
      }
      userPickedWords = [];
      remainingPool = shuffle(currentCorrectWords);
      renderGameUI(remainingPool);
    }, 400);
  }

  function loadRound(index) {
    var data = gameSentenceQueue[index];
    if (!data) {
      finishQuiz('completed');
      return;
    }
    var cleanEn = normalizeSentence(data.en);
    currentCorrectWords = cleanEn.split(' ').filter(Boolean);
    userPickedWords = [];
    remainingPool = shuffle(currentCorrectWords);
    completing = false;
    var skip = document.getElementById('quiz-skip-btn');
    if (skip) skip.hidden = false;

    var badge = document.getElementById('game-round-badge');
    if (badge) badge.innerText = '조각 수집 ' + (index + 1) + ' / ' + gameSentenceQueue.length;
    var hint = document.getElementById('game-kr-meaning');
    if (hint) hint.innerText = '"' + (data.kr || meaningFor(data.en)) + '"';
    var slotContainer = document.getElementById('answer-slot-container');
    if (slotContainer) slotContainer.style.borderColor = '#E2E8F0';
    renderGameUI(remainingPool);
  }

  function normalizeQueue(sentenceList) {
    var out = [];
    var seen = {};
    function add(item) {
      if (!item || out.length >= 3) return;
      var en = typeof item === 'string' ? item : (item.en || item.text || '');
      var kr = typeof item === 'string' ? meaningFor(item) : (item.kr || item.meaning || meaningFor(en));
      var key = normalizeSentence(en).toLowerCase();
      var api = window.DayOLearnerExpressions;
      if (!key || !api || !api.isQuizQualityCandidate(key) || seen[key]) return;
      seen[key] = true;
      out.push({ en: en, kr: kr });
    }
    (sentenceList || []).forEach(add);
    return out.slice(0, 3);
  }

  window.startMultiMemoryGame = function (sentenceList) {
    if (isPartner()) return;
    window.__dayoMemoryGameDone = false;
    gameSentenceQueue = normalizeQueue(sentenceList);
    var recovered = readRecovery();
    quizState = window.DayOLearnerExpressions.normalizeQuizState(recovered, gameSentenceQueue.length);
    writeRecovery();
    showMemoryModal();
    if (!gameSentenceQueue.length) {
      finishQuiz('insufficient');
      return;
    }
    if (quizState.ended) {
      finishQuiz(quizState.endReason || 'completed', true);
      return;
    }
    currentRoundIndex = quizState.currentIndex;
    if (quizState.startedAt) {
      loadRound(currentRoundIndex);
      startQuizClock();
      return;
    }
    renderPanel('5분 대화 퀴즈', '최대 ' + gameSentenceQueue.length + '문제 · 5분', '방금 나눈 대화에서 표현을 다시 떠올려봐요.');
    var skip = document.getElementById('quiz-skip-btn');
    if (skip) skip.hidden = false;
    var timerNode = document.getElementById('review-quiz-timer');
    if (timerNode) timerNode.hidden = true;
    stateButton('시작하기', function () {
      quizState.startedAt = Date.now();
      writeRecovery();
      currentRoundIndex = quizState.currentIndex;
      loadRound(currentRoundIndex);
      startQuizClock();
    });
  };

  window.startMemoryGame = function (extractedSentence, meaningKr) {
    if (extractedSentence) {
      window.startMultiMemoryGame([
        { en: extractedSentence, kr: meaningKr || meaningFor(extractedSentence) }
      ]);
      return;
    }
    window.startMultiMemoryGame(null);
  };

  window.startMemoryGameFromSession = function () {
    if (isPartner()) return;
    if (window.__dayoMemoryGameDone) {
      openTalkRecord();
      return;
    }
    window.startMultiMemoryGame(extractSessionSentences());
  };

  window.pickWordToSlot = function (word, poolIdx) {
    if (completing) return;
    userPickedWords.push(word);
    if (typeof poolIdx === 'number' && poolIdx >= 0 && poolIdx < remainingPool.length) {
      remainingPool.splice(poolIdx, 1);
    } else {
      var found = remainingPool.indexOf(word);
      if (found !== -1) remainingPool.splice(found, 1);
    }
    renderGameUI(remainingPool);
    if (userPickedWords.length === currentCorrectWords.length) checkGameResult();
  };

  window.removeWordFromSlot = function (slotIdx) {
    if (completing) return;
    if (slotIdx < 0 || slotIdx >= userPickedWords.length) return;
    var word = userPickedWords.splice(slotIdx, 1)[0];
    remainingPool.push(word);
    renderGameUI(remainingPool);
  };

  window.skipToRecordCard = function () {
    if (quizState) finishQuiz('skip');
  };

  window.openCardDetailModal = function (sentence) {
    finishQuiz('completed');
  };

  var origOpenTalkRecord = window.openQuizModalImmediately;
  window.openQuizModalImmediately = function () {
    if (isPartner()) {
      if (typeof origOpenTalkRecord === 'function') origOpenTalkRecord();
      return;
    }
    if (window.isEarlyExit) {
      if (typeof origOpenTalkRecord === 'function') origOpenTalkRecord();
      return;
    }
    if (!window.__dayoMemoryGameDone) {
      window.startMemoryGameFromSession();
      return;
    }
    if (typeof origOpenTalkRecord === 'function') origOpenTalkRecord();
  };

  window.__DAYO_QUIZ_TEST__ = {
    extractSessionSentences: function (rows) {
      var api = window.DayOLearnerExpressions;
      return api ? api.extractExpressions(rows, { limit: 3, quizQuality: true }) : [];
    },
    score: function (completed, total) {
      return window.DayOLearnerExpressions.quizScore(completed, total);
    }
  };
})();
