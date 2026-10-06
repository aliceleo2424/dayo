// Local read-only presentation QA. Supabase data is synthetic; no live auth/API calls.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {fixtureHtml}=require('./user-dashboard-fixtures.cjs'),pub=path.resolve(__dirname,'../public');
http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1:3054');
 if(u.pathname==='/mypage'){
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(fixtureHtml({count:['empty','fresh'].includes(u.searchParams.get('case'))?0:u.searchParams.get('case')==='many'?4:1,tickets:['empty','fresh'].includes(u.searchParams.get('case'))?0:3,diagnosed:u.searchParams.get('diagnosed')==='yes',lang:u.searchParams.get('lang')||'en',role:u.searchParams.get('role')||'user',eligible:u.searchParams.get('case')==='fresh',reports:u.searchParams.get('case')!=='fresh'}));return;
 }
 const f=path.resolve(pub,'.'+decodeURIComponent(u.pathname));
 if(!f.startsWith(pub+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',({'.css':'text/css','.js':'text/javascript','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f));
}).listen(3054,'127.0.0.1',()=>console.log('User dashboard local fixture http://127.0.0.1:3054/mypage'));
