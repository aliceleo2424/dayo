const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const insights = require('../public/conversation-insights.js');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '072_canonical_session_transcripts.sql'), 'utf8');
const adminHelperMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '039_secure_bookings_rls.sql'), 'utf8');
const profileStore = fs.readFileSync(path.join(root, 'public', 'profile-store.js'), 'utf8');
const roomLive = fs.readFileSync(path.join(root, 'public', 'room-live.js'), 'utf8');
const roomHtml = fs.readFileSync(path.join(root, 'public', 'room.html'), 'utf8');
const mypageHtml = fs.readFileSync(path.join(root, 'public', 'mypage.html'), 'utf8');
const conversationInsights = fs.readFileSync(path.join(root, 'public', 'conversation-insights.js'), 'utf8');
const sessionLifecycle = fs.readFileSync(path.join(root, 'public', 'session-lifecycle.js'), 'utf8');

assert.equal(profileStore, fs.readFileSync(path.join(root, 'profile-store.js'), 'utf8'));
assert.equal(roomLive, fs.readFileSync(path.join(root, 'room-live.js'), 'utf8'));
assert.equal(roomHtml, fs.readFileSync(path.join(root, 'room.html'), 'utf8'));
assert.equal(mypageHtml, fs.readFileSync(path.join(root, 'mypage.html'), 'utf8'));
assert.equal(conversationInsights, fs.readFileSync(path.join(root, 'conversation-insights.js'), 'utf8'));
assert.equal(sessionLifecycle, fs.readFileSync(path.join(root, 'session-lifecycle.js'), 'utf8'));

const learnerId = '11111111-1111-4111-8111-111111111111';
const partnerUserId = '22222222-2222-4222-8222-222222222222';
const partnerProfileId = '66666666-6666-4666-8666-666666666666';
const outsiderId = '33333333-3333-4333-8333-333333333333';
const bookingId = '44444444-4444-4444-8444-444444444444';
const otherBookingId = '55555555-5555-4555-8555-555555555555';

function transcript(speaker, text, minute = 0) {
  return [{ speaker, text, timestamp: new Date(Date.UTC(2026, 8, 28, 12, minute)).toISOString() }];
}

function canonicalUpsert(rows, booking, actorId, items, options = {}) {
  if (!booking) return { success: false, code: 'booking_not_found' };
  const role = actorId === booking.learner_id
    ? 'learner'
    : actorId === booking.partner_user_id ? 'partner' : null;
  if (!role) return { success: false, code: 'not_booking_participant' };
  const scheduledAt = Date.parse(booking.scheduled_at);
  const windowStart = scheduledAt - 5 * 60 * 1000;
  const windowEnd = scheduledAt + 35 * 60 * 1000;
  const startedAt = Date.parse(options.startedAt || booking.scheduled_at);
  const endedAt = Date.parse(options.endedAt || new Date(scheduledAt + 25 * 60 * 1000).toISOString());
  if (![scheduledAt, startedAt, endedAt].every(Number.isFinite)
      || endedAt < startedAt
      || startedAt < windowStart || startedAt > windowEnd
      || endedAt < windowStart || endedAt > windowEnd) {
    return { success: false, code: 'invalid_session_window' };
  }
  const isoTimestamp = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:[.][0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$/;
  const clean = items.filter((item) => {
    if (!item || item.speaker !== role || !item.text || !isoTimestamp.test(item.timestamp || '')) return false;
    const timestamp = Date.parse(item.timestamp);
    return Number.isFinite(timestamp) && timestamp >= windowStart && timestamp <= windowEnd;
  });
  const key = `${booking.id}:${role}`;
  const existing = rows.find((row) => row.key === key);
  const snapshot = {
    key,
    booking_id: booking.id,
    participant_id: actorId,
    participant_role: role,
    learner_id: booking.learner_id,
    partner_id: booking.partner_id,
    room_id: booking.id,
    transcript: clean,
  };
  if (existing) Object.assign(existing, snapshot);
  else rows.push(snapshot);
  return { success: true, row: existing || snapshot };
}

function canSelectSessionLog(row, actor) {
  if (!actor) return false;
  return row.participant_id === actor.id
    || (row.booking_id == null && row.user_id === actor.id)
    || actor.isAdmin === true;
}

const booking = {
  id: bookingId,
  learner_id: learnerId,
  partner_id: partnerProfileId,
  partner_user_id: partnerUserId,
  scheduled_at: '2026-09-28T12:00:00.000Z',
};
const rows = [{ key: 'legacy', booking_id: null, participant_role: null, transcript: transcript('learner', 'legacy') }];

function browserSnapshot(role, items) {
  return items.filter((item) => item && item.speaker === role &&
    typeof item.text === 'string' && item.text.trim() &&
    typeof item.timestamp === 'string' && Number.isFinite(Date.parse(item.timestamp)));
}

const mixedBrowserRows = [
  ...transcript('learner', 'learner browser evidence'),
  ...transcript('partner', 'partner browser evidence'),
  { speaker: 'host', text: 'legacy label', timestamp: '2026-09-28T12:00:00.000Z' },
  { speaker: 'learner', text: 'missing time' },
];
assert.deepEqual(browserSnapshot('learner', mixedBrowserRows).map((item) => item.text), ['learner browser evidence']);
assert.deepEqual(browserSnapshot('partner', mixedBrowserRows).map((item) => item.text), ['partner browser evidence']);

// A-B. Identity is derived from the booking participant, not browser identity fields.
const learnerSave = canonicalUpsert(rows, booking, learnerId, transcript('learner', 'first learner snapshot'));
assert.equal(learnerSave.row.booking_id, bookingId);
assert.equal(learnerSave.row.participant_id, learnerId);
assert.equal(learnerSave.row.participant_role, 'learner');
const partnerSave = canonicalUpsert(rows, booking, partnerUserId, transcript('partner', 'partner snapshot'));
assert.equal(learnerSave.success, true);
assert.equal(partnerSave.success, true);
assert.equal(partnerSave.row.participant_role, 'partner');
assert.equal(partnerSave.row.participant_id, partnerUserId);
assert.equal(partnerSave.row.partner_id, partnerProfileId);

// C-D. Same role replaces its snapshot; learner and partner remain separate rows.
canonicalUpsert(rows, booking, learnerId, transcript('learner', 'latest learner snapshot', 1));
assert.equal(rows.filter((row) => row.booking_id === bookingId && row.participant_role === 'learner').length, 1);
assert.equal(rows.find((row) => row.booking_id === bookingId && row.participant_role === 'learner').transcript[0].text, 'latest learner snapshot');
assert.equal(rows.filter((row) => row.booking_id === bookingId).length, 2);

const learnerRow = rows.find((row) => row.booking_id === bookingId && row.participant_role === 'learner');
const partnerRow = rows.find((row) => row.booking_id === bookingId && row.participant_role === 'partner');
assert.equal(canSelectSessionLog(learnerRow, { id: learnerId }), true);
assert.equal(canSelectSessionLog(partnerRow, { id: partnerUserId }), true);
assert.equal(canSelectSessionLog(learnerRow, { id: outsiderId, isAdmin: true }), true);
assert.equal(canSelectSessionLog(learnerRow, { id: outsiderId }), false);
assert.equal(canSelectSessionLog(learnerRow, null), false);

// E-F. Outsiders and unknown bookings cannot save.
assert.equal(canonicalUpsert(rows, booking, outsiderId, transcript('learner', 'forged')).code, 'not_booking_participant');
assert.equal(canonicalUpsert(rows, null, learnerId, transcript('learner', 'missing booking')).code, 'booking_not_found');

// G. Canonical session envelope rejects unrelated boundaries and drops only bad items.
assert.equal(canonicalUpsert([], booking, learnerId, transcript('learner', 'wrong start'), {
  startedAt: '2026-10-28T12:00:00.000Z',
  endedAt: '2026-10-28T12:25:00.000Z',
}).code, 'invalid_session_window');
assert.equal(canonicalUpsert([], booking, learnerId, transcript('learner', 'late end'), {
  startedAt: '2026-09-28T12:00:00.000Z',
  endedAt: '2026-09-28T12:36:00.000Z',
}).code, 'invalid_session_window');
const filteredWindow = canonicalUpsert([], booking, learnerId, [
  ...transcript('learner', 'inside the session', 2),
  ...transcript('learner', 'outside the session', 40),
]);
assert.equal(filteredWindow.success, true);
assert.deepEqual(filteredWindow.row.transcript.map((item) => item.text), ['inside the session']);

// H. Legacy rows remain untouched and cannot become canonical insight rows.
assert.equal(rows[0].booking_id, null);
assert.deepEqual(insights.canonicalLearnerLogsByBooking(rows, learnerId)[bookingId].transcript[0].text, 'latest learner snapshot');
assert.equal(Object.values(insights.canonicalLearnerLogsByBooking(rows, learnerId)).some((row) => row.booking_id == null), false);

// I-J. Missing speaker is not learner evidence; missing timestamp is not rhythm evidence.
const missingSpeaker = insights.analyzeSession([{ text: 'I should not count', timestamp: '2026-09-28T12:00:00.000Z' }]);
assert.equal(missingSpeaker.totalWords, 0);
const missingTimestamp = insights.analyzeSession([{
  speaker: 'learner',
  text: 'I should not count',
  created_at: '2026-09-28T12:00:00.000Z',
}], '2026-09-28T12:00:00.000Z');
assert.equal(missingTimestamp.totalWords, 0);
assert.deepEqual(missingTimestamp.bins, [0, 0, 0, 0, 0]);

// K. Canonical learner lookup ignores partner, outsider and null-booking rows.
const canonicalLogs = insights.canonicalLearnerLogsByBooking([
  { booking_id: bookingId, participant_id: learnerId, participant_role: 'learner', transcript: transcript('learner', 'count once') },
  { booking_id: bookingId, participant_id: partnerUserId, participant_role: 'partner', transcript: transcript('partner', 'not learner') },
  { booking_id: otherBookingId, participant_id: outsiderId, participant_role: 'learner', transcript: transcript('learner', 'not owned') },
  { booking_id: null, participant_id: learnerId, participant_role: 'learner', transcript: transcript('learner', 'legacy') },
], learnerId);
assert.deepEqual(Object.keys(canonicalLogs), [bookingId]);
const monthly = insights.summarizeMonth([
  { id: bookingId, date: '2026-09-28T12:00:00.000Z', metrics: insights.analyzeSession(canonicalLogs[bookingId].transcript) },
], new Date('2026-09-28T13:00:00.000Z'));
assert.equal(monthly.sessions.length, 1);
assert.equal(monthly.totalWords, 2);

// L. Static transaction/security contract: atomic RPC-only writes and canonical conflict key.
assert.match(migration, /\nbegin;\s*[\s\S]*notify pgrst, 'reload schema';\s*commit;\s*$/i);
assert.match(migration, /security definer\s+set search_path = ''/i);
assert.match(migration, /v_actor_id uuid := auth\.uid\(\)/i);
assert.match(migration, /bookings\.learner_id, bookings\.partner_id, bookings\.partner_user_id, bookings\.scheduled_at/i);
assert.match(migration, /not_booking_participant/i);
assert.match(migration, /v_scheduled_at - interval '5 minutes'/i);
assert.match(migration, /v_scheduled_at \+ interval '35 minutes'/i);
assert.match(migration, /v_item_timestamp := \(v_item ->> 'timestamp'\)::pg_catalog\.timestamptz/i);
assert.match(migration, /jsonb_typeof\(p_transcript\) <> 'array'/i);
assert.match(migration, /jsonb_array_length\(p_transcript\) > 1000/i);
assert.match(migration, /octet_length\(p_transcript::pg_catalog\.text\) > 1048576/i);
assert.match(migration, /unique index[\s\S]*\(booking_id, participant_role\)[\s\S]*where booking_id is not null and participant_role is not null/i);
assert.match(migration, /on conflict \(booking_id, participant_role\)[\s\S]*do update set/i);
assert.match(migration, /revoke all on table public\.session_logs from public, anon, authenticated/i);
assert.match(migration, /grant select on table public\.session_logs to authenticated/i);
assert.match(migration, /participant_id = auth\.uid\(\)[\s\S]*booking_id is null[\s\S]*user_id = auth\.uid\(\)[\s\S]*or public\.dayo_is_admin\(\)/i);
assert.doesNotMatch(migration, /create policy "session_logs_select_owner_or_admin"[\s\S]*from public\.profiles[\s\S]*revoke all on table/i);
assert.match(adminHelperMigration, /create or replace function public\.dayo_is_admin\(\)[\s\S]*?stable[\s\S]*?security definer[\s\S]*?set search_path = ''[\s\S]*?from public\.profiles[\s\S]*?where id = auth\.uid\(\)[\s\S]*?and role = 'admin'/i);
assert.match(adminHelperMigration, /revoke all on function public\.dayo_is_admin\(\)[\s\S]*?from public, anon, authenticated/i);
assert.match(adminHelperMigration, /grant execute on function public\.dayo_is_admin\(\)[\s\S]*?to authenticated/i);
const sessionLogPrivileges = migration.slice(migration.indexOf('revoke all on table public.session_logs'));
assert.doesNotMatch(sessionLogPrivileges, /grant\s+(?:all|insert|update|delete)(?:\s*,|\s+on)\s+table\s+public\.session_logs\s+to\s+authenticated/i);
assert.match(migration, /revoke all on function public\.upsert_session_transcript[\s\S]*from public, anon/i);
assert.match(migration, /grant execute on function public\.upsert_session_transcript[\s\S]*to authenticated/i);
assert.doesNotMatch(migration, /partner_session_rewards|ticket_refund|spoken_sentence|complete_session_and_reward_partner/i);
assert.doesNotMatch(profileStore, /from\(['"]session_logs['"]\)\.insert/);
assert.match(profileStore, /rpc\(['"]upsert_session_transcript['"], payload\)/);
assert.doesNotMatch(profileStore, /p_learner_id|p_partner_id|learnerId:\s*extra|partnerId:\s*extra/);
assert.doesNotMatch(roomLive, /speaker:\s*\(row && row\.speaker\) \|\| ['"]learner['"]/);
assert.doesNotMatch(roomLive, /else if \(!ts\) ts = new Date\(\)\.toISOString\(\)/);
assert.match(roomLive, /function canonicalTranscriptSnapshot\(rows, access\)/);
assert.match(roomLive, /row\.speaker === role[\s\S]*Number\.isFinite\(Date\.parse\(row\.timestamp\)\)/);
assert.match(roomLive, /dayo_session_transcript:[\s\S]*bookingId[\s\S]*role/);
assert.match(roomLive, /dayo_session_timing:[\s\S]*bookingId[\s\S]*role/);
assert.match(roomLive, /restoreSessionTiming\(window\.DayORoomAccess\)/);
assert.match(roomLive, /endedAt: checkpoint \? new Date\(\)\.toISOString\(\) : markSessionEnded\(access\)/);
assert.match(roomLive, /store\.saveSessionLog\(canonicalTranscript, extra\)/);
assert.match(profileStore, /backupTranscriptLocal\(canonicalTranscriptSnapshot\(transcript\)\)/);
assert.match(roomHtml, /persistTranscript\(\)\.then\(function \(transcriptResult\)/);

console.log('session transcript reliability fixtures: ok');


// Exercise the actual room-live code with deterministic browser events and time.
// Synthetic timing proves lifecycle/persistence behavior, not recognition accuracy.
const vm = require('node:vm');
function sttBrowser(options = {}) {
  let now = Date.parse(booking.scheduled_at), timerId = 0, saved = null, reads = 0;
  const timers = new Map(), events = {}, pageEvents = {}, storage = new Map(), engines = [], writes = [];
  const clone = value => JSON.parse(JSON.stringify(value));
  const later = (fn, delay) => { const id = ++timerId; timers.set(id, { at: now + delay, fn }); return id; };
  const clear = id => timers.delete(id);
  const local = { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,String(v)) };
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  class Recognition {
    constructor() { engines.push(this); this.results = []; this.starts = 0; this.stops = 0; this.aborts = 0; }
    start() { this.starts++; if (options.startDenied) { const e = Error('fixture'); e.name='NotAllowedError'; throw e; } if (!options.startStalled && this.onstart) this.onstart(); }
    emit(text, index = this.results.length, final = true) {
      this.results[index] = Object.assign([{ transcript: text }], { isFinal: final });
      this.onresult({ resultIndex: index, results: this.results });
    }
    stop() { this.stops++; if (!options.stopStalled) later(() => { if(options.finalText) this.emit(options.finalText); this.onend(); }, options.finalDelay || 8); }
    abort() { this.aborts++; if(this.onend) this.onend(); }
  }
  const document = { visibilityState: 'visible', readyState: 'loading', body: { classList: { contains: () => false } },
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener(type, fn) { (events[type] ||= []).push(fn); }, dispatchEvent() {} };
  const window = { __dayoUsePeerJS: true, DayORoomAccess: { allowed: true, role: options.role || 'user', bookingId, learnerId, partnerId: partnerUserId, scheduledAt: booking.scheduled_at },
    DayORoomAccessReady: { then(fn) { fn(window.DayORoomAccess); } }, localStorage: local,
    SpeechRecognition: Recognition, addEventListener(type,fn) { (pageEvents[type] ||= []).push(fn); },
    DayOProfileStore: { async saveSessionLog(rows, extra) {
      writes.push({ rows: clone(rows), extra: clone(extra) });
      if (options.writeHook) await options.writeHook(writes.length);
      if (options.writeFailure) return { ok:false };
      const role = window.DayORoomAccess.role === 'partner' ? 'partner' : 'learner';
      saved = { booking_id: bookingId, participant_id: role === 'learner' ? learnerId : partnerUserId, participant_role: role, transcript: clone(rows), started_at:extra.startedAt, ended_at:extra.endedAt };
      return { ok:true };
    } }, supabaseClient: { from(table) {
      assert.equal(table,'session_logs'); const filters = {};
      return { select(){ return this; }, eq(k,v){ filters[k]=v;return this; }, async maybeSingle(){
        reads++; const role = window.DayORoomAccess.role === 'partner' ? 'partner' : 'learner';
        assert.deepEqual(filters,{ booking_id:bookingId, participant_id:role === 'learner' ? learnerId : partnerUserId, participant_role:role });
        if(options.readFailure) return { error:Error('fixture read failure') };
        return { data:saved && clone(saved) };
      } };
    } } };
  const context = vm.createContext({ window, document, navigator:{}, location:{search:''}, localStorage:local, sessionStorage:local,
    CustomEvent:function(type,init){this.type=type;this.detail=init && init.detail;}, Date:ClockDate, Math, Promise,
    setTimeout:later,clearTimeout:clear,setInterval:()=>0,clearInterval(){},console:{log(){},warn(){}} });
  vm.runInContext(roomLive,context);
  const microtasks = async () => { for(let i=0;i<20;i++)await Promise.resolve(); };
  async function advance(ms) {
    const end=now+ms; await microtasks();
    for(;;){let next=null;for(const [id,t]of timers)if(t.at<=end&&(!next||t.at<next[1].at))next=[id,t];if(!next)break;
      timers.delete(next[0]);now=next[1].at;next[1].fn();await microtasks();}
    now=end;await microtasks();
  }
  function fire(type,detail){for(const fn of events[type]||[])fn({detail});}
  function page(type){for(const fn of pageEvents[type]||[])fn();}
  fire('DOMContentLoaded');
  return {window,document,options,engines,writes,storage,advance,microtasks,fire,page, get active(){return window.dayoSTT;},get saved(){return saved;},get reads(){return reads;} };
}
function audioTrack() {
  const handlers={};return {readyState:'live',muted:false,handlers,
    addEventListener(type,fn){(handlers[type] ||= new Set()).add(fn);},removeEventListener(type,fn){handlers[type]?.delete(fn);},
    emit(type){for(const fn of handlers[type]||[])fn();} };
}
async function sttReliabilityChecks() {
  let checks = 0; const check = (actual, expected, label) => {assert.deepEqual(actual,expected,label);checks++;};
  const b=sttBrowser();await b.microtasks();const first=b.active;
  first.emit('I like this cafe.');first.emit('I like this cafe.');first.emit('I like this cafe.',1);
  check(b.window.DayOLive.getTranscript().length,2,'identical sentences at different indexes survive; duplicate callbacks do not');
  check(b.writes.length,0,'finals do not issue a write per word');await b.advance(14999);check(b.writes.length,0,'checkpoint waits 15 seconds');
  await b.advance(1);check(b.writes.length,1,'one batched checkpoint');check(b.saved.transcript.length,2,'checkpoint contains all finals');
  check(b.window.dayoSessionEnded,false,'checkpoint never ends room');
  const timing=JSON.parse(b.storage.get('dayo_session_timing:'+bookingId+':learner'));
  check(timing.endedAt,null,'checkpoint never sets actual completion timestamp');
  await b.advance(30000);check(b.writes.length,1,'clean state issues no writes');
  first.onend();await b.advance(249);check(b.engines.length,1,'restart gap retained');await b.advance(1);
  const second=b.active;check(b.engines.length,2,'new native instance/run on restart');
  first.onstart();first.onerror({error:'not-allowed'});first.onend();first.emit('obsolete result');
  second.emit('I like this cafe.');check(b.window.DayOLive.getTranscript().length,3,'stale callbacks cannot affect new run or suppress repetition');
  const n=b.engines.length;await b.advance(1000);check(b.engines.length,n,'stale end/error cannot schedule duplicate restart');
  second.emit('interim text',1,false);check(b.window.DayOLive.getTranscript().length,3,'interims remain noncanonical');
  second.emit('Final sentence.',1,true);check(b.window.DayOLive.getTranscript().length,4,'final replaces interim exactly once');
  b.window.__dayoPreflightActive=true;second.emit('preflight only');b.window.__dayoPreflightActive=false;second.emit('preflight only',2);
  check(b.window.DayOLive.getTranscript().length,4,'preflight cannot leak by callback replay');

  const hidden=sttBrowser();await hidden.microtasks();hidden.document.visibilityState='hidden';hidden.fire('visibilitychange');hidden.active.onend();
  await hidden.advance(1000);check(hidden.engines.length,1,'no restart in background');hidden.document.visibilityState='visible';hidden.fire('visibilitychange');
  await hidden.advance(180);check(hidden.engines.length,2,'foreground recovers after hidden end');
  hidden.page('pagehide');hidden.active.onend();hidden.page('pageshow');await hidden.advance(180);check(hidden.engines.length,3,'page resume recovers safely');
  hidden.active.onerror({error:'not-allowed'});hidden.document.visibilityState='hidden';hidden.fire('visibilitychange');hidden.document.visibilityState='visible';hidden.fire('visibilitychange');
  await hidden.advance(5000);check(hidden.engines.length,3,'permission denied blocks automatic restart');
  const stalled=sttBrowser({startStalled:true});await stalled.microtasks();const stale=stalled.active;await stalled.advance(4000);stalled.options.startStalled=false;
  await stalled.advance(800);check(stalled.engines.length,2,'start watchdog replaces stalled run');stale.onstart();stale.emit('late start result');
  check(stalled.window.DayOLive.getTranscript().length,0,'timed-out run stays invalid');
  const denied=sttBrowser({startDenied:true});await denied.microtasks();await denied.advance(10000);check(denied.engines.length,1,'start permission failure also blocks retry');

  const tracks=sttBrowser();await tracks.microtasks();const old=audioTrack(),fresh=audioTrack();tracks.fire('dayo:local-stream',{stream:{getAudioTracks:()=>[old]}});
  const obsoleteMute=[...old.handlers.mute][0];tracks.fire('dayo:local-stream',{stream:{getAudioTracks:()=>[fresh]}});
  check([...old.handlers.mute].length,0,'old track listeners detached');obsoleteMute();fresh.emit('unmute');await tracks.advance(180);
  check(tracks.active.stops,0,'obsolete track callback cannot pause current capture');
  fresh.muted=true;fresh.emit('mute');check(tracks.active.stops,1,'active mute pauses capture');await tracks.advance(8);
  fresh.muted=false;fresh.emit('unmute');await tracks.advance(180);check(tracks.engines.length,2,'active unmute restarts');
  fresh.readyState='ended';fresh.emit('ended');await tracks.advance(3000);check(tracks.engines.length,2,'ended track prevents restart');

  const retry=sttBrowser({readFailure:true});await retry.microtasks();retry.active.emit('Recorded locally.');await retry.advance(15000);
  check(retry.writes.length,0,'failed canonical read cannot overwrite');check(retry.window.DayOLive.getTranscript().length,1,'failed read retains local final');
  retry.options.readFailure=false;await retry.advance(29999);check(retry.writes.length,0,'retry backs off');await retry.advance(1);check(retry.saved.transcript.length,1,'retry restores accepted final');
  const failedWrite=sttBrowser({writeFailure:true});await failedWrite.microtasks();failedWrite.active.emit('Retain after RPC failure.');await failedWrite.advance(15000);
  failedWrite.options.writeFailure=false;await failedWrite.advance(30000);check(failedWrite.saved.transcript.length,1,'failed RPC retries without duplicate rows');

  let release;const race=sttBrowser({writeHook:n=>n===1?new Promise(r=>release=r):Promise.resolve()});await race.microtasks();race.active.emit('First final.');await race.advance(15000);
  race.active.emit('Second final.');const ended=race.window.DayOLive.finalizeTranscript();await race.advance(8);
  check(race.writes.length,1,'final save waits for in-flight checkpoint');release();await race.microtasks();await ended;
  check(race.writes.length,2,'one final save follows checkpoint');check(race.saved.transcript.length,2,'final resave includes dirty finals');
  check(race.window.DayOLive.getTranscript().length,2,'no duplicated accepted finals');
  const endTimestamp=JSON.parse(race.storage.get('dayo_session_timing:'+bookingId+':learner')).endedAt;
  check(endTimestamp,race.writes[1].extra.endedAt,'actual termination time stored only on final save');
  await race.window.DayOLive.finalizeTranscript();check(race.writes.length,2,'duplicate finalize cannot resave');await race.advance(60000);check(race.writes.length,2,'termination cancels checkpoint retries');

  const cleanEnd=sttBrowser();await cleanEnd.microtasks();cleanEnd.active.emit('Already checkpointed.');await cleanEnd.advance(15000);
  const cleanFlush=cleanEnd.window.DayOLive.finalizeTranscript();await cleanEnd.advance(8);await cleanFlush;
  check(cleanEnd.writes.length,2,'unchanged words still save actual final envelope after checkpoint');
  check(cleanEnd.saved.transcript.length,1,'final metadata update preserves existing final ID');

  let failureRelease;const interrupted=sttBrowser({writeFailure:true,writeHook:n=>n===1?new Promise(r=>failureRelease=r):Promise.resolve()});
  await interrupted.microtasks();interrupted.active.emit('Pending checkpoint.');await interrupted.advance(15000);
  const finishing=interrupted.window.DayOLive.finalizeTranscript();await interrupted.advance(8);
  failureRelease();await interrupted.microtasks();await finishing;
  check(interrupted.writes.length,2,'failed checkpoint does not masquerade as final save');
  check(interrupted.window.DayOLive.getTranscript().length,1,'interrupted saves retain local backup');
  interrupted.options.writeFailure=false;const recovered=await interrupted.window.DayOLive.finalizeTranscript();
  check(recovered.ok,true,'explicit retry after failed final save works');check(interrupted.saved.transcript.length,1,'retry keeps original utterance only');

  const pausing=sttBrowser({finalText:'Pending at microphone pause.'});await pausing.microtasks();
  pausing.window.DayOLive.toggleMic();pausing.window.DayOLive.toggleMic();pausing.active.onstart();
  await pausing.advance(8);await pausing.advance(250);
  check(pausing.engines.length,2,'quick pause/resume waits for end before new run');
  check(pausing.window.DayOLive.getTranscript().length,1,'pending pause final is retained');
  const pauseStalled=sttBrowser({stopStalled:true});await pauseStalled.microtasks();pauseStalled.window.DayOLive.toggleMic();pauseStalled.window.DayOLive.toggleMic();
  await pauseStalled.advance(2500);await pauseStalled.advance(180);
  check(pauseStalled.engines.length,2,'bounded recovery when pause never emits end');

  const delayed=sttBrowser({finalText:'Last delayed sentence.',finalDelay:2400});await delayed.microtasks();delayed.active.emit('First sentence.');
  const flush=delayed.window.DayOLive.flushTranscript(),again=delayed.window.DayOLive.flushTranscript();check(flush===again,true,'flush shares one promise');
  await delayed.advance(2399);check(delayed.writes.length,0,'no premature final save');await delayed.advance(1);await flush;
  await delayed.window.DayOLive.finalizeTranscript();check(delayed.saved.transcript.length,2,'final near shutdown deadline is saved');check(delayed.active.stops,1,'one stop request');
  const timed=sttBrowser({stopStalled:true});await timed.microtasks();timed.active.emit('Accepted before timeout.');const timeout=timed.window.DayOLive.flushTranscript();
  await timed.advance(2500);await timeout;timed.active.emit('Too late.');await timed.window.DayOLive.finalizeTranscript();
  check(timed.saved.transcript.length,1,'shutdown deadline prevents post-save divergence');
  check(timed.window.DayOLive.getSttTelemetry().some(e=>e.reason==='review-flush-timeout'),true,'timeout observable without raw speech');
  await timed.advance(60000);check(timed.engines.length,1,'session end prevents all restarts');
  const alreadyEnded=sttBrowser();await alreadyEnded.microtasks();alreadyEnded.active.onend();let immediate=false;
  alreadyEnded.window.DayOLive.flushTranscript().then(()=>immediate=true);await alreadyEnded.microtasks();check(immediate,true,'already ended engine does not add 2.5 second wait');

  for(const role of ['user','partner']){const own=sttBrowser({role});await own.microtasks();own.active.emit('Own microphone sentence.');await own.advance(15000);
    check(own.saved.participant_role,role==='user'?'learner':'partner','checkpoint role stays authenticated participant');
    check(own.saved.transcript[0].speaker,own.saved.participant_role,'source speaker follows room participant');}
  for(const mode of ['observer','adminTest']){const excluded=sttBrowser();await excluded.microtasks();excluded.window.DayORoomAccess[mode]=true;
    excluded.active.emit('Not canonical.');await excluded.advance(60000);check(excluded.writes.length,0,'no checkpoint for '+mode);}
  console.log('STT-RELIABILITY-01: '+checks+' behavioral checks passed (synthetic events; no audio/provider calls).');
}
sttReliabilityChecks().catch(error=>{console.error(error);process.exitCode=1;});
