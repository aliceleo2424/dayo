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
 const actor=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 const save=(g,r,n='private QA note')=>db.query('select save_conversation_partner_feedback($1,$2,$3,$4) f',[B,g,r,n]);
 await actor(U);await assert.rejects(save(['spoke_slowly'],[]),/session_not_ended/);
 await db.exec('reset role');await db.query("insert into session_events(id,booking_id,actor_user_id,event_type,payload) values(gen_random_uuid(),$1,$2,'session_ended','{\"role\":\"learner\",\"reason\":\"personal\"}')",[B,U]);
 const before=(await db.query('select * from bookings')).rows;
 await actor(U);assert.equal((await db.query('select get_my_conversation_partner_feedback($1) f',[B])).rows[0].f,null);
 let row=(await save(['spoke_slowly','waited_for_me','spoke_slowly'],['speak_more_slowly','wait_more'])).rows[0].f;
 assert.equal(row.good.length,2);assert.equal(row.requests.length,2);const initial=row;
 row=(await save(['asked_good_questions'],[],null)).rows[0].f;assert.equal(row.id,initial.id);assert.equal(row.created_at,initial.created_at);
 await save([],['ask_more_questions']);await assert.rejects(save(['invalid'],[]),/invalid_key/);await assert.rejects(save([],[],null),/invalid_content/);await assert.rejects(save([null],[]),/invalid_key/);await assert.rejects(save([],[], 'x'.repeat(1001)),/invalid_content/);
 await save(['spoke_slowly','waited_for_me','asked_good_questions','made_me_comfortable','helped_with_words','helped_with_expressions','kept_conversation_going'],['speak_more_slowly','speak_more_quickly','wait_more','correct_more','speak_more','ask_more_questions','help_more_with_words','listen_more'],'PRIVATE');
 assert.equal((await db.query('select get_my_conversation_partner_feedback($1) f',[B])).rows[0].f.private_admin_note,'PRIVATE');
 await assert.rejects(db.query('select * from conversation_partner_feedback'),/permission denied/);
 await actor(X);await assert.rejects(save(['spoke_slowly'],[]),/not_allowed/);await assert.rejects(db.query('select get_my_conversation_partner_feedback($1)',[B]),/not_allowed/);assert.equal((await db.query('select * from list_my_partner_conversation_feedback()')).rows.length,0);
 await actor(P);let partner=(await db.query('select * from list_my_partner_conversation_feedback()')).rows;assert.equal(partner.length,1);assert(!('private_admin_note' in partner[0]));assert(!('user_id' in partner[0]));assert.equal(partner[0].booking_id,B);assert.equal(partner[0].good.length,7);assert.equal(partner[0].requests.length,8);
 await assert.rejects(save(['spoke_slowly'],[]),/not_allowed/);await assert.rejects(db.query('select get_my_conversation_partner_feedback($1)',[B]),/not_allowed/);await assert.rejects(db.query('select admin_get_conversation_partner_feedback($1)',[B]),/admin_required/);
 await actor(A);const admin=(await db.query('select admin_get_conversation_partner_feedback($1) f',[B])).rows[0].f;assert.equal(admin.private_admin_note,'PRIVATE');assert.equal(admin.good.length,7);assert.equal(admin.requests.length,8);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select list_my_partner_conversation_feedback()'),/permission denied/);await assert.rejects(db.query('select * from conversation_partner_feedback'),/permission denied/);
 await db.exec('reset role');assert.deepEqual((await db.query('select * from bookings')).rows,before);assert.equal((await db.query('select count(*)::int n from conversation_partner_feedback')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from session_events')).rows[0].n,1);
 console.log('PASS SQL: exact ownership, ended-only, 7/8 keys, dedupe/upsert, good/request-only, private isolation, admin, anon, no settlement side effects');
 }finally{await db.close();}}
const wait=()=>new Promise(r=>setTimeout(r,20));
async function dom(){for(const lang of ['KO','EN'])for(const reason of ['normal','personal']){
 const d=new JSDOM('<div id="quiz-content-box"><div>EXISTING RECAP</div></div>',{url:'https://fixture.invalid/room?bookingId='+B,runScripts:'outside-only'}),w=d.window;try{
 Object.defineProperty(w.document,'readyState',{value:'complete'});w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.DayORoomAccess={allowed:true,role:'user',bookingId:B};w.eval(read('public/i18n.js'));w.DayOI18n.setLang(lang);
 let fail=false,calls=[];w.supabaseClient={rpc:async(n,a)=>{calls.push([n,a]);return n.startsWith('get_')?{data:null}:fail?{error:{message:'RAW SECRET'}}:{data:{booking_id:B}};}};
 w.eval(read('public/conversation-partner-feedback.js'));await wait();assert.equal(w.document.querySelectorAll('.cpf-entry').length,1);
 w.document.dispatchEvent(new w.CustomEvent('dayo:session-ended',{detail:{reason,finalized:true}}));await wait();assert(w.document.querySelector('dialog[open]'));
 const inputs=w.document.querySelectorAll('input');assert.equal(inputs.length,10);inputs[0].checked=true;inputs[1].checked=true;inputs[4].checked=true;inputs[5].checked=true;
 fail=true;w.document.querySelector('.cpf-primary').click();await wait();assert(w.document.querySelector('.cpf-status').textContent.includes(lang==='KO'?'저장하지':'couldn’t save'));assert(!w.document.body.textContent.includes('RAW SECRET'));assert(w.document.body.textContent.includes('EXISTING RECAP'));
 fail=false;w.document.querySelector('.cpf-primary').click();await wait();assert(!w.document.querySelector('dialog'));assert.equal(calls.at(-1)[1].p_good.length,2);assert.equal(calls.at(-1)[1].p_requests.length,2);
 w.document.dispatchEvent(new w.CustomEvent('dayo:session-ended',{detail:{reason,finalized:true}}));assert(!w.document.querySelector('dialog'),'same-page duplicate end');
 w.document.querySelector('.cpf-entry').click();await wait();w.document.querySelector('.cpf-actions .cpf-secondary').click();await wait();assert(!w.document.querySelector('dialog'),'skip does not save or block recap');
 w.document.getElementById('quiz-content-box').innerHTML='RELOADED RECAP';await wait();assert.equal(w.document.querySelectorAll('.cpf-entry').length,1);
 }finally{w.dispatchEvent(new w.Event("pagehide"));w.close();}}
 // New 4+6 selections save, while an existing response keeps hidden legacy values.
 for(const legacy of [false,true]){const d=new JSDOM('<div id="quiz-content-box">RECAP</div>',{url:'https://fixture.invalid/room',runScripts:'outside-only'}),w=d.window;try{
 Object.defineProperty(w.document,'readyState',{value:'complete'});w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.DayORoomAccess={allowed:true,role:'user',bookingId:B};w.eval(read('public/i18n.js'));
 const old={good:['helped_with_words','helped_with_expressions','kept_conversation_going'],requests:['help_more_with_words','listen_more'],private_admin_note:'PRIVATE'};let payload;
 w.supabaseClient={rpc:async(n,a)=>n.startsWith('get_')?{data:legacy?old:null}:(payload=a,{data:{booking_id:B}})};w.eval(read('public/conversation-partner-feedback.js'));w.document.querySelector('.cpf-entry').click();await wait();
 assert.equal(w.document.querySelectorAll('input[name="good"]').length,4);assert.equal(w.document.querySelectorAll('input[name="requests"]').length,6);for(const k of [...old.good,...old.requests])assert(!w.document.querySelector('input[value="'+k+'"]'));
 w.document.querySelectorAll('input').forEach(n=>n.checked=true);w.document.querySelector('.cpf-primary').click();await wait();assert.equal(payload.p_booking_id,B);assert.equal(payload.p_good.length,legacy?7:4);assert.equal(payload.p_requests.length,legacy?8:6);assert.equal(payload.p_private_admin_note,legacy?'PRIVATE':null);assert(!w.document.querySelector('dialog'));
 }finally{w.dispatchEvent(new w.Event('pagehide'));w.close();}}
 // Read failure is not an empty draft, and skipping still exposes the existing recap.
 {const d=new JSDOM('<div id="quiz-content-box">EXISTING RECAP</div>',{url:'https://fixture.invalid/room',runScripts:'outside-only'}),w=d.window;try{Object.defineProperty(w.document,'readyState',{value:'complete'});w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.DayORoomAccess={allowed:true,role:'user',bookingId:B};w.eval(read('public/i18n.js'));w.supabaseClient={rpc:async()=>({error:{message:'network'}})};w.eval(read('public/conversation-partner-feedback.js'));w.document.dispatchEvent(new w.CustomEvent('dayo:session-ended',{detail:{reason:'normal',finalized:true}}));await wait();assert(w.document.querySelector('.cpf-primary').disabled);w.document.querySelector('.cpf-actions .cpf-secondary').click();assert(!w.document.querySelector('dialog'));assert(w.document.body.textContent.includes('EXISTING RECAP'));}finally{w.dispatchEvent(new w.Event('pagehide'));w.close();}}
 // Partner UI uses constructive response only and EN unless explicit Korean UI.
 for(const lang of ['en','ko']){const d=new JSDOM('<html lang="'+lang+'"><body><section class="dashboard-card"><ul class="pd-past-list"></ul></section></body></html>',{url:'https://fixture.invalid/partner',runScripts:'outside-only'}),w=d.window;try{Object.defineProperty(w.document,'readyState',{value:'complete'});w.eval(read('public/i18n.js'));w.document.documentElement.lang=lang;w.supabaseClient={rpc:async(n)=>{assert.equal(n,'list_my_partner_conversation_feedback');return {data:[{booking_id:B,scheduled_at:new Date().toISOString(),good:['spoke_slowly','helped_with_words','helped_with_expressions','kept_conversation_going'],requests:['wait_more','help_more_with_words','listen_more']}]};}};w.eval(read('public/conversation-partner-feedback.js'));await wait();assert.equal(w.document.querySelectorAll('#cpf-partner').length,1);assert(w.document.querySelector('#cpf-partner').textContent.includes(lang==='ko'?'천천히':'comfortable pace'));assert.equal(w.document.querySelectorAll('#cpf-partner li').length,7);assert(!w.document.querySelector('#cpf-partner').textContent.includes('PRIVATE'));}finally{w.dispatchEvent(new w.Event("pagehide"));w.close();}}
 console.log('PASS DOM: manual/timer optional entry, KO/EN, save error/input retry/skip, recap rerender, duplicate guard, new 4+6, legacy round-trip/Partner EN/KO');
}
(async()=>{await database();await dom();})().catch(e=>{console.error(e);process.exitCode=1;});
