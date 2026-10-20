// Owner report 2026-10-20: words said late in a long session (mochi, tanghulu) must reach the keyword model,
// and a reply cut off at the token limit keeps its complete keywords instead of falling back to a generic theme.
const assert=require('node:assert/strict');
const K=require('../api/_lib/keepsake-keywords.js');
const B='ea5289f9-41fe-4b94-9677-bd3b038c87eb',U='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222';
const early=Array.from({length:150},(_,i)=>'Today I talked about my day and the weather was nice number '+'abcdefghij'[i%10]+'.');
const said=[...early,'After dinner we had tanghulu and it was so crunchy.','I bought my mom mochi to make her happy again.'];
const read=async route=>{
 if(route.includes('bookings?'))return [{id:B,learner_id:U,partner_user_id:P,status:'completed'}];
 if(route.includes('session_logs?')&&route.includes('participant_role=eq.partner'))return [];
 if(route.includes('session_logs?'))return [{id:'log',booking_id:B,participant_id:U,participant_role:'learner',transcript:said.map((text,i)=>({id:'s'+i,text,speaker:'learner',timestamp:'2026-10-17T12:00:00Z'}))}];
 if(route.includes('booking_chat_messages?'))return [];
 throw Error('unexpected '+route);};
const env={SUPABASE_SERVICE_ROLE_KEY:'fixture-only',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'mock-token'};
(async()=>{
 assert(said.join('\n').length>6000,'fixture is longer than the old 6,000-character cut');
 let sent='',maxTokens=0;
 // Truncated reply: the third object is cut mid-way.
 const cut='{"keywords":[{"source":"tanghulu","label":"tanghulu","label_en":"tanghulu","visual":"a skewer of glossy candied fruit"},{"source":"mochi","label":"mochi","label_en":"mochi","visual":"a small plate of soft white mochi"},{"source":"wea';
 const fetchImpl=async(url,opts)=>{const body=JSON.parse(opts.body);sent=body.messages[1].content;maxTokens=body.max_tokens;return {ok:true,json:async()=>({success:true,result:{response:cut}})};};
 const found=await K.choices({input:{booking_id:B},read,user:{id:P},env,fetchImpl});
 assert(sent.includes('mochi')&&sent.includes('tanghulu'),'late words reach the keyword model');
 assert(maxTokens>=1200,'room for a full keyword answer');
 assert.deepEqual(found.choices.map(c=>c.label),['tanghulu','mochi'],'complete keywords survive a cut-off reply');
 assert.equal(found.from,'learner');
 console.log('keepsake-keywords-long-session: ok');
})().catch(e=>{console.error(e);process.exit(1);});
