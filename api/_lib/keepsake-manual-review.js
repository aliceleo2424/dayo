/* Owner-only private review. No provider calls, report writes or service-role reads. */
const crypto=require('node:crypto');
const S=require('./keepsake-safety.js');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
function fail(code){const e=Error(code);e.code=code;return e;}
async function rpc(db,name,args){const r=await db.rpc(name,args);if(r.error)throw fail(r.error.code==='42501'?'access_denied':'review_unavailable');return r.data;}
function descriptor(asset,bookingId){
 if(!asset||asset.bucket!==S.BUCKET||typeof asset.object_path!=='string'
 ||!new RegExp('^'+bookingId+'/[a-f0-9-]{36}\\.png$').test(asset.object_path)
 ||!SHA.test(asset.image_sha256||'')||typeof asset.storage_version!=='string'||!asset.storage_version)return false;
 return true;
}
async function readBytes(db,asset,bookingId){
 if(!descriptor(asset,bookingId))throw fail('invalid_image_binding');
 const r=await db.storage.from(S.BUCKET).download(asset.object_path);
 if(r.error||!r.data||typeof r.data.arrayBuffer!=='function')throw fail('image_access_unavailable');
 const bytes=Buffer.from(await r.data.arrayBuffer());
 if(!bytes.length||bytes.length>3*1024*1024||crypto.createHash('sha256').update(bytes).digest('hex')!==asset.image_sha256)throw fail('image_version_changed');
 const m=await require('sharp')(bytes,{limitInputPixels:1024*1024}).metadata();
 if(m.format!=='png'||m.width!==1024||m.height!==1024||(m.pages||1)!==1)throw fail('invalid_image');
 return bytes;
}
const args=input=>({p_action:input.action,p_booking_id:input.booking_id||null,p_attempt_id:input.attempt_id||null,
 p_sha256:input.image_sha256||null,p_object_path:input.object_path||null,p_storage_version:input.storage_version||null,p_slot:input.slot||null});
async function handle({db,input}){
 if(!input||Array.isArray(input)||Object.keys(input).some(k=>!['action','booking_id','attempt_id','image_sha256','object_path','storage_version','slot'].includes(k)))throw fail('invalid_request');
 if(!['read','list','preview','approve','reject','revoke','enroll','disable'].includes(input.action))throw fail('invalid_request');
 if(input.booking_id!=null&&!UUID.test(input.booking_id)||input.attempt_id!=null&&!UUID.test(input.attempt_id))throw fail('invalid_request');
 if(input.action==='read'){
  if(!UUID.test(input.booking_id||'')||Object.keys(input).some(k=>!['action','booking_id'].includes(k)))throw fail('invalid_request');
  const asset=await rpc(db,'dayo_keepsake_asset',{p_booking_id:input.booking_id});
  if(!asset)return {image:null,managed:await rpc(db,'dayo_keepsake_beta_access',{p_booking_id:input.booking_id})===true};
  if(asset.approved!==true)throw fail('image_access_unavailable');
  const bytes=await readBytes(db,asset,input.booking_id);
  return {managed:true,image:{booking_id:input.booking_id,asset,approved:true,data:bytes.toString('base64'),content_type:'image/png'}};
 }
 if(['approve','reject','revoke'].includes(input.action)){
  if(!UUID.test(input.booking_id||'')||!UUID.test(input.attempt_id||''))throw fail('invalid_request');
  const asset=await rpc(db,'dayo_keepsake_review',{...args(input),p_action:'preview'});
  if(!descriptor(asset,input.booking_id)||asset.image_sha256!==input.image_sha256||asset.object_path!==input.object_path||asset.storage_version!==input.storage_version)throw fail('image_version_changed');
  // Re-read the exact immutable object on the server immediately before a decision.
  await readBytes(db,asset,input.booking_id);
  return rpc(db,'dayo_keepsake_review',args(input));
 }
 const result=await rpc(db,'dayo_keepsake_review',args(input));
 if(input.action==='preview'){
  const bytes=await readBytes(db,result,input.booking_id);
  return {asset:result,booking_id:input.booking_id,attempt_id:input.attempt_id,data:bytes.toString('base64'),content_type:'image/png'};
 }
 return result;
}
module.exports={handle,readBytes,descriptor};
