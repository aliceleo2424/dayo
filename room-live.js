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
  var sharing = false;
  var hungUp = false;
  var demoMode = true;
  var geminiOk = false;
  var sttOn = false;

  var callFrame = null;
  var localStream = null;
  var shareStream = null;
  var recognition = null;
  var wantListen = true;
  var geminiBusy = false;
  var geminiTimer = 0;
  var recentLines = [];
  var lastHintsKey = '';
  var sessionTranscript = [];
  var sessionStartedAt = new Date().toISOString();
  var utteranceSeq = 0;

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
      else if (!ts) ts = new Date().toISOString();
      return {
        id: (row && row.id) || ('t-' + i),
        speaker: (row && row.speaker) || 'user',
        text: String((row && row.text) || '').trim(),
        timestamp: ts
      };
    }).filter(function (row) { return row.text; });
  }

  function backupTranscriptLocal() {
    var serialized = serializeTranscript(sessionTranscript);
    try {
      window.localStorage.setItem('last_session_transcript', JSON.stringify(serialized));
    } catch (e) { /* quota / private mode */ }
    window.DayOLastTranscript = serialized;
    return serialized;
  }

  function pushTranscript(text, speaker) {
    var cleaned = String(text || '').trim();
    if (!cleaned) return null;
    var role = speaker || 'user';
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
    backupTranscriptLocal();
    document.dispatchEvent(new CustomEvent('dayo:transcript', { detail: entry }));
    return entry;
  }

  function saveTranscript() {
    var serialized = backupTranscriptLocal();
    var extra = {
      roomName: roomName(),
      startedAt: sessionStartedAt,
      endedAt: new Date().toISOString(),
      userId: (window.DayOProfileStore && window.DayOProfileStore.getUserId && window.DayOProfileStore.getUserId())
        || (window.DayOMode && window.DayOMode.getUserId && window.DayOMode.getUserId())
        || ''
    };
    if (document.body && document.body.getAttribute('data-dayo-role') === 'partner') {
      extra.partnerId = extra.userId;
    }
    var store = window.DayOProfileStore;
    var done = function (result) {
      var payload = result || { ok: false, local: true, transcript: serialized };
      document.dispatchEvent(new CustomEvent('dayo:transcriptsaved', { detail: payload }));
      return payload;
    };
    if (store && typeof store.saveSessionLog === 'function') {
      return store.saveSessionLog(sessionTranscript, extra).then(done).catch(function (err) {
        return done({ ok: false, local: true, transcript: serialized, error: err });
      });
    }
    return Promise.resolve(done({ ok: false, local: true, transcript: serialized }));
  }

  function dailyDomain() {
    return env('NEXT_PUBLIC_DAILY_DOMAIN').replace(/^https?:\/\//i, '').replace(/\/+$/, '') || 'dayo-live.daily.co';
  }

  function roomName() {
    try {
      var params = new URLSearchParams(window.location.search);
      var raw = params.get('room') || params.get('session') || 'dayo-studio';
      var clean = String(raw).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
      return clean || 'dayo-studio';
    } catch (e) {
      return 'dayo-studio';
    }
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
      shareVideo: document.getElementById('shareVideo'),
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
          '<button class="copilot-card" type="button" data-phrase="' + en + '">' +
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
      '{"phrases":[{"en":"natural English the learner can say NEXT","ko":"짧은 한국어 뜻"},{"en":"...","ko":"..."},{"en":"...","ko":"..."}],"grammar":"방금 말한 내용에 대한 짧은 문법 교정 힌트(한국어). 고칠 게 없으면 잘한 점을 짧게 칭찬."}',
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
        setStatus(sttOn ? t('room.copilotListening') : t('room.copilotDemo'), sttOn);
        return;
      }
      geminiOk = false;
      renderHints(demoHints(joined));
      setStatus(t('room.copilotDemo'), false);
    }).catch(function () {
      geminiBusy = false;
      geminiOk = false;
      renderHints(demoHints(joined));
      setStatus(t('room.copilotDemo'), false);
    });
  }

  function applyLocalTracks() {
    if (!localStream) return;
    localStream.getAudioTracks().forEach(function (track) { track.enabled = micOn; });
    localStream.getVideoTracks().forEach(function (track) { track.enabled = camOn; });
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

  function stopShareDemo() {
    if (shareStream) {
      shareStream.getTracks().forEach(function (track) { track.stop(); });
      shareStream = null;
    }
    var nodes = els();
    if (nodes.shareVideo) nodes.shareVideo.srcObject = null;
    if (nodes.column) nodes.column.classList.remove('sharing');
    sharing = false;
  }

  function startDemoMedia() {
    demoMode = true;
    var nodes = els();
    if (nodes.host) nodes.host.classList.remove('is-on', 'is-pending');
    if (nodes.stage) nodes.stage.classList.remove('is-daily');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (!isPartnerRoomMode()) showToast(t('room.toastNoMedia'), 3200);
      return Promise.resolve();
    }
    return navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(function (stream) {
      localStream = stream;
      if (nodes.selfVideo) nodes.selfVideo.srcObject = stream;
      applyLocalTracks();
    }).catch(function () {
      if (isPartnerRoomMode()) return;
      var toast = document.getElementById('toast');
      if (toast) toast.classList.add('toast--notice');
      showToast(t('room.toastNoMedia'), 3200);
      setTimeout(function () {
        if (toast) toast.classList.remove('toast--notice');
      }, 3500);
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

  function startSpeech() {
    var Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setStatus(t('room.copilotDemo'), false);
      showToast(t('room.toastSttOff'), 2800);
      return;
    }

    try {
      recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onresult = function (event) {
        var finalText = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
          var chunk = event.results[i][0] && event.results[i][0].transcript;
          if (event.results[i].isFinal && chunk) finalText += chunk + ' ';
        }
        finalText = finalText.trim();
        if (finalText) {
          pushTranscript(finalText, 'user');
          scheduleCopilot(finalText);
        }
      };

      recognition.onerror = function (event) {
        if (event && (event.error === 'not-allowed' || event.error === 'service-not-allowed')) {
          sttOn = false;
          setStatus(t('room.copilotDemo'), false);
        }
      };

      recognition.onend = function () {
        if (wantListen && micOn && !hungUp && recognition) {
          try { recognition.start(); } catch (e) { /* already started */ }
        }
      };

      if (micOn) {
        recognition.start();
        sttOn = true;
        setStatus(t('room.copilotListening'), true);
      }
    } catch (err) {
      sttOn = false;
      setStatus(t('room.copilotDemo'), false);
    }
  }

  function stopSpeech() {
    wantListen = false;
    sttOn = false;
    if (!recognition) return;
    try { recognition.onend = null; recognition.stop(); } catch (e) { /* ignore */ }
  }

  function pauseSpeech() {
    sttOn = false;
    if (!recognition) return;
    try { recognition.stop(); } catch (e) { /* ignore */ }
    setStatus(geminiOk ? t('room.copilotListening') : t('room.copilotDemo'), false);
  }

  function resumeSpeech() {
    if (!recognition || hungUp) return;
    wantListen = true;
    try {
      recognition.start();
      sttOn = true;
      setStatus(t('room.copilotListening'), true);
    } catch (e) { /* already started */ }
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

  function toggleShare() {
    if (callFrame) {
      var action = sharing
        ? callFrame.stopScreenShare()
        : callFrame.startScreenShare();
      return Promise.resolve(action).then(function () {
        sharing = !sharing;
        return sharing;
      });
    }

    if (sharing) {
      stopShareDemo();
      return Promise.resolve(false);
    }

    return navigator.mediaDevices.getDisplayMedia({ video: true }).then(function (stream) {
      shareStream = stream;
      sharing = true;
      var nodes = els();
      if (nodes.shareVideo) nodes.shareVideo.srcObject = stream;
      if (nodes.column) nodes.column.classList.add('sharing');
      var track = stream.getVideoTracks()[0];
      if (track) {
        track.addEventListener('ended', function () {
          stopShareDemo();
          showToast(t('room.toastShareStop'));
        });
      }
      return true;
    });
  }

  function hangUp() {
    hungUp = true;
    wantListen = false;
    stopSpeech();
    destroyDaily();
    stopShareDemo();
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
      var phrase = card.getAttribute('data-phrase') || '';
      if (!phrase) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(phrase).catch(function () { /* ignore */ });
      }
      var overlay = document.getElementById('sentenceOverlay');
      var overlayText = document.getElementById('sentenceOverlayText');
      if (overlay && overlayText) {
        overlayText.textContent = phrase;
        overlay.classList.add('show');
      }
      showToast(t('room.copilotCopied'));
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
      sessionStartedAt = new Date().toISOString();
      sessionTranscript = [];
      utteranceSeq = 0;
      backupTranscriptLocal();
      renderHints(demoHints(''));
      setStatus(t('room.copilotDemo'), false);
      bindCopilotClicks();
      bindChatToCopilot();

      var boot = withTimeout(joinDaily(), 8000).then(function () {
        demoMode = false;
      }).catch(function () {
        try { destroyDaily(); } catch (e) { /* ignore */ }
        showToast(t('room.toastDailyDemo'), 2800);
        return startDemoMedia();
      });

      boot.then(function () {
        if (hungUp) return;
        if (typeof window.updateRoomRoleText === 'function') window.updateRoomRoleText();
        document.dispatchEvent(new CustomEvent('dayo:room-ready'));
        try { startSpeech(); } catch (e) { setStatus(t('room.copilotDemo'), false); }
        if (!geminiKey()) {
          setStatus(t('room.copilotDemo'), sttOn);
        }
      }).catch(function () {
        try { startDemoMedia(); } catch (e) { /* ignore */ }
        try { startSpeech(); } catch (e) { /* ignore */ }
      });
    } catch (err) {
      try { startDemoMedia(); } catch (e) { /* ignore */ }
      renderHints(demoHints(''));
      setStatus(t('room.copilotDemo'), false);
    }
  }

  window.DayOLive = {
    isMicOn: function () { return micOn; },
    isCamOn: function () { return camOn; },
    isDemo: function () { return demoMode; },
    toggleMic: toggleMic,
    toggleCam: toggleCam,
    toggleShare: toggleShare,
    hangUp: hangUp,
    getTranscript: function () { return serializeTranscript(sessionTranscript); },
    suggestWords: suggestWords,
    suggestSentences: suggestSentences,
    saveTranscript: saveTranscript
  };

  document.addEventListener('dayo:langchange', function () {
    if (els().status) {
      setStatus(
        sttOn ? t('room.copilotListening') : t('room.copilotDemo'),
        sttOn
      );
    }
    if (!lastHintsKey) renderHints(demoHints(''));
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
