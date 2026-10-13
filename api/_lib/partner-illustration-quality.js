/* Server-only, one bounded Cloudflare inspection per generated image. Decision
 * probabilities are not OCR, a guarantee of correctness, or client approval. */
const crypto=require('node:crypto');
const MODEL='@cf/cloudflare/clef-omni';
const questions=Object.freeze({
 text:{type:'noul',instructions:'Is there ANY visible writing, text, letter, glyph-like lettering or numeral anywhere in this image? Include tiny, faint, malformed, partial, decorative or non-English lettering. Do not require correct spelling or readability.'},
 mark:{type:'noul',instructions:'Is there any logo, signature, watermark, branding, stamp or copyright mark, including faint text?'},
 object:{type:'noul',instructions:'Does the image include a greeting card, invitation, sign, poster, printed label, book cover, menu, packaging or screen that could bear writing?'},
 clear:{type:'noul',instructions:'Can you confidently verify that ALL surfaces of the entire image are blank and unmarked, with NO text, letters, numbers, writing-like glyphs, logos, signatures or watermark? If too small, faint, obscured, uncertain or ambiguous, answer no.'}
});
function failure(code){const e=Error(code);e.code=code;return e;}
function decision(result){
 if(result?.model!=='clef-omni'||!Number.isInteger(result?.usage?.input_tokens)
  ||result.usage.input_tokens<1||result.usage.input_tokens>2000||result.usage.output_tokens!==0)return 'uncertain';
 const values={};for(const key of Object.keys(questions)){
  const answer=result.answers?.[key];
  if(answer?.type!=='noul'||!Number.isFinite(answer.noul)||answer.noul<0||answer.noul>1)return 'uncertain';
  values[key]=answer.noul;
 }
 if(Math.max(values.text,values.mark,values.object)>=0.5)return 'reject';
 // Do not tune these conservative thresholds to make a small fixture set pass.
 if(Math.max(values.text,values.mark,values.object)>0.02||values.clear<0.95)return 'uncertain';
 return 'pass';
}
function createInspector({env,fetchImpl=fetch,manualReview=false}){
 const account=String(env.CLOUDFLARE_ACCOUNT_ID||'').trim(),token=String(env.CLOUDFLARE_API_TOKEN||'').trim();
 if(!/^[a-f0-9]{32}$/.test(account)||!token)return null;
 return async({bytes,contentType,signal})=>{
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>4*1024*1024||contentType!=='image/png')throw failure('quality_check_unavailable');
  let response,json;
  try{
   response=await fetchImpl('https://api.cloudflare.com/client/v4/accounts/'+account+'/ai/run/'+MODEL,{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({model:'clef-omni',state:'Inspect the attached artwork itself. This is an output-quality check; do not infer cleanliness from style or prompt. Check the whole canvas and all small details.',images:['data:image/png;base64,'+bytes.toString('base64')],questions}),
    signal:signal?AbortSignal.any([signal,AbortSignal.timeout(4500)]):AbortSignal.timeout(4500)});
   if(!response.ok)throw failure('quality_check_unavailable');
   json=await response.json();
  }catch(_){throw failure('quality_check_unavailable');}
  const status=json?.success===false?'uncertain':decision(json?.result);
  if(status==='reject')throw failure('quality_rejected');
  if(status!=='pass'){
   const r=json?.result;
   const valid=r?.model==='clef-omni'&&Number.isInteger(r.usage?.input_tokens)&&r.usage.input_tokens>0&&r.usage.input_tokens<=2000&&r.usage.output_tokens===0&&Object.keys(questions).every(k=>r.answers?.[k]?.type==='noul'&&Number.isFinite(r.answers[k].noul)&&r.answers[k].noul>=0&&r.answers[k].noul<=1);
   if(!manualReview||!valid)throw failure('quality_check_unavailable');
  }
  // Existing adapter contract: only a confident no-writing decision returns an
  // empty text field; the model does not invent/transcribe an OCR string.
  return {reviewed:true,manualPending:manualReview,inspection:status,imageHash:crypto.createHash('sha256').update(bytes).digest('hex'),visibleText:'',logoDetected:false,watermarkDetected:false};
 };
}
module.exports={MODEL,questions,decision,createInspector};
