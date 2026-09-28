/* Vercel serverless: POST /api/word-help
 * Env: GEMINI_API_KEY (required)
 */
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body || '{}')); } catch (e) { return Promise.resolve({}); }
  }
  return new Promise(function (resolve) {
    var raw = '';
    req.on('data', function (chunk) {
      raw += chunk;
      if (raw.length > 16000) req.destroy();
    });
    req.on('end', function () {
      try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); }
    });
  });
}

function cleanItems(items, limit) {
  if (!Array.isArray(items)) return [];
  return items.map(function (item) {
    return {
      text: String(item && item.text || '').trim().slice(0, 80),
      ko: String(item && item.ko || '').trim().slice(0, 80)
    };
  }).filter(function (item) {
    return item.text && item.ko;
  }).slice(0, limit);
}

function parseGeminiJson(raw) {
  var text = String(raw || '').trim();
  var fenced = text.match(/\{[\s\S]*\}/);
  if (fenced) text = fenced[0];
  var parsed = JSON.parse(text);
  return {
    words: cleanItems(parsed.words, 3),
    phrases: cleanItems(parsed.phrases, 1)
  };
}

function cleanText(value, limit) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    json(res, 405, { error: 'method_not_allowed' });
    return;
  }

  var apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    json(res, 503, { error: 'ai_unavailable' });
    return;
  }

  var body = await readBody(req);
  var input = cleanText(body && (body.input || body.context), 300);
  if (!input) {
    json(res, 400, { error: 'empty_input' });
    return;
  }
  var language = ['en', 'es', 'fr', 'ko'].indexOf(body && body.language) !== -1 ? body.language : 'en';
  var languageName = { en: 'English', es: 'Spanish', fr: 'French', ko: 'Korean' }[language];
  var talkCard = body && body.talk_card && typeof body.talk_card === 'object' ? body.talk_card : {};
  var cardQuestionEn = cleanText(talkCard.question_en, 240);
  var cardQuestionKo = cleanText(talkCard.question_ko, 240);

  var prompt = [
    'You help a Korean beginner say one idea naturally during a friendly live conversation.',
    'Target conversation language: ' + languageName + ' (' + language + ').',
    'The learner may write their intent in Korean or the target language.',
    'Return 2 or 3 immediately useful target-language words or short expressions, plus exactly 1 short ready-to-say sentence.',
    'Give a concise Korean meaning for every item.',
    'Do not explain grammar, evaluate the learner, add study advice, or invent conversation facts.',
    'Keep the ready sentence easy to say and no longer than 18 words.',
    'Return JSON only with this shape:',
    '{"words":[{"text":"beautiful scenery","ko":"아름다운 경치"}],"phrases":[{"text":"The scenery was beautiful.","ko":"경치가 아름다웠어요."}]}',
    'What the learner wants to say:',
    input,
    'Current Talk Card (optional, use only as supporting context):',
    cardQuestionEn || cardQuestionKo ? [cardQuestionEn, cardQuestionKo].filter(Boolean).join(' / ') : '(none)'
  ].join('\n');

  var controller = new AbortController();
  var timeout = setTimeout(function () { controller.abort(); }, 4500);
  try {
    var response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' + encodeURIComponent(apiKey),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.45,
            maxOutputTokens: 280,
            responseMimeType: 'application/json'
          }
        })
      }
    );
    if (!response.ok) {
      var upstreamBody = await response.text();
      var upstreamCode = null;
      try {
        var upstreamError = JSON.parse(upstreamBody);
        upstreamCode = upstreamError && upstreamError.error &&
          (upstreamError.error.status || upstreamError.error.code) || null;
      } catch (e) { /* keep the raw body for server diagnostics */ }
      console.warn('[DayO Word Help] Gemini request failed:', {
        status: response.status,
        statusText: response.statusText,
        body: upstreamBody
      });
      json(res, 502, {
        error: 'generation_failed',
        upstream_status: response.status,
        upstream_code: upstreamCode
      });
      return;
    }
    var payload = await response.json();
    var generated = '';
    try {
      generated = payload.candidates[0].content.parts.map(function (part) {
        return part.text || '';
      }).join('');
    } catch (e) {
      generated = '';
    }
    var result = parseGeminiJson(generated);
    if (!result.words.length || !result.phrases.length) {
      json(res, 502, { error: 'empty_generation' });
      return;
    }
    json(res, 200, result);
  } catch (err) {
    console.warn('[DayO Word Help] request error:', err && err.name ? err.name : 'unknown');
    json(res, 502, { error: 'generation_failed' });
  } finally {
    clearTimeout(timeout);
  }
};
