const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const selection=require(path.join(root,'public/talk-card-selection.js'));
const data={};vm.runInNewContext(read('public/talk-cards-data.js'),{window:data});const cards=data.DayOTalkCards;
function seed(n){return ()=>{n|=0;n=n+0x6D2B79F5|0;let t=Math.imul(n^n>>>15,1|n);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
assert.equal(cards.length,170);assert.equal(cards.filter(c=>c.deck==='balance').length,12);assert.equal(new Set(cards.map(c=>c.id)).size,170);
for(const interest of ['food_cafe','travel']){const random=seed(71),totals={primary:0,related:0,wildcard:0};for(let i=0;i<20000;i++)totals[selection.pick(cards,{interests:[interest],random}).poolSource]++;
assert(totals.primary>totals.related&&totals.related>totals.wildcard);for(const [k,rate] of Object.entries({primary:.7,related:.2,wildcard:.1}))assert(Math.abs(totals[k]/20000-rate)<.025);console.log('WEIGHTS',interest,totals);}
const primaryCounts={food_cafe:0,travel:0,music:0,pets:0},multiRandom=seed(88);
for(let i=0;i<12000;i++){const r=selection.pick(cards,{interests:Object.keys(primaryCounts),random:multiRandom});if(r.poolSource==='primary'){const keys=r.card.interestKeys.filter(k=>k in primaryCounts);for(const k of keys)primaryCounts[k]+=1/keys.length;}}
assert(Math.max(...Object.values(primaryCounts))/Math.min(...Object.values(primaryCounts))<1.3);
for(const group of Object.keys(selection.groups)){const used=[];const deck=selection.pool(cards,group);for(let i=0;i<deck.length;i++){const r=selection.pick(cards,{group,used,currentId:used.at(-1),random:seed(i+50)});assert(!used.includes(r.card.id));used.push(r.card.id);}
const r=selection.pick(cards,{group,used,currentId:used.at(-1)});assert(r.exhausted);if(deck.length>1)assert.notEqual(r.card.id,used.at(-1));}
for(let i=0;i<100;i++){const r=selection.pick(cards,{group:'food',recent:cards.filter(c=>c.category==='food').slice(0,10).map(c=>c.id)});assert.equal(r.card.category,'food');assert(!r.recentFallback);assert(!r.card.id.startsWith('balance'));}
assert(selection.pick(cards,{interests:[]}).card);assert.equal(selection.pick([],{}),null);
assert(!selection.pool(cards,'balance').some(c=>c.interestKeys.includes('games')));
console.log('PASS selector: weighted 70/20/10, equal interest opportunity, full session exclusion/exhaustion, recent cooldown, manual category, games != balance');

const html=read('public/room.html');
const block=html.slice(html.indexOf('    /* Talk cards data + UI */'),html.indexOf('    /* Bottom sheets */',html.indexOf('    /* Talk cards data + UI */')));
const channelCode=html.slice(html.indexOf('    function ensureChatChannel()'),html.indexOf('    function openChat()',html.indexOf('    function ensureChatChannel()')));
const template=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
const U='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222',B='44444444-4444-4444-8444-444444444444';
const tick=()=>new Promise(r=>setTimeout(r,15));
const windows=[],channels=[],events=[];
let context={interests:['food_cafe'],current:null,used_card_ids:[],recent_card_ids:[]},failRead=false,failWrite=false;
function room(role,lang,cache){const d=new JSDOM(template,{url:'https://fixture.invalid/room?bookingId='+B,runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;windows.push(w);
Object.defineProperty(w.document,'readyState',{value:'complete'});w.localStorage.setItem('dayo_lang',lang);if(cache)w.localStorage.setItem('dayo_talk_cards_v2:'+B+':'+(role==='partner'?P:U),cache);
w.DayORoomAccess={allowed:true,role,userId:role==='partner'?P:U,learnerId:U,partnerId:P,bookingId:B,roomId:B};w.DayORoomAccessReady=Promise.resolve(w.DayORoomAccess);
for(const f of ['i18n.js','talk-cards-data.js','talk-card-selection.js'])w.eval(read('public/'+f));
w.supabaseClient={rpc:async(name,args)=>{if(name==='get_talk_card_context')return failRead?{error:{message:'network'}}:{data:JSON.parse(JSON.stringify(context))};
assert.equal(name,'present_talk_card');assert.equal(role,'partner');if(failWrite)return {error:{message:'network'}};
if(!events.some(e=>e.id===args.p_event_id))events.push({id:args.p_event_id,...args.p_payload});context.used_card_ids=[...new Set(events.map(e=>e.card_id))];context.current={...args.p_payload,event_id:args.p_event_id,updated_at:new Date().toISOString()};return {data:{success:true}};},channel:()=>{
const c={w,handlers:[],on(_,filter,fn){this.handlers.push({event:filter.event,fn});return this;},subscribe(fn){channels.push(c);fn('SUBSCRIBED');return this;},send(msg){queueMicrotask(()=>channels.filter(other=>other!==c).forEach(other=>other.handlers.filter(h=>h.event===msg.event).forEach(h=>h.fn({payload:msg.payload}))));return Promise.resolve('ok');}};return c;}};
w.eval(`var mainStage=document.querySelector('.main-stage'),chatChannel=null,chatChannelReady=false,chatClientId='${role}',pendingCardRequestId='',cardRequestSessionId='fixture',cardRequestSequence=0;
function t(k){return window.DayOI18n.t(k);}function resolveRoomChatId(){return '${B}';}function appendMessageToChatUI(){}
${channelCode}\n${block}`);
return w;}
function open(w){w.document.querySelector('.main-stage').classList.add('talk-open');w.document.querySelector('.main-stage').classList.remove('chat-collapsed');w.eval('markTalkCardVisible(); requestCurrentTalkCard();');}
async function main(){try{
let p=room('partner','EN'),u=room('user','KO');await tick();await tick();assert(p.DayOCurrentTalkCard);assert.equal(events.length,0,'hidden render must not log');
assert.equal(u.document.getElementById('talkCardNextBtn').disabled,true);const first=p.DayOCurrentTalkCard.id;u.eval('setTalkCategory("balance");renderTalkCardQuestion(true)');assert.equal(p.DayOCurrentTalkCard.id,first);
open(u);await tick();await tick();assert.equal(events.length,1);assert.equal(u.DayOCurrentTalkCard.id,p.DayOCurrentTalkCard.id);
open(p);const used=new Set([first]);for(let i=0;i<8;i++){p.document.getElementById('talkCardNextBtn').click();await tick();assert(!used.has(p.DayOCurrentTalkCard.id));used.add(p.DayOCurrentTalkCard.id);assert.equal(u.DayOCurrentTalkCard.id,p.DayOCurrentTalkCard.id);}
const n=events.length;u.eval('acknowledgeTalkCard();acknowledgeTalkCard()');await tick();assert.equal(events.length,n);
p.document.querySelector('[data-talk-cat="balance"]').click();await tick();assert(p.DayOCurrentTalkCard.id.startsWith('balance-'));assert.equal(u.DayOCurrentTalkCard.id,p.DayOCurrentTalkCard.id);
const saved=p.DayOCurrentTalkCard.id,cache=p.localStorage.getItem('dayo_talk_cards_v2:'+B+':'+P);channels.splice(channels.findIndex(c=>c.w===p),1);p.close();p=room('partner','EN',cache);await tick();await tick();assert.equal(p.DayOCurrentTalkCard.id,saved);assert(p.eval('talkCardUsed.size')>=used.size);assert.equal(u.DayOCurrentTalkCard.id,saved);assert.equal(p.document.querySelector('[data-talk-cat="balance"]').getAttribute("aria-selected"),"true");assert.equal(p.document.querySelector('[data-talk-cat="auto"]').getAttribute("aria-selected"),"false");
failWrite=true;p.document.querySelector('[data-talk-cat="food"]').click();await tick();assert.equal(p.DayOCurrentTalkCard.category,'food');assert(p.eval('Object.keys(talkCardPending).length')>0);const pendingId=p.eval('Object.keys(talkCardPending)[0]');failWrite=false;p.eval('flushTalkCardEvents();flushTalkCardEvents()');await tick();assert.equal(events.filter(e=>e.id===pendingId).length,1);
failRead=true;const broken=room('partner','KO');await tick();assert(broken.DayOCurrentTalkCard);assert.equal(broken.document.getElementById('talkCardHistoryNote').hidden,false);
assert.equal(p.document.getElementById('talkCardQuestion').textContent,p.DayOCurrentTalkCard.question_en);assert.equal(u.document.getElementById('talkCardQuestion').textContent,u.DayOCurrentTalkCard.question_ko);
console.log('PASS real room code: hidden != presented; User acknowledgement -> Partner-only event; User Next disabled; repeated Next sync/no repeats; category; reload/current/used; idempotent ack/retry; read error fallback; KO/EN');
for(const f of ['room.html','i18n.js','talk-cards-data.js','talk-card-selection.js'])assert.equal(read('public/'+f),read(f));
}finally{windows.forEach(w=>w.close());}}
main().catch(e=>{console.error(e);process.exitCode=1;});
