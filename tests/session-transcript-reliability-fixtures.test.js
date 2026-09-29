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
assert.match(roomLive, /endedAt: markSessionEnded\(access\)/);
assert.match(roomLive, /store\.saveSessionLog\(canonicalTranscript, extra\)/);
assert.match(profileStore, /backupTranscriptLocal\(canonicalTranscriptSnapshot\(transcript\)\)/);
assert.match(roomHtml, /persistTranscript\(\)\.then\(function \(transcriptResult\)/);

console.log('session transcript reliability fixtures: ok');
