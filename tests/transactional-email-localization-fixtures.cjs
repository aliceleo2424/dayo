'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const email = require('../api/_lib/transactional-email');
const {buildMessage, dispatch, makeStore, kstTime, sendResend} = require('../api/_lib/booking-notifications');
const {createHandler} = require('../api/booking-notifications');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let checks = 0;
function check(value, label) {assert.ok(value, label); checks++;}
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const partnerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const bookingId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function row(role = 'learner', cancelled = false) {
  return {booking_id:bookingId, recipient_user_id:role === 'partner' ? partnerId : id, recipient_role:role,
    event_key:(cancelled ? 'booking_cancelled' : 'booking_confirmed') + ':' + bookingId + ':' + role,
    event_type:cancelled ? 'booking_cancelled' : 'booking_confirmed', attempts:1,
    snapshot:{scheduled_at:'2026-10-08T23:30:00+09:00',language:'en',partner_user_id:partnerId,
      ...(cancelled ? {end_reason:'partner_cancelled_early',cancelled_by:'partner',ticket_refunded:true,partner_rewarded:false,late_cancel:false,penalty_amount:0,reason_code:'schedule_change',public_reason:'schedule_change'} : {})}};
}
async function main() {
  check(email.recipientLocale('partner', {}, 'ko') === 'en', 'Partner never inherits User request language');
  check(email.recipientLocale('partner', {preferred_language:'KO'}) === 'ko', 'Explicit stored interface preference wins');
  check(email.recipientLocale('user', {}, 'en') === 'en', 'Current EN UI reused');
  check(email.recipientLocale('user', {preferred_language:'ko'}, 'en') === 'ko', 'Account preferred language wins');
  check(email.recipientLocale('user', {locale:'en_US'}) === 'ko', 'OAuth/provider locale is not guessed as interface preference');
  check(email.recipientLocale('user', {}, 'fr') === 'ko', 'Unknown User locale defaults KO');
  check(email.recipientLocale('partner', null) === 'en', 'Unknown Partner locale defaults EN');
  check(read('api/_lib/transactional-email.js') === read('admin/src/lib/transactional-email.js'), 'Separate deploy renderer mirrors identical');
  check(read('public/supabase-client.js') === read('supabase-client.js'), 'Public/root mirror identical');
  const userKO = buildMessage(row(), 'user@fixture.test', 'Jen <b>', 'ko');
  const userEN = buildMessage(row(), 'user@fixture.test', 'Jen <b>', 'en');
  const partnerEN = buildMessage(row('partner'), 'partner@fixture.test', 'Jen');
  for(const [message, lang] of [[userKO,'ko'],[userEN,'en'],[partnerEN,'en']]) {
    check(message.html.includes('<html lang="' + lang + '"'), 'Correct HTML language');
    check(message.from === email.FROM && message.reply_to === email.REPLY_TO, 'Verified domain headers');
    check(message.text.includes('23:30') && message.subject.includes('23:30'), 'Same subject/body time');
    check(message.text.includes('KST') && /25(?: minutes|분)/.test(message.text), 'KST and 25 minute conversation');
    check(!/30 minutes|30분/.test(message.text), 'No 30 minute video call claim');
  }
  check(partnerEN.subject === '📅 [DayO] New Session Booked — 2026-10-08, 23:30', 'Requested Partner booked subject');
  check(partnerEN.html.includes('View My Schedule'), 'Partner schedule CTA');
  check(!/[가-힣]/.test(partnerEN.text + partnerEN.html + partnerEN.subject), 'Entire default Partner mail EN');
  check(userKO.text.includes('예약 상태: 예약됨') && userEN.text.includes('Status: Confirmed'), 'User KO/EN visible copy');
  check(userEN.html.includes('Jen &lt;b&gt;') && !userEN.html.includes('Jen <b>'), 'Name escaping preserved');
  const cancelledEN = buildMessage(row('partner', true), 'partner@fixture.test', 'Jen');
  check(cancelledEN.subject === '⚠️ [DayO] Session Cancelled — 2026-10-08, 23:30', 'Cancellation exact title');
  check(cancelledEN.text.startsWith('Your session below has been cancelled.'), 'Cancellation is first sentence');
  const c = row('partner', true); c.snapshot.end_reason = 'partner_cancelled_late';c.snapshot.late_cancel = true;c.snapshot.penalty_amount = 500;
  check(buildMessage(c, 'partner@fixture.test', 'Jen').text.includes('500P'), 'Existing penalty snapshot text');
  c.snapshot.ticket_refunded = false;
  assert.throws(() => buildMessage(c,'partner@fixture.test','Jen'),/invalid_cancellation_state/);checks++;
  for(const time of ['2026-10-08T14:30:00Z','2026-10-08T23:30:00+09:00','2026-10-08T07:30:00-07:00']) {
    const r=row('partner');r.snapshot.scheduled_at=time;
    check(buildMessage(r, 'partner@fixture.test', 'Jen').subject === partnerEN.subject, 'No double KST conversion');
  }
  const midnight=row('partner');midnight.snapshot.scheduled_at='2026-10-08T15:00:00Z';
  check(buildMessage(midnight,'partner@fixture.test','Jen').subject.endsWith('2026-10-09, 00:00'), 'KST date rollover');
  assert.throws(() => kstTime('2026-10-08T23:30:00'),/invalid_event_time/);checks++;
  for(const role of ['user','partner']) for(const lang of ['ko','en']) {
    const w=email.buildWelcomeMessage('A&B',role,lang);
    check(w.html.includes('A&amp;B') && w.html.includes('<html lang="'+lang+'"'), 'Welcome language/name safe');
    check(w.reply_to===email.REPLY_TO && w.from===email.FROM && w.text.includes('hello@dayotalk.com'), 'Welcome consistent headers/contact');
    check(role==='partner' ? !/9,900/.test(w.text) : /9,900/.test(w.text), 'User offer not applied to Partner');
  }
  // Recipient-scoped localization, frozen retries, and the original provider key.
  const queue=[row(),row('partner')], sent=[], saved=[];
  const store={claim:async()=>queue.shift(), user:async userId=>({id:userId,email:userId===id?'user@fixture.test':'partner@fixture.test'}), partnerName:async()=> 'Jen',save:async(r,changes)=>{saved.push(changes);Object.assign(r,changes);}};
  const result=await dispatch(null,{}, {},{store,localeUserId:id,locale:'en',send:async(payload,key)=>{sent.push({payload,key});return 'provider-fixture';}});
  check(result.sent===2 && sent[0].payload.html.includes('lang="en"') && sent[1].payload.subject.startsWith('📅'), 'EN User plus separate EN Partner dispatch');
  const frozen = {...row(),delivery_payload:userEN,first_attempt_at:new Date().toISOString()};
  let claimed=false;
  const retry=await dispatch(null,{}, {},{localeUserId:id,locale:'ko',store:{claim:async()=>claimed?null:(claimed=true,frozen),user:async()=>{throw Error('must not reread');},save:async()=>{}},send:async(payload,key)=>{check(payload===userEN && key===frozen.event_key,'Retry uses frozen payload/key despite changed locale');return 'provider-fixture';}});
  check(retry.sent===1,'Retry successful');
  // Exact previous confirmation is the fallback for a Partner-triggered User cancellation.
  const filters=[];
  const service={from:table=>{check(table==='booking_notification_log','Existing log only');return {select(value){check(value==='delivery_payload','Minimal locale source');return this;},eq(key,value){filters.push([key,value]);return this;},maybeSingle:async()=>({data:{delivery_payload:userEN},error:null})};}};
  check(await makeStore(service).previousLocale(row('learner',true))==='en','User confirmation locale reused');
  assert.deepEqual(filters,[['booking_id',bookingId],['recipient_user_id',id],['event_type','booking_confirmed']]);checks++;
  const failStore=makeStore({from(){throw Error('offline');}});
  check(await failStore.previousLocale(row('learner',true))===null,'Locale read failure does not block delivery');
  let cancelClaimed=false;
  await dispatch(null,{}, {},{localeUserId:partnerId,locale:'ko',store:{claim:async()=>cancelClaimed?null:(cancelClaimed=true,row('learner',true)),user:store.user,previousLocale:async()=> 'en',save:store.save},send:async payload=>{check(payload.html.includes('lang="en"'),'Partner-triggered cancellation retains User EN');return 'provider-fixture';}});
  // Real request handler cannot apply the requester’s language to the other recipient.
  let opts;
  const handler=createHandler({config:{url:'fixture',anonKey:'fixture',serviceKey:'fixture-service',resendKey:'fixture'},clients:()=>({auth:{auth:{getUser:async()=>({data:{user:{id}},error:null})}},service:{from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:bookingId,learner_id:id,partner_user_id:partnerId,status:'confirmed',ticket_deducted:true},error:null})})}}),dispatch:async(_service,_config,_scope,options)=>{opts=options;return {sent:2,failed:0,review:0};}});
  const res={setHeader(){},end(s){this.body=JSON.parse(s);}};
  await handler({method:'POST',headers:{authorization:'Bearer fixture','x-dayo-ui-language':'en'},body:{bookingId,event:'booking_confirmed'}},res);
  check(res.statusCode===202 && opts.localeUserId===id && opts.locale==='en','Verified actor owns locale hint');
  const clientSource=read('public/supabase-client.js'), frontendCalls=[];
  const client={auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}};
  const ui={window:{DayOI18n:{getLang:()=> 'EN'}},getRpcClient:()=>client,fetch:async(_url,options)=>{frontendCalls.push(options);return {ok:true};},console};
  vm.createContext(ui);
  vm.runInContext(clientSource.slice(clientSource.indexOf('  function emailInterfaceLocale'),clientSource.indexOf('  var welcomeEmailBusy')),ui);
  vm.runInContext(clientSource.slice(clientSource.indexOf('  window.DayONotifyCommittedBooking'),clientSource.indexOf('  window.handleConfirmBooking')),ui);
  await ui.window.DayONotifyCommittedBooking(bookingId,'booking_confirmed');
  check(frontendCalls[0].headers['X-DayO-UI-Language']==='en','Real browser hook sends EN interface locale');
  check(Object.keys(JSON.parse(frontendCalls[0].body)).sort().join(',')==='bookingId,event','Existing body contract preserved');
  // Real welcome endpoint with mocked auth and provider, keeping send eligibility/idempotency.
  for(const role of ['user','partner']) {
    let request, marked=false;
    const sandbox={module:{exports:{}},process:{env:{RESEND_API_KEY:'fixture'}},require:name=>name.includes('welcome-profile-state') ? {prepareWelcome:async()=>({email:'internal@fixture.test',nickname:'A&B',userId:id,role,metadata:{}}),markWelcomeSent:async()=>{marked=true;}} : email,
      fetch:async(_url,options)=>{request=options;return {ok:true,json:async()=>({id:'provider-fixture'})};}};
    vm.runInNewContext(read('api/send-welcome.js'),sandbox);
    const response={setHeader(){},end(s){this.body=JSON.parse(s);}};
    await sandbox.module.exports({method:'POST',headers:{},body:{locale:'en'}},response);
    const payload=JSON.parse(request.body);
    check(response.statusCode===200 && marked && payload.to[0]==='internal@fixture.test','Welcome existing recipient/state');
    check(payload.html.includes('lang="en"') && request.headers['Idempotency-Key']==='welcome:'+id,'Welcome localized with existing idempotency');
  }
  // Compile and invoke the actual Admin route; no real Supabase/Resend requests.
  const ts=require('typescript');
  let adminMail, profileRole='partner';
  const admin={exports:{}};
  const adminSandbox={module:admin,exports:admin.exports,process:{env:{RESEND_API_KEY:'fixture',NEXT_PUBLIC_SUPABASE_URL:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture'}},console:{error(){}},require:name=>{
    if(name==='next/server')return {NextResponse:{json:body=>body}};
    if(name==='resend')return {Resend:class {constructor(){this.emails={send:async p=>{adminMail=p;return {id:'fixture'};}};}}};
    if(name==='@supabase/supabase-js')return {createClient:()=>({from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id,role:profileRole},error:null})}),auth:{admin:{getUserById:async()=>({data:{user:{user_metadata:{}}},error:null})}}})};
    return email;
  }};
  vm.runInNewContext(ts.transpileModule(read('admin/src/app/api/send-welcome/route.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,adminSandbox);
  await admin.exports.POST({json:async()=>({email:'internal@fixture.test',nickname:'Jen'})});
  check(adminMail.html.includes('lang="en"') && adminMail.replyTo===email.REPLY_TO,'Admin Partner welcome uses EN/Reply-To');
  profileRole='user';
  await admin.exports.POST({json:async()=>({email:'internal@fixture.test',nickname:'User'})});
  check(adminMail.html.includes('lang="ko"') && adminMail.to==='internal@fixture.test','Admin unknown User keeps KO/recipient');
  delete adminSandbox.process.env.SUPABASE_SERVICE_ROLE_KEY;
  await admin.exports.POST({json:async()=>({email:'internal@fixture.test',nickname:'Jen',recipientRole:'partner'})});
  check(adminMail.html.includes('lang="en"') && !adminMail.text.includes('9,900'),'Existing Admin profile context supports Partner EN without new credentials');
  check(read('admin/src/components/admin/UserDetailDrawer.tsx').includes('recipientRole: user?.role'),'Admin passes current exact profile role');
  check(read('public/supabase-client.js').includes('recipientRole: profile && profile.role'),'Public fallback passes current exact profile role');
  for(const f of ['api/partner-application-notification.js','api/_lib/guidebook-delivery.js'])check(read(f).includes('reply_to: REPLY_TO'),'Other existing Resend route reply header');
  check(read('api/send-lead-email.js').includes('smtp.gmail.com'),'Legacy Gmail transport remains');
  // Byte-stable Resend wire body and the original timeout/idempotency transport.
  const calls=[];
  await sendResend(partnerEN,'fixture-key','fixture',async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({id:'fixture'})};});
  check(calls[0].options.headers['Idempotency-Key']==='fixture-key' && calls[0].url==='https://api.resend.com/emails','Transport contract intact');
  if(process.env.EMAIL_PREVIEW_DIR){fs.mkdirSync(process.env.EMAIL_PREVIEW_DIR,{recursive:true});for(const [name,message] of Object.entries({userKO,userEN,partnerEN,cancelledEN}))fs.writeFileSync(path.join(process.env.EMAIL_PREVIEW_DIR,name+'.html'),message.html);}
  console.log('EMAIL-02 localization/headers/recipient isolation/KST/welcome/retry passed ('+checks+' checks); no external mail sent.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
