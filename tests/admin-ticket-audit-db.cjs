// Isolated PostgreSQL execution; no production rows, credentials or network access.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const catalog=require('./fixtures/admin-test-session-production-contract.json');
const migration=read('supabase/migrations/096_admin_ticket_audit.sql');
const old59=read('supabase/migrations/059_align_ticket_issuance_credit_ledgers.sql');
const oldWriters=old59.slice(old59.indexOf('create or replace function public.admin_grant_tickets('),old59.indexOf("notify pgrst"));
const ledgerDDL='create table credit_ledgers(id uuid primary key default gen_random_uuid(),user_id uuid not null,change_amount integer not null,ledger_type varchar(30) not null,balance_after integer,created_at timestamptz default now());alter table credit_ledgers enable row level security;grant all on credit_ledgers to anon,authenticated,service_role;';
if(process.argv.includes('--test-session-regression')) {
  // Reuse the existing exact-catalog TEST/cancellation/refund regression, with 096 layered afterward.
  const Module=require('node:module');const file=path.join(__dirname,'admin-test-sessions-db.cjs');
  const source=fs.readFileSync(file,'utf8').replace('  await db.exec(migration);', () =>
    '  await db.exec(migration);\n  await db.exec('+JSON.stringify(ledgerDDL)+');\n  await db.exec('+JSON.stringify(oldWriters)+');\n  await db.exec('+JSON.stringify(migration)+');');
  assert.ok(source.includes('Admin grant function drift'));
  const runner=new Module(file,module);runner.filename=file;runner.paths=module.paths;runner._compile(source,file);
} else {
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user=uid(1),partner=uid(2),admin=uid(3),otherAdmin=uid(4),other=uid(5),legacy=uid(6),grantId=uid(7),purchase=uid(8),booking=uid(9),slot=uid(10);
(async()=>{
const db=new PGlite();try {
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon,service_role;");
 for(const table of ['profiles','orders','bookings','ticket_lots','ticket_allocations']){
   const columns=catalog.columns.filter(c=>c.table_name===table).map(c=>'"'+c.column_name+'" '+(c.data_type==='ARRAY'?'text[]':c.data_type==='USER-DEFINED'?'text':c.data_type)+(c.column_default?' default '+c.column_default:'')+(c.is_nullable==='NO'?' not null':''));
   await db.exec('create table '+table+'('+columns.join(',')+');alter table '+table+' add primary key(id);');
 }
 await db.exec('alter table ticket_lots add unique(user_id,source,source_id);alter table ticket_allocations add unique(booking_id);'+ledgerDDL);
 await db.exec("create table availability_slots(id uuid primary key,partner_id uuid,slot_time text,status text,updated_at timestamptz default now());create table ticket_consumption_pre_cutover_bookings(booking_id uuid primary key);");
 await db.exec(catalog.functions.find(f=>f.proname==='dayo_is_admin').definition);
 const helper=read('supabase/migrations/055_ticket_lot_issuance.sql');
 await db.exec(helper.slice(helper.indexOf('create function public.refresh_ticket_balance_cache'),helper.indexOf('create function public.admin_grant_tickets')));
 await db.exec(oldWriters);
 const controlNames=['deduct_ticket_and_confirm_booking','refund_booking_ticket'];
 for(const name of controlNames)await db.exec(catalog.functions.find(f=>f.proname===name).definition);
 const before=(await db.query("select proname,pg_get_functiondef(oid) d from pg_proc where proname in('refresh_ticket_balance_cache','finalize_verified_ticket_purchase','deduct_ticket_and_confirm_booking','refund_booking_ticket')")).rows;
 await db.query("insert into profiles(id,role,nickname,email,ticket_count) values($1,'user','유저','user@example.invalid',0),($2,'partner','Partner','partner@example.invalid',0),($3,'admin','운영자','admin@example.invalid',0),($4,'admin','다른 관리자','other-admin@example.invalid',0),($5,'user','타인','other@example.invalid',0)",[user,partner,admin,otherAdmin,other]);
 async function as(actor,sql,args=[],role='authenticated') {await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor||'']);await db.exec('set role '+role);return db.query(sql,args);}
 const grant='select admin_grant_tickets($1,1,$2,$3) d',audit='select admin_get_ticket_audit($1) d';
 await as(admin,grant,[user,'과거 사유',legacy]);
 // Actual known production hash and strict drift stop; no metadata added on failed preflight.
 const original=(await db.query("select pg_get_functiondef('admin_grant_tickets(uuid,integer,text,uuid)'::regprocedure) d")).rows[0].d;
 await db.exec('reset role');await db.exec(original.replace('v_reason text :=','v_reason text := /*drift*/'));
 await assert.rejects(db.exec(migration),/function drift/);await db.exec('rollback');
 assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_name='credit_ledgers' and column_name='reason'")).rows[0].n,0);
 await db.exec(original);await db.exec(migration);
 for(const f of before)assert.equal((await db.query('select pg_get_functiondef(oid) d from pg_proc where proname=$1',[f.proname])).rows[0].d,f.d,f.proname+' unchanged');
 for(const actor of [user,partner,other]){
  await assert.rejects(as(actor,audit,[user]),/Admin access/);
  await assert.rejects(as(actor,grant,[user,'forged grant',uid(99)]),/Admin access/);
  assert.equal((await as(actor,'select count(*)::int n from credit_ledgers')).rows[0].n,0);
  await assert.rejects(as(actor,"insert into credit_ledgers(user_id,change_amount,ledger_type,granted_by,reason) values($1,1,'admin_grant',$2,'forged')",[user,admin]),/row-level security/);
 }
 await assert.rejects(as(null,audit,[user],'anon'),/permission denied/);
 await assert.rejects(as(null,audit,[user],'service_role'),/permission denied/);
 const result=(await as(admin,grant,[user,'  기술 장애 보상  ',grantId])).rows[0].d;assert.equal(result.added_tickets,1);
 await assert.rejects(as(admin,'select admin_grant_tickets($1,2,$2,$3)',[user,'conflicting quantity',grantId]),/different quantity/);
 await assert.rejects(as(admin,grant,[other,'cross-user retry',grantId]),/another user/);
 await assert.rejects(as(admin,grant,[user,'   ',uid(98)]),/Valid user/);
 const entries=(await as(admin,audit,[user])).rows[0].d;
 const current=entries.find(e=>e.transaction_id===grantId),historical=entries.find(e=>e.transaction_id===legacy);
 assert.equal(current.reason,'기술 장애 보상');assert.equal(current.granted_by,admin);assert.equal(current.admin_name,'운영자');assert.equal(current.admin_email,'admin@example.invalid');assert.ok(current.lot_id);assert.equal(current.delta,1);
 assert.equal(historical.reason,null);assert.equal(historical.granted_by,null);
 assert.equal((await as(admin,audit,[other])).rows[0].d.length,0);
 const retry=(await as(otherAdmin,grant,[user,'다른 사유를 보낸 재시도',grantId])).rows[0].d;assert.equal(retry.duplicate,true);assert.equal(retry.added_tickets,0);assert.equal(retry.ticket_count,2);
 const preserved=(await as(admin,audit,[user])).rows[0].d.find(e=>e.transaction_id===grantId);assert.equal(preserved.reason,current.reason);assert.equal(preserved.granted_by,admin);assert.equal(preserved.created_at,current.created_at);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from ticket_lots')).rows[0].n,2);assert.equal((await db.query('select count(*)::int n from credit_ledgers')).rows[0].n,2);
 assert.equal((await db.query("select count(*)::int n from pg_policies where tablename='credit_ledgers'")).rows[0].n,0);
 // Existing verified purchase writer, including duplicate retry, remains unchanged.
 await db.query("insert into orders(id,user_id,merchant_uid,product_key,product_name,amount,ticket_count,status) values($1,$2,'qa-order','single','QA ticket',10000,1,'pending')",[purchase,user]);
 for(let i=0;i<2;i++)assert.equal((await as(user,"select finalize_verified_ticket_purchase($1,'qa-order','qa-payment') d",[user],'service_role')).rows[0].d.added_tickets,i?0:1);
 assert.ok((await as(admin,audit,[user])).rows[0].d.some(e=>e.source==='purchase'&&e.transaction_id===purchase&&e.delta===1));
 // Existing concrete-slot ticket consumption and refund functions execute unchanged.
 await db.exec('reset role');
 await db.query("insert into availability_slots(id,partner_id,slot_time,status) values($1,$2,to_char((now()+interval '2 days') at time zone 'Asia/Seoul','YYYY-MM-DD\"T\"HH24:MI:SS'),'available')",[slot,partner]);
 await db.query("insert into bookings(id,learner_id,partner_id,partner_user_id,slot_id,status,ticket_deducted,ticket_refunded,language) values($1,$2,$3,$3,$4,'pending',false,false,'en')",[booking,user,partner,slot]);
 assert.equal((await as(user,'select deduct_ticket_and_confirm_booking($1,$2) d',[user,booking])).rows[0].d.success,true);
 await as(user,'select deduct_ticket_and_confirm_booking($1,$2) d',[user,booking]);
 assert.equal((await as(admin,audit,[user])).rows[0].d.filter(e=>e.source==='booking_use').length,1);
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]); // refund helper is server-owned; call as owner with participant identity.
 for(let i=0;i<2;i++)await db.query("select refund_booking_ticket($1,'tech_issue') d",[booking]);
 const final=(await as(admin,audit,[user])).rows[0].d;
 assert.equal(final.filter(e=>e.source==='booking_refund').length,1);assert.equal(final.find(e=>e.source==='booking_refund').reason,'tech_issue');
 assert.equal(final.filter(e=>e.source==='booking_use')[0].delta,-1);assert.equal(final.filter(e=>e.source==='booking_refund')[0].delta,1);
 await db.exec('reset role');assert.equal((await db.query('select ticket_count from profiles where id=$1',[user])).rows[0].ticket_count,3);
 assert.equal((await as(admin,'select admin_get_ticket_audit($1,1,0) d',[user])).rows[0].d.length,1);
 console.log('PASS actual SQL: grant lot+ledger+reason+actor; exact drift guard; retry no overwrite/double grant; admin-only/RLS; historical NULL; purchase/use/refund+retry; balance and protected function preservation.');
}finally{await db.close();}
})().catch(e=>{console.error(e.stack,e.where||'');process.exitCode=1;});
}
