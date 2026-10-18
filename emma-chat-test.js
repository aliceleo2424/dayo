/* DayO landing speaking-sense test: "Emma chat" simulation (English only).
   Renders inside the existing #quizModal. Exposes window.DayOEmmaChat.
   No network calls; mic uses the browser SpeechRecognition only when the visitor taps it. */
(function () {
  'use strict';

  function lang() {
    var l = window.DayOI18n && window.DayOI18n.getLang ? String(window.DayOI18n.getLang()) : 'KO';
    return l.toUpperCase() === 'KO' ? 'KO' : 'EN';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var UI = {
    title: { KO: '외국인 친구 Emma한테 카톡이 왔어요 ☕', EN: 'Your friend Emma just texted you ☕' },
    introLead: { KO: '한국 문화를 잘 아는 외국인 친구 Emma와 주말 약속까지, 2분짜리 대화예요.', EN: 'A two-minute chat with Emma, a friend who knows Korean culture well, all the way to a weekend café date.' },
    introBody: { KO: '평소 나라면 어떻게 답할지 골라 보세요. 정답도 점수도 없어요. 막히면 한국어로 물어봐도 되고, 중간에 한 번은 마이크로 직접 말해 봐요.', EN: 'Pick the reply you would really send. There are no right answers or scores. You can ask in Korean when stuck, and you will speak once with your mic.' },
    introNote: { KO: '가상의 대화예요. 말한 내용은 저장하거나 전송하지 않아요.', EN: 'This is a simulated chat. What you say is not saved or sent.' },
    start: { KO: '답장하러 가기', EN: 'Reply to Emma' },
    emmaSub: { KO: '한국 문화를 잘 알아요 · 한국어 가능', EN: 'Knows Korean culture · speaks Korean' },
    opening: { KO: '토요일 오후, 카톡이 울려요', EN: 'Saturday afternoon, your phone buzzes' },
    koChance: { KO: '한국어 찬스', EN: 'Ask in Korean' },
    micLead: { KO: '이번 답장은 직접 말로 해 보세요. 마이크 연결도 함께 확인돼요.', EN: 'Answer this one out loud. It also checks that your mic works.' },
    micStart: { KO: '눌러서 말하기', EN: 'Tap to speak' },
    micListening: { KO: '듣고 있어요… 좋아하는 디저트를 말해 보세요', EN: 'Listening… say your favorite dessert' },
    micOk: { KO: '마이크 연결 확인 ✓', EN: 'Mic connected ✓' },
    micDenied: { KO: '마이크 권한이 꺼져 있어요. 브라우저 주소창의 권한 설정에서 마이크를 허용해 주세요.', EN: 'Microphone access is off. Allow it in your browser’s site settings.' },
    micUnsupported: { KO: '이 브라우저는 음성 인식을 지원하지 않아요. 크롬이나 사파리에서 해 보세요.', EN: 'This browser does not support speech recognition. Try Chrome or Safari.' },
    micNoSpeech: { KO: '목소리가 들리지 않았어요. 다시 눌러서 말해 보세요.', EN: 'We could not hear you. Tap and try again.' },
    micSkip: { KO: '이번엔 말 대신 넘어가기', EN: 'Skip speaking this time' },
    micSkipped: { KO: '(마이크 패스 🙈)', EN: '(skipped the mic 🙈)' },
    ending: { KO: '대화 끝 · 결과를 확인해 보세요', EN: 'Chat finished · see your result' },
    seeResult: { KO: '결과 보기', EN: 'See my result' },
    resultEyebrow: { KO: '나의 대화 디저트', EN: 'My conversation dessert' },
    emmaSays: { KO: 'Emma가 본 나', EN: 'What Emma noticed' },
    nextTip: { KO: '다음엔 이렇게 시작해 보세요', EN: 'Try this next time' },
    phrases: { KO: '실제 대화에서 이렇게 말해보세요!', EN: 'Try saying it like this in a real chat!' },
    koUsed: { KO: '한국어 찬스 {n}번', EN: 'Asked in Korean {n}×' },
    micDone: { KO: '마이크 확인 ✓', EN: 'Mic checked ✓' },
    micNot: { KO: '마이크 미확인', EN: 'Mic not checked' },
    micKoQ: { KO: "'좋아하는 디저트는 ○○야'는 영어로 어떻게 말해요?", EN: "How do I say my favorite dessert?" },
    micKoA: { KO: "'My favorite dessert is ___.' 또는 'I love ___!' 하고 디저트 이름을 넣으면 돼요 🍰", EN: "Say 'My favorite dessert is ___.' 🍰" },
    micAgain: { KO: '한 번 더 말해 볼까요? 디저트 이름까지 넣어서요.', EN: 'Try once more, with the dessert name.' },
    consentAll: { KO: '아래 내용에 모두 동의합니다', EN: 'I agree to all of the below' },
    consentAllSub: { KO: '(필수·선택 포함)', EN: '(required and optional)' },
    consentMore: { KO: '자세히 보기', EN: 'Show details' }
  };
  function u(key, vars) {
    var v = (UI[key] && UI[key][lang()]) || key;
    if (vars) Object.keys(vars).forEach(function (k) { v = v.replace('{' + k + '}', vars[k]); });
    return v;
  }

  var INK = '#40362F';
  var SVG = {
    mac: '<svg viewBox="0 0 200 200" aria-hidden="true"><ellipse cx="100" cy="72" rx="80" ry="40" fill="#CFE3C8" stroke="' + INK + '" stroke-width="6"/><rect x="26" y="88" width="148" height="22" rx="11" fill="#FFF4CC" stroke="' + INK + '" stroke-width="6"/><ellipse cx="100" cy="132" rx="80" ry="40" fill="#CFE3C8" stroke="' + INK + '" stroke-width="6"/><ellipse cx="76" cy="132" rx="7" ry="9" fill="' + INK + '"/><ellipse cx="124" cy="132" rx="7" ry="9" fill="' + INK + '"/><path d="M90 150h20" stroke="' + INK + '" stroke-width="5" stroke-linecap="round"/><ellipse cx="58" cy="146" rx="10" ry="6" fill="#F2B8A8"/><ellipse cx="142" cy="146" rx="10" ry="6" fill="#F2B8A8"/></svg>',
    cookie: '<svg viewBox="0 0 200 200" aria-hidden="true"><path d="M100 26c40 0 74 30 74 72 0 18-6 30-14 40l-12-6-6 14-14-4c-8 18-24 30-30 30-44 0-74-34-74-76 0-40 34-70 76-70z" fill="#EBC77E" stroke="' + INK + '" stroke-width="6" stroke-linejoin="round"/><circle cx="70" cy="62" r="7" fill="#7A5232"/><circle cx="132" cy="58" r="6" fill="#7A5232"/><circle cx="60" cy="130" r="6" fill="#7A5232"/><ellipse cx="84" cy="100" rx="7" ry="9" fill="' + INK + '"/><ellipse cx="124" cy="100" rx="7" ry="9" fill="' + INK + '"/><path d="M92 122q12 12 24 0" stroke="' + INK + '" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="68" cy="116" rx="10" ry="6" fill="#F2B8A8"/><ellipse cx="140" cy="116" rx="10" ry="6" fill="#F2B8A8"/></svg>',
    cup: '<svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="22" r="12" fill="#E8826E" stroke="' + INK + '" stroke-width="5"/><path d="M40 92c-14-30 14-54 36-48 6-22 42-22 48 0 22-6 50 18 36 48z" fill="#FFF4CC" stroke="' + INK + '" stroke-width="6" stroke-linejoin="round"/><path d="M38 92h124l-16 88H54z" fill="#A9C5A2" stroke="' + INK + '" stroke-width="6" stroke-linejoin="round"/><path d="M74 126q10-10 20 0M106 126q10-10 20 0" stroke="' + INK + '" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M84 146q16 18 32 0" stroke="' + INK + '" stroke-width="5" fill="#fff" stroke-linecap="round"/><ellipse cx="62" cy="140" rx="9" ry="6" fill="#F2B8A8"/><ellipse cx="138" cy="140" rx="9" ry="6" fill="#F2B8A8"/></svg>',
    pud: '<svg viewBox="0 0 200 200" aria-hidden="true"><path d="M62 50h76l22 112H40z" fill="#FFE08A" stroke="' + INK + '" stroke-width="6" stroke-linejoin="round"/><path d="M62 50c6-14 70-14 76 0l4 20c-20 10-64 10-84 0z" fill="#9A6236" stroke="' + INK + '" stroke-width="6" stroke-linejoin="round"/><ellipse cx="100" cy="166" rx="84" ry="16" fill="#fff" stroke="' + INK + '" stroke-width="6"/><ellipse cx="82" cy="112" rx="7" ry="9" fill="' + INK + '"/><ellipse cx="118" cy="112" rx="7" ry="9" fill="' + INK + '"/><path d="M94 132q6 5 12 0" stroke="' + INK + '" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="66" cy="126" rx="9" ry="6" fill="#F2B8A8"/><ellipse cx="134" cy="126" rx="9" ry="6" fill="#F2B8A8"/></svg>'
  };

  var TYPES = {
    mac: { name: { KO: '마카롱', EN: 'Macaron' }, kind: { KO: '완벽주의 침묵형', EN: 'The Perfect-Sentence Type' },
      line: { KO: '문장이 반듯하게 완성돼야 입을 여는 타입. 대답은 정확하지만 가끔 타이밍을 놓쳐요.', EN: 'You speak once the sentence is perfect. Accurate, but sometimes the moment passes.' },
      emma: '“You always choose your words so carefully. I like that!”',
      tip: { KO: '반쯤 만든 문장으로 먼저 말해 보세요. 틀려도 상대는 끝까지 들어줘요.', EN: 'Start with half a sentence. People will wait for the rest.' } },
    cookie: { name: { KO: '쿠키', EN: 'Cookie' }, kind: { KO: '단어 던지기형', EN: 'The Word-Crumb Type' },
      line: { KO: '단어가 부스러기처럼 툭툭 나오는 타입. 뜻은 다 통하는데 문장으로 이어지진 않아요.', EN: 'Words come out like crumbs. You get the meaning across, just not in full sentences.' },
      emma: '“I always get what you mean, haha!”',
      tip: { KO: '익숙한 문장 틀 하나에 단어를 끼워 보세요. I’m into ___. / I feel ___.', EN: 'Drop your words into one easy frame: I’m into ___. / I feel ___.' } },
    cup: { name: { KO: '컵케이크', EN: 'Cupcake' }, kind: { KO: '웃음 방패형', EN: 'The Smile-Shield Type' },
      line: { KO: '막히면 일단 달콤하게 웃는 타입. 분위기는 최고인데, 못 알아들은 채로 넘어갈 때가 있어요.', EN: 'When stuck, you smile sweetly. Great vibes, but some things slip by.' },
      emma: '“You’re so fun to hang out with!”',
      tip: { KO: '웃기 전에 한마디만 붙여 보세요. Sorry, one more time?', EN: 'Add one line before the smile: Sorry, one more time?' } },
    pud: { name: { KO: '푸딩', EN: 'Pudding' }, kind: { KO: '듣기만 프로형', EN: 'The Quiet-Listener Type' },
      line: { KO: '조용히 다 알아듣는 타입. 대답이 짧아서 대화가 상대 쪽으로만 흘러가요.', EN: 'You understand everything quietly, but short replies leave the talking to the other person.' },
      emma: '“You’re a great listener. Tell me more about you next time!”',
      tip: { KO: '대답 끝에 질문 하나만 되돌려 주세요. What about you?', EN: 'End your answer with one question back: What about you?' } }
  };

  var TURNS = [
    { emma: "Hey! It's Emma 😊 What's up?",
      ko: [{ KO: "'What's up?'엔 뭐라고 답해요?", EN: "How do I answer 'What's up?'" }, { KO: "'Not much, you?' (별일 없어, 넌?) 하면 딱이에요 😊", EN: "Just say 'Not much, you?' 😊" }],
      opts: [['mac', "I'm fine, thank you. And you?", 'Haha so polite! 😄 I\'m good too.'], ['cookie', 'Me… home… Netflix!', 'Netflix day! Love it 😆'], ['cup', 'Hahaha hiii 😆😆', 'Haha hi hi! 👋'], ['pud', 'Not much.', 'Cool cool.']],
      phrase: ['Not much, you?', { KO: '별일 없어, 너는?', EN: 'casual reply to “What’s up?”' }] },
    { emma: 'I found a cute dessert café in Yeonnam 🍰 Wanna go this Saturday?',
      ko: [{ KO: "'Wanna'가 뭐예요?", EN: "What does 'wanna' mean?" }, { KO: "'Want to'를 줄인 말이에요. '갈래?' 느낌이에요!", EN: "It's short for 'want to' 🙂" }],
      opts: [['mac', 'I would be very happy to go with you if you are available.', 'Haha you sound like an email 😂 But yay!'], ['cookie', 'Saturday! Cake! Good!', 'Cake is always good 🍰'], ['cup', 'Yesss 😆', 'Yay!! 💛'], ['pud', 'OK.', 'Great! 2pm?']],
      phrase: ["I'd love to! What time?", { KO: '좋아! 몇 시에?', EN: 'warm yes + next step' }] },
    { mic: true, emma: "What's your favorite dessert? Tell me! 🎤" },
    { emma: "Sorry!! The bus is stuck in traffic 😭 I'll be 10 minutes late.",
      ko: [{ KO: "'stuck in traffic'이 무슨 뜻이에요?", EN: "What's 'stuck in traffic'?" }, { KO: "'차가 막혀서 꼼짝 못 한다'는 뜻이에요 😭", EN: 'The bus can’t move because of cars 😭' }],
      opts: [['mac', '(번역기 확인 중…) No problem. I will wait for you patiently.', 'Haha thank you so much 🙏'], ['cookie', 'Bus… traffic… OK OK!', 'Thanks!! Almost there 🏃‍♀️'], ['cup', "Hahaha it's okay 😂", 'Phew 😅 thanks!'], ['pud', 'Sure.', 'Thanks! See you soon.']],
      phrase: ['No worries, take your time!', { KO: '괜찮아, 천천히 와!', EN: 'friendly “it’s fine”' }] },
    { emma: 'This place is sooo cute. So, how was your week?',
      ko: [{ KO: '지난주 얘기는 뭐라고 시작해요?', EN: 'How do I start talking about my week?' }, { KO: "'It was pretty busy'처럼 'It was ___'로 시작하면 돼요!", EN: "Start with 'It was ___' 🙂" }],
      opts: [['mac', '(속으로: 과거형이니까 was… 아니 had been…?)', 'Take your time! 😊'], ['cookie', 'Week… busy… work… tired.', 'Aww, busy week! Same here.'], ['cup', 'Haha… good good! 😅', 'Good good! 😆'], ['pud', 'Good.', 'Nice! …🙂']],
      phrase: ['Pretty busy, but good. How about you?', { KO: '좀 바빴지만 괜찮았어. 너는?', EN: 'answer + question back' }] },
    { emma: 'Ooh, the strawberry cake just came out! Should we share one?',
      ko: [{ KO: "여기서 'share'는 무슨 느낌이에요?", EN: "What does 'share' mean here?" }, { KO: "'나눠 먹을까?'라는 뜻이에요 🍓", EN: 'Eat one cake together 🍓' }],
      opts: [['mac', 'Yes, I think sharing would be a reasonable choice.', "Haha reasonable! 😂 Let's do it."], ['cookie', 'Share! Yes! Strawberry!', 'Strawberry team! 🍓'], ['cup', '😆😆 yes yes', 'Yay 🍓'], ['pud', 'OK.', "Okay! I'll order."]],
      phrase: ["Sure, let's split one!", { KO: '좋아, 하나 나눠 먹자!', EN: 'casual “let’s share”' }] }
  ];
  var CLOSING = "Today was so fun! Let's do this again 💛";

  var state = null;
  var timers = [];
  var recognition = null;

  function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }
  function stop() {
    timers.forEach(clearTimeout); timers = [];
    if (recognition) { try { recognition.onend = null; recognition.abort(); } catch (e) { /* ignore */ } recognition = null; }
    if (state) state.alive = false;
  }

  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function introHtml() {
    return '<div class="emma-intro">' +
      '<div class="emma-intro-ava" aria-hidden="true">E</div>' +
      '<p class="emma-intro-lead">' + esc(u('introLead')) + '</p>' +
      '<p class="emma-intro-body">' + esc(u('introBody')) + '</p>' +
      '<p class="speaking-intro-note">' + esc(u('introNote')) + '</p>' +
      '<button class="quiz-next-btn" type="button" data-emma-start>' + esc(u('start')) + '</button></div>';
  }

  function mount(container, opts) {
    stop();
    state = { picks: [], koUsed: 0, micOk: false, turn: 0, alive: true, onFinish: opts && opts.onFinish };
    container.innerHTML = '<div class="emma-chat">' +
      '<div class="emma-bar"><span class="emma-ava" aria-hidden="true">E</span><span><b>Emma</b><small>' + esc(u('emmaSub')) + '</small></span></div>' +
      '<div class="emma-log" aria-live="polite"></div><div class="emma-dock"></div></div>';
    state.log = container.querySelector('.emma-log');
    state.dock = container.querySelector('.emma-dock');
    sys(u('opening'));
    runTurn();
  }

  function scroll() { if (state && state.log) state.log.scrollTop = state.log.scrollHeight; }
  function sys(text) { var d = document.createElement('div'); d.className = 'emma-sys'; d.textContent = text; state.log.appendChild(d); scroll(); }
  function me(text) { var d = document.createElement('div'); d.className = 'emma-msg emma-me'; d.textContent = text; state.log.appendChild(d); scroll(); }
  function emma(text, extraClass, done) {
    var s = state;
    var d = document.createElement('div'); d.className = 'emma-msg emma-her';
    d.innerHTML = '<span class="emma-typing" aria-label="typing"><i></i><i></i><i></i></span>';
    s.log.appendChild(d); scroll();
    later(function () {
      if (!s.alive) return;
      d.textContent = text; if (extraClass) d.classList.add(extraClass); scroll();
      if (done) done();
    }, 600 + Math.min(text.length * 12, 700));
  }

  function runTurn() {
    var s = state;
    if (!s.alive) return;
    s.dock.innerHTML = '';
    if (s.turn >= TURNS.length) return finishChat();
    var t = TURNS[s.turn];
    emma(t.emma, '', function () {
      if (t.mic) return micTurn();
      var koBtn = document.createElement('button');
      koBtn.type = 'button'; koBtn.className = 'emma-ko';
      koBtn.textContent = u('koChance') + ': ' + t.ko[0][lang()];
      koBtn.addEventListener('click', function () {
        if (koBtn.disabled) return;
        koBtn.disabled = true; s.koUsed += 1;
        me(t.ko[0][lang()]);
        emma(t.ko[1][lang()], 'emma-help');
      });
      s.dock.appendChild(koBtn);
      shuffle(t.opts).forEach(function (o) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'emma-choice'; b.textContent = o[1];
        b.addEventListener('click', function () {
          if (s.dock.dataset.locked) return;
          s.dock.dataset.locked = '1';
          s.picks.push(o[0]); me(o[1]); s.dock.innerHTML = '';
          emma(o[2], '', function () { delete s.dock.dataset.locked; s.turn += 1; runTurn(); });
        });
        s.dock.appendChild(b);
      });
    });
  }

  function micTurn() {
    var s = state;
    var supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    s.dock.innerHTML = '<div class="emma-mic"><p class="emma-mic-lead">' + esc(u('micLead')) + '</p>' +
      '<button class="speaking-mic" type="button" data-emma-mic aria-label="' + esc(u('micStart')) + '"' + (supported ? '' : ' disabled') + '>🎙️</button>' +
      '<p class="speaking-status' + (supported ? '' : ' is-error') + '" role="status" data-emma-mic-status>' + esc(supported ? u('micStart') : u('micUnsupported')) + '</p>' +
      '<div class="speaking-transcript is-empty" data-emma-transcript hidden></div></div>' +
      '<button class="speaking-retry-btn emma-skip" type="button" data-emma-skip>' + esc(u('micSkip')) + '</button>';
    if (!s.micKoUsed) {
      var koBtn = document.createElement('button');
      koBtn.type = 'button'; koBtn.className = 'emma-ko';
      koBtn.textContent = u('koChance') + ': ' + u('micKoQ');
      koBtn.addEventListener('click', function () {
        if (koBtn.disabled) return;
        koBtn.disabled = true; s.micKoUsed = true; s.koUsed += 1;
        me(u('micKoQ')); emma(u('micKoA'), 'emma-help');
      });
      s.dock.insertBefore(koBtn, s.dock.firstChild);
    }
    s.dock.querySelector('[data-emma-skip]').addEventListener('click', function () {
      if (recognition) { try { recognition.onend = null; recognition.abort(); } catch (e) { /* ignore */ } recognition = null; }
      micAnswered(u('micSkipped'), "No worries! I'm a pudding person, by the way 🍮");
    });
    var micBtn = s.dock.querySelector('[data-emma-mic]');
    if (supported) micBtn.addEventListener('click', startMic);
  }

  function startMic() {
    var s = state;
    var Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor || recognition) return;
    var status = s.dock.querySelector('[data-emma-mic-status]');
    var box = s.dock.querySelector('[data-emma-transcript]');
    var btn = s.dock.querySelector('[data-emma-mic]');
    var text = '';
    var rec;
    try {
      rec = new Ctor(); rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    } catch (e) { status.textContent = u('micUnsupported'); status.classList.add('is-error'); return; }
    recognition = rec;
    rec.onstart = function () { s.micOk = true; btn.classList.add('is-listening'); status.classList.remove('is-error'); status.textContent = u('micOk') + ' · ' + u('micListening'); };
    rec.onresult = function (ev) {
      text = Array.prototype.map.call(ev.results, function (r) { return r[0] ? r[0].transcript : ''; }).join(' ').trim();
      box.hidden = false; box.classList.toggle('is-empty', !text); box.textContent = text;
    };
    rec.onerror = function (ev) {
      var code = ev && ev.error;
      if (code === 'aborted') return;
      status.classList.add('is-error');
      status.textContent = (code === 'not-allowed' || code === 'service-not-allowed') ? u('micDenied') : u('micNoSpeech');
    };
    rec.onend = function () {
      if (recognition !== rec) return;
      recognition = null; btn.classList.remove('is-listening');
      if (text && isUnclear(text)) unclearAnswer(text);
      else if (text) micAnswered(text, "Ooh, good choice! 😋 Now I'm hungry.");
      else if (!status.classList.contains('is-error')) { status.classList.add('is-error'); status.textContent = u('micNoSpeech'); }
    };
    try { rec.start(); } catch (e) { recognition = null; status.classList.add('is-error'); status.textContent = u('micNoSpeech'); }
  }

  var FILLER = ['i', 'like', 'love', 'my', 'favorite', 'favourite', 'is', 'the', 'a', 'an', 'and', 'so', 'um', 'uh', 'umm', 'hmm', 'it', 'its', "it's", 'dessert', 'desserts', 'really', 'very', 'much', 'to', 'eat', 'i\'m', 'im', 'yeah', 'yes', 'oh', 'well'];
  var DANGLING = ['like', 'love', 'is', 'my', 'the', 'a', 'an', 'and', 'favorite', 'favourite', 'to', 'eat', 'really', 'very'];
  function isUnclear(text) {
    var words = (String(text).toLowerCase().match(/[a-z']+/g) || []);
    if (!words.length) return true;
    if (DANGLING.indexOf(words[words.length - 1]) >= 0) return true;
    return words.every(function (w) { return FILLER.indexOf(w) >= 0; });
  }

  function unclearAnswer(text) {
    var s = state;
    s.micTries = (s.micTries || 0) + 1;
    if (s.micTries >= 2) return micAnswered(text, "Haha it's okay! Let's figure it out at the café 🍰");
    s.dock.innerHTML = ''; me(text);
    emma('Hmm? ' + text.replace(/[.!?\s]+$/, '') + '… what? 🤔', '', function () {
      sys(u('micAgain'));
      micTurn();
    });
  }

  function micAnswered(text, reply) {
    var s = state;
    if (!s.alive || s.dock.dataset.locked) return;
    s.dock.dataset.locked = '1';
    s.dock.innerHTML = ''; me(text);
    emma(reply, '', function () { delete s.dock.dataset.locked; s.turn += 1; runTurn(); });
  }

  function finishChat() {
    var s = state;
    emma(CLOSING, '', function () {
      sys(u('ending'));
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'quiz-next-btn'; b.textContent = u('seeResult');
      b.addEventListener('click', function () { if (s.onFinish) s.onFinish(result()); });
      s.dock.innerHTML = ''; s.dock.appendChild(b);
    });
  }

  function result() {
    var s = state;
    var count = { mac: 0, cookie: 0, cup: 0, pud: 0 };
    s.picks.forEach(function (p) { count[p] += 1; });
    var best = s.picks[s.picks.length - 1] || 'pud';
    Object.keys(count).forEach(function (k) { if (count[k] > count[best]) best = k; });
    return { type: best, picks: s.picks.slice(), koUsed: s.koUsed, micOk: s.micOk };
  }

  function resultHeadHtml(r) {
    var T = TYPES[r.type] || TYPES.pud;
    var L = lang();
    return '<div class="emma-result emma-result-head">' +
      '<div class="emma-type-card">' + SVG[r.type] + '<div><p class="emma-eyebrow">' + esc(u('resultEyebrow')) + '</p>' +
      '<h3 class="emma-type-name">' + esc(T.kind[L]) + '<br>' + esc(T.name[L]) + '</h3></div></div>' +
      '<p class="emma-type-line">' + esc(T.line[L]) + '</p>' +
      '<div class="emma-stats"><span>' + esc(u('koUsed', { n: String(r.koUsed) })) + '</span><span>' + esc(r.micOk ? u('micDone') : u('micNot')) + '</span></div>' +
      '<div class="emma-block"><p class="quiz-result-label">' + esc(u('emmaSays')) + '</p><p lang="en">' + esc(T.emma) + '</p></div>' +
      '</div>';
  }

  function resultDetailsHtml(r) {
    var T = TYPES[r.type] || TYPES.pud;
    var L = lang();
    var phrases = TURNS.filter(function (t) { return t.phrase; }).map(function (t) {
      return '<li><span lang="en">' + esc(t.phrase[0]) + '</span><em>' + esc(t.phrase[1][L]) + '</em></li>';
    }).join('');
    return '<div class="emma-result emma-result-details">' +
      '<div class="emma-block"><p class="quiz-result-label">' + esc(u('nextTip')) + '</p><p>' + esc(T.tip[L]) + '</p></div>' +
      '<div class="emma-block"><p class="quiz-result-label">' + esc(u('phrases')) + '</p><ul class="emma-phrases">' + phrases + '</ul></div>' +
      '</div>';
  }

  function resultHtml(r) {
    var T = TYPES[r.type] || TYPES.pud;
    var L = lang();
    var phrases = TURNS.filter(function (t) { return t.phrase; }).map(function (t) {
      return '<li><span lang="en">' + esc(t.phrase[0]) + '</span><em>' + esc(t.phrase[1][L]) + '</em></li>';
    }).join('');
    return '<div class="emma-result">' +
      '<div class="emma-type-card">' + SVG[r.type] + '<div><p class="emma-eyebrow">' + esc(u('resultEyebrow')) + '</p>' +
      '<h3 class="emma-type-name">' + esc(T.kind[L]) + '<br>' + esc(T.name[L]) + '</h3></div></div>' +
      '<p class="emma-type-line">' + esc(T.line[L]) + '</p>' +
      '<div class="emma-stats"><span>' + esc(u('koUsed', { n: String(r.koUsed) })) + '</span><span>' + esc(r.micOk ? u('micDone') : u('micNot')) + '</span></div>' +
      '<div class="emma-block"><p class="quiz-result-label">' + esc(u('emmaSays')) + '</p><p lang="en">' + esc(T.emma) + '</p></div>' +
      '<div class="emma-block"><p class="quiz-result-label">' + esc(u('nextTip')) + '</p><p>' + esc(T.tip[L]) + '</p></div>' +
      '<div class="emma-block"><p class="quiz-result-label">' + esc(u('phrases')) + '</p><ul class="emma-phrases">' + phrases + '</ul></div>' +
      '</div>';
  }

  window.DayOEmmaChat = {
    title: function () { return u('title'); },
    introHtml: introHtml,
    mount: mount,
    resultHtml: resultHtml,
    resultHeadHtml: resultHeadHtml,
    resultDetailsHtml: resultDetailsHtml,
    label: u,
    stop: stop,
    _types: TYPES,
    _turns: TURNS
  };
})();
