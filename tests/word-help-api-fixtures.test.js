const assert = require('node:assert/strict');
const handler = require('../api/word-help.js');
const logs = [];
const original = { fetch: global.fetch, info: console.info, warn: console.warn, key: process.env.GEMINI_API_KEY };
console.info = console.warn = (...args) => logs.push(args);
process.env.GEMINI_API_KEY = 'NEVER_LOG_THIS_FIXTURE_KEY';
const item = { text: 'a walk', ko: '산책' };
const sentence = { text: 'I enjoyed the walk.', ko: '산책을 즐겼어요.' };
const wrap = (text, extra = {}) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] }, ...extra }], usageMetadata: { candidatesTokenCount: 60, thoughtsTokenCount: 0 } });
async function invoke(upstream, body = { input: 'NEVER_LOG_THIS_USER_INPUT', language: 'en' }) {
  let request;
  global.fetch = async (url, options) => {
    request = { url, options, config: JSON.parse(options.body).generationConfig };
    if (upstream instanceof Error) throw upstream;
    return new Response(typeof upstream === 'string' ? upstream : JSON.stringify(upstream), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const res = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
  await handler({ method: 'POST', body }, res);
  return { res, request };
}
(async () => {
  try {
    for (const result of [{ words: [item], phrases: [sentence] }, { words: [item], phrases: [] }, { words: [], phrases: [sentence] }]) {
      const { res, request } = await invoke(wrap(JSON.stringify(result)));
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, result);
      assert.match(request.url, /gemini-3\.6-flash:generateContent$/);
      assert.doesNotMatch(request.url, /key=/);
      assert.equal(request.config.thinkingConfig.thinkingLevel, 'minimal');
      assert.equal(request.config.maxOutputTokens, 1024);
      assert.equal(request.config.responseJsonSchema.properties.words.maxItems, 3);
    }
    assert.equal((await invoke(wrap('```json\n' + JSON.stringify({ words: [item], phrases: [] }) + '\n```'))).res.statusCode, 200);
    const thought = wrap(JSON.stringify({ words: [item], phrases: [] }));
    thought.candidates[0].content.parts.unshift({ thought: true, text: 'PRIVATE_THOUGHT_DO_NOT_LOG' });
    assert.equal((await invoke(thought)).res.statusCode, 200);
    for (const [upstream, code, stage] of [
      [{ candidates: [] }, 'empty_candidate', 'candidate'],
      [wrap(''), 'empty_text', 'text_extraction'],
      [wrap('{"words":['), 'json_parse_error', 'generated_json'],
      ['<html>bad gateway</html>', 'json_parse_error', 'provider_json'],
      [wrap('{"words":[],"phrases":[]}'), 'schema_validation_error', 'result_schema'],
      [wrap('{"words":"bad","phrases":[]}'), 'schema_validation_error', 'result_schema'],
      [wrap(JSON.stringify({ words: [item], phrases: [] }), { finishReason: 'MAX_TOKENS' }), 'schema_validation_error', 'incomplete_generation']
    ]) {
      const { res } = await invoke(upstream);
      assert.equal(res.statusCode, 502);
      assert.equal(res.body.failure_code, code);
      assert.equal(logs.at(-1)[1].stage, stage);
    }
    const abort = new Error('timeout with secret payload'); abort.name = 'AbortError';
    assert.equal((await invoke(abort)).res.body.failure_code, 'timeout');
    global.fetch = async () => new Response('{"error":{"message":"NEVER_LOG_THIS_PROVIDER_BODY"}}', { status: 429 });
    const res = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
    await handler({ method: 'POST', body: { input: 'example' } }, res);
    assert.equal(res.body.failure_code, 'provider_http_error');
    assert.equal(logs.at(-1)[1].http_status, 429);
    const serial = JSON.stringify(logs);
    for (const secret of ['NEVER_LOG_THIS_FIXTURE_KEY', 'NEVER_LOG_THIS_USER_INPUT', 'NEVER_LOG_THIS_PROVIDER_BODY', 'PRIVATE_THOUGHT_DO_NOT_LOG', sentence.text]) assert.ok(!serial.includes(secret));
    assert.ok(logs.some(row => row[1].content_type === 'application/json' && row[1].candidate_count === 1 && row[1].finish_reason === 'STOP'));
    console.log('Word Help API fixtures passed: structured contract, safe fences/thought extraction, six failure classes, token diagnostics, and log privacy.');
  } finally {
    global.fetch = original.fetch; console.info = original.info; console.warn = original.warn;
    if (original.key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = original.key;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
