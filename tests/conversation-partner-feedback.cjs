const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const U='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222',X='33333333-3333-4333-8333-333333333333',A='55555555-5555-4555-8555-555555555555',B='44444444-4444-4444-8444-444444444444';
async function database(){const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.dayo_is_admin() returns boolean language sql stable as $$select auth.uid()='${A}'::uuid$$;
 create table profiles(id uuid primary key,role text);insert into profiles values('${U}','user'),('${P}','partner'),('${X}','user'),('${A}','admin');
 create table bookings(id uuid primary key,learner_id uuid,partner_user_id uuid,status text,scheduled_at timestamptz,ended_at timestamptz,is_test_session boolean,ticket_deducted boolean,ticket_refunded boolean,partner_rewarded boolean);
 insert into bookings values('${B}','${U}','${P}','confirmed',now(),null,true,false,false,false);`);
 await db.exec(read('supabase/migrations/048_add_session_event_logging.sql'));await db.exec(read('supabase/migrations/100_room_session_end_state.sql'));
 const hashes=(await db.query("select md5(pg_get_functiondef('get_room_session_state(uuid)'::regprocedure)) room,md5(pg_get_functiondef('dayo_is_admin()'::regprocedure)) admin")).rows[0];
 // Only the local admin stub differs; production preflight hashes stay fixed in the shipped migration.
 assert.equal(hashes.room,'ce32926ba5402738ecd0c16e0707cd26');
 await db.exec(read('supabase/migrations/101_conversation_partner_feedback.sql').replace('b932d95fb53315d3521fc15648ea116b',hashes.admin));
 // Reproduce the exact audited production function whitespace for its hash guard.
 const baseline=JSON.parse(read('tests/fixtures/feedback-101-production-definition.json'));
 await db.exec(baseline.definition);
 assert.equal((await db.query("select md5(pg_get_functiondef('save_conversation_partner_feedback(uuid,text[],text[],text)'::regprocedure)) h")).rows[0].h,'4b0857ee82204efe06a8a2b2fd01d7e4');
 const actor=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 const save=(g,r,n='private QA note')=>db.query('select save_conversation_partner_feedback($1,$2,$3,$4) f',[B,g,r,n]);
 await actor(U);await assert.rejects(save(['spoke_slowly'],[]),/session_not_ended/);
 await db.exec('reset role');await db.query("insert into session_events(id,booking_id,actor_user_id,event_type,payload) values(gen_random_uuid(),$1,$2,'session_ended','{\"role\":\"learner\",\"reason\":\"personal\"}')",[B,U]);
 const before=(await db.query('select * from bookings')).rows;
 await actor(U);assert.equal((await db.query('select get_my_conversation_partner_feedback($1) f',[B])).rows[0].f,null);
 await assert.rejects(save(['shared_new_stories'],[],null),/invalid_key/);
 await save(['helped_with_words','helped_with_expressions','kept_conversation_going'],['help_more_with_words','listen_more']);
 await db.exec('reset role');
 const rowsBefore=(await db.query('select * from conversation_partner_feedback')).rows;
 const guardsBefore=(await db.query("select conname,pg_get_constraintdef(oid) d from pg_constraint where conrelid='conversation_partner_feedback'::regclass and conname<>'conversation_partner_feedback_good_check' order by conname")).rows;
 await db.exec(read('supabase/migrations/102_add_shared_new_stories_feedback.sql'));
 assert.deepEqual((await db.query('select * from conversation_partner_feedback')).rows,rowsBefore);
 assert.deepEqual((await db.query("select conname,pg_get_constraintdef(oid) d from pg_constraint where conrelid='conversation_partner_feedback'::regclass and conname<>'conversation_partner_feedback_good_check' order by conname")).rows,guardsBefore);
 await assert.rejects(db.exec(read('supabase/migrations/102_add_shared_new_stories_feedback.sql')),/already applied/);await db.exec('rollback');
 await actor(U);
 await save(['spoke_slowly','waited_for_me','asked_good_questions','made_me_comfortable','shared_new_stories'],['speak_more_slowly','speak_more_quickly','wait_more','correct_more','speak_more','ask_more_questions'],null);
 let row=(await save(['spoke_slowly','waited_for_me','spoke_slowly'],['speak_more_slowly','wait_more'])).rows[0].f;
 assert.equal(row.good.length,2);assert.equal(row.requests.length,2);const initial=row;
 row=(await save(['asked_good_questions'],[],null)).rows[0].f;assert.equal(row.id,initial.id);assert.equal(row.created_at,initial.created_at);
 await save([],['ask_more_questions']);await assert.rejects(save(['invalid'],[]),/invalid_key/);await assert.rejects(save([],[],null),/invalid_content/);await assert.rejects(save([null],[]),/invalid_key/);await assert.rejects(save([],[], 'x'.repeat(1001)),/invalid_content/);
 await save(['spoke_slowly','waited_for_me','asked_good_questions','made_me_comfortable','shared_new_stories','helped_with_words','helped_with_expressions','kept_conversation_going'],['speak_more_slowly','speak_more_quickly','wait_more','correct_more','speak_more','ask_more_questions','help_more_with_words','listen_more'],'PRIVATE');
 assert.equal((await db.query('select get_my_conversation_partner_feedback($1) f',[B])).rows[0].f.private_admin_note,'PRIVATE');
 await assert.rejects(db.query('select * from conversation_partner_feedback'),/permission denied/);
 await actor(X);await assert.rejects(save(['spoke_slowly'],[]),/not_allowed/);await assert.rejects(db.query('select get_my_conversation_partner_feedback($1)',[B]),/not_allowed/);assert.equal((await db.query('select * from list_my_partner_conversation_feedback()')).rows.length,0);
 await actor(P);let partner=(await db.query('select * from list_my_partner_conversation_feedback()')).rows;assert.equal(partner.length,1);assert(!('private_admin_note' in partner[0]));assert(!('user_id' in partner[0]));assert.equal(partner[0].booking_id,B);assert.equal(partner[0].good.length,8);assert.equal(partner[0].requests.length,8);
 await assert.rejects(save(['spoke_slowly'],[]),/not_allowed/);await assert.rejects(db.query('select get_my_conversation_partner_feedback($1)',[B]),/not_allowed/);await assert.rejects(db.query('select admin_get_conversation_partner_feedback($1)',[B]),/admin_required/);
 await actor(A);const admin=(await db.query('select admin_get_conversation_partner_feedback($1) f',[B])).rows[0].f;assert.equal(admin.private_admin_note,'PRIVATE');assert.equal(admin.good.length,8);assert.equal(admin.requests.length,8);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select list_my_partner_conversation_feedback()'),/permission denied/);await assert.rejects(db.query('select * from conversation_partner_feedback'),/permission denied/);
 await db.exec('reset role');assert.deepEqual((await db.query('select * from bookings')).rows,before);assert.equal((await db.query('select count(*)::int n from conversation_partner_feedback')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from session_events')).rows[0].n,1);
 console.log('PASS SQL: exact ownership, ended-only, 8/8 compatible keys + new 5/6, unchanged legacy rows/requests/security, migration replay rejected, dedupe/upsert, good/request-only, private isolation, admin, anon, no settlement side effects');
 }finally{await db.close();}}
const wait=()=>new Promise(r=>setTimeout(r,20));
async function dom(){for(const lang of ['KO','EN'])for(const reason of ['normal','personal']){
 const d=new JSDOM('<div id="quiz-content-box"><div>EXISTING RECAP</div></div>',{url:'https://fixture.invalid/room?bookingId='+B,runScripts:'outside-only'}),w=d.window;try{
 Object.defineProperty(w.document,'readyState',{value:'complete'});w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.DayORoomAccess={allowed:true,role:'user',bookingId:B};w.eval(read('public/i18n.js'));w.DayOI18n.setLang(lang);
 let fail=false,calls=[];w.supabaseClient={rpc:async(n,a)=>{calls.push([n,a]);return n.startsWith('get_')?{data:null}:fail?{error:{message:'RAW SECRET'}}:{data:{booking_id:B}};}};
 w.eval(read('public/conversation-partner-feedback.js'));await wait();assert.equal(w.document.querySelectorAll('.cpf-entry').length,1);
 w.document.dispatchEvent(new w.CustomEvent('dayo:session-ended',{detail:{reason,finalized:true}}));await wait();assert(w.document.querySelector('dialog[open]'));
 const inputs=w.document.querySelectorAll('input');assert.equal(inputs.length,11);inputs[0].checked=true;inputs[1].checked=true;inputs[5].checked=true;inputs[6].checked=true;
 fail=true;w.document.querySelector('.cpf-primary').click();await wait();assert(w.document.querySelector('.cpf-status').textContent.includes(lang==='KO'?'저장하지':'couldn’t save'));assert(!w.document.body.textContent.includes('RAW SECRET'));assert(w.document.body.textContent.includes('EXISTING RECAP'));
 fail=false;w.document.querySelector('.cpf-primary').click();await wait();assert(!w.document.querySelector('dialog'));assert.equal(calls.at(-1)[1].p_good.length,2);assert.equal(calls.at(-1)[1].p_requests.length,2);
 w.document.dispatchEvent(new w.CustomEvent('dayo:session-ended',{detail:{reason,finalized:true}}));assert(!w.document.querySelector('dialog'),'same-page duplicate end');
 w.document.querySelector('.cpf-entry').click();await wait();w.document.querySelector('.cpf-actions .cpf-secondary').click();await wait();assert(!w.document.querySelector('dialog'),'skip does not save or block recap');
 w.document.getElementById('quiz-content-box').innerHTML='RELOADED RECAP';await wait();assert.equal(w.document.querySelectorAll('.cpf-entry').length,1);
 }finally{w.dispatchEvent(new w.Event("pagehide"));w.close();}}
 // New 5+6 selections save, while an existing response keeps hidden legacy values.
 for(const legacy of [false,true]){const d=new JSDOM('<div id="quiz-content-box">RECAP</div>',{url:'https://fixture.invalid/room',runScripts:'outside-only'}),w=d.window;try{
 Object.defineProperty(w.document,'readyState',{value:'complete'});w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.DayORoomAccess={allowed:true,role:'user',bookingId:B};w.eval(read('public/i18n.js'));
 const old={good:['helped_with_words','helped_with_expressions','kept_conversation_going'],requests:['help_more_with_words','listen_more'],private_admin_note:'PRIVATE'};let payload;
 w.supabaseClient={rpc:async(n,a)=>n.startsWith('get_')?{data:legacy?old:null}:(payload=a,{data:{booking_id:B}})};w.eval(read('public/conversation-partner-feedback.js'));w.document.querySelector('.cpf-entry').click();await wait();
 assert.equal(w.document.querySelectorAll('input[name="good"]').length,5);assert.equal(w.document.querySelectorAll('input[name="requests"]').length,6);for(const k of [...old.good,...old.requests])assert(!w.document.querySelector('input[value="'+k+'"]'));
 w.document.querySelectorAll('input').forEach(n=>n.checked=true);w.document.querySelector('.cpf-primary').click();await wait();assert.equal(payload.p_booking_id,B);assert.equal(payload.p_good.length,legacy?8:5);assert.equal(payload.p_requests.length,legacy?8:6);assert.equal(payload.p_private_admin_note,legacy?'PRIVATE':null);assert(!w.document.querySelector('dialog'));
 }finally{w.dispatchEvent(new w.Event('pagehide'));w.close();}}
 // Read failure is not an empty draft, and skipping still exposes the existing recap.
 {const d=new JSDOM('<div id="quiz-content-box">EXISTING RECAP</div>',{url:'https://fixture.invalid/room',runScripts:'outside-only'}),w=d.window;try{Object.defineProperty(w.document,'readyState',{value:'complete'});w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.DayORoomAccess={allowed:true,role:'user',bookingId:B};w.eval(read('public/i18n.js'));w.supabaseClient={rpc:async()=>({error:{message:'network'}})};w.eval(read('public/conversation-partner-feedback.js'));w.document.dispatchEvent(new w.CustomEvent('dayo:session-ended',{detail:{reason:'normal',finalized:true}}));await wait();assert(w.document.querySelector('.cpf-primary').disabled);w.document.querySelector('.cpf-actions .cpf-secondary').click();assert(!w.document.querySelector('dialog'));assert(w.document.body.textContent.includes('EXISTING RECAP'));}finally{w.dispatchEvent(new w.Event('pagehide'));w.close();}}
 // Partner UI uses constructive response only and EN unless explicit Korean UI.
 for(const lang of ['en','ko']){const d=new JSDOM('<html lang="'+lang+'"><body><section class="dashboard-card"><ul class="pd-past-list"></ul></section></body></html>',{url:'https://fixture.invalid/partner',runScripts:'outside-only'}),w=d.window;try{Object.defineProperty(w.document,'readyState',{value:'complete'});w.eval(read('public/i18n.js'));w.document.documentElement.lang=lang;w.supabaseClient={rpc:async(n)=>{assert.equal(n,'list_my_partner_conversation_feedback');return {data:[{booking_id:B,scheduled_at:new Date().toISOString(),good:['spoke_slowly','shared_new_stories','helped_with_words','helped_with_expressions','kept_conversation_going'],requests:['wait_more','help_more_with_words','listen_more']}]};}};w.eval(read('public/conversation-partner-feedback.js'));await wait();assert.equal(w.document.querySelectorAll('#cpf-partner').length,1);assert(w.document.querySelector('#cpf-partner').textContent.includes(lang==='ko'?'천천히':'comfortable pace'));assert.equal(w.document.querySelectorAll('#cpf-partner li').length,8);assert(w.document.querySelector('#cpf-partner').textContent.includes(lang==='ko'?'새로운 이야기를 들려줬어요':'Shared new and interesting stories'));assert(!w.document.querySelector('#cpf-partner').textContent.includes('PRIVATE'));}finally{w.dispatchEvent(new w.Event("pagehide"));w.close();}}
 console.log('PASS DOM: manual/timer optional entry, KO/EN, save error/input retry/skip, recap rerender, duplicate guard, new 5+6, legacy round-trip/Partner EN/KO');
}
async function adminRender(){
 const ts=require('typescript'),vm=require('node:vm'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const source=ts.transpileModule(read('admin/src/components/admin/ConversationPartnerFeedback.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const states=[];let cursor=0,effected=false;const hooks={useState:initial=>{const index=cursor++;if(!(index in states))states[index]=initial;return[states[index],value=>states[index]=typeof value==='function'?value(states[index]):value];},useEffect:fn=>{if(!effected){effected=true;fn();}}};
 const row={booking_id:B,good:['spoke_slowly','waited_for_me','asked_good_questions','made_me_comfortable','shared_new_stories','helped_with_words','helped_with_expressions','kept_conversation_going'],requests:['help_more_with_words','listen_more'],private_admin_note:'ADMIN ONLY',updated_at:'2026-10-08T00:00:00Z'};
 const mod={exports:{}};vm.runInNewContext(source,{exports:mod.exports,module:mod,require:name=>name==='react'?hooks:name==='@/lib/supabase'?{supabase:{rpc:async(name,args)=>{assert.equal(name,'admin_get_conversation_partner_feedback');assert.equal(args.p_booking_id,B);return{data:row};}}}:name==='@/components/ui/button'?{Button:props=>React.createElement('button',props)}:require(name),setTimeout,clearTimeout});
 mod.exports.ConversationPartnerFeedback({bookingId:B});await wait();cursor=0;const html=renderToStaticMarkup(mod.exports.ConversationPartnerFeedback({bookingId:B}));
 for(const copy of ['편하게 이야기할 수 있었어요','새로운 이야기를 들려줬어요','단어를 알려줬어요','표현을 알려줬어요','대화를 잘 이어줬어요','모르는 단어를 더 알려주세요','더 많이 들어주세요','ADMIN ONLY'])assert(html.includes(copy),copy);
 assert(!html.includes('알 수 없는 항목'));console.log('PASS actual Admin component: exact booking, final KO labels, legacy keys and private note');
}
(async()=>{await database();await dom();await adminRender();})().catch(e=>{console.error(e);process.exitCode=1;});
