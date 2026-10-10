const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..'), model = require('../public/conversation-recap.js'), learner = require('../public/learner-expressions.js');
const { createHandler } = require('../api/conversation-recap.js');
const B = '44444444-4444-4444-8444-444444444444', L = '11111111-1111-4111-8111-111111111111', P = '22222222-2222-4222-8222-222222222222', OTHER = '55555555-5555-4555-8555-555555555555';
const source = f => fs.readFileSync(path.join(root, 'public', f), 'utf8');
const plain = o => JSON.parse(JSON.stringify(o));
let nextRow = 0;
const row = (text, speaker = 'learner', id = 'fixture-utterance-' + nextRow++) => ({ id, text, speaker, timestamp: '2026-10-05T05:01:00Z' });
const log = (speech, role = 'learner') => ({ id: role + '-source', booking_id: B, participant_id: role === 'learner' ? L : P, participant_role: role, transcript: speech });
const build = (own, other, lang = 'en') => model.build({ bookingId: B, learnerId: L, partnerId: P, language: lang, learnerLog: log(own), partnerLog: other == null ? null : log(other, 'partner') });
const own = [row('The crowded restaurant had delicious food.'), row('We enjoyed a quiet café after our trip.'), row('Yeah.'), row('um uh really like')];
const partner = [row('The spacious hotel is expensive.', 'partner')];
const full = build(own, partner);
assert.equal(full.metrics.user_word_count, 19); assert.equal(full.metrics.user_utterance_count, 4);
assert.equal(full.metrics.partner_word_count, 5); assert.equal(full.metrics.user_participation_ratio, 19 / 24);
assert.deepEqual(full.word_expansion.map(w => w.word), ['crowded', 'delicious', 'quiet']);
assert(!full.expressions.some(x => /spacious|Yeah|um uh/.test(x.text)));
assert(full.expressions.every(e => own.some(r => e.text === r.text)));
assert(full.topics.length <= 3); assert(full.questions.length >= 1 && full.questions.length <= 6);
assert(full.questions.every(q => own.some(r => model.words(r.text).map(w => w.toLowerCase()).includes(q.word)) && q.options.filter(x => x === q.answer).length === 1));
for (const [ratio, expected] of [[60, 'speaking'], [55, 'speaking'], [45, 'balanced'], [35, 'balanced'], [25, 'listening']]) {
  const r = build([row(Array(ratio).fill('hello').join(' '))], [row(Array(100 - ratio).fill('hello').join(' '), 'partner')]);
  assert.equal(r.interpretation, 'insufficient', 'unknown STT coverage is not an absolute participation assessment'); assert(!/점|등급/.test(model.render(r, 'ko')));
}
const emptyWords = build([row('yeah uh the like')], partner);
assert.equal(emptyWords.word_expansion.length, 0); assert.equal(emptyWords.questions.length, 0);
const missing = build(own, null); assert.equal(missing.metrics.partner_word_count, null); assert.equal(missing.metrics.user_participation_ratio, null);
assert.equal(build([], []).metrics.user_participation_ratio, null);
for (const lang of ['ko', 'fr', 'es', '']) { const r = build(own, partner, lang); assert.equal(r.supported, false); assert.equal(r.questions.length, 0); assert.equal(r.metrics.user_word_count, null); }
assert.equal(model.rows({ ...log(own), booking_id: OTHER }, B, L, 'learner'), null);
assert.equal(model.rows(log(partner, 'partner'), B, L, 'learner'), null);
assert.equal(build([own[0], own[0]], []).metrics.user_utterance_count, 1);
const saved = { booking_id: B, feedback: ['legacy feedback', full] };
assert.equal(model.saved(saved), full); assert.equal(model.saved({ ...saved, booking_id: OTHER }), null);
assert.deepEqual(model.mergeFeedback(['legacy', full], missing), ['legacy', missing]);
const stale = learner.normalizeQuizState({ fingerprint: 'other', completed: 2, currentIndex: 2, total: 3 }, 3, full.source.fingerprint);
assert.equal(stale.completed, 0);
assert.equal(learner.normalizeQuizState({ fingerprint: full.source.fingerprint, completed: 2, currentIndex: 2, total: 3 }, 3, full.source.fingerprint).completed, 2);
const malicious = { ...full, expressions: [{ text: '<img src=x onerror=alert(1)>' }] };
assert(!model.render(malicious, 'ko').includes('<img'));

async function api(options = {}) {
  const calls = [], booking = { id: B, learner_id: L, partner_user_id: P, language: 'en', status: 'completed', scheduled_at: '2026-10-05T05:00:00Z', is_test_session: true };
  const response = data => ({ ok: true, json: async () => data });
  const fetchImpl = async (url, args) => {
    calls.push({ url, args });
    if (url.includes('/auth/v1/user')) return options.authFail ? { ok: false } : response({ id: options.authId || L });
    if (url.includes('/bookings?') && new URL(url).searchParams.has('order')) return response([]);
    if (url.includes('/booking_chat_messages?')) {if(options.chatFail)throw Error('chat down');return response(options.chat||[]);}
    if (url.includes('/session_reports?')) return response([]);
    if (url.includes('/bookings?')) return response(options.outsider ? [] : [{ ...booking, ...options.booking }]);
    if (url.includes('/session_logs?')) {
      if (url.includes('participant_role=eq.partner')) { if (options.partnerFail) throw Error('down'); return response(options.wrongPartner ? [{ ...log(partner, 'partner'), booking_id: OTHER }] : [{ ...log(partner, 'partner'), ...options.partnerLog }]); }
      return response(options.ownMissing ? [] : [{ ...log(own), ...options.log }]);
    }
    throw Error('Unexpected network: ' + url);
  };
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon', SUPABASE_SERVICE_ROLE_KEY: options.noService ? '' : 'synthetic-server-only' };
  const handler = createHandler({ env, fetchImpl });
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.body = JSON.parse(s); } };
  await handler({ method: options.method || 'POST', headers: { authorization: options.noAuth ? '' : 'Bearer test.token', origin: options.origin || 'https://www.dayotalk.com' }, body: { booking_id: B, ...options.input } }, res);
  return { status: res.statusCode, body: res.body, calls, headers: res.headers };
}
async function serverChecks() {
  const r = await api(); assert.equal(r.status, 200); assert.equal(r.body.status, 'complete'); assert.deepEqual(r.body.recap, { ...full, volume_history:[], volume_history_status:'test_session', quiz_history_status:'available',chat:{...full.chat,status:'available'} });
  assert(!JSON.stringify(r.body).includes('spacious hotel')); assert(!JSON.stringify(r.body).includes('synthetic-server-only'));
  assert.equal(r.calls[0].args.headers.Authorization, 'Bearer test.token');
  assert.equal(r.calls[1].args.headers.Authorization, 'Bearer test.token');
  const partnerCall=r.calls.find(c=>c.url.includes('participant_role=eq.partner'));
  assert.equal(partnerCall.args.headers.Authorization, 'Bearer synthetic-server-only');
  assert.equal(r.calls.find(c=>c.url.includes('/booking_chat_messages?')).args.headers.Authorization,'Bearer test.token');
  const chatRow={booking_id:B,id:'chat-id',sender_id:L,sender_role:'learner',text:'The cafe was quiet.',created_at:own[0].timestamp};
  const typed=await api({chat:[chatRow,{...chatRow,id:'other',booking_id:OTHER}]});
  assert.equal(typed.body.recap.chat.messages.length,1);assert.equal(typed.body.recap.chat.messages[0].text,chatRow.text);
  assert.deepEqual(typed.body.recap.metrics,r.body.recap.metrics);
  const noChat=await api({chatFail:true});assert.deepEqual(noChat.body.recap.metrics,r.body.recap.metrics);assert.deepEqual(noChat.body.recap.questions,r.body.recap.questions);
  assert.equal(r.headers['Cache-Control'], 'private, no-store');
  assert(r.calls.every(c => !c.args.method || c.args.method === 'GET'), 'recap API performs read-only upstream requests');
  assert(!r.calls.some(c => c.url.includes('/rpc/')), 'recap API cannot call a mutation RPC');
  const partnerRead = new URL(partnerCall.url);
  assert.equal(partnerRead.searchParams.get('booking_id'), 'eq.' + B);
  assert.equal(partnerRead.searchParams.get('participant_id'), 'eq.' + P);
  assert.equal(partnerRead.searchParams.get('participant_role'), 'eq.partner');
  assert(partner.every(item => !JSON.stringify(r.body).includes(item.text)), 'Partner original utterances never enter the response');
  assert(r.body.recap.topics.flatMap(t=>t.supporting_sources).filter(s=>s.role==='partner').every(s=>s.log_id==='partner-source'), 'Only exact Partner source IDs are permitted in provenance, never raw speech');
  assert.equal(r.body.recap.metrics.partner_word_count, 5, 'only Partner aggregate counts are exposed');
  for (const opt of [{ noAuth: true }, { authFail: true }]) assert.equal((await api(opt)).status, 401);
  const outsider = await api({ outsider: true }); assert.equal(outsider.status, 403); assert.equal(outsider.calls.length, 2, 'ownership denied before privileged read');
  for (const opt of [{ authId: P }, { booking: { learner_id: OTHER } }, { booking: { id: OTHER } }]) {
    const denied = await api(opt); assert.equal(denied.status, 403); assert.equal(denied.calls.length, 2, 'wrong learner or booking cannot reach transcript reads');
  }
  for (const opt of [{ booking: { status: 'cancelled' } }, { booking: { status: 'no_show' } }, { origin: 'https://evil.example' }]) assert.equal((await api(opt)).status, 403);
  assert.equal((await api({ input: { transcript: own } })).status, 400);
  assert.equal((await api({ input: { learner_version: 'changed' } })).status, 409);
  assert.equal((await api({ log: { booking_id: OTHER } })).body.recap, null);
  for (const opt of [{ noService: true }, { partnerFail: true }, { wrongPartner: true }, { partnerLog: { participant_id: OTHER } }, { partnerLog: { participant_role: 'learner' } }]) { const partial = await api(opt); assert.equal(partial.status, 200); assert.equal(partial.body.recap.metrics.user_word_count, 19); assert.equal(partial.body.recap.metrics.user_participation_ratio, null); }
  assert.equal((await api({ booking: { language: 'fr' } })).body.recap.questions.length, 0);
}
function element() { return { hidden: false, style: { setProperty() {}, removeProperty() {} }, textContent: '', innerHTML: '', children: [], classList: { add() {}, remove() {} }, addEventListener(type, cb) { (this.handlers ||= {})[type] = cb; }, appendChild(child) { this.children.push(child); }, setAttribute() {}, querySelectorAll() { return this.children; } }; }
function browser(options = {}) {
  const storage = new Map(), timers = new Set(), calls = [], snapshots = [], nodes = {}, events = {};
  for (const id of ['memory-game-modal', 'memory-game-title', 'game-round-badge', 'review-quiz-timer', 'game-kr-meaning', 'word-pool-container', 'quiz-skip-btn', 'quiz-modal', 'quiz-content-box']) nodes[id] = element();
  const store = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
  const later = (fn, delay) => { const t = setTimeout(fn, delay); timers.add(t); return t; };
  let canonical, recognition, opened = 0;
  class Recognition {
    constructor() { recognition = this; this.results = []; } start() { if (this.onstart) this.onstart(); }
    emit(text) { const index = this.results.length; this.results.push(Object.assign([{ transcript: text }], { isFinal: true })); this.onresult({ resultIndex: index, results: this.results }); }
    stop() { if (!options.stalled) later(() => { if (options.finalText) this.emit(options.finalText); if (this.onend) this.onend(); }, 8); }
  }
  const window = { DayORoomAccess: { allowed: true, role: 'user', bookingId: B, learnerId: L, partnerId: P, language: 'en' },
    DayORoomAccessReady: { then() {} }, DayOConversationRecap: model, DayOLearnerExpressions: learner, SpeechRecognition: Recognition, localStorage: store,
    addEventListener() {}, logSessionEvent() {}, isPartnerRoomMode() { return this.DayORoomAccess.role === 'partner'; },
    openQuizModalImmediately() { opened++; }, handleSessionEndRouting() {},
    DayOProfileStore: { async saveSessionLog(speech, extra) { snapshots.push(plain(speech)); calls.push('save'); if (options.saveHook) await options.saveHook(snapshots.length); canonical = { ...log(plain(speech)), id: 'canonical-source', booking_id: extra.bookingId }; return { ok: true }; } },
    supabaseClient: { auth: { async getUser() { return { data: { user: { id: L } } }; }, async getSession() { return { data: { session: { access_token: 'test.token' } } }; } },
      from(table) { const filters = []; return { select() { assert(['session_logs','session_reports'].includes(table)); return this; }, eq(k, v) { filters.push([k, v]); return this; }, async maybeSingle() { if(table==='session_reports')return {data:options.savedReport || null}; calls.push('read'); assert.deepEqual(filters, [['booking_id', B], ['participant_id', L], ['participant_role', 'learner']]); return options.readFailure ? { error: {} } : { data: options.wrongBooking ? { ...canonical, booking_id: OTHER } : canonical ? plain(canonical) : null }; } }; },
      async rpc(name, args) { if(name==='complete_learner_session'){calls.push('complete');return {data:{success:true}};} calls.push('report'); assert.equal(name, 'merge_learner_session_report'); if(options.reportHook)await options.reportHook(); if(options.reportFail)return {error:{message:'synthetic failure'}}; window.savedPayload = plain(args.p_report); return { data: { success: true } }; } }
  };
  const context = vm.createContext({ window, document: { documentElement: { lang: 'ko' }, readyState: 'loading', visibilityState: 'visible', getElementById: id => nodes[id] || null, querySelector: () => null, querySelectorAll: () => [], createElement: element, addEventListener(type,fn) { (events[type] ||= []).push(fn); }, dispatchEvent() {} }, localStorage: store, sessionStorage: store, navigator: {}, AbortController, CustomEvent: function () {}, setTimeout: later, clearTimeout, setInterval: () => null, clearInterval, Date, Math, Promise, console: { log() {}, warn() {}, error() {} },
    fetch: async (_, request) => { calls.push('api'); if (options.apiFail) throw Error('AI/API failed'); const r = model.build({ bookingId: B, learnerId: L, partnerId: P, language: 'en', learnerLog: canonical, partnerLog: log(partner, 'partner') }); assert.equal(JSON.parse(request.body).learner_version, r.source.learner_version, 'client and server normalize the same canonical snapshot'); return { ok: true, json: async () => ({ recap: r }) }; } });
  for (const file of ['room-live.js', 'session-lifecycle.js', 'memory-game.js']) vm.runInContext(source(file), context);
  return { window, context, store, nodes, calls, snapshots, dispatch(type) {return Promise.all((events[type]||[]).map(fn=>fn()));}, start() { window.DayOLive.startSpeech(); return recognition; }, stop() { for (const t of timers) clearTimeout(t); }, get opened() { return opened; } };
}
async function lifecycleChecks() {
  const previousQuiz={booking_id:B,learner_id:L,quiz_score:67,feedback:[{...full,progress:{completed:4,total:6,reason:'skip'}}]};
  const recovery=browser({savedReport:previousQuiz,apiFail:true});
  try { recovery.start().emit(own[0].text);recovery.window.DayOLive.hangUp();const loaded=await recovery.window.prepareSessionReviewSource();assert.deepEqual(plain(loaded.recap.questions),full.questions,'server unavailable restores exact stored targets');assert.deepEqual(plain(loaded.recap.progress),previousQuiz.feedback[0].progress,'stored completion survives history failure'); } finally { recovery.stop(); }

  const automatic = browser();
  try { automatic.start().emit(own[0].text); automatic.window.DayOLive.hangUp(); await automatic.dispatch('dayo:session-ended'); assert(automatic.window.savedPayload,'normal end saves without opening or clicking recap'); assert.equal(automatic.opened,0); assert(automatic.calls.includes('complete')); assert.equal(model.saved({...automatic.window.savedPayload,booking_id:B}).progress.completed,0); } finally { automatic.stop(); }
  const failed = browser({reportFail:true});
  try { failed.start().emit(own[0].text); failed.window.DayOLive.hangUp(); await failed.dispatch('dayo:session-ended'); assert(failed.calls.includes('complete'),'save failure does not prevent existing session completion'); await failed.window.openQuizModalImmediately(); assert.equal(failed.opened,1,'save failure still shows recap'); assert(failed.nodes['quiz-content-box'].children.some(n=>/다시 저장/.test(n.textContent)),'save failure exposes retry'); } finally { failed.stop(); }
  let reportRelease; const concurrent=browser({reportHook:()=>new Promise(resolve=>reportRelease=resolve)});
  try { concurrent.start().emit(own[0].text); concurrent.window.DayOLive.hangUp(); await concurrent.window.prepareSessionReviewSource(); const a=concurrent.window.persistSessionReviewReport(),b=concurrent.window.persistSessionReviewReport(); await new Promise(setImmediate); reportRelease(); await Promise.all([a,b]); assert.equal(concurrent.calls.filter(c=>c==='report').length,1,'simultaneous auto-save and screen opening share the save'); } finally { concurrent.stop(); }
  let progressRelease,reportCount=0;const progressRace=browser({reportHook:()=>++reportCount===1?new Promise(resolve=>progressRelease=resolve):Promise.resolve()});
  try{progressRace.start().emit(own[0].text);progressRace.window.DayOLive.hangUp();await progressRace.window.prepareSessionReviewSource();const first=progressRace.window.persistSessionReviewReport();await new Promise(setImmediate);progressRace.window.__dayoQuizProgress={completed:1,total:3,reason:'skip'};progressRace.window.__dayoReviewRevision=1;progressRace.window.__dayoReviewReportSaved=false;const next=progressRace.window.persistSessionReviewReport();progressRelease();await Promise.all([first,next]);assert.equal(reportCount,2);assert.equal(model.saved({...progressRace.window.savedPayload,booking_id:B}).progress.completed,1,'pending automatic save cannot replace new progress');}finally{progressRace.stop();}
  const whitespace = browser();
  try { whitespace.start().emit('  The crowded restaurant was delicious.  '); whitespace.window.DayOLive.hangUp(); const source = await whitespace.window.prepareSessionReviewSource(); assert.equal(source.version, source.recap.source.learner_version); assert.equal(source.recap.source.partner_available, true, 'whitespace does not discard the server recap'); } finally { whitespace.stop(); }
  const b = browser({ finalText: own[1].text });
  try {
    const recognition = b.start(); recognition.emit(own[0].text);
    assert.equal((await b.window.prepareSessionReviewSource()).available, false, 'freeze only after end');
    await b.window.DayOLive.saveTranscript(); b.window.DayOLive.hangUp();
    const frozen = await b.window.prepareSessionReviewSource();
    assert.equal(frozen.rows.length, 2); assert.equal(b.snapshots.length, 2, 'late final is included in remote save');
    assert.deepEqual(b.calls, ['read', 'save', 'read', 'save', 'read', 'api']);
    b.window.sessionTranscript.push(row('Not part of the canonical snapshot.')); b.store.setItem('last_session_transcript', JSON.stringify([row('Wrong booking local content.')]));
    recognition.emit('Callback after finalization.'); assert.equal(b.window.DayOLive.getTranscript().length, 2);
    assert.equal(await b.window.prepareSessionReviewSource(), frozen);
    await b.window.startMemoryGameFromSession();
    const report = b.window.getLearnerReviewSnapshot(), recap = model.saved({ ...plain(report), booking_id: B });
    assert.equal(recap.source.fingerprint, frozen.recap.source.fingerprint); assert.equal(b.opened, 1, 'recap shown before optional questions');
    assert.equal(b.window.__dayoReviewReportSaved, true);
    b.window.startRecapQuestions(); assert(b.nodes['memory-game-title'].textContent.includes('오늘의 단어 퀴즈'));
    let stored = JSON.parse(b.store.getItem('dayo_recap_state:' + B)); assert(stored.fingerprint);
    b.nodes['word-pool-container'].children[0].handlers.click();
    b.nodes['word-pool-container'].children.at(-1).handlers.click();
    stored = JSON.parse(b.store.getItem('dayo_recap_state:' + B)); assert.equal(stored.completed, 1);
    await b.window.skipToRecordCard(); assert.equal(b.window.savedPayload.quiz_score, 17, 'legacy value is completion only');
    assert.equal(model.saved({ ...b.window.savedPayload, booking_id: B }).progress.completed, 1);
    b.window.DayORoomAccess.bookingId = OTHER; assert.equal(b.window.getLearnerReviewSnapshot().key_expressions.length, 0, 'cached report cannot cross bookings');
  } finally { b.stop(); }
  for (const options of [{ readFailure: true }, { wrongBooking: true }]) {
    const b = browser(options); try { b.window.DayOLive.hangUp(); await b.window.startMemoryGameFromSession(); assert(!b.calls.includes('report')); assert.equal(b.window.getLearnerReviewSnapshot().key_expressions.length, 0); assert.equal(b.opened, 1); } finally { b.stop(); }
  }
  const fallback = browser({ apiFail: true }); try { fallback.start().emit(own[0].text); fallback.window.DayOLive.hangUp(); await fallback.window.startMemoryGameFromSession(); const r = model.saved({ ...plain(fallback.window.getLearnerReviewSnapshot()), booking_id: B }); assert.equal(r.metrics.user_word_count, 6); assert.equal(r.metrics.user_participation_ratio, null); assert(fallback.calls.includes('report')); } finally { fallback.stop(); }
  let release; const race = browser({ saveHook: n => n === 1 ? new Promise(r => release = r) : Promise.resolve() });
  try { const r = race.start(); r.emit(own[0].text); const saving = race.window.DayOLive.saveTranscript(); r.emit(own[1].text); await new Promise(setImmediate); release(); await saving; assert.equal(race.snapshots.length, 2, 'in-flight revision is resaved'); } finally { race.stop(); }
}
async function databaseChecks() {
  const { PGlite } = require('@electric-sql/pglite'); const db = new PGlite();
  try {
    await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role; create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create function public.dayo_is_admin() returns boolean language sql as $$select false$$;
      create table public.bookings(id uuid primary key,learner_id uuid,partner_id uuid,partner_user_id uuid,partner_name text,status text);
      create table public.session_reports(id uuid primary key,booking_id uuid,learner_id uuid,partner_name text,spoken_sentence text not null,keyword text not null,illust_url text not null,partner_comment text,stamp text,created_at timestamptz);
      insert into public.bookings values('${B}','${L}','${P}','${P}','Partner','completed');`);
    for (const file of ['046_merge_session_reports_by_participant.sql', '047_fix_learner_report_spoken_sentence.sql']) await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'));
    const payload = { summary: 'Recorded conversation', key_expressions: full.expressions.map(e => e.text), feedback: ['legacy', { ...full, progress: { completed: 1, total: 6, reason: 'skip' } }], quiz_score: 17, word_help: [{ text: 'clicked only' }] };
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [L]);
    assert.equal((await db.query('select merge_learner_session_report($1::uuid,$2::jsonb) result', [B, JSON.stringify(payload)])).rows[0].result.success, true);
    const before = (await db.query('select summary,key_expressions,feedback,quiz_score,word_help from session_reports')).rows[0];
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [P]);
    assert.equal((await db.query('select merge_partner_session_report($1::uuid,$2::jsonb) result', [B, JSON.stringify({ partner_comment: 'Kind feedback', stamp: 'cookie', feedback: [], summary: 'Must not overwrite' })])).rows[0].result.success, true);
    const after = (await db.query('select summary,key_expressions,feedback,quiz_score,word_help from session_reports')).rows[0];
    assert.deepEqual(after, before, 'real PostgreSQL Partner merge preserves every recap field/progress');
    assert.equal((await db.query('select count(*) n from session_reports')).rows[0].n, 1);
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [OTHER]);
    assert.equal((await db.query('select merge_learner_session_report($1::uuid,$2::jsonb) result', [B, JSON.stringify(payload)])).rows[0].result.success, false);
  } finally { await db.close(); }
}
async function main() {
  await serverChecks(); await lifecycleChecks(); await databaseChecks();
  const report = require('../public/user-conversation-report.js');
  const html = report.renderDetail({ ...saved, language: 'en', partner_name: 'Partner', partner_comment: 'Kind note', stamp: 'cookie', quiz_score: 100 }, 'ko');
  assert(html.includes('오늘의 대화 기록')); assert(!/100%|100점|퀴즈 결과|More natural/.test(html)); assert(html.includes('Kind note'));
  for (const f of ['conversation-recap.js', 'conversation-recap.css', 'room-live.js', 'learner-expressions.js', 'session-lifecycle.js', 'memory-game.js', 'room.html', 'mypage.html', 'user-conversation-report.js', 'conversation-insights.js']) assert.equal(fs.readFileSync(path.join(root, f), 'utf8').replace(/\r/g, ''), source(f).replace(/\r/g, ''), f + ' mirror');
  assert(!source('session-lifecycle.js').includes('DayOLearnerLanguageRecap.enrichReview'), 'legacy AI sentence feedback disconnected');
  assert(source('conversation-insights.js').includes("box.querySelector('.dayo-recap')"), 'no browser-local graph injected into recap');
  console.log('PASS recap metrics/thresholds/provenance/filler/languages/words/questions/API security/final flush/revision/recovery/fallback/real PostgreSQL Partner merge/UI/mirrors');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
