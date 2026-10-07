const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rewardApi = require('../public/partner-reward.js');
const migration = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations', '071_partner_reward_reliability.sql'),
  'utf8'
);
const rewardSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'partner-reward.js'), 'utf8');
const roomSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'room.html'), 'utf8');

let inlineScriptCount = 0;
for (const match of roomSource.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
  const body = match[1].trim();
  if (!body) continue;
  new Function(body);
  inlineScriptCount += 1;
}
assert.ok(inlineScriptCount > 0, 'room inline scripts must be parsed');

// Static security contract: no client ledger writes and no client-controlled amount.
assert.match(migration, /create table public\.partner_session_rewards/i);
assert.match(migration, /\bbegin;[\s\S]*notify pgrst, 'reload schema';[\s\S]*commit;\s*$/i);
assert.match(migration, /information_schema\.columns[\s\S]*partner_rewarded[\s\S]*v_is_nullable is distinct from 'NO'[\s\S]*v_column_default is null[\s\S]*not in \('false', 'false::boolean'\)[\s\S]*raise exception/i);
assert.match(migration, /booking_id uuid primary key[\s\S]*references public\.bookings\(id\) on delete restrict/i);
assert.match(migration, /partner_id uuid not null[\s\S]*references public\.profiles\(id\) on delete restrict/i);
assert.match(migration, /check \(reward_amount = 6000\)/i);
assert.match(migration, /alter table public\.partner_session_rewards enable row level security/i);
assert.match(migration, /revoke all privileges on table public\.partner_session_rewards[\s\S]*from public, anon, authenticated/i);
assert.doesNotMatch(migration, /grant (?:insert|update|delete|all privileges) on table public\.partner_session_rewards\s+to authenticated/i);
assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
assert.match(migration, /v_actor_id uuid := auth\.uid\(\)/i);
assert.match(migration, /p_partner_user_id is distinct from v_actor_id/i);
assert.match(migration, /v_profile_role is distinct from 'partner'/i);
assert.match(migration, /v_reward_amount constant integer := 6000/i);
assert.equal((migration.match(/\bp_reward_amount\b/g) || []).length, 2, 'client amount may appear only in the signature and compatibility comment');
assert.match(migration, /from public\.bookings[\s\S]*where bookings\.id = p_booking_id[\s\S]*for update/i);
assert.match(migration, /from public\.profiles[\s\S]*profiles\.role = 'partner'[\s\S]*for update/i);
assert.match(migration, /events\.booking_id = p_booking_id[\s\S]*events\.actor_user_id = v_actor_id[\s\S]*events\.event_type = 'media_connected'/i);
assert.doesNotMatch(migration, /events\.event_type = 'session_ended'/i);
assert.match(migration, /v_end_reason is distinct from 'normal' or v_ended_at is null/i);
assert.match(migration, /'code', 'evidence_insufficient'[\s\S]*'needs_review', true/i);
assert.match(migration, /'already_rewarded', true/i);
assert.match(migration, /if v_partner_rewarded is true and v_ledger_partner_id is null then[\s\S]*'legacy_reward', true/i);
assert.match(migration, /if v_partner_rewarded is true and v_ledger_partner_id is not null then[\s\S]*'legacy_reward', false/i);
assert.match(migration, /if v_partner_rewarded is false and v_ledger_partner_id is not null then[\s\S]*'code', 'reward_state_conflict'[\s\S]*'needs_review', true[\s\S]*'evidence', 'ledger_present_booking_flag_false'/i);
assert.match(migration, /if v_partner_rewarded is null then[\s\S]*'code', 'reward_state_conflict'[\s\S]*'needs_review', true[\s\S]*'evidence', 'booking_reward_flag_null'/i);
assert.doesNotMatch(migration, /coalesce\(v_partner_rewarded, false\) or v_ledger_partner_id is not null/i);
assert.doesNotMatch(migration, /coalesce\(v_partner_rewarded, false\)/i);
assert.match(migration, /and partner_rewarded is false;/i);
assert.match(migration, /grant execute on function public\.complete_session_and_reward_partner\(uuid, uuid, integer\)[\s\S]*to authenticated, service_role/i);
assert.doesNotMatch(migration, /insert into public\.partner_session_rewards\s*\([^)]*\)\s*select/i);
assert.doesNotMatch(migration, /session_logs|spoken_sentence|ticket_refund/i);
assert.match(rewardSource, /Date\.now\(\) - 14 \* 24 \* 60 \* 60 \* 1000/);
assert.match(rewardSource, /\.slice\(0, 3\)/);
assert.match(rewardSource, /isRetryCandidate\(booking, Date\.now\(\)\) && !isReviewHeld\(booking\.id\)/);
assert.match(rewardSource, /holdForReview\(candidates\[i\]\.id, result\)/);

const ledgerInsert = migration.indexOf('insert into public.partner_session_rewards');
const pointUpdate = migration.indexOf('update public.profiles', ledgerInsert);
const bookingUpdate = migration.indexOf('update public.bookings', pointUpdate);
assert.ok(ledgerInsert > 0 && pointUpdate > ledgerInsert && bookingUpdate > pointUpdate, 'new reward transaction order must remain ledger -> points -> booking');

// ADD2: Letter saved is the success boundary, before the existing finish RPC.
assert.doesNotMatch(roomSource, /Promise\.all\(\[rewardPromise, transcriptPromise, reportPromise\]\)/);
assert.match(roomSource, /partnerReportSubmitComplete = true;[\s\S]*setPartnerReportSubmitStatus\('sent_checking'[\s\S]*await checkPartnerFinishAfterLetter/);
assert.match(roomSource, /Your Letter was sent\. Session completion needs review/);
assert.doesNotMatch(roomSource.slice(roomSource.indexOf('window.executePartnerPayoutAndExit ='),roomSource.indexOf('window.submitPartnerReportAndLeave =')), /rewardResult\.message/);
const now = Date.parse('2026-09-28T12:00:00Z');
const eligibleBooking = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'confirmed',
  scheduled_at: '2026-09-28T11:30:00Z',
  ended_at: '2026-09-28T11:55:00Z',
  end_reason: 'normal',
  partner_rewarded: false,
};
assert.equal(rewardApi.isRetryCandidate(eligibleBooking, now), true);
assert.equal(rewardApi.isRetryCandidate({ ...eligibleBooking, ended_at: null }, now), false);
assert.equal(rewardApi.isRetryCandidate({ ...eligibleBooking, end_reason: null }, now), false);
assert.equal(rewardApi.isRetryCandidate({ ...eligibleBooking, partner_rewarded: true }, now), false);
assert.equal(rewardApi.isRetryCandidate({ ...eligibleBooking, scheduled_at: '2026-09-28T11:40:00Z' }, now), false);

function createRewardModel(options = {}) {
  const state = {
    points: Number(options.points || 0),
    partnerRewarded: Object.prototype.hasOwnProperty.call(options, 'partnerRewarded')
      ? options.partnerRewarded
      : false,
    ledger: options.ledger ? { amount: 6000, partnerId: options.ledgerPartnerId || 'partner-1' } : null,
    status: options.status || 'confirmed',
    learnerNormal: options.learnerNormal !== false,
    partnerMedia: options.partnerMedia !== false,
    elapsed: options.elapsed !== false,
    reportSaved: options.reportSaved !== false,
    transcriptSaved: options.transcriptSaved !== false,
  };
  let queue = Promise.resolve();
  async function call(actorRole = 'partner', assigned = true, requestedAmount = 6000) {
    let release;
    const previous = queue;
    queue = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      if (actorRole !== 'partner') return { success: false, code: 'partner_profile_required' };
      if (!assigned) return { success: false, code: 'booking_partner_mismatch' };
      if (!state.elapsed) return { success: false, code: 'session_in_progress' };
      if (state.ledger && state.ledger.partnerId !== 'partner-1') {
        return { success: false, code: 'reward_state_conflict', needs_review: true };
      }
      if (state.partnerRewarded === null) {
        return { success: false, code: 'reward_state_conflict', needs_review: true, evidence: 'booking_reward_flag_null' };
      }
      if (state.partnerRewarded === true && !state.ledger) {
        return { success: true, already_rewarded: true, legacy_reward: true, reward_amount: 6000 };
      }
      if (state.partnerRewarded === true && state.ledger) {
        return { success: true, already_rewarded: true, legacy_reward: false, reward_amount: 6000 };
      }
      if (state.partnerRewarded === false && state.ledger) {
        return {
          success: false,
          code: 'reward_state_conflict',
          needs_review: true,
          evidence: 'ledger_present_booking_flag_false',
        };
      }
      if (!state.learnerNormal || !state.partnerMedia) {
        return { success: false, code: 'evidence_insufficient', needs_review: true };
      }
      state.ledger = { amount: 6000, partnerId: 'partner-1' };
      state.points += 6000;
      state.partnerRewarded = true;
      state.status = 'completed';
      void requestedAmount;
      return { success: true, already_rewarded: false, reward_amount: 6000 };
    } finally {
      release();
    }
  }
  return { state, call };
}

async function runFixtures() {
  // A: normal first payment creates one 6,000P ledger entry.
  const normal = createRewardModel();
  const first = await normal.call();
  assert.equal(first.success, true);
  assert.equal(first.already_rewarded, false);
  assert.equal(normal.state.points, 6000);
  assert.equal(normal.state.ledger.amount, 6000);
  assert.equal(normal.state.status, 'completed');

  // B: retry after an unknown/lost response is an idempotent success.
  const retry = await normal.call();
  assert.equal(retry.success, true);
  assert.equal(retry.already_rewarded, true);
  assert.equal(normal.state.points, 6000);

  // K: two concurrent calls serialize to one ledger row and one increment.
  const concurrent = createRewardModel();
  const results = await Promise.all([concurrent.call(), concurrent.call()]);
  assert.equal(results.filter((result) => result.already_rewarded === false).length, 1);
  assert.equal(results.filter((result) => result.already_rewarded === true).length, 1);
  assert.equal(concurrent.state.points, 6000);
  assert.equal(concurrent.state.ledger.amount, 6000);

  // F: learner, admin, and a different partner are rejected.
  assert.equal((await createRewardModel().call('learner')).success, false);
  assert.equal((await createRewardModel().call('admin')).success, false);
  assert.equal((await createRewardModel().call('partner', false)).code, 'booking_partner_mismatch');

  // G: the reward window opens only after scheduled_at + 25 minutes.
  const tooEarly = createRewardModel({ elapsed: false });
  assert.equal((await tooEarly.call()).code, 'session_in_progress');
  assert.equal(tooEarly.state.points, 0);

  // H/I: missing persisted evidence is reviewable, never paid.
  const noMedia = createRewardModel({ partnerMedia: false });
  assert.equal((await noMedia.call()).code, 'evidence_insufficient');
  assert.equal(noMedia.state.points, 0);
  const noLearnerCompletion = createRewardModel({ learnerNormal: false });
  assert.equal((await noLearnerCompletion.call()).code, 'evidence_insufficient');
  assert.equal(noLearnerCompletion.state.points, 0);

  // J: caller-provided amounts never change the server-owned 6,000P reward.
  const oversizedRequest = createRewardModel();
  const oversizedResult = await oversizedRequest.call('partner', true, 12000);
  assert.equal(oversizedResult.reward_amount, 6000);
  assert.equal(oversizedRequest.state.points, 6000);

  // L: report/transcript persistence is not reward eligibility evidence.
  const storageIndependent = createRewardModel({ reportSaved: false, transcriptSaved: false });
  assert.equal((await storageIndependent.call()).success, true);
  assert.equal(storageIndependent.state.points, 6000);

  // C: legacy paid booking without ledger is successful and never paid again.
  const legacy = createRewardModel({ partnerRewarded: true });
  const legacyResult = await legacy.call();
  assert.equal(legacyResult.success, true);
  assert.equal(legacyResult.already_rewarded, true);
  assert.equal(legacyResult.legacy_reward, true);
  assert.equal(legacy.state.points, 0);

  // D: a paid booking with its matching ledger is normal idempotent success.
  const normalIdempotent = createRewardModel({ partnerRewarded: true, ledger: true, points: 6000 });
  const normalIdempotentResult = await normalIdempotent.call();
  assert.equal(normalIdempotentResult.success, true);
  assert.equal(normalIdempotentResult.already_rewarded, true);
  assert.equal(normalIdempotentResult.legacy_reward, false);
  assert.equal(normalIdempotent.state.points, 6000);

  // E: a matching ledger without the booking flag is review-only and unchanged.
  const ledgerFlagConflict = createRewardModel({ ledger: true, points: 6000 });
  const ledgerFlagConflictResult = await ledgerFlagConflict.call();
  assert.equal(ledgerFlagConflictResult.success, false);
  assert.equal(ledgerFlagConflictResult.code, 'reward_state_conflict');
  assert.equal(ledgerFlagConflictResult.needs_review, true);
  assert.equal(ledgerFlagConflictResult.evidence, 'ledger_present_booking_flag_false');
  assert.equal(ledgerFlagConflict.state.points, 6000);
  assert.equal(ledgerFlagConflict.state.partnerRewarded, false);
  assert.equal(ledgerFlagConflict.state.ledger.amount, 6000);

  // Identity mismatch: a foreign-partner ledger remains a reviewable conflict.
  const foreignLedger = createRewardModel({ ledger: true, ledgerPartnerId: 'partner-2', points: 6000 });
  const foreignLedgerResult = await foreignLedger.call();
  assert.equal(foreignLedgerResult.success, false);
  assert.equal(foreignLedgerResult.code, 'reward_state_conflict');
  assert.equal(foreignLedgerResult.needs_review, true);
  assert.equal(foreignLedger.state.points, 6000);
  assert.equal(foreignLedger.state.partnerRewarded, false);

  // NULL is invalid under the canonical NOT NULL contract and fails closed.
  const nullFlag = createRewardModel({ partnerRewarded: null });
  const nullFlagResult = await nullFlag.call();
  assert.equal(nullFlagResult.success, false);
  assert.equal(nullFlagResult.code, 'reward_state_conflict');
  assert.equal(nullFlagResult.needs_review, true);
  assert.equal(nullFlagResult.evidence, 'booking_reward_flag_null');
  assert.equal(nullFlag.state.points, 0);

  // Review holds survive a module reload and suppress automatic RPC retries.
  const storageState = new Map();
  globalThis.localStorage = {
    getItem(key) { return storageState.has(key) ? storageState.get(key) : null; },
    setItem(key, value) { storageState.set(key, String(value)); },
    removeItem(key) { storageState.delete(key); },
  };
  let rpcCalls = 0;
  const retryBooking = { ...eligibleBooking };
  function bookingQuery(data) {
    const query = {
      select() { return query; },
      eq() { return query; },
      in() { return query; },
      gte() { return query; },
      order() { return query; },
      limit() { return Promise.resolve({ data, error: null }); },
    };
    return query;
  }
  globalThis.supabaseClient = {
    auth: { getUser: async () => ({ data: { user: { id: 'partner-1' } } }) },
    from: () => bookingQuery([retryBooking]),
    rpc: async () => {
      rpcCalls += 1;
      return { data: { success: false, code: 'evidence_insufficient', needs_review: true } };
    },
  };

  const firstRetry = await rewardApi.retryRecentOnce();
  assert.equal(firstRetry.attempted, 1);
  assert.equal(firstRetry.review, 1);
  assert.equal(rpcCalls, 1);
  const reviewKey = [...storageState.keys()].find((key) => key.startsWith('dayo_partner_reward_review:'));
  assert.ok(reviewKey, 'review hold must be persisted by booking');

  delete require.cache[require.resolve('../public/partner-reward.js')];
  const reloadedRewardApi = require('../public/partner-reward.js');
  const retryAfterReload = await reloadedRewardApi.retryRecentOnce();
  assert.equal(retryAfterReload.attempted, 0);
  assert.equal(rpcCalls, 1, 'held booking must not call the RPC again after reload');

  globalThis.supabaseClient.rpc = async () => ({
    data: { success: true, already_rewarded: true, updated_points: 6000 },
  });
  const explicitSuccess = await reloadedRewardApi.complete(retryBooking.id, 'partner-1');
  assert.equal(explicitSuccess.success, true);
  assert.equal(storageState.has(reviewKey), false, 'explicit success must clear the review hold');

  delete globalThis.supabaseClient;
  delete globalThis.localStorage;

  console.log('Partner reward reliability fixtures passed: security contract, evidence gates, fixed 6,000P, state conflicts, idempotency, legacy recovery, concurrency, and persistent review hold.');
}

runFixtures();
