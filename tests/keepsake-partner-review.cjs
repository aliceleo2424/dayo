const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite'),sharp=require('sharp');
const repo=path.join(__dirname,'..');
const U='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222',X='33333333-3333-4333-8333-333333333333';
const O='d6e284f0-5d38-4994-85d6-36930ea50869',B='ea5289f9-41fe-4b94-9677-bd3b038c87eb',N=crypto.randomUUID(),M=crypto.randomUUID(),Z=crypto.randomUUID(),K='a'.repeat(64);
(async()=>{
 const pg=new PGlite();
 // Reuse the existing 107 regression's canonical minimal synthetic schema.
 const source=fs.readFileSync(path.join(repo,'tests/keepsake-safety.cjs'),'utf8');
 const bootstrap=/await pg\.exec\(`([\s\S]*?)`\);/.exec(source)[1];
 await pg.exec(new Function('U','P','X','B','return `'+bootstrap+'`;')(U,P,X,B));
 await pg.exec(fs.readFileSync(path.join(repo,'supabase/migrations/107_keepsake_illustrations.sql'),'utf8'));
 await pg.exec(`alter table bookings add column is_test_session boolean default false;update bookings set is_test_session=true where id='${B}';
 alter table storage.objects add column version text;alter table storage.objects add column metadata jsonb;
 create function storage.allow_only_operation(expected_operation text) returns boolean language sql stable as $$select coalesce(current_setting('storage.operation',true)=$1,false)$$;
 insert into auth.users values('${O}');insert into profiles values('${O}','admin');
 create function public.dayo_is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin')$$;
 insert into bookings(id,learner_id,partner_user_id,status) values('${N}','${U}','${P}','completed'),('${M}','${U}','${P}','completed'),('${Z}','${U}','${P}','completed');`);
 const sql=fs.readFileSync(path.join(repo,'supabase/migrations/109_keepsake_manual_review.sql'),'utf8');await pg.exec(sql);
 async function as(role,id,query,params=[]){await pg.exec(`set role ${role};set request.jwt.claim.sub='${id||''}'`);try{return await pg.query(query,params);}finally{await pg.exec('reset role;reset request.jwt.claim.sub');}}
 async function review(id,action,b=B,a=null,hash=null,object=null,version=null,slot=null){return (await as('authenticated',id,'select public.dayo_keepsake_review($1,$2,$3,$4,$5,$6,$7::smallint) result',[action,b,a,hash,object,version,slot])).rows[0].result;}
 async function reserve(b=B,id=crypto.randomUUID()){return (await as('service_role',null,'select public.dayo_keepsake_reserve_review($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[b,P,id,'canonical-fixture',K,'workers_free',new Date().toISOString(),new Date().toISOString().slice(0,10),null])).rows[0].result;}
 for(const who of [U,P,X])await assert.rejects(review(who,'list'),/owner_review_required/);
 await assert.rejects(reserve(N),/beta_booking_required/);
 for(const [slot,b] of [[1,N],[2,M]])assert.equal((await review(O,'enroll',b,null,null,null,null,slot)).status,'enrolled');
 await assert.rejects(review(O,'enroll',Z,null,null,null,null,3),/invalid_beta_booking/);
 await assert.rejects(review(O,'enroll',Z,null,null,null,null,1),/beta_slot_already_used/);
 assert.equal((await review(O,'enroll',N,null,null,null,null,1)).status,'enrolled','repeat enrollment is idempotent');
 const png=await sharp({create:{width:1024,height:1024,channels:3,background:'#fffbf4'}}).png().toBuffer(),hash=crypto.createHash('sha256').update(png).digest('hex');
 async function upload(c,v='v1'){await pg.query('insert into storage.objects(bucket_id,name,version,metadata) values($1,$2,$3,$4)', ['dayo-keepsakes',c.object_path,v,{}]);return (await as('service_role',null,'select public.dayo_keepsake_stage($1,$2,$3) result',[c.token,P,hash])).rows[0].result;}
 await assert.rejects(as('service_role',null,'select public.dayo_keepsake_reserve($1,$2,$3,$4,$5,$6,$7,$8,$9)',[B,P,crypto.randomUUID(),'legacy-source',K,'workers_free',new Date().toISOString(),new Date().toISOString().slice(0,10),null]),/beta_booking_required/);
 const c=await reserve();assert(c.allowed);assert.equal((await upload(c)).status,'pending_review');
 async function asset(who){return (await as('authenticated',who,'select public.dayo_keepsake_asset($1) asset',[B])).rows[0].asset;}
 async function stored(who,operation='object.get_authenticated'){await pg.exec(`set storage.operation='${operation}'`);try{return (await as('authenticated',who,'select name from storage.objects where bucket_id=$1 and name=$2',['dayo-keepsakes',c.object_path])).rows;}finally{await pg.exec('reset storage.operation');}}
 for(const who of [U,P]){assert.equal(await asset(who),null);assert.equal((await stored(who)).length,0,'pending direct Storage is denied');}
 await assert.rejects(asset(X),/not_booking_participant/);
 assert.equal((await stored(X)).length,0);assert.equal((await stored(O)).length,1,'owner can privately preview');
 // Reproduce the real Storage metadata-operation failure before the correction.
 assert.equal((await stored(O,'object.get_authenticated_info')).length,0,'109 incorrectly denies Owner metadata preflight');
 const metadataSql=fs.readFileSync(path.join(repo,'supabase/migrations/110_keepsake_authenticated_metadata.sql'),'utf8');
 const localHash=(await pg.query("select md5(pg_get_functiondef('public.dayo_keepsake_can_read(text)'::regprocedure)) fingerprint")).rows[0].fingerprint;
 // Formatting differs in the isolated PGlite bootstrap; preserve the exact-definition gate locally.
 await pg.exec(metadataSql.replace('70cfc69613a22df88cfa5aedfe008734',localHash));
 assert.equal((await stored(O,'object.get_authenticated_info')).length,1,'Owner metadata preflight works after the correction');
 for(const who of [U,P,X])assert.equal((await stored(who,'object.get_authenticated_info')).length,0,'pending metadata denied to participants and unrelated users');

 // Apply the proposed Partner permission revision ONLY in this isolated local database.
 let partnerSql=fs.readFileSync(path.join(repo,'supabase/migrations/111_keepsake_partner_review.sql'),'utf8');
 for(const [signature,expected] of [['public.dayo_keepsake_can_read(text)','bf354fcb42dc6443f20ecc2032f69d90'],['public.dayo_keepsake_review_guard()','9fbd425d33a9f108deea3530ba3797e1'],['public.dayo_keepsake_review(text,uuid,uuid,text,text,text,smallint)','038dfe4dab5919067047db0555e3f314']]){
  const local=(await pg.query('select md5(pg_get_functiondef($1::regprocedure)) fingerprint',[signature])).rows[0].fingerprint;partnerSql=partnerSql.replace(expected,local);
 }
 await pg.exec(partnerSql);
 assert.equal((await stored(P)).length,1,'same generating Partner can preview pending bytes');
 assert.equal((await stored(P,'object.get_authenticated_info')).length,1);
 assert.equal((await review(P,'preview',B,c.token)).image_sha256,hash);assert.equal((await review(O,'preview',B,c.token)).image_sha256,hash,'admin preview remains optional');
 assert.equal((await review(P,'list')).length,1);
 for(const who of [U,X]){assert.equal((await stored(who)).length,0);assert.equal((await stored(who,'object.get_authenticated_info')).length,0);await assert.rejects(review(who,'preview',B,c.token),/partner_review_required/);await assert.rejects(review(who,'approve',B,c.token,hash,c.object_path,'v1'),/partner_review_required/);}
 await assert.rejects(review(P,'list',null),/partner_review_required/);
 await assert.rejects(review(P,'preview',N,c.token),/partner_review_required/);
 await assert.rejects(review(P,'enroll',Z,null,null,null,null,1),/owner_review_required/);
 await assert.rejects(review(P,'disable',B),/owner_review_required/);
 await assert.rejects(pg.query('update keepsake_illustration_attempts set actor_id=$1 where id=$2',[X,c.token]),/image_actor_immutable/);
 for(const op of ['object.sign','object.sign_upload','object.list', ''])assert.equal((await stored(O,op)).length,0,'no signed/bearer links or broad listings');
 await assert.rejects(review(P,'approve',B,c.token,'b'.repeat(64),c.object_path,'v1'),/review_version_changed/);
 assert.equal((await review(P,'approve',B,c.token,hash,c.object_path,'v1')).status,'approved');
 assert.equal((await review(P,'approve',B,c.token,hash,c.object_path,'v1')).reused,true);
 for(const who of [U,P]){assert.equal((await asset(who)).approved,true);assert.equal((await stored(who)).length,1);assert.equal((await stored(who,'object.sign')).length,0);}
 for(const who of [U,P])assert.equal((await stored(who,'object.get_authenticated_info')).length,1,'approved participant metadata allowed');
 assert.equal((await stored(X,'object.get_authenticated_info')).length,0,'approved metadata denies unrelated authenticated user');
 assert.equal((await stored(X)).length,0,'approved direct Storage still denies unrelated authenticated User');
 await assert.rejects(as('service_role',null,"update keepsake_illustration_attempts set review_state='revoked' where id=$1",[c.token]),/partner_review_required/);
 await pg.query('update storage.objects set version=$1 where name=$2',['tampered',c.object_path]);
 assert.equal(await asset(U),null);assert.equal((await stored(U)).length,0,'replaced object version never inherits approval');
 await pg.query('update storage.objects set version=$1 where name=$2',['v1',c.object_path]);
 await assert.rejects(pg.query('update keepsake_illustration_attempts set image_sha256=$1 where id=$2',['b'.repeat(64),c.token]),/image_binding_immutable/);
 assert.equal((await review(P,'revoke',B,c.token,hash,c.object_path,'v1')).status,'revoked');
 for(const who of [U,P,O]){assert.equal((await stored(who)).length,0);assert.equal((await stored(who,'object.get_authenticated_info')).length,0,'revocation denies metadata too');}
 assert.equal(await asset(U),null);
 const second=await reserve();assert.equal(second.attempt,2);await upload(second,'v2');
 assert.equal((await review(P,'reject',B,second.token,hash,second.object_path,'v2')).status,'rejected');
 assert.equal(await asset(U),null);for(const who of [U,P,X])assert.equal((await stored(who,'object.get_authenticated_info')).length,0,'rejected metadata denied');assert.equal((await reserve()).error,'attempt_limit');
 assert.equal((await pg.query('select reserved_neurons from keepsake_illustration_daily_budget')).rows[0].reserved_neurons,400,'rejection/revocation never refund attempts/budget');
 await pg.exec("update keepsake_illustration_attempts set updated_at=clock_timestamp()-interval '3 minutes' where state='cleanup'");
 const job=(await as('service_role',null,'select dayo_keepsake_cleanup_claim() job')).rows[0].job;assert(job.object_path===c.object_path||job.object_path===second.object_path);
 await pg.query('delete from storage.objects where name=$1',[job.object_path]); // Local synthetic Storage API stand-in only.
 await as('service_role',null,'select dayo_keepsake_cleanup_done($1)',[job.token]);
 const fields=(await pg.query('select review_state,image_sha256 from keepsake_illustration_attempts where id=$1',[job.token])).rows[0];assert(fields.image_sha256===hash);
 assert.equal((await pg.query("select active from cron.job where jobname='dayo-keepsake-cleanup'")).rows[0].active,false);
 await assert.rejects(pg.exec(sql),/manual_review_preflight_mismatch/);await pg.exec('rollback');
 // Deleted/unknown generator IDs must fail closed, not pass SQL NULL boolean guards.
 await pg.query('update keepsake_illustration_attempts set actor_id=null where id=$1',[c.token]);
 await pg.exec("set request.jwt.claim.sub='"+X+"'");
 try{await assert.rejects(pg.query("update keepsake_illustration_attempts set review_state='approved',reviewed_by=$1,reviewed_at=clock_timestamp() where id=$2",[X,c.token]),/partner_review_required/);}finally{await pg.exec('reset request.jwt.claim.sub');}
 const R=require(path.join(repo,'api/_lib/keepsake-manual-review.js'));
 let calls=0;const assetDescriptor={bucket:'dayo-keepsakes',object_path:c.object_path,image_sha256:hash,storage_version:'v1',approved:true};
 const db={rpc:async(name,args)=>{calls++;return {data:name==='dayo_keepsake_asset'?assetDescriptor:name==='dayo_keepsake_beta_access'?true:name==='dayo_keepsake_review'&&args.p_action==='preview'?assetDescriptor:{status:'approved'}};},storage:{from:()=>({download:async()=>({data:new Blob([png])})})}};
 assert.equal((await R.handle({db,input:{action:'read',booking_id:B}})).image.approved,true);
 assert.equal((await R.handle({db,input:{action:'approve',booking_id:B,attempt_id:c.token,object_path:c.object_path,image_sha256:hash,storage_version:'v1'}})).status,'approved');
 await assert.rejects(R.handle({db,input:{action:'approve',booking_id:B,attempt_id:c.token,object_path:c.object_path,image_sha256:'b'.repeat(64),storage_version:'v1'}}),{code:'image_version_changed'});
 await assert.rejects(R.readBytes({...db,storage:{from:()=>({download:async()=>({data:new Blob([Buffer.from('changed')])})})}},assetDescriptor,B),{code:'image_version_changed'});
 const API=require(path.join(repo,'api/_lib/keepsake-review-handler.js')).createHandler;
 function response(){return {setHeader(){},end(raw){this.body=raw?JSON.parse(raw):null;}};}
 let privileged=0;const handler=API({env:{SUPABASE_URL:'https://fixture.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-fixture'},fetchImpl:async()=>({ok:false}),clientFactory:()=>{privileged++;return db;}});
 const rejected=response();await handler({method:'POST',headers:{authorization:'Bearer fixture'},body:{action:'read',booking_id:B}},rejected);assert.equal(rejected.statusCode,401);assert.equal(privileged,0);
 console.log('PASS: isolated 111 draft: same generating Partner preview/approval/rejection/revocation, no required Owner step, optional admin preview, actor/SHA/path/version binding, learner and unrelated denial, NULL-actor fail-closed, signing/listing denial, unchanged quotas and cleanup.');
 console.log('NOT VERIFIED: real Production migration/Storage/admin/user browser acceptance and multi-connection contention; no Production writes/provider calls.');
 await pg.close();
})().catch(e=>{console.error(e.message);process.exitCode=1;});
