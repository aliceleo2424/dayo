/* Local read-only synthetic history and persistence fixtures. No live traffic. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('../public/conversation-recap.js'),H=require('../api/_lib/quiz-history.js'),{createHandler}=require('../api/conversation-recap.js');
const U='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222',B='33333333-3333-4333-8333-333333333333',X='44444444-4444-4444-8444-444444444444';
const current={id:B,learner_id:U,partner_user_id:P,status:'confirmed',language:'en',scheduled_at:'2026-10-10T00:00:00Z',is_test_session:false};
const log={id:'own-log',booking_id:B,participant_id:U,participant_role:'learner',transcript:[{id:'own',text:'The crowded cafe was quiet, delicious and expensive. Crowded crowded.',speaker:'learner',timestamp:current.scheduled_at}]};
const build=o=>M.build({bookingId:B,learnerId:U,partnerId:P,language:'en',learnerLog:log,...o});
const past=(n,o={})=>({id:'55555555-5555-4555-8555-'+String(n).padStart(12,'0'),learner_id:U,status:'completed',end_reason:'normal',language:'en',is_test_session:false,scheduled_at:'2026-10-0'+n+'T00:00:00Z',completed_at:'2026-10-0'+n+'T00:30:00Z',...o});
function report(b,words,o={}){const r={...build(),booking_id:b.id,word_expansion:words.map(word=>({word})),questions:words.flatMap(word=>[{word,type:'synonym'},{word,type:'antonym'}]),progress:{completed:2,total:words.length*2,reason:'skip'}};return {booking_id:b.id,learner_id:U,feedback:[r],...o};}
let checks=0;function eq(a,b,label){assert.deepEqual(a,b,label);checks++;}
async function load(bookings,reports,fail){const calls=[];const read=async route=>{calls.push(route);if(fail)throw Error('offline');return route.startsWith('/rest/v1/bookings?')?bookings:reports;};return {...await H.load(read,current,U),calls};}
async function main(){
 for(let n=0;n<=3;n++){const bs=Array.from({length:n},(_,i)=>past(i+1)),r=await load(bs,bs.map(b=>report(b,['crowded'])));eq(r.status,'available');eq(r.words,n?['crowded']:[]);}
 const four=[past(1),past(2),past(3),past(4)];eq((await load(four,four.map((b,i)=>report(b,[['expensive','delicious','quiet','crowded'][i]])))).words,['delicious','quiet','crowded'],'only three most recent');
 const mixed=[past(8,{is_test_session:true}),past(7,{status:'cancelled'}),past(6),past(5),past(4),past(3)];eq((await load(mixed,mixed.map(b=>report(b,[b.id===past(6).id?'crowded':b.id===past(5).id?'quiet':b.id===past(4).id?'delicious':'expensive'])))).words,['crowded','quiet','delicious'],'TEST/cancelled do not consume normal-session slots');
 const expired=[past(1),past(2),past(3),past(4)];const cooldown=await load(expired,expired.map((b,i)=>report(b,[['crowded','quiet','delicious','expensive'][i]])));eq(build({quizExcludedWords:cooldown.words}).word_expansion.map(w=>w.word),['crowded'],'word becomes eligible after three-session cooldown');
 const excluded=[past(8,{is_test_session:true}),past(7,{status:'cancelled'}),past(6,{end_reason:'user_early_exit'}),past(5,{status:'no_show'}),past(4,{status:'confirmed'}),past(3,{completed_at:null}),past(2,{learner_id:X}),past(1,{language:'fr'})];
 eq((await load(excluded,excluded.map(b=>report(b,['crowded'])))).words,[],'all non-normal/user/language rows excluded');
 const bs=[past(1),past(2),past(3)];const reports=[report(bs[0],['  CROWDED  ']),report(bs[1],['ＱＵＩＥＴ']),report(bs[2],['delicious'])];let r=await load(bs,reports);eq(r.words,['crowded','quiet','delicious']);
 for(let n=0;n<=3;n++){const out=build({quizExcludedWords:['crowded','quiet','delicious'].slice(0,n),quizHistoryStatus:'available'});eq(out.questions.length,Math.min(3,4-n)*2);eq(new Set(out.word_expansion.map(w=>w.word)).size,out.word_expansion.length,'no current-session duplicates');}
 eq(build({quizExcludedWords:['crowded','quiet','delicious','expensive']}).questions.length,0);eq(build({quizExcludedWords:['crowded','quiet','delicious']}).word_expansion.map(w=>w.word),['expensive']);
 const legacyNormal=past(1,{is_test_session:null});eq((await load([legacyNormal],[report(legacyNormal,['crowded'])])).words,['crowded'],'canonical null TEST flag means non-TEST');
 eq((await load([past(3),past(2),past(1)],[])).words,[],'missing quiz data does not scan back for older words');
 const transcriptOnly=report(bs[0],[]);transcriptOnly.feedback[0].word_expansion=[{word:'crowded'}];eq((await load([bs[0]],[transcriptOnly])).words,[],'only actual saved targets, never expansion/transcript vocabulary');
 eq((await load([bs[0]],[report(bs[0],['crowded'],{learner_id:X})])).words,[],'foreign report ignored');
 const foreignLanguage=report(bs[0],['crowded']);foreignLanguage.feedback[0].language='fr';eq((await load([bs[0]],[foreignLanguage])).words,[]);
 const future=past(1,{completed_at:'2026-10-11T00:00:00Z'});eq((await load([future],[report(future,['crowded'])])).words,[]);
 eq((await load(bs,reports,true)).status,'unavailable');eq(build({quizHistoryStatus:'unavailable'}).questions.length,0,'failed history never recycles candidates');
 const routes=r.calls.map(p=>new URL('https://fixture'+p));eq(routes[0].searchParams.get('limit'),'3');eq(routes[0].searchParams.get('end_reason'),'eq.normal');eq(routes[0].searchParams.get('learner_id'),'eq.'+U);eq(routes[1].searchParams.get('learner_id'),'eq.'+U);assert(!routes[1].search.includes('transcript'));
 // Production handler path: authenticated caller only, RLS headers on history, no writes.
 const stored={...build(),progress:{completed:4,total:6,reason:'skip'}};const frozen=JSON.stringify(stored);
 async function api(o={}){const calls=[];const fetchImpl=async(url,args)=>{calls.push({url,args});const query=new URL(url).searchParams;let data;
  if(url.includes('/auth/v1/user'))data={id:o.outsider?X:U};
  else if(url.includes('/bookings?'))data=query.has('order')?(query.get('limit')==='3'?bs:[]):(o.outsider?[]:[current]);
  else if(url.includes('/session_logs?'))data=query.get('participant_role')==='eq.partner'?[]:[log];
  else if(url.includes('/session_reports?')){if(o.fail)throw Error('history offline');data=query.get('booking_id')==='eq.'+B?(o.saved?[{booking_id:B,learner_id:U,feedback:[stored]}]:[]):reports;}
  else throw Error('unexpected route');return {ok:true,json:async()=>data};};
  const handler=createHandler({env:{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic'},fetchImpl});const res={setHeader(){},end(s){this.body=JSON.parse(s);}};
  await handler({method:'POST',headers:{authorization:'Bearer own.token'},body:{booking_id:B}},res);return {...res,calls};}
 let fresh=await api();eq(fresh.statusCode,200);eq(fresh.body.recap.word_expansion.map(w=>w.word),['expensive']);eq(fresh.body.recap.questions.length,2);
 let reload=await api({saved:true});eq(reload.body.recap.questions,stored.questions,'saved quiz after reload unchanged');eq(reload.body.recap.progress,stored.progress);eq(JSON.stringify(stored),frozen,'historical marker never mutated');eq(reload.calls.filter(c=>new URL(c.url).searchParams.get('limit')==='3').length,0,'saved quiz does not query new history');
 const generation=build({quizHistoryStatus:'available',quizExcludedWords:['crowded','quiet','delicious']});const retryable=build({quizHistoryStatus:'unavailable'});eq(retryable.quiz_history_status,'unavailable');eq(generation.questions.length,2);eq(M.quizDuration(2),30);eq(M.quizDuration(4),60);eq(M.quizDuration(6),90);
 eq((await api({fail:true})).body.recap.questions.length,0);eq((await api({outsider:true})).statusCode,403);
 assert(fresh.calls.every(c=>!c.args.method||c.args.method==='GET'));eq(fresh.calls.filter(c=>c.url.includes('/session_reports?')).every(c=>c.args.headers.Authorization==='Bearer own.token'),true,'history uses user JWT, never privileged read');
 for(const f of ['conversation-recap.js','session-lifecycle.js'])eq(fs.readFileSync(path.join(__dirname,'../'+f),'utf8'),fs.readFileSync(path.join(__dirname,'../public/'+f),'utf8'),'mirror '+f);
 console.log('PASS quiz novelty: '+checks+' checks; 0–3/more history, non-normal exclusions, normalized words, 0/2/4/6 questions, owner/language isolation, history failure, saved quiz/progress/reload, read-only API.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
