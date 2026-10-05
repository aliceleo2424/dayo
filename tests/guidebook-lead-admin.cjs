const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const adminRequire = createRequire(path.join(root, 'admin/package.json'));
const ts = adminRequire('typescript');
const { PGlite } = require('@electric-sql/pglite');
const { JSDOM } = require('jsdom');
let allRows = [], loadError = false, rpcError = null;
const selections = [], ranges = [];
const fakeSupabase = { from(table) {
  assert.equal(table, 'leads'); let start, end;
  const builder = { select(columns) { selections.push(columns); return builder; },
    eq(key, value) { assert.equal(key, 'source'); assert.equal(value, 'speaking_sense_guidebook'); return builder; },
    order() { return builder; }, async range(a, b) { ranges.push([a,b]); start=a;end=b;
      return { data: allRows.slice(start, end+1), error: loadError ? { code: '42501' } : null }; } };
  return builder;
}, async rpc(name) { assert.equal(name, 'admin_guidebook_lead_summary'); return {data:[{total:10,consented:3,unsent:2,withdrawn:1,archived:4}],error:rpcError}; } };
function loadTs(relative, replacements = {}) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  const sandbox = { exports: {}, require: name => name === '@/lib/supabase' ? {supabase:fakeSupabase} : replacements[name] || adminRequire(name),
    console, Blob:global.Blob, URL:global.URL, setTimeout };
  vm.runInNewContext(output, sandbox, {filename:relative}); return sandbox.exports;
}
const lib = loadTs('admin/src/lib/guidebook-leads.ts');
const base = { source:lib.GUIDEBOOK_SOURCE, created_at:'2026-10-01T00:00:00Z', guidebook_sent_at:'2026-10-01T00:01:00Z',
  marketing_consent:false, marketing_consented_at:null, marketing_withdrawn_at:null };
const rows = [
  {...base,id:'1',email:'yes@example.com',marketing_consent:true,marketing_consented_at:'2026-10-01T00:00:00Z'},
  {...base,id:'2',email:'no@example.com'},
  {...base,id:'3',email:'withdraw@example.com',marketing_consented_at:'2026-10-01T00:00:00Z',marketing_withdrawn_at:'2026-10-02T00:00:00Z'},
  {...base,id:'4',email:'retry@example.com',marketing_consent:true,marketing_consented_at:'2026-10-03T00:00:00Z',marketing_withdrawn_at:'2026-10-02T00:00:00Z'},
  {...base,id:'5',email:'unsent@example.com',guidebook_sent_at:null},
  {...base,id:'6',email:'legacy@example.com',source:null},
];
(async () => {
  assert.equal(lib.marketingEligible(rows[0]),true); assert.equal(lib.marketingEligible(rows[3]),false);
  const expected={all:5,consented:1,not_consented:2,withdrawn:2,unsent:1};
  for(const [filter,n] of Object.entries(expected))assert.equal(lib.filterLeads(rows,filter).length,n);
  assert.equal(lib.filterLeads(rows,'all','YES@').length,1);
  const summary=lib.summarizeLeads(rows); assert.equal(summary.total,5);assert.equal(summary.consented,3);assert.equal(summary.consentRate,60);
  assert.equal(lib.summarizeLeads([]).consentRate,0);
  const csv=lib.guidebookCsv(rows,true);assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/yes@example.com/);assert.doesNotMatch(csv,/retry|withdraw|legacy|unsubscribe|token/);
  const dangerous=lib.guidebookCsv([{...rows[0],email:' =HYPERLINK("x","y")'},{...rows[0],email:'abc,\"test\"\n@example.com'}]);
  assert.match(dangerous,/"' =HYPERLINK\(""x"",""y""\)"/); assert.match(dangerous,/"abc,""test""\n@example.com"/);
  allRows=Array.from({length:1001},(_,i)=>({...rows[0],id:String(i)}));
  assert.equal((await lib.listGuidebookLeads()).length,1001);assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499]]);
  assert.ok(selections.every(columns=>!columns.includes('token') && !columns.includes('*')));
  loadError=true;await assert.rejects(lib.listGuidebookLeads(),/관리자 권한/);loadError=false;
  rpcError={code:'PGRST202'};assert.equal((await lib.loadGuidebookSummary(rows)).preserved,false);
  rpcError={code:'42501'};await assert.rejects(lib.loadGuidebookSummary(rows),/집계/);rpcError=null;
  assert.equal((await lib.loadGuidebookSummary(rows)).summary.archived,4);

  // Actual PostgreSQL migration, RLS/grants, retention and exact campaign criteria.
  const pg=new PGlite();
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role;`);
  await pg.exec(fs.readFileSync(path.join(root,'supabase/migrations/008_leads.sql'),'utf8'));
  await pg.exec(fs.readFileSync(path.join(root,'supabase/migrations/009_leads_authenticated_insert.sql'),'utf8'));
  await pg.exec(`grant all on public.leads to anon,authenticated,service_role;
    create function public.dayo_is_admin() returns boolean language sql stable as $$select coalesce(current_setting('qa.admin',true),'false')='true'$$;
    create schema cron;create table cron.job(jobname text primary key,schedule text,command text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job values($1,$2,$3) returning 1::bigint$$;`);
  await pg.exec(fs.readFileSync(path.join(root,'supabase/migrations/088_speaking_guidebook_lead_consent.sql'),'utf8'));
  await pg.exec(fs.readFileSync(path.join(root,'supabase/migrations/089_guidebook_lead_admin_totals.sql'),'utf8'));
  await pg.exec(`insert into public.leads(email,source,created_at,guidebook_sent_at,marketing_consent,marketing_consented_at,marketing_withdrawn_at) values
    ('expired@example.com','speaking_sense_guidebook',now()-interval '40 days',now()-interval '39 days',false,null,null),
    ('failed@example.com','speaking_sense_guidebook',now()-interval '40 days',null,false,null,null),
    ('withdrawn@example.com','speaking_sense_guidebook',now()-interval '40 days',now()-interval '39 days',false,now()-interval '40 days',now()-interval '2 days'),
    ('yes@example.com','speaking_sense_guidebook',now()-interval '40 days',now()-interval '39 days',true,now()-interval '40 days',null),
    ('reconsented@example.com','speaking_sense_guidebook',now()-interval '40 days',now()-interval '39 days',true,now()-interval '1 day',now()-interval '2 days'),
    ('recent@example.com','speaking_sense_guidebook',now()-interval '1 day',null,false,null,null),
    ('legacy@example.com',null,now()-interval '40 days',null,false,null,null);`);
  await pg.exec(`set qa.admin='true';set role authenticated;`);
  const before=(await pg.query('select * from public.admin_guidebook_lead_summary()')).rows[0];
  assert.deepEqual(before,{total:6,consented:3,unsent:2,withdrawn:2,archived:0});
  assert.equal((await pg.query(`select count(*)::int n from public.leads where source='speaking_sense_guidebook'`)).rows[0].n,6);
  await pg.exec(`reset role;set role service_role;`);
  assert.deepEqual((await pg.query('select email from public.guidebook_marketing_recipients()')).rows,[{email:'yes@example.com'}]);
  assert.equal((await pg.query('select public.purge_expired_guidebook_leads() n')).rows[0].n,3);
  assert.equal((await pg.query('select public.purge_expired_guidebook_leads() n')).rows[0].n,0);
  assert.equal((await pg.query('select count(*)::int n from public.leads')).rows[0].n,4);
  const columns=(await pg.query(`select column_name from information_schema.columns where table_name='guidebook_lead_expiry_totals' order by ordinal_position`)).rows.map(x=>x.column_name);
  assert.deepEqual(columns,['application_date','applications','consented','unsent','withdrawn']);
  await pg.exec(`reset role;set role authenticated;`);
  const after=(await pg.query('select * from public.admin_guidebook_lead_summary()')).rows[0];
  assert.deepEqual(after,{...before,archived:3});
  // Ordinary user and partner both share authenticated role; admin predicate is false.
  await pg.exec(`set qa.admin='false';`);
  assert.equal((await pg.query('select count(*)::int n from public.leads')).rows[0].n,0);
  assert.equal((await pg.query('select count(*)::int n from public.guidebook_lead_expiry_totals')).rows[0].n,0);
  await assert.rejects(pg.query('select * from public.admin_guidebook_lead_summary()'),/admin_required/);
  for(const statement of ['select public.purge_expired_guidebook_leads()', 'select * from public.guidebook_marketing_recipients()', 'update public.leads set marketing_consent=true', 'insert into public.guidebook_lead_expiry_totals values(current_date,1,0,0,0)']) await assert.rejects(pg.query(statement),/permission denied/);
  await pg.exec('reset role;set role anon;');
  for(const statement of ['select * from public.leads','select * from public.guidebook_lead_expiry_totals','select * from public.admin_guidebook_lead_summary()'])await assert.rejects(pg.query(statement),/permission denied/);
  await pg.exec(`insert into public.leads(email)values('public-request@example.com');reset role;`);
  assert.equal((await pg.query('select count(*)::int n from cron.job')).rows[0].n,1);
  await pg.close();

  // Mount the actual TSX component; only network/outer header are fixture substitutes.
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/admin/guidebook-leads',pretendToBeVisual:true});
  const old={window:global.window,document:global.document,navigator:global.navigator};
  global.window=dom.window;global.document=dom.window.document;
  Object.defineProperty(global,'navigator',{configurable:true,value:dom.window.navigator});
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const React=adminRequire('react'), {createRoot}=adminRequire('react-dom/client');
  const Header=({title})=>React.createElement('header',null,title);
  const Button=({variant,size,...props})=>React.createElement('button',props);
  let live=rows.filter(row=>row.source===lib.GUIDEBOOK_SOURCE),reads=0;
  const Page=loadTs('admin/src/app/admin/guidebook-leads/page.tsx',{
    '@/components/admin/header':{AdminHeader:Header},'@/components/ui/button':{Button},
    '@/lib/guidebook-leads':{...lib,listGuidebookLeads:async()=>{reads++;return live;},loadGuidebookSummary:async()=>({summary:lib.summarizeLeads(live),preserved:false})},
  }).default;
  const rootReact=createRoot(dom.window.document.getElementById('root'));
  await React.act(async()=>{rootReact.render(React.createElement(Page));});
  const d=dom.window.document;
  const button=text=>[...d.querySelectorAll('button')].find(b=>b.textContent===text);
  assert.equal(d.querySelectorAll('tbody tr').length,5);
  await React.act(async()=>button('마케팅 동의').click());assert.equal(d.querySelectorAll('tbody tr').length,1);assert.match(d.querySelector('tbody').textContent,/yes@example.com/);
  await React.act(async()=>button('철회').click());assert.equal(d.querySelectorAll('tbody tr').length,2);
  await React.act(async()=>button('발송 실패 / 미완료').click());assert.equal(d.querySelectorAll('tbody tr').length,1);
  live=[];await React.act(async()=>button('마케팅 가능 리드 CSV').click());assert.ok(reads>=2);assert.match(d.querySelector('[role=status]').textContent,/내보낼 리드가 없습니다/);
  live=Array.from({length:26},(_,i)=>({...rows[0],id:String(i)}));
  await React.act(async()=>{button('새로고침').click();});
  await React.act(async()=>{button('전체').click();});
  assert.equal(d.querySelectorAll('tbody tr').length,25);await React.act(async()=>button('다음').click());assert.equal(d.querySelectorAll('tbody tr').length,1);
  await React.act(async()=>rootReact.unmount());dom.window.close();
  global.window=old.window;global.document=old.document;Object.defineProperty(global,'navigator',{configurable:true,value:old.navigator});
  console.log('PASS: admin filters/eligibility/search/summary, pagination >1000, explicit safe columns, fresh CSV export/formula escaping, actual TSX interactions, PostgreSQL 088→089, admin-only reads/RPC, anon insert, consent writes denied, retention aggregate survival/retry, exact server recipient rule, legacy/cron preservation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
