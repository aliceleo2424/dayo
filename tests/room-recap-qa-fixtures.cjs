const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {JSDOM}=require('jsdom'),f=require('./room-recap-ui-fixture.cjs'),model=require('../public/conversation-recap.js'),{createHandler}=require('../api/conversation-recap.js');
const B='44444444-4444-4444-8444-444444444444',L='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222';
const id=n=>`55555555-5555-4555-8555-${String(n).padStart(12,'0')}`;
const row=(text,n='u1')=>({id:n,text,speaker:'learner',timestamp:'2026-10-07T05:00:00Z'});
const log=(booking,text)=>({id:'log-'+booking,booking_id:booking,participant_id:L,participant_role:'learner',transcript:[row(text)]});
const build=text=>model.build({bookingId:B,learnerId:L,language:'en',learnerLog:log(B,text),history:[]});
for(const [text,total,seconds] of [['I went to a cafe',0,30],['It was crowded',2,30],['It was crowded and quiet',4,60],['It was crowded quiet and delicious',6,90],['crowded quiet delicious friendly',6,90]]){
 const r=build(text);assert.equal(r.questions.length,total);assert.equal(model.quizDuration(total),seconds);
 for(const q of r.questions)assert(text.toLowerCase().split(/\s+/).includes(q.word),'quiz seed must actually be spoken');
 for(const v of r.word_expansion){assert.equal(r.questions.filter(q=>q.word===v.word).length,2);assert(v.synonyms.length&&v.antonyms.length);}
}
assert.equal(build('I thought the space was good').questions.length,0,'no guessed vocabulary');
const first=build('I really like this cafe');assert(model.render(first,'ko').includes('첫 기록이에요'));assert(!model.render(first,'ko').includes('<svg'));
const trend=model.build({bookingId:B,learnerId:L,language:'en',learnerLog:log(B,'I really like this cafe'),scheduledAt:'2026-10-07T05:00:00Z',history:Array.from({length:7},(_,n)=>({booking_id:id(n),scheduled_at:`2026-10-0${n+1}T04:00:00Z`,word_count:n+2}))});
assert.equal(trend.volume_history.length,5);assert.equal(trend.volume_history.at(-1).word_count,5);assert.equal(trend.volume_history.at(-2).word_count,8);
const second=model.build({bookingId:B,learnerId:L,language:'en',learnerLog:log(B,'I really like this cafe'),scheduledAt:'2026-10-07T05:00:00Z',history:[{booking_id:id(1),scheduled_at:'2026-10-06T05:00:00Z',word_count:8}]});
assert.equal(second.volume_history.length,2);assert(model.render(second,'ko').includes('직전 완료 세션 대비 -3단어'));
const text=model.render(trend,'ko');assert(text.includes('직전 완료 세션 대비 -3단어'));assert(text.includes('<svg'));assert(!/단어 넓히기|대화 참여|참여 비율|번말했어요/.test(text));
assert(model.render({...trend,volume_history_status:'unavailable',volume_history:[]},'ko').includes('이전 기록을 불러오지 못했어요.'));
for(const role of ['user','partner'])for(const locale of ['KO','EN']){
 const dom=new JSDOM('<html><head></head><body>'+f.markup+'</body></html>',{runScripts:'outside-only',url:'https://fixture.invalid'}),w=dom.window;
 w.localStorage.setItem('dayo_lang',locale);w.eval(f.read('public/i18n.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));w.DayOI18n.setLang(locale);
 w.DayORoomAccess={allowed:true,role};let on=true;w.DayOLive={isMicOn:()=>on,isCamOn:()=>on};w.eval(f.read('public/talk-cards-data.js'));w.eval(f.uiCode);
 const d=w.document,card=w.cardsForTalkCategory('daily')[0];assert.equal(d.getElementById('talkCardQuestion').getAttribute('data-card-id'),card.id);
 const partnerEn=role==='partner'&&locale==='EN';assert.equal(d.getElementById('talkCardQuestion').textContent,partnerEn?card.questionEn:card.questionKo);assert.equal(d.getElementById('talkCardQuestionEn').textContent,partnerEn?card.questionKo:card.questionEn);
 assert.equal(d.querySelector('.talk-card-followup span').lang,partnerEn?'en':'ko');
 assert.equal(JSON.stringify(w.DayOCurrentTalkCard),JSON.stringify({id:card.id,category:card.category,question_en:card.questionEn,question_ko:card.questionKo,followups_en:card.followupsEn.slice(0,4),followups_ko:card.followupsKo.slice(0,4)}));
 if(role==='user'){const before=d.getElementById('talkCardQuestion').textContent;assert.equal(w.renderTalkCardQuestion(true),null);assert.equal(d.getElementById('talkCardQuestion').textContent,before);}
 for(const k of ['nextQuestion','nextQuestionTitle','nextQuestionRefresh','nextQuestionError','nextQuestionLoading','talkCardsError','talkCardsReadonly','recentInterests'])assert.notEqual(w.DayOI18n.t('room.'+k),'room.'+k);
 if(locale==='EN'){assert.equal(d.getElementById('btn-partner-ask').textContent,'💡 Next question');assert.equal(d.getElementById('partner-question-refresh').textContent,'Refresh suggestions');assert.equal(d.querySelector('#partner-room-interests strong').textContent,'Recent interests');assert.equal(d.querySelector('#talk-card-panel .chat-header span').textContent,'🌐 DayO Talk Cards');}
 w.eval(f.functions(f.scripts,['escapeHtml','renderError']));w.renderError();assert.equal(d.getElementById('partner-topic-content').textContent,locale==='EN'?'Could not load questions.Please try again.':'질문을 불러오지 못했어요.다시 시도해 주세요.');
 on=false;w.renderMicLabel();w.renderCamLabel();for(const btn of ['micBtn','camBtn']){assert.equal(d.getElementById(btn).getAttribute('aria-pressed'),'false');assert(d.getElementById(btn).classList.contains('off'));assert(d.getElementById(btn).getAttribute('aria-label'));}dom.window.close();
}
// Test exact history queries and strict row validation using the actual API.
async function historyCheck(fail=false, missingPrevious=false, testSession=false){let calls=[];const response=data=>({ok:true,json:async()=>data});
 const previous=Array.from({length:6},(_,n)=>({id:id(n),learner_id:L,status:'completed',is_test_session:false,language:'en',scheduled_at:`2026-10-0${n+1}T05:00:00Z`}));
 previous.push({id:id(90),learner_id:P,status:'completed',is_test_session:false,language:'en',scheduled_at:'2026-10-06T05:00:00Z'},{...previous[0],id:id(91),is_test_session:true},{...previous[0],id:id(92),status:'cancelled'},{...previous[0],id:id(93),language:'fr'});
 const fetchImpl=async(url,args)=>{const u=new URL(url);calls.push({u,args});if(u.pathname==='/auth/v1/user')return response({id:L});
 if(u.pathname==='/rest/v1/bookings'&&u.searchParams.get('id')==='eq.'+B)return response([{id:B,learner_id:L,partner_user_id:P,status:'completed',language:'en',is_test_session:testSession,scheduled_at:'2026-10-07T05:00:00Z'}]);
 if(u.pathname==='/rest/v1/bookings'){assert.equal(args.headers.Authorization,'Bearer test.token');assert.equal(u.searchParams.get('learner_id'),'eq.'+L);assert.equal(u.searchParams.get('status'),'eq.completed');assert.equal(u.searchParams.get('is_test_session'),'eq.false');assert.equal(u.searchParams.get('scheduled_at'),'lt.2026-10-07T05:00:00Z');if(fail)throw Error('offline');return response(previous.reverse());}
 if(u.pathname==='/rest/v1/session_logs'&&u.searchParams.get('booking_id')==='eq.'+B)return response([log(B,'I really like this cafe')]);
 if(u.pathname==='/rest/v1/session_logs'){assert.equal(args.headers.Authorization,'Bearer test.token');assert.equal(u.searchParams.get('participant_id'),'eq.'+L);assert.equal(u.searchParams.get('participant_role'),'eq.learner');return response(previous.filter(b=>!missingPrevious||b.id!==id(5)).map((b,n)=>log(b.id,Array(n+1).fill('hello').join(' '))).concat([{...log(id(5),'Wrong role source'),participant_role:'partner',participant_id:P}]));}throw Error(url);};
 const handler=createHandler({env:{SUPABASE_URL:'https://test.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-anon'},fetchImpl});const res={setHeader(){},end(v){this.body=JSON.parse(v);}};
 await handler({method:'POST',headers:{authorization:'Bearer test.token'},body:{booking_id:B}},res);assert.equal(res.statusCode,200);
 if(testSession){assert.equal(res.body.recap.volume_history.length,0);assert.equal(res.body.recap.volume_history_status,'test_session');assert(!calls.some(c=>c.u.pathname==='/rest/v1/bookings'&&!c.u.searchParams.has('id')));assert(!model.render(res.body.recap,'ko').includes('<svg'));assert(model.render(res.body.recap,'ko').includes('TEST 세션은 성장 추이에 포함하지 않아요.'));}else if(fail){assert.equal(res.body.recap.volume_history.length,1);assert.equal(res.body.recap.volume_history_status,'unavailable');}else if(missingPrevious){assert.equal(res.body.recap.volume_previous.word_count,null);assert(model.render(res.body.recap,'ko').includes('직전 완료 세션의 발화 기록이 없어 비교할 수 없어요.'));assert(!model.render(res.body.recap,'ko').includes('직전 완료 세션 대비'));}else{assert.equal(res.body.recap.volume_history.length,5);assert.deepEqual(res.body.recap.volume_history.slice(0,4).map(r=>r.booking_id),[id(2),id(3),id(4),id(5)]);}
}
const productionAdmin=cp.execFileSync('git',['show','e8ff2bd:admin/src/lib/admin-data.ts'],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
assert.equal(f.functions(f.read('admin/src/lib/admin-data.ts'),['fetchSessionTranscriptBundle']),f.functions(productionAdmin,['fetchSessionTranscriptBundle']),'exact booking/error/retry fetch unchanged');
// Byte-for-byte proof that scoped edits leave role, media and card sync logic intact.
const baseline=cp.execFileSync('git',['show','origin/main:public/room.html'],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
const baseScripts=Array.from(baseline.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g),m=>m[1]).join('\n');
for(const name of ['canControlTalkCards','isRealPartnerCardController','isLearnerCardViewer','broadcastCurrentTalkCard','applyRemoteTalkCard','requestCurrentTalkCard','getLocalVideoTrack','applyLocalCameraPipUi'])assert.equal(f.functions(f.scripts,[name]),f.functions(baseScripts,[name]),name+' unchanged');
for(const marker of ['window.DayORoomAccessReady =','window.dayoApplyRoomRole =']){const block=html=>Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g),m=>m[1]).find(s=>s.includes(marker));assert(block(f.room),marker);const actual=block(f.room).replace(/          var endedHere = false;[\s\S]*?(?=          if \(booking.status !== 'confirmed'\))/, '');assert.equal(actual,block(baseline),'room access/role unchanged apart from own-ended recap redirect');}
for(const file of ['public/partner-report.js','public/partner-reward.js','public/supabase-client.js','public/learner-expressions.js','public/talk-cards-data.js','public/booking-modal.js','public/profile-store.js', 'profile-store.js'])assert.equal(f.read(file).replace(/\r/g,''),cp.execFileSync('git',['show','origin/main:'+file],{cwd:path.join(__dirname,'..'),encoding:'utf8'}).replace(/\r/g,''),file+' unchanged');
async function quizChecks(){
 for(const [text,total,seconds] of [['crowded',2,30],['crowded quiet',4,60],['crowded quiet delicious',6,90]]){
  const dom=new JSDOM('<html lang="ko"><body><div id="quiz-modal"><div id="quiz-content-box"></div></div><div id="memory-game-modal" hidden><h3 id="memory-game-title"></h3><div id="game-round-badge"></div><div id="review-quiz-timer" hidden></div><p id="game-kr-meaning"></p><div id="word-pool-container"></div><button id="quiz-skip-btn"></button></div></body></html>',{runScripts:'outside-only',url:'https://fixture.invalid'}),w=dom.window;
  const r=build(text);let now=Date.now(),persisted=null;w.Date=class extends Date{static now(){return now;}};w.setInterval=()=>1;w.clearInterval=()=>{};
  w.DayORoomAccess={allowed:true,role:'user',bookingId:B};w.DayOI18n={getLang:()=> 'ko'};w.DayOLearnerExpressions=require('../public/learner-expressions.js');w.DayOConversationRecap=model;
  w.getLearnerReviewSnapshot=()=>({booking_id:B,feedback:[{...r,progress:w.__dayoQuizProgress||r.progress}]});
  w.finalizeLearnerQuiz=async()=>{persisted=JSON.parse(JSON.stringify(w.getLearnerReviewSnapshot()));w.__dayoReviewReportSaved=true;return true;};w.openQuizModalImmediately=()=>{};w.eval(f.read('public/memory-game.js'));
  w.startRecapQuestions();assert.equal(w.document.getElementById('review-quiz-timer').textContent,String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'));
  for(let i=0;i<total;i++){
   if(i===1){now+=10000;w.startRecapQuestions();assert.equal(JSON.parse(w.sessionStorage.getItem('dayo_recap_state:'+B)).completed,1,'recovery preserves completed progress');}
   w.document.querySelector('.recap-option').click();assert.equal(w.__dayoQuizProgress.completed,i+1);
   Array.from(w.document.querySelectorAll('.recap-primary')).find(n=>n.textContent==='계속 보기').click();
  }
  await new Promise(setImmediate);const saved=model.saved(persisted);assert.equal(saved.progress.total,total);assert.equal(saved.progress.completed,total);assert.equal(saved.progress.reason,'completed');assert.equal(w.__dayoQuizScore,100);
  w.startRecapQuestions();assert.equal(w.__dayoQuizProgress.completed,total,'completed retry does not create extra answers');dom.window.close();
 }
}
Promise.all([historyCheck(),historyCheck(true),historyCheck(false,true),historyCheck(false,false,true),quizChecks()]).then(()=>console.log('PASS real room UI/i18n/card contract/role/media invariants, 2/4/6 quiz and duration, word trend and exact authenticated own completed-source queries')).catch(e=>{console.error(e);process.exitCode=1;});
