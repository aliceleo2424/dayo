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

 let metadataSql=fs.readFileSync(path.join(repo,'supabase/migrations/110_keepsake_authenticated_metadata.sql'),'utf8');
 metadataSql=metadataSql.replace('70cfc69613a22df88cfa5aedfe008734',(await pg.query("select md5(pg_get_functiondef('public.dayo_keepsake_can_read(text)'::regprocedure)) h")).rows[0].h);await pg.exec(metadataSql);
 let partnerSql=fs.readFileSync(path.join(repo,'supabase/migrations/111_keepsake_partner_review.sql'),'utf8');
 for(const [signature,expected] of [['public.dayo_keepsake_can_read(text)','bf354fcb42dc6443f20ecc2032f69d90'],['public.dayo_keepsake_review_guard()','9fbd425d33a9f108deea3530ba3797e1'],['public.dayo_keepsake_review(text,uuid,uuid,text,text,text,smallint)','038dfe4dab5919067047db0555e3f314']])partnerSql=partnerSql.replace(expected,(await pg.query('select md5(pg_get_functiondef($1::regprocedure)) h',[signature])).rows[0].h);
 await pg.exec(partnerSql);
 await assert.rejects(reserve(N),/beta_booking_required/);
 let generalSql=fs.readFileSync(path.join(repo,'supabase/migrations/114_keepsake_normal_bookings.sql'),'utf8');
 // Fixture-local formatting hashes only. Production SQL retains actual preflight hashes.
 for(const [signature,expected] of [['public.dayo_keepsake_beta_access(uuid)','093372ef6034aea921001d7e7cb1e659'],['public.dayo_keepsake_review_guard()','8cf5ef8fdddc314f3ab3a36b0b3d7752'],['public.dayo_keepsake_reserve(uuid,uuid,uuid,text,text,text,timestamptz,date,integer)','a1088c7210ac44b4349528936c3b5cf7']])generalSql=generalSql.replace(expected,(await pg.query('select md5(pg_get_functiondef($1::regprocedure)) h',[signature])).rows[0].h);
 await pg.exec(generalSql);
 const c=await reserve(N);assert.equal(c.allowed,true);assert.equal(c.attempt,1);
 const req=(await pg.query('select request_id from keepsake_illustration_attempts where id=$1',[c.token])).rows[0].request_id;
 assert.equal((await reserve(N,req)).reused,true);
 assert.equal((await pg.query('select count(*)::int n from keepsake_illustration_attempts')).rows[0].n,1);
 await assert.rejects(as('service_role',null,'select dayo_keepsake_reserve_review($1,$2,$3,$4,$5,$6,$7,$8,$9)',[N,X,crypto.randomUUID(),'canonical-fixture',K,'workers_free',null,null,null]),/not_booking_partner/);
 const hash='a'.repeat(64);
 async function upload(claim){await pg.query('insert into storage.objects(bucket_id,name,version,metadata) values($1,$2,$3,$4)',['dayo-keepsakes',claim.object_path,'v1',{}]);return (await as('service_role',null,'select dayo_keepsake_stage($1,$2,$3) result',[claim.token,P,hash])).rows[0].result;}
 async function stored(who,claim){await pg.exec("set storage.operation='object.get_authenticated'");try{return (await as('authenticated',who,'select name from storage.objects where bucket_id=$1 and name=$2',['dayo-keepsakes',claim.object_path])).rows;}finally{await pg.exec('reset storage.operation');}}
 async function asset(who,b){return (await as('authenticated',who,'select dayo_keepsake_asset($1) image',[b])).rows[0].image;}
 assert.equal((await upload(c)).status,'pending_review');
 assert.equal((await stored(P,c)).length,1);assert.equal((await stored(U,c)).length,0);assert.equal((await stored(X,c)).length,0);
 assert.equal(await asset(U,N),null);await assert.rejects(asset(X,N),/not_booking_participant/);
 assert.equal((await review(P,'preview',N,c.token)).image_sha256,hash);
 await assert.rejects(review(X,'approve',N,c.token,hash,c.object_path,'v1'),/partner_review_required/);
 assert.equal((await review(P,'approve',N,c.token,hash,c.object_path,'v1')).status,'approved');
 assert.equal((await review(P,'approve',N,c.token,hash,c.object_path,'v1')).reused,true);
 assert.equal((await asset(U,N)).approved,true);assert.equal((await stored(U,c)).length,1);assert.equal((await stored(X,c)).length,0);
 assert.equal((await review(P,'revoke',N,c.token,hash,c.object_path,'v1')).status,'revoked');assert.equal(await asset(U,N),null);assert.equal((await stored(U,c)).length,0);
 const two=await reserve(N);assert.equal(two.attempt,2);await upload(two);assert.equal((await review(P,'reject',N,two.token,hash,two.object_path,'v1')).status,'rejected');assert.equal((await stored(U,two)).length,0);assert.equal((await reserve(N)).error,'attempt_limit');
 // No fixed booking/day, beta enrollment, or stale 12-hour dashboard attestation.
 const noStamp=await as('service_role',null,'select dayo_keepsake_reserve_review($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[M,P,crypto.randomUUID(),'canonical-fixture',K,'workers_free',null,null,null]);assert.equal(noStamp.rows[0].result.allowed,true);
 await as('service_role',null,'select dayo_keepsake_finish($1,$2,$3)',[noStamp.rows[0].result.token,P,'provider_http_error']);
 for(let i=3;i<50;i++){const b=crypto.randomUUID();await pg.query('insert into bookings(id,learner_id,partner_user_id,status) values($1,$2,$3,$4)',[b,U,P,'completed']);const r=await reserve(b);assert.equal(r.allowed,true);await as('service_role',null,'select dayo_keepsake_finish($1,$2,$3)',[r.token,P,'provider_http_error']);}
 assert.equal((await pg.query('select reserved_neurons from keepsake_illustration_daily_budget')).rows[0].reserved_neurons,10000);assert.equal((await reserve(Z)).error,'daily_budget_exhausted');
 await pg.query('delete from bookings where id=$1',[N]);assert.equal((await pg.query('select count(*)::int n from keepsake_illustration_attempts where booking_id=$1',[N])).rows[0].n,0);assert.equal((await stored(U,c)).length,0);
 for(const role of ['anon','authenticated','service_role'])assert.equal((await pg.query("select has_function_privilege($1,'public.dayo_keepsake_reserve(uuid,uuid,uuid,text,text,text,timestamptz,date,integer)','EXECUTE') ok",[role])).rows[0].ok,role==='service_role');
 console.log('PASS local PostgreSQL fixture: normal non-allowlisted bookings; actual Partner ownership; pending/approved/rejected/revoked Storage access; unrelated denial; duplicate prevention; two attempts; 10000-Neuron atomic reservation cap; no stale test attestation; booking cleanup; existing RPC permissions. No Production writes or provider calls.');
 await pg.close();
})().catch(e=>{console.error(e.message);process.exitCode=1;});
