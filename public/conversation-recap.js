/* Transcript-derived recap. No browser transcript fallback, AI facts or scores. */
(function (root, factory) {
  var api = factory(typeof module === 'object' && module.exports ? require('./learner-expressions.js') : root.DayOLearnerExpressions);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DayOConversationRecap = api;
})(typeof window !== 'undefined' ? window : globalThis, function (learner) {
  'use strict';
  var VERSION = 'dayo_conversation_recap_v1';
  var dictionary = {
    crowded: ['붐비는', ['packed', 'busy'], ['quiet', 'empty'], 'The café was crowded.'],
    quiet: ['조용한', ['calm', 'peaceful'], ['noisy', 'loud'], 'We found a quiet café.'],
    delicious: ['맛있는', ['tasty', 'flavorful'], ['unappetizing'], 'The soup was delicious.'],
    expensive: ['비싼', ['costly', 'pricey'], ['cheap', 'inexpensive'], 'The restaurant was expensive.'],
    affordable: ['가격이 부담스럽지 않은', ['inexpensive', 'reasonably priced'], ['expensive', 'costly'], 'The tickets were affordable.'],
    comfortable: ['편안한', ['cozy', 'pleasant'], ['uncomfortable'], 'This chair is comfortable.'],
    convenient: ['편리한', ['handy', 'practical'], ['inconvenient'], 'The location is convenient.'],
    relaxing: ['편안하게 해 주는', ['soothing', 'restful'], ['stressful'], 'Walking here is relaxing.'],
    stressful: ['스트레스를 주는', ['tense', 'demanding'], ['relaxing'], 'Moving can be stressful.'],
    exciting: ['신나는', ['thrilling', 'stimulating'], ['boring', 'dull'], 'The trip was exciting.'],
    boring: ['지루한', ['dull', 'uninteresting'], ['exciting', 'interesting'], 'The movie was boring.'],
    friendly: ['친근한', ['welcoming', 'kind'], ['unfriendly'], 'The staff were friendly.'],
    unfamiliar: ['익숙하지 않은', ['unknown', 'new'], ['familiar'], 'This city is unfamiliar to me.'],
    familiar: ['익숙한', ['well-known', 'recognizable'], ['unfamiliar'], 'That name sounds familiar.'],
    peaceful: ['평화로운', ['calm', 'tranquil'], ['chaotic'], 'The park feels peaceful.'],
    noisy: ['시끄러운', ['loud'], ['quiet', 'silent'], 'The street was noisy.'],
    difficult: ['어려운', ['hard', 'challenging'], ['easy', 'simple'], 'The task was difficult.'],
    simple: ['간단한', ['easy', 'straightforward'], ['complicated', 'complex'], 'The recipe is simple.'],
    fresh: ['신선한', ['newly made'], ['stale'], 'The bread is fresh.'],
    generous: ['너그러운', ['giving', 'charitable'], ['stingy'], 'My neighbor is generous.'],
    spacious: ['넓고 여유 있는', ['roomy'], ['cramped'], 'The apartment is spacious.'],
    memorable: ['기억에 남는', ['unforgettable'], ['forgettable'], 'It was a memorable evening.']
  };
  var categories = [
    ['travel', '여행', 'Travel', /^(travel|travels|traveled|travelled|trip|trips|flight|flights|airport|vacation|hotel|tourism)$/],
    ['food', '음식', 'Food', /^(food|foods|meal|meals|restaurant|restaurants|cook|cooking|recipe|recipes|delicious|dinner|lunch|breakfast)$/],
    ['school', '학교', 'School', /^(school|schools|university|college|student|students|campus|homework)$/],
    ['work', '일', 'Work', /^(work|working|job|jobs|office|colleague|colleagues|career)$/],
    ['hobbies', '취미', 'Hobbies', /^(hobby|hobbies|painting|pottery|gardening|photography|knitting)$/],
    ['music', '음악', 'Music', /^(music|song|songs|concert|concerts|guitar|piano)$/],
    ['movies', '영화', 'Movies', /^(movie|movies|cinema|film|films)$/],
    ['exercise', '운동', 'Exercise', /^(exercise|gym|running|cycling|swimming|tennis|soccer|yoga)$/],
    ['daily', '일상', 'Daily life', /^(weekend|weekends|routine|neighbors|neighbor|cafe|cafés|café|cafes)$/]
  ];
  var common = new Set(('the a an and or but so to of in on at for with from as by is are am was were be been being i you we they he she it my your his her our their this that these those have has had do does did can could would should will may might must not no yes yeah yep okay ok uh um hmm ah oh really very just like well').split(' '));
  function language(v) { return ({ en: 'en', english: 'en', ko: 'ko', korean: 'ko', fr: 'fr', french: 'fr', es: 'es', spanish: 'es' })[String(v || '').toLowerCase().trim()] || ''; }
  function words(s) { return String(s || '').match(/[A-Za-zÀ-ž]+(?:['’][A-Za-zÀ-ž]+)*/g) || []; }
  function rows(log, bookingId, participantId, role) {
    if (!log || !log.id || log.booking_id !== bookingId || log.participant_id !== participantId || log.participant_role !== role || !Array.isArray(log.transcript)) return null;
    var seen = new Set();
    return log.transcript.filter(function (r) {
      if (!r || r.speaker !== role || typeof r.text !== 'string' || !r.text.trim() || typeof r.timestamp !== 'string' || !Number.isFinite(Date.parse(r.timestamp))) return false;
      var key = r.id ? r.id + '\n' + r.timestamp : r.text + '\n' + r.timestamp;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).map(function (r) { return { id: String(r.id || ''), speaker: role, text: r.text.trim(), timestamp: r.timestamp }; });
  }
  function sourceVersion(bookingId, logId, speech) {
    return learner.contentFingerprint(bookingId, logId, speech.map(function (r) { return [r.id, r.speaker, r.text, r.timestamp]; }));
  }
  function topics(speech) {
    var tokens = speech.flatMap(function (r) { return words(r.text).map(function (w) { return w.toLowerCase(); }); });
    return categories.map(function (c) { return { key: c[0], ko: c[1], en: c[2], count: tokens.filter(function (w) { return c[3].test(w); }).length }; })
      .filter(function (t) { return t.count; }).sort(function (a, b) { return b.count - a.count; }).slice(0, 3);
  }
  function expressions(speech) {
    var seen = new Set();
    return speech.filter(function (r) {
      var tokens = words(r.text), key = r.text.toLowerCase().replace(/\s+/g, ' ');
      if (tokens.length < 3 || r.text.length > 240 || /@|https?:|www\.|[<>�]/i.test(r.text) || new Set(tokens.map(function (w) { return w.toLowerCase(); }).filter(function (w) { return !common.has(w); })).size < 2 || seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, 3).map(function (r) { return { text: r.text, source_utterance_id: r.id, source_timestamp: r.timestamp }; });
  }
  function expand(speech) {
    var frequency = {}, order = [];
    speech.forEach(function (r) { words(r.text).forEach(function (raw) {
      var word = raw.toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(dictionary, word)) return;
      if (!frequency[word]) order.push(word);
      frequency[word] = (frequency[word] || 0) + 1;
    }); });
    return order.sort(function (a, b) { return frequency[b] - frequency[a]; }).slice(0, 2).map(function (word) {
      var v = dictionary[word];
      return { word: word, meaning_ko: v[0], synonyms: v[1].slice(0, 2), antonyms: v[2].slice(0, 2), example: v[3], source: 'curated_dictionary' };
    });
  }
  function questions(expansion) {
    // Fixed dictionary relations have unambiguous answers; no grammar judging.
    var out = [];
    expansion.forEach(function (v) {
      if (out.length < 3 && v.synonyms.length) out.push({ id: v.word + ':synonym', word: v.word, type: 'synonym', options: [v.synonyms[0], v.antonyms[0], 'slowly', 'yesterday'], answer: v.synonyms[0] });
      if (out.length < 3 && v.antonyms.length) out.push({ id: v.word + ':antonym', word: v.word, type: 'antonym', options: [v.antonyms[0], v.synonyms[0], 'slowly', 'yesterday'], answer: v.antonyms[0] });
    });
    return out;
  }
  function build(options) {
    var o = options || {}, bookingId = String(o.bookingId || ''), lang = language(o.language);
    var userRows = rows(o.learnerLog, bookingId, o.learnerId, 'learner');
    var partnerRows = rows(o.partnerLog, bookingId, o.partnerId, 'partner');
    var supported = lang === 'en';
    var count = function (speech) { return speech.reduce(function (n, r) { return n + words(r.text).length; }, 0); };
    var u = userRows || [], p = partnerRows || [];
    var learnerWords = supported && userRows ? count(u) : null;
    var partnerWords = supported && partnerRows ? count(p) : null;
    var ratio = learnerWords != null && partnerWords != null && learnerWords + partnerWords > 0 ? learnerWords / (learnerWords + partnerWords) : null;
    var ex = supported ? expressions(u) : [], expansion = supported ? expand(u) : [];
    var learnerVersion = userRows ? sourceVersion(bookingId, o.learnerLog.id, u) : '';
    var partnerVersion = partnerRows ? sourceVersion(bookingId, o.partnerLog.id, p) : '';
    var fingerprint = learner.contentFingerprint(bookingId, VERSION, [lang, learnerVersion, partnerVersion]);
    return { kind: 'conversation_recap', schema_version: 1, generator: VERSION, booking_id: bookingId, language: lang, supported: supported,
      source: { learner_log_id: userRows ? o.learnerLog.id : '', learner_version: learnerVersion, fingerprint: fingerprint, learner_available: !!userRows, partner_available: !!partnerRows },
      metrics: { user_word_count: learnerWords, user_utterance_count: userRows ? u.length : null, partner_word_count: partnerWords, partner_utterance_count: partnerRows ? p.length : null, user_participation_ratio: ratio },
      interpretation: ratio == null ? 'insufficient' : ratio >= 0.55 ? 'speaking' : ratio >= 0.35 ? 'balanced' : 'listening',
      comment: !supported ? 'unsupported' : !u.length || !learnerWords ? 'limited' : u.length >= 3 && learnerWords / u.length <= 4 ? 'short' : 'recorded',
      topics: supported ? topics(u.concat(p)) : [], expressions: ex, word_expansion: expansion,
      questions: questions(expansion), progress: { completed: 0, total: questions(expansion).length, reason: null }, ai: { status: 'not_required' } };
  }
  function saved(report) {
    var markers = (report && Array.isArray(report.feedback) ? report.feedback : []).filter(function (v) {
      return v && v.kind === 'conversation_recap' && v.generator === VERSION && v.schema_version === 1 && v.booking_id === report.booking_id && v.metrics && v.source;
    });
    return markers.length ? markers[markers.length - 1] : null;
  }
  function mergeFeedback(base, recap) {
    return (Array.isArray(base) ? base : []).filter(function (v) { return !v || v.generator !== VERSION; }).concat([recap]);
  }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  var copy = {
    ko: { title: '오늘의 대화 리캡', words: '내가 말한 양', utterances: '내가 말한 문장', participation: '대화 참여', missing: '기록 확인 중', ratioMissing: '두 사람의 기록이 필요해요', basis: '기록된 단어 기준 · 문장 수는 STT 발화 단위예요.', speaking: ['오늘은 많이 말했어요', '내 이야기를 길게 이어간 순간이 많았어요.'], balanced: ['균형 있게 대화했어요', '듣고 말하는 흐름이 자연스럽게 이어졌어요.'], listening: ['오늘은 많이 들었어요', '파트너 이야기를 충분히 듣고 반응하는 대화였어요.'], insufficient: ['기록된 발화를 돌아봐요', '참여 비율은 두 사람의 기록이 있을 때 표시돼요.'], limited: '기록된 발화가 많지 않아요.', short: '짧게 주고받는 대화가 많았어요.', recorded: '오늘 나눈 이야기를 기록했어요.', unsupported: '이 언어의 리캡은 아직 지원하지 않아요. 대화 기록은 그대로 보존돼요.', topics: '오늘 자주 나온 주제', expressions: '내가 실제로 쓴 표현', expansion: '단어 넓히기', synonyms: '비슷한 말', antonyms: '반대말', example: '예문', mini: '30초 리캡', help: 'AI 표현 도움에서 본 표현', helpNote: '클릭하거나 복사한 표현이에요. 실제로 말한 표현과는 구분해요.', completed: '완료', open: '30초 리캡 시작', me: '나', synonym: '와 가장 가까운 표현은?', antonym: '와 반대되는 표현은?', unavailable: '저장된 대화 기록을 확인할 수 없어요.' },
    en: { title: 'Today’s conversation recap', words: 'Words I said', utterances: 'My utterances', participation: 'Participation', missing: 'Checking the record', ratioMissing: 'Both records are needed', basis: 'Based on recorded words · utterances follow STT segments.', speaking: ['You shared a lot today', 'There were many moments when you continued your story.'], balanced: ['A balanced conversation', 'Listening and speaking flowed naturally.'], listening: ['You listened a lot today', 'You took time to listen and respond to your partner.'], insufficient: ['Looking back at your conversation', 'Participation needs both participants’ records.'], limited: 'There are only a few recorded utterances.', short: 'There were many short exchanges.', recorded: 'Your conversation is recorded.', unsupported: 'Recaps for this language are not supported yet. Your record is preserved.', topics: 'Topics that came up', expressions: 'Expressions I actually used', expansion: 'Explore your words', synonyms: 'Similar words', antonyms: 'Opposite words', example: 'Example', mini: '30-second recap', help: 'Expressions viewed in AI Word Help', helpNote: 'Expressions you clicked or copied, separate from what you actually said.', completed: 'completed', open: 'Start 30-second recap', me: 'Me', synonym: ': which expression has a similar meaning?', antonym: ': which expression has the opposite meaning?', unavailable: 'The saved conversation record is unavailable.' }
  };
  function labels(locale) { return copy[String(locale || '').toLowerCase() === 'ko' ? 'ko' : 'en']; }
  function render(recap, locale, options) {
    var r = recap, l = labels(locale), o = options || {};
    if (!r) return '<section class="dayo-recap"><h3>' + esc(l.title) + '</h3><p>' + esc(l.unavailable) + '</p></section>';
    var m = r.metrics, ratio = m.user_participation_ratio, percent = ratio == null ? null : Math.round(ratio * 100);
    var interpretation = l[r.interpretation] || l.insufficient;
    function section(title, html) { return html ? '<section class="recap-section"><h4>' + esc(title) + '</h4>' + html + '</section>' : ''; }
    function metric(title, value) { return '<div><span>' + esc(title) + '</span><strong>' + (Array.isArray(value) ? value.map(esc).join('<br>') : esc(value)) + '</strong></div>'; }
    function spokenMetric(value, unit) {
      var ko = String(locale).toLowerCase() === 'ko';
      return '<div class="recap-spoken"><strong>' + esc(value == null ? '—' : value + (ko ? (unit === 'words' ? '단어' : '번') : ' ' + unit)) + '</strong><span>' + (ko ? '말했어요' : 'spoken') + '</span></div>';
    }
    var html = '<section class="dayo-recap" data-recap-booking="' + esc(r.booking_id) + '">' + (o.hideTitle ? '' : '<h3>' + esc(l.title) + '</h3>');
    if (r.supported) {
      var ko = String(locale).toLowerCase() === 'ko';
      html += '<div class="recap-metrics">' + spokenMetric(m.user_word_count, 'words') + spokenMetric(m.user_utterance_count, 'turns') + metric(l.participation, percent == null ? (ko ? '기록 준비 중' : 'Record pending') : [(ko ? '나' : 'You') + ' ' + percent + '%', (ko ? '파트너' : 'Partner') + ' ' + (100 - percent) + '%']) + '</div>';
      html += '<div class="recap-interpretation"><h4>' + esc(interpretation[0]) + '</h4><p>' + esc(interpretation[1]) + '</p><small>' + esc(l[r.comment] || '') + '</small></div>';
      html += section(l.topics, (r.topics || []).slice(0, 3).map(function (t) { return '<span class="recap-chip">' + esc(String(locale).toLowerCase() === 'ko' ? t.ko : t.en) + '</span>'; }).join(''));
      html += section(l.expressions, (r.expressions || []).slice(0, 3).map(function (e) { return '<p class="recap-expression">“' + esc(e.text) + '”</p>'; }).join(''));
      html += section(l.expansion, (r.word_expansion || []).slice(0, 2).map(function (w) { return '<details class="recap-word"><summary><strong>' + esc(w.word) + '</strong> · ' + esc(w.meaning_ko) + '</summary><small>' + esc(l.synonyms + ': ' + w.synonyms.join(' · ')) + '<br>' + esc(l.antonyms + ': ' + w.antonyms.join(' · ')) + '<br>' + esc(l.example + ': ' + w.example) + '</small></details>'; }).join(''));
      var progress = r.progress || { completed: 0, total: 0 };
      if (progress.total) html += section(l.mini, '<p>' + esc(progress.completed + '/' + progress.total + ' ' + l.completed) + '</p>' + (o.interactive && !progress.reason ? '<button class="recap-primary" type="button" data-recap-start>' + esc(l.open) + '</button>' : ''));
    } else html += '<p>' + esc(l.unsupported) + '</p>';
    var help = (Array.isArray(o.wordHelp) ? o.wordHelp : []).filter(function (x) { return x && typeof x.text === 'string' && x.text; }).slice(-6);
    if (help.length) html += '<details class="recap-help"><summary>' + esc(l.help) + '</summary><p>' + help.map(function (x) { return esc(x.text); }).join(' · ') + '</p><small>' + esc(l.helpNote) + '</small></details>';
    return html + '</section>';
  }
  return { VERSION: VERSION, language: language, words: words, rows: rows, sourceVersion: sourceVersion, build: build, saved: saved, mergeFeedback: mergeFeedback, render: render, labels: labels, questions: questions };
});
