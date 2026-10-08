
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),adminRequire=createRequire(path.join(root,'admin/package.json')),ts=adminRequire('typescript');
let copiedId=null;let tables={},calls=[],failing=new Set(),hookReact=null;
const supabase={from(table){const filters=[];let single=false;const q={select(){return q;},eq(key,value){filters.push([key,value]);return q;},maybeSingle(){single=true;return q;},then(resolve,reject){calls.push({table,filters});assert.deepEqual(filters,[['booking_id','target-booking']]);const rows=(tables[table]||[]).filter(row=>row.booking_id==='target-booking');return Promise.resolve({data:single?(rows[0]||null):rows,error:failing.has(table)?{message:'test unavailable'}:null}).then(resolve,reject);}};return q;}};
function load(relative,extra=''){const source=fs.readFileSync(path.join(root,relative),'utf8')+extra;const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;const box={exports:{},require:name=>name==='./ConversationPartnerFeedback'?{ConversationPartnerFeedback:()=>null}:name==='react'&&hookReact?hookReact:name==='@/lib/supabase'?{supabase}:name==='@/lib/admin-data'?lib:name==='lucide-react'?{X:()=>null}:name==='@/lib/utils'?{cn:(...values)=>values.filter(Boolean).join(' ')}:name.startsWith('@/components/ui/')?new Proxy({},{get:(_,tag)=>props=>adminRequire('react').createElement(tag,props,props.children)}):adminRequire(name),console,setTimeout,navigator:{clipboard:{writeText:async id=>{copiedId=id;}}},window:{addEventListener(){},removeEventListener(){}}};vm.runInNewContext(compiled,box,{filename:relative});return box.exports;}
const lib=load('admin/src/lib/admin-data.ts');
const {ReportPanel,TranscriptBubble}=load('admin/src/components/admin/SessionTranscriptModal.tsx','\nexport { ReportPanel, TranscriptBubble };');
const React=adminRequire('react'),render=adminRequire('react-dom/server').renderToStaticMarkup;
const stamp='2026-10-06T05:30:00Z';
const log=(role,id,text,time=stamp)=>({id,booking_id:'target-booking',participant_role:role,started_at:'2026-10-06T05:00:00Z',ended_at:'2026-10-06T05:40:00Z',transcript:[{id:'same-local-id',speaker:role,text,timestamp:time}]});
const report={id:'report',booking_id:'target-booking',partner_comment:'Exact Partner Letter',stamp:'tea',spoken_sentence:'This is just a useful sentence.',summary:'Saved recap summary',feedback:[{source:'learner_recognized_speech',speaker:'learner',source_log_id:'learner-log',source_utterance_id:'same-local-id',original_text:'I am very agree.',suggested_text:'I completely agree.',meaning_preserved:true,correction_needed:true,short_reason:'Use agree without am.'},{kind:'conversation_recap',schema_version:1,generator:'dayo_conversation_recap_v1',booking_id:'target-booking',source:{learner_log_id:'learner-log'},metrics:{user_word_count:4,user_utterance_count:1,user_participation_ratio:null},topics:[{ko:'여행',en:'Travel'}],expressions:[{text:'I completely agree.'}]}]};
async function run(name,data,verify,errors=[]){tables=data;calls=[];failing=new Set(errors);const result=await lib.fetchSessionTranscriptBundle({id:'target-booking',learnerId:'same-learner',partnerName:'Same Partner',scheduled_at:stamp});verify(result);for(const call of calls)assert.deepEqual(call.filters,[['booking_id','target-booking']]);console.log(name+': passed');return result;}
(async()=>{
await run('exact log/report',{session_logs:[log('learner','learner-log','I am very agree.')],session_reports:[report]},r=>{assert.equal(r.utterances.length,1);assert.equal(r.report.partnerComment,report.partner_comment);assert.equal(r.report.partnerStamp,'tea');assert.equal(r.report.corrections[0].corrected,'I completely agree.');assert.equal(r.report.recap.userWordCount,4);assert.equal(r.report.recap.participationRatio,null);const html=render(React.createElement(ReportPanel,{report:r.report}));assert.match(html,/Exact Partner Letter/);assert.match(html,/I completely agree/);assert.match(html,/Saved recap summary/);assert.doesNotMatch(html,/참여 비율/);});
await run('learner only',{session_logs:[log('learner','learner-log','Learner only')]},r=>assert.equal(r.utterances[0].speaker,'learner'));
await run('partner only',{session_logs:[log('partner','partner-log','Partner only')]},r=>assert.equal(r.utterances[0].speaker,'partner'));
await run('both roles chronological',{session_logs:[log('learner','learner-log','Learner later','2026-10-06T05:31:00Z'),log('partner','partner-log','Partner first')]},r=>{assert.equal(r.utterances.length,2);assert.equal(r.utterances[0].speaker,'partner');assert.notEqual(r.utterances[0].id,r.utterances[1].id);const html=r.utterances.map(row=>render(React.createElement(TranscriptBubble,{row,learnerName:'학습자',partnerName:'파트너'}))).join('');assert.match(html,/Partner first/);assert.match(html,/Learner later/);});
await run('no records',{},r=>{assert.equal(r.utterances.length,0);assert.equal(r.report.hasReport,false);assert.match(render(React.createElement(ReportPanel,{report:r.report})),/이 세션의 저장된 리포트가 없습니다/);});
await run('other session history never substituted',{session_logs:[{...log('learner','other','WRONG TRANSCRIPT'),booking_id:'other-booking',user_id:'same-learner'}],session_transcripts:[{...log('partner','other2','WRONG ALTERNATE'),booking_id:'other-booking'}],session_reports:[{...report,booking_id:'other-booking',learner_id:'same-learner',partner_name:'Same Partner'}]},r=>{assert.equal(r.utterances.length,0);assert.equal(r.report.hasReport,false);});
await run('compatibility transcript stays exact',{session_logs:[],session_transcripts:[log('learner','compat','Exact alternate'),{...log('learner','wrong','WRONG'),booking_id:'other-booking'}]},r=>{assert.equal(r.utterances.length,1);assert.equal(r.utterances[0].text,'Exact alternate');});
for (const table of ['session_logs','session_reports','session_transcripts']) {
  tables={session_logs:table==='session_reports'?[log('learner','learner-log','Saved')]:[],session_transcripts:[log('learner','compat','Exact alternate')],session_reports:[report]}; calls=[]; failing=new Set([table]);
  await assert.rejects(lib.fetchSessionTranscriptBundle({id:'target-booking'}), /대화 기록을 불러오지 못했습니다/);
  if(table==='session_logs') assert.equal(calls.length,1,'canonical failure never uses fallback');
  failing.clear();
  const retried=await lib.fetchSessionTranscriptBundle({id:'target-booking'});
  assert.equal(retried.utterances.length,1,'retry fetches current exact booking');
}
await run('late save after empty',{session_logs:[log('learner','late-log','Saved after modal opened')],session_reports:[report]},r=>assert.equal(r.utterances[0].text,'Saved after modal opened'));
await run('spoken sentence is not a correction',{session_reports:[{...report,feedback:[],summary:null}]},r=>{assert.equal(r.report.corrections.length,0);assert.equal(r.report.recap,null);assert.doesNotMatch(render(React.createElement(ReportPanel,{report:r.report})),/This is just a useful sentence/);});
await run('other booking embedded recap ignored',{session_reports:[{...report,feedback:[{...report.feedback[1],booking_id:'other-booking'}]}]},r=>assert.equal(r.report.recap,null));
await run('unknown metrics stay unknown',{session_reports:[{...report,feedback:[{...report.feedback[1],metrics:{}}]}]},r=>{assert.equal(r.report.recap.userWordCount,null);assert.equal(r.report.recap.userUtteranceCount,null);});
const modal=fs.readFileSync(path.join(root,'admin/src/components/admin/SessionTranscriptModal.tsx'),'utf8');assert.match(modal,/이 세션의 저장된 대화 기록이 없습니다\./);assert.match(modal,/listBookingCsNotes\(session.id\)/);assert.match(modal,/bookingId === session.id/);
assert.match(modal,/대화 기록을 불러오지 못했습니다/); assert.match(modal,/다시 시도/); assert.ok(modal.includes('[open, session, retryVersion]')); assert.doesNotMatch(modal,/catch \{\s*if \(!cancelled\) setBundleState/);

// Exercise the actual modal's hook/effect and retry button without DB writes.
let states=[],deps=[],cleanups=[],queued=[],cursor=0,effectCursor=0;
hookReact={...React,useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useEffect(fn,next){const i=effectCursor++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){deps[i]=next;queued.push(()=>{cleanups[i]?.();cleanups[i]=fn();});}}};
const {SessionTranscriptModal}=load('admin/src/components/admin/SessionTranscriptModal.tsx');
lib.fetchSessionDetailContext=async()=>({id:'target-booking',scheduled_at:stamp,learnerName:'Exact User',partnerName:'Exact Partner'});
const props={open:true,session:{id:'target-booking',scheduled_at:stamp},onClose(){}};
const view=()=>{cursor=effectCursor=0;return SessionTranscriptModal(props);};
function nodes(tree,result=[]){if(!tree||typeof tree!=='object')return result;result.push(tree);for(const child of [tree.props?.children].flat(Infinity))nodes(child,result);return result;}
const text=tree=>nodes(tree).flatMap(n=>[n.props?.children].flat(Infinity).filter(c=>typeof c==='string')).join(' ');
async function settle(){for(const fn of queued.splice(0))fn();await new Promise(resolve=>setTimeout(resolve,0));return view();}
tables={session_logs:[],session_reports:[]};calls=[];failing=new Set(['session_logs']);view();let tree=await settle();
assert.match(text(tree),/대화 기록을 불러오지 못했습니다/);assert.doesNotMatch(text(tree),/이 세션의 저장된 대화 기록이 없습니다/);
let button=nodes(tree).find(n=>n.props?.children==='다시 시도');assert.ok(button);failing.clear();tables.session_logs=[log('learner','retry-log','Retry fetched newest exact transcript')];button.props.onClick();view();tree=await settle();
const bubbles=nodes(tree).filter(n=>n.props?.row && n.props?.learnerName);assert.equal(bubbles[0].props.row.text,'Retry fetched newest exact transcript');assert.doesNotMatch(text(tree),/대화 기록을 불러오지 못했습니다/);
assert.ok(calls.every(c=>c.filters[0][1]==='target-booking'));
// Successful empty state also offers a refresh for records saved later.
props.session={...props.session};tables={};view();tree=await settle();assert.match(text(tree),/이 세션의 저장된 대화 기록이 없습니다/);
button=nodes(tree).find(n=>n.props?.children==='다시 시도');tables.session_logs=[log('learner','late-log','Late saved exact transcript')];button.props.onClick();view();tree=await settle();assert.equal(nodes(tree).find(n=>n.props?.row && n.props?.learnerName).props.row.text,'Late saved exact transcript');
const testSession={id:'target-booking',is_test_session:true};
 props.session=testSession;tree=view();
 assert(render(tree).includes('TEST · target-b'));
 const copyButton=nodes(tree).find(n=>n.props?.children==='예약 ID 복사');assert(copyButton);await copyButton.props.onClick();assert.equal(copiedId,'target-booking');
 console.log('Actual modal TEST identity and full booking ID copy: passed');
 console.log('Actual modal empty/error/retry/late-save transitions: passed');

console.log('Session QA exact booking and failure/retry fixtures passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
