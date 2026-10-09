'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.join(__dirname,'..'),{makeUi,setup}=require('./price02-eligibility.cjs');
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
const old=p=>cp.execFileSync('git',['show','92e2a9d4fc986566918479f48acf7efcb1836d4b:'+p],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
const html=read('public/index.html'),modal=read('public/tickets-modal.js');
const row=/<div class="ticket-price-row reveal">[\s\S]*?(?=        <div class="reveal" style="display: flex;)/;
assert.equal(html.replace(row,'TICKET_CHOICES').replace(/        <button[^\n]*data-landing-trial-retry[^\n]*\n/,''),old('public/index.html').replace(row,'TICKET_CHOICES'),'all other HTML/CSS/Hero/CTA/sections exact');
const selection=/  (?:var landingSelectionPending = false;\n  )?(?:async )?function selectLandingPlan\(id\) \{[\s\S]*?(?=  function init\(\))/;
function modalScope(s){return s.replace('function priceDetails(plan, savingKey)', 'function priceDetails(plan)').replace("t(savingKey || 'tickets.v2.saving'", "t('tickets.v2.saving'").replace(/  function trialUnavailableCopy\([\s\S]*?(?=  function trialStatusMarkup)/,'').replace(/      return \{ status: data.eligible \? 'eligible' : 'ineligible', userId: session.user.id, trialStatus:[^\n]*/, "      return { status: data.eligible ? 'eligible' : 'ineligible', userId: session.user.id };").replace(selection,'LANDING_SELECTION').replace(/  function planCard\([\s\S]*?(?=  function singleRow)/,'TRIAL_CARD_PRESENTATION').replace(/  function renderLandingTicketCards\([\s\S]*?(?=    document.querySelectorAll\('\[data-coupon-wallet\]')/,'LANDING_RENDER').replace(/  function renderTrialSalesSurfaces\([\s\S]*?(?=    document.querySelectorAll\('\[data-coupon-wallet\]')/,'LANDING_RENDER').split('\n').filter(line=>!line.startsWith("    ,'")&&!line.includes("var showTrialCard =")&&!line.includes("if (choice && choice.disabled) return;")&&!line.includes("data-landing-trial-retry") ).map(line=>line.includes('if (el.banner)')?'TRIAL_BANNER':line.includes('selectLandingPlan(card.getAttribute')?'LANDING_CLICK':line).join('\n');}
assert.equal(modalScope(modal),modalScope(old('public/tickets-modal.js')),'outside landing ticket UI and trial disabled presentation exact');
assert.equal(read('public/i18n.js').split('\n').filter(line=>!line.includes('"tickets.v2.eligibility.unavailable":')&&!line.includes('"tickets.v2.landingSaving":')&&!/"tickets\.v2\.trial\.(applied|completed|appliedNotice)":/.test(line)&&!line.includes("'landing.pricing.trialSignup':")).join('\n'),old('public/i18n.js'),'only unavailable message may change');
for(const p of ['public/mypage-dashboard.js','public/mypage.html','public/ticket-payment.js','public/checkout-preparation.js'])assert.equal(read(p),old(p),p);
assert.equal(read('api/ticket-payment.js').replace(/async function trialEligibility\([\s\S]*?(?=async function prepare)/,'READ_ELIGIBILITY'),old('api/ticket-payment.js').replace(/async function trialEligibility\([\s\S]*?(?=async function prepare)/,'READ_ELIGIBILITY'),'all other API code exact');
const cardRow=html.match(row)[0];assert(cardRow.includes('data-landing-ticket="trial"'));assert(!/9,900|19,900/.test(cardRow));
async function checks(){
 for(const locale of ['KO','EN'])for(const state of ['eligible','purchased','used','free-welcome','loggedout']){
  const ui=await makeUi(state,locale);await ui.ready();const {w,d}=ui;
  d.querySelector('#pricing').innerHTML=cardRow;w.DayOI18n.apply();w.DayOTickets.renderTrialSalesSurfaces();
  try{
   for(const [id,target,amount]of [['single','single',19900],['starter3','pack3',54900],['light11','pack11',179000],['full33','pack33',499000]]){
    const card=d.querySelector('[data-landing-ticket='+id+']');card.focus();card.click();await ui.ready();
    assert(d.querySelector('#ticketModal').classList.contains('is-open'));
    assert.equal(d.querySelector('input[name=tkPlan]:checked').value,target,'preselect '+state+' '+id);
    assert.equal(d.querySelector('[data-tk-total]').textContent.replace(/\D/g,''),String(amount));
    assert.equal(d.querySelector('[data-tk-buy]').getAttribute('data-tk-buy'),target);
    assert.equal(ui.purchases.length,0,'open is not checkout');
    for(const regular of d.querySelectorAll('input[name=tkPlan]:not([value=trial])')) assert.equal(regular.disabled,false,'regular plans stay selectable');
    const eligible=['eligible','free-welcome'].includes(state),trial=d.querySelector('input[value=trial]');
    assert.equal(Boolean(trial),state!=='loggedout');
    if(trial){assert.equal(trial.disabled,!eligible);if(!eligible){
      const before=d.querySelector('input[name=tkPlan]:checked').value;
      trial.click();trial.dispatchEvent(new w.Event('change',{bubbles:true}));
      assert.equal(d.querySelector('input[name=tkPlan]:checked').value,before,'disabled trial cannot select');
      assert(d.querySelector('[data-plan=trial]').classList.contains('tk-choice--disabled'));
      if(['purchased','used'].includes(state)){assert(d.querySelector('[data-plan=trial] .tk-badge').textContent.includes(state==='used'?(locale==='KO'?'이용 완료':'Trial completed'):(locale==='KO'?'혜택 적용 완료':'Benefit applied')));assert(d.querySelector('#tkTrialUnavailable').textContent.includes(locale==='KO'?'첫 체험 혜택을 성공적으로 받으셨어요.':'You’ve successfully received your first-trial benefit.'));}
      assert(!/체험 완료|Trial completed/i.test(d.querySelector('#tkTrialUnavailable').textContent));
      assert.equal(ui.purchases.length,0);
    }}
    assert.equal(d.querySelector('input[value=trial]:not(:disabled)')!==null,eligible);
    assert(d.querySelector('#pricing [data-landing-ticket=trial]')); assert.equal(d.querySelector('#pricing [data-landing-ticket=trial]').disabled,!eligible && state!=='loggedout');
    d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(!d.querySelector('#ticketModal').classList.contains('is-open'));assert.equal(d.activeElement,card);
    card.click();await ui.ready();assert.equal(d.querySelector('input[name=tkPlan]:checked').value,target);d.querySelector('[data-tk-close]').click();
    assert.equal(ui.purchases.length,0);
   }
   const landingTrial=d.querySelector('#pricing [data-landing-ticket=trial]');
   if(['eligible','free-welcome'].includes(state)){landingTrial.click();await ui.ready();assert.equal(d.querySelector('input[name=tkPlan]:checked').value,'trial');d.querySelector('[data-tk-close]').click();}
   else if(state!=='loggedout'){landingTrial.click();await ui.ready();assert(!d.querySelector('#ticketModal').classList.contains('is-open'));assert(landingTrial.textContent.includes(state==='used'?(locale==='KO'?'이용 완료':'Trial completed'):(locale==='KO'?'혜택 적용 완료':'Benefit applied')));}
   for(const [key,amount] of [['single','19,900'],['starter3','54,900'],['light11','179,000'],['full33','499,000']])assert(d.querySelector('[data-landing-ticket='+key+']').textContent.includes(amount));
   // The explicit existing review action retains the original SKU; this is a mock, never a payment.
   d.querySelector('[data-landing-ticket=full33]').click();await ui.ready();d.querySelector('[data-tk-buy]').click();assert.deepEqual(ui.purchases,['full33']);
   console.log('PASS PRICE-03 '+locale+' '+state+': four selections, exact totals, canonical landing trial, zero checkout on open/reopen/Escape, focus restore, explicit existing SKU review.');
  }finally{w.close();}
 }
 for(const locale of ['KO','EN']){
  const ui=await makeUi('eligible',locale);await ui.ready();const {d,w}=ui;
  d.querySelector('#pricing').innerHTML=cardRow+'<button data-landing-trial-retry hidden>Retry</button>';w.DayOTickets.renderTrialSalesSurfaces();
  let release;ui.setReply(()=>new Promise(resolve=>release=resolve));const read=w.DayOTickets.refreshTrialEligibility(true);
  assert(d.querySelector('#pricing [data-landing-ticket=trial]').disabled);assert(d.querySelector('#pricing [data-landing-ticket=single]').textContent.includes('19,900'));
  await new Promise(resolve=>setImmediate(resolve));release({ok:false,json:async()=>({ok:false})});await read;await ui.ready();
  assert(d.querySelector('#pricing [data-landing-ticket=trial]').disabled);assert(!d.querySelector('[data-landing-trial-retry]').hidden);
  ui.setReply(null);d.querySelector('[data-landing-trial-retry]').click();await ui.ready();assert(!d.querySelector('#pricing [data-landing-ticket=trial]').disabled);assert(d.querySelector('[data-landing-trial-retry]').hidden);w.close();
 }
 const pending=await makeUi('eligible','EN');await pending.ready();
 try{
  pending.d.querySelector('#pricing').innerHTML=cardRow;
  let release;pending.setReply(()=>new Promise(resolve=>{release=resolve;}));
  pending.d.querySelector('[data-landing-ticket=full33]').click();
  assert.equal(pending.d.querySelector('input[name=tkPlan]:checked').value,'pack33');
  await new Promise(resolve=>setImmediate(resolve));assert(release);
  release({ok:true,json:async()=>({ok:true,eligible:true})});await pending.ready();
  assert.equal(pending.d.querySelector('input[name=tkPlan]:checked').value,'pack33','late eligibility must not replace landing preselection');
  assert.equal(pending.purchases.length,0);console.log('PASS late eligibility keeps explicit 33-session selection; no checkout while loading.');
 }finally{pending.w.close();}
}
async function serve(){
 const f=await setup(),http=require('http');
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1'),name=url.pathname;
  if(name==='/api/ticket-payment'){
   let raw='';for await(const chunk of req)raw+=chunk;
   const token=(req.headers.authorization||'').replace(/^Bearer /,''),result=await f.call(token.replace(/^fixture-/,''),JSON.parse(raw||'{}'),token);
   res.writeHead(result.status,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify(result.body));
  }
  if(name==='/price03-preview'){
   const state=url.searchParams.get('state')||'eligible',id=f.users[state]||f.users.eligible;
   // Local isolated UI fixture: real landing markup/styles + real modal/i18n + existing local eligibility API/DB.
   // Other app scripts are omitted only in this test response; no auth/payment/provider production traffic.
   const shell=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
   const bootstrap=`<style>html{scroll-behavior:auto!important}.reveal{opacity:1!important;transform:none!important;animation:none!important}</style><script>
const fixtureSession=${state==='loggedout'?'null':JSON.stringify({user:{id},access_token:'fixture-'+id})};
window.supabaseClient={auth:{getSession:async()=>({data:{session:fixtureSession}}),onAuthStateChange(){}}};
window.DayOProfileStore={getUserId:()=>fixtureSession?.user.id||null};window.DayOPaymentTestAccess={isAllowed:async()=>false};
window.requestPay=async()=>{throw Error('Payments disabled in local preview');};
</script><script src="/i18n.js"></script><script src="/tickets-modal.js"></script><script>document.addEventListener('DOMContentLoaded',()=>DayOI18n.setLang(${JSON.stringify(url.searchParams.get('lang')||'KO')}));</script>`;
   res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(shell.replace('</body>',bootstrap+'</body>'));
  }
  if(name==='/back-check'){res.setHeader('Content-Type','text/html');return res.end('<a href="/price03-preview?state=eligible#pricing">Open local landing</a>');}
  const rel=decodeURIComponent(name).replace(/^\//,''),file=path.resolve(root,'public',rel);if(!file.startsWith(path.resolve(root,'public')+path.sep)){res.writeHead(404);return res.end();}
  const types={'.js':'application/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.html':'text/html; charset=utf-8'};
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
 }catch(e){res.writeHead(500);res.end('Local fixture failed');console.error(e.message);}});
 server.listen(3083,'127.0.0.1',()=>console.log('PRICE-03 local fixture http://127.0.0.1:3083/price03-preview?state=eligible#pricing'));
}
if(process.argv.includes('--serve'))serve().catch(e=>{console.error(e);process.exitCode=1;});
else (async()=>{try{await checks();console.log('PASS Scope guard: outside landing choices/selection and disabled trial presentation 0 product changes.');}finally{const f=await setup();await f.db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
