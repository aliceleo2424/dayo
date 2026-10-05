/* Local database and actual TypeScript formatter. No production access. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const ts=require(process.env.DAYO_TYPESCRIPT_PATH || 'typescript');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(read('admin/src/lib/partner-availability.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exportsObject,Date,Map,Set});
const fmt=exportsObject,now=Date.parse('2026-10-05T00:00:00Z');
function data(slots){return {partner_id:'partner',start:'2026-10-05',end:'2026-11-03',as_of:new Date(now).toISOString(),min_lead_hours:4,capability_configured:true,slots};}
const slot=(time,status='available')=>({id:time,slot_time:time,status});
assert.equal(fmt.groupAvailability(data([]),30,now).length,0);
const times=['2026-10-07T09:00:00','2026-10-07T09:30:00','2026-10-07T10:00:00','2026-10-08T10:30:00'];
const days=fmt.groupAvailability(data(times.map(t=>slot(t))),30,now);
assert.equal(fmt.copySchedule('Clara',days),'Clara available (KST)\n10/7: 09:00–10:30\n10/8: 10:30');
assert(fmt.copySchedule('private@example.com',days).startsWith('DayO Partner available (KST)'), 'copy never uses a contact email as a display name');
assert.equal(fmt.mergedTimes(times.slice(0,3).map(fmt.slotMs)),'09:00–10:30');
assert.equal(fmt.groupAvailability(data([slot('2026-10-05T12:30:00'),slot('2026-10-05T13:00:00')]),30,now)[0].available.length,1,'ordinary 4h boundary');
assert.equal(fmt.groupAvailability(data([slot('2026-11-03T13:00:00'),slot('2026-11-04T13:00:00')]),30,now).length,1,'KST 30 day inclusive window');
assert.equal(fmt.groupAvailability(data([slot('2026-10-12T13:00:00')]),7,now).length,0);
assert.equal(fmt.groupAvailability(data([slot('2026-10-18T13:00:00')]),14,now).length,1);
const reserved=fmt.groupAvailability(data([slot(times[0]),slot(times[0],'booked'),slot(times[1])]),30,now);
assert.equal(reserved[0].available.length,1);assert.equal(reserved[0].booked.length,1);
assert.equal(fmt.copySchedule('Clara',reserved),'Clara available (KST)\n10/7: 09:30','Booked excluded from clipboard');
assert.equal(fmt.calendarCells('2026-10').filter(Boolean).length,31);
assert.equal(fmt.shiftMonth('2027-01',1),'2027-02');
assert.equal(fmt.shiftMonth('2027-02',1),'2027-03','30 days from January 31 may span three months; do not skip February');
assert.equal(fmt.shiftMonth('2026-12',1),'2027-01');
assert.equal(fmt.kstDate(Date.parse('2026-10-04T15:00:00Z')),'2026-10-05');
assert.equal(fmt.timeLabel(fmt.slotMs('2026-10-07T00:00:00Z')),'09:00');

(async()=>{
 const db=new PGlite();
 const ids={partner:'11111111-1111-4111-8111-111111111111',user:'22222222-2222-4222-8222-222222222222',admin:'33333333-3333-4333-8333-333333333333'};
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table profiles(id uuid primary key,role text,nickname text,email text);grant select on profiles to authenticated;
 create function dayo_is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin')$$;
 create table availability_slots(id uuid primary key default gen_random_uuid(),partner_id uuid,slot_time text,status text default 'available' constraint availability_slots_status_check check(status in ('available','booked')),created_at timestamptz default now(),updated_at timestamptz default now(),unique(partner_id,slot_time));
 create table bookings(id uuid primary key default gen_random_uuid(),slot_id uuid,partner_id uuid,status text,scheduled_at timestamptz);
 insert into profiles values('${ids.partner}','partner','Partner',null),('${ids.user}','user','User',null),('${ids.admin}','admin','Admin',null);
 insert into auth.users select id from profiles;`);
 await db.exec(read('supabase/migrations/070_partner_capabilities.sql'));
 await db.exec(read('supabase/migrations/084_partner_monthly_availability.sql'));
 const protectedNames=['save_partner_weekly_template','save_partner_availability_override','refresh_partner_monthly_slots','get_booking_calendar_slots','enforce_booking_monthly_window'];
 const definitions=await db.query(`select proname,pg_get_functiondef(oid) definition from pg_proc where proname=any($1::text[]) order by proname`,[protectedNames]);
 await db.exec(read('supabase/migrations/087_admin_partner_availability.sql'));
 assert.deepEqual((await db.query(`select proname,pg_get_functiondef(oid) definition from pg_proc where proname=any($1::text[]) order by proname`,[protectedNames])).rows,definitions.rows,'all existing save/booking functions unchanged');
 async function as(who,sql){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[who]]);await db.exec('set role authenticated');return db.query(sql);}
 async function get(){return (await as('admin',`select get_admin_partner_availability('${ids.partner}') data`)).rows[0].data;}
 assert.equal((await get()).slots.length,0,'no slots');
 for(const who of ['user','partner'])await assert.rejects(as(who,`select get_admin_partner_availability('${ids.partner}')`),/Admin access required/);
 await db.exec('reset role;set role anon');await assert.rejects(db.query(`select get_admin_partner_availability('${ids.partner}')`),/permission denied/);
 await as('admin',`select admin_set_partner_capabilities('${ids.partner}',array['en'],'basic')`);
 await db.exec('reset role');
 const today=(await db.query("select (clock_timestamp() at time zone 'Asia/Seoul')::date::text today")).rows[0].today;
 const tomorrow=fmt.addDays(today,1),other=fmt.addDays(today,2);
 await as('partner',`select save_partner_availability_override('${tomorrow}','custom',array['09:00'])`);
 let actual=await get();assert.equal(actual.slots.length,1,'one concrete slot');assert.equal(actual.slots[0].slot_time,tomorrow+'T09:00:00');
 await as('partner',`select save_partner_availability_override('${other}','custom',array['14:00','14:30','15:00'])`);
 actual=await get();assert.equal(new Set(actual.slots.map(s=>s.slot_time.slice(0,10))).size,2);
 const booked=actual.slots.find(s=>s.slot_time===other+'T14:30:00');
 await db.exec('reset role');await db.query(`insert into bookings(slot_id,partner_id,status,scheduled_at) values($1,$2,'confirmed',availability_kst_start($3))`,[booked.id,ids.partner,booked.slot_time]);
 await db.query("update availability_slots set status='booked' where id=$1",[booked.id]);
 await as('partner',`select save_partner_availability_override('${other}','closed','{}')`);
 actual=await get();assert.equal(actual.slots.find(s=>s.id===booked.id).status,'booked');assert(!actual.slots.some(s=>s.slot_time.startsWith(other)&&s.status==='available'),'closed override excludes available, retains booked');
 await as('partner',`select save_partner_availability_override('${other}','custom',array['14:00','14:30'])`);
 actual=await get();assert(actual.slots.some(s=>s.slot_time===other+'T14:00:00'&&s.status==='available'));assert(!actual.slots.some(s=>s.slot_time===other+'T15:00:00'),'custom excludes deselected slot');
 assert.equal(actual.slots.find(s=>s.id===booked.id).status,'booked','confirmed never reopened');
 const publicRows=(await as('user',`select get_booking_calendar_slots(array['${ids.partner}']::uuid[]) data`)).rows[0].data;
 assert.deepEqual(actual.slots.filter(s=>s.status==='available').map(s=>s.id).sort(),publicRows.map(s=>s.id).sort(),'admin available matches public calendar beyond cutoff');
 assert.equal(actual.end,fmt.addDays(today,29));assert.equal(actual.min_lead_hours,4);
 await db.exec('reset role');await db.query('delete from partner_capabilities where partner_id=$1',[ids.partner]);
 actual=await get();assert.equal(actual.capability_configured,false);assert(!actual.slots.some(s=>s.status==='available'),'unconfigured capability is not publicly bookable');
 console.log('PASS admin availability: admin-only, anon/user/partner denial, no/one/multiple dates, custom/closed overrides, booked preservation, exact calendar source, KST window/cutoff, 7/14/30 range, merged clipboard and unchanged storage functions.');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
