const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const repo=path.join(__dirname,'..');
const Q=require(path.join(repo,'api/_lib/partner-illustration-quality.js'));

const bytes=Buffer.from('decoded image fixture');
const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'mock-only'};
const clean=()=>({model:'clef-omni',answers:Object.fromEntries(['text','mark','object','clear'].map(k=>[k,{type:'noul',noul:k==='clear'?0.99:0.001}])),usage:{input_tokens:1559,output_tokens:0}});
(async()=>{
 assert.equal(Q.createInspector({env:{}}),null);
 let calls=0;const inspector=Q.createInspector({env,fetchImpl:async(url,options)=>{
  calls++;assert(url.endsWith('/ai/run/@cf/cloudflare/clef-omni'));
  assert.equal(options.headers.Authorization,'Bearer mock-only');const input=JSON.parse(options.body);
  assert.equal(input.model,'clef-omni');assert.equal(input.images.length,1);
  assert.equal(input.images[0],'data:image/png;base64,'+bytes.toString('base64'));
  assert(!/booking_id|Jen|Judy|transcript|private Letter|ea5289f9/i.test(options.body));
  return {ok:true,json:async()=>({success:true,result:clean()})};
 }});
 const accepted=await inspector({bytes,contentType:'image/png'});
 assert.equal(accepted.imageHash,crypto.createHash('sha256').update(bytes).digest('hex'));
 assert.equal(accepted.reviewed,true);assert.equal(calls,1);
 for(const key of ['text','mark','object']){const dirty=clean();dirty.answers[key].noul=0.9;assert.equal(Q.decision(dirty),'reject');}
 for(const patch of [r=>{r.answers.clear.noul=0.8;},r=>{r.answers.text.noul=0.03;},r=>{delete r.answers.mark;},r=>{r.answers.text.noul=NaN;},r=>{r.usage.input_tokens=2001;},r=>{r.model='another-model';}]){
  const r=clean();patch(r);assert.equal(Q.decision(r),'uncertain');
 }
 for(const fail of [async()=>{throw Error('private network detail');},async()=>({ok:false,status:429}),async()=>({ok:true,json:async()=>({success:false})})]){
  let n=0;await assert.rejects(Q.createInspector({env,fetchImpl:async(...a)=>{n++;return fail(...a);}})({bytes,contentType:'image/png'}),{code:'quality_check_unavailable'});assert.equal(n,1,'no automatic inspection retries');
 }
 await assert.rejects(inspector({bytes:Buffer.alloc(4*1024*1024+1),contentType:'image/png'}),{code:'quality_check_unavailable'});
 // Recorded real Clef-omni fixture results, not proof of general OCR accuracy.
 const rows=[{"name":"clean-cafe","contaminated":false,"result":{"model":"clef-omni","answers":{"text":{"type":"noul","noul":0.0102},"mark":{"type":"noul","noul":0.0169},"object":{"type":"noul","noul":0.0058},"clear":{"type":"noul","noul":0.7708}},"usage":{"input_tokens":1559,"output_tokens":0}}},{"name":"clean-rabbit","contaminated":false,"result":{"model":"clef-omni","answers":{"text":{"type":"noul","noul":0.0067},"mark":{"type":"noul","noul":0.0108},"object":{"type":"noul","noul":0.0055},"clear":{"type":"noul","noul":0.6887}},"usage":{"input_tokens":1559,"output_tokens":0}}},{"name":"actual-birthday-failure","contaminated":true,"result":{"model":"clef-omni","answers":{"text":{"type":"noul","noul":0.9743},"mark":{"type":"noul","noul":0.0449},"object":{"type":"noul","noul":0.8943},"clear":{"type":"noul","noul":0.0325}},"usage":{"input_tokens":1559,"output_tokens":0}}},{"name":"small-letters","contaminated":true,"result":{"model":"clef-omni","answers":{"text":{"type":"noul","noul":0.768},"mark":{"type":"noul","noul":0.4161},"object":{"type":"noul","noul":0.0353},"clear":{"type":"noul","noul":0.0904}},"usage":{"input_tokens":1559,"output_tokens":0}}},{"name":"tiny-letters","contaminated":true,"result":{"model":"clef-omni","answers":{"text":{"type":"noul","noul":0.4248},"mark":{"type":"noul","noul":0.8149},"object":{"type":"noul","noul":0.0141},"clear":{"type":"noul","noul":0.0679}},"usage":{"input_tokens":1559,"output_tokens":0}}},{"name":"numbers","contaminated":true,"result":{"model":"clef-omni","answers":{"text":{"type":"noul","noul":0.6374},"mark":{"type":"noul","noul":0.1196},"object":{"type":"noul","noul":0.0119},"clear":{"type":"noul","noul":0.068}},"usage":{"input_tokens":1559,"output_tokens":0}}},{"name":"sign","contaminated":true,"result":{"model":"clef-omni","answers":{"text":{"type":"noul","noul":0.9371},"mark":{"type":"noul","noul":0.4326},"object":{"type":"noul","noul":0.1254},"clear":{"type":"noul","noul":0.052}},"usage":{"input_tokens":1559,"output_tokens":0}}},{"name":"watermark","contaminated":true,"result":{"model":"clef-omni","answers":{"text":{"type":"noul","noul":0.7913},"mark":{"type":"noul","noul":0.8472},"object":{"type":"noul","noul":0.0203},"clear":{"type":"noul","noul":0.041}},"usage":{"input_tokens":1559,"output_tokens":0}}},{"name":"low-contrast-number","contaminated":true,"result":{"model":"clef-omni","answers":{"text":{"type":"noul","noul":0.0788},"mark":{"type":"noul","noul":0.0959},"object":{"type":"noul","noul":0.0055},"clear":{"type":"noul","noul":0.0945}},"usage":{"input_tokens":1559,"output_tokens":0}}}];
 assert.equal(rows.length,9);
 assert(rows.filter(r=>r.contaminated).every(r=>Q.decision(r.result)!=='pass'));
 assert(rows.filter(r=>!r.contaminated).every(r=>Q.decision(r.result)==='uncertain'));
 console.log('PASS: inspector authentication/request contract, hash binding, fail-closed parser, bounded input, error/no-retry paths; actual 7/7 contaminated fixtures blocked, 2/2 clean uncertain.');
})().catch(e=>{console.error(e);process.exitCode=1;});
