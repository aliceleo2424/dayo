// Actual customer quiz DOM and existing lifecycle RPC path; synthetic authenticated storage.
// Optional DAYO_QUIZ_ASSET_BASE uses deployed static assets without writing Production data.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright'),model=require('../public/conversation-recap.js');
const root=path.resolve(__dirname,'..'),B='44444444-4444-4444-8444-444444444444',L='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222';
const read=f=>fs.readFileSync(path.join(root,'public',f),'utf8');
const transcript=[{id:'u1',speaker:'learner',text:'The cafe was crowded, quiet and delicious.',timestamp:'2026-10-13T00:00:00Z'}];
const log={id:'learner-source',booking_id:B,participant_id:L,participant_role:'learner',transcript};
const base=model.build({bookingId:B,learnerId:L,partnerId:P,language:'en',learnerLog:log});
assert.equal(base.questions.length,6);
const pageHTML=read('session-recap.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const open=read('session-recap.html').match(/<script>\s*(window.DayORoomAccess=[\s\S]*?)<\/script>/)[1];
const stores=new Map();let writes=0;
function report(count=6){const r=structuredClone(base);r.questions=r.questions.slice(0,count);r.progress={completed:0,total:count,reason:null,correct:0,answers:[]};return {booking_id:B,learner_id:L,partner_name:'Jen',language:'en',partner_comment:'Synthetic preserved Letter.',quiz_score:67,feedback:[r]};}
async function run(){
 const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost'),id=u.searchParams.get('case')||'default';
  if(u.pathname==='/fixture-report'){res.setHeader('Content-Type','application/json');if(req.method==='POST'){let b='';for await(const c of req)b+=c;const data=JSON.parse(b);assert.equal(data.p_booking_id,B);assert.equal(data.p_report.quiz_score,67,'historical numeric field remains untouched');stores.set(id,{...stores.get(id),...data.p_report});writes++;return res.end(JSON.stringify({success:true}));}return res.end(JSON.stringify(stores.get(id)));}
  if(u.pathname==='/')return res.end(pageHTML);
  const file=path.resolve(root,'public',u.pathname.slice(1));if(!file.startsWith(path.resolve(root,'public')+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(fs.readFileSync(file));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const local='http://127.0.0.1:'+server.address().port,assets=process.env.DAYO_QUIZ_ASSET_BASE||local;
 const browser=await chromium.launch({channel:'chrome',headless:true});let cases=0;
 async function setup(page,id,locale){
  await page.goto(local+'/?case='+id);
  for(const f of ['i18n.js','learner-expressions.js','conversation-recap.js','partner-report-contract.js','user-conversation-report.js'])await page.addScriptTag({url:assets+'/'+f});
  await page.evaluate(({id,locale,B,L,P,log})=>{
   DayOI18n.setLang(locale);window.__now=Date.now();Date.now=()=>window.__now;
   const get=()=>fetch('/fixture-report?case='+id).then(r=>r.json());
   window.supabaseClient={auth:{getUser:async()=>({data:{user:{id:L}}}),getSession:async()=>({data:{session:{access_token:'synthetic-fixture'}}})},
    from(table){return {select(){return this},eq(){return this},order(){return this},limit(){return Promise.resolve({data:[]})},async maybeSingle(){return {data:table==='session_logs'?log:await get()}}};},
    rpc:async(name,args)=>{if(name!=='merge_learner_session_report')throw Error('Unexpected RPC '+name);return {data:await fetch('/fixture-report?case='+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)}).then(r=>r.json())};}};
  },{id,locale,B,L,P,log});
  await page.addScriptTag({content:open});
  await page.evaluate(({B,L,P})=>{DayORoomAccess={allowed:true,recapOnly:true,role:'user',bookingId:B,learnerId:L,partnerId:P,language:'en',partnerName:'Jen'};},{B,L,P});
  await page.addScriptTag({url:assets+'/session-lifecycle.js'});await page.addScriptTag({url:assets+'/memory-game.js'});
  await page.evaluate(()=>openQuizModalImmediately());
 }
 async function answer(page,q,yes){const option=yes?q.answer:q.options.find(x=>x!==q.answer);await page.locator('.recap-option').filter({hasText:new RegExp('^'+option+'$')}).click();
  const status=page.locator('[data-answer-result]');assert.equal(await status.getAttribute('data-answer-result'),yes?'correct':'incorrect');if(!yes)assert((await status.textContent()).includes(q.answer));
  await page.waitForFunction(()=>__dayoReviewReportSaved===true);await page.locator('#word-pool-container button.recap-primary').click();
 }
 try{
  for(const locale of ['KO','EN'])for(const width of [360,390,430,1280])for(const correct of [0,3,6]){
   const id=locale+'-'+width+'-'+correct;stores.set(id,report());const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await setup(page,id,locale);await page.locator('[data-recap-start]').click();
   for(let i=0;i<6;i++){
    if(i===2){await page.reload();await setup(page,id,locale);await page.locator('[data-recap-start]').click();assert.match(await page.locator('#game-round-badge').textContent(),/^2\/6/);}
    await answer(page,base.questions[i],i<correct);
   }
   await page.waitForFunction(()=>document.getElementById('game-round-badge').textContent.endsWith('correct')||document.getElementById('game-round-badge').textContent.endsWith('정답'));
   assert.equal(await page.locator('#game-round-badge').textContent(),correct+'/6'+(locale==='KO'?' 정답':' correct'));assert.equal(await page.locator('#quiz-skip-btn').isVisible(),false,'results have a single Return action');
   const saved=model.saved(stores.get(id));assert.equal(saved.progress.completed,6);assert.equal(saved.progress.correct,correct);assert.equal(saved.progress.answers.length,6);assert.equal(saved.progress.reason,'completed');
   assert.equal(stores.get(id).partner_comment,'Synthetic preserved Letter.');assert.equal(stores.get(id).quiz_score,67);
   assert(await page.locator('.review-panel').evaluate(e=>e.scrollWidth<=e.clientWidth));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const shots=process.env.DAYO_QUIZ_SCREENSHOTS;if(shots&&correct===3){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,'quiz-'+locale+'-'+width+'.png')});}
   await page.locator('#word-pool-container button.recap-primary').click();assert.equal(await page.locator('#memory-game-modal').isVisible(),false);
   await page.reload();await setup(page,id,locale);assert((await page.locator('.recap-quiz').textContent()).includes(correct+'/6'));
   await page.evaluate(r=>{document.getElementById('quiz-content-box').innerHTML=DayOUserConversationReport.renderDetail(r,DayOI18n.getLang().toLowerCase())+DayOUserConversationReport.renderArchive(r,0,DayOI18n.getLang().toLowerCase());},stores.get(id));
   assert((await page.locator('.recap-quiz').textContent()).includes(correct+'/6'));assert((await page.locator('.ucr-archive-badges').textContent()).includes(correct+'/6'));assert(!/%|등급|100점/.test(await page.locator('.recap-quiz').textContent()));
   // Practice results are independent and never overwrite the original.
   const before=JSON.stringify(stores.get(id)),beforeWrites=writes;await page.evaluate(()=>startRecapQuestions({practice:true}));assert.match(await page.locator('#game-round-badge').textContent(),/^0\/6/);
   for(let i=0;i<6;i++){const q=base.questions[i];await page.locator('.recap-option').filter({hasText:new RegExp('^'+q.answer+'$')}).click();await page.locator('#word-pool-container button.recap-primary').click();}
   assert.equal(await page.locator('#game-round-badge').textContent(),'6/6'+(locale==='KO'?' 정답':' correct'));assert.equal(JSON.stringify(stores.get(id)),before);assert.equal(writes,beforeWrites);await page.locator('#word-pool-container button.recap-primary').click();
   assert.deepEqual(errors,[]);cases++;await page.close();
  }
  for(const total of [2,4,6])for(const end of ['complete','skip','timeout','double-tap','save-failure','legacy']){
   const id=total+'-'+end,r=report(total);if(end==='legacy')r.feedback[0].progress={completed:total,total,reason:'completed'};stores.set(id,r);const priorWrites=writes,priorReport=JSON.stringify(r);const page=await browser.newPage();await setup(page,id,'KO');
   if(end==='legacy'){assert.equal(writes,priorWrites,'opening historical results never rewrites them');assert.equal(JSON.stringify(stores.get(id)),priorReport);assert((await page.locator('.recap-quiz').textContent()).includes('정답 기록 없음'));assert.equal(stores.get(id).quiz_score,67);await page.close();cases++;continue;}
   await page.locator('[data-recap-start]').click();
   if(end==='complete'){for(let i=0;i<total;i++)await answer(page,base.questions[i],i<total/2);await page.waitForFunction(()=>document.getElementById('quiz-skip-btn').style.display==='none');const p=model.saved(stores.get(id)).progress;assert.equal(p.correct,total/2);assert.equal(p.completed,total);assert.equal(p.reason,'completed');}
   if(end==='skip')await page.locator('#quiz-skip-btn').click();
   if(end==='timeout'){await page.evaluate(()=>{__now+=200000;});await page.waitForFunction(()=>document.getElementById('memory-game-modal').hidden);}
   if(end==='double-tap'){await page.evaluate(()=>{const b=document.querySelector('.recap-option');b.click();b.click();});await page.waitForFunction(()=>__dayoReviewReportSaved);assert.equal(model.saved(stores.get(id)).progress.completed,1);assert.equal(model.saved(stores.get(id)).progress.answers.length,1);}
   if(end==='save-failure'){await page.evaluate(()=>{supabaseClient.rpc=async()=>({error:{message:'fixture failure'}});});await page.locator('.recap-option').first().click();await page.locator('#quiz-skip-btn').click();await page.locator('[data-recap-save-status]').waitFor();assert(!await page.locator('#quiz-modal').isHidden());}
   if(end==='skip'||end==='timeout'){const p=model.saved(stores.get(id)).progress;assert.equal(p.correct,0);assert.equal(p.completed,0);assert.equal(p.total,total);assert.equal(p.reason,end);}
   await page.close();cases++;
  }
  for(const f of ['memory-game.js','conversation-recap.js','user-conversation-report.js','supabase-client.js'])assert.equal(read(f),fs.readFileSync(path.join(root,f),'utf8'));
  console.log('PASS '+cases+' real DOM cases: 0/6,3/6,6/6; KO/EN 360/390/430/1280; immediate correct/incorrect, actual answer, distinct completed/correct, 2/4/6, reload/RPC persistence, practice isolation, timeout/skip, duplicate taps, save failure, legacy unknown, unchanged Letter/score. '+(assets===local?'Local assets.':'Deployed assets '+assets)+ ' Synthetic transport only; no Production writes.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
