const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),cp=require('node:child_process');
const source=fs.readFileSync('public/supabase-client.js','utf8'),html=fs.readFileSync('public/room.html','utf8');
const B='50e68888-4a7a-4da1-86e2-2ea3ec18c910',P='22222222-2222-4222-8222-222222222222',U='11111111-1111-4111-8111-111111111111';
function harness(response,thrown){
 let calls=[];const localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}},window={localStorage,DayORoomAccess:{allowed:true,role:'partner',bookingId:B,partnerId:P,learnerId:U},supabaseClient:{auth:{getUser:async()=>({data:{user:{id:P}}})},rpc:async(name,args)=>{calls.push({name,args});if(thrown)throw Error('network');return response;}}};
 const document={readyState:'loading',addEventListener:()=>{},getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]};
 vm.runInNewContext(source,{window,document,localStorage,console:{log:()=>{},warn:()=>{},error:()=>{}},setTimeout});
 return {save:()=>window.persistSessionReport({partnerComment:'Original fixture draft',summary:'must not write'}),calls};
}
(async()=>{
 const success=harness({data:{success:true,learner_id:U}});assert.equal((await success.save()).ok,true);assert.equal(success.calls[0].name,'merge_partner_session_report');assert.equal(success.calls[0].args.p_booking_id,B);assert.equal(success.calls[0].args.p_report.partner_comment,'Original fixture draft');assert(!('summary' in success.calls[0].args.p_report));
 for(const response of [{data:{success:false}},{data:null,error:{code:'42501'}},{data:null,error:{code:'23514'}},{data:null,error:{code:'23505'}}]){const r=await harness(response).save();assert.equal(r.ok,false);assert.equal(r.confirmedFailure,true);}
 for(const response of [null,{data:null},{data:'malformed'},{data:{success:true,learner_id:P}},{error:{message:'Failed to fetch'}},{error:{code:'PGRST999'}},{data:'{"success":false}'}]){const r=await harness(response).save();assert.equal(r.ok,false);assert.notEqual(r.confirmedFailure,true);}
 assert.notEqual((await harness(null,true).save()).confirmedFailure,true);
 assert.equal(source,fs.readFileSync('supabase-client.js','utf8'));assert.equal(html,fs.readFileSync('room.html','utf8'));
 const base=f=>cp.execFileSync('git',['show','44f76c04:'+f],{cwd:process.cwd(),encoding:'utf8'}).replace(/\r\n/g,'\n'),read=f=>fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');
 for(const f of ['public/conversation-recap.js','public/session-chat.js','public/session-lifecycle.js','public/memory-game.js','public/room-live.js'])assert.equal(read(f),base(f),f+' unchanged');
 // The approved private-image integration changes this file; its non-image logic is protected.
 const slice=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
 const currentUI=read('public/user-conversation-report.js'),priorUI=base('public/user-conversation-report.js');
 for(const pair of [['function corrections(','function imageURL('],['async function refreshRecapPresentation(','async function fetchLatest('],['function renderArchive(','return {']])
  assert.equal(slice(currentUI,...pair),slice(priorUI,...pair),'non-image report/quiz/Letter logic unchanged');
 const finish=s=>s.slice(s.indexOf('    async function checkPartnerFinishAfterLetter('),s.indexOf('    window.executePartnerPayoutAndExit ='));
 assert.equal(finish(read('public/room.html')),finish(base('public/room.html')),'finish/reward calls unchanged');
 console.log('PASS write outcomes: structured ACK/rejection, known DB rollback, malformed/lost ACK unknown, payload/auth unchanged, protected Recap/chat/quiz/STT/lifecycle and mirrors unchanged.');
})().catch(e=>{console.error(e);process.exitCode=1});
