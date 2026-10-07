/* Local PostgreSQL only: audited catalog, existing reward/cancellation regression, then 099. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/099_partner_payout_audit.sql'),'utf8');
const id=n=>'90000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function checks(db) {
 const admin='33333333-3333-4333-8333-333333333333',user='11111111-1111-4111-8111-111111111111';
 const partner=id(1),unpaid=id(2),clara=id(3),zero=id(4),mismatch=id(5),otherAdmin=id(6);
 const b=id(20),cancel=id(21),tech=id(22),legacy=id(23),otherBooking=id(24),claraBooking=id(25),report=id(30),request=id(40);
 const paidAt='2026-01-02T03:00:00.000Z';
 async function as(actor,sql,args=[],role='authenticated') {
   await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor||'']);
   await db.exec('set role '+role);return db.query(sql,args);
 }
 async function owner(sql,args=[]) {await db.exec('reset role');return db.query(sql,args);}
 const recordSql='select admin_record_partner_payout($1,$2,$3,$4,$5,$6,$7,$8,$9) d';
 const input=[partner,24000,'bank_transfer','국민은행 ****1234',paidAt,[b,cancel,tech,legacy],request,'manual-ref','실제 지급 확인'];
 await owner("insert into profiles(id,role,nickname,point_balance) values($1,'partner','QA payout',24000),($2,'partner','QA unpaid',6000),($3,'partner','Clara fixture',6000),($4,'partner','Zero',0),($5,'partner','Review',9999),($6,'admin','Second admin',0)",[partner,unpaid,clara,zero,mismatch,otherAdmin]);
 const seed="insert into bookings(id,learner_id,partner_id,partner_user_id,status,scheduled_at,end_reason,ended_at,completed_at,partner_rewarded,is_test_session,ticket_refunded) values($1,$2,$3,$3,$4,'2026-01-01T00:00Z',$5,'2026-01-01T00:25Z',$6,true,false,false)";
 for(const [booking,target,status,reason,completed] of [[b,partner,'completed','normal',true],[cancel,partner,'cancelled','user_cancelled_late',false],[tech,partner,'cancelled','tech_issue_approved',false],[legacy,partner,'completed','normal',true],[otherBooking,unpaid,'completed','normal',true],[claraBooking,clara,'completed','normal',true]])
   await owner(seed,[booking,user,target,status,reason,completed?'2026-01-01T00:25Z':null]);
 await owner('insert into partner_session_rewards(booking_id,partner_id,reward_amount,created_at) values($1,$2,6000,$3)',[b,partner,'2026-01-01T00:25Z']);
 await owner("insert into session_tech_issue_reports(id,booking_id,reporter_user_id,reporter_role,issue_type,scheduled_at,decision,partner_reward_decision,resolved_by,resolved_at) values($1,$2,$3,'partner','connection_failed','2026-01-01T00:00Z','approved',true,$4,'2026-01-01T00:30Z')",[report,tech,partner,admin]);
 const snapshots={};
 for(const [table,key] of [['partner_session_rewards','booking_id'],['bookings','id'],['partner_cancellation_penalty_offsets','reward_booking_id']])snapshots[table]=(await owner('select * from '+table+' order by '+key)).rows;
 const audit=(await as(admin,'select admin_get_partner_payout_audit($1) d',[partner])).rows[0].d;
 assert.equal(audit.summary.amount,24000);assert.equal(audit.summary.can_record,true);assert.equal(audit.summary.status,'unpaid');
 assert.equal(audit.unpaid_items.length,4);assert.equal(audit.summary.legacy_count,1);assert.equal(audit.summary.cancellation_count,1);assert.equal(audit.summary.compensation_count,1);
 for(const role of ['anon','authenticated','service_role'])for(const actor of role==='authenticated'?[partner,user]:[null]){
   for(const sql of ['select admin_get_partner_payout_summary($1) d','select admin_get_partner_payout_audit($1) d'])
     await assert.rejects(as(actor,sql,[partner],role),/Admin access|permission denied/);
   await assert.rejects(as(actor,recordSql,input,role),/Admin access|permission denied/);
   for(const table of ['partner_payouts','partner_payout_items']){
     await assert.rejects(as(actor,'select * from '+table,[],role),/permission denied/);
     await assert.rejects(as(actor,'delete from '+table,[],role),/permission denied/);
     await assert.rejects(as(actor,'update '+table+' set '+(table==='partner_payouts'?'note':'source_type')+'=$1',['forged'],role),/permission denied/);
     await assert.rejects(as(actor,'insert into '+table+'('+ (table==='partner_payouts'?'id':'booking_id') +') values($1)',[request],role),/permission denied/);
   }
 }
 for(const [index,value] of [[1,0],[1,23999],[2,'invalid'],[3,'국민은행 1234567890'],[3,'PayPal clara@gmail.com'],[4,new Date(Date.now()+86400000).toISOString()],[5,[b]],[5,[b,b,cancel,tech,legacy]],[5,[]]]){
   const args=[...input];args[index]=value;await assert.rejects(as(admin,recordSql,args),/required|Mask|amount|source|unique/);
 }
 assert.equal((await owner('select count(*)::int n from partner_payouts')).rows[0].n,0);
 const saved=(await as(admin,recordSql,input)).rows[0].d;assert.equal(saved.success,true);assert.equal(saved.updated_balance,0);
 const record=(await owner('select * from partner_payouts where id=$1',[request])).rows[0];
 assert.equal(Number(record.amount),24000);assert.equal(record.currency,'KRW');assert.equal(record.status,'paid');
 assert.equal(record.payout_method,'bank_transfer');assert.equal(record.payout_destination_label,input[3]);
 assert.equal(new Date(record.paid_at).toISOString(),paidAt);assert.equal(record.processed_by,admin);assert.equal(record.payout_reference,input[7]);assert.equal(record.note,input[8]);
 const reloaded=(await as(admin,'select admin_get_partner_payout_audit($1) d',[partner])).rows[0].d;
 assert.equal(reloaded.summary.status,'paid');assert.equal(reloaded.summary.can_record,false);assert.equal(reloaded.payouts[0].items.length,4);assert.equal(reloaded.payouts[0].processed_by,admin);
 assert.equal(reloaded.payouts[0].items.find(x=>x.booking_id===b).reward_booking_id,b);assert.equal(reloaded.payouts[0].items.find(x=>x.booking_id===tech).tech_report_id,report);
 assert.equal((await as(admin,recordSql,input)).rows[0].d.already_recorded,true);
 const duplicate=[...input];duplicate[6]=id(41);await assert.rejects(as(otherAdmin,recordSql,duplicate),/already paid/);
 const changed=[...input];changed[8]='different';await assert.rejects(as(admin,recordSql,changed),/already used/);
 await assert.rejects(owner('update partner_payouts set note=$1 where id=$2',['overwrite',request]),/immutable/);
 await assert.rejects(owner('delete from partner_payout_items where payout_id=$1',[request]),/immutable/);
 for(const [table,key] of [['partner_session_rewards','booking_id'],['bookings','id'],['partner_cancellation_penalty_offsets','reward_booking_id']])assert.deepEqual((await owner('select * from '+table+' order by '+key)).rows,snapshots[table]);
 assert.equal((await owner('select point_balance from profiles where id=$1',[unpaid])).rows[0].point_balance,6000);
 assert.equal((await as(admin,'select admin_get_partner_payout_audit($1) d',[unpaid])).rows[0].d.summary.status,'unpaid');
 for(const target of [zero,mismatch]){
   const value=(await as(admin,'select admin_get_partner_payout_audit($1) d',[target])).rows[0].d;
   assert.equal(value.summary.can_record,false);assert.equal(value.summary.status,target===zero?'no_rewards':'needs_review');
   const args=[...input];args[0]=target;args[1]=6000;args[5]=[claraBooking];args[6]=id(42);await assert.rejects(as(admin,recordSql,args),/already paid|source|review/);
 }
 assert.equal((await owner('select count(*)::int n from partner_payouts where partner_user_id=$1',[clara])).rows[0].n,0);
 assert.equal((await owner('select count(*)::int n from partner_session_rewards where booking_id=$1',[claraBooking])).rows[0].n,0);
 const manual=[clara,6000,'bank_transfer','국민은행 ****4321',paidAt,[claraBooking],id(43),'real-operator-reference','실제 송금 일시를 기록'];
 assert.equal((await as(admin,recordSql,manual)).rows[0].d.success,true);
 assert.equal((await owner('select partner_rewarded from bookings where id=$1',[claraBooking])).rows[0].partner_rewarded,true);
 assert.equal((await owner('select count(*)::int n from partner_session_rewards where booking_id=$1',[claraBooking])).rows[0].n,0);
 for(const [index,method,destination] of [[50,'cash','현금 지급'],[51,'paypal','PayPal c***@gmail.com'],[52,'wise','Wise ****1234'],[53,'other','기타 안전한 지급처']]){
   const next=id(index);await owner(seed,[next,user,partner,'completed','normal','2026-01-01T00:25Z']);
   await owner('update profiles set point_balance=point_balance+6000 where id=$1',[partner]);
   assert.equal((await as(admin,recordSql,[partner,6000,method,destination,paidAt,[next],id(index+100),null,null])).rows[0].d.success,true);
 }
 const newUnpaid=id(60);await owner(seed,[newUnpaid,user,unpaid,'completed','normal','2026-01-01T00:25Z']);
 await owner('update profiles set point_balance=point_balance+6000 where id=$1',[unpaid]);
 assert.equal((await as(admin,recordSql,[unpaid,6000,'cash','현금 지급',paidAt,[otherBooking],id(61),null,null])).rows[0].d.updated_balance,6000,'new earnings outside frozen batch remain unpaid');
 assert.equal((await owner('select point_balance from profiles where id=$1',[unpaid])).rows[0].point_balance,6000);
 assert.equal((await as(admin,'select admin_get_partner_payout_audit($1) d',[unpaid])).rows[0].d.summary.status,'unpaid');
 const old=(await as(admin,'select admin_get_partner_payout_audit($1) d',['22222222-2222-4222-8222-222222222222'])).rows[0].d;
 assert.equal(old.unpaid_items.find(x=>x.booking_id==='dddddddd-dddd-4ddd-8ddd-dddddddddddd').net_amount,0,'actual existing future offset remains applied once');
 assert.equal((await owner('select count(*)::int n from partner_payouts where id=$1',[request])).rows[0].n,1);
 console.log('PASS payout persistence/reload/all methods/processor; source links and manual legacy Clara fixture; duplicate/conflict/stale set; non-admin denial; zero/mismatch blocked; unpaid partner unchanged; historical sources/offsets preserved');
}
const filename=path.join(__dirname,'admin-test-sessions-db.cjs');
let source=fs.readFileSync(filename,'utf8').replace(/\r\n/g,'\n');
const apply='  await db.exec(migration);';assert.equal(source.split(apply).length,2);
source=source.replace(apply,()=>apply+'\n  await db.exec("alter table session_tech_issue_reports add primary key(id);");\n  const payoutProtected=(await db.query("select oid,pg_get_functiondef(oid) d from pg_proc where pronamespace=\'public\'::regnamespace and prokind=\'f\'")).rows;\n  await db.exec('+JSON.stringify(migration)+');\n  for(const f of payoutProtected)assert.equal((await db.query("select pg_get_functiondef($1::oid) d",[f.oid])).rows[0].d,f.d,"099 changes no existing function body");');
source=source.replace('  await db.close();console.log','  await payoutChecks(db);\n  await db.close();console.log');
const vm=require('node:vm'),runner=new Module(filename,module);runner.filename=filename;runner.paths=Module._nodeModulePaths(__dirname);
global.payoutChecks=checks;vm.runInThisContext(Module.wrap(source))(runner.exports,runner.require.bind(runner),runner,filename,__dirname);
