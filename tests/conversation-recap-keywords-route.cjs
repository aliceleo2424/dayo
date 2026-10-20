// 2026-10-20: picture keywords must pass the /api/conversation-recap input check (they were rejected as invalid_request).
const assert=require('node:assert/strict');
const {createHandler}=require('../api/conversation-recap.js');
const B='ea5289f9-41fe-4b94-9677-bd3b038c87eb',R='b7a7c5e0-1111-4222-8333-444455556666';
function call(body){return new Promise(resolve=>{const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(t){resolve({status:this.statusCode,body:JSON.parse(t)});}};
 createHandler({env:{}})({method:'POST',headers:{authorization:'Bearer a.b.c'},body},res);});}
(async()=>{
 // No Supabase env in this fixture: passing the input check ends at source_unavailable (503), not invalid_request (400).
 let r=await call({action:'partner_illustration_generate',booking_id:B,source_version:'v',request_id:R,keywords:['tok1','tok2']});
 assert.equal(r.status,503,JSON.stringify(r.body));
 r=await call({action:'partner_illustration_generate',booking_id:B,source_version:'v',request_id:R,keywords:['a','b','c']});
 assert.equal(r.status,400,'at most two keywords');
 r=await call({action:'partner_illustration_generate',booking_id:B,keywords:['x'.repeat(801)]});
 assert.equal(r.status,400,'oversized token');
 r=await call({action:'partner_letter_draft',booking_id:B,keywords:['tok']});
 assert.equal(r.status,400,'keywords only for picture generation');
 r=await call({booking_id:B,keywords:['tok']});
 assert.equal(r.status,400,'not on the customer recap');
 console.log('conversation-recap-keywords-route: ok');
})().catch(e=>{console.error(e);process.exit(1);});
