const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const room = read('public/room.html');
const clientSource = read('public/supabase-client.js');
const bookingId = '11111111-1111-4111-8111-111111111111';
const partnerId = '22222222-2222-4222-8222-222222222222';
const learnerId = '33333333-3333-4333-8333-333333333333';
const quiet = { log() {}, warn() {}, error() {} };
const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const plain = (value) => JSON.parse(JSON.stringify(value));

assert.equal(room, read('room.html'));
assert.equal(clientSource, read('supabase-client.js'));
new vm.Script(clientSource);
for (const script of room.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
  if (script[1].trim()) new vm.Script(script[1]);
}

// Existing server merge contract: row identity is booking_id; participant
// updates leave the other participant's fields intact. No migration changes.
const partnerSQL = read('supabase/migrations/046_merge_session_reports_by_participant.sql')
  .split('create or replace function public.merge_partner_session_report(')[1]
  .split('revoke all on function')[0];
const learnerSQL = read('supabase/migrations/047_fix_learner_report_spoken_sentence.sql');
const partnerUpdates = partnerSQL.split('on conflict (booking_id) do update')[1];
const learnerUpdates = learnerSQL.split('on conflict (booking_id) do update')[1];
assert.doesNotMatch(partnerUpdates, /\b(summary|key_expressions|quiz_score|word_help|feedback|rating)\s*=/);
assert.doesNotMatch(learnerUpdates, /\b(partner_comment|stamp|keyword|illust_url)\s*=/);
assert.match(partnerSQL, /bookings\.partner_user_id = v_actor_id/);

function createClientContext(options = {}) {
  const reportList = { innerHTML: '' };
  const calls = [];
  const report = {
    id: 'saved-report', booking_id: bookingId, partner_name: 'Partner',
    partner_comment: 'Lovely conversation', stamp: 'cookie', keyword: 'Seoul Forest',
    illust_url: '', spoken_sentence: 'Me gusta viajar',
    summary: 'Actual learner summary', key_expressions: ['Me gusta viajar'],
    quiz_score: 67, feedback: ['Again'], created_at: '2026-10-05T00:00:00Z',
    ...options.report,
  };
  const db = {
    auth: { async getUser() { return { data: { user: { id: options.actor || partnerId } } }; } },
    async rpc(name, args) {
      calls.push({ name, args: plain(args) });
      if (name === 'list_public_partner_profiles') return { data: [], error: null };
      if (options.throwRPC) throw Error('network');
      if (options.rpcError) return { error: { message: 'denied' } };
      return { data: options.response || { success: true, learner_id: learnerId }, error: null };
    },
    from(table) {
      const query = {};
      for (const method of ['select', 'eq', 'order', 'in', 'limit']) {
        query[method] = (...args) => { calls.push({ table, method, args }); return query; };
      }
      query.then = (resolve, reject) => Promise.resolve({
        data: table === 'session_reports' ? [report] : [], error: null,
      }).then(resolve, reject);
      return query;
    },
  };
  const window = {
    supabaseClient: db, localStorage: storage,
    DayORoomAccess: { allowed: true, bookingId, learnerId, partnerId, role: 'partner' },
  };
  const document = {
    readyState: 'loading', addEventListener() {}, dispatchEvent() {},
    getElementById() { return null; },
    querySelector(selector) { return selector === '.mypage-report-list' ? reportList : null; },
    querySelectorAll() { return []; },
  };
  vm.runInNewContext(clientSource, { window, document, localStorage: storage, console: quiet, setTimeout,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  });
  return { window, calls, reportList, report };
}

function createSubmitContext(options = {}) {
  const calls = [], statuses = [], timers = [];
  let busy = false;
  const settled = new Set();
  let rewardRows = 0, reportRows = 0;
  let failReport = options.failReport;
  const window = {
    DayORoomAccess: { bookingId },
    supabaseClient: { auth: { async getUser() { return { data: { user: { id: partnerId } } }; } } },
    DayOPartnerReward: { complete() {
      calls.push('reward');
      if (options.rewardThrow) throw Error('reward');
      if (options.rewardReject) return Promise.reject(Error('reward'));
      if (options.rewardFail) return Promise.resolve({ success: false });
      if (!settled.has('reward')) { settled.add('reward'); rewardRows++; }
      return Promise.resolve({ success: true, already_rewarded: rewardRows === 1 });
    } },
    async persistSessionReport() {
      calls.push('report');
      if (failReport) { failReport = false; throw Error('report'); }
      if (!settled.has('report')) { settled.add('report'); reportRows++; }
      return { ok: true };
    },
  };
  const context = {
    window, console: quiet, localStorage: storage,
    document: { getElementById() { return { value: 'Great conversation' }; }, querySelector() { return { value: 'cookie' }; } },
    stopPartnerSentencePolling() {},
    setPartnerReportSubmitBusy(value) { busy = value; },
    setPartnerReportSubmitStatus(value) { statuses.push(value); },
    t(key) { return key; },
    setTimeout(fn) { timers.push(fn); },
    persistTranscript() {
      calls.push('transcript');
      if (options.transcriptThrow) throw Error('transcript');
      return Promise.resolve({ ok: !options.transcriptFail });
    },
  };
  const start = room.indexOf('    var partnerReportSubmitPending =');
  const end = room.indexOf('    window.submitPartnerReportAndLeave', start);
  assert.ok(start > 0 && end > start);
  vm.runInNewContext(room.slice(start, end), context);
  return { window, calls, statuses, timers, busy: () => busy, counts: () => ({ rewardRows, reportRows }) };
}

async function run() {
  const client = createClientContext();
  const card = { partnerComment: 'Edited note', stamp: 'cookie', keyword: 'Pasta', illustUrl: null, sentence: 'Partner-selected legacy sentence', summary: 'must not write', quiz_score: 100 };
  assert.equal((await client.window.persistSessionReport(card)).ok, true);
  assert.equal((await client.window.persistSessionReport(card)).ok, true);
  const payload = client.calls[0].args.p_report;
  assert.deepEqual(Object.keys(payload).sort(), ['illust_url', 'keyword', 'partner_comment', 'partner_name', 'stamp']);
  assert.equal(payload.partner_comment, 'Edited note');
  assert.ok(!('spoken_sentence' in payload), 'partner cannot overwrite learner sentence');
  assert.equal(client.calls[0].args.p_booking_id, bookingId);
  assert.deepEqual(client.calls[0].args, client.calls[1].args, 'retry uses the same booking identity');
  for (const options of [{ throwRPC: true }, { rpcError: true }, { response: { success: true, learner_id: partnerId } }]) {
    assert.equal((await createClientContext(options).window.persistSessionReport(card)).ok, false);
  }
  const outsider = createClientContext({ actor: learnerId });
  assert.equal((await outsider.window.persistSessionReport(card)).ok, false);
  assert.equal(outsider.calls.length, 0);

  for (const options of [{ rewardThrow: true }, { rewardReject: true }, { rewardFail: true }, { transcriptThrow: true }, { transcriptFail: true }, { failReport: true }]) {
    const submit = createSubmitContext(options);
    await submit.window.executePartnerPayoutAndExit();
    assert.deepEqual(submit.calls.slice().sort(), ['report', 'reward', 'transcript'], 'each persistence task starts despite another failure');
    assert.equal(submit.timers.length, 0, 'failure stays available for retry');
    assert.equal(submit.busy(), false);
    if (options.failReport) {
      assert.deepEqual(submit.counts(), { rewardRows: 1, reportRows: 0 });
      await submit.window.executePartnerPayoutAndExit();
      assert.deepEqual(submit.counts(), { rewardRows: 1, reportRows: 1 });
      assert.equal(submit.timers.length, 1);
    }
  }
  const submit = createSubmitContext();
  await Promise.all([submit.window.executePartnerPayoutAndExit(), submit.window.executePartnerPayoutAndExit()]);
  assert.deepEqual(submit.calls.slice().sort(), ['report', 'reward', 'transcript']);
  await submit.window.executePartnerPayoutAndExit();
  assert.equal(submit.calls.length, 3, 'success is not submitted again before navigation');
  assert.equal(submit.busy(), true);
  assert.equal(submit.timers.length, 1);

  const loaded = createClientContext({ actor: learnerId });
  await loaded.window.loadUserReports();
  assert.equal(loaded.window.__dayoTalkAlbum.length, 1);
  assert.equal(loaded.window.__dayoTalkAlbum[0].spoken_sentence, 'Me gusta viajar');
  assert.deepEqual(plain(loaded.window.__dayoTalkAlbum[0].key_expressions), ['Me gusta viajar']);
  assert.match(loaded.reportList.innerHTML, /Seoul Forest/);
  assert.ok(loaded.calls.some((call) => call.table === 'session_reports' && call.method === 'eq' && call.args[0] === 'learner_id' && call.args[1] === learnerId));
  const noteOnly = createClientContext({ actor: learnerId, report: { spoken_sentence: '', summary: '', key_expressions: [] } });
  await noteOnly.window.loadUserReports();
  assert.equal(noteOnly.window.__dayoTalkAlbum.length, 1, 'partner-only report is not discarded');
  const html = noteOnly.window.renderReportDetailHtml(noteOnly.window.__dayoTalkAlbum[0]);
  assert.match(html, /Lovely conversation/);
  assert.doesNotMatch(html, /pottery|서울의 숨은 카페|cute coffee/);
  console.log('Session report persistence fixtures passed: independent failures, double-click/retry, partner payload ownership, learner fields, multilingual My Page load, note-only reports, syntax and mirror checks.');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
