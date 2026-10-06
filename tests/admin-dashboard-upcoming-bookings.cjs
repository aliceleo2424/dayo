const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'), requireAdmin=createRequire(path.join(root,'admin/package.json'));
const ts=requireAdmin('typescript'), React=requireAdmin('react'), render=requireAdmin('react-dom/server').renderToStaticMarkup;
const now=Date.parse('2026-10-06T03:00:00Z');
const fixture=[
 {id:'past-old',scheduled_at:'2026-10-01T03:00:00Z',status:'completed'},
 {id:'future-later',scheduled_at:'2026-10-09T02:00:00Z',status:'confirmed'},
 {id:'future-cancelled',scheduled_at:'2026-10-08T03:00:00Z',status:'cancelled'},
 {id:'future-next',scheduled_at:'2026-10-07T00:00:00Z',status:'confirmed',created_at:'2026-10-06T02:59:59Z'},
 {id:'past-recent',scheduled_at:'2026-10-05T03:00:00Z',status:'confirmed'},
 {id:'at-now',scheduled_at:'2026-10-06T03:00:00Z',status:'confirmed'},
 {id:'undated',scheduled_at:null,status:'pending'},
].map(row=>({...row,learner_id:'learner-id',partner_user_id:'partner-id',partner_name:'Saved Partner'}));
const profiles=[{id:'learner-id',user_id:null,nickname:'학습자 이름'}, {id:'partner-id',user_id:'legacy-partner-id',nickname:'파트너 이름'}];
const calls=[], state=[]; let stateIndex=0, loadCallback;
function query(table) {
 const q={}; let options,filters=[];
 for(const method of ['select','eq','in','or','order']) q[method]=(...args)=>{calls.push({table,method,args}); if(method==='select')options=args[1]; if(method==='or'||method==='in')filters.push(args);return q;};
 q.then=(resolve,reject)=>Promise.resolve({error:null,count:table==='bookings'?fixture.length:profiles.length,data:options?.head?null:table==='bookings'?fixture:table==='profiles'?profiles:[]}).then(resolve,reject);
 return q;
}
const moduleCache={};
function loadModule(relative,extra='') {
 if(moduleCache[relative])return moduleCache[relative];
 const source=fs.readFileSync(path.join(root,relative),'utf8')+extra;
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const hooks={...React,useState(initial){const i=stateIndex++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];},useCallback(fn){loadCallback=fn;return fn;},useEffect(){}};
 const requireModule=name=>{
  if(name==='react')return hooks;
  if(name==='lucide-react')return new Proxy({},{get:()=>props=>React.createElement('svg',{...props,width:16,height:16,'aria-hidden':true})});
  if(name==='@/lib/supabase')return {supabase:{from:query}};
  if(name==='@/lib/admin-data')return {adminProfiles:()=>query('profiles'),profileDisplayName:row=>row.nickname||row.user_name||row.email,detectMemberProvider:()=> 'email'};
  if(name==='@/components/admin/header')return {AdminHeader:()=>React.createElement('header',{className:'border-b bg-card p-6 font-semibold'},'운영 대시보드')};
  if(name.startsWith('@/components/admin/'))return new Proxy({},{get:()=>()=>null});
  if(name.startsWith('@/'))return loadModule('admin/src/'+name.slice(2)+(name.includes('/ui/')?'.tsx':'.ts'));
  return requireAdmin(name);
 };
 const box={exports:{},require:requireModule,console,crypto:require('node:crypto'),Date:class extends Date{static now(){return now;}}};
 vm.runInNewContext(js,box,{filename:relative});moduleCache[relative]=box.exports;return box.exports;
}
const pagePath='admin/src/app/admin/dashboard/page.tsx';
const page=loadModule(pagePath,'\nexport {groupDashboardSessions,dashboardSessionStatus};');
const ids=rows=>Array.from(rows,row=>row.id);
(async()=>{
 const original=fixture.map(row=>({...row}));const groups=page.groupDashboardSessions(fixture,now);
 assert.deepEqual(ids(groups.upcoming),['future-next','future-later']);
 assert.deepEqual(ids(groups.past),['future-cancelled','at-now','past-recent','past-old','undated']);
 assert.deepEqual(fixture,original,'sorting must not mutate booking rows or statuses');
 assert.equal(page.groupDashboardSessions([{id:'bad',scheduled_at:'invalid',status:'confirmed'}],now).upcoming.length,0);
 assert.equal(page.groupDashboardSessions(fixture,Date.parse('2026-10-10T00:00:00Z')).upcoming.length,0);
 for(const [key,label] of [['confirmed','예약됨'],['completed','완료'],['cancelled','취소']])assert.equal(page.dashboardSessionStatus(key),label);
 console.log('Time-based grouping, closest-first order, past reverse order, cancelled/invalid/boundary handling: passed');
 stateIndex=0;page.default();await loadCallback();
 assert.equal(state[2].length,fixture.length,'all current/future/new bookings are retained');
 assert.equal(state[2].find(row=>row.id==='future-next').learner,'학습자 이름');
 assert.equal(state[2].find(row=>row.id==='future-next').partner,'파트너 이름');
 assert.ok(calls.some(call=>call.table==='profiles'&&call.method==='or'&&call.args[0].includes('id.in.')&&call.args[0].includes('user_id.in.')));
 assert.ok(!calls.some(call=>call.table==='bookings'&&['eq','in','or'].includes(call.method)),'no status/date query filters omit new bookings');
 console.log('Actual dashboard load path, new future booking inclusion, id/user_id name lookup: passed');
 stateIndex=0;const tree=page.default(); const html=render(tree);
 assert.ok(html.indexOf('다가오는 예약')<html.indexOf('지난 세션'));
 assert.match(html,/bg-\[#E8F0E3\]/);assert.match(html,/inset_4px_0_0_#5F7D63/);
 assert.equal((html.match(/대화록 열람/g)||[]).length,fixture.length);
 const clickHandlers=[];
 function walk(element){if(Array.isArray(element)){element.forEach(walk);return;}if(!element||typeof element!=='object')return;if(element.props?.onClick&&element.props.children?.[1]==='대화록 열람')clickHandlers.push(element.props.onClick);walk(element.props?.children);}
 walk(tree);assert.equal(clickHandlers.length,fixture.length);clickHandlers[0]();assert.equal(state[8].id,'future-next');
 assert.equal(state[8].status,'confirmed');assert.equal(state[8].learnerName,'학습자 이름');
 console.log('Rendered row groups, nearest accent, Korean labels, exact booking QA button context: passed');
 const previewIndex=process.argv.indexOf('--preview');if(previewIndex>=0){const dir=path.resolve(process.argv[previewIndex+1]);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'dashboard.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dashboard booking fixture</title><link rel="stylesheet" href="dashboard.css"><body><div style="margin-left:252px">${html}</div></body></html>`);}
 console.log('Admin dashboard upcoming booking fixtures passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
