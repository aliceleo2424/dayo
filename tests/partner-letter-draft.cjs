// AI Letter draft for Partner review (owner decision 2026-10-20). Mocked Supabase REST and Gemini only.
const assert=require('node:assert/strict');
const D=require('../api/_lib/partner-letter-draft.js');
const B='ea5289f9-41fe-4b94-9677-bd3b038c87eb',U='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222',X='33333333-3333-4333-8333-333333333333';
const userSaid=['I met a friend for dinner and we sat outside because inside was too crowded.','We had tanghulu after dinner, it was so sweet and crunchy.','I broke a plate while doing the dishes and my mom was really mad.','So I bought her mochi to make her happy again.'];
const partnerSaid='My hometown is Toronto and I surf every summer.';
const goodBody='It was so lovely to hear about your dinner with a friend and how you chose to sit outside because the place was too crowded. I laughed at the story of the slippery plate, and buying your mom mochi to make her happy again was such a sweet idea. The tanghulu sounded perfect after dinner. Next time I would love to hear which dessert your mom liked the most, and whether you found a new favorite spot to eat outside.';
function fixture({saved=[],table=true,booking={}}={}){
 const calls={reads:[],inserts:[]};
 const read=async(route,h)=>{calls.reads.push(route);
  if(route.includes('bookings?'))return [{id:B,learner_id:U,partner_user_id:P,status:'completed',partner_name:'Emma',...booking}];
  if(route.includes('profiles?')){assert(route.includes(U),'customer conversation name only');return [{id:U,nickname:'Alice'}];}
  if(route.includes('session_logs?')){assert(route.includes('participant_role=eq.learner')&&h&&h.apikey,'only the User speech, service read');return [{id:'log',booking_id:B,participant_id:U,participant_role:'learner',transcript:[...userSaid.map((text,i)=>({id:'s'+i,text,speaker:'learner',timestamp:'2026-10-17T12:0'+i+':00Z'})),{id:'p0',text:partnerSaid,speaker:'partner',timestamp:'2026-10-17T12:05:00Z'}]}];}
  if(route.includes('booking_chat_messages?')){assert(route.includes('sender_role=eq.learner'));return [{id:'m1',booking_id:B,sender_id:U,sender_role:'learner',text:'Salt bread',created_at:'2026-10-17T12:09:00Z'},{id:'m2',booking_id:B,sender_id:P,sender_role:'partner',text:partnerSaid,created_at:'2026-10-17T12:10:00Z'}];}
  throw Error('unexpected read '+route);};
 const fetchImpl=async(url,opts={})=>{
  if(url.includes('/rest/v1/partner_letter_drafts')){
   if(!table)return {ok:false,status:404,json:async()=>({})};
   if(opts.method==='POST'){const row=JSON.parse(opts.body);calls.inserts.push(row);return {ok:true,status:201,json:async()=>({})};}
   return {ok:true,status:200,json:async()=>saved};}
  throw Error('unexpected fetch '+url);};
 return {calls,args:{read,user:{id:P},env:{SUPABASE_SERVICE_ROLE_KEY:'fixture-only',NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co'},fetchImpl}};
}
(async()=>{
 // 1. Letter format is fixed by the server; only verified User lines reach the model.
 let seen=null;const f=fixture();
 let r=await D.handle({...f.args,input:{booking_id:B,action:'partner_letter_draft'},draftGenerator:async d=>{seen=d;return {body:goodBody,facts:[{text:'Dinner outside with a friend',evidence:['u1']},{text:'Mochi for mom',evidence:['u3','u4']},{text:'made up',evidence:['u99']}]};}});
 assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.status,'draft_for_review');
 assert(r.body.letter.startsWith('Dear Alice,\n\n')&&r.body.letter.endsWith('\n\n— Emma'),'Dear [conversation name] / — [Partner name]');
 assert(Array.from(r.body.letter).length>=400,'draft clears the 400-character Letter minimum');
 const text=seen.source.map(l=>l.text).join('\n');
 assert(!text.includes(partnerSaid),'Partner speech/chat never reaches the model');
 assert(text.includes('Salt bread')&&seen.source.find(l=>l.text==='Salt bread').medium==='chat','User chat is included and labelled');
 assert.deepEqual(seen.names,{user:'Alice',partner:'Emma'});
 assert.equal(r.body.facts.length,2,'facts citing unknown lines are dropped');
 assert.equal(r.body.facts[1].quotes[1].text,userSaid[3],'evidence shows the exact User line');
 assert.equal(f.calls.inserts.length,1);assert.equal(f.calls.inserts[0].attempt,1);assert.equal(f.calls.inserts[0].partner_user_id,P);assert.equal(r.body.stored,true);
 // 2. Third-person summaries ("Alice talked about...") and missing evidence are refused; the Partner writes it themselves.
 for(const bad of [{body:'Alice talked about her day today and she met a friend for dinner earlier today. '+goodBody,facts:[{text:'x',evidence:['u1']}]},{body:goodBody,facts:[{text:'x',evidence:['u42']}]},{body:'Thanks for today, you were great!',facts:[{text:'x',evidence:['u1']}]},{body:goodBody+' Your English pronunciation is improving.',facts:[{text:'x',evidence:['u1']}]}]){
  const g=fixture();r=await D.handle({...g.args,input:{booking_id:B,action:'partner_letter_draft'},draftGenerator:async()=>bad});
  assert.equal(r.status,502);assert.equal(r.body.error,'draft_unavailable');assert.equal(g.calls.inserts.length,0);
 }
 // 3. A provider failure never throws past the handler.
 r=await D.handle({...fixture().args,input:{booking_id:B,action:'partner_letter_draft'},draftGenerator:async()=>{throw Error('boom');}});
 assert.equal(r.status,502);
 // 3b. A busy provider (503) gets one quiet second try.
 let tries=0;r=await D.handle({...fixture().args,input:{booking_id:B,action:'partner_letter_draft'},draftGenerator:async()=>{if(++tries===1){const e=Error('busy');e.code='provider_http_503';throw e;}return {body:goodBody,facts:[{text:'x',evidence:['u1']}]};}});
 assert.equal(r.status,200);assert.equal(tries,2);
 tries=0;r=await D.handle({...fixture().args,input:{booking_id:B,action:'partner_letter_draft'},draftGenerator:async()=>{tries++;const e=Error('busy');e.code='provider_http_503';throw e;}});
 assert.equal(r.status,502);assert.equal(tries,2,'never more than two model calls per request');
 // 4. Re-opening returns the saved draft without a new model call; the rewrite is limited to once.
 const saved=[{attempt:1,draft_text:'Dear Alice,\n\nSaved\n\n— Emma',evidence:[{text:'a',quotes:[]}]}];
 r=await D.handle({...fixture({saved}).args,input:{booking_id:B,action:'partner_letter_draft'},draftGenerator:async()=>{throw Error('must not generate');}});
 assert.equal(r.body.status,'saved');assert.equal(r.body.attempts_left,1);
 const g2=fixture({saved});r=await D.handle({...g2.args,input:{booking_id:B,action:'partner_letter_draft_retry'},draftGenerator:async()=>({body:goodBody,facts:[{text:'x',evidence:['u2']}]})});
 assert.equal(r.body.status,'draft_for_review');assert.equal(r.body.attempt,2);assert.equal(g2.calls.inserts[0].attempt,2);assert.equal(r.body.attempts_left,0);
 r=await D.handle({...fixture({saved:[{...saved[0],attempt:2}]}).args,input:{booking_id:B,action:'partner_letter_draft_retry'},draftGenerator:async()=>{throw Error('must not generate');}});
 assert.equal(r.body.status,'attempt_limit');
 // 5. Migration 123 not applied: the draft still works, it is just not stored.
 const g3=fixture({table:false});r=await D.handle({...g3.args,input:{booking_id:B,action:'partner_letter_draft'},draftGenerator:async()=>({body:goodBody,facts:[{text:'x',evidence:['u1']}]})});
 assert.equal(r.status,200);assert.equal(r.body.stored,false);
 // 6. Only the booking's own Partner; unsafe names fall back.
 r=await D.handle({...fixture().args,user:{id:X},input:{booking_id:B,action:'partner_letter_draft'},draftGenerator:async()=>({body:goodBody,facts:[]})});
 assert.equal(r.status,403);
 r=await D.handle({...fixture({booking:{status:'cancelled'}}).args,input:{booking_id:B,action:'partner_letter_draft'}});assert.equal(r.status,403);
 r=await D.handle({...fixture().args,input:{booking_id:B,action:'partner_letter_draft',topic_id:'x'}});assert.equal(r.status,400);
 assert.equal(D.cleanName('alice@example.com','friend'),'friend');assert.equal(D.cleanName('지민','friend'),'지민');
 // 7. No AI key: honest "unavailable", Letter stays writable.
 r=await D.handle({...fixture().args,input:{booking_id:B,action:'partner_letter_draft'}});assert.equal(r.status,503);
 // 8. Prompt contract.
 assert(/directly to the user as "you"/.test(D.PROMPT)&&/ONLY what the user actually said/.test(D.PROMPT)&&/never claim the partner said/.test(D.PROMPT));
 console.log('partner-letter-draft: ok');
})().catch(e=>{console.error(e);process.exit(1);});
