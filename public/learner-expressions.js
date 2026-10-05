/* Shared learner-only transcript extraction for quiz and session review. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DayOLearnerExpressions = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function normalizeSentence(raw) {
    return String(raw || '')
      .replace(/[.,?!]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function utteranceText(row) {
    if (!row || typeof row !== 'object') return '';
    return String(row.text || row.transcript || row.message || '').trim();
  }

  function isLearnerRow(row) {
    return !!(row && typeof row === 'object' && String(row.speaker || '').toLowerCase() === 'learner');
  }

  function looksEnglish(text) {
    var value = String(text || '');
    var latin = (value.match(/[A-Za-z]/g) || []).length;
    var hangul = (value.match(/[\uAC00-\uD7A3]/g) || []).length;
    return latin >= 8 && latin > hangul;
  }

  function englishOnlyParts(text) {
    var parts = [];
    var current = [];
    function flush() {
      if (current.length) parts.push(current.join(' '));
      current = [];
    }
    String(text || '').split(/\s+/).filter(Boolean).forEach(function (token) {
      var hasLatin = /[A-Za-z]/.test(token);
      var hasNonLatinScript = /[\uAC00-\uD7A3\u3040-\u30FF\u3400-\u9FFF]/.test(token);
      if (hasLatin && !hasNonLatinScript) current.push(token);
      else flush();
    });
    flush();
    return parts;
  }

  function segmentText(raw) {
    var candidates = [];
    String(raw || '').split(/[.?!]+/).map(function (part) {
      return part.replace(/\s+/g, ' ').trim();
    }).filter(Boolean).forEach(function (sentence) {
      var clauses = [sentence];
      if (sentence.split(/\s+/).filter(Boolean).length > 10) {
        clauses = [];
        sentence.split(/\s+(?=(?:and|but|so|because|then)\b)/i).forEach(function (part) {
          var previous = clauses[clauses.length - 1];
          var combined = previous ? previous + ' ' + part : part;
          if (previous && combined.split(/\s+/).filter(Boolean).length <= 10) clauses[clauses.length - 1] = combined;
          else clauses.push(part);
        });
      }
      clauses.forEach(function (clause) {
        englishOnlyParts(clause).forEach(function (part) {
          var cleaned = normalizeSentence(part);
          var count = cleaned.split(/\s+/).filter(Boolean).length;
          if (cleaned && count >= 3 && count <= 10 && looksEnglish(cleaned)) candidates.push(cleaned);
        });
      });
    });
    return candidates;
  }

  function isQuizQualityCandidate(sentence) {
    var text = normalizeSentence(sentence);
    var words = text.split(' ').filter(Boolean);
    var fillers = { uh: true, um: true, hmm: true, ah: true, okay: true, yeah: true, yes: true, no: true };
    var sensitive = { cock: true, dick: true, fuck: true, shit: true, bitch: true };
    var commonVerbs = {
      am: true, is: true, are: true, was: true, were: true, be: true, been: true, being: true,
      do: true, does: true, did: true, "don't": true, "doesn't": true, "didn't": true,
      have: true, has: true, had: true, can: true, could: true, will: true, would: true,
      shall: true, should: true, may: true, might: true, must: true,
      go: true, goes: true, went: true, want: true, wants: true, wanted: true,
      like: true, likes: true, liked: true, love: true, loves: true, loved: true,
      think: true, thinks: true, thought: true, know: true, knows: true, knew: true,
      feel: true, feels: true, felt: true, see: true, sees: true, saw: true, seen: true,
      eat: true, eats: true, ate: true, make: true, makes: true, made: true,
      get: true, gets: true, got: true, visit: true, visits: true, visited: true,
      travel: true, travels: true, traveled: true, travelled: true, stay: true, stays: true, stayed: true,
      try: true, tries: true, tried: true, take: true, takes: true, took: true,
      meet: true, meets: true, met: true, work: true, works: true, worked: true,
      watch: true, watches: true, watched: true, wash: true, washes: true, washed: true,
      play: true, plays: true, played: true, talk: true, talks: true, talked: true,
      speak: true, speaks: true, spoke: true, say: true, says: true, said: true,
      tell: true, tells: true, told: true, live: true, lives: true, lived: true,
      enjoy: true, enjoys: true, enjoyed: true, need: true, needs: true, needed: true,
      recommend: true, recommends: true, book: true, books: true, booked: true,
      look: true, looks: true, looked: true, sound: true, sounds: true, sounded: true,
      taste: true, tastes: true, tasted: true
    };
    var allowedSingleLetter = { a: true, i: true };
    var allowedShortWords = {
      am: true, an: true, as: true, at: true, be: true, by: true, do: true, go: true,
      he: true, if: true, in: true, is: true, it: true, me: true, my: true, no: true,
      of: true, on: true, or: true, so: true, to: true, up: true, us: true, we: true
    };
    var fillerCount = 0;
    var abnormalCount = 0;
    var hasVerbClue = false;
    var seenWords = {};
    if (!looksEnglish(text) || words.length < 3 || words.length > 10) return false;
    if (/[\uAC00-\uD7A3\u3040-\u30FF\u3400-\u9FFF]/.test(text)) return false;
    words.forEach(function (word) {
      var clean = String(word || '').toLowerCase().replace(/[’]/g, "'").replace(/^[^a-z]+|[^a-z]+$/g, '');
      if (fillers[clean]) fillerCount += 1;
      if (sensitive[clean] || /^(?:fuck|shit|bitch|dick|cock)(?:s|ed|ing|y)?$/.test(clean)) abnormalCount = words.length;
      if (!/^[a-z]+(?:'[a-z]+)?$/.test(clean)) abnormalCount += 1;
      if (clean.length === 1 && !allowedSingleLetter[clean]) abnormalCount += 1;
      if (clean.length === 2 && !allowedShortWords[clean]) abnormalCount += 1;
      if (commonVerbs[clean] || /[a-z]{3,}(?:ed|ing)$/.test(clean)) hasVerbClue = true;
      if (clean) seenWords[clean] = true;
    });
    if (fillerCount >= 2 && fillerCount / words.length >= 0.5) return false;
    if (Object.keys(seenWords).length / words.length < 0.6) return false;
    if (abnormalCount / words.length > 0.25) return false;
    return hasVerbClue;
  }

  function extractExpressions(rows, options) {
    var settings = options || {};
    var limit = Math.max(0, Number(settings.limit == null ? 5 : settings.limit));
    var seen = {};
    var out = [];
    (Array.isArray(rows) ? rows : []).filter(isLearnerRow).forEach(function (row) {
      segmentText(utteranceText(row)).forEach(function (text) {
        var key = text.toLowerCase();
        if (out.length >= limit || seen[key]) return;
        if (settings.quizQuality && !isQuizQualityCandidate(text)) return;
        seen[key] = true;
        out.push(text);
      });
    });
    return out;
  }

  function representativeExpression(expressions) {
    return (expressions || []).reduce(function (best, text) {
      if (!best) return text;
      var words = text.toLowerCase().split(/\s+/).filter(Boolean);
      var bestWords = best.toLowerCase().split(/\s+/).filter(Boolean);
      var unique = new Set(words).size;
      var bestUnique = new Set(bestWords).size;
      if (unique !== bestUnique) return unique > bestUnique ? text : best;
      if (words.length !== bestWords.length) return words.length > bestWords.length ? text : best;
      return text.length > best.length ? text : best;
    }, '');
  }

  function quizScore(completed, total) {
    var count = Math.max(0, Number(completed) || 0);
    var size = Math.max(0, Number(total) || 0);
    return size ? Math.round(Math.min(count, size) / size * 100) : null;
  }

  function contentFingerprint(bookingId, source, questions) {
    var value = JSON.stringify([String(bookingId || ''), String(source || ''), questions || []]);
    var first = 2166136261;
    var second = 5381;
    for (var i = 0; i < value.length; i += 1) {
      first = Math.imul(first ^ value.charCodeAt(i), 16777619) >>> 0;
      second = (Math.imul(second, 33) ^ value.charCodeAt(i)) >>> 0;
    }
    return 'review-v2:' + first.toString(16).padStart(8, '0') + second.toString(16).padStart(8, '0');
  }

  function normalizeQuizState(saved, total, fingerprint) {
    var size = Math.max(0, Number(total) || 0);
    var source = saved && fingerprint && saved.fingerprint === fingerprint && Number(saved.total) === size ? saved : {};
    var startedAt = Number(source.startedAt);
    return {
      startedAt: Number.isFinite(startedAt) && startedAt > 0 ? startedAt : null,
      currentIndex: Math.min(Math.max(0, Number(source.currentIndex) || 0), size),
      completed: Math.min(Math.max(0, Number(source.completed) || 0), size),
      total: size,
      fingerprint: fingerprint || null,
      ended: source.ended === true,
      endReason: source.endReason || null
    };
  }

  function quizRemainingSeconds(startedAt, nowMs, durationSeconds) {
    if (!startedAt) return Math.max(0, Number(durationSeconds) || 0);
    var elapsed = Math.max(0, Math.floor((Number(nowMs) - Number(startedAt)) / 1000));
    return Math.max(0, (Number(durationSeconds) || 0) - elapsed);
  }

  function buildReviewData(rows, details) {
    var info = details || {};
    var expressions = extractExpressions(rows, { limit: 5 });
    var hasLearnerTranscript = (Array.isArray(rows) ? rows : []).some(function (row) {
      return isLearnerRow(row) && !!utteranceText(row);
    });
    var summary = expressions.length >= 3
      ? '오늘 대화에서 실제로 말한 표현 ' + expressions.length + '개를 기록했어요.'
      : expressions.length
        ? '오늘 대화에서 실제로 말한 표현을 기록했어요.'
        : hasLearnerTranscript
          ? '대화 기록은 저장됐지만 영어 학습 표현은 충분하지 않았어요.'
          : '이번 대화에서는 저장된 표현이 충분하지 않았어요.';
    return {
      summary: summary,
      key_expressions: expressions,
      quiz_score: info.quizScore == null ? null : Number(info.quizScore),
      word_help: Array.isArray(info.wordHelp) ? info.wordHelp.slice(-12) : [],
      feedback: Array.isArray(info.feedback) ? info.feedback.slice() : [],
      spoken_sentence: representativeExpression(expressions) || null
    };
  }

  return {
    normalizeSentence: normalizeSentence,
    utteranceText: utteranceText,
    isLearnerRow: isLearnerRow,
    isQuizQualityCandidate: isQuizQualityCandidate,
    extractExpressions: extractExpressions,
    representativeExpression: representativeExpression,
    quizScore: quizScore,
    normalizeQuizState: normalizeQuizState,
    contentFingerprint: contentFingerprint,
    quizRemainingSeconds: quizRemainingSeconds,
    buildReviewData: buildReviewData
  };
});
