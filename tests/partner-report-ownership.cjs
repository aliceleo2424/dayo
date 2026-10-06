// SQL ownership regression: executes the real PL/pgSQL functions in local PGlite.
// Optional --production-catalog <read-only catalog JSON> uses audited deployed
// definitions; without it, use the equivalent existing 046/047 RPC contracts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const catalogIndex = process.argv.indexOf('--production-catalog');
const catalog = catalogIndex < 0 ? null : JSON.parse(fs.readFileSync(process.argv[catalogIndex + 1], 'utf8'));
const extract = (file, name) => {
  const source = read(file), start = source.indexOf('create or replace function public.' + name + '(');
  assert.ok(start >= 0);
  const end = source.indexOf('\n$$;', start);
  assert.ok(end >= 0);
  return source.slice(start, end + 4);
};
const partnerFunction = catalog ? catalog.functions.find(f => f.signature === 'merge_partner_session_report(uuid,jsonb)').definition
  : extract('supabase/migrations/046_merge_session_reports_by_participant.sql', 'merge_partner_session_report');
const learnerFunction = catalog ? catalog.functions.find(f => f.signature === 'merge_learner_session_report(uuid,jsonb)').definition
  : extract('supabase/migrations/047_fix_learner_report_spoken_sentence.sql', 'merge_learner_session_report');
const ids = {
  learner: '11111111-1111-4111-8111-111111111111',
  partner: '22222222-2222-4222-8222-222222222222',
  stranger: '33333333-3333-4333-8333-333333333333',
  booking: '44444444-4444-4444-8444-444444444444',
  emptyBooking: '55555555-5555-4555-8555-555555555555',
};
const learnerPayload = {
  spoken_sentence: 'I really like this cafe.', summary: 'Saved learner summary',
  key_expressions: ['a quiet cafe'], quiz_score: 75, word_help: ['quiet'], rating: 5,
  feedback: [{ source: 'learner_recognized_speech', original_text: 'I am very agree.', suggested_text: 'I completely agree.' },
    { kind: 'conversation_recap', schema_version: 1, booking_id: ids.booking, metrics: { user_word_count: 7 } }],
};
const owned = ['spoken_sentence', 'summary', 'key_expressions', 'quiz_score', 'word_help', 'feedback', 'rating'];
const pick = (row, keys = owned) => Object.fromEntries(keys.map(key => [key, row[key]]));
const db = new PGlite();
let passed = 0;
function pass(name) { passed++; console.log(name + ': passed'); }
async function rpc(actor, name, payload, booking = ids.booking) {
  await db.exec('set role authenticated');
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [actor || '']);
    return (await db.query(`select public.${name}($1::uuid, $2::jsonb) as result`, [booking, JSON.stringify(payload)])).rows[0].result;
  } finally { await db.exec('reset role'); }
}
async function row(booking = ids.booking) {
  return (await db.query('select * from public.session_reports where booking_id=$1::uuid', [booking])).rows[0];
}
async function contract() {
  return (await db.query(`select
    pg_get_functiondef('public.merge_learner_session_report(uuid,jsonb)'::regprocedure) as learner,
    (select proacl::text from pg_proc where oid='public.merge_partner_session_report(uuid,jsonb)'::regprocedure) as partner_acl,
    (select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where tablename='session_reports') as policies,
    has_table_privilege('authenticated','public.session_reports','INSERT') as direct_insert,
    has_table_privilege('authenticated','public.session_reports','UPDATE') as direct_update`)).rows[0];
}
(async () => {
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth, public to authenticated;
      create table public.bookings(id uuid primary key, learner_id uuid, partner_id uuid, partner_user_id uuid, partner_name text, status text);
      create table public.session_reports(id uuid primary key default gen_random_uuid(), booking_id uuid unique,
        learner_id uuid, partner_id uuid, partner_user_id uuid, partner_name text, spoken_sentence text,
        keyword text, illust_url text, partner_comment text, stamp text, created_at timestamptz default now(),
        summary text, key_expressions jsonb not null default '[]', quiz_score integer,
        word_help jsonb not null default '[]', feedback jsonb not null default '[]', rating numeric);
      alter table public.session_reports enable row level security;
      create policy session_reports_select_learner on public.session_reports for select to authenticated using(learner_id=auth.uid());
      grant select on public.session_reports to authenticated;
      ${partnerFunction}; ${learnerFunction};
      revoke all on function public.merge_partner_session_report(uuid,jsonb), public.merge_learner_session_report(uuid,jsonb) from public, anon, authenticated;
      grant execute on function public.merge_partner_session_report(uuid,jsonb), public.merge_learner_session_report(uuid,jsonb) to authenticated, service_role;`);
    for (const booking of [ids.booking, ids.emptyBooking]) await db.query(
      'insert into public.bookings values($1,$2,$3,$3,$4,$5)', [booking, ids.learner, ids.partner, 'Test Partner', 'completed']);
    assert.equal((await rpc(ids.learner, 'merge_learner_session_report', learnerPayload)).success, true);
    assert.equal((await rpc(ids.partner, 'merge_partner_session_report', { spoken_sentence: 'BAD old write' })).success, true);
    assert.equal((await row()).spoken_sentence, 'BAD old write');
    pass('audited old RPC vulnerability reproduced');
    await rpc(ids.learner, 'merge_learner_session_report', learnerPayload);
    const before = await contract();
    const oldPartnerDefinition = (await db.query("select pg_get_functiondef('public.merge_partner_session_report(uuid,jsonb)'::regprocedure) as definition")).rows[0].definition;
    await db.exec(read('supabase/migrations/092_partner_report_field_ownership.sql'));
    assert.deepEqual(await contract(), before);
    pass('learner RPC, function grants and table security unchanged');
    const savedLearner = pick(await row());
    const partnerPayload = { partner_comment: 'Great conversation!', stamp: 'tea', keyword: 'cafe', illust_url: 'https://example.invalid/test.png' };
    assert.equal((await rpc(ids.partner, 'merge_partner_session_report', partnerPayload)).success, true);
    assert.deepEqual(pick(await row()), savedLearner);
    assert.deepEqual(pick(await row(), Object.keys(partnerPayload)), partnerPayload);
    pass('Partner Letter, Treat, theme and illustration save');
    for (const value of ['BAD partner sentence', null, '', { unexpected: 'value' }]) {
      assert.equal((await rpc(ids.partner, 'merge_partner_session_report', { ...partnerPayload, spoken_sentence: value })).success, true);
      assert.deepEqual(pick(await row()), savedLearner);
    }
    pass('spoken_sentence attempts ignored without blocking Letter/Treat');
    const attack = { ...partnerPayload, ...Object.fromEntries(owned.map(key => [key, key === 'quiz_score' ? 0 : 'BAD'])),
      learner_id: ids.stranger, partner_user_id: ids.stranger, partner_name: 'Spoofed Partner', recap: { invented: true } };
    for (let retry = 0; retry < 3; retry++) assert.equal((await rpc(ids.partner, 'merge_partner_session_report', attack)).success, true);
    assert.deepEqual(pick(await row()), savedLearner);
    assert.equal((await row()).learner_id, ids.learner);
    assert.equal((await row()).partner_user_id, ids.partner);
    assert.equal((await row()).partner_name, 'Test Partner');
    assert.equal((await db.query('select count(*)::int as n from public.session_reports')).rows[0].n, 1);
    pass('hostile payload and duplicate retries preserve learner/AI fields and identity');
    assert.equal((await rpc(ids.partner, 'merge_partner_session_report', attack, ids.emptyBooking)).success, true);
    const firstPartner = await row(ids.emptyBooking);
    assert.equal(firstPartner.spoken_sentence, null);
    assert.equal(firstPartner.summary, null);
    assert.equal(firstPartner.quiz_score, null);
    for (const key of ['key_expressions', 'feedback', 'word_help']) assert.deepEqual(firstPartner[key], []);
    pass('partner-first insert never creates learner-owned content');
    const editedLearner = { ...learnerPayload, spoken_sentence: 'Updated learner sentence', summary: 'Updated recap', quiz_score: 100 };
    assert.equal((await rpc(ids.learner, 'merge_learner_session_report', editedLearner)).success, true);
    assert.deepEqual(pick(await row()), { ...editedLearner, rating: String(editedLearner.rating) });
    assert.deepEqual(pick(await row(), Object.keys(partnerPayload)), partnerPayload);
    assert.equal((await rpc(ids.learner, 'merge_learner_session_report', editedLearner, ids.emptyBooking)).success, true);
    assert.deepEqual(pick(await row(ids.emptyBooking)), { ...editedLearner, rating: String(editedLearner.rating) });
    pass('learner updates its fields normally after either participant writes first');
    const beforeDenied = await row();
    for (const actor of [ids.learner, ids.stranger, null]) assert.equal((await rpc(actor, 'merge_partner_session_report', attack)).success, false);
    assert.equal((await rpc(ids.partner, 'merge_learner_session_report', learnerPayload)).success, false);
    assert.deepEqual(await row(), beforeDenied);
    pass('learner/stranger/anonymous partner RPC and partner learner RPC denied');
    await db.query('update public.bookings set status=$1 where id=$2', ['cancelled', ids.booking]);
    assert.equal((await rpc(ids.partner, 'merge_partner_session_report', partnerPayload)).success, false);
    assert.deepEqual(await row(), beforeDenied);
    pass('cancelled booking cannot be written');
    const migrated = (await db.query("select pg_get_functiondef('public.merge_partner_session_report(uuid,jsonb)'::regprocedure) as definition")).rows[0].definition;
    const expectedPartnerDefinition = oldPartnerDefinition
      .replace(/^\s*spoken_sentence,\r?\n/m, '')
      .replace(/^\s*nullif\(btrim\(p_report ->> 'spoken_sentence'\), ''\),\r?\n/m, '')
      .replace(/^\s*spoken_sentence = coalesce\(excluded.spoken_sentence, existing.spoken_sentence\),\r?\n/m, '');
    assert.equal(migrated.replace(/\s+/g, ' ').trim(), expectedPartnerDefinition.replace(/\s+/g, ' ').trim(), 'only the three learner-sentence write clauses change');
    assert.ok(!migrated.includes('spoken_sentence'));
    for (const key of owned) assert.ok(!migrated.includes("p_report ->> '" + key + "'"));
    pass('partner function has no learner content merge path');
    console.log(`${passed} SQL ownership regressions passed (${catalog ? 'audited production RPC baseline' : 'repository RPC baseline'}). No network or production writes.`);
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
