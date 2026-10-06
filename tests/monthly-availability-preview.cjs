// Loopback-only UI harness. RPCs execute migration 084 in in-memory PostgreSQL.
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.PGLITE_PATH||'@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),partner='22222222-2222-4222-8222-222222222222',learner='33333333-3333-4333-8333-333333333333';
(async()=>{
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,role text);
 create function dayo_is_admin() returns boolean language sql security definer as $$select false$$;
 create table availability_slots(id uuid primary key default gen_random_uuid(),partner_id uuid,slot_time text,status text default 'available' constraint availability_slots_status_check check(status in('available','booked')),created_at timestamptz default now(),updated_at timestamptz default now(),unique(partner_id,slot_time));
 create table bookings(id uuid primary key default gen_random_uuid(),slot_id uuid,partner_id uuid,status text,scheduled_at timestamptz);
 insert into profiles values('${partner}','partner'),('${learner}','user');
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;grant select on profiles to authenticated;
 insert into availability_slots(partner_id,slot_time) values('${partner}','weekly:mon|10:00'),('${partner}','weekly:fri|10:00');
 insert into availability_slots(partner_id,slot_time,status) values('${partner}',to_char((((clock_timestamp() at time zone 'Asia/Seoul')::date+2)+time '10:30'),'YYYY-MM-DD"T"HH24:MI:SS'),'booked');
 insert into bookings(partner_id,slot_id,status,scheduled_at) select partner_id,id,'confirmed',slot_time::timestamp at time zone 'Asia/Seoul' from availability_slots where status='booked';`);
 await db.exec("insert into availability_slots(partner_id,slot_time) select '"+partner+"',to_char(s,'YYYY-MM-DD\"T\"HH24:MI:SS') from (select date_trunc('hour',clock_timestamp() at time zone 'Asia/Seoul')+interval '30 minutes'*(floor(extract(minute from clock_timestamp() at time zone 'Asia/Seoul')/30)+1) s) q where s::time between time '08:30' and time '23:00' on conflict(partner_id,slot_time) do nothing");
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/084_partner_monthly_availability.sql'),'utf8'));
 let chain=Promise.resolve();
 const names={get_partner_monthly_schedule:['select get_partner_monthly_schedule() as data',()=>[]],save_partner_weekly_template:['select save_partner_weekly_template($1::jsonb) as data',a=>[JSON.stringify(a.p_slots)]],save_partner_availability_override:['select save_partner_availability_override($1::date,$2::text,$3::text[]) as data',a=>[a.p_date,a.p_mode,a.p_custom_slots]],apply_partner_weekly_template:['select apply_partner_weekly_template() as data',()=>[]],get_booking_calendar_slots:['select get_booking_calendar_slots($1::uuid[]) as data',a=>[a.p_partner_ids]]};
 function qaHandle(req,res){let body='';req.on('data',c=>body+=c);req.on('end',()=>{chain=chain.then(async()=>{let output;try{
   const input=JSON.parse(body||'{}');await db.exec('reset role');
   if(req.url==='/qa/slots'){output={data:(await db.query('select * from availability_slots where partner_id=$1 order by id',[partner])).rows,error:null};}
   else{const entry=names[input.name];if(!entry)throw new Error('Unknown local fixture RPC');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[input.role==='user'?learner:partner]);await db.exec('set role authenticated');let result=await db.query(entry[0],entry[1](input.args||{}));output={data:result.rows[0].data,error:null};}
  }catch(e){output={data:null,error:{message:e.message,code:e.code}};}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(output));});});}
 let source=fs.readFileSync(path.join(__dirname,'partner-dashboard-preview.cjs'),'utf8');
 source=source.replace("const key='dayo-language-location-local-qa', listeners=[];","const apiFetch=window.fetch.bind(window);const key='dayo-monthly-local-qa', listeners=[];");
 source=source.replace('rpc:async(name,args)=>{',"rpc:async(name,args)=>{if(['get_partner_monthly_schedule','save_partner_weekly_template','save_partner_availability_override','apply_partner_weekly_template','get_booking_calendar_slots'].includes(name))return apiFetch('/qa/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args,role})}).then(r=>r.json());");
 source=source.replace("from:table=>{let changes,inserted;",`from:table=>{if(table==='availability_slots'){let filters={},offset=0,end=499;const q={select(){return this},eq(k,v){filters[k]=v;return this},order(){return this},range(a,b){offset=a;end=b;return this},then(resolve,reject){return apiFetch('/qa/slots',{method:'POST'}).then(r=>r.json()).then(r=>({data:r.data.filter(s=>Object.entries(filters).every(([k,v])=>s[k]===v)).slice(offset,end+1),error:r.error})).then(resolve,reject)}};return q;}let changes,inserted;`);
 source=source.replace("'availability-slots.js',", "'availability-slots.js','availability-calendar.js','partner-monthly-availability.js',");
 source=source.replace("http.createServer((req,res)=>{", "http.createServer((req,res)=>{if(req.url.startsWith('/qa/'))return qaHandle(req,res);if(req.url.startsWith('/booking-qa'))return qaBooking(req,res);");
 source=source.replace("conversation_brief:{purposes:['casual'],interests:['food_cafe'],chat_style:'casual',chat_request:'gentle',partner_preference:'slow'}","conversation_brief:{schema_version:1,korean_support_preference:'required',purposes:['travel'],interests:['food_cafe'],conversation_style:'encourage'}");
 source=source.replaceAll("3048", "3049").replace("z-index:3000", "z-index:1");
 function qaBooking(req,res){
   let html=fs.readFileSync(path.join(__dirname,'smart-booking-fixture.html'),'utf8').replaceAll('../public/','/');
   html=html.replace("id: 'jen'","id: '"+partner+"'").replace("id: 'alex'","id: '44444444-4444-4444-8444-444444444444'").replace("id: 'unset'","id: '55555555-5555-4555-8555-555555555555'");
   html=html.replace('rpc: function (name) {',"rpc: function (name,args) {if(name==='get_booking_calendar_slots')return fetch('/qa/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args,role:'user'})}).then(r=>r.json());");
   html=html.replace("name === 'list_public_partner_profiles'", "(name === 'list_public_partner_profiles' || name === 'list_matching_partner_profiles')");
   html=html.replace("window._dayoAuthUser =","localStorage.setItem('dayo_lang','"+(new URL(req.url,'http://127.0.0.1').searchParams.get('qa-lang')==='EN'?'EN':'KO')+"'); window._dayoAuthUser =");
   html=html.replace('</head>','<link rel="stylesheet" href="/availability-calendar.css"></head>');
   res.setHeader('Content-Type','text/html');res.end(html);
 }
 new Function('require','__dirname','qaHandle','qaBooking',source)(require,__dirname,qaHandle,qaBooking);
 console.log('084 in-memory PostgreSQL UI: http://127.0.0.1:3049/partner?qa-booking=many&qa-brief');
})().catch(e=>{console.error(e);process.exitCode=1});
