const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),adminRequire=createRequire(path.join(root,'admin/package.json')),ts=adminRequire('typescript');
const React=adminRequire('react'),render=adminRequire('react-dom/server').renderToStaticMarkup;
const calls=[];let data=[],error=null;
const supabase={from(){throw Error('Direct ledger SELECT must not be used');},async rpc(name,args){calls.push({name,args});return{data,error};}};
function compile(source,extra={}){const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}});assert.equal((compiled.diagnostics||[]).length,0);const box={exports:{},require:n=>n==='@/lib/supabase'?{supabase}:adminRequire(n),console,...extra};vm.runInNewContext(compiled.outputText,box);return box.exports;}
const lib=compile(fs.readFileSync(path.join(root,'admin/src/lib/admin-data.ts'),'utf8'));
const drawer=fs.readFileSync(path.join(root,'admin/src/components/admin/UserDetailDrawer.tsx'),'utf8');
const entry=compile(drawer.slice(drawer.indexOf('export function TicketAuditEntry(')),{ticketAuditTypeLabel:lib.ticketAuditTypeLabel,formatSessionDateTime:lib.formatSessionDateTime}).TicketAuditEntry;
const current={id:'ledger:new',user_id:'target',delta:1,source:'admin_grant',reason:'기술 장애 보상',granted_by:'admin',admin_name:'운영자',admin_email:'admin@example.invalid',lot_id:'11111111-1111-4111-8111-111111111111',transaction_id:'22222222-2222-4222-8222-222222222222',source_id:'33333333-3333-4333-8333-333333333333',balance_after:1,created_at:'2026-10-06T12:00:00Z'};
(async()=>{
 data=[current,{...current,id:'ledger:old',reason:null,granted_by:null,admin_name:null,admin_email:null}];
 const rows=await lib.fetchCreditLedgers('legacy-auth-id','target');
 assert.equal(calls.length,1);assert.equal(calls[0].name,'admin_get_ticket_audit');assert.equal(calls[0].args.p_user_id,'target');assert.equal(rows[0].reason,current.reason);assert.equal(rows[1].reason,null);assert.equal(rows[1].granted_by,null);
 const html=render(React.createElement(entry,{row:rows[0]}));for(const text of ['+1','관리자 지급','기술 장애 보상','운영자','admin@example.invalid',current.lot_id,current.transaction_id,current.source_id])assert.ok(html.includes(text),text);
 const old=render(React.createElement(entry,{row:rows[1]}));assert.match(old,/사유: 미기록/);assert.match(old,/처리 관리자: 미기록/);assert.doesNotMatch(old,/운영자|admin@example.invalid/);
 for(const [source,label,delta] of [['purchase','티켓 구매',1],['booking_use','예약 사용',-1],['booking_refund','취소·환불',1]]){assert.match(render(React.createElement(entry,{row:{...current,source,delta}})),new RegExp(label));}
 error={message:'permission denied'};await assert.rejects(lib.fetchCreditLedgers('target'),/불러오지 못했습니다/);
 error=null;data={invalid:true};await assert.rejects(lib.fetchCreditLedgers('target'),/응답/);
 assert.match(drawer,/ledgerError \? \(/);assert.match(drawer,/role="alert"/);assert.match(drawer,/setLedgers\(await fetchCreditLedgers\(user.id\)\)/);
 assert.doesNotMatch(drawer,/관리자 티켓 지급 \(사유 미저장\)/);assert.match(drawer,/grantInFlightRef.current/);assert.match(drawer,/sourceId: crypto.randomUUID\(\)/);assert.match(drawer,/dayo_admin_grant_pending/);
 if(process.argv.includes('--preview')){const out=path.resolve(process.env.TICKET_AUDIT_PREVIEW_DIR||'.');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/audit.css"><title>Admin ticket audit local fixture</title><body style="background:#FFFBF4;color:#292524;margin:0;font-family:Arial,sans-serif"><main style="max-width:640px;margin:auto;padding:16px"><h1>티켓 변동 이력</h1><ul style="padding:0;list-style:none;display:grid;gap:12px">'+[current,{...current,reason:null,granted_by:null,admin_name:null,admin_email:null},{...current,source:'booking_use',delta:-1,reason:null,granted_by:null,admin_name:null,admin_email:null,balance_after:null},{...current,source:'booking_refund',delta:1,reason:'tech_issue',granted_by:null,admin_name:null,admin_email:null,balance_after:null}].map(row=>render(React.createElement(entry,{row}))).join('')+'</ul></main></body></html>');}
 console.log('PASS admin UI: admin RPC exact profile; actual metadata/IDs; historical 미기록; purchase/use/refund labels; errors distinct from empty; server requery; retry controls preserved.');
})().catch(e=>{console.error(e);process.exitCode=1;});
