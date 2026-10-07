// Isolated My Page account regression. No production credentials, APIs or data writes.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),vm=require('vm'),cp=require('child_process');
const {JSDOM}=require('jsdom'),{bootstrap,fixtureHtml}=require('./user-dashboard-fixtures.cjs');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),tick=()=>new Promise(r=>setTimeout(r,30));
const files=['i18n.js','mypage.html','user-dashboard.js','profile-image-editor.js'];
const scripts=['i18n.js','profile-image-resolver.js','profile-images.js','supabase-client.js','user-dashboard.js','profile-image-editor.js'];
const google='https://lh3.googleusercontent.com/account-fixture',kakao='https://k.kakaocdn.net/account-fixture',upload='/qa-uploaded.webp',fallback='';
function fixture(options={}){
 const html=read('public/mypage.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 const dom=new JSDOM(html,{url:'http://127.0.0.1:3058/mypage#ud-account',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.eval(bootstrap({count:0,lang:options.locale||'ko',reports:false}));
 w.DayOTicketWallet={loadUserTicketBalance(){},syncUI(){}};
 const state=w.__udFixture,user=state.user,profile=state.profile;
 Object.assign(user,{app_metadata:{provider:options.provider||'email'},identities:[{provider:options.provider||'email'}],user_metadata:options.providerImage?{picture:options.providerImage}:{}});
 Object.assign(profile,{nickname:options.nickname||'Judy_tester',user_name:'Old name',avatar_url:options.uploaded||'',learning_languages:['fr','es']});
 w.localStorage.setItem('dayo_user_nickname','Stale cached name');w.localStorage.setItem('learningLanguages','fr,es');
 w.supabaseClient.auth.getSession=async()=>({data:{session:{user,access_token:'local-fixture-only'}}});
 const original=w.supabaseClient.from;
 w.supabaseClient.from=table=>{
  const q=original(table);let patch=null;
  q.update=value=>{patch=value;return q;};
  const then=q.then.bind(q);
  q.then=(resolve,reject)=>{if(!patch)return then(resolve,reject);if(w.__rejectNickname)return Promise.resolve({error:{message:'fixture denied'},data:null}).then(resolve,reject);Object.assign(profile,patch);return Promise.resolve({data:[{nickname:profile.nickname,user_id:user.id}],error:null}).then(resolve,reject);};
  return q;
 };
 w.fetch=async(url,options)=>{assert.equal(url,'/api/partner-application-upload?action=profile-image');assert(['POST','DELETE'].includes(options.method));profile.avatar_url=options.method==='DELETE'?'':upload;return {ok:true,json:async()=>({avatar_url:profile.avatar_url})};};
 w.document.querySelector('.topbar [data-mode-switch]').innerHTML='<div class="ms-profile"><button><span class="ms-avatar">J</span></button></div>';
 for(const s of scripts)w.eval(read('public/'+s));
 return dom;
}
function photo(w){return w.document.querySelector('.pi-photo').style.backgroundImage;}
function assertAvatar(w,url,initial='J') {
 const editor=w.document.querySelector('.pi-photo'),header=w.document.querySelector('.topbar .ms-avatar'),label=editor.querySelector('span');
 if(url){assert(photo(w).includes(url));assert(header.style.backgroundImage.includes(url));assert.equal(header.textContent,'');assert(label.hidden);}
 else{assert.equal(photo(w),'');assert.equal(header.style.backgroundImage,'');assert.equal(header.textContent,initial);assert.equal(label.textContent,initial);assert.equal(label.hidden,false);}
 assert.equal(editor.classList.contains('has-photo'),!!url);
}
async function run(){
 for(const f of files){assert.equal(read(f),read('public/'+f),'mirror '+f);if(f.endsWith('.js'))new vm.Script(read('public/'+f));}
 for(const f of ['public/conversation-recap.js','public/conversation-recap.css','public/memory-game.js','public/mypage-dashboard.js','public/partner-report.js','public/room.html','public/session-lifecycle.js','public/session-recap.html','public/user-conversation-report.js','public/user-conversation-report.css','public/profile-image-resolver.js','public/profile-images.js','public/profile-store.js','public/supabase-client.js','public/mode-switch.js','public/partner.html','public/partner-dashboard.js','api/_lib/profile-image-handler.js'])assert.equal(read(f).replace(/\r/g,''),cp.execFileSync('git',['show','origin/main:'+f],{cwd:root,encoding:'utf8'}).replace(/\r/g,''),f+' unchanged');
 for(const options of [{},{provider:'kakao',providerImage:kakao},{provider:'kakao'},{provider:'google',providerImage:google},{provider:'google'},{provider:'google',providerImage:google,uploaded:upload},{provider:'kakao',providerImage:kakao,uploaded:upload}]){
  const dom=fixture(options),w=dom.window;await tick();
  const expected=options.uploaded||options.providerImage||fallback;
  assertAvatar(w,expected);
  assert.equal(w.document.getElementById('ud-current-nickname').textContent,'Judy_tester');
  w.document.querySelector('[data-pi-remove]').click();await tick();
  assertAvatar(w,options.providerImage||fallback);
  w.DayOProfileImages.prepare=async()=>({preview:'blob:http://127.0.0.1/fixture',mime:'image/png',base64:'AAAA'});
  const input=w.document.querySelector('#user-profile-photo-editor input');Object.defineProperty(input,'files',{value:[{type:'image/png',size:4}]});
  input.onchange();await tick();w.document.querySelector('[data-pi-save]').click();await tick();
  assert(photo(w).includes(upload),'saved upload overrides provider');
  assert(w.document.querySelector('.topbar .ms-avatar').style.backgroundImage.includes(upload));
  await tick();dom.window.close();
 }
 const dom=fixture(),w=dom.window;await tick();
 await w.persistNickname('Alex_updated');assert.equal(w.document.getElementById('ud-current-nickname').textContent,'Alex_updated','heading updates synchronously after confirmed save');
 assert.equal(w.document.querySelector('.topbar .ms-avatar').textContent,'A','initial updates immediately');await tick();assertAvatar(w,'','A');
 w.DayOI18n.setLang('EN');assert.equal(w.document.getElementById('ud-current-nickname').textContent,'Alex_updated','locale never overwrites nickname');
 assert.equal(w.document.querySelector('[data-ud-copy="nicknameHint"]').textContent,'Your display name on DayO');
 w.__rejectNickname=true;await assert.rejects(w.persistNickname('Not_saved'));assert.equal(w.document.getElementById('ud-current-nickname').textContent,'Alex_updated');
 const reload=fixture({nickname:w.__udFixture.profile.nickname});await tick();assert.equal(reload.window.document.getElementById('ud-current-nickname').textContent,'Alex_updated','canonical reload overrides stale local cache');
 w._dayoAuthUser={id:'other-account'};w.document.dispatchEvent(new w.CustomEvent('dayo:authchange'));assert.equal(w.document.getElementById('ud-current-nickname').textContent,'','wrong-owner cached profile is not rendered');
 await tick();reload.window.close();await tick();dom.window.close();
 const named=fixture({nickname:'김민'});await tick();assertAvatar(named.window,'','김');
 named.window._dayoAuthProfile.nickname='';named.window._dayoAuthProfile.user_name='Mina';named.window.document.dispatchEvent(new named.window.CustomEvent('dayo:authprofile'));await tick();assertAvatar(named.window,'','M');
 named.window._dayoAuthProfile.user_name='';named.window._dayoAuthUser.user_metadata={name:'Taylor'};named.window.document.dispatchEvent(new named.window.CustomEvent('dayo:authprofile'));await tick();assertAvatar(named.window,'','T');
 named.window._dayoAuthProfile.nickname='';named.window._dayoAuthProfile.user_name='';named.window._dayoAuthUser.user_metadata={};named.window.document.dispatchEvent(new named.window.CustomEvent('dayo:authprofile'));await tick();assertAvatar(named.window,'','');
 assert.equal(named.window.DayOUserAvatar.resolve('/images/partner-avatars/dayo-avatar-03.png',named.window._dayoAuthUser),'','gendered legacy fallback excluded');
 assert.equal(named.window.DayOUserAvatar.resolve('https://api.dicebear.com/7.x/bottts/svg?seed=old',named.window._dayoAuthUser),'','generated fallback excluded');
 await tick();named.window.close();
 for(const locale of ['KO','EN','FR','ES','JA','ZH','xx']){
  const dom=fixture({locale}),w=dom.window;await tick();
  const options=[...w.document.querySelectorAll('#ud-account .i18n-opt')].map(n=>n.dataset.lang);
  assert.deepEqual([...new Set(options)],['KO','EN']);
  assert(['KO','EN','FR','ES'].includes(w.DayOI18n.getLang()),'global locale support preserved');
  w.document.querySelector('#ud-account .i18n-opt[data-lang="EN"]').click();assert.equal(w.DayOI18n.getLang(),'EN');
  assert.equal(w.DayOI18n.langName('fr','EN'),'French');assert.equal(w.DayOI18n.langName('es','EN'),'Spanish');
  assert.deepEqual(w.__udFixture.profile.learning_languages,['fr','es']);assert.equal(w.localStorage.getItem('learningLanguages'),'fr,es');
  await tick();dom.window.close();
 }
 console.log('PASS My Page: canonical nickname immediate save/reload/stale owner/failure; Account-only KO/EN selector; global supported UI locales unchanged; email/Kakao/Google with/without photo, upload priority, deletion initials fallback and nickname/name initials; Partner/Auth/storage/Room untouched.');
}
function accountFixtureHtml(options={}){
 return fixtureHtml({count:0,reports:false,lang:options.lang||'ko'}).replace('</head>','<style>.topbar .ms-avatar{display:inline-block;width:22px;height:22px;border-radius:50%}</style></head>')
  .replace('<script src="/user-dashboard.js"></script>','<script src="/profile-image-resolver.js"></script><script src="/profile-images.js"></script><script>window.__udFixture.profile.nickname="Judy_tester";document.querySelector(".topbar [data-mode-switch]").innerHTML=\'<div class="ms-profile"><button><span class="ms-avatar">J</span></button></div>\';</script><script src="/user-dashboard.js"></script><script src="/profile-image-editor.js"></script>');
}
module.exports={accountFixtureHtml};
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
