/* Local-only preview: real photo modal/handlers and image normalization, synthetic
 * identity + in-memory images. No production Auth, DB or Storage connections. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),lib=require('../api/_lib/profile-image');
const userId='11111111-1111-4111-8111-111111111111';
function page(avatar=''){
 const source=fs.readFileSync(path.join(root,'public/partner.html'),'utf8');
 const photoStart=source.indexOf('  <div class="modal-overlay" id="photoModal">');
 const photo=source.slice(photoStart,source.indexOf('  <div class="modal-overlay"',photoStart+10));
 const handlers=source.slice(source.indexOf('    const photoInput ='),source.indexOf("    document.getElementById('historyBtn').addEventListener",source.indexOf('    const photoInput =')));
 const css=Array.from(source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)).map(x=>x[1]).join('\n');
 return `<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local Profile Image QA</title><style>${css}body{padding:16px}main{max-width:900px;margin:auto}#qa-controls{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px}#qa-toast{overflow-wrap:anywhere}#profileAvatar{width:88px;height:88px;background-size:cover;background-position:center;border-radius:50%}</style><link rel="stylesheet" href="/partner-dashboard.css"><script src="/partner-avatar-options.js"></script><script src="/profile-image-resolver.js"></script><script src="/profile-images.js"></script></head><body><main><h1>Local Partner photo QA</h1><p>Synthetic identity · in-memory images only</p><div id="qa-controls"><button id="qa-ko" onclick="document.documentElement.lang='ko';document.dispatchEvent(new CustomEvent('dayo:langchange'))">한국어</button><button onclick="document.documentElement.lang='en';document.dispatchEvent(new CustomEvent('dayo:langchange'))">English</button><label><input type="checkbox" id="qa-fail">Fail next upload</label><button onclick="location.reload()">Reload / fresh profile</button></div><div id="profileAvatar"><span>P</span></div><button class="photo-btn" id="photoBtn">Change Photo</button><p id="qa-toast" role="status"></p></main>${photo}<section id="user-profile-photo-editor"></section><div id="historyModal"></div><div id="settlement-history-modal"></div><script>
 const fixtureUser={id:${JSON.stringify(userId)},app_metadata:{provider:'email'},user_metadata:{}},fixtureSession={user:fixtureUser,access_token:'local-fixture-only'};
 window.supabaseClient={from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{avatar_url:window.__dayoPartnerProfile.avatar_url}})};},auth:{getUser:async()=>({data:{user:fixtureUser}}),getSession:async()=>({data:{session:fixtureSession}})}};
 window.__dayoPartnerProfile={id:fixtureUser.id,role:'partner',nickname:'Fixture Partner',avatar_url:${JSON.stringify(avatar)}};
 const originalFetch=window.fetch.bind(window);window.fetch=function(url,options){if(options&&options.method==='POST'&&document.getElementById('qa-fail').checked){document.getElementById('qa-fail').checked=false;return Promise.resolve({ok:false,json:async()=>({error:'image_upload_failed'})});}return originalFetch(url,options);};
 function getPartnerSupabaseClient(){return window.supabaseClient;}function showToast(text){document.getElementById('qa-toast').textContent=text;}function t(key){return DayOProfileImages.text(key.includes('Failed')?'failed':'saved');}
 const profileAvatar=document.getElementById('profileAvatar');let savedNickname='Fixture Partner',pendingAvatarUrl='';
 ${handlers}
 photoCopy();
 paintProfilePhoto(profileAvatar,displayedPartnerPhoto());
 const sample=document.createElement('button');sample.textContent='Local sample upload';sample.onclick=async()=>{document.getElementById('photoBtn').click();const blob=await (await fetch('/qa-photo.png')).blob(),transfer=new DataTransfer();transfer.items.add(new File([blob],'local-photo.png',{type:'image/png'}));photoInput.files=transfer.files;photoInput.dispatchEvent(new Event('change'));};document.getElementById('qa-controls').append(sample);
 document.querySelectorAll('[data-close-modal]').forEach(button=>button.addEventListener('click',()=>closeModal(photoModal)));
 </script><script src="/profile-image-editor.js"></script></body></html>`;
}
async function start(){
 const fixture=await sharp({create:{width:1800,height:1200,channels:3,background:'#5F7D63'}}).png().toBuffer();
 fs.writeFileSync('C:/Users/Public/Documents/ESTsoft/CreatorTemp/dayo-image-qa.png',fixture);
 let current=null;
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(page(current?.url));}
  if(url.pathname==='/qa-legacy.webp'){res.setHeader('Content-Type','image/webp');return res.end(await sharp(fixture).webp().toBuffer());}
  if(url.pathname==='/qa-provider.webp'){res.setHeader('Content-Type','image/webp');return res.end(await sharp({create:{width:100,height:100,channels:3,background:'#F8F0E3'}}).webp().toBuffer());}
  if(url.pathname==='/qa-photo.png'){res.setHeader('Content-Type','image/png');return res.end(fixture);}
  if(url.pathname==='/api/partner-application-upload' && url.searchParams.get('action')==='profile-image'){
   if(req.method==='POST'){let raw='';for await(const part of req)raw+=part;if(req.headers.authorization!=='Bearer local-fixture-only')throw Error('fixture_auth');const result=await lib.normalize(JSON.parse(raw));const id=crypto.randomUUID();current={bytes:result.data,url:'/qa-assets/'+id+'.webp',version:id};res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({avatar_url:current.url,version:id}));}
   if(req.method==='DELETE'&&req.headers.authorization==='Bearer local-fixture-only'){current=null;res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({avatar_url:null}));}
   res.statusCode=405;return res.end();
  }
  if(url.pathname===current?.url){res.setHeader('Content-Type','image/webp');return res.end(current.bytes);}
  if(!['/profile-image-editor.js','/profile-image-resolver.js','/profile-images.js','/partner-avatar-options.js','/partner-dashboard.css'].includes(url.pathname)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(path.join(root,'public',url.pathname.slice(1))));
 }catch(error){res.statusCode=error.status||400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.code||'invalid_image'}));}});
 server.listen(Number(process.env.PORT||3057),'127.0.0.1',()=>console.log('Local-only photo QA: http://127.0.0.1:'+server.address().port+'/'));return server;
}
module.exports={page};if(require.main===module)start();
