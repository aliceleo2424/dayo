const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {JSDOM}=require('jsdom'),L=require('../api/_lib/partner-letter.js'),C=require('../public/partner-report-contract.js'),I=require('../public/partner-illustration.js');
const B='ea5289f9-41fe-4b94-9677-bd3b038c87eb',U='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222',T='2026-10-10T09:46:00Z';
const texts=['I went to a crowded café and had coffee.','I love coffee at a quiet café.','I have a rabbit and I love my rabbit.'];
const messages=texts.map((text,i)=>({id:'m'+i,booking_id:B,sender_id:U,sender_role:'learner',text,created_at:T}));
const log={id:'log',booking_id:B,participant_id:U,participant_role:'learner',transcript:texts.map((text,i)=>({id:'s'+i,speaker:'learner',text,timestamp:T}))};
function fixture(speech,chat,opts={}){let calls=[];return {calls,user:{id:P},env:{SUPABASE_SERVICE_ROLE_KEY:'fixture-only'},read:async(route,headers)=>{calls.push({route,headers});if(route.includes('bookings?'))return [{id:B,learner_id:U,partner_user_id:P,status:'confirmed',language:opts.language||'en'}];if(route.includes('profiles?'))return [{id:P,role:'partner'}];if(route.includes('session_logs?'))return speech?[speech]:[];if(route.includes('booking_chat_messages?')){assert.equal(headers,undefined,'chat uses participant JWT, not server-key headers');assert(route.includes('booking_id=eq.'+B));assert(route.includes('sender_id=eq.'+U));if(opts.chatFailure)throw Error('unavailable');return chat;}throw Error('unexpected read');}};}
const topics=o=>L.handle({...o,input:{action:'partner_letter_topics',booking_id:B}});
const blocks=quote=>({blocks:[{type:'memory',text:'You mentioned a café and coffee.',evidence:quote},{type:'reaction',text:'That café makes me want a cup of coffee.',evidence:quote},{type:'next',text:'Which café would you like to talk about next time?',evidence:quote}]});
async function main(){
 const speech=await topics(fixture(log,[])),chat=await topics(fixture(null,messages)),mixed=await topics(fixture(log,messages));
 for(const r of [speech,chat,mixed]){assert.equal(r.status,200);assert(r.body.topics.length>0&&r.body.topics.length<=3);assert(C.storyIllustrations(r.body.topics).length===1);}
 assert(speech.body.topics.every(t=>t.source_medium==='speech'));assert(chat.body.topics.every(t=>t.source_medium==='chat'));
 assert(chat.body.topics.every(t=>messages.some(m=>'chat:'+m.id===t.id&&m.text===t.quote)));
 assert.deepEqual((await topics(fixture(null,[]))).body.topics,[]);
 const unsafe=['Hello','coffee rabbit','song Soo is installed','My name is Alice and I love coffee.','Email me at private@example.com.'];
 assert.deepEqual((await topics(fixture(null,unsafe.map((text,i)=>({...messages[0],id:'bad'+i,text}))))).body.topics,[]);
 assert.deepEqual((await topics(fixture(null,messages.map(m=>({...m,booking_id:'other'}))))).body.topics,[]);
 assert.deepEqual((await topics(fixture(null,messages.map(m=>({...m,sender_id:P,sender_role:'partner'}))))).body.topics,[]);
 assert.deepEqual((await topics(fixture(null,messages,{language:'ko'}))).body.topics,[]);
 assert((await topics(fixture(log,[],{chatFailure:true}))).body.topics.length>0);
 const f=fixture(null,messages),topic=chat.body.topics.find(t=>t.label==='Food & cafés');let payload;
 const result=await L.handle({...f,input:{booking_id:B,action:'partner_letter_blocks',topic_id:topic.id,source_version:chat.body.source_version},draftGenerator:async d=>{payload=d.topic;return blocks(d.topic.quote);}});
 assert.equal(result.status,200);assert.equal(result.body.blocks.length,3);assert(result.body.blocks.every(b=>b.source_medium==='chat'&&b.source_utterance_id===topic.id));assert.deepEqual(Object.keys(payload).sort(),['label','quote']);
 assert.equal((await L.handle({...fixture(null,messages.slice(1)),input:{booking_id:B,action:'partner_letter_blocks',topic_id:topic.id,source_version:chat.body.source_version}})).status,409);
 assert.equal((await topics({...f,user:{id:'outsider'}})).status,403);
 const html=fs.readFileSync(path.join(__dirname,'../public/room.html'),'utf8'),popup=html.slice(html.indexOf('  <div id="partner-report-popup"'),html.indexOf('<div id="early-exit-modal"'));
 assert(!/pr-note-templates|pr-note-starters|pr-recommendation|edit any template/.test(popup));assert.equal(C.templates,undefined);assert.equal(C.note,undefined);
 const dom=new JSDOM(popup,{url:'https://fixture.invalid',runScripts:'outside-only'}),w=dom.window;w.DayOPartnerReportContract=C;w.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'fixture-only'}}})}};
 let fail=false;w.fetch=async(_,o)=>{const action=JSON.parse(o.body).action;return {ok:!fail,json:async()=>action==='partner_letter_topics'?chat.body:result.body};};
 w.eval(fs.readFileSync(path.join(__dirname,'../public/partner-report.js'),'utf8'));const area=w.document.getElementById('popup-partner-comment');area.value='Existing manual draft';w.DayOPartnerReport.open({bookingId:B});await new Promise(setImmediate);
 assert.equal(area.value,'Existing manual draft');assert.equal(w.document.querySelector('.pr-optional').hidden,true,'disabled generation is not advertised');assert.equal(w.document.querySelectorAll('#pr-keyword-options button').length,0);w.document.querySelector('#pr-letter-topics button').click();assert(w.document.getElementById('pr-letter-status').textContent.startsWith('Recorded User chat:'));
 w.document.getElementById('pr-letter-generate').click();await new Promise(setImmediate);assert.equal(w.document.querySelectorAll('.pr-letter-draft').length,3);assert(w.document.querySelector('.pr-letter-draft strong').textContent.startsWith('Suggested'));
 const use=[...w.document.querySelectorAll('.pr-letter-draft button')].filter(b=>b.textContent==='Use this sentence');use[0].click();use[0].click();assert.equal(area.value.split('\n').length,2);const draft=area.value;w.DayOPartnerReport.open({bookingId:B});assert.equal(area.value,draft);
 fail=true;w.document.getElementById('pr-letter-generate').click();await new Promise(setImmediate);assert.equal(area.value,draft);assert.equal(w.document.querySelectorAll('.pr-letter-draft').length,0);dom.window.close();
 let loads=0,events=[];const manager=I.create({contract:C,storage:{getItem:()=>null,setItem:()=>{}},load:()=>{loads++;throw Error('must not call provider');},observe:e=>events.push(e),setTimeout,clearTimeout});
 const disabled=await manager.start({bookingId:B,actorId:P,theme:C.storyIllustrations(chat.body.topics)[0].theme,seed:1});assert.equal(disabled.failure,'generation_disabled');assert.equal(loads,0);assert.equal(events.at(-1).stage,'generation_disabled');
 // Guard unrelated functionality and the full submission/status block byte-for-byte.
 const repo=path.resolve(__dirname,'..'),base=f=>cp.execFileSync('git',['show','44f76c04:'+f],{cwd:repo,encoding:'utf8'}).replace(/\r\n/g,'\n'),read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/\r\n/g,'\n');
 // The approved private-image integration changes this file; its non-image logic is protected.
 const slice=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
 const currentUI=read('public/user-conversation-report.js'),priorUI=base('public/user-conversation-report.js');
 for(const pair of [['function corrections(','function imageURL('],['async function refreshRecapPresentation(','async function fetchLatest('],['function renderArchive(','return {']])
  assert.equal(slice(currentUI,...pair),slice(priorUI,...pair),'non-image report/quiz/Letter logic unchanged');
 const submit=s=>s.slice(s.indexOf('    function setPartnerReportSubmitStatus('),s.indexOf('    window.handleHeaderExitClick ='));
 assert.equal(require('node:crypto').createHash('sha256').update(submit(read('public/room.html'))).digest('hex'),'6d7a81beb8ef4d502b0ec3cb6a0a677312942e2105ebbb25a9243cf9c87eab0e','reviewed status block preserved');
 for(const file of ['public/session-chat.js','public/session-lifecycle.js','public/conversation-recap.js','public/memory-game.js','api/_lib/partner-letter-gemini.js'])assert.equal(read(file),base(file),file+' unchanged');
 for(const file of ['room.html','partner-report.js','partner-report-contract.js','partner-illustration.js','conversation-recap.css'])assert.equal(read('public/'+file),read(file));
 console.log('PASS Letter UX: speech/chat/mixed/insufficient evidence, exact identity/version/PII guards, 3 grounded suggestions, no starters/fallback, editable retained drafts, disabled-provider diagnosis, reviewed status integration and protected files unchanged, mirrors.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
