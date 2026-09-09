/* DayO session-end memory block tap game — 3-round, no score, no penalty */
(function () {
  'use strict';

  var DEFAULT_SENTENCES = [
    { en: "I've been into pottery lately", kr: '난 요즘 도예에 푹 빠져 있어' },
    { en: 'Finding hidden spots is fun', kr: '숨은 동네 명소를 찾는 건 늘 즐거워' },
    { en: 'A cup of coffee makes my day', kr: '커피 한 잔이 하루를 기분 좋게 만들어' }
  ];

  var gameSentenceQueue = [];
  var currentRoundIndex = 0;
  var userPickedWords = [];
  var currentCorrectWords = [];
  var remainingPool = [];
  var completing = false;
  var roundTimer = null;

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
    return DEFAULT_SENTENCES[0];
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

  function extractSessionSentences() {
    var rows = collectTranscriptRows();
    var partnerRows = rows.filter(function (row) { return !isUserUtterance(row); });
    var userRows = rows.filter(isUserUtterance);
    var seen = {};
    var out = [];

    function pushFrom(list) {
      var i;
      var text;
      var words;
      for (i = list.length - 1; i >= 0 && out.length < 3; i -= 1) {
        text = normalizeSentence(utteranceText(list[i]));
        words = text.split(' ').filter(Boolean);
        if (!looksEnglish(text) || words.length < 4 || words.length > 10) continue;
        if (seen[text.toLowerCase()]) continue;
        seen[text.toLowerCase()] = true;
        out.push({ en: text, kr: meaningFor(text) });
      }
    }

    pushFrom(partnerRows);
    pushFrom(userRows);
    return out;
  }

  function extractSessionSentence() {
    var list = extractSessionSentences();
    return list.length ? list[0].en : '';
  }

  function meaningFor(en) {
    var target = normalizeSentence(en).toLowerCase();
    var i;
    for (i = 0; i < DEFAULT_SENTENCES.length; i += 1) {
      if (normalizeSentence(DEFAULT_SENTENCES[i].en).toLowerCase() === target) {
        return DEFAULT_SENTENCES[i].kr;
      }
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
    window.__dayoMemorySentence = (gameSentenceQueue[0] && gameSentenceQueue[0].en) || '';
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
    var isMatch = userPickedWords.join(' ') === currentCorrectWords.join(' ');
    var slotContainer = document.getElementById('answer-slot-container');
    if (isMatch) {
      completing = true;
      if (slotContainer) slotContainer.style.borderColor = '#10B981';
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
        hideMemoryModal();
        window.__dayoMemoryGameDone = true;
        window.__dayoMemorySentence = (gameSentenceQueue[0] && gameSentenceQueue[0].en) || '';
        if (typeof window.openCardDetailModal === 'function') {
          window.openCardDetailModal(gameSentenceQueue[0] && gameSentenceQueue[0].en);
        } else {
          showTalkRecord();
        }
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
    var data = gameSentenceQueue[index] || DEFAULT_SENTENCES[0];
    var cleanEn = normalizeSentence(data.en);
    currentCorrectWords = cleanEn.split(' ').filter(Boolean);
    userPickedWords = [];
    remainingPool = shuffle(currentCorrectWords);
    completing = false;

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
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push({ en: en, kr: kr });
    }
    (sentenceList || []).forEach(add);
    DEFAULT_SENTENCES.forEach(add);
    return out.slice(0, 3);
  }

  window.startMultiMemoryGame = function (sentenceList) {
    if (isPartner()) return;
    window.__dayoMemoryGameDone = false;
    gameSentenceQueue = normalizeQueue(sentenceList);
    currentRoundIndex = 0;
    loadRound(currentRoundIndex);
    showMemoryModal();
  };

  window.startMemoryGame = function (extractedSentence, meaningKr) {
    if (extractedSentence) {
      window.startMultiMemoryGame([
        { en: extractedSentence, kr: meaningKr || meaningFor(extractedSentence) }
      ].concat(DEFAULT_SENTENCES).slice(0, 3));
      return;
    }
    window.startMultiMemoryGame(null);
  };

  window.startMemoryGameFromSession = function () {
    if (isPartner()) return;
    if (window.__dayoMemoryGameDone) {
      showTalkRecord();
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
    showTalkRecord();
  };

  window.openCardDetailModal = function (sentence) {
    if (sentence) {
      window.__dayoMemorySentence = normalizeSentence(sentence);
    }
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
