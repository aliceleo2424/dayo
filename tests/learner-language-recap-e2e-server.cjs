// Local-only actual Supabase/Gemini E2E. Never served by the production app.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
process.loadEnvFile(process.argv[2]||'.env.local');
const root=path.resolve(__dirname,'..'),pub=path.join(root,'public');
const {createHandler}=require('../api/learner-language-recap.js');
// Explicit disposable-booking config, kept outside Git; no account identifiers are committed.
if(!process.argv[3])throw Error('Pass an explicitly authorized test booking config as the third argument');
const qaConfig=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const {bookingId,learnerId,partnerId}=qaConfig;
for(const id of [bookingId,learnerId,partnerId])if(!/^[0-9a-f-]{36}$/i.test(id||''))throw Error('Invalid designated test config');
let failProvider=false;const stats={providerCalls:0,statuses:[]};
const tracedFetch=async(url,options)=>{const result=await fetch(url,options);if(String(url).startsWith('https://generativelanguage.googleapis.com/')){stats.providerCalls++;stats.statuses.push(result.status);}return result;};
const source=fs.readFileSync(path.join(pub,'room-live.js'),'utf8');
const slice=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);if(start<0||end<0)throw Error('Room source markers changed');return source.slice(start,end);};
const speech=`window.createQaSpeech=function(booking,existingRows=[]){
const NativeDate=window.Date;class TestDate extends NativeDate{constructor(...args){super(...(args.length?args:[booking.scheduled_at]));}}
var Date=TestDate,sessionTranscript=existingRows,utteranceSeq=existingRows.length,sessionStartedAt=booking.scheduled_at,sessionEndedAt=booking.scheduled_at,transcriptSavePromise=null;
const appendTranscriptRowToViewer=()=>{},recordSttState=()=>{},scheduleCopilot=()=>{};
${slice('  function uuid()','  function serializeTranscript(')}
${slice('  function serializeTranscript(','  function restoreSessionTiming(')}
${slice('  function markSessionEnded(','  function recoverTranscriptForQuiz(')}
${slice('  function pushTranscript(','  function dailyDomain(')}
const recognition={};
${slice('      recognition.onresult =','      recognition.onerror =')}
window.DayOLive={getTranscript:()=>serializeTranscript(sessionTranscript),saveTranscript};
return {capture(texts){recognition.onresult({resultIndex:0,results:texts.map(text=>({isFinal:true,0:{transcript:text}}))});return serializeTranscript(sessionTranscript);}};
};`;
const template=fs.readFileSync(path.join(__dirname,'learner-language-recap-e2e.html'),'utf8');
const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:3053');
 res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/api/learner-language-recap'){
  if(process.argv.includes('--production-api')){
   if(req.method!=='POST'){res.writeHead(405);return res.end();}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>1024){res.writeHead(400);return res.end();}}
   const input=JSON.parse(body);if(input.booking_id!==bookingId){res.writeHead(403);return res.end();}
   const remote=await fetch('https://www.dayotalk.com/api/learner-language-recap',{method:'POST',headers:{'Content-Type':'application/json',Authorization:req.headers.authorization||''},body});
   res.writeHead(remote.status,{'Content-Type':'application/json'});return res.end(await remote.text());
  }
  const env={...process.env};if(failProvider)env.GEMINI_API_KEY='qa-invalid-key';return createHandler({env,fetchImpl:tracedFetch})(req,res);
 }
 if(url.pathname==='/qa/provider-mode'&&req.method==='POST'){
  const auth=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/rest\/v1\/?$/i,'').replace(/\/+$/,'')+'/auth/v1/user',{headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,authorization:req.headers.authorization||''}});
  const user=auth.ok?await auth.json():{};if(user.id!==learnerId){res.writeHead(403);return res.end('Test learner required');}
  failProvider=url.searchParams.get('mode')==='failure';res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({mode:failProvider?'failure':'normal'}));
 }
 if(url.pathname==='/qa/stats'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(stats));}
 if(url.pathname==='/qa/speech.js'){res.setHeader('Content-Type',type['.js']);return res.end(speech);}
 if(url.pathname==='/e2e'){res.setHeader('Content-Type',type['.html']);return res.end(template.replace('__QA_CONFIG__',JSON.stringify(qaConfig).replace(/</g,'\u003c')));}
 const file=path.resolve(pub,'.'+(url.pathname==='/'?'/mypage.html':url.pathname.replace(/\/(mypage|partner)$/,'/$1.html')));
 if(!file.startsWith(pub+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',type[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
}).listen(3053,'127.0.0.1',()=>console.log('Actual DB E2E: http://127.0.0.1:3053/e2e (only the explicitly configured test booking)'));
