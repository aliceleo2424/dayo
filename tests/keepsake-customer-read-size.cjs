// 2026-10-20: customer read returns a small WebP (original PNG still SHA-checked) and is fetched once per booking.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path'),sharp=require('sharp');
const repo=path.join(__dirname,'..'),R=require(path.join(repo,'api/_lib/keepsake-manual-review.js'));
global.atob=global.atob||(s=>Buffer.from(s,'base64').toString('binary'));
let blobs=0;URL.createObjectURL=()=>'blob:fixture-'+(++blobs);URL.revokeObjectURL=()=>{};
const UI=require(path.join(repo,'public/user-conversation-report.js'));
const B=crypto.randomUUID(),B2=crypto.randomUUID();
(async()=>{
 // Noisy 1024px PNG so the original is large, like a real watercolor.
 const raw=crypto.randomBytes(512*512*3);
 const png=await sharp(raw,{raw:{width:512,height:512,channels:3}}).resize(1024,1024).png().toBuffer();
 const asset={approved:true,bucket:'dayo-keepsakes',object_path:B+'/'+crypto.randomUUID()+'.png',image_sha256:crypto.createHash('sha256').update(png).digest('hex'),storage_version:'v1'};
 let stored=png;
 const db={rpc:async(name)=>({data:name==='dayo_keepsake_asset'?asset:null}),storage:{from:()=>({download:async()=>({data:{arrayBuffer:async()=>stored}})})}};
 const out=await R.handle({db,input:{action:'read',booking_id:B}});
 const bytes=Buffer.from(out.image.data,'base64'),meta=await sharp(bytes).metadata();
 assert.equal(out.image.content_type,'image/webp');assert.equal(meta.format,'webp');assert.deepEqual([meta.width,meta.height],[640,640]);
 assert.equal(out.image.asset.image_sha256,asset.image_sha256,'asset binding still describes the original PNG');
 assert(out.image.data.length<png.toString('base64').length/3,'customer payload is much smaller than the original');
 console.log('size: original base64',png.toString('base64').length,'→ webp base64',out.image.data.length);
 stored=Buffer.concat([png,Buffer.from([0])]);
 await assert.rejects(R.handle({db,input:{action:'read',booking_id:B}}),/image_version_changed/,'SHA check still runs on the original');
 stored=png;
 assert.equal((await R.handle({db:{...db,rpc:async n=>({data:n==='dayo_keepsake_asset'?null:true})},input:{action:'read',booking_id:B}})).image,null,'no approved asset → no image');

 // Client: one request per booking per transport; failures and missing images are retried.
 const client={auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}};
 let calls=0,mode='ok';
 const send=async(route,opts)=>{calls++;const id=JSON.parse(opts.body).review.booking_id;await new Promise(r=>setTimeout(r,20));
  if(mode==='fail')return {ok:false};
  if(mode==='none')return {ok:true,json:async()=>({managed:true,image:null})};
  return {ok:true,json:async()=>({managed:true,image:{...out.image,booking_id:id,asset:{...out.image.asset,object_path:id+'/x.png'}}})};};
 mode='fail';assert.equal(UI.memoryData(await UI.refreshKeepsakeImage(client,{booking_id:B},send),'en').image,'');
 mode='none';assert.equal(UI.memoryData(await UI.refreshKeepsakeImage(client,{booking_id:B},send),'en').image,'');
 assert.equal(calls,2,'failed / unapproved reads are not cached');
 mode='ok';calls=0;
 const [a,b]=await Promise.all([UI.refreshKeepsakeImage(client,{booking_id:B},send),UI.refreshKeepsakeImage(client,{booking_id:B},send)]);
 const c=await UI.refreshKeepsakeImage(client,a,send);
 assert.equal(calls,1,'concurrent and repeated reads of one booking share one request');
 for(const r of [a,b,c])assert(UI.memoryData(r,'ko').image.startsWith('blob:'));
 assert.equal(a.__dayoKeepsakeImage.url,c.__dayoKeepsakeImage.url,'shared blob URL is kept, not revoked');
 await UI.refreshKeepsakeImage(client,{booking_id:B2},send);assert.equal(calls,2,'other bookings still get their own read');
 const wrong=await UI.refreshKeepsakeImage(client,{booking_id:crypto.randomUUID()},async()=>({ok:true,json:async()=>({managed:true,image:{...out.image,content_type:'image/jpeg'}})}));
 assert.equal(UI.memoryData(wrong,'en').image,'','other content types still rejected');
 console.log('PASS: customer read is 640px WebP, original PNG SHA still enforced, one request per booking, no caching of failures/unapproved, shared blob kept.');
})().catch(e=>{console.error(e);process.exit(1);});
