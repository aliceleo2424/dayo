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
  // Existing Letter candidate anchors; displayed Recap stories use stricter evidence below.
  var anchors = [
    ['cafe', '카페와 커피', 'Cafés & coffee', /\b(caf[eé]s?|coffee|latte|espresso|cappuccino)\b/i],
    ['flavor', '맛과 취향', 'Flavors', /\b(flavo[u]?rs?|sweet|spicy|vanilla)\b/i],
    ['rabbit', '토끼', 'Rabbits', /\brabbits?\b/i],
    ['pets', '반려동물', 'Pets', /\b(pets?|dogs?|cats?)\b/i],
    ['food', '음식과 요리', 'Food & cooking', /\b(food|foods|cook|cooking|dumplings?|noodles?|recipes?|restaurants?)\b/i],
    ['travel', '여행', 'Travel', /\b(travel|traveled|travelled|trips?|vacation|flights?|hotels?)\b/i],
    ['music', '음악', 'Music', /\b(music|concerts?|guitar|piano)\b/i],
    ['movies', '영화', 'Movies', /\b(movies?|cinema|films?)\b/i],
    ['work', '일과 일상', 'Work & daily life', /\b(work|working|office|colleagues?|career)\b/i],
    ['exercise', '운동', 'Exercise', /\b(exercise|gym|running|cycling|swimming|tennis|soccer|yoga)\b/i]
  ];
  function meaningful(r) {
    if (!r || !r.id || !r.text || r.text.length > 240 || /@|https?:|www\.|[<>�]/i.test(r.text)) return false;
    if (greeting(r.text) || brokenASR(r.text)) return false;
    var tokens=words(r.text).map(function(w){return w.toLowerCase();}),fillers=tokens.filter(function(w){return /^(uh|um|hmm|ah|yeah|okay)$/.test(w);});
    return tokens.length>=3 && tokens.length<=45 && new Set(tokens).size/tokens.length>=.55 && fillers.length/Math.max(1,tokens.length)<.4 && /\b(am|is|are|was|were|have|has|had|went|go|goes|like|likes|love|loves|enjoy|enjoyed|feel|feels|makes?|order|ordered|cook|cooking|can|could|want|wanted|visit|visited|travel|traveled|travelled|work|working|watch|watched|play|played|\w{3,}(?:ed|ing))\b/i.test(r.text);
  }
  function topics(speech) {
    var safe = speech.filter(meaningful);
    return anchors.map(function (a) {
      var matches = safe.filter(function (r) { return a[3].test(r.text); });
      return {key:a[0], ko:a[1], en:a[2], count:matches.length,
        source_utterance_ids:matches.filter(function (r) { return r.speaker === 'learner'; }).map(function (r) { return r.id; })};
    }).filter(function (t) { return t.count; }).sort(function (a,b) { return b.count-a.count; }).slice(0,3);
  }
  function expressions(speech, options) {
    var safe = speech.filter(meaningful), seen = new Set();
    // Prefer story-bearing speech over greetings/fragments; never edit the text.
    var ranked = safe.map(function (r,i) { return {r:r,i:i,score:(options && options.linkedIds && options.linkedIds.has(r.id) ? 100 : 0)+anchors.filter(function (a) { return a[3].test(r.text); }).length*10 + Math.min(words(r.text).length,12)}; })
      .sort(function (a,b) { return b.score-a.score || a.i-b.i; });
    var selected = [];
    ranked.forEach(function (item) {
      var r=item.r, key=r.text.toLowerCase().replace(/[^a-zà-ž ]/g,'').trim();
      if (seen.has(key) || selected.length >= 3) return;
      var tokens=new Set(words(key).filter(function (w) { return !common.has(w); }));
      if (selected.some(function (x) { var other=new Set(words(x.text.toLowerCase()).filter(function (w) { return !common.has(w); }));
        var overlap=Array.from(tokens).filter(function (w) { return other.has(w); }).length;
        return overlap / Math.max(1,Math.min(tokens.size,other.size)) >= .8; })) return;
      seen.add(key); selected.push(r);
    });
    return selected.map(function (r) { return {text:r.text,source_utterance_id:r.id,source_timestamp:r.timestamp}; });
  }


  function letterTopics(speech) {
    var safe=speech.filter(function(r){return r.speaker==='learner'&&meaningful(r)&&!greeting(r.text)&&!brokenASR(r.text);});
    var grouped=stories(safe,{interests:[],cards:[]},'letter_source',{}),chosen=new Set();
    return grouped.map(function(t){
      var candidates=safe.filter(function(r){return t.source_utterance_ids.includes(r.id);}),first=expressions(candidates)[0];
      if(!first||chosen.has(first.source_utterance_id))return null;
      chosen.add(first.source_utterance_id);
      return {id:first.source_utterance_id,label:t.en,quote:first.text,source_utterance_ids:t.source_utterance_ids};
    }).filter(Boolean).slice(0,3);
  }

  var STORY_VERSION = 'transcript_stories_v3';
  var storyRules = [
    ['food_cafe','맛집·카페','Food & cafés',/\b(caf[eé]s?|coffee|latte|espresso|cappuccino|food|foods|restaurants?|cook|cooking|noodles?|dumplings?|recipes?|flavo[u]?rs?|sweet|spicy|vanilla)\b/i],
    ['pets','반려동물','Pets',/\b(pets?|dogs?|cats?|rabbits?|animals?)\b/i],
    ['travel','여행','Travel',/\b(travel|traveled|travelled|trips?|vacation|flights?|hotels?|airport)\b/i],
    ['music','음악','Music',/\b(music|songs?|concerts?|guitar|piano|jazz)\b/i],
    ['movies','영화','Movies',/\b(movies?|cinema|films?)\b/i],
    ['drama','드라마','Drama',/\b(dramas?|series|episodes?)\b/i],
    ['youtube','유튜브','YouTube',/\byoutube\b/i],
    ['exercise','운동','Exercise',/\b(exercise|gym|running|cycling|swimming|tennis|soccer|yoga)\b/i],
    ['games','게임','Gaming',/\b(games?|gaming|videogames?)\b/i],
    ['fashion_beauty','패션·뷰티','Fashion & beauty',/\b(fashion|makeup|cosmetics?|skincare)\b/i],
    ['books_webtoon','책·웹툰','Books & webtoons',/\b(books?|novels?|webtoons?)\b/i],
    ['work_school','일·학교','Work & school',/\b(work|working|office|colleagues?|career|school|university|college|homework)\b/i]
  ];
  function normalizeSpeech(s) { return words(s).join(' ').toLowerCase(); }
  function greeting(s) {
    return /^(?:(?:hello|hi|hey|nice to meet you|how are you|goodbye|bye|see you|thank you|thanks|good morning|good afternoon|good evening)[\s,.!?]*)+$/i.test(s.trim());
  }
  function brokenASR(s) {
    // A music/proper-name token combined with an installation predicate is not
    // evidence of a music conversation. Preserve raw speech; never guess a place.
    return /\b(?:songs?|music)\b.{0,50}\b(?:is|are|was|were)\s+(?:installed|install)\b/i.test(s) && !/\b(?:app|software|program|computer|phone|player)\b/i.test(s);
  }

  function stories(speech, context, version, logIds) {
    var seen = new Set(), safe = speech.filter(meaningful).filter(function(r) {
      var key = normalizeSpeech(r.text); if(seen.has(key)) return false; seen.add(key); return true;
    });
    return storyRules.map(function(rule,index) {
      var matches = safe.filter(function(r){return rule[3].test(r.text);});
      var clear = matches.some(function(r) {
        return words(r.text).length >= 6 && /\b(?:i|we|my|our)\b/i.test(r.text) && /\b(?:went|visit|visited|order|ordered|cook|cooking|watch|watched|read|listen|listened|play|played|travel|traveled|travelled|go|work|working|love|like|enjoy|enjoyed|favorite)\b/i.test(r.text);
      });
      if (matches.length < 2 && !clear) return null;
      // Attach only nearby explicit referential follow-ups to a grounded café story.
      if (rule[0] === 'food_cafe') safe.forEach(function(r){
        if (!/^(?:it|the cafe|the coffee|that cafe|that coffee)\s+(?:was|is|were|tastes?|feels?)/i.test(r.text) || matches.includes(r)) return;
        if (matches.some(function(m){var d=Date.parse(r.timestamp)-Date.parse(m.timestamp);return d>=0&&d<=45000&&/\b(caf[eé]|coffee)\b/i.test(m.text);})) matches.push(r);
      });
      var cardIds = context.cards.filter(function(c){return c.keys.includes(rule[0]);}).map(function(c){return c.id;});
      return {key:rule[0],ko:rule[1],en:rule[2],count:matches.length,
        supporting_utterance_ids:matches.map(function(r){return r.id;}),
        supporting_roles:Array.from(new Set(matches.map(function(r){return r.speaker;}))),
        supporting_sources:matches.map(function(r){return {utterance_id:r.id,role:r.speaker,log_id:logIds[r.speaker]};}),
        source_utterance_ids:matches.filter(function(r){return r.speaker==='learner';}).map(function(r){return r.id;}),
        card_ids:Array.from(new Set(cardIds)),source_version:version,
        candidate_source:context.interests.includes(rule[0])?'booking_snapshot':cardIds.length?'session_card':'transcript',
        candidate_order:context.interests.includes(rule[0])?context.interests.indexOf(rule[0]):cardIds.length?4:5,index:index};
    }).filter(Boolean).sort(function(a,b){return a.candidate_order-b.candidate_order||b.count-a.count||a.index-b.index;}).slice(0,3).map(function(t){delete t.candidate_order;delete t.index;return t;});
  }
  function storyExpressions(speech, topics, logId, version) {
    var linked = new Set(topics.flatMap(function(t){return t.source_utterance_ids;}));
    var content = expressions(speech,{linkedIds:linked}).sort(function(a,b){return Number(linked.has(b.source_utterance_id))-Number(linked.has(a.source_utterance_id));});
    // Greetings are low-priority fallback, never a substitute for content.
    if(content.length<3) speech.forEach(function(r){if(content.length<3 && r.id && greeting(r.text) && !content.some(function(e){return normalizeSpeech(e.text)===normalizeSpeech(r.text);})) content.push({text:r.text,source_utterance_id:r.id,source_timestamp:r.timestamp,greeting_fallback:true});});
    return content.slice(0,3).map(function(e){return Object.assign({},e,{source_log_id:logId,source_role:'learner',source_version:version,topic_keys:topics.filter(function(t){return t.source_utterance_ids.includes(e.source_utterance_id);}).map(function(t){return t.key;})});});
  }
  function renderActions(recap, locale) {
    var l=labels(locale),done=recap && recap.progress && recap.progress.reason;
    return '<div class="recap-actions">'+(recap && recap.questions && recap.questions.length ? '<button type="button" class="recap-primary" '+(done?'data-recap-review':'data-recap-start')+'>'+esc(done?l.review:l.open)+'</button>':'')+'<button type="button" class="recap-primary" data-recap-home>'+esc(l.home)+'</button></div>';
  }
  function quizWordKey(value) {
    return typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() : '';
  }
  function expand(speech, excludedWords) {
    var excluded = new Set((Array.isArray(excludedWords) ? excludedWords : []).map(quizWordKey));
    var frequency = {}, order = [];
    speech.forEach(function (r) { words(r.text).forEach(function (raw) {
      var word = raw.toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(dictionary, word)) return;
      if (!frequency[word]) order.push(word);
      frequency[word] = (frequency[word] || 0) + 1;
    }); });
    return order.sort(function (a, b) { return frequency[b] - frequency[a]; }).filter(function (word) { return !excluded.has(quizWordKey(word)) && dictionary[word][1].length && dictionary[word][2].length; }).slice(0, 3).map(function (word) {
      var v = dictionary[word];
      return { word: word, meaning_ko: v[0], synonyms: v[1].slice(0, 2), antonyms: v[2].slice(0, 2), example: v[3], source: 'curated_dictionary', source_utterance_ids: speech.filter(function (r) { return words(r.text).map(function (w) { return w.toLowerCase(); }).includes(word); }).map(function (r) { return r.id; }) };
    });
  }
  function questions(expansion) {
    // Fixed dictionary relations have unambiguous answers; no grammar judging.
    var out = [];
    expansion.slice(0, 3).forEach(function (v) {
      if (!v.synonyms.length || !v.antonyms.length) return;
      if (out.length < 6) out.push({ id: v.word + ':synonym', word: v.word, type: 'synonym', options: [v.synonyms[0], v.antonyms[0], 'slowly', 'yesterday'], answer: v.synonyms[0] });
      if (out.length < 6) out.push({ id: v.word + ':antonym', word: v.word, type: 'antonym', options: [v.antonyms[0], v.synonyms[0], 'slowly', 'yesterday'], answer: v.antonyms[0] });
    });
    return out;
  }
  function volumeHistory(history, bookingId, count, scheduledAt) {
    var seen = new Set();
    var prior = (Array.isArray(history) ? history : []).filter(function (item) {
      if (!item || item.booking_id === bookingId || seen.has(item.booking_id) || !item.booking_id || !Number.isFinite(Date.parse(item.scheduled_at)) || !Number.isInteger(item.word_count) || item.word_count < 0) return false;
      seen.add(item.booking_id); return true;
    }).sort(function (a, b) { return Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at); }).slice(-4)
      .map(function (item) { return { booking_id: String(item.booking_id), scheduled_at: item.scheduled_at, word_count: item.word_count }; });
    if (Number.isInteger(count) && count >= 0) prior.push({ booking_id: bookingId, scheduled_at: Number.isFinite(Date.parse(scheduledAt)) ? scheduledAt : '', word_count: count });
    return prior;
  }
  function quizDuration(total) { return Math.min(90, Math.max(30, Math.ceil(total) * 15)); }
  // Record adequacy, not ASR accuracy or whole-call speaking time.
  // Require substantive, distinct speech on BOTH exact participant logs.
  function ratioQuality(userRows, partnerRows, userLog, partnerLog, fingerprint) {
    function adequate(speech, log) {
      if (!speech || !log || speech.length < 3 || speech.length < log.transcript.length * .8) return false;
      var total = speech.reduce(function(n,r){return n+words(r.text).length;},0), seen = new Set();
      var content = speech.filter(meaningful).filter(function(r){var key=normalizeSpeech(r.text);if(seen.has(key))return false;seen.add(key);return true;});
      var substantive = content.reduce(function(n,r){return n+words(r.text).length;},0);
      return total >= 20 && content.length >= 3 && substantive >= 20 && substantive >= total * .5;
    }
    var eligible = adequate(userRows,userLog) && adequate(partnerRows,partnerLog);
    if (eligible) {
      var times = function(speech){return speech.map(function(r){return Date.parse(r.timestamp);});};
      var u=times(userRows),p=times(partnerRows);
      eligible = Math.max(Math.min.apply(null,u),Math.min.apply(null,p)) <= Math.min(Math.max.apply(null,u),Math.max.apply(null,p)) + 60000;
    }
    return {version:1,eligible:!!eligible,source_fingerprint:fingerprint};
  }
  function renderRatio(r, locale) {
    var q=r.ratio_quality,m=r.metrics || {},s=r.source || {};
    if (!r.supported || !q || q.version!==1 || q.eligible!==true || q.source_fingerprint!==s.fingerprint || !s.fingerprint || !s.learner_available || !s.partner_available || !Number.isInteger(m.user_word_count) || !Number.isInteger(m.partner_word_count) || m.user_word_count<20 || m.partner_word_count<20 || m.user_utterance_count<3 || m.partner_utterance_count<3) return '';
    var ratio=m.user_word_count/(m.user_word_count+m.partner_word_count),percent=Math.round(ratio*100),ko=String(locale).toLowerCase()==='ko';
    var line=ko ? (ratio>=.6?'오늘은 내 이야기를 활발히 했어요!':ratio>=.45?'서로 이야기를 잘 주고받았어요.':ratio>=.3?'상대방 이야기에 귀 기울인 대화였어요.':'이번에는 많이 들었네요.') : (ratio>=.6?'You shared your stories actively today!':ratio>=.45?'You took turns sharing your stories.':ratio>=.3?'You spent more time listening to your partner.':'You listened a lot this time.');
    var me=(ko?'나':'Me')+' '+percent+'%',partner='Partner '+(100-percent)+'%';
    return '<div class="recap-ratio"><p>'+esc(line)+'</p><div class="recap-ratio-labels"><span>'+esc(me)+'</span><span>'+esc(partner)+'</span></div><div class="recap-ratio-bar" role="img" aria-label="'+esc(me+' / '+partner)+'"><span style="width:'+percent+'%"></span></div></div>';
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
    var expansion = supported && o.quizHistoryStatus !== 'unavailable' ? expand(u, o.quizExcludedWords) : [];
    var learnerVersion = userRows ? sourceVersion(bookingId, o.learnerLog.id, u) : '';
    var partnerVersion = partnerRows ? sourceVersion(bookingId, o.partnerLog.id, p) : '';
    var fingerprint = learner.contentFingerprint(bookingId, VERSION, [lang, learnerVersion, partnerVersion]);
    var context = {interests:[],cards:[]};
    var storyVersion = learner.contentFingerprint(bookingId,STORY_VERSION,[learnerVersion,partnerVersion,context]);
    var displayed = supported ? stories(u.concat(p),context,storyVersion,{learner:o.learnerLog && o.learnerLog.id,partner:o.partnerLog && o.partnerLog.id}) : [];
    var ex = supported ? storyExpressions(u,displayed,o.learnerLog && o.learnerLog.id,storyVersion) : [];
    return { kind: 'conversation_recap', schema_version: 1, generator: VERSION, booking_id: bookingId, language: lang, supported: supported,
      source: { learner_log_id: userRows ? o.learnerLog.id : '', learner_version: learnerVersion, fingerprint: fingerprint, learner_available: !!userRows, partner_available: !!partnerRows },
      metrics: { user_word_count: learnerWords, user_utterance_count: userRows ? u.length : null, partner_word_count: partnerWords, partner_utterance_count: partnerRows ? p.length : null, user_participation_ratio: ratio },
      volume_history: o.isTestSession ? [] : volumeHistory(o.history, bookingId, learnerWords, o.scheduledAt), volume_history_status: o.isTestSession ? 'test_session' : o.historyStatus || (Array.isArray(o.history) ? 'available' : 'unavailable'), volume_previous: o.previousVolume || null,
      // Capture coverage is unknown: stored ratios are analytical, never speaking/listening grades.
      interpretation: 'insufficient', quality_version: 3, story_source_version: storyVersion,
      ratio_quality: ratioQuality(supported?userRows:null,supported?partnerRows:null,o.learnerLog,o.partnerLog,fingerprint),
      comment: !supported ? 'unsupported' : !u.length || !learnerWords ? 'limited' : u.length >= 3 && learnerWords / u.length <= 4 ? 'short' : 'recorded',
      topics: displayed, expressions: ex, word_expansion: expansion,
      ...(o.quizHistoryStatus ? { quiz_history_status: o.quizHistoryStatus } : {}),
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
    ko: { title: '오늘의 대화 기록', words: '내가 말한 양', utterances: '내가 말한 문장', participation: '대화 참여', missing: '기록 확인 중', ratioMissing: '두 사람의 기록이 필요해요', basis: '기록된 단어 기준 · 문장 수는 STT 발화 단위예요.', speaking: ['오늘은 많이 말했어요', '내 이야기를 길게 이어간 순간이 많았어요.'], balanced: ['균형 있게 대화했어요', '듣고 말하는 흐름이 자연스럽게 이어졌어요.'], listening: ['오늘은 많이 들었어요', '파트너 이야기를 충분히 듣고 반응하는 대화였어요.'], insufficient: ['기록된 발화를 돌아봐요', '참여 비율은 두 사람의 기록이 있을 때 표시돼요.'], limited: '기록된 발화가 많지 않아요.', short: '짧게 주고받는 대화가 많았어요.', recorded: '오늘 나눈 이야기를 기록했어요.', unsupported: '이 언어의 리캡은 아직 지원하지 않아요. 대화 기록은 그대로 보존돼요.', topics: '오늘의 이야기', expressions: '내가 실제로 쓴 표현', expansion: '대화에서 만난 단어', synonyms: '비슷한 말', antonyms: '반대말', example: '예문', mini: '오늘의 단어 퀴즈', help: 'AI 표현 도움에서 본 표현', helpNote: '클릭하거나 복사한 표현이에요. 실제로 말한 표현과는 구분해요.', completed: '완료', open: '단어 퀴즈 도전', review: '퀴즈 다시 보기', home: '마이페이지', me: '나', synonym: '와 가장 가까운 표현은?', antonym: '와 반대되는 표현은?', unavailable: '저장된 대화 기록을 확인할 수 없어요.' },
    en: { title: 'Today’s conversation recap', words: 'Words I said', utterances: 'My utterances', participation: 'Participation', missing: 'Checking the record', ratioMissing: 'Both records are needed', basis: 'Based on recorded words · utterances follow STT segments.', speaking: ['You shared a lot today', 'There were many moments when you continued your story.'], balanced: ['A balanced conversation', 'Listening and speaking flowed naturally.'], listening: ['You listened a lot today', 'You took time to listen and respond to your partner.'], insufficient: ['Looking back at your conversation', 'Participation needs both participants’ records.'], limited: 'There are only a few recorded utterances.', short: 'There were many short exchanges.', recorded: 'Your conversation is recorded.', unsupported: 'Recaps for this language are not supported yet. Your record is preserved.', topics: 'Topics that came up', expressions: 'Expressions I actually used', expansion: 'Words from your conversation', synonyms: 'Similar words', antonyms: 'Opposite words', example: 'Example', mini: 'Today’s word quiz', help: 'Expressions viewed in AI Word Help', helpNote: 'Expressions you clicked or copied, separate from what you actually said.', completed: 'completed', open: 'Try the word quiz', review: 'Review the quiz', home: 'My Page', me: 'Me', synonym: ': which expression has a similar meaning?', antonym: ': which expression has the opposite meaning?', unavailable: 'The saved conversation record is unavailable.' }
  };
  function labels(locale) { return copy[String(locale || '').toLowerCase() === 'ko' ? 'ko' : 'en']; }
  function renderVolume(r, locale) {
    var ko = String(locale).toLowerCase() === 'ko', count = r.metrics.user_word_count;
    var history = r.volume_history_status === 'test_session' ? [] : volumeHistory(r.volume_history, r.booking_id, count, (r.volume_history || []).find(function (x) { return x.booking_id === r.booking_id; })?.scheduled_at);
    var previous = r.volume_previous ? r.volume_previous.word_count : history.length > 1 ? history[history.length - 2].word_count : null;
    var previousMissing = r.volume_previous && previous == null;
    var delta = previous == null ? null : count - previous;
    var html = '<section class="recap-volume recap-section"><h4>' + (ko ? '내 대화량' : 'My conversation volume') + '</h4><div class="recap-metrics">' +
      '<div class="recap-spoken"><strong>' + esc(count == null ? '—' : count + (ko ? '단어' : ' words')) + '</strong><span>' + (ko ? '말했어요' : 'spoken') + '</span></div></div>';
    html += '<p class="recap-volume-change">' + (delta == null ? (r.volume_history_status === 'test_session' ? (ko ? 'TEST 세션은 성장 추이에 포함하지 않아요.' : 'TEST sessions are not included in your progress trend.') : previousMissing ? (ko ? '직전 완료 세션의 발화 기록이 없어 비교할 수 없어요.' : 'Your previous completed session has no comparable speech record.') : r.volume_history_status !== 'available' ? (ko ? '이전 기록을 불러오지 못했어요.' : 'Previous records are unavailable.') : (ko ? '첫 기록이에요' : 'Your first record')) : (ko ? '직전 완료 세션 대비 ' : 'Since your previous completed session: ') + (delta > 0 ? '+' : '') + delta + (ko ? '단어' : ' words')) + '</p>';
    if (history.length > 1) {
      var max = Math.max(1, ...history.map(function (item) { return item.word_count; }));
      var pts = history.map(function (item, i) { return { x: 12 + i * 256 / (history.length - 1), y: 68 - item.word_count / max * 56 }; });
      var caption = (ko ? '최근 기록 · 최대 5개 세션' : 'Recent records · up to 5 sessions');
      html += '<svg class="recap-volume-chart" viewBox="0 0 280 84" role="img" aria-label="' + esc(caption + ': ' + history.map(function (x) { return x.word_count; }).join(' → ')) + '"><path class="recap-volume-axis" d="M12 68H268"/><polyline points="' + pts.map(function (p) { return p.x + ',' + p.y; }).join(' ') + '"/>' + pts.map(function (p) { return '<circle cx="' + p.x + '" cy="' + p.y + '" r="3.5"/>'; }).join('') + '</svg><small>' + esc(caption) + '</small>';
    }
    return html + renderRatio(r,locale) + '<small class="recap-volume-basis">' + (ko ? '음성으로 기록된 대화를 기준으로 보여드려요.' : 'Counts words in your saved English transcript. Speech that was not captured is not counted.') + '</small></section>';
  }
  function render(recap, locale, options) {
    var r = recap, l = labels(locale), o = options || {};
    if (!r) return '<section class="dayo-recap"><h3>' + esc(l.title) + '</h3><p>' + esc(l.unavailable) + '</p></section>';
    function section(title, html) { return html ? '<section class="recap-section"><h4>' + esc(title) + '</h4>' + html + '</section>' : ''; }
    var html = '<section class="dayo-recap" data-recap-booking="' + esc(r.booking_id) + '">' + (o.hideTitle ? '' : '<h3>' + esc(l.title) + '</h3>');
    if (r.supported) {
      var ko = String(locale).toLowerCase() === 'ko';

      if(r.comment !== 'recorded') html += '<div class="recap-interpretation"><p>'+esc(l[r.comment] || '')+'</p></div>';
      // Old unverified topic/quote markers are not silently promoted as evidence.
      var displayed = r.quality_version === 3 ? (r.topics || []).filter(function(t){return t.source_version===r.story_source_version && t.supporting_utterance_ids && t.supporting_utterance_ids.length;}).slice(0,3) : [];
      var quotes = r.quality_version === 3 ? (r.expressions || []).filter(function(e){return e.source_role==='learner' && e.source_log_id===r.source.learner_log_id && e.source_version===r.story_source_version && !brokenASR(e.text);}).slice(0,3) : [];
      var used = new Set();
      html += section(l.topics,displayed.map(function(t){
        var related = quotes.filter(function(e){return !used.has(e.source_utterance_id) && (e.topic_keys || []).includes(t.key) && t.source_utterance_ids.includes(e.source_utterance_id);});
        related.forEach(function(e){used.add(e.source_utterance_id);});
        return '<div class="recap-story"><span class="recap-chip">'+esc(ko?t.ko:t.en)+'</span>'+related.map(function(e){return '<p class="recap-expression">“'+esc(e.text)+'”</p>';}).join('')+'</div>';
      }).join(''));
      html += section(l.expressions,quotes.filter(function(e){return !used.has(e.source_utterance_id);}).map(function(e){return '<p class="recap-expression">“'+esc(e.text)+'”</p>';}).join(''));
      html += renderVolume(r, locale);
      var progress = r.progress || { completed: 0, total: 0 };
      if ((r.questions || []).length && progress.total) {
        var quizCopy = progress.reason==='completed' && progress.completed===progress.total ? (ko?'단어 퀴즈 완료':'Word quiz completed')+' · '+progress.completed+'/'+progress.total : progress.total+(ko?'문제':' questions')+(progress.completed?' · '+progress.completed+'/'+progress.total+' '+l.completed:'');
        var vocabulary = (r.word_expansion || []).slice(0,2).map(function(v){
          var quote=quotes.find(function(e){return !e.greeting_fallback && (v.source_utterance_ids || []).includes(e.source_utterance_id) && words(e.text).some(function(w){return w.toLowerCase()===v.word;});});
          return '<div class="recap-word"><strong>'+esc(v.word)+'</strong>'+(ko?'<span> · '+esc(v.meaning_ko)+'</span>':'')+
            '<p>'+esc(l.synonyms)+': '+esc((v.synonyms||[]).slice(0,2).join(' · '))+'</p><p>'+esc(l.antonyms)+': '+esc((v.antonyms||[]).slice(0,2).join(' · '))+'</p>'+
            (quote?'<small>'+(ko?'오늘 대화에서':'From today’s conversation')+'</small><p class="recap-word-quote">“'+esc(quote.text)+'”</p>':'')+'</div>';
        }).join('');
        html += '<section class="recap-section recap-quiz"><h4>'+esc(l.mini)+'</h4><p>'+esc(quizCopy)+'</p>'+vocabulary+(o.interactive && !o.hideQuizAction && !progress.reason ? '<button class="recap-primary" type="button" data-recap-start>'+esc(l.open)+'</button>':'')+'</section>';
      }
    } else html += '<p>' + esc(l.unsupported) + '</p>';
    var help = (Array.isArray(o.wordHelp) ? o.wordHelp : []).filter(function (x) { return x && typeof x.text === 'string' && x.text; }).slice(-6);
    if (help.length) html += '<details class="recap-help"><summary>' + esc(l.help) + '</summary><p>' + help.map(function (x) { return esc(x.text); }).join(' · ') + '</p><small>' + esc(l.helpNote) + '</small></details>';
    return html + '</section>';
  }
  return { VERSION: VERSION, quizWordKey: quizWordKey, language: language, words: words, rows: rows, sourceVersion: sourceVersion, build: build, letterTopics: letterTopics, saved: saved, mergeFeedback: mergeFeedback, render: render, renderActions: renderActions, renderRatio: renderRatio, labels: labels, questions: questions, quizDuration: quizDuration, volumeHistory: volumeHistory };
});
