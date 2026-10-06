/* Isolated PostgreSQL only: production catalog contains definitions, never customer rows or secrets. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_PATH || '@electric-sql/pglite');
const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/admin-test-session-production-contract.json')));
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/093_admin_test_sessions.sql'), 'utf8');
const ownershipIndex=process.argv.indexOf('--ownership-migration');
const ownershipPath=ownershipIndex<0?null:process.argv[ownershipIndex+1];
const uid = '11111111-1111-4111-8111-111111111111', partner = '22222222-2222-4222-8222-222222222222', admin = '33333333-3333-4333-8333-333333333333', outsider = '44444444-4444-4444-8444-444444444444';
const booking = '55555555-5555-4555-8555-555555555555', cancelled = '66666666-6666-4666-8666-666666666666';
(async () => {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
  const tables = new Map();
  for (const c of catalog.columns) {
    const type = c.data_type === 'ARRAY' ? 'text[]' : c.data_type === 'USER-DEFINED' ? 'text' : c.data_type;
    const def = `"${c.column_name}" ${type}${c.column_default ? ' default '+c.column_default : ''}${c.is_nullable === 'NO' ? ' not null' : ''}`;
    if (!tables.has(c.table_name)) tables.set(c.table_name, []);
    tables.get(c.table_name).push(def);
  }
  for (const [name, cols] of tables) await db.exec(`create table public.${name}(${cols.join(',')});`);
  await db.exec(`alter table profiles add primary key(id);alter table bookings add primary key(id);
    alter table session_reports add constraint session_reports_booking_key unique(booking_id);
    create unique index session_logs_exact_role on session_logs(booking_id,participant_role) where booking_id is not null and participant_role is not null;
    alter table partner_session_rewards add primary key(booking_id);alter table session_events add primary key(id);
    alter table ticket_lots add primary key(id);alter table ticket_allocations add primary key(id);
    alter table ticket_allocations add unique(booking_id);
    create table availability_slots(id uuid primary key default gen_random_uuid(),partner_id uuid not null,slot_time text not null,status text not null default 'available' constraint availability_slots_status_check check(status in('available','booked')),created_at timestamptz default now(),updated_at timestamptz default now(),unique(partner_id,slot_time));`);
  await db.exec(catalog.functions.find(f => f.proname === 'dayo_is_admin').definition);
  // Monthly helper dependencies remain the real existing SQL, not a replacement calendar.
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/084_partner_monthly_availability.sql'),'utf8'));
  const proposal = fs.readFileSync(path.join(root,'supabase/proposals/booking_notifications.sql'),'utf8');
  await db.exec(proposal.slice(proposal.indexOf('create table public.booking_notification_log'),proposal.indexOf('create index booking_notification_retry_idx')));
  await db.exec('create table partner_capabilities(partner_id uuid primary key,conversation_languages text[]);');
  for (const f of catalog.functions) await db.exec(f.definition);
  // Local-only rebuild of the already deployed 091; never a live migration apply.
  const pre091=require('./fixtures/admin-test-session-pre091-contract.json');
  for(const f of pre091.functions){
    const signature={cancel_my_booking:'uuid',claim_booking_notification:'uuid,text',complete_session_and_reward_partner:'uuid,uuid,integer',enqueue_booking_notification:'',refund_booking_ticket:'uuid,text'}[f.name];
    await db.exec('revoke all on function '+f.name+'('+signature+') from public,anon,authenticated,service_role');
    for(const grant of f.acl.slice(1,-1).split(',')){const role=grant.split('=')[0];if(role!=='postgres')await db.exec('grant execute on function '+f.name+'('+signature+') to '+role);}
  }
  const ticketHelper=fs.readFileSync(path.join(root,'supabase/migrations/055_ticket_lot_issuance.sql'),'utf8');
  await db.exec(ticketHelper.slice(ticketHelper.indexOf('create function public.refresh_ticket_balance_cache'),ticketHelper.indexOf('create function public.admin_grant_tickets')));
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/091_partner_booking_cancellation.sql'),'utf8'));
  const post091=require('./fixtures/admin-test-session-post091-functions.json');
  for(const f of post091.functions)await db.exec(f.definition); // Exact live whitespace/fingerprints.
  if(ownershipPath)await db.exec(fs.readFileSync(ownershipPath,'utf8'));
  const reportMergeBefore=(await db.query("select pg_get_functiondef('merge_partner_session_report(uuid,jsonb)'::regprocedure) d")).rows[0].d;
  await db.exec(`create trigger enforce_booking_four_hour_minimum before insert or update of status,scheduled_at on bookings for each row execute function enforce_booking_four_hour_minimum();
    create trigger capture_booking_matching_snapshot before insert or update on bookings for each row execute function capture_booking_matching_snapshot();
    create trigger enqueue_booking_notification after update of status on bookings for each row execute function enqueue_booking_notification();
    create trigger sync_confirmed_booking_preferences after update of status on bookings for each row execute function sync_confirmed_booking_preferences();
    alter table bookings enable row level security;
    create policy participant_read on bookings for select to authenticated using(learner_id=auth.uid() or partner_user_id=auth.uid() or dayo_is_admin());
    grant select on bookings to authenticated;
    insert into profiles(id,role,nickname,ticket_count,point_balance) values('${uid}','user','QA User',3,0),('${partner}','partner','QA Partner',0,12000),('${admin}','admin','QA Admin',0,0),('${outsider}','user','Other',0,0);`);
  // A drifted function must abort before any schema or function changes.
  const liveClaim=post091.functions.find(f=>f.proname==='claim_booking_notification');
  await db.exec(liveClaim.definition.replace(' v_key text;',' v_key text; -- unexpected drift'));
  await assert.rejects(db.exec(migration),/Production function drift: claim_booking_notification/);
  await db.exec('rollback');
  assert.equal((await db.query("select exists(select 1 from information_schema.columns where table_name='bookings' and column_name='is_test_session') flag")).rows[0].flag,false);
  await db.exec(liveClaim.definition);
  await db.exec(migration);
  assert.equal((await db.query("select pg_get_functiondef('merge_partner_session_report(uuid,jsonb)'::regprocedure) d")).rows[0].d,reportMergeBefore,'093 never overwrites 092 report ownership');
  // Strip only the original TEST additions: every deployed non-TEST body remains exact.
  for(const live of post091.functions){
    let body=(await db.query('select pg_get_functiondef(oid) d from pg_proc where proname=$1',[live.proname])).rows[0].d.replace(/\r\n/g,'\n').split('$function$')[1];
    if(live.proname==='claim_booking_notification')body=body.replace('b.is_test_session or ','').replace(' and not exists(select 1 from public.bookings b where b.id=n.booking_id and b.is_test_session)\n','');
    else if(live.proname==='enqueue_booking_notification')body=body.replace(' if new.is_test_session then return new;end if;\n','');
    else body=body.replace(" if exists(select 1 from public.bookings where id=p_booking_id and is_test_session) then\n   if p_partner_user_id is distinct from auth.uid() then raise exception 'Partner identity mismatch.' using errcode='42501';end if; return public.finish_test_session(p_booking_id,'partner');\n end if;\n",'');
    assert.equal(body,live.definition.replace(/\r\n/g,'\n').split('$function$')[1],live.proname+' deployed 091 behavior preserved exactly');
  }
  // External lead-time allowlist is outside 093; ordinary synthetic users are not allowlisted.
  await db.exec("create function dayo_can_bypass_booking_lead_time() returns boolean language sql as $$select false$$;");
  async function as(id, sql, args) {
    await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');return db.query(sql,args);
  }
  const scheduled = (await db.query("select (now()+interval '5 minutes')::text as t")).rows[0].t;
  const create = `select admin_create_test_session($1,$2,'en',$3,$4) as data`;
  await db.exec('set role anon');
  await assert.rejects(db.query(create,[uid,partner,scheduled,booking]), /permission denied/);
  for (const actor of [uid,partner,outsider]) await assert.rejects(as(actor,create,[uid,partner,scheduled,booking]), /Admin access required/);
  const made = (await as(admin,create,[uid,partner,scheduled,booking])).rows[0].data;
  assert.equal(made.booking.id,booking);assert.equal(made.booking.status,'confirmed');assert.equal(made.duration_minutes,30);
  assert.equal(made.booking.is_test_session,true);assert.equal(made.booking.slot_id,null);
  await as(admin,create,[uid,partner,scheduled,booking]);
  assert.equal((await as(admin,'select count(*)::int n from bookings')).rows[0].n,1,'idempotent creation');
  await assert.rejects(as(admin,create,[uid,partner,scheduled,cancelled.replace(/^6/,'7')]).then(async () => as(admin,create,[outsider,partner,scheduled,cancelled.replace(/^6/,'7')])), /another booking/);
  assert.equal((await as(uid,'select id from bookings where id=$1',[booking])).rows.length,1);
  assert.equal((await as(partner,'select id from bookings where id=$1',[booking])).rows.length,1);
  assert.equal((await as(outsider,'select id from bookings where id=$1',[booking])).rows.length,0,'room booking is participant-only');
  await db.exec('reset role');
  await assert.rejects(db.query('update bookings set is_test_session=false where id=$1',[booking]), /immutable/);
  await assert.rejects(db.query('update bookings set partner_rewarded=true where id=$1',[booking]), /bookings_test_no_financial_effects/);
  await assert.rejects(db.query('insert into partner_session_rewards(booking_id,partner_id) values($1,$2)',[booking,partner]), /cannot allocate/);
  await assert.rejects(db.query('insert into ticket_allocations(booking_id,ticket_lot_id) values($1,gen_random_uuid())',[booking]), /cannot allocate/);
  assert.equal((await as(uid,`select complete_learner_session('${booking}','normal') as d`)).rows[0].d.code,'session_in_progress','25-minute flow unchanged');
  assert.equal((await as(uid,`select deduct_ticket_and_confirm_booking('${uid}','${booking}') as d`)).rows[0].d.ticket_deducted,false);
  await assert.rejects(as(uid,`select refund_booking_ticket('${booking}','tech_issue')`),/permission denied/,'production refund helper is not browser-callable');
  await assert.rejects(as(partner,`select refund_booking_ticket('${booking}','tech_issue')`),/permission denied/);
  await db.exec('reset role');
  assert.equal((await db.query(`select refund_booking_ticket('${booking}','tech_issue') as d`)).rows[0].d.refunded,false,'server TEST refund guard');
  await assert.rejects(as(uid,`select finish_test_session('${booking}','learner')`), /permission denied/,'private helper is not a browser RPC');
  await assert.rejects(as(outsider,`select complete_learner_session('${booking}','normal')`), /User booking access/);
  await as(admin,create,[uid,partner,scheduled,cancelled]);
  await as(uid,`select cancel_my_booking('${cancelled}')`);await as(uid,`select cancel_my_booking('${cancelled}')`);
  // Move ONLY synthetic local booking into the genuine completion window.
  await db.exec('reset role');await db.query("update bookings set scheduled_at=now()-interval '26 minutes' where id=$1",[booking]);
  await as(uid,`select log_session_event(gen_random_uuid(),'${booking}','room_entered','{}')`);
  await as(partner,`select log_session_event(gen_random_uuid(),'${booking}','media_connected','{}')`);
  const transcript = [{id:'qa-original-1',speaker:'learner',text:'I went to a cafe.',timestamp:new Date().toISOString()}];
  const saved = (await as(uid,`select upsert_session_transcript($1,$2::jsonb,now()-interval '26 minutes',now()) as d`,[booking,JSON.stringify(transcript)])).rows[0].d;
  assert.equal(saved.success,true);assert.equal(saved.item_count,1);
  const partnerSaved = (await as(partner,`select upsert_session_transcript($1,$2::jsonb,now()-interval '26 minutes',now()) as d`,[booking,JSON.stringify([{...transcript[0],id:'qa-partner-1',speaker:'partner'}])])).rows[0].d;
  assert.equal(partnerSaved.success,true);assert.equal(partnerSaved.participant_role,'partner');
  const learnerReport = {summary:'QA recap',spoken_sentence:'I went to a cafe.',quiz_score:80,feedback:[{type:'correction',original:'I am very agree.',suggested:'I strongly agree.'}]};
  await as(uid,`select merge_learner_session_report($1,$2::jsonb)`,[booking,JSON.stringify(learnerReport)]);
  await as(uid,`select complete_learner_session('${booking}','normal')`);
  for(let retry=0;retry<2;retry++) {
    const reward = (await as(partner,`select complete_session_and_reward_partner('${booking}','${partner}',999999) as d`)).rows[0].d;
    assert.equal(reward.success,true);assert.equal(reward.rewarded_points,0);assert.equal(reward.partner_rewarded,false);
    await as(partner,`select merge_partner_session_report($1,$2::jsonb)`,[booking,JSON.stringify({partner_comment:'QA Letter',stamp:'cookie',keyword:'Cafe',...(ownershipPath?{spoken_sentence:'Unauthorized edit',summary:'Unauthorized recap',quiz_score:0,feedback:[]}: {})})]);
  }
  await db.exec('reset role');
  const report=(await db.query('select * from session_reports where booking_id=$1',[booking])).rows[0];
  assert.equal(report.summary,'QA recap');assert.equal(report.quiz_score,80);assert.equal(report.partner_comment,'QA Letter');assert.equal(report.stamp,'cookie');assert.equal(report.feedback.length,1);
  assert.equal(report.spoken_sentence,learnerReport.spoken_sentence,'093 with 092 preserves learner sentence');
  assert.equal((await db.query('select count(*)::int n from session_logs where booking_id=$1',[booking])).rows[0].n,2);
  assert.equal((await db.query('select ticket_count from profiles where id=$1',[uid])).rows[0].ticket_count,3);
  assert.equal((await db.query('select point_balance from profiles where id=$1',[partner])).rows[0].point_balance,12000);
  for (const table of ['ticket_allocations','partner_session_rewards','orders','booking_notification_log']) assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0,table+' remains empty');
  assert.equal((await db.query('select count(*)::int n from bookings where not is_test_session')).rows[0].n,0,'business KPI excludes QA');
  // Even an accidentally queued TEST notification can never be claimed by the worker.
  await db.query(`insert into booking_notification_log(event_key,booking_id,event_type,recipient_role,recipient_user_id,snapshot)
    values('booking_confirmed:'||$1::text||':learner',$1::uuid,'booking_confirmed','learner',$2::uuid,'{}')`,[booking,uid]);
  assert.equal((await db.query('select * from claim_booking_notification()')).rows.length,0);
  assert.equal((await db.query('select status from booking_notification_log where booking_id=$1',[booking])).rows[0].status,'skipped');
  // Real future capacity is not occupied by a test at the same partner/time.
  const capacityStart = (await db.query("select (date_trunc('hour',now())+interval '5 hours')::text t")).rows[0].t;
  await as(admin,create,[uid,partner,capacityStart,'88888888-8888-4888-8888-888888888888']);
  await db.exec('reset role');
  await db.query(`insert into availability_slots(partner_id,slot_time) values($1,to_char($2::timestamptz at time zone 'Asia/Seoul','YYYY-MM-DD"T"HH24:MI:SS'))`,[partner,capacityStart]);
  const slots=(await as(uid,`select get_booking_calendar_slots(array['${partner}'::uuid]) as d`)).rows[0].d;
  assert.equal(slots.length,1,'test booking cannot consume normal capacity');
  await db.exec('reset role');await db.query("insert into partner_capabilities values($1,array['en'])",[partner]);
  const adminSlots=(await as(admin,`select get_admin_partner_availability('${partner}') d`)).rows[0].d.slots;
  assert.equal(adminSlots.length,1);assert.equal(adminSlots[0].status,'available');
  const monthlySlots=(await as(partner,'select get_partner_monthly_schedule() d')).rows[0].d.slots;
  assert.equal(monthlySlots[0].reserved,false,'partner UI must not show TEST as reserved');
  // An ordinary booking still hits the real four-hour cutoff; TEST bypass never leaks.
  await db.exec('reset role');
  await assert.rejects(db.query("insert into bookings(learner_id,partner_user_id,partner_id,scheduled_at,status) values($1,$2,$2,now()+interval '5 minutes','confirmed')",[uid,partner]), /4|four|hours/i);
  // Control: the unchanged real paid completion path still awards exactly once.
  const paidBooking='99999999-9999-4999-8999-999999999999';
  await db.query(`insert into bookings(id,learner_id,partner_id,partner_user_id,status,scheduled_at,end_reason,ended_at,ticket_deducted)
    values($1,$2,$3,$3,'completed',now()-interval '26 minutes','normal',now(),true)`,[paidBooking,uid,partner]);
  await db.query("insert into session_events(booking_id,actor_user_id,event_type,payload) values($1,$2,'media_connected','{}')",[paidBooking,partner]);
  for(let i=0;i<2;i++) assert.equal((await as(partner,`select complete_session_and_reward_partner('${paidBooking}','${partner}',999999) d`)).rows[0].d.rewarded_points,6000);
  await db.exec('reset role');
  assert.equal((await db.query('select point_balance from profiles where id=$1',[partner])).rows[0].point_balance,18000);
  assert.equal((await db.query('select count(*)::int n from partner_session_rewards')).rows[0].n,1,'only real control paid once');
  // Post-091 control: ordinary partner cancellation still refunds, reopens and queues both recipients.
  const lateBooking='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',lateSlot='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',lateLot='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await db.query("insert into availability_slots(id,partner_id,slot_time,status) values($1,$2,to_char((date_trunc('hour',now())+interval '5 hours 30 minutes') at time zone 'Asia/Seoul','YYYY-MM-DD\"T\"HH24:MI:SS'),'booked')",[lateSlot,partner]);
  await db.query("insert into bookings(id,learner_id,partner_id,partner_user_id,slot_id,status,scheduled_at,ticket_deducted,language) values($1,$2,$3,$3,$4,'confirmed',date_trunc('hour',now())+interval '5 hours 30 minutes',true,'en')",[lateBooking,uid,partner,lateSlot]);
  await db.query("insert into ticket_lots(id,user_id,quantity_remaining,quantity_issued,source,source_id,expires_at) values($1,$2,0,1,'purchase',gen_random_uuid(),now()+interval '30 days')",[lateLot,uid]);
  await db.query("insert into ticket_allocations(booking_id,ticket_lot_id,quantity,consumed_at) values($1,$2,1,now())",[lateBooking,lateLot]);
  for(let retry=0;retry<2;retry++)assert.equal((await as(partner,'select cancel_my_partner_booking($1,\'health\',null,true) d',[lateBooking])).rows[0].d.success,true);
  await db.exec('reset role');
  assert.equal((await db.query('select status from availability_slots where id=$1',[lateSlot])).rows[0].status,'available');
  assert.equal((await db.query('select quantity_remaining from ticket_lots where id=$1',[lateLot])).rows[0].quantity_remaining,1);
  assert.equal((await db.query('select count(*)::int n from partner_cancellation_penalties where booking_id=$1',[lateBooking])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from booking_notification_log where booking_id=$1',[lateBooking])).rows[0].n,2);
  assert.equal((await db.query('select point_balance from profiles where id=$1',[partner])).rows[0].point_balance,18000,'cancellation never debits existing balance');
  assert.equal((await db.query("select * from claim_booking_notification($1,'booking_cancelled')",[lateBooking])).rows.length,1,'partner cancellation remains deliverable after TEST exclusion');
  // Future earned reward settles the existing debt exactly once; retry preserves net/gross.
  const offsetBooking='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  await db.query("insert into bookings(id,learner_id,partner_id,partner_user_id,status,scheduled_at,end_reason,ended_at,ticket_deducted) values($1,$2,$3,$3,'completed',now()-interval '26 minutes','normal',now(),true)",[offsetBooking,uid,partner]);
  await db.query("insert into session_events(booking_id,actor_user_id,event_type,payload) values($1,$2,'media_connected','{}')",[offsetBooking,partner]);
  for(let retry=0;retry<2;retry++){
    const reward=(await as(partner,'select complete_session_and_reward_partner($1,$2,999999) d',[offsetBooking,partner])).rows[0].d;
    assert.equal(reward.rewarded_points,0);assert.equal(reward.penalty_offset,6000);assert.equal(reward.gross_reward_amount,6000);
  }
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from partner_cancellation_penalty_offsets')).rows[0].n,1);
  assert.equal((await db.query('select point_balance from profiles where id=$1',[partner])).rows[0].point_balance,18000);
  await db.close();console.log('PASS: actual catalog SQL: admin-only/RLS, retry, timing, transcript/report, TEST zero financial/email effects, capacity/cutoff, strict drift abort, exact post-091 bodies, ordinary cancellation/refund/outbox and reward-offset retry'+(ownershipPath?', 092 ownership preserved.':'.'));
})().catch(e=>{console.error(e.stack?.split('\n').slice(0,5).join('\n'), e.where || '', e.detail || '');process.exit(1);});
