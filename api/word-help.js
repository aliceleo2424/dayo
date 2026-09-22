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
    phrases: cleanItems(parsed.phrases, 3)
  };
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
  if (!body || typeof body.context !== 'string') {
    json(res, 400, { error: 'invalid_context' });
    return;
  }
  var context = body.context.replace(/\s+/g, ' ').trim().slice(-1200);
  if (!context) {
    json(res, 400, { error: 'empty_context' });
    return;
  }

  var prompt = [
    'You help a Korean beginner continue a friendly English travel conversation.',
    'Use CEFR A1-A2 English only.',
    'Suggest exactly 3 easy words and exactly 3 short phrases connected to the recent context.',
    'Every item must be immediately useful in spoken conversation.',
    'Do not explain grammar, evaluate, correct, or use long sentences.',
    'Return JSON only with this shape:',
    '{"words":[{"text":"beautiful","ko":"아름다운"}],"phrases":[{"text":"I liked the food.","ko":"음식이 좋았어요."}]}',
    'Recent conversation:',
    context
  ].join('\n');

  var controller = new AbortController();
  var timeout = setTimeout(function () { controller.abort(); }, 7000);
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
