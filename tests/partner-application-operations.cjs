const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '..');
const adminId = '11111111-1111-4111-8111-111111111111';
const userId = '33333333-3333-4333-8333-333333333333';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const literal = value => value === null ? 'null' : Array.isArray(value) ? 'array[' + value.map(literal).join(',') + ']::text[]' : typeof value === 'object' ? literal(JSON.stringify(value)) + '::jsonb' : typeof value === 'boolean' ? String(value) : "'" + String(value).replace(/'/g,"''") + "'";
const insert = app => 'insert into public.partner_applications (' + Object.keys(app).join(',') + ') values (' + Object.values(app).map(literal).join(',') + ')';
const base = { full_name:'Jane Applicant', email:'fixture@example.invalid', contact_method:'Email', nationality:'Canada', current_city:'Toronto', university:'Toronto University', visa_type:'Other', strongest_language:'English', partner_languages:['English'], korean_level:'basic', stranger_conversation_comfort:'comfortable', availability_periods:['weekday_evening'], weekly_session_capacity:'3-5', device:'laptop_pc', video_environment:'yes', scenario_answer:'A'.repeat(100), motivation:'Legacy answer', privacy_consent:true };
async function database() {
  const db = new PGlite();
  try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.profiles(id uuid primary key,role text); insert into public.profiles values ('${adminId}','admin'),('${userId}','user');
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated,service_role; grant select on storage.objects to anon,authenticated;
    create policy broad_read on storage.objects for select to anon,authenticated using(true);`);
  const helper = read('supabase/migrations/039_secure_bookings_rls.sql');
  await db.exec(helper.slice(helper.indexOf('create or replace function public.dayo_is_admin()'), helper.indexOf('-- Remove the broad production policies')));
  await db.exec(read('supabase/migrations/077_partner_applications.sql'));
  await db.exec(insert(base));
  await db.exec(read('supabase/migrations/078_partner_application_profile_fields.sql'));
  const legacy = (await db.query('select to_jsonb(a) data from public.partner_applications a')).rows[0].data;
  await db.exec(read('supabase/migrations/080_partner_application_operations.sql'));
  const after = (await db.query('select to_jsonb(a) data from public.partner_applications a')).rows[0].data;
  for (const key of Object.keys(legacy)) assert.deepEqual(after[key], legacy[key], 'Legacy field changed: ' + key);
  assert.equal(after.first_viewed_at, null); assert.equal(after.shortlisted, false);
  assert.equal((await db.query('select count(*)::int n from public.partner_application_notifications')).rows[0].n, 0, 'No historical email backfill');
  async function submit(email) {
    await db.exec('reset role');
    const upload = (await db.query('select public.issue_partner_application_upload($1,$2) media', ['a'.repeat(64),'webm'])).rows[0].media;
    await db.query("insert into storage.objects(bucket_id,name) values ('partner-application-videos',$1)", [upload.video_path]);
    const app = { ...base, email, current_country:'Canada', native_languages:['English','French'], other_language_proficiencies:{Japanese:'fluent'}, partner_languages:['English','Japanese'], visa_type:'outside_korea', media_upload_id:upload.id, intro_video_path:upload.video_path, intro_video_language:'Japanese' };
    delete app.motivation;
    await db.exec('set role anon'); await db.exec(insert(app)); await db.exec('reset role');
    return (await db.query('select * from public.partner_applications where email=$1', [email])).rows[0];
  }
  const app = await submit('new@example.invalid');
  const job = (await db.query('select * from public.partner_application_notifications')).rows[0];
  assert.equal(app.review_score, 7); assert.equal(app.review_status,'ready'); assert.equal(job.application_id,app.id);
  assert.deepEqual(Object.keys(job.payload).sort(), ['full_name','nationality','native_languages','partner_languages','current_country','visa_type','weekly_session_capacity','review_score','review_status'].sort());
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub','${userId}',false)`);
    await assert.rejects(db.query('select * from public.partner_application_notifications'), /permission denied/);
    await assert.rejects(db.query('select public.claim_partner_application_notification($1)', [app.id]), /permission denied/);
    await assert.rejects(db.query('select public.finish_partner_application_notification($1,$2,$3,$4)', [app.id,adminId,'id',null]), /permission denied/);
    await assert.rejects(db.query('select public.mark_partner_application_viewed($1)', [app.id]), /permission denied|Admin access/);
    await assert.rejects(db.query('update public.partner_applications set first_viewed_at=now()'), /permission denied/);
    await assert.rejects(db.exec(insert({...base,shortlisted:true})), /permission denied/);
    await assert.rejects(db.exec(insert({...base,first_viewed_at:'2026-01-01'})), /permission denied/);
    if (role === 'authenticated') {
      assert.equal((await db.query('update public.partner_applications set shortlisted=true returning id')).rows.length,0);
      assert.equal((await db.query('select * from public.partner_applications')).rows.length,0);
    }
    await db.exec('reset role');
  }
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${adminId}',false)`);
  const viewed = (await db.query('select (public.mark_partner_application_viewed($1)).first_viewed_at time', [app.id])).rows[0].time;
  assert(viewed); assert.equal(String((await db.query('select (public.mark_partner_application_viewed($1)).first_viewed_at time', [app.id])).rows[0].time),String(viewed));
  await db.query("update public.partner_applications set shortlisted=true,review_note='Camera comfortable' where id=$1", [app.id]);
  assert.equal((await db.query('select shortlisted from public.partner_applications where id=$1',[app.id])).rows[0].shortlisted,true);
  for (const final of ['hold','rejected','approved']) {
    await db.query('update public.partner_applications set final_status=$1 where id=$2',[final,app.id]);
    assert.equal((await db.query('select final_status from public.partner_applications where id=$1',[app.id])).rows[0].final_status,final);
  }
  await assert.rejects(db.query('select * from public.partner_application_notifications'), /permission denied/, 'Admin browser cannot read notification queue');
  assert.equal((await db.query("select * from storage.objects where bucket_id='partner-application-videos'")).rows.length,1);
  await db.exec('reset role; set role service_role');
  const claim = (await db.query('select public.claim_partner_application_notification($1) job',[app.id])).rows[0].job;
  assert(claim.lease_token); assert.equal((await db.query('select public.claim_partner_application_notification($1) job',[app.id])).rows[0].job,null);
  assert.equal((await db.query('select public.finish_partner_application_notification($1,$2,$3,$4) ok',[app.id,adminId,'wrong',null])).rows[0].ok,false);
  await db.query('select public.finish_partner_application_notification($1,$2,$3,$4)',[app.id,claim.lease_token,null,'provider_503']);
  const retry = (await db.query('select public.claim_partner_application_notification($1) job',[app.id])).rows[0].job;
  assert.deepEqual(retry.payload,claim.payload); assert.notEqual(retry.lease_token,claim.lease_token);
  await db.query('select public.finish_partner_application_notification($1,$2,$3,$4)',[app.id,retry.lease_token,'resend-fixture',null]);
  assert.equal((await db.query('select public.claim_partner_application_notification($1) job',[app.id])).rows[0].job,null);
  const sent = (await db.query('select * from public.partner_application_notifications where application_id=$1',[app.id])).rows[0];
  assert(sent.sent_at); assert.equal(sent.attempts,2); assert.equal(sent.last_error,null);
  // A local outbox failure is caught as well: a valid public application still saves.
  await db.exec(`reset role; create function public.fail_outbox_fixture() returns trigger language plpgsql as $$ begin raise exception 'fixture'; end $$;
    create trigger fixture_failure before insert on public.partner_application_notifications for each row execute function public.fail_outbox_fixture();`);
  const saved = await submit('queue-failure@example.invalid'); assert(saved.id);
  await db.exec('drop trigger fixture_failure on public.partner_application_notifications');
  const old = await submit('old-attempt@example.invalid');
  await db.query("update public.partner_application_notifications set first_attempt_at=now()-interval '24 hours' where application_id=$1",[old.id]);
  await db.exec('set role service_role');
  assert.equal((await db.query('select public.claim_partner_application_notification($1) job',[old.id])).rows[0].job,null);
  console.log('PASS: 077/078/080 SQL, legacy data preserved, New→Viewed timestamp, admin-only shortlist/notes, unchanged private media/RLS, minimal durable outbox, leases/retry/deduplication/window, queue failure preserves submission.');
  } finally { await db.close(); }
}
async function endpoint() {
  const id = '22222222-2222-4222-8222-222222222222', secret = 'fixture-secret-'.repeat(4);
  const env = { PARTNER_APPLICATION_NOTIFICATION_SECRET:secret, PARTNER_APPLICATION_NOTIFICATION_TO:'operator@example.invalid', RESEND_FROM:'DayO <notify@example.invalid>', RESEND_API_KEY:'fixture-api-key', SUPABASE_SERVICE_ROLE_KEY:'fixture-service-key', SUPABASE_URL:'https://fixture.invalid/rest/v1/' };
  let sent = false, locked = false, fail = false, sentPayload, calls = 0, errorCode, acknowledgements = 0;
  const job = { application_id:id, lease_token:adminId, payload:{ full_name:'Jane\nApplicant', nationality:'Canada', native_languages:['English'], partner_languages:['English','Japanese'], current_country:'Canada', visa_type:'outside_korea', weekly_session_capacity:'6-10', review_score:7, review_status:'ready' } };
  const sandbox = { module:{exports:{}}, process:{env}, AbortSignal, require:name => name === '@supabase/supabase-js' ? { createClient:url => {
    assert.equal(url,'https://fixture.invalid'); return { rpc: async (name,args) => {
      if (name === 'claim_partner_application_notification') { assert.equal(args.p_application_id,id); if(sent || locked) return {data:null}; locked=true;return {data:job}; }
      assert.equal(name,'finish_partner_application_notification'); assert.equal(args.p_lease_token,job.lease_token); acknowledgements++;locked=false;
      sent=!!args.p_provider_id;errorCode=args.p_error;return {data:true};
    } };
  } } : name === './_lib/transactional-email' ? require('../api/_lib/transactional-email') : require(name), fetch:async (url,options) => {
    assert.equal(url,'https://api.resend.com/emails'); assert.equal(options.headers['Idempotency-Key'],'partner-application/'+id);
    calls++;sentPayload=JSON.parse(options.body);return {ok:!fail,status:fail?503:200,json:async()=>({id:'fixture-resend'})};
  } };
  vm.runInNewContext(read('api/partner-application-notification.js'), sandbox);
  async function request(body = {application_id:id}, authorization = 'Bearer '+secret, method='POST') {
    const res = {setHeader(){},end(value){this.body=JSON.parse(value);}};
    await sandbox.module.exports({method,headers:{authorization},body},res);return res;
  }
  assert.equal((await request(undefined,undefined,'GET')).statusCode,405);
  assert.equal((await request(undefined,'Bearer wrong')).statusCode,401);
  assert.equal((await request({application_id:'bad'})).statusCode,400); assert.equal(calls,0);
  fail=true;assert.equal((await request()).statusCode,503);assert.equal(sent,false);assert.equal(errorCode,'provider_503');
  fail=false;
  const response=await request({type:'INSERT',schema:'public',table:'partner_application_notifications',record:{application_id:id,payload:{full_name:'Forged',email:'private@example.invalid',intro_video_path:'secret-video'}}});
  assert.equal(response.statusCode,200); assert.equal(sent,true); assert.equal(acknowledgements,2);
  assert.equal(sentPayload.reply_to,'hello@dayotalk.com');assert.deepEqual(sentPayload.to,['operator@example.invalid']);assert.equal(sentPayload.subject,'[DayO] New Partner Application — Jane Applicant / English, Japanese');
  assert(sentPayload.text.includes('?application='+id));assert(sentPayload.text.includes('Overseas'));assert(sentPayload.text.includes('Not applicable'));
  for(const privateValue of ['private@example.invalid','secret-video','fixture-service-key','fixture-api-key','Forged']) assert(!JSON.stringify(sentPayload).includes(privateValue));
  await request(); assert.equal(calls,2,'Already sent job must not send again');
  sent=false; delete env.RESEND_FROM; await request();assert.equal(sentPayload.from,'DayO <hello@dayotalk.com>','Reuse the existing welcome email sender');
  env.PARTNER_APPLICATION_NOTIFICATION_TO='';assert.equal((await request()).statusCode,503);
  console.log('PASS: notification authentication/config/method/body, server-authoritative minimal email, no contact/media URL/secrets, failure leaves retryable job, success and duplicate suppression (mock Resend).');
}
async function helpers() {
  const ts=require(path.join(root,'admin/node_modules/typescript'));
  const module={exports:{}};
  const code=ts.transpileModule(read('admin/src/lib/partner-applications.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(code,{exports:module.exports,require:()=>({supabase:{}})});
  const {selectApplications,emptyFilters,applicationResidence}=module.exports;
  const rows = [
    {...base,id:'a',full_name:'Zoë',submitted_at:'2026-01-01',native_languages:['English'],other_language_proficiencies:{Japanese:'fluent'},shortlisted:true,current_country:'Canada',review_score:7,review_status:'ready',final_status:'pending'},
    {...base,id:'b',full_name:'Alice',submitted_at:'2026-01-03',first_viewed_at:'2026-01-04',native_languages:['Korean'],partner_languages:['Korean'],current_country:'South Korea',visa_type:'F-series',weekly_session_capacity:'10+',review_score:3,review_status:'review',final_status:'approved',acquisition_source:'instagram'},
    {...base,id:'c',full_name:'Bob',submitted_at:'2026-01-02',review_score:1,review_status:'hold',final_status:'hold',weekly_session_capacity:'1-2'},
  ];
  const ids=(filters={},query='',sort='newest')=>Array.from(selectApplications(rows,{...emptyFilters,...filters},query,sort),x=>x.id);
  assert.deepEqual(ids(),['b','c','a']); assert.deepEqual(ids({},'','oldest'),['a','c','b']);assert.deepEqual(ids({},'','name'),['b','c','a']);
  assert.deepEqual(ids({},'','score'),['a','b','c']);assert.deepEqual(ids({},'','capacity'),['b','a','c']);
  assert.deepEqual(ids({viewed:'new',review:'ready',shortlist:'only',residence:'overseas',native:'English',capacity:'3-5'},'JAPAN'),['a']);assert(!('availability' in emptyFilters));
  assert.deepEqual(ids({viewed:'viewed',visa:'F-series',capacity:'10+',source:'instagram',final:'approved',session:'Korean'}),['b']);
  assert.deepEqual(ids({native:'English',residence:'korea'}),[]);
  for(const query of ['fixture@','toronto university','canad']) assert.equal(ids({},query).length,3);
  assert.equal(applicationResidence(rows[2]),'unknown','Do not invent legacy resident/native status');assert.deepEqual(ids({native:'English'}),['a']);
  assert.equal(rows[0].id,'a','Sorting must not mutate original list');
  // Exercise the real SDK batching logic beyond the default 1,000-row limit.
  const all = Array.from({length:1201},(_,i)=>({...rows[0],id:String(i)}));
  const ranges=[]; const pagedModule={exports:{}};
  const query={select(){return this},order(){return this},async range(from,to){ranges.push([from,to]);return {data:all.slice(from,to+1)}}};
  vm.runInNewContext(code,{exports:pagedModule.exports,require:()=>({supabase:{from:()=>query}})});
  assert.equal((await pagedModule.exports.listApplications()).length,1201);
  assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499]]);
  console.log('PASS: five sort modes, combined filters, partial/case-insensitive name/contact/university/nationality/language search, explicit legacy unknowns.');
}
async function browser() {
  if(!process.env.PARTNER_ADMIN_QA_URL) return;
  const {chromium}=require('playwright');
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    const user={id:adminId,email:'admin@example.invalid',role:'authenticated',aud:'authenticated',app_metadata:{},user_metadata:{}};
    const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:adminId,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
    await page.addInitScript(session=>localStorage.setItem('sb-mmhapsimcngmtefqfrcg-auth-token',JSON.stringify(session)),{access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user});
    let rows=[
      {...base,id:'22222222-2222-4222-8222-222222222222',full_name:'Zoë New',email:'zoe@example.invalid',review_note:'',test_status:'not_invited',final_status:'pending',review_status:'ready',review_score:7,submitted_at:'2026-01-01',native_languages:['English'],current_country:'Canada',visa_type:'outside_korea',shortlisted:false},
      {...base,id:'44444444-4444-4444-8444-444444444444',full_name:'Alice Viewed',email:'alice@example.invalid',review_note:'Existing note',test_status:'completed',final_status:'approved',review_status:'review',review_score:3,submitted_at:'2026-01-03',native_languages:['Korean'],partner_languages:['Korean'],current_country:'Korea',visa_type:'F-series',weekly_session_capacity:'10+',shortlisted:true,first_viewed_at:'2026-01-04'},
      {...base,id:'55555555-5555-4555-8555-555555555555',full_name:'Bob Hold',email:'bob@example.invalid',review_note:'',test_status:'not_invited',final_status:'hold',review_status:'hold',review_score:1,weekly_session_capacity:'1-2',submitted_at:'2026-01-02',shortlisted:false},
    ];
    let viewedCalls=0;
    await page.route('**/*.supabase.co/**',async route=>{
      const url=route.request().url();let body=[];
      if(url.includes('/auth/v1/')) body=user;
      else if(url.includes('/rest/v1/profiles')) body={id:adminId,role:'admin',email:user.email};
      else if(url.includes('/rpc/mark_partner_application_viewed')) {
        assert.equal(route.request().headers().accept,'application/vnd.pgrst.object+json');
        viewedCalls++;const id=route.request().postDataJSON().p_id;rows=rows.map(row=>row.id===id?{...row,first_viewed_at:row.first_viewed_at || new Date().toISOString()}:row);body=rows.find(row=>row.id===id);
      } else if(url.includes('/rest/v1/partner_applications')) {
        if(route.request().method()==='PATCH') {
          const id=new URL(url).searchParams.get('id').replace('eq.','');const patch=route.request().postDataJSON();rows=rows.map(row=>row.id===id?{...row,...patch}:row);body=rows.find(row=>row.id===id);
        } else body=rows;
      }
      await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.routeWebSocket('**/*.supabase.co/**',socket=>socket.close());
    await page.goto(process.env.PARTNER_ADMIN_QA_URL);
    await page.getByRole('button',{name:'Zoë New',exact:true}).waitFor({timeout:60000});
    const names=async()=>page.locator('tbody td:nth-child(2) button').allTextContents();
    assert.deepEqual(await names(),['Alice Viewed','Bob Hold','Zoë New']);
    await page.getByLabel('Sort',{exact:true}).selectOption('score');assert.deepEqual(await names(),['Zoë New','Alice Viewed','Bob Hold']);
    await page.getByLabel('Sort',{exact:true}).selectOption('oldest');assert.deepEqual(await names(),['Zoë New','Bob Hold','Alice Viewed']);
    await page.getByLabel('Sort',{exact:true}).selectOption('capacity');assert.deepEqual(await names(),['Alice Viewed','Zoë New','Bob Hold']);
    await page.getByLabel('Sort',{exact:true}).selectOption('name');assert.deepEqual(await names(),['Alice Viewed','Bob Hold','Zoë New']);
    await page.locator('summary').filter({hasText:'Filters'}).click();
    await page.getByLabel('Native language',{exact:true}).selectOption('English');
    await page.getByLabel('Current residence',{exact:true}).selectOption('overseas');
    await page.getByLabel('Final status',{exact:true}).selectOption('pending');
    await page.getByLabel('Search applications',{exact:true}).fill('ZOE@');assert.deepEqual(await names(),['Zoë New']);
    await page.getByRole('button',{name:'Shortlist Zoë New',exact:true}).click();await page.waitForFunction(()=>document.querySelector('tbody button[aria-label="Shortlist Zoë New"]').getAttribute('aria-pressed')==='true');
    await page.getByLabel('Shortlist',{exact:true}).selectOption('only');assert.deepEqual(await names(),['Zoë New']);
    await page.getByRole('button',{name:'Clear filters',exact:true}).click();assert.equal((await names()).length,3);
    await page.getByRole('button',{name:'New [2]',exact:true}).click();assert.equal((await names()).length,2);
    await page.getByRole('button',{name:'Zoë New',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[role=dialog] section[aria-label="Review tools"]').innerText.includes('Viewed'));
    assert.equal(viewedCalls,1);await page.getByLabel('Review note',{exact:true}).fill('Strong storyteller');
    await page.getByRole('button',{name:'Save note',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[role=dialog]').innerText.includes('저장했습니다'));
    assert.equal(rows[0].review_note,'Strong storyteller');assert.equal(rows[0].test_status,'not_invited');
    await page.getByRole('button',{name:'Shortlist Zoë New',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[role=dialog] button[aria-label="Shortlist Zoë New"]').getAttribute('aria-pressed')==='false');
    await page.getByRole('button',{name:'Close',exact:true}).click();assert.equal((await names()).length,1);
    await page.getByRole('button',{name:'Clear filters',exact:true}).click();
    assert.equal(await page.locator('tbody [aria-label="Review note saved"]').count(),2);
    await page.getByRole('button',{name:'Zoë New',exact:true}).click();assert.equal(viewedCalls,1,'Reopen should preserve first view');await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.screenshot({path:process.env.PARTNER_OPERATIONS_QA_DIR+'/operations-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.getByRole('button',{name:'Zoë New',exact:true}).waitFor();assert.equal(await page.locator('video').count(),0,'No video in list');
    await page.screenshot({path:process.env.PARTNER_OPERATIONS_QA_DIR+'/operations-mobile.png',fullPage:true});
    await page.getByRole('button',{name:'Zoë New',exact:true}).click();await page.getByLabel('Review note',{exact:true}).waitFor({state:'visible'});await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.goto(process.env.PARTNER_ADMIN_QA_URL+'?application='+rows[1].id);await page.getByRole('dialog').waitFor();assert((await page.getByRole('dialog').innerText()).includes('Alice Viewed'));
    console.log('PASS: admin desktop/mobile list, counts, five sorts, filter combinations/search/clear, list/detail shortlist, first-view tracking, note persistence/indicator, email deep link (mock backend).');
  } finally {await browser.close();}
}
(async()=>{await database();await endpoint();await helpers();await browser()})().catch(error=>{console.error(error);process.exitCode=1});
