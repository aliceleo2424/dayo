/* Vercel serverless: POST /api/partner-question
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
      if (raw.length > 24000) req.destroy();
    });
    req.on('end', function () {
      try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); }
    });
  });
}

function cleanText(value, limit) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function cleanList(value, limit, itemLimit) {
  if (!Array.isArray(value)) return [];
  return value.map(function (item) { return cleanText(item, itemLimit); }).filter(Boolean).slice(0, limit);
}

function cleanQuestions(items) {
  if (!Array.isArray(items)) return [];
  return items.map(function (item) {
    return {
      en: cleanText(item && (item.en || item.question || item.text), 180),
      ko: cleanText(item && (item.ko || item.translation || item.meaning), 180)
    };
  }).filter(function (item) { return item.en; }).slice(0, 3);
}

function parseGeminiJson(raw) {
  var text = String(raw || '').trim();
  var fenced = text.match(/\{[\s\S]*\}/);
  if (fenced) text = fenced[0];
  var parsed = JSON.parse(text);
  return cleanQuestions(Array.isArray(parsed) ? parsed : (parsed.questions || parsed.items));
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

  var apiKey = cleanText(process.env.GEMINI_API_KEY, 300);
  if (!apiKey) {
    json(res, 503, { error: 'ai_unavailable' });
    return;
  }

  var body = await readBody(req);
  var card = body && body.talk_card && typeof body.talk_card === 'object' ? body.talk_card : {};
  var brief = body && body.brief && typeof body.brief === 'object' ? body.brief : {};
  var context = {
    language: ['en', 'es', 'fr', 'ko'].indexOf(body && body.language) !== -1 ? body.language : 'en',
    talk_card: {
      question_en: cleanText(card.question_en, 240),
      question_ko: cleanText(card.question_ko, 240),
      followups_en: cleanList(card.followups_en, 4, 180),
      followups_ko: cleanList(card.followups_ko, 4, 180)
    },
    conversation_brief: {
      purposes: cleanList(brief.purposes, 4, 80),
      interests: cleanList(brief.interests, 4, 80),
      chat_style: cleanText(brief.chat_style, 80),
      chat_request: cleanText(brief.chat_request, 300),
      partner_preference: cleanText(brief.partner_preference, 120)
    },
    previous_questions: cleanList(body && body.previous_questions, 6, 180)
  };
  if (!context.talk_card.question_en && !context.talk_card.question_ko &&
      !context.conversation_brief.interests.length && !context.conversation_brief.chat_request) {
    json(res, 400, { error: 'empty_context' });
    return;
  }

  var prompt = [
    'You help a friendly conversation partner keep a DayO 1:1 conversation moving.',
    'Generate 2 or 3 short, natural questions that a beginner can answer easily.',
    'Write each question in the target language identified by context.language; keep the JSON key "en" for compatibility and use "ko" for its Korean meaning.',
    'Prioritize the current Talk Card, then the safe conversation brief.',
    'Do not claim the learner said anything. No learner transcript is provided.',
    'Avoid academic wording, long questions, advice, evaluation, or sensitive inferences.',
    'Do not repeat previous_questions.',
    'Return JSON only: {"questions":[{"en":"...","ko":"..."}]}',
    'Trusted context:',
    JSON.stringify(context)
  ].join('\n');

  var controller = new AbortController();
  var timeout = setTimeout(function () { controller.abort(); }, 4500);
  try {
    var model = cleanText(process.env.GEMINI_MODEL, 80) || 'gemini-3.6-flash';
    var response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.72,
            maxOutputTokens: 280,
            responseMimeType: 'application/json'
          }
        })
      }
    );
    if (!response.ok) {
      console.warn('[DayO Partner Question] Gemini request failed:', response.status);
      json(res, 502, { error: 'generation_failed', upstream_status: response.status });
      return;
    }
    var payload = await response.json();
    var generated = '';
    try {
      generated = payload.candidates[0].content.parts.map(function (part) { return part.text || ''; }).join('');
    } catch (e) { generated = ''; }
    var questions = parseGeminiJson(generated);
    if (questions.length < 2) {
      json(res, 502, { error: 'empty_generation' });
      return;
    }
    json(res, 200, { questions: questions });
  } catch (error) {
    console.warn('[DayO Partner Question] request error:', error && error.name ? error.name : 'unknown');
    json(res, 502, { error: 'generation_failed' });
  } finally {
    clearTimeout(timeout);
  }
};
