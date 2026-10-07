const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),{page}=require('./profile-image-preview.cjs');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function run(){
 for(const file of ['partner.html','partner-dashboard.js','partner-profile-completion.js','profile-images.js'])assert.equal(read(file),read('public/'+file),'Mirror '+file);
 for(const file of ['public/profile-images.js','public/partner-dashboard.js','public/partner-profile-completion.js'])new vm.Script(read(file));
 for(const script of read('public/partner.html').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(script[1].trim())new vm.Script(script[1]);
 const dom=new JSDOM(page(),{url:'http://127.0.0.1:3057/',runScripts:'outside-only'}),w=dom.window;
 w.URL.createObjectURL=()=> 'blob:http://127.0.0.1/fixture';w.URL.revokeObjectURL=()=>{};
 w.fetch=async()=>({ok:false});
 w.eval(read('public/partner-avatar-options.js'));w.eval(read('public/profile-image-resolver.js'));w.eval(read('public/profile-images.js'));
 w.eval(Array.from(page().matchAll(/<script>([\s\S]*?)<\/script>/g)).at(-1)[1]);
 const api=w.DayOProfileImages;
 assert.equal(api.safe('javascript:alert(1)'), '');assert.equal(api.safe('//evil.example/x'),'');assert.equal(api.safe('data:image/svg+xml;base64,AAAA'),'');
 assert.equal(api.hasPhoto('/images/partner-avatars/dayo-avatar-01.png'),false);assert.equal(api.hasPhoto('https://lh3.googleusercontent.com/fixture'),true);assert.equal(api.safe('data:image/png;base64,AAAA'),'data:image/png;base64,AAAA');
 const google='https://lh3.googleusercontent.com/provider',kakao='https://k.kakaocdn.net/provider',custom='https://mmhapsimcngmtefqfrcg.supabase.co/storage/v1/object/public/partner-profile-images/11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444.webp';
 for(const url of [google,kakao,custom,'data:image/png;base64,AAAA'])assert.equal(api.resolve(url),url);
 for(const url of ['', '/images/partner-avatars/dayo-avatar-01.png','https://api.dicebear.com/7.x/bottts/svg?seed=old','https://avatars.dicebear.com/api/bottts/old.svg','https://api.dicebear.net/9.x/bottts/svg'])assert.equal(api.resolve(url),'');
 assert.equal(api.provider,undefined,'No extra Auth metadata resolver');
 assert.equal(api.resolve(''),'', 'No generated/default fallback');
 const saved=api.upload;let sent=0;
 w.fetch=async()=>{sent++;return {ok:true,json:async()=>({avatar_url:custom})};};
 await assert.rejects(saved({mime:'image/png',base64:'AAAA'},'22222222-2222-4222-8222-222222222222'),/sign_in_required/);assert.equal(sent,0);
 api.prepare=async()=>({preview:'blob:http://127.0.0.1/fixture',mime:'image/png',base64:'AAAA'});
 api.upload=async()=>{throw Error('image_upload_failed');};
 w.document.getElementById('photoBtn').click();assert(w.document.getElementById('photoModal').classList.contains('is-open'));
 let selected=0;w.document.getElementById('photoInput').click=()=>{selected++;};w.document.getElementById('uploadBtn').click();assert.equal(selected,1,'Choose photo invokes file input');
 const input=w.document.getElementById('photoInput');Object.defineProperty(input,'files',{value:[{type:'image/png',size:100}]});input.dispatchEvent(new w.Event('change'));await tick();
 assert.match(w.document.getElementById('photoPreview').style.backgroundImage,/blob:/);assert.equal(w.document.getElementById('photo-save-btn').disabled,false);
 const old=w.__dayoPartnerProfile.avatar_url;w.document.getElementById('photo-save-btn').click();await tick();assert.equal(w.__dayoPartnerProfile.avatar_url,old);assert.match(w.document.getElementById('partner-photo-status').textContent,/existing photo is unchanged/);
 for(const id of ['uploadBtn','photo-save-btn'])assert.equal(w.getComputedStyle(w.document.getElementById(id)).backgroundColor,'rgb(95, 125, 99)','Failure does not change sage CTA');
 assert.equal(w.getComputedStyle(w.document.querySelector('#photoModal .modal')).backgroundColor,'rgb(255, 251, 244)');assert.equal(w.getComputedStyle(w.document.querySelector('#photoModal .upload-drop')).backgroundColor,'rgb(248, 240, 227)');
 w.document.documentElement.lang='ko';w.document.dispatchEvent(new w.CustomEvent('dayo:langchange'));assert.match(w.document.getElementById('partner-photo-status').textContent,/기존 사진은 유지/);assert.equal(w.document.querySelector('#photoModal .upload-title').textContent,'프로필 사진 선택');
 const next=custom.replace('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555');
 api.upload=async()=>({avatar_url:next});w.document.getElementById('photo-save-btn').click();await tick();assert.equal(w.__dayoPartnerProfile.avatar_url,next);assert(!w.document.getElementById('photoModal').classList.contains('is-open'));assert.equal(w.document.getElementById('photo-save-btn').textContent,'프로필 사진 저장');
 assert.doesNotMatch(w.document.getElementById('photoModal').textContent,/\b(?:partner|profile|image)\.[A-Za-z]/,'No raw key');
 for(const fallback of ['', '/qa-legacy.webp','data:image/png;base64,AAAA']){const el=w.document.createElement('div');el.innerHTML='<span>P</span>';w.fetch=async()=>({ok:false});await api.paint(el,'11111111-1111-4111-8111-111111111111',fallback);assert.equal(el.classList.contains('has-photo'),!!fallback);}
 w.supabaseClient.auth.getSession=async()=>({data:{session:{user:{id:'11111111-1111-4111-8111-111111111111',app_metadata:{provider:'google'},user_metadata:{picture:google}},access_token:'local-fixture-only'}}});
 const otherEmpty=w.document.createElement('div');otherEmpty.innerHTML='<span>X</span>';w.fetch=async()=>({ok:false});await api.paint(otherEmpty,'22222222-2222-4222-8222-222222222222');assert.equal(otherEmpty.style.backgroundImage,'','Another user never falls back to the viewer provider image');assert.equal(otherEmpty.querySelector('span').textContent,'');
 let requests=0;w.fetch=async()=>{requests++;throw Error('No image GET proxy');};const el=w.document.createElement('div');el.innerHTML='<span>P</span>';w.document.body.append(el);await api.paint(el,'11111111-1111-4111-8111-111111111111',custom);assert.match(el.style.backgroundImage,/object\/public/);assert.equal(requests,0);assert.equal(el.querySelector('span').hidden,true);w.document.dispatchEvent(new w.CustomEvent('dayo:authchange',{detail:{loggedIn:false}}));assert.equal(el.style.backgroundImage,'');assert.equal(el.querySelector('span').textContent,'');
 const blocked=new JSDOM('<div class="pip-avatar"><span>P</span></div><div class="tutor-placeholder-avatar"></div>',{url:'http://127.0.0.1/',runScripts:'outside-only'});blocked.window.DayORoomAccessReady=Promise.resolve({allowed:false});blocked.window.fetch=()=>{throw Error('Access denied room must not fetch images');};blocked.window.eval(read('public/profile-image-resolver.js'));blocked.window.eval(read('public/profile-images.js'));await tick();blocked.window.close();
 // Authorized existing Room data paths, no general User discovery call.
 for(const role of ['partner','user']){
  const room=new JSDOM('<div class="pip-avatar"><span>P</span></div><div class="tutor-placeholder-avatar">C</div>',{runScripts:'outside-only',url:'http://127.0.0.1/'}),rw=room.window,calls=[];
  rw.DayORoomAccessReady=Promise.resolve({allowed:true,role,userId:'owner',learnerId:'user-id',partnerId:'partner-id',bookingId:'exact-booking'});
  rw.supabaseClient={from(table){assert.equal(table,'profiles');return {select(){return this;},eq(key,id){assert.equal(id,'owner');return this;},maybeSingle:async()=>({data:{avatar_url:custom}})};},rpc:async(name,args)=>{calls.push(name);if(role==='partner'){assert.equal(name,'get_partner_booking_brief');assert.equal(args.p_booking_id,'exact-booking');return {data:{learner_avatar_url:google}};}assert.equal(name,'list_public_partner_profiles');return {data:[{id:'partner-id',avatar_url:kakao}]};}};
  rw.eval(read('public/profile-image-resolver.js'));rw.eval(read('public/profile-images.js'));await tick();await tick();assert.match(rw.document.querySelector('.tutor-placeholder-avatar').style.backgroundImage,role==='partner'?/googleusercontent/:/kakaocdn/);assert.equal(calls.length,1);rw.close();
 }
 // One shared resolver is shipped inside both deploy roots.
 assert.equal(read('public/profile-image-resolver.js'),read('admin/public/profile-image-resolver.js'));
 const ts=require('typescript'),Module=require('module'),React=require('react'),render=require('react-dom/server').renderToStaticMarkup;
 const file=path.join(root,'admin/src/components/admin/profile-image.tsx');const code=ts.transpileModule(read('admin/src/components/admin/profile-image.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;mod._compile(code,file);const Component=mod.exports.ProfileImage;
 for(const url of [google,kakao,custom])assert(render(React.createElement(Component,{avatarUrl:url})).includes('src="'+url+'"'));
 for(const url of ['', 'https://api.dicebear.com/7.x/bottts/svg?seed=old']){const html=render(React.createElement(Component,{avatarUrl:url}));assert(!html.includes('<img'));assert(html.includes('프로필 사진 없음'));}
 const savedGlobals={window:global.window,document:global.document,act:global.IS_REACT_ACT_ENVIRONMENT};global.window=w;global.document=w.document;global.IS_REACT_ACT_ENVIRONMENT=true;
 const mount=w.document.createElement('div');w.document.body.append(mount);const reactRoot=require('react-dom/client').createRoot(mount);
 try{await React.act(async()=>reactRoot.render(React.createElement(Component,{avatarUrl:custom})));assert(mount.querySelector('img'));await React.act(async()=>mount.querySelector('img').dispatchEvent(new w.Event('error')));assert.equal(mount.querySelector('img'),null);assert.equal(mount.firstElementChild.getAttribute('aria-label'),'프로필 사진 없음','Admin failed image becomes neutral empty');}
 finally{await React.act(async()=>reactRoot.unmount());global.window=savedGlobals.window;global.document=savedGlobals.document;global.IS_REACT_ACT_ENVIRONMENT=savedGlobals.act;}
 const dataFile=path.join(root,'admin/src/lib/admin-data.ts');const adminModule=new Module(dataFile,module);adminModule.filename=dataFile;adminModule.paths=module.paths;
 let photoColumns='';const query={select(columns){photoColumns=columns;return this;},in(){return this;},order(){assert(photoColumns.includes('avatar_url'));return Promise.resolve({data:[{id:'partner',avatar_url:custom}]});}};
 adminModule.require=function(name){if(name==='@/lib/supabase')return {supabase:{rpc(name){assert.equal(name,'admin_list_profiles');return query;}}};return module.require(name);};
 adminModule._compile(ts.transpileModule(read('admin/src/lib/admin-data.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,dataFile);
 assert.equal((await adminModule.exports.fetchPartnerProfiles()).data[0].avatar_url,custom,'Admin Partner query includes photo field in every fallback projection');
 dom.window.close();
 console.log('PASS profile-image UI: mirrors/syntax; file input -> preview -> save; error keeps old image; auth-switch rejection; legacy/missing fallback; KO/EN error labels; direct public URL / logout cleanup; Admin shared resolver; exact booking Room photos; denied Room stays denied.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
