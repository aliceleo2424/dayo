const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const contract=require('../public/learner-language-recap-contract.js'),provider=require('../api/_lib/learner-language-recap.js');
const {createHandler}=require('../api/learner-language-recap.js'),report=require('../public/user-conversation-report.js');
const ids={booking:'11111111-1111-4111-8111-111111111111',learner:'33333333-3333-4333-8333-333333333333',log:'44444444-4444-4444-8444-444444444444'};
const texts=['I am very agree.','I really like this café.','and I maybe the yesterday','yes','I go to the park yesterday.','She like playing tennis.'];
const log={id:ids.log,booking_id:ids.booking,participant_id:ids.learner,participant_role:'learner',transcript:texts.map((text,i)=>({id:'speech-'+i,text,speaker:'learner',timestamp:'2026-10-05T05:01:00Z'}))};
const candidates=contract.candidates(log,'en');
const make=(i,suggestion)=>({source_utterance_id:'speech-'+i,original_text:texts[i],suggested_text:suggestion,correction_type:'grammar',short_reason:'Use this verb form.',meaning_preserved:true,correction_needed:true,confidence:0.98});
const raw=[make(0,'I completely agree.'),make(4,'I went to the park yesterday.'),make(5,'She likes playing tennis.')];
const corrections=contract.validate(raw,candidates,'en');
const response=data=>({ok:true,json:async()=>data});
const wire=xs=>response({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({corrections:xs.map(x=>({...x,source_utterance_id:'u'+candidates.findIndex(c=>c.source_utterance_id===x.source_utterance_id)}))})}]}}]});
const read=f=>fs.readFileSync(f,'utf8').replace(/\r/g,'');
async function api(options={}){
 const calls=[];
 const fetchImpl=async(url,args)=>{calls.push({url,args});
  if(url.includes('/auth/v1/user'))return options.authFail?{ok:false}:response({id:ids.learner});
  if(url.includes('/rest/v1/bookings?'))return response(options.outsider?[]:[{id:ids.booking,learner_id:ids.learner,language:'en',status:'completed'}]);
  if(url.includes('/rest/v1/session_logs?'))return response([{...log,...options.log}]);
  if(url.includes('/rest/v1/session_reports?'))return response([{feedback:options.feedback||[]}]);
  assert.ok(url.startsWith('https://generativelanguage.googleapis.com/'));
  assert.doesNotMatch(args.body,/44444444|33333333|11111111/,'provider receives no account IDs');
  if(options.providerFail)throw Error('network');
  return wire(options.raw||raw);
 };
 const handler=createHandler({env:{NEXT_PUBLIC_SUPABASE_URL:options.supabaseUrl||'https://test.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-anon',GEMINI_API_KEY:options.noKey?'':'synthetic-key'},fetchImpl});
 const res={setHeader(){},end(body){this.body=JSON.parse(body);}};
 await handler({method:options.method||'POST',headers:{authorization:options.noAuth?'':'Bearer fixture.token'},body:{booking_id:ids.booking,...options.body}},res);
 return{status:res.statusCode,body:res.body,calls};
}
async function client(options={}){
 const calls=[],payload={summary:'Existing summary',key_expressions:['I enjoy visiting cafés'],quiz_score:67,feedback:['Again'],word_help:[]};
 const window={DayOLearnerRecapContract:contract};
 vm.runInNewContext(read('public/learner-language-recap.js'),{window,document:{documentElement:{lang:'en'}},AbortController,setTimeout,clearTimeout,fetch:async(url,args)=>{calls.push({url,args});if(options.fail)throw Error('network');return response(options.result);}});
 const input={db:{auth:{getSession:async()=>({data:{session:{access_token:'fixture.token'}}})}},bookingId:ids.booking,payload,ensureTranscript:async()=>{if(options.transcriptFail)throw Error('upload');}};
 const enriched=await window.DayOLearnerLanguageRecap.enrichReview(input);
 const again=await window.DayOLearnerLanguageRecap.enrichReview(input);
 return{payload,enriched,again,calls};
}
async function lifecycle(enricher){
 const base={summary:'Existing summary',key_expressions:['I enjoy visiting cafés'],quiz_score:67,feedback:['Again']},calls=[];
 const window={DayOLearnerLanguageRecap:enricher};
 const ctx={window,isObserver:()=>false,client:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:{success:true}};}}),authUser:async()=>({id:ids.learner}),context:()=>({bookingId:ids.booking,learnerId:ids.learner}),buildReviewSnapshot:()=>base,persistTranscript:async()=>{},document:{querySelectorAll:()=>[]},console};
 const source=read('public/session-lifecycle.js');
 vm.runInNewContext(source.slice(source.indexOf('  async function persistReviewReport()'),source.indexOf('  async function personalExit()'))+'\nthis.save=persistReviewReport;',ctx);
 assert.equal(await ctx.save(),true);assert.equal(await ctx.save(),true);assert.equal(calls.length,1,'repeat save is idempotent');
 assert.equal(window.__dayoLearnerReportPayload,base,'Quiz/Talk Record snapshot stays original');
 assert.deepEqual(calls[0].args.p_report.key_expressions,base.key_expressions);assert.equal(calls[0].args.p_report.quiz_score,67);
 return calls[0].args.p_report;
}
(async()=>{
 assert.deepEqual(candidates.map(c=>c.source_utterance_id),['speech-0','speech-1','speech-4','speech-5']);assert.equal(corrections.length,3);
 assert.equal(contract.candidates({...log,participant_role:'partner'},'en').length,0);
 assert.equal(contract.candidates({...log,transcript:log.transcript.map(x=>({...x,speaker:'partner'}))},'en').length,0);
 for(const text of ['maybe','I...','because the...','okay exercise','when this','I am the the the the','Email me at a@example.com','and I maybe the yesterday'])assert.equal(contract.candidateText(text,'en'),false,text);
 for(const [language,text] of [['es','Me gusta visitar nuevos cafés.'],['fr','Je aime visiter les cafés.'],['ko','저는 친구들과 카페에 가는 것을 좋아해요.']])assert.equal(contract.candidateText(text,language),true,language);
 assert.equal(contract.candidates(log,'unknown').length,0);
 for(const edit of [{source_utterance_id:'invented'},{original_text:'I really agree.'},{meaning_preserved:false},{correction_needed:false},{confidence:0.9},{suggested_text:texts[0]},{suggested_text:'I completely agree with Alice.'},{suggested_text:'I completely agree 2026.'},{correction_type:'score'}])assert.equal(contract.validate([{...raw[0],...edit}],candidates,'en').length,0,JSON.stringify(edit));
 assert.equal(contract.validate([raw[0],raw[0]],candidates,'en').length,1);assert.deepEqual(contract.validate([],candidates,'en'),[]);
 const restUrl=await api({supabaseUrl:'https://test.supabase.co/rest/v1/'});assert.equal(restUrl.status,200);assert.ok(restUrl.calls[0].url==='https://test.supabase.co/auth/v1/user');assert.equal((await api({supabaseUrl:'https://private.invalid/rest/v1/'})).status,503); const good=await api();assert.equal(good.status,200);assert.equal(good.body.corrections.length,3);
 const cached=await api({feedback:[...good.body.corrections,good.body.metadata]});assert.equal(cached.body.status,'cached');assert.equal(cached.calls.length,4);assert.ok(cached.body.corrections[0].source_digest);
 const zero=await api({raw:[]});assert.equal(zero.body.corrections.length,0);assert.equal((await api({feedback:[zero.body.metadata]})).body.status,'cached');
 assert.equal((await api({noAuth:true})).status,401);assert.equal((await api({authFail:true})).status,401);assert.equal((await api({method:'GET'})).status,405);assert.equal((await api({outsider:true})).status,403);
 assert.equal((await api({body:{transcript:texts}})).status,400);
 for(const edit of [{participant_role:'partner'},{participant_id:'outsider'},{booking_id:'other'}])assert.equal((await api({log:edit})).body.status,'no_learner_source');
 assert.equal((await api({providerFail:true})).status,502);assert.equal((await api({noKey:true})).status,503);
 const browser=await client({result:good.body});assert.equal(browser.enriched.feedback.length,5);assert.deepEqual(browser.payload.feedback,['Again']);assert.equal(browser.calls.length,1);assert.deepEqual(JSON.parse(browser.calls[0].args.body),{booking_id:ids.booking,locale:'en'});
 for(const opts of [{fail:true},{transcriptFail:true}]){const failed=await client(opts);assert.equal(failed.enriched,failed.payload);}
 const enriched=await lifecycle({enrichReview:async o=>({...o.payload,feedback:contract.mergeFeedback(o.payload.feedback,good.body.corrections,good.body.metadata)})});assert.equal(enriched.feedback.length,5);
 const failed=await lifecycle({enrichReview:async()=>{throw Error('AI unavailable');}});assert.deepEqual(failed.feedback,['Again']);
 const r={booking_id:ids.booking,language:'en',partner_comment:'Partner note',stamp:'cookie',keyword:'Travel',illust_url:'/images/logo.png',summary:'Existing summary',key_expressions:[texts[0],'I completely agree.','I enjoy visiting cafés'],quiz_score:67,feedback:corrections,__dayoLearnerTranscript:log.transcript,__dayoLearnerSourceLogId:ids.log};
 assert.equal(report.corrections(r).length,3);assert.deepEqual(report.expressions(r).map(x=>x.expression),['I enjoy visiting cafés']);
 assert.equal(report.corrections({...r,__dayoLearnerSourceLogId:'other-log'}).length,0);assert.equal(report.corrections({...r,__dayoLearnerTranscript:log.transcript.map(x=>({...x,id:'wrong'}))}).length,0);
 assert.equal((report.renderDetail(r,'en').match(/class="ucr-correction"/g)||[]).length,3);assert.match(report.renderDetail(r,'en'),/Save this report/);assert.match(report.renderDetail(r,'ko'),/나의 언어 기록/);assert.doesNotMatch(report.renderDetail({...r,feedback:[]},'en'),/More natural/);
 // Ownership is proven against the unchanged participant merge SQL, not a
 // fabricated JS merge. Actual Supabase writes remain outside this local task.
 const partner=read('supabase/migrations/046_merge_session_reports_by_participant.sql').split('create or replace function public.merge_partner_session_report(')[1].split('on conflict (booking_id) do update')[1].split('revoke all on function')[0];
 const learner=read('supabase/migrations/047_fix_learner_report_spoken_sentence.sql').split('on conflict (booking_id) do update')[1];
 assert.doesNotMatch(partner,/\b(summary|feedback|key_expressions|quiz_score)\s*=/);assert.doesNotMatch(learner,/\b(partner_comment|stamp|keyword|illust_url)\s*=/);
 const original=cp.execFileSync('git',['show','6be1fa3:public/session-lifecycle.js'],{encoding:'utf8'}).replace(/\r/g,'');
 const restored=read('public/session-lifecycle.js').replace(/    \/\/ Optional learner-only enrichment;[^]*?    var result = await db.rpc/, '    var result = await db.rpc').replace('p_report: reportPayload','p_report: payload');
 assert.equal(restored,original,'lifecycle unchanged outside optional recap hookup');
 for(const f of ['learner-language-recap-contract.js','learner-language-recap.js','session-lifecycle.js','room.html','conversation-insights.js','user-conversation-report.js'])assert.equal(read('public/'+f),read(f),f+' mirror');
 await assert.rejects(()=>provider.generate({candidates,language:'en',apiKey:'synthetic',fetchImpl:async()=>response({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]})}),/incomplete_generation/);
 console.log('PASS: learner-only source filters; 0/1/3; ES/FR/KO; exact source/meaning guards; own JWT/RLS reads; cached retry; failures preserve report; real lifecycle merge hookup; Quiz/Partner ownership; mirrors.');
})().catch(e=>{console.error(e);process.exitCode=1;});
