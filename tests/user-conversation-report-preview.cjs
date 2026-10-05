// Local-only UI fixture. No production auth, external report writes or AI generation.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const root=path.resolve(__dirname,'..'),pub=path.join(root,'public'),{fixture}=require('./user-conversation-report-fixtures.test.js');
const mypage=fs.readFileSync(path.join(pub,'mypage.html'),'utf8');
const style=mypage.match(/<style>([\s\S]*?)<\/style>/)[1];
const dashboard=fs.readFileSync(path.join(pub,'mypage-dashboard.js'),'utf8');
const detailFunctions=dashboard.slice(dashboard.indexOf('  function resolveReportIndex'),dashboard.indexOf('  window.enterStudio'));
http.createServer((req,res)=>{
const u=new URL(req.url,'http://localhost');
if(u.pathname==='/preview'){
const r=JSON.parse(JSON.stringify(fixture));
if(u.searchParams.get('case')==='image-failure')r.illust_url='/missing-image.png';
if(u.searchParams.get('case')==='sparse'){r.partner_comment='';r.stamp='';r.illust_url='';r.feedback=[];r.quiz_score=null;r.summary='';r.key_expressions=[];r.__dayoLearnerTranscript=[];}
if(u.searchParams.get('case')==='legacy'){r.partner_comment='A long legacy note. '.repeat(16);r.feedback=['또 만나고 싶어요'];r.stamp='unknown';r.key_expressions=[];r.quiz_score=null;r.summary='';r.spoken_sentence='Legacy partner text';}
if(u.searchParams.get('case')==='ai'){
 const live=require('./fixtures/learner-language-recap-live.json');
 r.feedback=live.corrections;
 r.__dayoLearnerSourceLogId='synthetic-log';
 r.__dayoLearnerTranscript=[{id:'test-0',speaker:'learner',text:'I am very agree.',timestamp:'2026-10-05T05:01:00Z'}];
}
const locale=u.searchParams.get('lang')==='ko'?'ko':'en';
res.setHeader('Content-Type','text/html; charset=utf-8');
res.end(`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conversation Report local QA</title><style>${style}</style><link rel="stylesheet" href="/conversation-insights.css"><link rel="stylesheet" href="/english-typography.css"><link rel="stylesheet" href="/user-conversation-report.css"><style>body{margin:0;padding:20px;background:#FFFBF4;font-family:Arial,sans-serif}main{max-width:850px;margin:auto}.qa-controls{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.mypage-report-list{display:grid;gap:12px}.card-detail-backdrop{position:absolute;inset:0;background:#0005}.card-detail-close{position:absolute;right:12px;top:6px;font-size:22px;border:0;background:transparent;z-index:2}.report-detail-panel{padding-top:36px}@media(max-width:480px){body{padding:12px}#report-detail-modal{padding:10px}}</style></head><body><main><h1>Past Conversation Reports</h1><p>Local fixtures — no production writes</p><nav class="qa-controls"><a href="/preview?case=ai">Actual AI / synthetic speech</a><a href="/preview">Full</a><a href="/preview?case=image-failure">Image failure</a><a href="/preview?case=sparse">Sparse</a><a href="/preview?case=legacy">Legacy</a><a href="/preview?lang=ko">Korean</a></nav><div id="speaking-progress-card" hidden></div><div class="mypage-report-list"></div></main><div id="report-detail-modal" role="dialog" aria-modal="true" aria-labelledby="report-detail-title"><div class="card-detail-backdrop" onclick="closeReportDetailModal()"></div><div class="report-detail-panel"><button class="card-detail-close" aria-label="Close report" onclick="closeReportDetailModal()">×</button><h2 id="report-detail-title" hidden>Conversation Report</h2><div id="report-detail-body"></div></div></div><script>const fixture=${JSON.stringify(r)},userId='33333333-3333-4333-8333-333333333333';window.DayOI18n={getLang:()=>document.documentElement.lang,t:k=>k};window.supabaseClient={auth:{getUser:async()=>({data:{user:{id:userId}}})},rpc:async()=>({data:[{id:'partner-id',nickname:'Alex'}],error:null}),from(table){const q={};for(const k of ['select','eq','order','in','limit','gte','lt'])q[k]=()=>q;q.then=(resolve,reject)=>Promise.resolve({data:table==='session_reports'?[fixture]:table==='bookings'?[{id:fixture.booking_id,learner_id:userId,partner_user_id:'partner-id',status:'completed',scheduled_at:fixture.created_at}]:table==='session_logs'?[{id:fixture.__dayoLearnerSourceLogId,booking_id:fixture.booking_id,participant_id:userId,participant_role:'learner',transcript:fixture.__dayoLearnerTranscript}]:[],error:null}).then(resolve,reject);return q;}};</script><script src="/partner-report-contract.js"></script><script src="/learner-expressions.js"></script><script src="/user-conversation-report.js"></script><script src="/supabase-client.js"></script><script>${detailFunctions}window.openReportDetailModal=openReportDetailModal;window.closeReportDetailModal=closeReportDetailModal;</script><script src="/conversation-insights.js"></script><script src="/insta-card-export.js"></script><script>document.addEventListener('DOMContentLoaded',()=>loadUserReports());</script></body></html>`);return;
}
const file=path.resolve(pub,'.'+u.pathname);
if(!file.startsWith(pub+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));
}).listen(3052,'127.0.0.1',()=>console.log('Local report QA http://127.0.0.1:3052/preview'));