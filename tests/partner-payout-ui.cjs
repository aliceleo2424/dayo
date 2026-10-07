/* Real React/Radix modal and RPC adapter in a local-only browser fixture. No production calls. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http'),cp=require('node:child_process');
const {createRequire}=require('node:module'),{chromium}=require('playwright'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..'),adminRequire=createRequire(path.join(root,'admin/package.json')),ts=adminRequire('typescript'),vm=require('node:vm');
const dialogFile=path.join(root,'admin/src/components/admin/partner-payout-dialog.tsx');
const rpcCalls=[],supabase={async rpc(name,args){rpcCalls.push({name,args});return{data:{success:true,payout_id:args.p_request_id,amount:args.p_amount,already_recorded:false,updated_balance:0},error:null};}};
const compiled=ts.transpileModule(fs.readFileSync(path.join(root,'admin/src/lib/partner-payouts.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
const box={exports:{},require:n=>n==='@/lib/supabase'?{supabase}:adminRequire(n)};vm.runInNewContext(compiled.outputText,box);
const lib=box.exports;
const entry='import React,{useState} from "react";import {createRoot} from "react-dom/client";import {PartnerPayoutDialog} from '+JSON.stringify(dialogFile)+';function App(){const [id,setId]=useState("partner-a");window.choosePartner=setId;return <PartnerPayoutDialog partnerId={id} onClose={()=>setId(null)} onRecorded={result=>{window.recorded.push(result)}}/>}createRoot(document.getElementById("root")).render(<App/>);';
(async()=>{
 assert.equal(lib.payoutPaidAtIso('2026-01-02T12:00'),'2026-01-02T03:00:00.000Z');
 assert.equal(lib.payoutStatusLabel('no_rewards'),'적립 없음');assert.equal(lib.payoutStatusLabel('paid'),'지급완료');
 assert.equal(lib.PAYOUT_METHODS.length,5);
 await lib.recordPartnerPayout({partnerId:'profile-exact',amount:6000,method:'cash',destination:'현금 지급',paidAt:'2026-01-02T03:00:00Z',bookingIds:['booking-exact'],requestId:'request-exact',reference:'',note:''});
 assert.equal(rpcCalls[0].name,'admin_record_partner_payout');assert.equal(rpcCalls[0].args.p_partner_user_id,'profile-exact');assert.equal(rpcCalls[0].args.p_expected_booking_ids[0],'booking-exact');
 assert.equal(rpcCalls[0].args.p_request_id,'request-exact');assert.equal(rpcCalls[0].args.p_payout_reference,null);assert.equal(rpcCalls[0].args.p_note,null);
 for(const file of ['admin/src/app/admin/partners/partner-payout-manager.tsx','admin/src/components/admin/partner-detail-modal.tsx']){
   assert.doesNotMatch(fs.readFileSync(path.join(root,file),'utf8'),/supabase\.rpc\("settle_partner_payout"|from\("settlement_logs"\)/,'no legacy settlement path');
 }
 const list=fs.readFileSync(path.join(root,'admin/src/app/admin/partners/partner-payout-manager.tsx'),'utf8').split('export function PartnerSettlementTable()')[1];
 assert.doesNotMatch(list,/bank_account|account_holder|bankLine/,'payout list/CSV has no raw bank details');
 const bundle=await esbuild.build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,write:false,jsx:'automatic',platform:'browser',format:'iife',nodePaths:[path.join(root,'admin/node_modules')],plugins:[{name:'fixture',setup(build){
   build.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'supabase',namespace:'fixture'}));
   build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const supabase=window.fixtureSupabase;',loader:'js'}));
   build.onResolve({filter:/^@\//},args=>{const target=path.join(root,'admin/src',args.path.slice(2));return{path:[target+'.ts',target+'.tsx',target+'/index.ts'].find(file=>fs.existsSync(file))};});
 }}]});
 const cssPath=path.join(process.env.PAYOUT_QA_OUTPUT||path.join(root,'artifacts/payout-qa'),'payout.css');
 fs.mkdirSync(path.dirname(cssPath),{recursive:true});
 cp.execFileSync(process.execPath,[adminRequire.resolve('tailwindcss/lib/cli.js'),'-i','src/app/globals.css','--content',dialogFile+','+path.join(root,'admin/src/components/ui/dialog.tsx')+','+path.join(root,'admin/src/components/ui/button.tsx'),'-o',cssPath],{cwd:path.join(root,'admin'),stdio:'pipe'});
 const css=fs.readFileSync(cssPath,'utf8');
 const setup=function(){
   const booking='90000000-0000-4000-8000-000000000020';
   const item={booking_id:booking,source_type:'legacy_session_reward',reward_booking_id:null,tech_report_id:null,gross_amount:6000,offset_amount:0,net_amount:6000,earned_at:'2026-01-01T00:25:00Z'};
   const summary={partner_user_id:'partner-a',partner_name:'QA Partner',point_balance:6000,amount:6000,gross_amount:6000,offset_amount:0,source_count:1,session_count:1,legacy_count:1,cancellation_count:0,compensation_count:0,paid_total:0,payout_count:0,last_paid_at:null,can_record:true,status:'unpaid'};
   window.audit={summary,unpaid_items:[item],payouts:[]};window.calls=[];window.recorded=[];window.failFirst=true;
   window.fixtureSupabase={async rpc(name,args){
     window.calls.push({name,args});
     if(name==='admin_get_partner_payout_audit'){
       const value=args.p_partner_user_id==='partner-a'?JSON.parse(JSON.stringify(window.audit)):{summary:{...summary,partner_user_id:args.p_partner_user_id,partner_name:'Zero partner',point_balance:0,amount:0,source_count:0,session_count:0,legacy_count:0,can_record:false,status:'no_rewards'},unpaid_items:[],payouts:[]};
       if(window.holdNext){window.holdNext=false;return new Promise(resolve=>{window.releaseAudit=()=>resolve({data:value,error:null});});}
       return{data:value,error:null};
     }
     if(name==='admin_record_partner_payout'){
       if(window.failFirst){window.failFirst=false;return{data:null,error:{message:'fixture save rejected'}};}
       window.audit={summary:{...summary,point_balance:0,amount:0,source_count:0,session_count:0,legacy_count:0,gross_amount:0,status:'paid',can_record:false,paid_total:6000,payout_count:1},
         unpaid_items:[],payouts:[{id:args.p_request_id,partner_user_id:'partner-a',amount:args.p_amount,currency:'KRW',payout_method:args.p_payout_method,payout_destination_label:args.p_payout_destination_label,payout_reference:args.p_payout_reference,note:args.p_note,paid_at:args.p_paid_at,processed_by:'90000000-0000-4000-8000-000000000003',processed_by_name:'QA 운영자',created_at:'2026-01-02T03:00:00Z',status:'paid',items:[item]}]};
       return{data:{success:true,payout_id:args.p_request_id,updated_balance:0,amount:6000,already_recorded:false},error:null};
     }
     throw Error('Unexpected RPC');
   }};
 };
 const html='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script>('+setup.toString()+')()</script><script src="/bundle.js"></script></html>';
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?bundle.outputFiles[0].text:html);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',err=>{errors.push(err.message);console.error('local fixture:',err.message)});
   await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('heading',{name:'QA Partner',exact:true}).waitFor();
   assert.equal(await page.getByLabel('지급 방법').locator('option').count(),5);
   await page.getByLabel('지급 방법').selectOption('cash');assert.equal(await page.getByLabel('지급 대상 표시').inputValue(),'현금 지급');
   await page.getByLabel('지급 방법').selectOption('bank_transfer');await page.getByLabel('지급 대상 표시').fill('국민은행 ****1234');
   await page.getByLabel('실제 지급 일시 (KST)').fill('2026-01-02T12:00');
   await page.getByLabel('실제 지급액 (KRW)').fill('5999');await page.getByRole('button',{name:'지급 완료 기록',exact:true}).click();
   await page.getByRole('alert').waitFor();assert.equal((await page.evaluate(()=>calls.filter(x=>x.name==='admin_record_partner_payout'))).length,0);
   await page.getByLabel('실제 지급액 (KRW)').fill('6000');await page.getByLabel('송금 참조 (선택)').fill('manual-ref');await page.getByLabel('메모 (선택)').fill('실제 지급 완료');
   const dialog=page.getByRole('dialog');assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'modal no horizontal overflow');
   await page.getByRole('button',{name:'지급 완료 기록',exact:true}).scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(path.dirname(cssPath),'payout-'+width+'.png')});
   await page.getByRole('button',{name:'지급 완료 기록',exact:true}).click();await page.getByText('fixture save rejected',{exact:true}).waitFor();
   assert.equal((await page.evaluate(()=>recorded)).length,0,'failure is not paid');assert.equal(await page.getByLabel('지급 대상 표시').isDisabled(),true,'retry freezes original payload');
   await page.getByRole('button',{name:'지급 완료 기록',exact:true}).click();await page.getByText('지급 완료 기록을 저장했습니다.',{exact:true}).waitFor();
   await page.getByText('QA 운영자',{exact:false}).waitFor();
   const calls=await page.evaluate(()=>window.calls.filter(x=>x.name==='admin_record_partner_payout'));assert.equal(calls.length,2);assert.deepEqual(calls[0].args,calls[1].args,'same idempotency payload on retry');
   assert.equal(calls[1].args.p_paid_at,'2026-01-02T03:00:00.000Z');assert.equal(await page.getByRole('button',{name:'지급 완료 기록',exact:true}).isDisabled(),true);
   await page.getByRole('button',{name:'새로고침',exact:true}).click();await page.getByText('QA 운영자',{exact:false}).waitFor();
   assert.ok((await dialog.innerText()).includes('국민은행 ****1234'),'saved destination after reload');
   await page.evaluate(()=>choosePartner('partner-zero'));await page.getByRole('heading',{name:'Zero partner',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'지급 완료 기록',exact:true}).isDisabled(),true,'zero cannot be recorded');
   await page.evaluate(()=>{window.holdNext=true;choosePartner('partner-a');});await page.waitForFunction(()=>typeof releaseAudit==='function');
   await page.evaluate(()=>choosePartner('partner-zero-2'));await page.getByRole('heading',{name:'Zero partner',exact:true}).waitFor();
   await page.evaluate(()=>releaseAudit());await page.waitForTimeout(50);assert.equal(await page.getByRole('heading',{name:'QA Partner',exact:true}).count(),0,'stale partner response ignored');
   assert.deepEqual(errors,[]);await page.close();console.log('PASS actual React payout modal '+width+': safe fields/methods/KST; failure remains unpaid; exact retry; saved audit reload; zero disabled; stale partner response; no horizontal overflow');
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(err=>{console.error(err);process.exitCode=1;});
