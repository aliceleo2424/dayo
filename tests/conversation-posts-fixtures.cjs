'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const {PGlite}=require('@electric-sql/pglite'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const admin='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',user='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',partner='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
let checks=0;function equal(a,b,label){assert.deepEqual(a,b,label);checks++;}function ok(v,label){assert.ok(v,label);checks++;}
async function actor(db,id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id||'',role]);await db.exec('set role '+role);}
async function dbChecks(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 grant usage on schema public,auth to anon,authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 create table profiles(id uuid primary key,role text,email text,admin_memo text);
 create function dayo_is_admin() returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin')$$;
 revoke all on function dayo_is_admin() from public,anon;grant execute on function dayo_is_admin() to authenticated;
 alter table profiles enable row level security;grant select(id,role) on profiles to authenticated;
 create policy owner_profile on profiles for select to authenticated using(id=auth.uid());
 create table articles(id uuid primary key default gen_random_uuid(),title text not null,category text default '대화팁',summary text,content text not null,thumbnail_url text,is_published boolean default true,created_at timestamptz default now(),published boolean default true);
 alter table articles enable row level security;grant all on articles to anon,authenticated,service_role;
 create policy "Anyone can read published articles" on articles for select using(is_published=true or auth.role()='authenticated');
 create policy "Authenticated users can insert articles" on articles for insert with check(auth.role()='authenticated');
 create policy "Authenticated users can delete articles" on articles for delete using(auth.role()='authenticated');
 create policy "Allow public read articles" on articles for select using(true);
 create policy "Allow authenticated insert articles" on articles for insert to authenticated with check(true);
 create policy "Allow authenticated update articles" on articles for update to authenticated using(true) with check(true);
 create policy "Allow authenticated delete articles" on articles for delete to authenticated using(true);
 create schema storage;grant usage on schema storage to anon,authenticated;
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null);
 alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to anon,authenticated;
 create policy existing_broad_storage on storage.objects for all to anon,authenticated using(true) with check(true);`);
 await db.query("insert into profiles values($1,'admin','private-admin','private-memo'),($2,'user','private-user','private-memo'),($3,'partner','private-partner','private-memo')",[admin,user,partner]);
 await db.exec("insert into articles(title,content,is_published,published,created_at) values('Legacy','Old body',true,true,null)");
 const before=(await db.query('select * from articles')).rows[0];
 const live=JSON.parse(read('tests/fixtures/conversation-posts-production-contract.json'));
 equal((await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='articles' order by ordinal_position")).rows.map(r=>r.column_name),live.columns.map(c=>c.name),'fixture starts at audited live schema');
 equal((await db.query("select policyname from pg_policies where schemaname='public' and tablename='articles'")).rows.map(r=>r.policyname).sort(),live.policies.map(p=>p.name).sort(),'fixture starts at audited broad policies');
 const profilePolicies=(await db.query("select policyname,qual from pg_policies where tablename='profiles'")).rows;
 await db.exec(read('supabase/migrations/094_conversation_posts_cms.sql'));
 const after=(await db.query('select * from articles')).rows[0];for(const k of Object.keys(before))equal(after[k],before[k],'legacy '+k+' preserved');
 equal((await db.query("select policyname,qual from pg_policies where tablename='profiles'")).rows,profilePolicies,'profiles security untouched');
 await actor(db,admin);
 const draft=(await db.query("insert into articles(title,summary,content,slug,partner_id,author_type,author_display_name,interests,purposes) values('Draft','Excerpt','<script>alert(1)</script>','test-story',$1,'partner','Public partner',array['food_cafe','travel'],array['casual']) returning *",[partner])).rows[0];
 equal(draft.is_published,false,'draft default');equal(draft.published,false,'legacy flag synchronized');
 const media=(await db.query("insert into storage.objects(bucket_id,name) values('public-assets','magazine/cover.png') returning id")).rows[0].id;
 await actor(db,null,'anon');equal((await db.query('select public.get_published_conversation_post($1) as post',[draft.id])).rows[0].post,null,'draft UUID blocked');equal((await db.query("select get_published_conversation_post('test-story') as post")).rows[0].post,null,'draft slug blocked');
 equal((await db.query('select id from storage.objects where id=$1',[media])).rows.length,1,'CMS public image read remains available');
 equal((await db.query('select id from articles where id=$1',[draft.id])).rows.length,0,'direct draft table read blocked');
 for(const [id,role] of [[null,'anon'],[user,'authenticated'],[partner,'authenticated']]){
  await actor(db,id,role);
  await assert.rejects(db.query("insert into articles(title,content) values('Unauthorized','x')"));checks++;
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('public-assets','magazine/injected.png')"));checks++;
  equal((await db.query('update storage.objects set name=$1 where id=$2 returning id',['magazine/replaced.png',media])).rows.length,0,'CMS cover cannot be overwritten');
  equal((await db.query('delete from storage.objects where id=$1 returning id',[media])).rows.length,0,'CMS cover cannot be deleted');
  const own=(await db.query("insert into storage.objects(bucket_id,name) values('public-assets','avatars/existing-path.png') returning id")).rows[0].id;
  await assert.rejects(db.query("update storage.objects set name='magazine/moved.png' where id=$1",[own]));checks++;
  equal((await db.query('delete from storage.objects where id=$1 returning id',[own])).rows.length,1,'unrelated storage path unchanged');
  const update=await db.query('update articles set title=$1 where id=$2 returning id',['Unauthorized',before.id]).catch(()=>({rows:[]}));equal(update.rows.length,0,'non-admin update blocked');
  const del=await db.query('delete from articles where id=$1 returning id',[before.id]).catch(()=>({rows:[]}));equal(del.rows.length,0,'non-admin delete blocked');
 }
 await actor(db,admin);equal((await db.query('select id from articles')).rows.length,2,'admin draft read');
 await db.query('update articles set is_published=true,featured=true,sort_order=-1 where id=$1',[draft.id]);
 await actor(db,null,'anon');const posts=(await db.query('select list_published_conversation_posts() as post')).rows.map(r=>r.post);equal(posts[0].id,draft.id,'featured/sort ordering');
 ok(!JSON.stringify(posts).includes('private-'),'no private profile join');ok(!('body' in posts[0]),'list excludes body');
 const detail=(await db.query("select get_published_conversation_post('test-story') as post")).rows[0].post;equal(detail.interests,['food_cafe','travel'],'canonical metadata read');equal(detail.body,'<script>alert(1)</script>','body is stored unchanged for safe renderer');
 await actor(db,admin);
 for(const sql of ["interests=array['invalid']","interests=array['music','travel','games','movies','pets']","interests=array['music','music']","purposes=array['invalid']","language='xx'","partner_id='"+user+"'"]){await assert.rejects(db.query('update articles set '+sql+' where id=$1',[draft.id]));checks++;}
 await db.query('update articles set is_published=false where id=$1',[draft.id]);await actor(db,user);
 equal((await db.query('select get_published_conversation_post($1) as post',[draft.id])).rows[0].post,null,'unpublish direct detail blocked even authenticated');
 await db.exec('reset role');const functions=(await db.query("select proname,prosecdef,proconfig from pg_proc where proname in ('list_published_conversation_posts','get_published_conversation_post','prepare_conversation_post')")).rows;
 equal((await db.query("select has_function_privilege('anon','dayo_is_admin()','execute') as allowed")).rows[0].allowed,false,'existing helper ACL not widened');
 equal(functions.filter(f=>f.prosecdef).map(f=>f.proname),['prepare_conversation_post'],'only validation trigger privileged');functions.forEach(f=>ok(f.proconfig.includes('search_path=""'),'fixed empty search path'));
 await db.close();
}
function loadTs(rel,stubs={}){
 const ts=require('typescript'),module={exports:{}};const source=ts.transpileModule(read(rel),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 vm.runInNewContext(source,{module,exports:module.exports,require:name=>Object.hasOwn(stubs,name)?stubs[name]:name.startsWith('@/')?loadTs('admin/src/'+name.slice(2)+(fs.existsSync(path.join(root,'admin/src/'+name.slice(2)+'.tsx'))?'.tsx':'.ts'),stubs):require(name),process:{env:{}},URL,console,Date,setTimeout,clearTimeout},{filename:rel});return module.exports;
}
async function uiChecks(){
 const dom=new JSDOM('<section id="magazine" hidden data-landing-hidden><div id="cards"></div></section>',{url:'https://www.dayotalk.com/',runScripts:'outside-only'});const w=dom.window;
 const post={id:'fixture-id',slug:'test-story',title:'<img src=x onerror=alert(1)>',excerpt:'An honest story',cover_image:'javascript:alert(1)',author_display_name:'Public partner',country:'Korea',language:'en',interests:['food_cafe','travel','invalid'],purposes:['casual'],partner_id:partner};
 w.supabaseClient={rpc:async()=>({data:[post],error:null})};w.eval(read('public/conversation-posts.js'));const api=w.DayOConversationPosts,c=w.document.getElementById('cards');await api.mount(c);
 equal(c.querySelectorAll('img').length,0,'unsafe cover discarded');equal(c.querySelector('h3').textContent,post.title,'title text escaped');equal(c.querySelector('a').getAttribute('href'),'/magazine/test-story','native accessible detail link');equal(c.querySelectorAll('script,[onerror]').length,0,'no markup injection');equal(w.document.getElementById('magazine').hidden,false,'published section visible');
 equal(JSON.parse(JSON.stringify(api.prefill(post))),{interests:['food_cafe','travel'],purposes:['casual']},'temporary prefill only canonical interests/purposes');equal(post.partner_id,partner,'original public metadata unchanged');
 w.DayOI18n={getLang:()=> 'EN'};api.renderCards(c,[post]);ok(c.textContent.includes('Food / cafés'),'EN tags');api.renderCards(c,[]);equal(c.querySelectorAll('a').length,0,'no dummy fallback');
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');const article={...post,body:'<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n**Safe bold**',cover_image:'https://www.dayotalk.com/images/dayo-social-preview-20261005.png',post_type:'partner_story',author_type:'partner',published_at:'2026-10-06T00:00:00Z'};
 let rpcArgs;const page=loadTs('admin/src/app/magazine/[id]/page.tsx',{'next/image':({priority,unoptimized,...p})=>React.createElement('img',p),'next/link':p=>React.createElement('a',p),'next/navigation':{notFound(){throw Error('NOT_FOUND');}},'@supabase/supabase-js':{createClient(){return {rpc:async(name,args)=>{rpcArgs={name,args};return {data:article,error:null};}};}}});
 const markup=renderToStaticMarkup(await page.default({params:Promise.resolve({id:'test-story'})}));const d=new JSDOM(markup).window.document;
 equal(d.querySelectorAll('script').length,0,'malicious body rendered as escaped text');ok(d.body.textContent.includes('<script>alert(1)</script>'),'raw HTML inert');equal(d.querySelectorAll('a[href^="javascript:"]').length,0,'malicious markdown link inert');equal(rpcArgs.name,'get_published_conversation_post','SSR uses published-only public RPC');
 const cta=d.querySelector('a[href*="booking=open"]');ok(cta,'topic CTA present');equal(new URL(cta.href).searchParams.get('post'),'test-story','CTA carries only published post key');
 const metadata=await page.generateMetadata({params:Promise.resolve({id:'test-story'})});equal(metadata.openGraph.title,post.title,'per-post OG title');equal(metadata.openGraph.images[0].url,article.cover_image,'per-post safe image');equal(metadata.alternates.canonical,'https://www.dayotalk.com/magazine/test-story','canonical slug');
 const blocked=loadTs('admin/src/app/magazine/[id]/page.tsx',{'next/image':()=>null,'next/link':()=>null,'next/navigation':{notFound(){throw Error('NOT_FOUND');}},'@supabase/supabase-js':{createClient(){return {rpc:async()=>({data:null,error:null})};}}});await assert.rejects(blocked.default({params:Promise.resolve({id:'draft'})}),/NOT_FOUND/);checks++;
 dom.window.close();
}
async function mountedPrefill(){
 for(const scenario of ['member','login','topup','draft']){
  const dom=new JSDOM(read('tests/smart-booking-fixture.html'),{url:'https://www.dayotalk.com/?booking=open&post=test-story',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
  w.eval([...w.document.scripts].find(s=>!s.src).textContent);
  let logged=scenario!=='login',loginCount=0,topupCount=0,writes=0;
  if(!logged)w._dayoAuthUser=null;
  w.DayOMode={isMember:()=>logged,openLogin(){loginCount++;},toast(){}};
  w.DayOTickets={open(){topupCount++;},close(){}};
  if(scenario==='topup')w.localStorage.setItem('dayo_ticket_count','0');
  const rpc=w.supabaseClient.rpc;
  const from=w.supabaseClient.from;
  w.supabaseClient.from=table=>{const query=from(table);if(table==='user_conversation_preferences')for(const action of ['insert','update','upsert'])query[action]=()=>{writes++;throw Error('Unexpected persistent preference mutation');};return query;};
  w.supabaseClient.rpc=async(name,args)=>{if(name==='get_published_conversation_post')return {data:scenario==='draft'?null:{interests:['food_cafe','travel','unknown'],purposes:['casual'],partner_id:partner,language:'fr'},error:null};return rpc(name,args);};
  w.__DAYO_SMART_BOOKING_TEST__={};
  w.eval(read('public/i18n.js'));w.eval(read('public/chat-prefs.js'));w.eval(read('public/availability-calendar.js'));w.eval(read('public/conversation-posts.js'));w.eval(read('public/booking-modal.js'));
  await new Promise(r=>setTimeout(r,80));
  if(scenario==='login'){equal(loginCount,1,'post entry requires login');logged=true;w._dayoAuthUser={id:'fixture-learner'};w.document.dispatchEvent(new w.CustomEvent('dayo:authchange',{detail:{loggedIn:true}}));await new Promise(r=>setTimeout(r,420));}
  if(scenario==='topup'){equal(topupCount,1,'zero tickets keeps purchase guard');w.localStorage.setItem('dayo_ticket_count','1');w.document.dispatchEvent(new w.CustomEvent('dayo:ticketchange',{detail:{ticketCount:1}}));}
  const api=w.__DAYO_SMART_BOOKING_TEST__.api;
  if(scenario!=='draft'){
   equal(JSON.parse(JSON.stringify(api.state.interests)),['food_cafe','travel'],'actual mounted prefill '+scenario);equal(JSON.parse(JSON.stringify(api.state.purposes)),['casual'],'actual mounted purposes '+scenario);equal(api.state.partner,null,'post partner is not preselected');equal(api.state.language,null,'post language is not forced');
   w.document.querySelector('[data-group="interest"][data-id="food_cafe"]').click();equal(JSON.parse(JSON.stringify(api.state.interests)),['travel'],'user can remove prefilled interest');
   w.document.querySelector('[data-group="interest"][data-id="music"]').click();equal(JSON.parse(JSON.stringify(api.state.interests)),['travel','music'],'user can add a different interest');
   ok(!w.__fixturePendingBooking,'no booking created by prefill');equal(writes,0,'no persistent preference writes');
   equal(w.JSON.stringify(w.previousBooking),w.originalPrevious,'previous booking snapshot stays unchanged');
   api.state.language='en';api.state.style='slow';const snapshot=api.preferenceSnapshot();
   equal(snapshot.brief.schema_version,1,'existing canonical snapshot');
   equal(JSON.parse(JSON.stringify(snapshot.brief.interests)),['travel','music'],'snapshot takes user edits');
  }else ok(!api.state.interests.includes('unknown'),'draft metadata never used');
  dom.window.close();
 }
}
function preservation(){
 const meta=loadTs('admin/src/lib/conversation-posts.ts');equal(meta.validatePostMetadata({...meta.EMPTY_METADATA,interests:['food_cafe','travel'],purposes:['casual']}),null,'admin valid metadata');
 ok(meta.validatePostMetadata({...meta.EMPTY_METADATA,interests:['drama','movies','music','travel','pets']}),'admin maximum four');ok(meta.validatePostMetadata({...meta.EMPTY_METADATA,purposes:['invalid']}),'admin invalid key rejected');equal(meta.safePostImage('javascript:alert(1)'),'', 'admin image scheme guard');
 for(const name of ['index.html','mypage.html','booking-modal.js','hero-cms.js','lounge-carousel.js','conversation-posts.js','conversation-posts.css'])equal(read('public/'+name),read(name),'mirror '+name);
 const source=read('public/booking-modal.js'),baseline=cp.execFileSync('git',['show','204cd0d2dc7177b0abcc35f0fff80c1fcd39ee67:public/booking-modal.js'],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
 for(const name of ['partnerMatchesCriteria','matchingScore','rankPartners','canBypassBookingLeadTime','isBookableStart','requiresNoRefundWarning','fetchDateAvailability','preferenceSnapshot','confirmBooking']){
  const rx=new RegExp('(?:async )?function '+name+'\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}');const old=baseline.match(rx),current=source.match(rx);if(!old){if(name==='confirmBooking')continue;throw Error(name+' missing');}equal(current&&current[0].replace(/\r\n/g,'\n'),old[0],name+' untouched');
 }
 const index=new JSDOM(read('public/index.html')).window.document;ok(index.querySelector('script[src="booking-modal.js"]'),'home full HTML preserved');ok(index.querySelector('script[src="conversation-posts.js"]'),'home adapter loaded before booking');
 equal([...index.scripts].findIndex(s=>s.src.endsWith('conversation-posts.js'))<[...index.scripts].findIndex(s=>s.src.endsWith('booking-modal.js')),true,'prefill adapter available at init');
 ok(!read('supabase/migrations/094_conversation_posts_cms.sql').includes('alter table public.profiles'),'no profile mutation');
 const config=JSON.parse(read('vercel.json'));
 equal(config.rewrites.find(r=>r.source==='/magazine/:id').destination,'https://dayo-sufk.vercel.app/magazine/:id','existing magazine rewrite preserved');
 equal(config.rewrites.filter(r=>r.source.startsWith('/_next/')).map(r=>r.source),['/_next/static/:path*'],'only approved static assets are proxied');
 equal(config.rewrites.find(r=>r.source==='/_next/static/:path*').destination,'https://dayo-sufk.vercel.app/_next/static/:path*','static assets use existing Admin origin');
 ok(read('admin/src/app/magazine/[id]/page.tsx').includes('priority unoptimized'),'detail logo avoids unproxied image optimizer');
}
module.exports={loadTs};
function adminResponsiveChecks(){
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 for(const route of ['/admin/articles','/admin/partners'])for(const collapsed of [false,true]){
  const stubs={
   'next/navigation':{usePathname:()=>route,useRouter:()=>({})},
   'next/link':({prefetch,...p})=>React.createElement('a',p),
   '@/store/admin-store':{useAdminStore:()=>({sidebarCollapsed:collapsed,darkMode:false})},
   '@/components/admin/admin-auth-guard':{AdminAuthGuard:({children})=>children,useAdminAuth:()=>({displayName:'Admin',email:''})},
   '@/lib/supabase':{supabase:{}},
   'lucide-react':new Proxy({},{get:()=>()=>React.createElement('svg')}),
   '@/components/ui/button':{Button:({variant,size,...props})=>React.createElement('button',props)},
   '@/components/ui/badge':{Badge:({variant,...props})=>React.createElement('span',props)},
  };
  const Layout=loadTs('admin/src/app/admin/layout.tsx',stubs).default;
  const d=new JSDOM(renderToStaticMarkup(React.createElement(Layout,null,React.createElement('main',null,'Editor')))).window.document;
  const mobile=route==='/admin/articles';
  equal(d.querySelector('aside').className.includes('hidden md:flex'),mobile,'only magazine sidebar hidden on mobile');
  equal(d.querySelector('main').parentElement.className.includes('ml-0 md:'),mobile,'only magazine removes mobile sidebar offset');
  const Header=loadTs('admin/src/components/admin/header.tsx',stubs).AdminHeader;
  const h=new JSDOM(renderToStaticMarkup(React.createElement(Header,{title:'라운지 매거진',compactMobile:mobile}))).window.document;
  equal(h.querySelector('header').className.includes('ml-0 md:'),mobile,'compact header offset opt-in');
  ok(h.querySelector('button[aria-label="로그아웃"]'),'logout remains available on mobile');
 }
 ok(read('admin/src/app/admin/articles/page.tsx').includes('compactMobile'),'only CMS page requests compact header');
 ok(read('admin/src/components/admin/articles-cms.tsx').includes('[&>div]:min-w-0'),'form grid children can shrink');
 ok(read('admin/src/components/admin/articles-cms.tsx').includes('min-w-[640px]'),'list stays readable within existing scroll container');
 for(const file of ['admin/src/components/admin/header.tsx','admin/src/components/admin/sidebar.tsx']){
  const baseline=cp.execFileSync('git',['show','204cd0d2dc7177b0abcc35f0fff80c1fcd39ee67:'+file],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
  const handler=file.includes('header')?'  async function signOut()':'  function go(';
  const extract=s=>s.slice(s.indexOf(handler),s.indexOf('\n  return (',s.indexOf(handler)));
  equal(extract(read(file).replace(/\r\n/g,'\n')),extract(baseline),'navigation/auth handlers unchanged');
 }
}
if(require.main===module)(async()=>{await dbChecks();await uiChecks();await mountedPrefill();preservation();adminResponsiveChecks();console.log('CMS fixtures passed: '+checks+' checks (local synthetic DB/DOM/SSR, no production writes).');})().catch(e=>{console.error(e);process.exitCode=1;});
