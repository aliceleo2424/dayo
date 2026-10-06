// Local visual fixture. Mock CMS only; no credentials, production reads or writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {loadTs}=require('./conversation-posts-fixtures.cjs');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const post={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',slug:'a-conversation-over-coffee',title:'카페에서 시작된 서로 다른 일상 이야기',excerpt:'좋아하는 음식과 여행 이야기로 나누는 편안한 대화',body:'## 작은 카페에서 나눈 이야기\n\n**좋아하는 음식**에서 시작한 이야기가 서로의 일상으로 이어졌어요.\n\n- 최근 다녀온 여행\n- 자주 찾는 동네 카페\n\n<script>alert("inert")</script>',post_type:'partner_story',author_type:'partner',author_display_name:'DayO Partner',country:'Korea',language:'en',interests:['food_cafe','travel'],purposes:['casual'],cover_image:'/images/dayo-social-preview-20261005.png',published_at:'2026-10-06T00:00:00Z'};
const publicPost={...post,cover_image:'https://www.dayotalk.com/images/dayo-social-preview-20261005.png'};
const client={rpc:async(name)=>({data:name==='get_published_conversation_post'?publicPost:[publicPost],error:null}),from:()=>({select(){return this;},order:async()=>({data:[],error:null})}),channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel:async()=>{},storage:{}};
const iconStubs=new Proxy({},{get:(_,name)=>name==='__esModule'?false:props=>React.createElement('svg',{'aria-hidden':true,...props})});
const stubs={'lucide-react':iconStubs,'next/image':({priority,unoptimized,...props})=>React.createElement('img',props),'next/link':props=>React.createElement('a',props),'next/navigation':{notFound(){throw Error('404');}},'@supabase/supabase-js':{createClient:()=>({rpc:async()=>({data:publicPost,error:null})})},'@/lib/supabase':{supabase:client}};
const page=loadTs('admin/src/app/magazine/[id]/page.tsx',stubs);
const admin=loadTs('admin/src/components/admin/articles-cms.tsx',stubs);
const strip=html=>html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const inlineJson=value=>JSON.stringify(value).replace(/</g,'\\u003c');
const mock=`<script>window.supabaseClient={rpc:async function(name){return {data:name==='get_published_conversation_post'?${inlineJson(publicPost)}:[${inlineJson(publicPost)}],error:null};}};</script><script src="/public/conversation-posts.js"></script>`;
const shell=(content)=>'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture-admin.css"></head><body>'+content+'</body></html>';
http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1:3052');let body,type='text/html';
  if(u.pathname==='/home'||u.pathname==='/mypage'){
   const name=u.pathname==='/home'?'index.html':'mypage.html';body=strip(read('public/'+name));body=body.replace('</head>','<link rel="stylesheet" href="/public/conversation-posts.css"></head>');body=body.replace('</body>',mock+`<script>DayOConversationPosts.mount(document.getElementById('${name==='index.html'?'cmsMagazineGrid':'loungeTrack'}'));</script></body>`);
  }else if(u.pathname.startsWith('/magazine/')){
   body=shell(renderToStaticMarkup(await page.default({params:Promise.resolve({id:post.slug})}))).replaceAll('https://www.dayotalk.com/?booking=open&amp;post=', '/booking?booking=open&amp;post=');
  }else if(u.pathname==='/admin-preview')body=shell('<main class="mx-auto max-w-5xl p-4"><p class="mb-4">로컬 CMS fixture · production 저장 없음</p>'+renderToStaticMarkup(React.createElement(admin.ArticlesCms))+'</main>');
  else if(u.pathname==='/booking'){
   body=read('tests/smart-booking-fixture.html').replace('<script src="../public/booking-modal.js"></script>',`<script>var priorRpc=supabaseClient.rpc;supabaseClient.rpc=async function(name,args){return name==='get_published_conversation_post'?{data:${inlineJson(publicPost)},error:null}:priorRpc(name,args);};</script><script src="/public/conversation-posts.js"></script><script src="/public/booking-modal.js"></script>`).replaceAll('../public/','/public/');
  }else if(u.pathname==='/fixture-admin.css'){body=fs.readFileSync('C:/Users/Public/Documents/ESTsoft/CreatorTemp/dayo-cms-admin.css');type='text/css';}
  else{
   const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep)||!/^\/(public\/|images\/)/.test(u.pathname))throw Error('404');body=fs.readFileSync(file);type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html';
  }
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(3052,'127.0.0.1',()=>console.log('Local CMS fixture: http://127.0.0.1:3052/home#magazine /admin-preview /magazine/'+post.slug));
