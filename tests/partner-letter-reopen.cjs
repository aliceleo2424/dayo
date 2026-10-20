// Ended room: a Partner can reopen the Letter window only while no Letter is saved (2026-10-20).
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8');
const L='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222',B='44444444-4444-4444-8444-444444444444';
const room=read('public/room.html'),helper=read('public/room-session-state.js'),gate=[...room.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
assert.equal(read('room.html'),room,'root room.html mirrors public/room.html');
const i18n=read('public/i18n.js');assert(/'room\.writeLetter': \{ KO: "[^"]+", EN: "Write your Letter" \}/.test(i18n),'button copy in EN and KO');

function mock(user){const booking={id:B,learner_id:L,partner_user_id:P,status:'confirmed',language:'en',scheduled_at:new Date().toISOString()};
 return {auth:{async getUser(){return {data:{user:{id:user}}};}},from(table){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:table==='profiles'?{role:user===P?'partner':'user'}:booking};}};},
  async rpc(){return {data:{success:true,booking_id:B,participant_id:user,role:user===P?'partner':'learner',session_ended:true,end_event_id:B}};}};}
async function runGate(user){const nodes={};const document={readyState:'complete',body:{classList:{add(){},contains(){return false;}}},getElementById(id){return nodes[id]||(nodes[id]={});}};
 const w={document,supabaseClient:mock(user),location:{search:'?bookingId='+B,replace(url){w.redirect=url;}},localStorage:{getItem(){return null;}},sessionStorage:{getItem(){return null;}},DayOI18n:{t:k=>k},setTimeout,clearTimeout};w.window=w;
 const c=vm.createContext({...w,window:w,document,location:w.location,localStorage:w.localStorage,sessionStorage:w.sessionStorage,console,URLSearchParams,Intl,Date,setTimeout,clearTimeout});
 vm.runInContext(helper,c);vm.runInContext(gate,c);await w.DayORoomAccessReady;return w.DayORoomAccess;}

const start=room.indexOf('// Letter reopen (2026-10-20)'),end=room.indexOf('// End letter reopen',start);
assert(start>0&&end>start,'reopen block present');const block=room.slice(start,end);
function el(tag){return {tag,children:[],style:{},attrs:{},classList:{list:[],add(c){this.list.push(c);}},setAttribute(k,v){this.attrs[k]=v;},append(...n){this.children.push(...n);},insertBefore(n){this.children.unshift(n);}};}
async function runReopen(access,opts){const box=el('div'),link=el('a'),body=el('body');let opened=0,statusCalls=0;
 const document={body,createElement:el,getElementById(id){return id==='room-letter-reopen'?box.children.find(n=>n.id===id)||null:id==='room-access-link'?link:null;},querySelector(){return box;}};
 const w={document,DayORoomAccess:access,DayOI18n:{t:(k,lang)=>k+':'+lang},supabaseClient:{auth:{async getUser(){return {data:{user:{id:opts.user}}};}}},openPartnerReportPopup(){opened++;}};w.window=w;
 const c=vm.createContext({window:w,document,console,existingPartnerLetter:async id=>{statusCalls++;assert.equal(id,B);if(opts.fail)throw new Error('status_check_failed');return {letter_sent:opts.sent};}});
 vm.runInContext(block,c);const shown=await w.offerPartnerLetterReopen();const button=box.children.find(n=>n.id==='room-letter-reopen');
 if(button){button.onclick();}return {shown,button,opened,statusCalls,w,body};}

(async()=>{
 const partner=await runGate(P);assert.equal(partner.allowed,false);assert.equal(partner.sessionEnded,true);
 assert.deepEqual({...partner.letterReopen},{bookingId:B,learnerId:L,partnerId:P,language:'en'},'Partner ended screen carries exact booking identity');
 const learner=await runGate(L);assert.equal(learner.letterReopen,undefined,'User is routed to recap, no Letter reopen');
 console.log('PASS gate: Partner ended state carries Letter reopen identity; User unchanged.');

 const ended=()=>({...partner,letterReopen:{...partner.letterReopen}});
 let r=await runReopen(ended(),{user:P,sent:false});
 assert.equal(r.shown,true);assert.equal(r.button.textContent,'room.writeLetter:EN');assert.equal(r.opened,1);
 const a=r.w.DayORoomAccess;assert.equal(a.allowed,true);assert.equal(a.letterOnly,true);assert.equal(a.role,'partner');assert.equal(a.adminTest,false);assert.equal(a.observer,false);
 assert.equal(a.bookingId,B);assert.equal(a.partnerId,P);assert.equal(a.learnerId,L);assert(r.body.classList.list.includes('room-letter-only'));
 for(const [opts,why] of [[{user:P,sent:true},'already sent'],[{user:P,fail:true},'status unknown'],[{user:L,sent:false},'other signed-in user']]){
  r=await runReopen(ended(),opts);assert.equal(r.shown,false,why);assert.equal(r.button,undefined,why);assert.equal(r.opened,0,why);assert.equal(r.w.DayORoomAccess.allowed,false,why);}
 r=await runReopen({allowed:false,title:'x'},{user:P,sent:false});assert.equal(r.shown,false);assert.equal(r.statusCalls,0,'no reopen outside the Partner ended screen');
 console.log('PASS reopen: button only when no Letter is saved; already sent, unknown status and wrong user keep the ended screen.');

 assert(/body\.room-letter-only #room-access-screen \{ display: none; \}/.test(room),'ended screen steps aside for the Letter window');
 assert(/letterOnly \? Promise\.resolve\(\{ ok: true, skipped: true \}\)/.test(room),'Letter-only send never rewrites the saved transcript');
 console.log('PASS send path: transcript save skipped in Letter-only mode; existing already-sent / digest checks unchanged.');
})().catch(e=>{console.error(e);process.exitCode=1;});
