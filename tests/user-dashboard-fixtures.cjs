// Local UI fixtures run the existing My Page loaders; no live credentials or writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),pub=path.join(root,'public');
const scripts=['i18n.js','password-account.js','partner-report-contract.js','learner-expressions.js','conversation-recap.js','user-conversation-report.js','supabase-client.js','ticket-wallet.js','materials.js','chat-prefs.js','availability-calendar.js','availability-slots.js','booking-modal.js','tickets-modal.js','tea-table.js','role-switch.js','greeting-banner.js','mypage-dashboard.js','conversation-posts.js','lounge-carousel.js','legal-footer.js','conversation-insights.js','user-dashboard.js'];

function couponUiScript(){
 const source=fs.readFileSync(path.join(pub,'profile-store.js'),'utf8').replace(/\r/g,'');
 const unused=source.slice(source.indexOf('function unusedCoupons('),source.indexOf('function dispatchCouponChange('));
 const render=source.slice(source.indexOf('function syncCouponUI('),source.indexOf('async function grantWelcomeCoupon('));
 // Keep the actual renderer; omit all profile-store boot/network paths.
 const end=render.indexOf('\nasync function ');
 const body=end<0?render:render.slice(0,end);
 return '(function(){var WELCOME_COUPON_CODES={WELCOME_9900:true,WELCOME9900:true};var readLocalCoupons=()=>[];var escapeHtml=s=>String(s).replace(/[&<>"\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","\\\'":"&#39;"}[c]||c));'+unused+body+'window.__udSyncCouponUI=syncCouponUI;})();';
}

function bootstrap(options={}) {
 const config={count:options.count??2,tickets:options.tickets??3,diagnosed:options.diagnosed??false,role:options.role||'user',lang:options.lang||'en',reports:options.reports??true,eligible:options.eligible??false};
 return '('+function(config){
  const id='33333333-3333-4333-8333-333333333333',partner='22222222-2222-4222-8222-222222222222';
  const user={id,email:'local-fixture@example.invalid',identities:[{provider:'email'}],user_metadata:{name:'Judy'}};
  const profile={id,_authUserId:id,nickname:'Judy',role:config.role,ticket_count:config.tickets,tickets:config.tickets,created_at:'2026-09-01T00:00:00Z',learning_languages:['en']};
  if(config.diagnosed)Object.assign(profile,{last_test_score:72,speaking_level:'Conversation explorer',last_test_date:new Date().toISOString()});
  const now=Date.now(), bookings=Array.from({length:config.count},(_,i)=>({id:'66666666-6666-4666-8666-'+String(i).padStart(12,'0'),learner_id:id,partner_user_id:partner,partner_id:partner,partner_name:'Alex',scheduled_at:new Date(now+(i+1)*86400000).toISOString(),status:'confirmed',language:'en',is_test_session:false}));
  const past={id:'11111111-1111-4111-8111-111111111111',learner_id:id,partner_user_id:partner,partner_name:'Alex',scheduled_at:new Date(now-86400000).toISOString(),status:'completed',language:'en',is_test_session:false};
  if(config.reports)bookings.push(past);
  const reports=config.reports?[{id:'44444444-4444-4444-8444-444444444444',booking_id:past.id,learner_id:id,partner_name:'Alex',created_at:past.scheduled_at,language:'en',partner_comment:'It was lovely hearing about your weekend. See you on DayO!',stamp:'green_tea',keyword:'Café conversation',illust_url:null,summary:'You shared your favorite cafés and weekend plans.',key_expressions:['I enjoy visiting new places.'],quiz_score:80,feedback:[{original:'I am very agree.',corrected:'I totally agree.',source:'learner_recognized_speech',meaning_preserved:true,correction_needed:true,explanation:'Use agree as a verb.'}],bookings:past}]:[];
  const logs=reports.length?[{id:'55555555-5555-4555-8555-555555555555',booking_id:past.id,participant_id:id,participant_role:'learner',created_at:past.scheduled_at,transcript:[{id:'speech-fixture',speaker:'learner',text:'I am very agree.',timestamp:new Date(Date.parse(past.scheduled_at)+60000).toISOString()}]}]:[];
  const counters={cancel:0,notification:0,booking:0,queries:[]};
  window.__udFixture={profile,bookings,reports,logs,counters,user};
  window._dayoAuthUser=user;window._dayoAuthProfile=profile;
  localStorage.setItem('dayo_lang',config.lang);localStorage.setItem('dayo_i18n_lang',config.lang);
  localStorage.setItem('ticketCount',String(config.tickets));localStorage.setItem('dayo_ticket_count',String(config.tickets));localStorage.removeItem('dayo_speaking_test_history');
  window.checkUserLoggedIn=()=>true;window.handleLogout=()=>{};window.DayONotifyCommittedBooking=()=>{counters.notification++;};
  window.alert=()=>{};window.confirm=()=>true;
  window.supabaseClient={auth:{getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:{user}}}),getUserIdentities:async()=>({data:{identities:user.identities}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
   rpc:async(name,args)=>{
    counters.queries.push('rpc:'+name);
    if(name==='list_published_conversation_posts')return {data:[{id:'magazine-fixture',slug:'fixture-cafe',title:'A warm conversation over coffee',excerpt:'Stories and ideas for your next DayO conversation.',interests:['food_cafe','travel'],purposes:['casual'],author_display_name:'DayO'}],error:null};
    if(name==='list_public_partner_profiles')return {data:[{id:partner,nickname:'Alex',languages:['en'],role:'partner'}],error:null};
    if(name==='cancel_my_booking'){const b=bookings.find(b=>b.id===args.p_booking_id);if(b){b.status='cancelled';profile.ticket_count++;profile.tickets++;counters.cancel++;}return {data:{success:true},error:null};}
    if(name==='get_my_session_transcripts')return {data:logs,error:null};
    return {data:[],error:null};
   },from(table){
    counters.queries.push(table);const filters=[];let single=false,sort=null,limit=null;
    const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},neq(k,v){filters.push(r=>r[k]!==v);return q;},gte(k,v){filters.push(r=>r[k]>=v);return q;},lt(k,v){filters.push(r=>r[k]<v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},order(k,opt){sort=[k,opt];return q;},limit(n){limit=n;return q;},range(){return q;},or(){return q;},maybeSingle(){single=true;return q;},single(){single=true;return q;},insert(){throw Error('Fixture forbids database inserts');},update(){throw Error('Fixture forbids database updates');},delete(){throw Error('Fixture forbids database deletes');},then(resolve,reject){
     let rows=table==='profiles'?[profile]:table==='bookings'?bookings:table==='session_reports'?reports:table==='session_logs'?logs:[];
     rows=rows.filter(r=>filters.every(f=>f(r)));if(sort)rows=rows.slice().sort((a,b)=>(a[sort[0]]>b[sort[0]]?1:-1)*(sort[1]&&sort[1].ascending===false?-1:1));if(limit)rows=rows.slice(0,limit);
     return Promise.resolve({data:single?(rows[0]||null):rows,error:null}).then(resolve,reject);
    }};return q;
   }};
  document.documentElement.classList.remove('dayo-auth-pending');
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{
   window.__udSyncCouponUI(config.eligible?[{code:'WELCOME_9900',is_used:false,original_price:19900,discount_price:9900}]:[]);
   if (window.DayOI18n) window.DayOI18n.setLang(config.lang);
   window.DayOTicketWallet.loadUserTicketBalance(id);
   window.loadUserReports();
   document.dispatchEvent(new CustomEvent('dayo:authprofile',{detail:{profile}}));
  },0));
 }.toString()+')('+JSON.stringify(config)+');'+couponUiScript();
}
function fixtureHtml(options={}){
 let h=fs.readFileSync(path.join(pub,'mypage.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 h=h.replace('</head>','<script>'+bootstrap(options)+'</script></head>');
 return h.replace('</body>',scripts.map(s=>'<script src="/'+s+'"></script>').join('')+'</body>');
}
module.exports={fixtureHtml,bootstrap,scripts};
async function run(){
 const {JSDOM}=require('jsdom');
 const plain=fs.readFileSync(path.join(pub,'mypage.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 const base='32847a85a9f5c002454a64cf904f89f611c355fd';const read=f=>fs.readFileSync(path.join(root,f),'utf8').replace(/\r/g,'');const old=f=>cp.execFileSync('git',['show',base+':'+f],{cwd:root,encoding:'utf8'}).replace(/\r/g,'');
 const stripEvents=s=>s.replace(/^.*document\.dispatchEvent\(new CustomEvent\('dayo:mypage-(?:next|speaking)'[^\n]*\n/gm,'');
 assert.equal(stripEvents(read('public/mypage-dashboard.js')),old('public/mypage-dashboard.js'),'all existing My Page handlers/queries unchanged');
 const protectedFiles=cp.execFileSync('git',['ls-tree','-r','--name-only',base],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(f=>f.startsWith('api/')||f.startsWith('supabase/')||/^(?:public\/)?(?:room|quiz|memory-game|session-lifecycle|partner|learner|booking|availability|ticket|profile-store|supabase-client|auth|password-account|user-conversation-report|conversation-insights|tea-table|role-switch|mode-switch)/.test(f)&& !f.startsWith('tests/'));
 for(const f of protectedFiles)assert.equal(read(f),old(f),f+' preserved');
 for(const f of ['mypage.html','mypage-dashboard.js','user-dashboard.js','user-dashboard.css'])assert.equal(read('public/'+f),read(f),f+' mirror');
 const idsBefore=Array.from(new JSDOM(old('public/mypage.html')).window.document.querySelectorAll('[id]')).map(n=>n.id);
 const scriptsOf=h=>[...h.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(m=>m[1]).filter(s=>!s.startsWith('user-dashboard.js'));
 assert.deepEqual(scriptsOf(read('public/mypage.html')),scriptsOf(old('public/mypage.html')),'all current script dependencies retained');
 const inlineOf=h=>[...h.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(s=>s.trim());
 assert.deepEqual(inlineOf(read('public/mypage.html')),inlineOf(old('public/mypage.html')),'all inline My Page logic unchanged');
 for(const opt of [{count:0,tickets:0,reports:false},{count:0,tickets:0,reports:false,eligible:true},{count:1},{count:4,diagnosed:true,role:'partner'},{count:2,lang:'ko'}]){
  const dom=new JSDOM(plain,{url:'http://127.0.0.1:3054/mypage',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,d=w.document;
  w.eval(bootstrap(opt));for(const s of scripts)w.eval(read('public/'+s));await new Promise(r=>setTimeout(r,70));
  for(const id of idsBefore)assert.equal(d.querySelectorAll('[id="'+id+'"]').length,1,'existing ID retained: '+id);
  assert.deepEqual(Array.from(d.querySelectorAll('[data-ud-tab]')).map(n=>n.dataset.udTab),['sessions','progress','tickets','account']);
  assert.equal(d.querySelector('[aria-selected="true"][data-ud-tab]').dataset.udTab,'sessions');
  assert.ok(d.querySelector('.ud-next').compareDocumentPosition(d.querySelector('.ud-tabs'))&w.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(d.getElementById('ud-next-empty').hidden,opt.count!==0);assert.equal(d.getElementById('urgent-session-banner').hidden,opt.count===0);
  assert.equal(d.getElementById('ud-speaking-action').hidden,!!opt.diagnosed);
  assert.equal(d.getElementById('tab-partner-mode').hidden,opt.role!=='partner');
  assert.equal(d.getElementById('ud-next-language').textContent,opt.count?'EN · English':'');
  assert.equal(d.querySelector('#ud-upcoming #upcoming-booking-list').children.length,Math.max(0,opt.count-1));
  assert.ok(d.querySelector('#ud-archive #mypage-card-feed'));assert.ok(d.querySelector('#ud-growth #dayo-monthly-story-host'));assert.ok(d.querySelector('#ud-treats #dayo-tea-table-grid'));assert.ok(d.querySelector('#ud-ticket-summary #user-ticket-count'));assert.ok(d.querySelector('#ud-account-settings #dayoAccountSettings'));assert.ok(d.querySelector('#ud-explore-content #loungeCarousel'));assert.match(d.querySelector('#loungeTrack').textContent,/A warm conversation over coffee/);assert.ok(d.querySelector('#ud-explore-content [data-story-topic]'));assert.equal(d.querySelector('#ud-benefits [data-coupon-wallet]').hidden,!opt.eligible);assert.equal(d.getElementById('mypage-ticket-unit').textContent,opt.lang==='ko'?'장':'');
  // Original handlers remain bound after moving the same nodes.
  d.getElementById('ud-tab-account').click();d.getElementById('edit-nickname-btn').click();assert.equal(d.getElementById('edit-profile-modal').hidden,false);d.getElementById('edit-profile-cancel').click();
  d.getElementById('dayoPasswordChangeButton').click();assert.equal(d.getElementById('dayoPasswordChangeOverlay').hidden,false);
  d.getElementById('ud-tab-tickets').click();d.querySelector('#ud-tickets [data-tickets-open]').click();assert.equal(d.querySelector('.tk-overlay').classList.contains('is-open'),true);w.DayOTickets.close();
  d.getElementById('ud-tab-progress').click();d.querySelector('[data-story-topic="taste"]').click();assert.equal(d.querySelector('[data-story-topic="taste"]').getAttribute('aria-pressed'),'true');assert.equal(d.querySelector('[data-story-topic="daily"]').getAttribute('aria-pressed'),'false');assert.equal(w.location.hash,'#ud-progress');assert.equal(d.getElementById('ud-progress').hidden,false);assert.equal(d.getElementById('ud-sessions').hidden,true);
  w.location.hash='#ud-account';w.dispatchEvent(new w.HashChangeEvent('hashchange'));assert.equal(d.getElementById('ud-account').hidden,false);
  if(opt.reports!==false){w.openReportDetailModal(0);await new Promise(r=>setTimeout(r,25));assert.match(d.getElementById('report-detail-body').textContent,opt.lang==='ko'?/파트너|대화/:/Partner Letter/);assert.match(d.getElementById('report-detail-body').textContent,opt.lang==='ko'?/오늘의 대화 리캡/:/Today’s conversation recap/);assert.equal(JSON.stringify(w.__udFixture.reports[0].feedback).includes('I totally agree.'),true);w.closeReportDetailModal();}
  d.getElementById('ud-tab-sessions').click();d.getElementById('ud-tab-sessions').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(d.getElementById('ud-progress').hidden,false);
  const originalOpen=w.DayOBooking.requestOpen;let openCalls=0;w.DayOBooking.requestOpen=()=>{openCalls++;};d.getElementById('main-action-btn').click();if(opt.tickets===0)assert.equal(d.querySelector('.tk-overlay').classList.contains('is-open'),true);else assert.equal(openCalls,1);w.DayOBooking.requestOpen=originalOpen;
  if(opt.count){w.DayONotifyCommittedBooking=()=>{w.__udFixture.counters.notification++;}; d.getElementById('urgent-session-cancel').click();await new Promise(r=>setTimeout(r,30));assert.equal(w.__udFixture.counters.cancel,1);assert.equal(w.__udFixture.counters.notification,1);assert.equal(w.__udFixture.bookings[0].status,'cancelled');}
  dom.window.close();
 }
 console.log('PASS: User dashboard 0/1/4 bookings, EN/KO, diagnosis states, roles, original IDs/handlers, cancellation, tickets, account dialogs, reports, view events, tab/deep link, mirrors and protected logic.');
}
if(require.main===module)run().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
