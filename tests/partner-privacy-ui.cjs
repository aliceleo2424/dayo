'use strict';
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const {JSDOM}=require('jsdom'),{chromium}=require('playwright');
const root=require('path').resolve(__dirname,'..'),qa=process.env.DAYO_PRIVACY_QA_DIR;
if(!qa)throw Error('Set DAYO_PRIVACY_QA_DIR to a local artifacts directory.');fs.mkdirSync(qa,{recursive:true});
const privacy=require(root+'/public/partner-privacy.js'),report=require(root+'/public/user-conversation-report.js'),{makeStore,buildMessage}=require(root+'/api/_lib/booking-notifications.js');
let checks=0;const check=(ok,label)=>{assert.ok(ok,label);checks++;};
const uid='00000000-0000-4000-8000-000000000001',booking='00000000-0000-4000-8000-000000000002';
const read=f=>fs.readFileSync(root+'/'+f,'utf8');
async function main(){
 for(const name of ['Jen','Jen M','Jen M.','Anne-Marie','Sofía','Élodie D','서연'])check(privacy.validName(name),'First/initial valid: '+name);
 for(const name of ['Jen Morgan','Jen LL','Jen 2',''])check(!privacy.validName(name),'Invalid format: '+name);
 check(privacy.publicName({nickname:'Legal Full Name'})==='DayO Partner','Unconfirmed legacy nickname never projected');
 check(privacy.publicName({nickname:'Jen M',public_name_ready:true})==='Jen M','Ready first/last initial is preserved');
 for(const bad of ['DY-00000000','DY-OOOOOOOO','DY-11111111','DY-IIIIIIII','JEN4827'])check(!privacy.codePattern.test(bad),'Excluded/legacy code rejected in new UI');
 check(read('public/i18n.js').includes("'mypage.nick.label': { KO: '닉네임', EN: 'Nickname'"),'User nickname label unchanged');
 let rpcCalls=[];const validationClient={rpc:async(name,args)=>{rpcCalls.push({name,args});return {data:args.p_code==='DY-ABCDEFGH',error:null};}};
 check(await privacy.validateReferral(validationClient,' dy-abcdefgh ')==='DY-ABCDEFGH','UI uses exact server validation for submitted code');
 check(rpcCalls[0].name==='validate_partner_referral_code'&&Object.keys(rpcCalls[0].args).join()==='p_code','No arbitrary referrer/user_id request');
 await assert.rejects(privacy.validateReferral(validationClient,'DY-ZZZZZZZZ'),/not valid/);checks++;
 await assert.rejects(privacy.validateReferral({rpc:async()=>({data:null,error:{message:'secret'}})},'DY-ABCDEFGH'),e=>!e.message.includes('secret'));checks++;
 check(await privacy.validateReferral(validationClient,'')==='','Referral remains optional');
 const src=read('public/booking-modal.js'),normalize=src.slice(src.indexOf('  function normalizePartner('),src.indexOf('  function withTestPartnerFallback'));
 const context={canonicalBookingLanguages:v=>v,isTestPartnerId:()=>false};vm.createContext(context);vm.runInContext(normalize,context);
 check(context.normalizePartner({id:uid,nickname:'Legal Full Name'}).name==='DayO Partner','Booking customer card uses verified source only');
 check(context.normalizePartner({id:uid,nickname:'Jen M',public_name_ready:true}).name==='Jen M','Booking name matches pseudonym');
 for(const f of ['public/mypage-dashboard.js','public/room.html','public/supabase-client.js'])check(read(f).includes('public_name_ready === true'),'Customer name guard: '+f);
 const sample={booking_id:booking,learner_id:uid,partner_user_id:uid,partner_name:'Legacy Full Name',partner_comment:'I enjoyed hearing about your quiet cafe.',created_at:'2026-10-08T00:00:00Z',language:'en'};
 check(!report.renderLetter(sample,'en').includes('Legacy Full Name'),'Legacy report names fail closed');
 const verified={...sample,partner_name:'Jen M',__dayoPublicNameVerified:true};
 check(report.renderLetter(verified,'en').includes('Letter from Jen M')&&report.memoryData(verified,'en').partner==='Jen M','Letter and Memory Card share verified public name');
 check(!report.renderLetter(verified,'ko').includes('Legacy Full Name'),'KO privacy boundary');
 let currentReport={...sample};const db={auth:{getUser:async()=>({data:{user:{id:uid}}})},from:table=>{check(table==='session_reports','Report reload uses server-safe projection');return ({select(){return this},eq(){return this},maybeSingle:async()=>({data:{...currentReport}})})},rpc:async()=>({data:[{id:uid,nickname:'Jen M',public_name_ready:true}]})};
 const latest=await report.fetchLatest(db,booking);check(latest.partner_name==='Jen M'&&latest.__dayoPublicNameVerified,'Exact-booking report read rehydrates name');
 db.rpc=async()=>({error:{message:'offline'}});const failed=await report.fetchLatest(db,booking);check(failed.partner_name==='DayO Partner'&&!failed.__dayoPublicNameVerified,'Name lookup failure does not leak or hide report');
 check(report.withLatestContent(verified,failed).partner_name==='DayO Partner','Refresh cannot preserve stale verified name on failure');
 const snapshots=[{data:{public_name:'Jen M',confirmed_at:'2026-10-09'}},{data:{public_name:'Legal Name',confirmed_at:null}},{error:{message:'offline'}}];
 for(const snapshot of snapshots){let table,owner;const store=makeStore({from(t){table=t;return {select(){return this},eq(k,v){owner=[k,v];return this},maybeSingle:async()=>snapshot}}});const name=await store.partnerName(uid,'private@fixture.test');check(table==='partner_public_identity'&&owner[0]==='partner_id'&&owner[1]===uid,'Mail reads exact Partner confirmed store only');check(name===(snapshot.data?.confirmed_at?'Jen M':'DayO Partner'),'Mail confirmed/unconfirmed/error names');}
 let initializedArgs;const newStore=makeStore({from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:null,error:null})}),rpc:async(name,args)=>{initializedArgs={name,args};return {data:'Sofia',error:null};}});check(await newStore.partnerName(uid,'fixture@fixture.test')==='Sofia'&&initializedArgs.name==='get_partner_public_name'&&initializedArgs.args.p_partner_id===uid,'New Partner mail shares server-owned initialization');
 const mail=buildMessage({recipient_role:'learner',event_type:'booking_confirmed',snapshot:{scheduled_at:'2026-10-09T00:00:00Z',status:'confirmed',language:'en'}},'fixture@fixture.test','Jen M','en');check(mail.html.includes('Jen M'),'Mail template uses supplied verified name');
 // Actual shared component in DOM: checkbox confirmation and account-change race.
 const dom=new JSDOM('<html lang="en"><body><input id="nickname" value="Legacy Name"><div id="partner-public-name-policy"></div><div id="referral"></div></body></html>',{runScripts:'outside-only',url:'https://fixture.test/partner'});dom.window.eval(read('public/partner-privacy.js'));
 let user='A',state={public_name:null,confirmed_at:null,referral_code:'DY-ABCDEFGH'},mode='normal',late;
 const client={auth:{getUser:async()=>({data:{user:{id:user}}})},rpc:async(name,args)=>{if(mode==='late'&&name==='get_my_partner_privacy')return new Promise(r=>late=r);if(name==='save_my_partner_public_name')state={...state,public_name:args.p_public_name,confirmed_at:'now'};return {data:{...state}};}};
 const api=dom.window.DayOPartnerPrivacy,input=dom.window.document.getElementById('nickname'),tick=()=>new Promise(r=>setTimeout(r,5));
 api.mountName(client,input);await tick();check(!dom.window.document.querySelector('input[type=checkbox]'),'No additional confirmation checkbox');
 await api.saveName(client,'Jen M');check(state.public_name==='Jen M','Existing Save directly persists a valid name');
 await assert.rejects(api.saveName(client,'Jen Morgan'),/first name/);checks++;
 api.mountName(client,input);await tick();check(input.value==='Jen M','Automatic valid public-name reload prefill');
 mode='late';api.mountName(client,input);await tick();user='B';mode='normal';state={public_name:'Sofia C',confirmed_at:'now',referral_code:'DY-BCDEFGHJ'};dom.window.document.dispatchEvent(new dom.window.Event('dayo:authchange'));await tick();late({data:{public_name:'Old Account Name',confirmed_at:'now'}});await tick();check(input.value==='Sofia C','Old account late response cannot overwrite current account');dom.window.close();
 // Isolated local headless Chrome previews: real controls, actual existing profile-form CSS.
 const html=read('public/partner.html'),form=html.slice(html.indexOf('<form class="profile-form"'),html.indexOf('</form>',html.indexOf('<form class="profile-form"'))+7);
 const styles=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
 const browser=await chromium.launch({executablePath:process.env.DAYO_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{for(const lang of ['en','ko'])for(const width of [390,1280]){const page=await browser.newPage({viewport:{width,height:900}});await page.route('**/*',r=>r.abort());
 const preview=`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${styles}\n${read('public/partner-privacy.css')}\nbody{display:block;margin:0;padding:16px;background:#FFFBF4}main{max-width:760px;margin:auto}.card{padding:20px}.profile-form{min-width:0}h1{font-size:24px}</style></head><body><main><section class="card"><h1>${lang==='ko'?'파트너 프로필':'Partner Profile'}</h1>${form}</section><section class="card" style="margin-top:20px"><h2>${lang==='ko'?'내 추천코드':'My referral code'}</h2><div id="referral" class="partner-referral-code"></div></section></main></body></html>`;
 await page.setContent(preview);await page.addScriptTag({content:read('public/i18n.js')});await page.evaluate(lang=>window.DayOI18n.setLang(lang,false),lang);await page.addScriptTag({content:read('public/partner-privacy.js')});
 await page.evaluate(()=>{const client={auth:{getUser:async()=>({data:{user:{id:'fixture-partner'}}})},rpc:async(name,args)=>({data:{public_name:name==='save_my_partner_public_name'?args.p_public_name:'Jen',confirmed_at:'now',referral_code:'DY-ABCDEFGH'}})};window.fixtureClient=client;window.DayOPartnerPrivacy.mountName(client,document.getElementById('nickname'));window.DayOPartnerPrivacy.mountReferral(document.getElementById('referral'),client);});
 await page.waitForFunction(()=>!document.getElementById('nickname').disabled);
 await page.locator('#nickname').fill('Jen M');await page.locator('#nickname').focus();check(await page.locator('#nickname').evaluate(n=>n===document.activeElement),'Existing name input keyboard focus '+lang+'/'+width);await page.evaluate(()=>DayOPartnerPrivacy.saveName(fixtureClient,'Jen M'));check(await page.locator('#partner-public-name-policy').innerText().then(s=>/saved|저장/.test(s)),'Same Save action '+lang+'/'+width);
 await page.locator('#referral button').click();await page.locator('#referral strong').waitFor();
 await page.screenshot({path:qa+`/privacy-${width}-${lang}.png`,fullPage:true});
 const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,body:{width:getComputedStyle(document.body).width,margin:getComputedStyle(document.body).margin,box:getComputedStyle(document.body).boxSizing,pad:getComputedStyle(document.body).padding,right:document.body.getBoundingClientRect().right},nodes:[...document.querySelectorAll('body *')].filter(n=>n.getBoundingClientRect().right>innerWidth).map(n=>({tag:n.tagName,id:n.id,cls:n.className,right:n.getBoundingClientRect().right,width:n.getBoundingClientRect().width})).slice(0,8)}));
 if(overflow.scroll>width)console.log(overflow);check(overflow.scroll<=width,'No horizontal overflow '+lang+'/'+width);await page.close();}}
 finally{await browser.close();}
 for(const file of ['partner-privacy.js','partner-privacy.css','partner.html','partner-dashboard.js','partner-apply.html','partner-apply.js','booking-modal.js','mypage-dashboard.js','room.html','supabase-client.js','user-conversation-report.js','i18n.js','logged-in-home.js','session-lifecycle.js'])check(read('public/'+file)===read(file),'Mirror '+file);
 console.log(`Partner privacy frontend: ${checks} checks passed; KO/EN 390/1280 headless Chrome component previews. No production writes.`);
 fs.writeFileSync(qa+'/frontend-results.json',JSON.stringify({checks,viewports:[390,1280],localOnly:true,actualProductionE2E:false},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
