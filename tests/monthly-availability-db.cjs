/* In-memory PostgreSQL test only. Never reads credentials or connects to production. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_PATH||'@electric-sql/pglite');
const root=path.resolve(__dirname,'..');
const ids={partner:'11111111-1111-4111-8111-111111111111',other:'22222222-2222-4222-8222-222222222222',user:'33333333-3333-4333-8333-333333333333',admin:'44444444-4444-4444-8444-444444444444'};
(async()=>{
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table profiles(id uuid primary key,role text);grant select on profiles to authenticated;
 create function dayo_is_admin() returns boolean language sql stable security definer as $$select exists(select 1 from profiles where id=auth.uid() and role='admin')$$;
 create table availability_slots(id uuid primary key default gen_random_uuid(),partner_id uuid not null,slot_time text not null,status text not null default 'available' constraint availability_slots_status_check check(status in('available','booked')),created_at timestamptz default now(),updated_at timestamptz default now(),unique(partner_id,slot_time));
 create table bookings(id uuid primary key default gen_random_uuid(),slot_id uuid,partner_id uuid,status text,scheduled_at timestamptz);
 insert into profiles values('${ids.partner}','partner'),('${ids.other}','partner'),('${ids.user}','user'),('${ids.admin}','admin');
 insert into availability_slots(partner_id,slot_time) values('${ids.partner}','weekly:mon|10:00');`);
 const before=await db.query('select * from availability_slots');
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/084_partner_monthly_availability.sql'),'utf8'));
 assert.deepEqual((await db.query('select * from availability_slots')).rows,before.rows,'migration does not rewrite legacy slots');
 const dates=(await db.query("select (clock_timestamp() at time zone 'Asia/Seoul')::date::text as today, ((clock_timestamp() at time zone 'Asia/Seoul')::date+2)::text as target")).rows[0];
 async function as(who,sql){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[who]]);await db.exec('set role authenticated');return db.query(sql);}
 await as('partner',`select save_partner_availability_override('${dates.target}','custom',array['10:00','10:30'])`);
 let schedule=(await as('partner','select get_partner_monthly_schedule() as data')).rows[0].data;
 assert.equal((Date.parse(schedule.end)-Date.parse(schedule.start))/86400000+1,30);
 let slots=schedule.slots.filter(s=>s.slot_time.startsWith(dates.target)&&s.status==='available');assert.equal(slots.length,2);
 const slot=slots[0];await db.exec('reset role');
 await db.query(`insert into bookings(slot_id,partner_id,status,scheduled_at) values($1,$2,'pending',availability_kst_start($3))`,[slot.id,ids.partner,slot.slot_time]);
 await db.query(`update bookings set status='confirmed' where slot_id=$1`,[slot.id]);await db.query(`update availability_slots set status='booked' where id=$1`,[slot.id]);
 await as('partner',`select save_partner_availability_override('${dates.target}','closed','{}')`);
 schedule=(await as('partner','select get_partner_monthly_schedule() as data')).rows[0].data;
 assert.equal(schedule.slots.find(s=>s.id===slot.id).status,'booked','close preserves existing confirmed reservation');
 assert(!schedule.slots.some(s=>s.slot_time.startsWith(dates.target)&&s.status==='available'));
 assert.equal(schedule.slots.find(s=>s.id===slot.id).reserved,true);
 await db.exec('reset role');await db.query('delete from availability_slots where id=$1',[slot.id]);assert.equal((await db.query('select id from availability_slots where id=$1',[slot.id])).rows.length,1);
 await db.query("update bookings set status='confirmed' where slot_id=$1",[slot.id]);
 await db.exec('reset role');
 await db.query(`update bookings set status='cancelled' where slot_id=$1`,[slot.id]);await db.query(`update availability_slots set status='available' where id=$1`,[slot.id]);
 assert.equal((await db.query('select status from availability_slots where id=$1',[slot.id])).rows[0].status,'hidden','cancel does not reopen closed override');
 await as('partner',`select save_partner_availability_override('${dates.target}','custom',array['11:00'])`);
 await as('partner',`select save_partner_weekly_template('[{"dayId":"mon","time":"12:00"}]')`);
 await as('partner','select apply_partner_weekly_template()');
 schedule=(await as('partner','select get_partner_monthly_schedule() as data')).rows[0].data;
 assert.equal(schedule.overrides.find(o=>o.date===dates.target).mode,'custom');assert.deepEqual(schedule.overrides.find(o=>o.date===dates.target).custom_slots,['11:00']);
 assert.equal(schedule.slots.filter(s=>s.slot_time.startsWith(dates.target)&&s.status==='available').length,1);
 let listed=(await as('user',`select get_booking_calendar_slots(array['${ids.partner}']::uuid[]) as data`)).rows[0].data;
 assert(listed.some(s=>s.slot_time===dates.target+'T11:00:00'),'real concrete slot ID returned');assert(!listed.some(s=>s.slot_time.includes('weekly:')));
 for(const who of ['user','other']){
  assert.equal((await as(who,'select * from partner_availability_overrides')).rows.length,0,'no cross-partner access');
 }
 assert.equal((await as('admin','select * from partner_availability_overrides')).rows.length,1);
 await assert.rejects(as('user',`select save_partner_availability_override('${dates.target}','closed','{}')`),/Partner access required/);
 await assert.rejects(as('partner',`insert into partner_availability_overrides(partner_id,date,mode) values('${ids.partner}','${dates.today}','closed')`),/permission denied/);
 await assert.rejects(as('partner',`select save_partner_availability_override(date '${dates.today}'+30,'closed','{}')`),/Invalid date/);
 await assert.rejects(as('partner',`select save_partner_availability_override('${dates.target}','custom',array['10:15'])`),/half-hour/);
 await assert.rejects(as('partner',`select save_partner_availability_override('${dates.target}','custom',array['10:00','10:00'])`),/half-hour/);
 await as('partner',`select save_partner_availability_override('${dates.target}','default','{}')`);
 assert.equal((await as('partner','select get_partner_monthly_schedule() as data')).rows[0].data.overrides[0].mode,'default');
 await db.exec('reset role');
 const far=(await db.query(`insert into availability_slots(partner_id,slot_time) values('${ids.partner}',to_char(((date '${dates.today}'+30)+time '12:00'),'YYYY-MM-DD"T"HH24:MI:SS')) returning id`)).rows[0];
 await assert.rejects(db.query(`insert into bookings(partner_id,slot_id,status) values($1,$2,'pending')`,[ids.partner,far.id]),/30 KST days/);
 const boundary=(await db.query(`insert into availability_slots(partner_id,slot_time) values('${ids.partner}',to_char(((date '${dates.today}'+29)+time '12:30'),'YYYY-MM-DD"T"HH24:MI:SS')) returning id`)).rows[0];
 await db.query(`insert into bookings(partner_id,slot_id,status) values($1,$2,'pending')`,[ids.partner,boundary.id]);
 const draft=(await db.query('select id from bookings where slot_id=$1',[boundary.id])).rows[0];
 await as('partner',`select save_partner_availability_override(date '${dates.today}'+29,'closed','{}')`);
 await db.exec('reset role');
 assert.equal((await db.query('select status from bookings where id=$1',[draft.id])).rows[0].status,'pending','closing keeps draft row, without treating it as a reservation');
 await assert.rejects(db.query("update bookings set status='confirmed' where id=$1",[draft.id]),/no longer open/,'confirmation revalidates after partner closure');
 assert.equal((await db.query('select status from bookings where id=$1',[draft.id])).rows[0].status,'pending','failed confirmation is atomic');
 // Two dense calendars exceed the default 1000-row REST cap. The JSON RPC must
 // retain every concrete row and still exclude accounts without the partner role.
 await db.exec(`insert into availability_slots(partner_id,slot_time)
   select p.id,to_char(((date '${dates.today}'+d)+time '08:30'+n*interval '30 minutes'),'YYYY-MM-DD"T"HH24:MI:SS')
   from profiles p cross join generate_series(2,29) d cross join generate_series(0,29) n
   where p.id in('${ids.partner}','${ids.other}') on conflict(partner_id,slot_time) do nothing;`);
 listed=(await as('user',`select get_booking_calendar_slots(array['${ids.partner}','${ids.other}']::uuid[]) as data`)).rows[0].data;
 assert(listed.length>1000,'calendar JSON must not truncate after 1000 real rows');
 await db.exec('reset role');await db.query("update profiles set role='user' where id=$1",[ids.other]);
 listed=(await as('user',`select get_booking_calendar_slots(array['${ids.partner}','${ids.other}']::uuid[]) as data`)).rows[0].data;
 assert(!listed.some(s=>s.partner_id===ids.other),'accounts without the partner role remain ineligible');
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select get_partner_monthly_schedule()'),/permission denied/);
 await db.exec('reset role');await db.close();
 console.log('PASS PostgreSQL: syntax, RLS/grants, own RPC, custom/closed/default, weekly override preservation, booked protection, cancel guard, concrete listing, exactly 30 KST dates: +29 allowed and +30 rejected; no production access.');
})().catch(e=>{console.error(e);process.exitCode=1});
