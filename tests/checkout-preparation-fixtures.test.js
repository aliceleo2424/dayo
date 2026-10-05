const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync}=require('node:child_process');
const {PGlite} = require('@electric-sql/pglite');
const root=path.join(__dirname,'..');
const helper=require('../public/checkout-preparation.js');
const read=name=>fs.readFileSync(path.join(root,name),'utf8').replace(/\r\n/g,'\n');
const uid='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002';
let count=0;
function check(name,fn){fn();count++;console.log('PASS '+name);}
function mock(options={}){
  const calls=[];
  const session={user:{id:uid,email:'auth@example.invalid'}};
  let stored=options.contact||null;
  return {session,calls,auth:{getSession:async()=>({data:{session:options.changed?{user:{id:other}}:session}})},
    from(table){calls.push(['from',table]);let payload=null;const q={
      select(fields){calls.push(['select',table,fields]);return q;},eq(k,v){calls.push(['eq',table,k,v]);return q;},in(){return q;},order(){return q;},limit(){return Promise.resolve({data:options.bookings||[]});},
      upsert(p){payload=p;calls.push(['upsert',table,p]);return q;},
      maybeSingle:async()=>({data:table==='user_contact_info'?stored:options.pref||null,error:table==='user_contact_info'?options.contactError:options.prefError}),
      single:async()=>{if(!options.saveContactError)stored=payload;return {data:payload,error:options.saveContactError};}};return q;}
  };
}
const input={contact_email:'edited@example.invalid',mobile_phone:'010-1234-5678',interests:[],other_interest:null,consents:[{required:true,checked:true},{required:true,checked:true},{required:true,checked:true},{required:false,checked:false}]};
async function main(){
  check('B phone canonical and invalid input',()=>{assert.equal(helper.normalizePhone('010-1234-5678'),'01012345678');assert.equal(helper.normalizePhone('010 1234 5678'),'01012345678');assert.equal(helper.displayPhone('01012345678'),'010-1234-5678');for(const bad of ['123','0101234567','010abcd5678','+821012345678','01112345678'])assert.equal(helper.normalizePhone(bad),null);});
  let m=mock();assert.equal((await helper.load(m,m.session)).contact_email,'auth@example.invalid');count++;console.log('PASS B Auth email prefill without saved contact');
  const saved=await helper.persist(m,m.session,input);assert.equal(saved.contact.mobile_phone,'01012345678');assert.equal((await helper.load(m,m.session)).contact_email,input.contact_email);count++;console.log('PASS C edited contact persists and prefills next checkout');
  m=mock({contact:{contact_email:'saved@example.invalid',mobile_phone:'01012345678'}});assert.equal((await helper.load(m,m.session)).contact_email,'saved@example.invalid');assert.notEqual((await helper.load(m,m.session)).contact_email,m.session.user.email);assert.ok(m.calls.filter(c=>c[0]==='eq').every(c=>c[2]==='user_id'&&c[3]===uid));count++;console.log('PASS A/D own saved contact takes precedence over Auth');
  for(const value of ['01012345678','010-1234-5678','010 1234 5678','(010)1234.5678']){m=mock();assert.equal((await helper.persist(m,m.session,{...input,mobile_phone:value})).contact.mobile_phone,'01012345678');}count++;console.log('PASS E/F phone paste normalized to canonical digits');
  for(const value of ['010123','01112345678','010123456789']){m=mock();await assert.rejects(helper.persist(m,m.session,{...input,mobile_phone:value}));assert.equal(m.calls.length,0);}for(const value of ['bad','bad@','a b@example.invalid']){m=mock();await assert.rejects(helper.persist(m,m.session,{...input,contact_email:value}));assert.equal(m.calls.length,0);}count++;console.log('PASS G invalid email/phone fail before persistence');
  check('I/J required and all-consent semantics',()=>{assert.deepEqual(helper.allState(input.consents),{checked:false,indeterminate:true});assert.equal(helper.requiredComplete(input.consents),true);assert.equal(helper.requiredComplete([{required:true,checked:false},{required:false,checked:true}]),false);assert.deepEqual(helper.allState(input.consents.map(c=>({...c,checked:true}))),{checked:true,indeterminate:false});});
  m=mock();await assert.rejects(helper.persist(m,m.session,{...input,consents:[{required:true,checked:false}]}));assert.equal(m.calls.length,0);count++;console.log('PASS J unchecked required blocks persistence');
  m=mock({saveContactError:{code:'failure'}});await assert.rejects(helper.persist(m,m.session,input));assert.ok(!m.calls.some(c=>c[0]==='upsert'&&c[1]==='user_conversation_preferences'));count++;console.log('PASS contact persistence failure is fail closed');
  m=mock();await helper.load(m,m.session);await helper.persist(m,m.session,{...input,interests:['unknown'],other_interest:'ignored'});assert.ok(m.calls.filter(c=>c[0]==='from').every(c=>c[1]==='user_contact_info'));assert.ok(!('preferences' in saved));assert.doesNotMatch(read('public/checkout-preparation.js'),/user_conversation_preferences|bookings|other_interest|data-interest|ck-preferences|관심사|관심 언어/);count++;console.log('PASS J checkout never reads/writes preferences or bookings and has no preference UI');
  m=mock({changed:true});await assert.rejects(helper.persist(m,m.session,input));assert.equal(m.calls.length,0);count++;console.log('PASS account switch blocked');
  await database();await server();
  check('public/root mirrors and protected payment contract',()=>{
    for(const n of ['checkout-preparation.js','ticket-payment.js','tickets-modal.js'])assert.equal(read(n),read('public/'+n));
    const pay=read('public/ticket-payment.js');assert.ok(pay.indexOf('contact = await checkout.open')<pay.indexOf('prepared = await preparePayment'));
    assert.match(pay,/amount: prepared\.product\.amount/);assert.match(pay,/buyer_tel: contact \? contact\.mobile_phone/);
  });
  check('L all SKU prices and protected verification/issuance untouched',()=>{
    const modal=read('public/tickets-modal.js'), from=modal.indexOf('var PLANS = ['),to=modal.indexOf('\n  var CSS =',from);
    const plans=vm.runInNewContext(modal.slice(from,to)+'\nPLANS');
    for(const [id,amount] of [['trial',9900],['single',19900],['pack3',54900],['pack11',179000],['pack33',499000]])assert.equal(plans.find(p=>p.id===id).priceValue,amount);
    const baseline=name=>execFileSync('git',['-c','safe.directory='+root.replace(/\\/g,'/'),'show','HEAD:'+name],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
    const api=read('api/ticket-payment.js');assert.equal(api.slice(api.indexOf('async function finalize(')),baseline('api/ticket-payment.js').slice(baseline('api/ticket-payment.js').indexOf('async function finalize(')));
    for(const name of ['supabase/migrations/075_enforce_welcome_trial_entitlement.sql','public/room.html','public/room-live.js'])assert.equal(read(name),baseline(name),name+' changed');
    // Reviewed Security/Monthly integration changes are intentional. Keep exact
    // whole-file integrity, rather than weakening this to substring assertions.
    const integrated={
      'public/profile-store.js':'4353643e65ab191d0fed00c8b19016e690ccd781ec3b3564b34e1142571bb6a1',
      'public/booking-modal.js':'16ca7758616cb119d2332da14ce179fa51243e9db07f3a6121b03b824509f2da',
      'public/availability-slots.js':'808ce5b3cd55a6ba981f1468e72d308f3e906d4c1a95dd8db1e8f7351439ce31',
      'public/partner.html':'4426657a908fd50d49094a3d32a8eab785cebf52ccaa6b4f3ea9264e9c2196e7'
    };
    for(const [name,hash] of Object.entries(integrated))assert.equal(require('node:crypto').createHash('sha256').update(read(name)).digest('hex'),hash,name+' reviewed integration changed');
  });
  console.log(`Checkout fixtures passed: ${count} groups (real local PostgreSQL RLS, synthetic only).`);
}
async function database(){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;insert into auth.users values('${uid}'),('${other}');`);
  await db.exec(read('supabase/migrations/085_checkout_private_preparation.sql'));
  async function as(role,id,sql){await db.exec(`set role ${role};set request.jwt.claim.sub='${id||''}';`);try{return await db.query(sql);}finally{await db.exec('reset role;');}}
  const ins=`insert into public.user_contact_info(user_id,contact_email,mobile_phone) values('${uid}','fixture@example.invalid','01012345678')`;
  await as('authenticated',uid,ins);const own=await as('authenticated',uid,'select contact_email,mobile_phone from public.user_contact_info');assert.equal(own.rows.length,1);
  await as('authenticated',uid,"update public.user_contact_info set contact_email='new@example.invalid'");count++;console.log('PASS own contact SELECT/INSERT/UPDATE actual RLS');
  assert.equal((await as('authenticated',other,'select * from public.user_contact_info')).rows.length,0);
  assert.equal((await as('authenticated',other,"update public.user_contact_info set contact_email='intruder@example.invalid' returning user_id")).rows.length,0);
  await assert.rejects(as('authenticated',other,`insert into public.user_contact_info(user_id,contact_email,mobile_phone) values('${uid}','bad@example.invalid','01012345678')`));count++;console.log('PASS D other user/Partner denied by actual RLS');
  for(const q of ['select * from public.user_contact_info',ins,"update public.user_contact_info set contact_email='bad@example.invalid'"]){await assert.rejects(as('anon',null,q));}count++;console.log('PASS E anon read/write denied by actual privileges');
  await assert.rejects(as('authenticated',uid,'delete from public.user_contact_info'));await assert.rejects(as('authenticated',uid,"update public.user_contact_info set updated_at='2000-01-01'"));await assert.rejects(as('authenticated',uid,"update public.user_contact_info set mobile_phone='invalid'"));count++;console.log('PASS no delete/timestamp grant, invalid phone constraint');
  for(let n=0;n<=4;n++){const array=['drama','movies','music','games'].slice(0,n).map(i=>"'"+i+"'").join(',');await as('authenticated',uid,`insert into public.user_conversation_preferences(user_id,interests) values('${uid}',array[${array}]::text[]) on conflict(user_id) do update set interests=excluded.interests`);}
  await assert.rejects(as('authenticated',uid,`update public.user_conversation_preferences set interests=array['drama','movies','music','games','travel']`));
  await assert.rejects(as('authenticated',uid,`update public.user_conversation_preferences set interests=array['drama','drama']`));
  await assert.rejects(as('authenticated',uid,`update public.user_conversation_preferences set interests=array['bad']`));
  await assert.rejects(as('authenticated',uid,`update public.user_conversation_preferences set interests=array[null]::text[]`));
  await assert.rejects(as('authenticated',uid,`update public.user_conversation_preferences set other_interest='fifth'`));
  await as('authenticated',uid,`update public.user_conversation_preferences set interests=array['music'], other_interest='coffee brewing'`);
  assert.equal((await as('authenticated',uid,'select schema_version from public.user_conversation_preferences')).rows[0].schema_version,1);await assert.rejects(as('authenticated',uid,'update public.user_conversation_preferences set schema_version=2'));assert.equal((await as('authenticated',other,'select * from public.user_conversation_preferences')).rows.length,0);await assert.rejects(as('anon',null,'select * from public.user_conversation_preferences'));count++;console.log('PASS preferences actual own RLS, count/key/other constraints');
  assert.equal((await as('service_role',null,'select * from public.user_contact_info')).rows.length,1);await assert.rejects(as('service_role',null,"update public.user_contact_info set contact_email='ops@example.invalid'"));count++;console.log('PASS operational service SELECT only');
  await assert.rejects(db.exec(read('supabase/migrations/085_checkout_private_preparation.sql')),/object already exists/);await db.exec('rollback;');assert.equal((await db.query('select count(*)::int as n from public.user_contact_info')).rows[0].n,1);count++;console.log('PASS existing-object proposal abort preserves rows');await db.close();
}
async function server(){
  const api=read('api/ticket-payment.js');const start=api.indexOf('async function prepare('),end=api.indexOf('\nasync function ',start+1);
  const prepare=vm.runInNewContext(api.slice(start,end)+'\nprepare',{console:{log(){},error(){}},shortDebugId:()=>'',validTokenPart:v=>v,merchantUid:()=> 'synthetic-order'});
  function service(contact,error){let rpcs=0;return {get rpcs(){return rpcs;},from(table){assert.equal(table,'user_contact_info');return {select(fields){assert.equal(fields,'contact_email,mobile_phone');return {eq(k,v){assert.equal(k,'user_id');assert.equal(v,uid);return {maybeSingle:async()=>({data:contact,error})};}};}};},rpc:async(name,args)=>{rpcs++;assert.equal(name,'prepare_verified_ticket_purchase');assert.equal(args.p_user_id,uid);return {data:{success:true,merchant_uid:'synthetic-order',amount:9900,product_name:'trial',ticket_count:1,product_key:'trial'}};}};}
  for(const [row,error,status] of [[null,null,400],[null,{code:'missing-table'},503],[{contact_email:'a@example.invalid',mobile_phone:'010123'},null,400],[{contact_email:'a@example.invalid',mobile_phone:'01112345678'},null,400],[{contact_email:'a@example.invalid',mobile_phone:'010-1234-5678'},null,400],[{contact_email:'invalid',mobile_phone:'01012345678'},null,400]]){const s=service(row,error);const result=await prepare(s,{id:uid},{product_id:'trial',contact_email:'client-spoof@example.invalid'});assert.equal(result.status,status);assert.equal(s.rpcs,0);}
  const s=service({contact_email:'a@example.invalid',mobile_phone:'01012345678'});assert.equal((await prepare(s,{id:uid},{product_id:'trial'})).status,200);assert.equal(s.rpcs,1);count++;console.log('PASS server reads own persisted contact before order RPC, invalid/missing fail closed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
