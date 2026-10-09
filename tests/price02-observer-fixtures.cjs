'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {makeUi,setup}=require('./price02-eligibility.cjs');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const dashboard=read('public/mypage-dashboard.js');
const localizer=dashboard.slice(dashboard.indexOf('  function localizeGeneratedCopy() {'),dashboard.indexOf('  function observeGeneratedCopy() {'));
const tick=()=>new Promise(r=>setImmediate(r));
async function run(){
 for(const locale of ['KO','EN']){
  const ui=await makeUi('eligible',locale);await ui.ready();const {w,d}=ui;
  w.eval('function i18n(key,vars){return window.DayOI18n.tf(key,vars);}\n'+localizer+'\nwindow.__localizeGeneratedCopy=localizeGeneratedCopy;');
  let callbacks=0,ceiling=false;
  const observer=new w.MutationObserver(()=>{callbacks++;if(callbacks>30){ceiling=true;observer.disconnect();return;}w.__localizeGeneratedCopy();});
  observer.observe(d.querySelector('[data-coupon-wallet]'),{childList:true,subtree:true,attributes:true,characterData:true});
  observer.observe(d.querySelector('#pricing'),{childList:true,subtree:true,attributes:true,characterData:true});
  function stable(label){
   observer.takeRecords();const proposal=d.querySelector('[data-coupon-code=WELCOME_9900]');
   for(let i=0;i<20;i++)w.__localizeGeneratedCopy();
   assert.equal(observer.takeRecords().length,0,'stable state must have zero DOM writes: '+locale+' '+label);
   assert.equal(d.querySelector('[data-coupon-code=WELCOME_9900]'),proposal,'unchanged nodes/focus must be retained');assert(!ceiling);
  }
  async function settled(label){await tick();await tick();assert(!ceiling,'observer loop: '+label);stable(label);}
  try{
   stable('eligible');
   const before=callbacks;d.querySelector('[data-coupon-code=WELCOME_9900]').remove();await settled('external wallet rerender');assert(d.querySelector('[data-coupon-code=WELCOME_9900]'));assert(callbacks-before<=3);
   w.DayOI18n.setLang(locale==='KO'?'EN':'KO');await settled('language switch');
   w.DayOTickets.open();await ui.ready();w.DayOTickets.close();w.DayOTickets.open();await ui.ready();await settled('modal reopen');
   ui.setAccount('purchased');await new Promise(r=>setTimeout(r,5));await ui.ready();await settled('paid-unused account');assert(!d.querySelector('[data-coupon-code=WELCOME_9900]'));
   ui.setAccount('used');await new Promise(r=>setTimeout(r,5));await ui.ready();await settled('used account');assert(!d.querySelector('input[value=trial]'));
   ui.setAccount('loggedout');await new Promise(r=>setTimeout(r,5));await ui.ready();await settled('logout');assert(!d.querySelector('[data-coupon-code=WELCOME_9900]'));
   ui.setAccount('eligible');await new Promise(r=>setTimeout(r,5));await ui.ready();await settled('login');assert(d.querySelector('[data-coupon-code=WELCOME_9900]'));
   ui.setReply(async()=>({ok:false,json:async()=>({ok:false,error:'synthetic-failure'})}));await ui.refresh(true);await settled('API failure');assert(d.querySelector('[data-tk-eligibility-retry]'));
   ui.setReply(null);d.querySelector('[data-tk-eligibility-retry]').click();await ui.ready();await settled('API retry');assert(d.querySelector('input[value=trial]'));
   for(const id of ['trial','single','pack3','pack11','pack33'])assert(d.querySelector('input[value='+id+']'));
   assert.equal(d.querySelector('#order-history').textContent,'9,900원 과거 결제');
   console.log('PASS My Page observer '+locale+': zero writes at rest, node preservation, legitimate rerender/locale/auth/account/paid-used/error-retry/modal transitions settle.');
  }finally{observer.disconnect();w.close();}
 }
}
(async()=>{try{await run();}finally{const f=await setup();await f.db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
