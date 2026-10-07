const fs=require('fs'),path=require('path'),assert=require('assert/strict'),vm=require('vm'),{JSDOM}=require('jsdom'),{webcrypto,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),B='44444444-4444-4444-8444-444444444444',P='22222222-2222-4222-8222-222222222222';
const NOTE='I enjoyed our conversation about your favourite café.';
const hash=s=>createHash('sha256').update(String(s).replace(/\r\n?/g,'\n').trim(),'utf8').digest('hex');
const state=(s)=>({exists:!!s,letter_sent:!!s,letter_digest:s?hash(s):null});
const response=s=>({ok:true,json:async()=>state(s)});
const html=fs.readFileSync(root+'/public/room.html','utf8');
const code=html.slice(html.indexOf('    function setPartnerReportSubmitStatus('),html.indexOf('    window.handleHeaderExitClick =',html.indexOf('    function setPartnerReportSubmitStatus(')));
function harness(o={}){
 const dom=new JSDOM('<textarea id="popup-partner-comment"></textarea><p id="partner-report-submit-status" hidden></p><button id="btn-final-partner-submit">Send letter and finish</button>',{url:'https://fixture.invalid/room?bookingId='+B}),w=dom.window;
 Object.defineProperty(w,'crypto',{value:webcrypto});
 const counts={read:0,save:0,finish:0,transcript:0,image:0},order=[],timers=[];
 let stored=o.stored||'';
 w.document.querySelector('textarea').value=o.note??NOTE;
 let locale=o.locale||'EN';w.DayOI18n={getLang:()=>locale};
 if(o.savedLocale)w.localStorage.setItem('dayo_lang',o.savedLocale);
 w.DayORoomAccess={allowed:true,role:'partner',partnerId:P,bookingId:B,...o.access};
 w.supabaseClient={auth:{getUser:async()=>({data:{user:{id:P}}}),getSession:async()=>({data:{session:{access_token:'fixture-only-not-real'}}})}};
 w.DayOPartnerReport={payload:()=>({partnerComment:w.document.querySelector('textarea').value})};
 w.persistSessionReport=async data=>{counts.save++;order.push('save');return o.save?o.save(data):((stored=data.partnerComment),{ok:true})};
 w.DayOPartnerReward={complete:async(b,p)=>{assert.equal(b,B);assert.equal(p,P);counts.finish++;order.push('finish');return o.finish?o.finish():{success:true,reward_amount:0,is_test_session:true}}};
 w.DayOPartnerIllustration={reportSubmitting:()=>{},reportSaved:()=>{counts.image++;if(o.imageThrow)throw Error('image failed');return Promise.resolve()}};
 const context={window:w,document:w.document,localStorage:w.localStorage,TextEncoder,Uint8Array,AbortController,console:{warn:()=>{}},
  fetch:async(url,opts)=>{counts.read++;assert.equal(url,'/api/conversation-recap');assert.deepEqual(JSON.parse(opts.body),{action:'partner_illustration_status',booking_id:B});return o.read?o.read(counts.read):response(stored)},
  persistTranscript:async()=>{counts.transcript++;return {ok:!o.transcriptFail}},stopPartnerSentencePolling:()=>{},
  setTimeout:(f,ms)=>{const job={f,ms,cancelled:false};timers.push(job);return job},clearTimeout:job=>{if(job)job.cancelled=true}};
 vm.runInNewContext(code,context);
 return {w,counts,order,timers,send:()=>w.executePartnerPayoutAndExit(),restore:()=>w.restorePartnerLetterState(),
  set:code=>vm.runInNewContext('setPartnerReportSubmitStatus('+JSON.stringify(code)+',false)',context),
  status:()=>w.document.getElementById('partner-report-submit-status').textContent,button:()=>w.document.querySelector('button'),
  toggle:l=>{locale=l;w.localStorage.setItem('dayo_lang',l);w.document.dispatchEvent(new w.CustomEvent('dayo:langchange'))},
  advance:ms=>timers.filter(t=>t.ms===ms&&!t.cancelled).forEach(t=>{t.cancelled=true;t.f()})};
}
async function turns(){for(let i=0;i<8;i++)await new Promise(setImmediate)}
async function main(){
 let h=harness({note:''});await h.send();assert.equal(h.counts.save,0);assert.match(h.status(),/Write a Letter/);assert.equal(h.button().disabled,false);
 h=harness({save:()=>({ok:false})});await h.send();assert.match(h.status(),/couldn’t send/);assert.equal(h.counts.read,2);assert.equal(h.counts.finish,0);assert.equal(h.w.document.querySelector('textarea').value,NOTE);
 h=harness({save:()=>({ok:false}),read:n=>response(n>1?NOTE:'')});await h.send();assert.equal(h.counts.save,1);assert.equal(h.counts.finish,1);assert.equal(h.status(),'Letter sent.');await h.send();assert.equal(h.counts.save,1);
 h=harness({save:()=>({ok:false}),read:n=>n===1?response(''):{ok:false}});await h.send();assert.match(h.status(),/couldn’t confirm the status/);assert.equal(h.button().textContent,'Check status');await h.send();assert.equal(h.counts.save,1);assert.equal(h.counts.finish,0);
 let fail=true;h=harness({read:()=>fail?{ok:false}:response('')});await h.send();assert.equal(h.counts.save,0);fail=false;await h.send();assert.equal(h.counts.save,0);assert.match(h.status(),/No saved Letter/);await h.send();assert.equal(h.counts.save,1);
 h=harness({stored:'Previously sent private message'});await h.restore();assert.match(h.status(),/already been sent/);assert(h.button().disabled);await h.send();assert.equal(h.counts.save,0);assert.equal(h.counts.finish,0);assert(h.w.document.getElementById('partner-letter-lounge-link'));
 h=harness({save:()=>({ok:false}),read:n=>response(n>1?'Existing different Letter':'')});await h.send();assert.match(h.status(),/Nothing was overwritten/);assert.equal(h.counts.finish,0);assert(h.button().disabled);
 for(const finish of [()=>({success:false,needs_review:true,message:'濡쒓렇 broken 한국어'}),()=>{throw Error('세션 보상을 확인하지 못했습니다.')}]) {
  h=harness({finish});await h.send();assert.match(h.status(),/^Your Letter was sent/);assert(!/濡|한국어|세션/.test(h.status()));assert(h.button().disabled);assert.equal(h.counts.read,2);assert.deepEqual(h.order,['save','finish']);await h.send();assert.equal(h.counts.save,1);
 }
 h=harness({finish:()=>({success:false}),read:n=>n===1?response(''):{ok:false}});await h.send();assert.match(h.status(),/Your Letter was sent, but we couldn’t check/);assert(h.button().disabled);await h.send();assert.equal(h.counts.save,1);
 h=harness({finish:()=>({success:false}),read:()=>response('')});await h.send();assert.match(h.status(),/couldn’t send/);assert(!h.button().disabled);
 h=harness({transcriptFail:true,imageThrow:true});await h.send();assert.equal(h.status(),'Letter sent.');assert(h.button().disabled);
 let resolveFinish;h=harness({finish:()=>new Promise(r=>resolveFinish=r)});let result=h.send();await turns();assert.match(h.status(),/^Letter sent\. Checking/);assert(h.button().disabled);await h.send();assert.equal(h.counts.save,1);resolveFinish({success:true,reward_amount:0,reward_suppressed:true});await result;assert.equal(h.status(),'Letter sent.');
 h=harness({finish:()=>new Promise(()=>{})});result=h.send();await turns();h.advance(8000);await result;assert.match(h.status(),/couldn’t confirm your earnings/);assert(h.button().disabled);
 let resolveSave;h=harness({save:()=>new Promise(r=>resolveSave=r)});result=h.send();await turns();await h.send();assert.equal(h.counts.save,1);resolveSave({ok:true});await result;await h.send();assert.equal(h.counts.save,1);assert.equal(h.counts.finish,1);
 h=harness({access:{role:'learner'}});await h.send();assert.equal(h.counts.read,0);assert.equal(h.counts.save,0);
 h=harness({locale:'KO',note:''});await h.send();assert.match(h.status(),/Write a Letter/); // implicit default KO must not leak
 h=harness({locale:'KO',savedLocale:'KO',note:''});await h.send();assert.match(h.status(),/작성해 주세요/);h.toggle('EN');assert.match(h.status(),/Write a Letter/);

 for(const code of ['validation','letter_save_failed','status_check_failed','sent','finish_failed','reward_status_unavailable','sent_status_unavailable','already_sent']){h=harness();h.set(code);assert(!/[가-힣]/.test(h.status()));h.toggle('KO');assert(/[가-힣]/.test(h.status()));h.toggle('EN');assert(!/[가-힣]/.test(h.status()));}
 const handler=require(root+'/api/_lib/partner-letter.js');let routes=[];
 const base={user:{id:P},env:{SUPABASE_SERVICE_ROLE_KEY:'fixture-only'},input:{booking_id:B,action:'partner_illustration_status'},
 read:async route=>{routes.push(route);if(route.includes('bookings?'))return [{id:B,learner_id:'user',partner_user_id:P,status:'confirmed'}];if(route.includes('profiles?'))return [{id:P,role:'partner'}];return [{booking_id:B,partner_user_id:P,partner_comment:' \r\nexisting private Letter\r\n '}] }};
 let r=await handler.handle(base);assert.deepEqual(r.body,{exists:true,letter_sent:true,letter_digest:hash('existing private Letter')});
 assert(!JSON.stringify(r).includes('private Letter'));assert(routes.at(-1).includes('booking_id=eq.'+B));assert(routes.at(-1).includes('partner_user_id'));
 r=await handler.handle({...base,read:async route=>route.includes('session_reports?')?[]:base.read(route)});assert.deepEqual(r.body,{exists:false,letter_sent:false,letter_digest:null});
 r=await handler.handle({...base,user:{id:'other'}});assert.equal(r.status,403);
 await assert.rejects(()=>handler.handle({...base,read:async route=>{if(route.includes('session_reports?'))throw Error('unavailable');return base.read(route)}}));
 r=await handler.handle({...base,read:async route=>route.includes('session_reports?')?[{booking_id:'another',partner_comment:NOTE}]:base.read(route)});assert.equal(r.body.letter_sent,false);
 await assert.rejects(()=>handler.handle({...base,read:async route=>route.includes('session_reports?')?null:base.read(route)}));
 await assert.rejects(()=>handler.handle({...base,read:async route=>route.includes('session_reports?')?[{booking_id:B,partner_user_id:'other',partner_comment:NOTE}]:base.read(route)}));
 await assert.rejects(()=>handler.handle({...base,read:async route=>route.includes('session_reports?')?[{booking_id:B,partner_user_id:null,partner_comment:NOTE}]:base.read(route)}));
 // Already-corrupted UTF-8 legacy literals survive JSON and DOM correctly:
 // serialization is not what damages the text, and raw message is never UI.
 const raw='濡쒓렇?몄씠 ?꾩슂?⑸땲??';
 assert.equal(JSON.parse(Buffer.from(JSON.stringify({message:raw}),'utf8').toString('utf8')).message,raw);
 const dom=new JSDOM('<p></p>');dom.window.document.querySelector('p').textContent=raw;assert.equal(dom.window.document.querySelector('p').textContent,raw);
 assert.equal(html,fs.readFileSync(root+'/room.html','utf8'));assert.match(html,/bookingId:access\.bookingId/);
 assert.match(html,/window\.restorePartnerLetterState\(\)/);
 assert.equal(fs.readFileSync(root+'/public/partner-report.js','utf8'),fs.readFileSync(root+'/partner-report.js','utf8'));
 console.log('PASS ADD3: exact authenticated status + digest, immediate ambiguous-save recovery, post-finish read-back, unknown outcome read-only retry, missing/different saved Letter, reload restore, duplicate guard, TEST zero, EN default / explicit KO, raw/mojibake transport and safe UI.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
