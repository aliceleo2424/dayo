const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const guide=require('../api/_lib/guidebook-delivery.js');
const oldFetch=global.fetch,oldEnv={...process.env};
process.env.RESEND_API_KEY='fixture-key';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-service';
process.env.RESEND_FROM='DayO <hello@dayotalk.com>';
const rows=new Map(),calls=[];let dbError=null,mailError=false,updateError=false;
const db={from(name){assert.equal(name,'leads');return{
 insert(batch){return{async abortSignal(){if(dbError)return{error:dbError};let row=batch[0];if(rows.has(row.id))return{error:{code:'23505'}};rows.set(row.id,{...row,created_at:'original-created'});return{error:null};}}},
 select(){let id;let q={eq(k,v){assert.equal(k,'id');id=v;return q;},maybeSingle(){return q;},async abortSignal(){return{error:null,data:rows.get(id)||null};}};return q;},
 update(patch){let conditions={};let q={eq(k,v){conditions[k]=v;return q;},is(k,v){conditions[k]=v;return q;},async abortSignal(){if(updateError)return{error:{code:'fixture'}};for(let row of rows.values())if(Object.entries(conditions).every(([k,v])=>row[k]===v))Object.assign(row,patch);return{error:null};}};return q;}
 };}};
global.fetch=async(url,opts)=>{assert.equal(url,'https://api.resend.com/emails');const data=JSON.parse(opts.body);calls.push({data,key:opts.headers['Idempotency-Key']});return{ok:!mailError,json:async()=>({id:'fixture-email'})};};
async function request(body={},email='qa@example.com'){let output;await guide({consent:true,...body},email,{}, {json:(res,status,data)=>output={status,...data},getSupabase:()=>db});return output;}
(async()=>{
 assert.equal((await request({},'bad')).status,400);
 assert.equal((await request({},'x@example.com,other@example.com')).status,400);
 assert.equal((await request({consent:false})).status,400);assert.equal(rows.size,0);assert.equal(calls.length,0);
 let result=await request();assert.equal(result.status,200);assert.equal(rows.size,1);
 let row=rows.get(guide.leadId('qa@example.com'));assert.equal(row.source,'speaking_sense_guidebook');assert.equal(row.marketing_consent,false);assert.equal(row.marketing_consented_at,null);assert.match(row.guidebook_sent_at,/^20/);assert.equal(row.marketing_withdrawn_at,null);const firstSend=row.guidebook_sent_at;
 assert.equal(calls[0].data.to[0],'qa@example.com');assert.match(calls[0].data.html,/https:\/\/www\.dayotalk\.com\/guidebook\/level-1/);assert.equal(calls[0].data.attachments,undefined);assert.match(calls[0].data.html,/수신 거부/);assert.match(calls[0].data.text,/unsubscribe#token=[0-9a-f-]{36}/);assert.doesNotMatch(calls[0].data.text,/unsubscribe[^\n]*qa@example/);
 await Promise.all([request(),request()]);assert.equal(row.guidebook_sent_at,firstSend);assert.equal(calls[0].data.html,calls.at(-1).data.html);assert.equal(rows.size,1);assert.equal(new Set(calls.map(c=>c.key)).size,1);
 assert.equal((await request({marketingConsent:true})).status,200);assert.equal(row.marketing_consent,true);assert.match(row.marketing_consented_at,/^20/);const timestamp=row.marketing_consented_at;
 await request({marketingConsent:true});await request({marketingConsent:false});assert.equal(row.marketing_consented_at,timestamp);assert.equal(row.marketing_consent,true);assert.equal(row.created_at,'original-created');
 await request({marketingConsent:'true'},'no-optin@example.com');assert.equal(rows.get(guide.leadId('no-optin@example.com')).marketing_consent,false);
 rows.set(guide.leadId('collision@example.com'),{email:'another@example.com',source:null});assert.equal((await request({},'collision@example.com')).status,503);
 mailError=true;result=await request({},'failed@example.com');assert.equal(result.status,502);assert.equal(result.leadSaved,true);assert.ok(rows.has(guide.leadId('failed@example.com')));assert.equal(rows.get(guide.leadId('failed@example.com')).guidebook_sent_at,null);
 mailError=false;assert.equal((await request({},'failed@example.com')).status,200);assert.equal(calls.at(-1).key,calls.at(-2).key);
 dbError={code:'fixture-storage'};const count=calls.length;result=await request({},'storage@example.com');assert.equal(result.status,503);assert.equal(calls.length,count);dbError=null;
 updateError=true;assert.equal((await request({marketingConsent:true},'update@example.com')).status,503);updateError=false;
 delete process.env.RESEND_API_KEY;assert.equal((await request()).status,503);process.env.RESEND_API_KEY='fixture-key';
 const entry=fs.readFileSync(path.join(root,'api/send-lead-email.js'),'utf8');
 const sandbox={module:{exports:{}},process,console,require(name){
   if(name==='nodemailer')return{};
   if(name==='@supabase/supabase-js')return{createClient:()=>db};
   if(name==='../cheat-sheet-data.js')return require('../cheat-sheet-data.js');
   if(name==='./_lib/guidebook-delivery.js')return guide;
   throw new Error('Unexpected entry dependency');
 }};vm.runInNewContext(entry,sandbox);
 async function callEntry(method,body){let output={};await sandbox.module.exports({method,body},{setHeader(){},set statusCode(s){output.status=s;},end(b){if(b)output.body=JSON.parse(b);}});return output;}
 assert.equal((await callEntry('GET',{})).status,405);assert.equal((await callEntry('OPTIONS',{})).status,204);
 assert.equal((await callEntry('POST',{kind:'guidebook',email:' ENTRY@EXAMPLE.COM ',consent:true})).status,200);
 assert.equal(rows.get(guide.leadId('entry@example.com')).email,'entry@example.com');
 const unsubSource=fs.readFileSync(path.join(root,'api/guidebook-unsubscribe.js'),'utf8');let rpcFailure=false,tokenCalls=[];const unsubSandbox={module:{exports:{}},process,AbortSignal,require:()=>({createClient:()=>({rpc:(name,args)=>{assert.equal(name,'unsubscribe_guidebook_marketing');tokenCalls.push(args.p_token);return{abortSignal:async()=>({error:rpcFailure?{}:null})};}})})};vm.runInNewContext(unsubSource,unsubSandbox);
 async function unsub(method,body){let output={};await unsubSandbox.module.exports({method,body},{setHeader(){},set statusCode(v){output.status=v;},end(v){output.body=JSON.parse(v);}});return output;}
 assert.equal((await unsub('GET',{})).status,405);assert.equal((await unsub('POST',{token:'email@example.com'})).status,400);
 const token=rows.get(guide.leadId('qa@example.com')).marketing_unsubscribe_token;assert.equal((await unsub('POST',{token})).status,200);assert.equal((await unsub('POST',{token})).status,200);rpcFailure=true;assert.equal((await unsub('POST',{token})).status,503);
 const index=fs.readFileSync(path.join(root,'public/index.html'),'utf8');for(const m of index.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){if(!/src=|application\//.test(m[1]))new vm.Script(m[2]);}
 new vm.Script(fs.readFileSync(path.join(root,'public/i18n.js'),'utf8'));
 for(const file of ['index.html','i18n.js','speaking-guidebook.css','guidebook/level-1.html','privacy.html','unsubscribe.html'])assert.deepEqual(fs.readFileSync(path.join(root,file)),fs.readFileSync(path.join(root,'public',file)),file+' root/public sync');
 assert.equal((index.match(/data-quiz-preopen-cta data-quiz-topic="0"/g)||[]).length,1);assert.ok(index.includes('data-quiz-topic-choice'));
 assert.equal(fs.existsSync(path.join(root,'assets/guidebooks/level-1.pdf')),false,'PDF canonical source is public only');assert.equal(fs.readFileSync(path.join(root,'public/assets/guidebooks/level-1.pdf')).subarray(0,5).toString(),'%PDF-');
 const sql=fs.readFileSync(path.join(root,'supabase/migrations/088_speaking_guidebook_lead_consent.sql'),'utf8');assert.match(sql,/marketing_consent boolean not null default false/);assert.match(sql,/revoke all on public\.leads/);assert.doesNotMatch(sql,/drop\s+(table|column)\b/i);

 const {PGlite}=require('@electric-sql/pglite');const pg=new PGlite();
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;`);
 await pg.exec(fs.readFileSync(path.join(root,'supabase/migrations/008_leads.sql'),'utf8'));
 await pg.exec(fs.readFileSync(path.join(root,'supabase/migrations/009_leads_authenticated_insert.sql'),'utf8'));
 await pg.exec(`grant all on public.leads to anon,authenticated,service_role;create policy legacy_select on public.leads for select to authenticated using(true);insert into public.leads(email)values('legacy@example.com');`);
 await pg.exec(`create function public.dayo_is_admin() returns boolean language sql stable as $$select coalesce(current_setting('qa.admin',true),'false')='true'$$;`);await pg.exec(`create schema cron;create table cron.job(jobname text primary key,schedule text,command text);create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job values($1,$2,$3) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning 1::bigint$$;`);await pg.exec(sql);assert.deepEqual((await pg.query('select schedule,command from cron.job')).rows,[{schedule:'15 18 * * *',command:'select public.purge_expired_guidebook_leads();'}]);
 await pg.exec(`set role anon;insert into public.leads(email,language,level,score)values('legacy-anon@example.com','en','beginner',1);reset role;`);
 for(const role of ['anon','authenticated']){
   let denied=false;try{await pg.exec(`set role ${role};insert into public.leads(email,source,marketing_consent,marketing_consented_at)values('forged@example.com','speaking_sense_guidebook',true,now());`);}catch(e){denied=e.message.includes('permission denied');}await pg.exec('reset role;');assert.ok(denied,role+' cannot forge consent');
 }
 await pg.exec(`set role service_role;insert into public.leads(email,source)values('private@example.com','speaking_sense_guidebook');reset role;`);
 await pg.exec('set role authenticated;');let seen=await pg.query(`select email from public.leads order by email;`);assert.deepEqual(seen.rows,[]);await pg.exec("set qa.admin='true';");assert.equal((await pg.query('select count(*)::int as n from public.leads')).rows[0].n,3);await pg.exec("set qa.admin='false';");
 assert.equal((await pg.query(`select has_column_privilege('authenticated','public.leads','marketing_consent','UPDATE') as allowed;`)).rows[0].allowed,false);await pg.exec('reset role;');
 assert.equal((await pg.query(`select count(*)::int as n from public.leads where marketing_consent;`)).rows[0].n,0);
 let invalid=false;try{await pg.exec(`insert into public.leads(email,marketing_consent)values('invalid@example.com',true);`);}catch(e){invalid=e.message.includes('check constraint');}assert.ok(invalid);
 let anonReadBlocked=false;try{await pg.exec('set role anon;select email from public.leads;');}catch(e){anonReadBlocked=e.message.includes('permission denied');}await pg.exec('reset role;');assert.ok(anonReadBlocked);
 // Actual PostgreSQL permissions, retention, withdrawal and campaign filtering.
 for(const role of ['anon','authenticated']){
  for(const query of ["select * from public.guidebook_marketing_recipients()", "select public.withdraw_guidebook_marketing('private@example.com')", 'select public.purge_expired_guidebook_leads()', "select public.unsubscribe_guidebook_marketing('00000000-0000-4000-8000-000000000000')", "update public.leads set marketing_consent=true"]){
   let blocked=false;try{await pg.exec(`set role ${role};${query};`);}catch(e){blocked=e.message.includes('permission denied');}await pg.exec('reset role;');assert.ok(blocked,role+' denied '+query);
  }
 }
 await pg.exec(`set role service_role;
 insert into public.leads(email,source,marketing_consent,marketing_consented_at,guidebook_sent_at,created_at) values
 ('expired@example.com','speaking_sense_guidebook',false,null,now()-interval '31 days',now()-interval '40 days'),
 ('fresh@example.com','speaking_sense_guidebook',false,null,now()-interval '29 days',now()-interval '40 days'),
 ('opted@example.com','speaking_sense_guidebook',true,now()-interval '60 days',now()-interval '60 days',now()-interval '60 days'),
 ('failed-old@example.com','speaking_sense_guidebook',false,null,null,now()-interval '31 days');`);
 assert.deepEqual((await pg.query('select email from public.guidebook_marketing_recipients()')).rows.map(r=>r.email),['opted@example.com']);
 assert.equal((await pg.query('select public.purge_expired_guidebook_leads() as n')).rows[0].n,2);
 assert.ok((await pg.query("select email from public.leads where email='legacy@example.com'")).rows.length);
 const consentDate=(await pg.query("select marketing_consented_at from public.leads where email='opted@example.com'")).rows[0].marketing_consented_at;
 const unsubscribeToken=(await pg.query("select marketing_unsubscribe_token from public.leads where email='opted@example.com'")).rows[0].marketing_unsubscribe_token;await pg.query('select public.unsubscribe_guidebook_marketing($1)',[unsubscribeToken]);
 const withdrawn=(await pg.query("select * from public.leads where email='opted@example.com'")).rows[0];assert.equal(withdrawn.marketing_consent,false);assert.ok(withdrawn.marketing_withdrawn_at);assert.deepEqual(withdrawn.marketing_consented_at,consentDate);
 assert.equal((await pg.query('select * from public.guidebook_marketing_recipients()')).rows.length,0);
 await pg.exec("select public.withdraw_guidebook_marketing('opted@example.com');");assert.deepEqual((await pg.query("select marketing_withdrawn_at from public.leads where email='opted@example.com'")).rows[0].marketing_withdrawn_at,withdrawn.marketing_withdrawn_at);
 assert.equal((await pg.query('select public.purge_expired_guidebook_leads() as n')).rows[0].n,1);
 await pg.exec('reset role;');await pg.close();
 // Exercise actual renderer and lead event handlers with actual translations.
 const {JSDOM}=require('jsdom');const section=index.slice(index.indexOf('    function renderResultStep()'),index.indexOf('\n    function ',index.indexOf('        }).catch(() => finishError',index.indexOf('    function renderResultStep()'))));
 const topics=index.slice(index.indexOf('    function quizTopicCardsForLang'),index.indexOf('    function renderQuestion'));
 let payloads=[],fail=false,booked=false;
 const dom=new JSDOM('<!doctype html><html><body><div id="quizSlides"></div></body></html>',{runScripts:'outside-only',url:'http://localhost/'});
 dom.window.AbortSignal=AbortSignal;dom.window.fetch=async(url,opt)=>{payloads.push(JSON.parse(opt.body));return{ok:!fail,json:async()=>({ok:!fail})};};
 dom.window.eval(fs.readFileSync(path.join(root,'public/i18n.js'),'utf8'));dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));dom.window.DayOI18n.setLang('KO');
 dom.window.DayOBooking={requestOpen:()=>booked=true};
 dom.window.eval(`const t=(key,vars)=>vars?window.DayOI18n.tf(key,vars):window.DayOI18n.t(key);const escapeHtml=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const quizLang='en',speechAnswers=[{units:3},{units:7},{units:12,durationMs:9000}];function persistSpeakingTestResult(){}function setQuizProgressVisible(){}function setQuizProgress(){}function resetSpeakingTest(){}function showToast(){}function closeQuizModal(){}${topics}${section}document.getElementById('quizSlides').appendChild(renderResultStep());`);
 const d=dom.window.document;assert.match(d.querySelector('.guidebook-privacy-note').textContent,/30일/);assert.match(d.querySelector('#guidebook-marketing').parentElement.textContent,/\[선택\]/);assert.equal(d.querySelector('#guidebook-marketing').checked,false);const submit=()=>d.querySelector('#quizLeadForm').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));const tick=()=>new Promise(r=>setImmediate(r));
 assert.equal(d.querySelectorAll('[data-quiz-preopen-cta]').length,1);d.querySelector('[data-quiz-topic-choice="1"]').click();assert.equal(d.querySelector('[data-quiz-preopen-cta]').dataset.quizTopic,'1');d.querySelector('[data-quiz-preopen-cta]').click();assert.ok(booked);assert.match(dom.window.localStorage.getItem('dayo_quiz_topic'),/랜선/);
 submit();assert.match(d.querySelector('#quizLeadError').textContent,/이메일/);assert.equal(payloads.length,0);
 d.querySelector('#lead-email-id').value='qa';d.querySelector('#lead-email-domain').value='custom';d.querySelector('#lead-email-domain').dispatchEvent(new dom.window.Event('change'));assert.equal(d.querySelector('#lead-email-domain-custom').hidden,false);d.querySelector('#lead-email-domain-custom').value='example.com';submit();assert.equal(payloads.length,0);
 d.querySelector('#guidebook-consent').checked=true;fail=true;submit();await tick();assert.equal(d.querySelector('.email-submit').disabled,false);assert.equal(d.querySelector('#quizLeadCard').classList.contains('is-done'),false);assert.equal(payloads[0].marketingConsent,false);
 fail=false;d.querySelector('#guidebook-marketing').checked=true;submit();await tick();assert.equal(payloads.at(-1).marketingConsent,true);assert.equal(d.querySelector('#quizLeadCard').classList.contains('is-done'),true);assert.match(d.querySelector('#quizLeadSuccess').textContent,/qa@example.com/);assert.doesNotMatch(d.querySelector('#quizLeadSuccess').textContent,/\{email\}/);dom.window.close();
 console.log('PASS: validation, required/optional consent, legacy-safe leads, parallel duplicates, retry/idempotency, send/storage failure isolation, consent timestamp/created_at preservation, inline JS syntax, root/public sync, PDF binary, additive migration, real PostgreSQL grants/RLS/legacy rows, actual UI renderer/validation/booking handoff/retry/translation.');
})().finally(()=>{global.fetch=oldFetch;process.env=oldEnv;}).catch(e=>{console.error(e);process.exitCode=1;});



