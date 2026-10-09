'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process'),path=require('node:path');
const root=path.join(__dirname,'..'),base='e1e92af0706b9fad4e2b16ca10b7fc4abf1c3f7b';
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
const old=p=>cp.execFileSync('git',['show',base+':'+p],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
const src=read('public/tickets-modal.js'),baseline=old('public/tickets-modal.js'),i18n=read('public/i18n.js');
function section(s,start,end){const a=s.indexOf(start),b=s.indexOf(end,a+start.length);assert(a>=0&&b>a,start);return s.slice(a,b);}
assert.equal(section(src,'  var PLANS = [','  var CSS ='),section(baseline,'  var PLANS = [','  var CSS ='));
for(const [a,b] of [['  function paymentPayload','  function buyButton'],['  function buyButton','  function planCard'],['  async function detectTrialUsed','  function findPlan'],['  async function requestPayment','  function bindEvents'],['  function getAuthUserId','  async function detectTrialUsed']])assert.equal(section(src,a,b).replace("if (plan.id === 'trial' && !canShowTrialPurchase()) return;","if (plan.id === 'trial' && couponState.trialUsed) return;"),section(baseline,a,b),a+' changed');
for(const p of ['public/checkout-preparation.js','public/profile-store.js','public/booking-modal.js'])assert.equal(read(p),old(p),p+' changed');
for(const f of ['tickets-modal.js','ticket-payment.js','i18n.js','index.html','mypage.html','mypage-dashboard.js'])assert.equal(read(f),read('public/'+f),f+' mirror');
const api=read('api/ticket-payment.js'),apiOld=old('api/ticket-payment.js');
assert.equal(section(api,'async function prepare(','async function finalize('),section(apiOld,'async function prepare(','async function finalize('));
assert.equal(section(api,'async function finalize(','module.exports ='),section(apiOld,'async function finalize(','module.exports ='));
const stripAction=x=>x.replace(/if \(action === 'trial_eligibility'\) \{[\s\S]*?\n    \}\n    else if \(action === 'portone_find'\)/,"if (action === 'portone_find')");
assert.equal(stripAction(api.slice(api.indexOf('module.exports ='))),apiOld.slice(apiOld.indexOf('module.exports =')));
const payment=read('public/ticket-payment.js').replace(/    \/\/ Refresh trial presentation only; UI listeners cannot block payment settlement\.\n    try \{ document\.dispatchEvent\(new CustomEvent\('dayo:ticketpurchase'\)\); \} catch \(error\) \{ \/\* non-blocking \*\/ \}\n/,'');
assert.equal(payment,old('public/ticket-payment.js'));
const strip=s=>s.split('\n').filter(l=>!/^\s*['"]tickets\.v2\./.test(l)&&!l.includes("'landing.pricing.trialSignup':")&&!/^\s*"tickets\.price\.(reference|note|lower|dayoSaving)":/.test(l)).join('\n');
// PRICE-02 excludes landing Hero copy/design. Only this explicit restoration may differ from e1e92af.
const heroGood=p=>cp.execFileSync('git',['show','810a3316aa8747acdc77acf8346c2ed2442d6695:'+p],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
const heroLine=(source,key)=>source.split('\n').find(l=>l.includes("'"+key+"':"));
let comparisonI18n=i18n;for(const key of ['landing.hero.title','landing.hero.description']){assert.equal(heroLine(i18n,key),heroLine(heroGood('public/i18n.js'),key));comparisonI18n=comparisonI18n.replace(heroLine(i18n,key),heroLine(old('public/i18n.js'),key));}
assert(!i18n.includes('landing.topics.balanceQuestion'));
comparisonI18n=comparisonI18n.replace("    'landing.session.aria':" ,heroLine(old('public/i18n.js'),'landing.topics.balanceQuestion')+"\n    'landing.session.aria':");
assert.equal(strip(comparisonI18n),strip(old('public/i18n.js')),'non-PRICE-02/non-restoration i18n changed');
const heroPage=read('public/index.html'),originalHeroPage=heroGood('public/index.html');
const heroSection=x=>{const a=x.indexOf('    <!-- ===== Landing hero');return x.slice(a,x.indexOf('    <!--',a+10));};
assert.equal(heroSection(heroPage),heroSection(originalHeroPage),'PRICE-02 must preserve original Hero markup/CTA/image');
assert.equal(section(heroPage,'    const heroRotator =','    // Native details'),section(originalHeroPage,'    const heroRotator =','    /* Free speaking sense test'));
assert(!heroPage.includes('.dayo-cafe-landing .hero-title { text-wrap: balance; }'));
assert(!heroPage.includes('topic-sample'));
assert.equal((heroPage.match(/class="topic-chip"/g)||[]).length,6,'approved topic chips preserved');
// The release baseline already contains the approved landing restoration.
const releaseBase='9b8a5ce26efe598d7c46ce0fa9445369efea5410';
const releaseFile=p=>cp.execFileSync('git',['show',releaseBase+':'+p],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
// PRICE-03 may change only the ticket choices; the remainder of the landing stays exact.
const trialSlot=/<div class="ticket-price-row reveal">[\s\S]*?(?=        <div class="reveal" style="display: flex;)/;
assert.equal(heroPage.replace(trialSlot,'TRIAL_ELIGIBILITY_SLOT'),releaseFile('public/index.html').replace(trialSlot,'TRIAL_ELIGIBILITY_SLOT'),'latest main landing changed outside ticket choices');
assert.equal(strip(i18n),strip(releaseFile('public/i18n.js')),'latest main non-ticket i18n changed');
assert(src.includes('.tk-footer .tk-buy{box-sizing:border-box;max-width:100%;min-width:0;overflow-wrap:anywhere}'));
assert(src.includes('<details class="tk-experience"'));
console.log('PASS Hero scope guard: original 810a331 HTML/CTA/rotator/i18n; PRICE-02 cannot replace Hero.');
let lang='KO';const dict={};for(const line of i18n.split('\n')){const m=line.match(/^\s*(['"])(tickets\.(?:v2|price|modal)\.[^'"]+)\1:\s*(\{.*\}),?\s*$/);if(m)dict[m[2]]=vm.runInNewContext('('+m[3]+')');}
const simulatedSource=src;
const t=(k,v={})=>(dict[k]?.[lang]||k).replace(/\{([^}]+)\}/g,(_,n)=>v[n]??'{'+n+'}');
const context={window:{DayOI18n:{getLang:()=>lang,t,tf:t}},document:{readyState:'loading',addEventListener(){}},console};
vm.runInNewContext(src.replace(/\}\)\(\);\s*$/,'window.__qa={PLANS,priceDetails,planCard,buyButton,paymentPayload,buildMarkup,comparisonMarkup};})();'),context);
const q=context.window.__qa;assert(q);
const cases=[['trial','trial',9900,1],['single','single',19900,1],['pack3','starter3',54900,3],['pack11','light11',179000,11],['pack33','full33',499000,33]];
for(const locale of ['KO','EN']){lang=locale;for(const[id,payId,amount,count]of cases){const plan=q.PLANS.find(p=>p.id===id);assert.equal(plan.payId,payId);assert.equal(q.paymentPayload(plan).amount,amount);assert.equal(q.paymentPayload(plan).ticketCount,count);assert(q.buyButton(plan).includes('data-amount="'+amount+'"'));assert(q.planCard(plan).includes('name="tkPlan"'));assert(!q.planCard(plan).includes('tickets.v2.'));assert(!q.planCard(plan).includes('data-tk-buy'));}for(const[id,unit,saving]of [['pack3',18300,4800],['pack11',16273,39900],['pack33',15121,157700]]){const detail=q.priceDetails(q.PLANS.find(p=>p.id===id));assert(detail.includes(unit.toLocaleString('ko-KR')));assert(detail.includes(saving.toLocaleString('ko-KR')));}assert(!q.comparisonMarkup().includes('tickets.v2.'));assert(q.comparisonMarkup().includes('2026'));}
assert(!src.includes('COMPARISON_SESSION_WON'));assert(!q.buildMarkup().includes('tk-price-reference'));assert(!q.buildMarkup().includes('tk-comparison" open'));assert(src.includes('var trialVisible = canShowTrialPurchase()'));assert(!q.comparisonMarkup().match(/(?:^|[^\d])9,900/));assert.equal((q.comparisonMarkup().match(/<dt>/g)||[]).length,12);new vm.Script(src);new vm.Script(i18n);
console.log('PASS PRICE-02 v2: exact 6-SKU catalog, five public amounts/counts, unchanged checkout/auth/trial handlers, KO/EN, unit/savings, comparison sources, mirrors and unrelated files.');
if(process.argv.includes('--serve')){
const http=require('node:http');
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1'),name=url.pathname;
 if(name==='/api/ticket-payment'){
  let raw='';for await(const chunk of req)raw+=chunk;
  if(req.headers['x-price-fixture-mode']==='pending')return;
  if(req.headers['x-price-fixture-mode']==='error'){res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:false,error:'trial-eligibility-unavailable'}));}
  const f=await require('./price02-eligibility.cjs').setup(),token=(req.headers.authorization||'').replace(/^Bearer /,''),id=token.replace(/^fixture-/,'');
  const result=await f.call(id,JSON.parse(raw||'{}'),token);res.writeHead(result.status,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify(result.body));
 }
 if(name==='/price-preview'){
  const f=await require('./price02-eligibility.cjs').setup(),scenario=url.searchParams.get('state')||'eligible',id=f.users[scenario]||f.users.eligible;
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#F6F5EE;color:#263F35;font-family:Arial,sans-serif}button{font:inherit}#qa-controls{padding:14px;display:flex;gap:10px;flex-wrap:wrap}#qa-result{display:block;padding:10px;font-size:14px}</style></head><body><div id="qa-controls"><button data-tickets-open>Open tickets</button><button id="ko">한국어</button><button id="en">English</button></div><output id="qa-result">LOCAL synthetic member only · Real local eligibility API + existing 044/075 DB rules · No production service or payment</output><script>
const scenario=${JSON.stringify(scenario)};
if(new URLSearchParams(location.search).has('full')){const style=document.createElement('style');style.textContent='#qa-controls,#qa-result{display:none}#ticketModal.tk-overlay{position:relative;min-height:100vh;align-items:flex-start;background:#F6F5EE;backdrop-filter:none}#ticketModal .tk-modal{max-height:none;margin:36px 0}#ticketModal .tk-body{overflow:visible;flex:none}';document.head.appendChild(style);}
const session=scenario==='loggedout'?null:{user:{id:${JSON.stringify(id)}},access_token:${JSON.stringify('fixture-'+id)}};
window.supabaseClient={auth:{getSession:async()=>({data:{session}}),onAuthStateChange(){}}};
window.DayOProfileStore={getUserId:()=>session?.user.id||null,fetchCoupons:()=>{throw Error('No coupons should be fetched for eligibility');}};
window.DayOPaymentTestAccess={isAllowed:async()=>false};
const nativeFetch=window.fetch.bind(window);let retryRequested=false;document.addEventListener('click',e=>{if(e.target.closest('[data-tk-eligibility-retry]'))retryRequested=true;},true);window.fetch=(url,opts)=>nativeFetch(url,{...opts,headers:{...opts.headers,'X-Price-Fixture-Mode':scenario==='error'&&retryRequested?'':scenario}});
window.requestPay=async id=>{document.getElementById('qa-result').textContent='Checkout SKU: '+id+' (no payment)';};
</script><script src="/i18n.js"></script><script src="/tickets-modal.js"></script><script>document.getElementById('ko').onclick=()=>DayOI18n.setLang('KO');document.getElementById('en').onclick=()=>DayOI18n.setLang('EN');document.addEventListener('DOMContentLoaded',()=>{DayOI18n.setLang(new URLSearchParams(location.search).get('lang')||'KO');if(new URLSearchParams(location.search).has('full'))DayOTickets.open();});</script></body></html>`);
 }
 if(!['/i18n.js','/tickets-modal.js'].includes(name)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type','application/javascript; charset=utf-8');res.end(read('public'+name));
}catch(error){res.writeHead(500);res.end('Local fixture failed');console.error(error.message);}
}).listen(3099,'127.0.0.1',()=>console.log('PRICE-02 local API/DB preview: http://127.0.0.1:3099/price-preview'));
}

async function domChecks(){
 const eligibility=require('./price02-eligibility.cjs');
 try { await eligibility.uiChecks(); } finally { if(!process.argv.includes('--serve')){const f=await eligibility.setup();await f.db.close();} }
}
domChecks().catch(e=>{console.error(e);process.exitCode=1;});

async function serverContractChecks(){
  const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
  await db.exec("create role anon;create role authenticated; create table public.profiles(id uuid primary key,has_welcome_coupon boolean); create table public.orders(id uuid primary key,user_id uuid,product_key text,product_name text,amount integer,ticket_count integer,status text);");
  await db.exec(read('supabase/migrations/075_enforce_welcome_trial_entitlement.sql'));
  const uid='00000000-0000-0000-0000-000000000001';
  await db.query('insert into profiles values ($1,true)',[uid]);
  const order=async(id,product,status,amount=9900)=>db.query('insert into orders values ($1,$2,$3,$4,$5,1,$6)',[id,uid,product,product,amount,status]);
  await order('00000000-0000-0000-0000-000000000010','single','paid',19900);
  await order('00000000-0000-0000-0000-000000000011','trial','pending');
  await order('00000000-0000-0000-0000-000000000012','trial','pending');
  await db.query("update orders set status='paid' where id=$1",['00000000-0000-0000-0000-000000000011']);
  assert.equal((await db.query('select has_welcome_coupon from profiles')).rows[0].has_welcome_coupon,false);
  await assert.rejects(()=>order('00000000-0000-0000-0000-000000000013','trial','pending'),/Welcome trial is unavailable/);
  await assert.rejects(()=>db.query("update orders set status='paid' where id=$1",['00000000-0000-0000-0000-000000000012']),/Welcome trial is unavailable/);
  // A stale true flag cannot authorize a duplicate already-paid trial.
  await db.query('update profiles set has_welcome_coupon=true');
  await assert.rejects(()=>order('00000000-0000-0000-0000-000000000014','trial','pending'),/already been purchased/);
  await db.close();console.log('PASS isolated existing 075 server contract: regular purchase does not consume trial, trial paid immediately consumes entitlement, unused paid trial blocks retry and a concurrent pending finalization. No production DB was used.');
}
serverContractChecks().catch(e=>{console.error(e);process.exitCode=1;});
