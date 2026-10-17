'use strict';
// MANUAL real-provider check (owner approval 2026-10-17): does Soniox accept the room's `context` and keep short
// Korean words inside English speech? Sends the same 16 kHz mono PCM twice (without / with context) and prints
// only the final transcripts. Needs SONIOX_API_KEY in the environment or .env.local; the key is never printed.
// Usage: node tests/soniox-context-provider.cjs <audio.pcm>
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
function key() {
  if (process.env.SONIOX_API_KEY) return process.env.SONIOX_API_KEY.trim();
  try { const m = fs.readFileSync(path.join(root, '.env.local'), 'utf8').match(/^SONIOX_API_KEY\s*=\s*"?([^"\r\n]+)"?/m); return m ? m[1].trim() : ''; } catch (_) { return ''; }
}
function roomContext() {
  const src = fs.readFileSync(path.join(root, 'public/soniox-room.js'), 'utf8');
  const m = src.match(/var CONTEXT=(\{[\s\S]*?\]\});/);
  if (!m) throw new Error('CONTEXT not found in public/soniox-room.js');
  return Function('return ' + m[1])();
}
function run(apiKey, pcm, context) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket', ['soniox-api-key', apiKey]); let text = '', error = null; // same auth path as the room
    const timer = setTimeout(() => { try { ws.close(); } catch (_) {} reject(new Error('timeout')); }, 60000);
    ws.onopen = async () => {
      ws.send(JSON.stringify(Object.assign({ model: 'stt-rt-v5', language_hints: ['en', 'ko', 'es'], enable_language_identification: true, enable_endpoint_detection: true, max_endpoint_delay_ms: 2000, audio_format: 'pcm_s16le', sample_rate: 16000, num_channels: 1 }, context ? { context } : {})));
      const step = 3840; // 120 ms
      for (let i = 0; i < pcm.length; i += step) { ws.send(pcm.subarray(i, i + step)); await new Promise(r => setTimeout(r, 120)); }
      ws.send('');
    };
    ws.onmessage = (e) => { const d = JSON.parse(typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString());
      if (d.error_code) { error = d.error_code + ' ' + (d.error_message || ''); return; }
      for (const t of d.tokens || []) if (t.is_final && typeof t.text === 'string' && !/^<.*>$/.test(t.text)) text += t.text;
      if (d.finished) { clearTimeout(timer); ws.close(); } };
    ws.onclose = () => { clearTimeout(timer); error ? reject(new Error(error)) : resolve(text.trim()); };
    ws.onerror = () => {};
  });
}
(async () => {
  const apiKey = key(); if (!apiKey) { console.log('SKIP: SONIOX_API_KEY not available'); return; }
  const pcm = fs.readFileSync(process.argv[2]);
  const without = await run(apiKey, pcm, null);
  const withCtx = await run(apiKey, pcm, roomContext());
  const words = ['전어', '찜질방', '붕어빵'];
  console.log('WITHOUT context:', without); console.log('WITH context   :', withCtx);
  console.log('Korean words kept without:', words.filter(w => without.includes(w)).length + '/3', '· with:', words.filter(w => withCtx.includes(w)).length + '/3');
  console.log('PASS: Soniox accepted the room context (no invalid_request).');
})().catch(e => { console.error('FAIL:', e.message); process.exitCode = 1; });
