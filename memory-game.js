/* DayO session-end memory block tap game — no score, no penalty */
(function () {
  'use strict';

  var currentTargetSentence = '';
  var correctWords = [];
  var userPickedWords = [];
  var remainingPool = [];
  var completing = false;

  var fallbackTopics = {
    daily: { en: "I've been into pottery lately", kr: '난 요즘 도예에 푹 빠져 있어' },
    korea: { en: 'Finding hidden spots is fun', kr: '숨은 동네 명소를 찾는 건 늘 즐거워' },
    taste: { en: 'I prefer cozy places over crowded ones', kr: '난 붐비는 곳보다 아늑한 곳이 좋아' }
  };

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

  function topicKey() {
    try {
      var draftRaw = localStorage.getItem('dayo_booking_draft')
        || localStorage.getItem('dayo_last_booking')
        || localStorage.getItem('chatPrefs')
        || '';
      var draft = draftRaw ? JSON.parse(draftRaw) : {};
      var ids = draft.purposes || draft.purpose || draft.topic || [];
      if (!Array.isArray(ids) && ids) ids = [ids];
      var joined = ids.join(' ').toLowerCase();
      if (/korea|travel|한국/.test(joined)) return 'korea';
      if (/taste|abroad|취향/.test(joined)) return 'taste';
      if (/opic|daily|casual|일상/.test(joined)) return 'daily';
    } catch (e) { /* ignore */ }
    return 'daily';
  }

  function fallbackForTopic() {
    return fallbackTopics[topicKey()] || fallbackTopics.daily;
  }

  function looksEnglish(text) {
    var s = String(text || '');
    var latin = (s.match(/[A-Za-z]/g) || []).length;
    var hangul = (s.match(/[\uAC00-\uD7A3]/g) || []).length;
    return latin >= 8 && latin > hangul;
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

  function utteranceText(row) {
    if (!row) return '';
    if (typeof row === 'string') return row.trim();
    return String(row.text || row.transcript || row.message || '').trim();
  }

  function isUserUtterance(row) {
    if (!row || typeof row === 'string') return true;
    var role = String(row.role || '').toLowerCase();
    var speaker = String(row.speaker || '').toLowerCase();
    if (role === 'partner' || speaker === 'partner' || role === 'host' || speaker === 'host') {
      return false;
    }
    return role === 'user' || speaker === 'user' || !role;
  }

  function extractSessionSentence() {
    var rows = collectTranscriptRows();
    var candidates = rows
      .filter(isUserUtterance)
      .map(utteranceText)
      .map(normalizeSentence)
      .filter(function (text) {
        var words = text.split(' ').filter(Boolean);
        return looksEnglish(text) && words.length >= 4 && words.length <= 10;
      });
    if (candidates.length) return candidates[candidates.length - 1];
    return '';
  }

  function meaningFor(en) {
    var key;
    var item;
    var target = normalizeSentence(en).toLowerCase();
    for (key in fallbackTopics) {
      if (!Object.prototype.hasOwnProperty.call(fallbackTopics, key)) continue;
      item = fallbackTopics[key];
      if (normalizeSentence(item.en).toLowerCase() === target) return item.kr;
    }
    return '오늘 대화에서 나온 표현이에요';
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

  function showTalkRecord() {
    window.__dayoMemoryGameDone = true;
    window.__dayoMemorySentence = currentTargetSentence;
    hideMemoryModal();
    if (typeof origOpenTalkRecord === 'function') {
      origOpenTalkRecord();
      return;
    }
    if (typeof window.openQuizModalImmediately === 'function') {
      window.openQuizModalImmediately();
    }
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
    var isMatch = userPickedWords.join(' ') === correctWords.join(' ');
    var slotContainer = document.getElementById('answer-slot-container');
    if (isMatch) {
      completing = true;
      if (typeof window.confetti === 'function') {
        window.confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
      }
      if (slotContainer) slotContainer.style.borderColor = '#10B981';
      setTimeout(function () {
        showTalkRecord();
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
      remainingPool = shuffle(correctWords);
      renderGameUI(remainingPool);
    }, 400);
  }

  window.startMemoryGame = function (extractedSentence, meaningKr) {
    if (isPartner()) return;
    var data = (extractedSentence && meaningKr)
      ? { en: extractedSentence, kr: meaningKr }
      : fallbackForTopic();
    if (extractedSentence && !meaningKr) {
      data = { en: extractedSentence, kr: meaningFor(extractedSentence) };
    }

    currentTargetSentence = normalizeSentence(data.en);
    correctWords = currentTargetSentence.split(' ').filter(Boolean);
    if (correctWords.length < 3) {
      data = fallbackForTopic();
      currentTargetSentence = normalizeSentence(data.en);
      correctWords = currentTargetSentence.split(' ').filter(Boolean);
    }
    userPickedWords = [];
    remainingPool = shuffle(correctWords);
    completing = false;

    var hint = document.getElementById('game-kr-meaning');
    if (hint) hint.textContent = '"' + data.kr + '"';
    var slotContainer = document.getElementById('answer-slot-container');
    if (slotContainer) slotContainer.style.borderColor = '#E2E8F0';

    renderGameUI(remainingPool);
    showMemoryModal();
  };

  window.startMemoryGameFromSession = function () {
    if (isPartner()) return;
    if (window.__dayoMemoryGameDone) {
      showTalkRecord();
      return;
    }
    var extracted = extractSessionSentence();
    if (extracted) {
      window.startMemoryGame(extracted, meaningFor(extracted));
      return;
    }
    var fallback = fallbackForTopic();
    window.startMemoryGame(fallback.en, fallback.kr);
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
    if (userPickedWords.length === correctWords.length) checkGameResult();
  };

  window.removeWordFromSlot = function (slotIdx) {
    if (completing) return;
    if (slotIdx < 0 || slotIdx >= userPickedWords.length) return;
    var word = userPickedWords.splice(slotIdx, 1)[0];
    remainingPool.push(word);
    renderGameUI(remainingPool);
  };

  window.skipToRecordCard = function () {
    showTalkRecord();
  };

  window.openCardDetailModal = function (sentence) {
    if (sentence) currentTargetSentence = normalizeSentence(sentence);
    showTalkRecord();
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
})();
