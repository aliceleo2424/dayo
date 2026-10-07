const assert=require('node:assert/strict');
const sharp=require('sharp');
const lib=require('../api/_lib/profile-image');
const {createHandler}=require('../api/profile-image');
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',asset='33333333-3333-4333-8333-333333333333';
async function run(){
 const png=await sharp({create:{width:1600,height:800,channels:3,background:'#5F7D63'}}).png().toBuffer();
 const body={mime:'image/png',base64:png.toString('base64')};
 const normalized=await lib.normalize(body);assert.equal(normalized.info.width,1200);assert.equal(normalized.info.height,600);
 const metadata=await sharp(normalized.data).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.exif,undefined);
 for(const mime of ['jpeg','webp']){const bytes=await sharp(png)[mime]().toBuffer();assert((await lib.normalize({mime:'image/'+mime,base64:bytes.toString('base64')})).data.length);}
 const oriented=await sharp(png).jpeg().withMetadata({orientation:6}).toBuffer();
 const rotated=await lib.normalize({mime:'image/jpeg',base64:oriented.toString('base64')});assert.equal(rotated.info.width,600);assert.equal(rotated.info.height,1200);
 const huge=await sharp({create:{width:6500,height:6500,channels:3,background:'white'}}).png().toBuffer();
 for(const value of [{...body,mime:'image/svg+xml'},{...body,mime:'image/jpeg'},{mime:'image/png',base64:png.subarray(0,40).toString('base64')},{mime:'image/png',base64:huge.toString('base64')},{mime:'image/webp',base64:'not valid!'},{mime:'image/png',base64:Buffer.alloc(lib.MAX_BYTES+1).toString('base64')}])await assert.rejects(lib.normalize(value),/invalid_image|image_too_large/);
 function db(options={}){
  const calls=[],profile={id:owner,role:options.role||'partner'},state={id:asset},queue=[];
  const bucket=profile.role==='partner'?'partner-profile-images':'user-profile-images';
  const mapping={asset_id:asset,bucket_id:bucket,object_path:owner+'/'+asset+'.webp',visibility:profile.role==='partner'?'partner_public':'user_public'};
  const client={calls,state,queue,auth:{getUser:async token=>({data:{user:token==='owner'?{id:owner,app_metadata:{provider:options.providerPhoto?'google':'email'},user_metadata:{picture:options.providerPhoto}}:token==='other'?{id:other}:null}})},from(table){
   const filters={};const chain={select(){return this;},eq(key,value){filters[key]=value;return this;},in(key,values){assert.deepEqual(values,['confirmed','completed']);return this;},or(value){assert(value.includes(owner)&&value.includes(other));return this;},delete(){calls.push('queue-delete');return this;},upsert(value){queue.push(value);return Promise.resolve({error:null});},async maybeSingle(){if(table==='profiles')return {data:filters.id===owner?profile:{id:other,role:options.viewerRole||'user'}};return options.reconcileError?{error:true}:{data:filters.owner_id===owner?{...mapping,asset_id:state.id}:null};},limit(){return Promise.resolve({data:options.related?[{id:'booking'}]:[]});},then(resolve){resolve({error:null});}};return chain;
  },storage:{from(id){assert(['partner-profile-images','user-profile-images'].includes(id));return {getPublicUrl(path){return {data:{publicUrl:'https://mmhapsimcngmtefqfrcg.supabase.co/storage/v1/object/public/'+id+'/'+path}};},async upload(path,bytes,settings){assert(path.startsWith(owner+'/'));assert(lib.UUID.test(path.split('/')[1].slice(0,-5)));assert.equal(settings.upsert,false);assert.equal(settings.contentType,'image/webp');calls.push('upload');return {error:options.uploadError};},async remove(paths){calls.push('remove');if(options.removeThrow)throw Error('transport');return {error:options.removeError};},async download(path){calls.push('download');assert.equal(path,mapping.object_path);return {data:{arrayBuffer:async()=>normalized.data}};}};}},async rpc(name,args){calls.push('rpc');assert.equal(args.p_user_id,owner);if(name==='remove_user_profile_image_asset'){assert.deepEqual(Object.keys(args),['p_user_id']);return {data:{avatar_url:options.providerPhoto||null,previous:{bucket,path:mapping.object_path}}};}if(options.commit||!options.rpcError)state.id=args.p_asset_id;if(options.rpcThrow)throw Error('network');return options.rpcError?{error:true}:{data:{avatar_url:'https://mmhapsimcngmtefqfrcg.supabase.co/storage/v1/object/public/'+bucket+'/'+owner+'/'+args.p_asset_id+'.webp',previous:{bucket,path:mapping.object_path}}};}};
  return client;
 }
 async function request(database,method='POST',token='owner',value=body,query={}){
  const headers={};const res={setHeader:(k,v)=>headers[k]=v,end:value=>{res.value=value;}};
  await createHandler(()=>database)({method,headers:token?{authorization:'Bearer '+token}:{},body:value,query},res);
  return {status:res.statusCode,headers,data:Buffer.isBuffer(res.value)?res.value:JSON.parse(res.value)};
 }
 let client=db(),r=await request(client);assert.equal(r.status,200);assert.deepEqual(client.calls,['upload','rpc','remove','queue-delete']);assert.deepEqual(Object.keys(r.data).sort(),['avatar_url','version']);assert.match(r.data.avatar_url,/object\/public\/partner-profile-images/);assert.notEqual(r.data.version,asset);
 for(const [token,value,status] of [[null,body,401],['invalid',body,401],['owner',{...body,path:other+'/hack.webp'},400],['owner',{...body,userId:other},400]]){client=db();r=await request(client,'POST',token,value);assert.equal(r.status,status);assert.equal(client.calls.length,0);}
 r=await request(db(),'POST','owner',body,{userId:other});assert.equal(r.status,400);
 client=db({uploadError:true});r=await request(client);assert.equal(r.status,503);assert.equal(client.state.id,asset);assert.deepEqual(client.calls,['upload']);
 client=db({rpcError:true});r=await request(client);assert.equal(r.status,503);assert.equal(client.state.id,asset);assert.deepEqual(client.calls,['upload','rpc','remove']);
 client=db({rpcError:true,removeError:true});await request(client);assert.equal(client.queue.length,1);assert.equal(client.state.id,asset);
 client=db({rpcError:true,commit:true,rpcThrow:true});r=await request(client);assert.equal(r.status,200);assert(!client.calls.includes('remove'),'Ambiguous committed upload is retained');
 client=db({rpcError:true,reconcileError:true});r=await request(client);assert.equal(r.status,503);assert(!client.calls.includes('remove'),'Unknown commit outcome is never destructively cleaned');
 assert.equal(r.data.error,'image_save_unconfirmed');
 client=db({removeThrow:true});r=await request(client);assert.equal(r.status,200);assert(!client.calls.includes('queue-delete'));
 for(const token of [null,'owner','other']){client=db();r=await request(client,'GET',token,null,{userId:owner});assert.equal(r.status,405);assert.equal(client.calls.length,0,'No GET download/proxy');}
 r=await request(db({role:'user'}));assert.equal(r.status,200);assert.match(r.data.avatar_url,/object\/public\/user-profile-images/);
 r=await request(db(),'DELETE','owner',null);assert.equal(r.status,403);
 r=await request(db({role:'user'}),'DELETE','owner',null);assert.equal(r.status,200);assert.equal(r.data.avatar_url,null);
 const provider='https://lh3.googleusercontent.com/provider';r=await request(db({role:'user',providerPhoto:provider}),'DELETE','owner',null);assert.equal(r.data.avatar_url,provider);
 r=await request(db({role:'user'}),'DELETE','owner',{userId:other});assert.equal(r.status,400);
 r=await request(db({role:'user'}),'DELETE','owner',null,{userId:other});assert.equal(r.status,400);
 assert.equal(lib.originAllowed({headers:{origin:'https://evil.example'}}),false);
 const preflight={setHeader(){},end(){}};await createHandler(()=>{throw Error('Preflight must not access data');})({method:'OPTIONS',headers:{origin:'https://dayo-sufk.vercel.app'}},preflight);assert.equal(preflight.statusCode,204);
 await assert.rejects(lib.body({headers:{'content-length':4*1024*1024}}),/image_too_large/);
 console.log('PASS profile-image API: real decode/MIME/size/pixels/EXIF; authenticated owner paths; public UUID paths; no GET proxy; replacement ordering/failure reconciliation/cleanup; delete fallback/version.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
