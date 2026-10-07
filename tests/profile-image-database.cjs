const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),sql=fs.readFileSync(path.join(root,'supabase/migrations/097_profile_image_assets.sql'),'utf8');
const baseline=fs.readFileSync(path.join(__dirname,'fixtures/profile-image-completion-live.sql'),'utf8');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const image1='44444444-4444-4444-8444-444444444444',image2='55555555-5555-4555-8555-555555555555';
async function run(){
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
   create table profiles(id uuid primary key,user_id uuid,full_name text,nickname text,user_name text,email text,role text,avatar_url text,provider text,kakao_id text,admin_memo text,ticket_count integer,tickets integer,created_at timestamptz,updated_at timestamptz default now());
   create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb);
   create schema storage;create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
   alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;grant all on storage.objects to anon,authenticated,service_role;
   create table storage.buckets(id text primary key,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create function public.partner_application_media_admin_access(text,text) returns boolean language sql stable as $$select false$$;
   alter table profiles enable row level security;grant select(id,role,avatar_url),update(avatar_url) on profiles to authenticated;
   create policy profile_owner_read on profiles for select to authenticated using(id=auth.uid());
   create policy profile_owner_write on profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
   create function public.dayo_is_admin() returns boolean language sql stable as $$select false$$;`);
  const livePolicies=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/profile-image-storage-live.json'),'utf8')).policies;
  const qi=value=>'"'+value.replace(/"/g,'""')+'"';
  for(const p of livePolicies)await db.exec('create policy '+qi(p.name)+' on storage.objects as '+p.mode+' for '+p.command+' to '+p.roles.map(qi).join(',')+(p.using?' using ('+p.using+')':'')+(p.check?' with check ('+p.check+')':''));
  await db.exec("insert into storage.buckets values('partner-profile-images',true,2097152,array['image/webp']),('user-profile-images',true,2097152,array['image/webp'])");
  const storageSnapshot=async()=>JSON.stringify((await db.query("select policyname,permissive,cmd,roles,qual,with_check from pg_policies where schemaname='storage' and tablename='objects' order by policyname")).rows);
  const originalStoragePolicies=await storageSnapshot();
  const initial=fs.readFileSync(path.join(root,'supabase/migrations/081_partner_profile_completion.sql'),'utf8');
  await db.exec(initial);
  await db.exec(`alter table partner_profile_details add column country text,add column city text,add column korea_city_other text,add column conversation_preferences jsonb;
   alter table partner_profile_details drop constraint partner_profile_completion_required;
   grant select,update on profiles to service_role;`);
  await db.exec(baseline);
  await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/profile-image-auth-live.sql'),'utf8'));
  await db.exec('create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();create trigger on_social_user_created after insert on auth.users for each row execute function handle_social_user_signup();');
  await db.exec("create table bookings(id uuid primary key,learner_id uuid,partner_user_id uuid,status text,language text,conversation_brief jsonb)");
  const briefSource=fs.readFileSync(path.join(root,'supabase/migrations/062_partner_booking_learner_display.sql'),'utf8');
  await db.exec(briefSource.slice(briefSource.indexOf('create or replace function public.get_partner_booking_brief'),briefSource.indexOf("notify pgrst")));
  assert.equal((await db.query("select md5(pg_get_functiondef('get_partner_booking_brief(uuid)'::regprocedure)) hash")).rows[0].hash,'d2ee4114f6da40714cefa9b382a579f9');
  const definition=(await db.query("select pg_get_functiondef('save_partner_profile_completion(jsonb)'::regprocedure) definition")).rows[0].definition;
  assert.equal(crypto.createHash('md5').update(definition).digest('hex'),'f2bd651dafb500cd3a6d3c82a08927c4','Exact production completion fingerprint');
  for(let i=0;i<ids.length;i++)await db.query('insert into profiles(id,role,avatar_url) values($1,$2,$3)',[ids[i],i===1?'user':'partner',i===0?'https://lh3.googleusercontent.com/fixture':i===1?'/images/partner-avatars/dayo-avatar-01.png':null]);
  await db.query('insert into partner_profile_details(partner_id,completed_at) values($1,now())',[ids[2]]);
  const snapshot=async()=>JSON.stringify((await db.query("select relacl,relrowsecurity from pg_class where oid='profiles'::regclass")).rows)+JSON.stringify((await db.query("select policyname,cmd,qual,with_check from pg_policies where tablename='profiles' order by policyname")).rows);
  const before=await snapshot(),legacy=(await db.query('select id,avatar_url from profiles order by id')).rows;
  // Broad PERMISSIVE policy must abort BEFORE any public-schema DB mutation.
  await db.exec("create policy unsafe_future_allow on storage.objects for all to anon,authenticated using(true) with check(true)");
  await assert.rejects(db.exec(sql),/profile_image_storage_allow_policies_changed/);await db.exec('rollback');
  assert.equal((await db.query("select to_regclass('public.profile_image_assets') name")).rows[0].name,null);
  await db.exec('drop policy unsafe_future_allow on storage.objects');
  await db.exec("update storage.buckets set public=false where id='partner-profile-images'");
  await assert.rejects(db.exec(sql),/profile_image_public_buckets_required/);await db.exec('rollback');
  await db.exec("update storage.buckets set public=true where id='partner-profile-images'");
  await db.exec(sql);
  assert.equal((await db.query('select count(*)::int n from storage.buckets where public=true')).rows[0].n,2,'Both buckets public-read; SQL object list is still denied by RLS');
  assert.equal(await snapshot(),before,'Profiles grant/RLS unchanged');
  assert.deepEqual((await db.query('select id,avatar_url from profiles order by id')).rows,legacy,'No legacy transformation');
  const login=async(role,id=ids[0])=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.role',$1,false),set_config('request.jwt.claim.sub',$2,false)",[role,id]);await db.exec('set role '+role);};
  const replace=async(user,id,bucket)=>(await db.query('select replace_profile_image_asset($1,$2,$3,100,40,40) result',[user,id,bucket])).rows[0].result;
  for(const role of ['anon','authenticated']){await login(role);await assert.rejects(db.query('select * from profile_image_assets'),/permission denied/);await assert.rejects(db.query('select * from profile_image_cleanup'),/permission denied/);await assert.rejects(replace(ids[0],image1,'partner-profile-images'),/permission denied/);}
  await login('authenticated');assert.equal((await db.query('select id,avatar_url from profiles')).rows.length,1);assert.equal((await db.query('update profiles set avatar_url=$1 where id=$2',['https://example.com/forged',ids[1]])).affectedRows,0);
  await assert.rejects(db.query("update profiles set role='admin'"),/permission denied/);
  await login('service_role');await assert.rejects(replace(ids[0],image1,'user-profile-images'),/Invalid image owner/);
  const first=await replace(ids[0],image1,'partner-profile-images');assert.equal(first.previous,null);assert.match(first.avatar_url,new RegExp(image1));
  await login('authenticated');await db.query('update profiles set avatar_url=$1 where id=$2',['https://lh3.googleusercontent.com/stale-provider',ids[0]]);assert.equal((await db.query('select avatar_url from profiles')).rows[0].avatar_url,first.avatar_url,'Provider/profile sync cannot overwrite active manual image');
  await login('service_role');let second=await replace(ids[0],image2,'partner-profile-images');assert.equal(second.previous.path,ids[0]+'/'+image1+'.webp');
  second=await replace(ids[0],image2,'partner-profile-images');assert.equal(second.previous,null);assert.equal((await db.query('select * from profile_image_cleanup')).rows.length,1,'Idempotent retry does not queue active image');
  assert.equal((await db.query('select fallback_avatar_url from profile_image_assets')).rows[0].fallback_avatar_url,'https://lh3.googleusercontent.com/stale-provider');
  await assert.rejects(db.query('select remove_user_profile_image_asset($1)',[ids[0]]),/must be replaced/);
  await replace(ids[1],image1,'user-profile-images');const removed=(await db.query('select remove_user_profile_image_asset($1) result',[ids[1]])).rows[0].result;assert.equal(removed.avatar_url,null,'No catalog/robot restoration');
  for(const photo of ['https://lh3.googleusercontent.com/current-provider','https://k.kakaocdn.net/provider','https://api.dicebear.com/7.x/bottts/svg?seed=legacy']){
   await db.query('update profiles set avatar_url=$1 where id=$2',[photo,ids[1]]);await replace(ids[1],image1,'user-profile-images');
   const result=(await db.query('select remove_user_profile_image_asset($1) result',[ids[1]])).rows[0].result;
   assert.equal(result.avatar_url,photo.includes('dicebear')?null:photo,'Provider mapping restored, never a robot');
  }
  const payload={location_status:'overseas',country:'France',city:'Paris',visa_type:'not_applicable_overseas',native_languages:['English'],other_languages:[],session_languages:['English'],korean_level:'basic',weekly_session_capacity:'3-5',guide_acknowledged:true};
  await login('authenticated',ids[2]);assert((await db.query('select save_partner_profile_completion($1::jsonb) result',[JSON.stringify(payload)])).rows[0].result.completed_at,'Actual upsert RPC preserves no-photo legacy grace');
  await db.exec('reset role');await db.query('update partner_profile_details set completed_at=now() where partner_id=$1',[ids[2]]); // Legacy no-photo grace.
  await db.query('delete from partner_profile_details where partner_id=$1',[ids[2]]);
  await assert.rejects(db.query('insert into partner_profile_details(partner_id,completed_at) values($1,now())',[ids[2]]),/Add your profile photo/);
  await db.query('update profiles set avatar_url=$1 where id=$2',['/images/partner-avatars/dayo-avatar-01.png',ids[2]]);
  await assert.rejects(db.query('insert into partner_profile_details(partner_id,completed_at) values($1,now())',[ids[2]]),/Add your profile photo/);
  await login('service_role',ids[2]);await replace(ids[2],'66666666-6666-4666-8666-666666666666','partner-profile-images');await db.exec('reset role');
  await db.query('insert into partner_profile_details(partner_id,completed_at) values($1,now())',[ids[2]]);
  await login('authenticated');assert((await db.query('select save_partner_profile_completion($1::jsonb) result',[JSON.stringify(payload)])).rows[0].result.completed_at);
  await login('authenticated',ids[1]);await assert.rejects(db.query('select save_partner_profile_completion($1::jsonb)',[JSON.stringify(payload)]),/Partner access required/);
  await db.exec('reset role');assert.equal(await snapshot(),before);assert.equal((await db.query("select pg_get_functiondef('save_partner_profile_completion(jsonb)'::regprocedure) definition")).rows[0].definition,definition);
  assert.doesNotMatch(sql,/(?:alter|update|insert into)\s+(?:table\s+)?storage\./i);
  assert.doesNotMatch(sql,/(?:create|alter|drop)\s+policy[^;]*on\s+storage\./i);
  assert.doesNotMatch(sql,/storage_policy_owner_required|alter[^;]*owner to/i);
  assert.equal(await storageSnapshot(),originalStoragePolicies,'097 does not modify Storage policies');
  for(const role of ['anon','authenticated']){await login(role);
   for(const bucket of ['partner-profile-images','user-profile-images']){await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values($1,$2)',[bucket,'forged.webp']),/row-level security/);}
   assert.equal((await db.query('select * from storage.objects')).rows.length,0);
  }
  await db.exec('reset role');
  await db.exec("insert into storage.objects(bucket_id,name) values('user-profile-images','user.webp'),('partner-profile-images','partner.webp'),('public-assets','existing.webp')");
  for(const role of ['anon','authenticated']){await login(role);assert.deepEqual((await db.query('select bucket_id from storage.objects')).rows.map(x=>x.bucket_id),['public-assets']);for(const bucket of ['user-profile-images','partner-profile-images']){assert.equal((await db.query("update storage.objects set name='overwrite' where bucket_id=$1",[bucket])).affectedRows,0);assert.equal((await db.query('delete from storage.objects where bucket_id=$1',[bucket])).affectedRows,0);}}
  await login('service_role');assert.equal((await db.query('select * from storage.objects')).rows.length,3,'Service-role Storage access');await db.query("insert into storage.objects(bucket_id,name) values('user-profile-images','server-only.webp')");
  await db.exec('reset role');
  const sources=[['77777777-7777-4777-8777-777777777777','email',{},null],['88888888-8888-4888-8888-888888888888','google',{picture:'https://lh3.googleusercontent.com/google'},'https://lh3.googleusercontent.com/google'],['99999999-9999-4999-8999-999999999999','kakao',{profile_image:'https://k.kakaocdn.net/kakao'},'https://k.kakaocdn.net/kakao']];
  for(const [id,provider,meta,photo] of sources){await db.query('insert into auth.users values($1,$2,$3,$4)',[id,'fixture@example.test',JSON.stringify({provider}),JSON.stringify(meta)]);const row=(await db.query('select role,ticket_count,avatar_url,provider from profiles where id=$1',[id])).rows[0];assert.deepEqual(row,{role:'user',ticket_count:0,avatar_url:photo,provider});}
  const googleLegacy='88888888-8888-4888-8888-888888888888';
  await db.query("update profiles set role='partner',avatar_url='https://api.dicebear.com/7.x/bottts/svg?seed=legacy' where id=$1",[googleLegacy]);
  await login('authenticated',googleLegacy);await assert.rejects(db.query('select save_partner_profile_completion($1::jsonb)',[JSON.stringify(payload)]),/Add your profile photo/,'No new Auth metadata resolver behind legacy rows');
  assert.match((await db.query('select avatar_url from profiles')).rows[0].avatar_url,/dicebear/,'No implicit legacy backfill');
  await db.exec('reset role');
  // 098 self-edit ownership still holds after adding the image trigger.
  await login('authenticated',ids[0]);const {visa_type,location_status,...edit}=payload;const done=(await db.query('select save_partner_profile_completion($1::jsonb) result',[JSON.stringify({...edit,korean_level:'advanced'})])).rows[0].result;
  await assert.rejects(db.query('select save_partner_profile_completion($1::jsonb)',[JSON.stringify({...edit,visa_type:'D-2'})]),/cannot be changed/);
  await assert.rejects(db.query('select save_partner_profile_completion($1::jsonb)',[JSON.stringify({...edit,completed_at:'2000-01-01'})]),/protected/);
  const again=(await db.query('select save_partner_profile_completion($1::jsonb) result',[JSON.stringify(edit)])).rows[0].result;assert.equal(done.completed_at,again.completed_at);assert.equal(done.partner_guide_acknowledged_at,again.partner_guide_acknowledged_at);
  await db.exec('reset role');
  assert.doesNotMatch(sql,/(?:update|alter|insert into)\s+(?:table\s+)?public\.(bookings|ticket_lots|partner_capabilities|availability_slots)\b/i);
  await db.exec('reset role');
  const booking='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await db.query('insert into bookings values($1,$2,$3,$4,$5,$6)',[booking,ids[1],ids[0],'confirmed','en',JSON.stringify({interests:['travel']})]);
  await db.query('update profiles set avatar_url=$1 where id=$2',['https://lh3.googleusercontent.com/user-photo',ids[1]]);
  await login('authenticated',ids[0]);let brief=(await db.query('select get_partner_booking_brief($1) result',[booking])).rows[0].result;assert.equal(brief.learner_avatar_url,'https://lh3.googleusercontent.com/user-photo');assert.deepEqual(brief.conversation_brief,{interests:['travel']});
  for(const id of [ids[1],ids[2]]){await login('authenticated',id);assert.equal((await db.query('select get_partner_booking_brief($1) result',[booking])).rows[0].result,null);}
  await login('anon');await assert.rejects(db.query('select get_partner_booking_brief($1)',[booking]),/permission denied/);
  await db.exec('reset role');await db.query('update bookings set status=$1 where id=$2',['cancelled',booking]);await login('authenticated',ids[0]);assert.equal((await db.query('select get_partner_booking_brief($1) result',[booking])).rows[0].result,null);
  assert.doesNotMatch(sql,/create or replace function public.list_public_partner_profiles/i);
  console.log('PASS profile-image SQL: exact live completion fingerprint; server-only mapping/RPC grants; owner/forbidden profiles access; manual > OAuth; replace/idempotency/fallback/cleanup; required new photo + legacy grace; live 4-permissive/7-restrictive policy fixture; browser CRUD denied on BOTH buckets without new policies; service-role access; fail-closed policy/bucket preflight; no Storage DDL/owner or booking changes.');
 }finally{await db.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
