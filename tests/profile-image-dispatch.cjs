const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n');
const old=cp.execFileSync('git',['show','c6058bc796a1ea23c204b3072d9597c6f2b48daf:api/partner-application-upload.js'],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
assert.equal(read('api/_lib/partner-application-video.js'),old,'Existing video implementation is byte-identical after newline normalization');
assert(!fs.existsSync(path.join(root,'api/profile-image.js')));
const count=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js')&&!x.startsWith('_')).length;assert.equal(count,12);
const calls=[],sandbox={module:{exports:{}},process:{env:{SUPABASE_SERVICE_ROLE_KEY:'fixture-server-only',NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co'}},require:name=>name==='@supabase/supabase-js'?{createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'media-fixture',video_path:'applications/fixture/intro.webm'}};},storage:{from:bucket=>{assert.equal(bucket,'partner-application-videos');return {createSignedUploadUrl:async p=>({data:{token:'fixture-signed-token'}})};}}})}:require(name)};
vm.runInNewContext(read('api/_lib/partner-application-video.js'),sandbox);
const video=sandbox.module.exports,{createDispatcher}=require('../api/partner-application-upload');
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.value=v?JSON.parse(v):null;}};}
function req(body,extra={}){return {method:'POST',headers:{host:'www.dayotalk.com',origin:'https://www.dayotalk.com'},body,query:{},...extra};}
(async()=>{
 const dispatch=createDispatcher(video,()=>{throw Error('Video accidentally reached image handler')});
 for(const type of ['video/webm','video/mp4','video/quicktime']){const res=response();await dispatch(req({video:{type,size:1024}}),res);assert.equal(res.statusCode,200);assert.equal(res.value.id,'media-fixture');assert.equal(res.value.video.bucket,'partner-application-videos');}
 assert.equal(calls.length,3);assert(calls.every(c=>c.name==='issue_partner_application_upload'&&c.args.p_request_hash.length===64));
 for(const body of [{photo:{}},{video:{type:'image/webp',size:10}},{video:{type:'video/webm',size:52428801}},{video:{type:'video/webm',size:0}}]){const res=response();await dispatch(req(body),res);assert.equal(res.statusCode,400);}
 const badOrigin=response();await dispatch(req({video:{type:'video/webm',size:10}},{headers:{host:'www.dayotalk.com',origin:'https://evil.test'}}),badOrigin);assert.equal(badOrigin.statusCode,403);
 const get=response();await dispatch(req(null,{method:'GET'}),get);assert.equal(get.statusCode,405);assert.equal(calls.length,3);
 let imageCalls=0;const routed=createDispatcher(()=>{throw Error('Profile reached video handler')},async(r,res)=>{imageCalls++;assert(!('action' in r.query));assert.equal(r.query.other,'kept');res.end('{}');});
 const original={action:'profile-image',other:'kept'},r=req({}, {query:original});await routed(r,response());assert.equal(r.query,original);assert.equal(imageCalls,1);
 for(const action of ['',null,'video','other',['profile-image']]){const res=response();await routed(req({}, {query:{action}}),res);assert.equal(res.statusCode,400);assert.equal(res.value.error,'invalid_upload_action');}assert.equal(imageCalls,1);
 const {createHandler}=require('../api/_lib/profile-image-handler');
 const owner='11111111-1111-4111-8111-111111111111';const fake={auth:{getUser:async token=>({data:{user:token==='owner'?{id:owner}:null}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{id:owner,role:'partner'}})})};
 const secure=createDispatcher(()=>{throw Error('Profile reached video handler')},createHandler(()=>fake));
 const anon=response();await secure(req({mime:'image/webp',base64:'AAAA'}, {query:{action:'profile-image'}}),anon);assert.equal(anon.statusCode,401);
 for(const bad of [{query:{action:'profile-image',user_id:'foreign'},body:{}},{query:{action:'profile-image',type:'bad'},body:{}},{query:{action:'profile-image'},body:{mime:'image/webp',base64:'AAAA',user_id:'foreign'}}]){const res=response();await secure(req(bad.body,{query:bad.query,headers:{authorization:'Bearer owner',host:'www.dayotalk.com',origin:'https://www.dayotalk.com'}}),res);assert.equal(res.statusCode,400);}
 const fail=createDispatcher(()=>{},async()=>{throw Error('fixture')});const q={action:'profile-image'};const failing=req({}, {query:q});await assert.rejects(fail(failing,response()),/fixture/);assert.equal(failing.query,q);
 console.log('PASS dispatch: 12 functions; exact existing video handler/URL, three MIME types, signing, validation/origin/rate-limit RPC preserved; profile routing separated; invalid action/type and foreign targets rejected; query restored on success/failure.');
})().catch(e=>{console.error(e);process.exitCode=1;});
