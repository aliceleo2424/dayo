const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..');
const literal=value=>value===null?'null':Array.isArray(value)?'array['+value.map(literal).join(',')+']::text[]':typeof value==='object'?literal(JSON.stringify(value))+'::jsonb':typeof value==='boolean'?String(value):"'"+String(value).replace(/'/g,"''")+"'";
const insert=app=>'insert into public.partner_applications ('+Object.keys(app).join(',')+') values ('+Object.values(app).map(literal).join(',')+')';
const base={full_name:'QA Applicant',email:'qa@example.invalid',contact_method:'Email',nationality:'French',current_city:'Paris',university:'',visa_type:'Other',strongest_language:'French',other_languages:'',partner_languages:['French'],korean_level:'basic',stranger_conversation_comfort:'comfortable',availability_periods:['weekday_evening'],weekly_session_capacity:'3-5',device:'laptop_pc',video_environment:'yes',scenario_answer:'I would ask a small, specific question about a familiar interest and give the user time to respond naturally.',motivation:'Structured conversation',acquisition_source:'',referral_code:'',privacy_consent:true};
async function database(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table public.profiles(id uuid primary key,role text not null);
 insert into public.profiles values ('11111111-1111-4111-8111-111111111111','admin'),('22222222-2222-4222-8222-222222222222','user');
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;
 grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
 create policy unrelated_broad_policy on storage.objects for all to anon,authenticated using(true) with check(true);`);
 const admin=fs.readFileSync(path.join(root,'supabase/migrations/039_secure_bookings_rls.sql'),'utf8');
 await db.exec(admin.slice(admin.indexOf('create or replace function public.dayo_is_admin()'),admin.indexOf('-- Remove the broad production policies')));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/077_partner_applications.sql'),'utf8'));
 await db.exec(insert({...base,email:'legacy@example.invalid',acquisition_source:'Legacy community'}));
 const before=(await db.query("select to_jsonb(a) data from public.partner_applications a where email='legacy@example.invalid'")).rows[0].data;
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/078_partner_application_profile_fields.sql'),'utf8'));
 const after=(await db.query("select to_jsonb(a) data from public.partner_applications a where email='legacy@example.invalid'")).rows[0].data;
 for(const key of Object.keys(before))assert.deepEqual(after[key],before[key],'Legacy data changed: '+key);
 assert.equal(after.native_languages,null);
 assert.equal((await db.query('select count(*)::int n from storage.buckets where public')).rows[0].n,0);
 async function bundle(video=true,hash='a'.repeat(64)){
  await db.exec('set role service_role');const {rows}=await db.query(`select public.issue_partner_application_upload('${hash}','webm') media`);await db.exec('reset role');
  const media=rows[0].media;await db.exec(`insert into storage.objects(bucket_id,name) values ('partner-application-videos',${literal(media.video_path)})`);return media;
 }
 const media=await bundle();
 const applicant={...base,current_country:'France',visa_type:'outside_korea',native_languages:['French','English'],other_language_proficiencies:{Japanese:'fluent',Korean:'basic'},partner_languages:['English','Japanese'],korean_level:'native',availability_periods:['weekday_early_morning','weekend_late_night'],acquisition_source:'other',acquisition_source_other:'Local community newsletter',media_upload_id:media.id,intro_video_language:'English',intro_video_path:media.video_path};
 delete applicant.motivation;
 await db.exec('set role anon');await db.exec(insert(applicant));
 await assert.rejects(db.query('select * from public.partner_applications'),/permission denied/);
 await assert.rejects(db.query('select * from public.partner_application_uploads'),/permission denied/);
 assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,0);
 await assert.rejects(db.exec("insert into storage.objects(bucket_id,name) values ('partner-application-videos','unauthorized.webm')"),/row-level security/);
 await assert.rejects(db.query("select public.issue_partner_application_upload('"+'a'.repeat(64)+"','webm')"),/permission denied/);
 await db.exec('reset role');
 const publicAsset='magazine/public-fixture.png';
 await db.exec("insert into storage.objects(bucket_id,name) values ('public-assets',"+literal(publicAsset)+")");
 await db.exec('set role anon');
 assert.equal((await db.query("select count(*)::int n from storage.objects where bucket_id='public-assets'")).rows[0].n,1,'Unrelated public asset reads must stay available');
 await db.exec('reset role');
 const row=(await db.query("select * from public.partner_applications where email='qa@example.invalid'")).rows[0];
 assert.equal(row.motivation,null);assert.equal(row.strongest_language,'French');assert.deepEqual(row.other_language_proficiencies,{Japanese:'fluent',Korean:'basic'});assert.equal(row.review_score,7);assert.equal(row.review_status,'ready');
 await db.exec("set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false)");
 assert.equal((await db.query('select count(*)::int n from public.partner_applications')).rows[0].n,0);
 assert.equal((await db.query("select count(*)::int n from storage.objects where bucket_id <> 'public-assets'")).rows[0].n,0);
 assert.equal((await db.query("update public.partner_applications set final_status='approved' returning id")).rows.length,0);
 await assert.rejects(db.query('update public.partner_applications set native_languages=array[\'Korean\']'),/permission denied/);
 await db.exec("select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false)");
 assert.equal((await db.query("select count(*)::int n from storage.objects where bucket_id <> 'public-assets'")).rows[0].n,1);
 assert.equal((await db.query("update public.partner_applications set final_status='rejected' where email='qa@example.invalid' returning id")).rows.length,1);
 await db.exec('reset role');
 const second=await bundle(false);await db.exec('set role authenticated');await db.exec(insert({...applicant,media_upload_id:second.id,intro_video_path:second.video_path}));await db.exec('reset role');
 await assert.rejects(db.exec(insert({...applicant,email:'duplicate@example.invalid'})),/Invalid or expired media/);
 const invalid=await bundle(false);
 for(const changes of [{partner_languages:['Korean']},{other_language_proficiencies:{Japanese:'expert'}},{native_languages:['English','English']},{acquisition_source:'other',acquisition_source_other:''},{current_country:'South Korea'},{intro_video_path:'someone-else.webm'},{intro_video_path:null},{intro_video_language:'Korean'},{availability_periods:['weekday_midnight']}]){
  await assert.rejects(db.exec(insert({...applicant,...changes,email:'invalid@example.invalid',media_upload_id:invalid.id,intro_video_path:invalid.video_path,...changes})),/Invalid|must|required|constraint|Session|Overseas|Video/);
 }
 await db.exec("delete from storage.objects where name="+literal(invalid.video_path));await assert.rejects(db.exec(insert({...applicant,email:'missing@example.invalid',media_upload_id:invalid.id,intro_video_path:invalid.video_path})),/Upload your files/);
 for(let i=0;i<10;i++)await bundle(false,'b'.repeat(64));
 await assert.rejects(bundle(false,'b'.repeat(64)),/Too many upload/);await db.exec('reset role');
 await db.close();console.log('PASS: 077 + 078 SQL, legacy rows unchanged, structured languages/visa/KST/source, required bound media, replay/missing files, rejected reapply, unchanged triage, admin-only rows/media, broad-policy fence, durable upload rate limit.');
}
async function endpoint(){
 let rpcCalls=0,signedCalls=0,rpcError=null;
 const sandbox={module:{exports:{}},require:name=>name==='@supabase/supabase-js'?{createClient:url=>{assert.equal(url,'https://fixture.invalid');return ({rpc:async()=>{rpcCalls++;return {data:{id:'fixture-id',video_path:'applications/fixture/intro.webm'},error:rpcError}},storage:{from:()=>({createSignedUploadUrl:async path=>{signedCalls++;return {data:{token:'upload-only-token',path},error:null}}})}})} }:require(name),process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.invalid/rest/v1/',SUPABASE_SERVICE_ROLE_KEY:'fixture-only-secret'}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'api/partner-application-upload.js'),'utf8'),sandbox);
 async function request(body,method='POST',origin='https://www.dayotalk.com'){const res={setHeader(){},end(value){this.body=JSON.parse(value)}};await sandbox.module.exports({method,headers:{host:'www.dayotalk.com',origin,'x-vercel-forwarded-for':'192.0.2.1'},body},res);return res;}
 assert.equal((await request({},'GET')).statusCode,405);
 assert.equal((await request({video:{type:'video/webm',size:10}},'POST','https://other.invalid')).statusCode,403);
 for(const body of [{},{video:{type:'image/png',size:10}},{video:{type:'video/webm',size:52428801}},{photo:{type:'image/png',size:10},video:{type:'video/webm',size:10}}])assert.equal((await request(body)).statusCode,400);
 assert.equal(rpcCalls,0);const valid=await request({video:{type:'video/webm',size:20}});assert.equal(valid.statusCode,200);assert.equal(signedCalls,1);assert(!JSON.stringify(valid.body).includes('fixture-only-secret'));assert(!JSON.stringify(valid.body).includes('signedUrl'));
 rpcError={code:'P0001'};assert.equal((await request({video:{type:'video/webm',size:10}})).statusCode,429);
 console.log('PASS: upload API methods/origin, MIME/size rejection, scoped signed tokens only, no service key/read URL exposure, rate-limit response.');
}
(async()=>{await database();await endpoint()})().catch(error=>{console.error(error);process.exitCode=1});
