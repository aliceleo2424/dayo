// Learner-said keyword keepsakes (owner decision 2026-10-14). Mocked Cloudflare text/image, auth, quota and storage only.
const crypto=require('node:crypto');
const assert=require('node:assert/strict'),sharp=require('sharp');
const K=require('../api/_lib/keepsake-keywords.js'),I=require('../api/_lib/partner-illustration-cloudflare.js');
const B='ea5289f9-41fe-4b94-9677-bd3b038c87eb',U='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222';
const said=['오늘 에버랜드 갔다가 회전목마 타고 집에 와서 새 잠옷 입고 게임하다가 파란 이불 덮고 잤다.','난 대학생이다. 교육학과다. 최근 빨간 모자를 샀다.','우리 집은 2층집. 와인 좋아해. 내 번호는 010-1234-5678','제주도에서 비를 맞다가 길을 잃었는데 우연히 작은 서점을 발견했어요.'];
const partnerSaid='My sister lives in Busan and I love surfing.';
function fixture(values=said,partnerValues=[partnerSaid]){return {user:{id:P},env:{SUPABASE_SERVICE_ROLE_KEY:'fixture-only',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'mock-token'},read:async route=>{
 if(route.includes('bookings?'))return [{id:B,learner_id:U,partner_user_id:P,status:'completed',language:'ko',is_test_session:false}];
 if(route.includes('profiles?'))return [{id:P,role:'partner'}];
 if(route.includes('session_logs?')&&route.includes('participant_role=eq.partner'))return [{id:'plog',booking_id:B,participant_id:P,participant_role:'partner',transcript:partnerValues.map((text,i)=>({id:'p'+i,text,speaker:'partner',timestamp:'2026-10-14T09:47:00Z'}))}];
 if(route.includes('session_logs?')){assert(route.includes('participant_role=eq.learner'),'learner speech first');return [{id:'log',booking_id:B,participant_id:U,participant_role:'learner',transcript:values.map((text,i)=>({id:'s'+i,text,speaker:'learner',timestamp:'2026-10-14T09:46:00Z'}))}];}
 if(route.includes('booking_chat_messages?')){assert(route.includes('sender_role=eq.learner'),'learner chat only');return [{id:'m1',booking_id:B,sender_id:P,sender_role:'partner',text:partnerSaid,created_at:'2026-10-14T09:47:00Z'}];}
 throw Error('unexpected read '+route);}};}
const model={keywords:[
 {source:'에버랜드',label:'에버랜드',visual:'an amusement park with soft pastel rides'},
 {source:'회전목마',label:'회전목마',label_en:'carousel',visual:'a carousel with painted horses'},
 {source:'파란 이불',label:'파란 이불',visual:'a soft blue blanket on a bed'},
 {source:'빨간 모자',label:'빨간 모자',visual:'a red hat on a wooden hook'},
 {source:'2층집',label:'이층집',visual:'a cozy two-story house'},
 {source:'와인',label:'와인',visual:'a glass of red wine'},
 {source:'대학생',label:'대학생',visual:'a university student studying'},          // person -> dropped
 {source:'010-1234-5678',label:'번호',visual:'a phone'},                          // contact -> dropped
 {source:'surfing',label:'서핑',visual:'a surfboard on the beach'},               // Partner said it -> dropped
 {source:'놀이공원 티켓',label:'티켓',visual:'a ticket'},                           // not said -> dropped
 {source:'잠옷',label:'잠옷',visual:'Pajamas with the word SLEEP printed'},       // writing -> dropped
 {source:'게임',label:'게임',visual:'a game controller on a sofa'},
 {source:'작은 서점',label:'작은 서점',label_en:'small bookshop',visual:'a small bookshop in a rainy island alley with warm light glowing from the window'}
]};
(async()=>{
 let textCalls=0,sentText='';
 const textFetch=async(url,opts)=>{textCalls++;assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+'a'.repeat(32)+'/ai/run/'+K.MODEL);const body=JSON.parse(opts.body);sentText=body.messages[1].content;return {ok:true,json:async()=>({success:true,result:{response:JSON.stringify(model)}})};};
 const f=fixture();
 const found=await K.choices({...f,input:{booking_id:B},fetchImpl:textFetch});
 assert.equal(textCalls,1);
 assert(!sentText.includes('010-1234-5678'),'contact details are masked before the text model');
 assert(!sentText.includes(partnerSaid)&&!sentText.includes(B)&&!sentText.includes(U),'only learner text, no ids');
 const labels=found.choices.map(c=>c.label);
 assert.deepEqual(labels,['에버랜드','회전목마','파란 이불','빨간 모자','이층집','와인','게임','작은 서점']);
 const byLabel=Object.fromEntries(found.choices.map(c=>[c.label,c]));
 assert.equal(byLabel['회전목마'].label_en,'carousel','English chip text for English-mode Partners');
 assert.equal(byLabel['작은 서점'].label_en,'small bookshop');
 assert.equal(byLabel['와인'].label_en,'와인','missing English label falls back to the learner\'s words');
 assert(found.choices.every(c=>/^[a-f0-9]{16}$/.test(c.id)&&typeof c.token==='string'&&!c.token.includes('fixture-only')));
 // Generation: only server-signed keywords for the same booking/source reach the image prompt.
 const png=await sharp({create:{width:1024,height:1024,channels:3,background:'#fffbf4'}}).png().toBuffer();let prompt='';
 const imageFetch=async(url,opts)=>{assert(url.endsWith('/ai/run/'+I.MODEL));prompt=opts.body.get('prompt');return {ok:true,json:async()=>({success:true,result:{image:png.toString('base64')}})};};
 const reserves=[];const quota={reserve:async d=>{reserves.push(d);assert.equal(d.maxAttempts,2);assert.equal(d.sourceVersion,found.version);return {plan:'workers_free',allowed:true,attempt:1,token:'reservation'};}};
 const storage={put:async()=>({url:'https://storage.fixture.invalid/x.png',durable:true,firstParty:true})};
 const qualityCheck=async({bytes})=>({reviewed:true,imageHash:crypto.createHash('sha256').update(bytes).digest('hex'),visibleText:'',logoDetected:false,watermarkDetected:false});
 const base={...f,enabled:true,testOnly:false,quota,storage,qualityCheck,fetchImpl:imageFetch};
 const pick=(tokens,extra)=>I.handle({...base,input:{action:'partner_illustration_generate',booking_id:B,source_version:found.version,keywords:tokens,...extra}});
 const t=Object.fromEntries(found.choices.map(c=>[c.label,c.token]));
 let r=await pick([t['회전목마'],t['빨간 모자']]);
 assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.status,'ready');
 assert(prompt.includes('a carousel with painted horses')&&prompt.includes('a red hat on a wooden hook'),'both picked keywords are drawn');
 assert(/No people|no text|No words/i.test(prompt),'no-text style instruction retained');
 assert(!prompt.includes('회전목마')&&!prompt.includes(said[0]),'raw learner sentences never reach the image model');
 r=await pick([t['와인']]);assert.equal(r.status,200);assert(prompt.includes('a glass of red wine'));
 r=await pick([t['작은 서점']]);assert.equal(r.status,200);assert(prompt.includes('a small bookshop in a rainy island alley with warm light'),'the concrete moment, not a generic symbol');
 // Rejections: more than two, duplicates, tampering, another booking, stale saved source.
 assert.equal((await pick([t['와인'],t['게임'],t['이층집']])).body.error,'invalid_keyword');
 assert.equal((await pick([t['와인'],t['와인']])).body.error,'invalid_keyword');
 const [body,mac]=t['와인'].split('.'),forged=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(body,'base64url')),vis:'a portrait of a woman'})).toString('base64url')+'.'+mac;
 assert.equal((await pick([forged])).body.error,'invalid_keyword');
 const otherBooking=K.sign(f.env,{b:'33333333-3333-4333-8333-333333333333',v:found.version,l:'와인',vis:'a glass of red wine'});
 assert.equal((await pick([otherBooking])).body.error,'invalid_keyword');
 const unsafe=K.sign(f.env,{b:B,v:found.version,l:'와인',vis:'a portrait of a woman'});
 assert.equal((await pick([unsafe])).body.error,'invalid_keyword');
 assert.equal((await pick([t['와인']],{source_version:'stale'})).status,409);
 assert.equal((await I.handle({...base,user:{id:U},input:{action:'partner_illustration_generate',booking_id:B,source_version:found.version,keywords:[t['와인']]}})).status,403);
 assert.equal(reserves.length,3,'rejected picks never reserve an attempt');
 // Choices endpoint: keywords first; fixed motifs only when the text model fails.
 const ok=await I.choices({...f,input:{booking_id:B},fetchImpl:textFetch});
 assert.equal(ok.body.mode,'keywords');assert.equal(ok.body.max_pick,2);assert.equal(ok.body.choices.length,8);
 const down=await I.choices({...f,input:{booking_id:B},fetchImpl:async()=>({ok:false,status:500,json:async()=>({})})});
 assert.equal(down.status,200);assert.notEqual(down.body.mode,'keywords');
 assert.equal((await K.choices({...fixture(['   '],[]),input:{booking_id:B},fetchImpl:textFetch})).choices.length,0);
 // Partner fallback: learner said nothing drawable -> the partner's own saved speech is used instead.
 const calls=[];const echo=async(url,opts)=>{const t=JSON.parse(opts.body).messages[1].content;calls.push(t);return {ok:true,json:async()=>({success:true,result:{response:JSON.stringify({keywords:t.includes('surfing')?[{source:'surfing',label:'surfing',label_en:'surfing',visual:'A surfboard on a quiet beach.'}]:[]})}})};};
 const fb=await K.choices({...fixture(['음 네 맞아요']),input:{booking_id:B},fetchImpl:echo});
 assert.equal(calls.length,2,'learner first, then partner');assert(!calls[0].includes('surfing')&&calls[1].includes('surfing'));
 assert.equal(fb.from,'partner');assert.deepEqual(fb.choices.map(c=>c.label),['surfing']);
 const fbImg=await I.choices({...fixture(['음 네 맞아요']),input:{booking_id:B},fetchImpl:echo});assert.equal(fbImg.body.keyword_source,'partner');
 const none=await I.choices({...fixture(['음 네 맞아요'],[]),input:{booking_id:B},fetchImpl:echo});assert.equal(none.body.keyword_status,'no_valid_keywords:learner_rows_1:partner_rows_0');
 const http=await I.choices({...f,input:{booking_id:B},fetchImpl:async()=>({ok:false,status:403,json:async()=>({})})});assert.equal(http.body.keyword_status,'provider_http_403');
 assert.equal(K.validate([{source:'2층집.',label:'이층집.',visual:'A cozy two-story house at dusk.'}],[{text:'우리 집은 2층집'}])[0].visual,'a cozy two-story house at dusk','trailing period no longer drops a keyword');
 console.log('PASS (partner fallback, keyword_status codes, punctuation-tolerant);  learner-said keywords (Everland example) -> 7 drawable choices; Partner speech, people, contact, unsaid and writing filtered; contact masked before text model; 1-2 signed keywords -> one prompt without raw sentences; >2/duplicate/forged/other-booking/unsafe/stale/non-Partner rejected before quota; fixed-motif fallback. Mocked providers only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
