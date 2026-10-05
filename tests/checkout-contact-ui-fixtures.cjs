const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.join(__dirname,'..');
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function page(mode=''){
  const html=read('tests/fixtures/checkout-browser.html').replace(/<script src="[^"]+"><\/script>/g,'');
  const dom=new JSDOM(html,{url:'http://localhost/?mode='+mode,runScripts:'dangerously',virtualConsole:new VirtualConsole()});
  for(const name of ['tickets-modal.js','ticket-payment.js','checkout-preparation.js','terms-mini-modal.js'])dom.window.eval(read('public/'+name));
  dom.window.document.querySelector('[data-tickets-open]').click();await tick();
  return dom;
}
async function openTrial(dom){dom.window.document.querySelector('[data-tk-buy="trial"]').click();await tick();}
function fill(dom,name,value,start=value.length,end=start){const el=dom.window.document.querySelector('[name="'+name+'"]');el.value=value;if(el.type==='tel')el.setSelectionRange(start,end);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));return el;}
function all(dom){const el=dom.window.document.querySelector('[data-ck-all]');el.click();}
async function main(){
  let dom=await page();await openTrial(dom);const doc=dom.window.document;
  assert.equal(doc.querySelector('[name=contact_email]').value,'auth@example.invalid');
  assert.equal(doc.querySelectorAll('.ck-preferences,[data-interest],[name=other_interest]').length,0);
  const policyCalls=[];dom.window.DayOTermsMini={open:(...args)=>policyCalls.push(args)};dom.window.openRefundMiniModal=(...args)=>policyCalls.push(args);
  for(const type of ['terms','privacy','refund'])doc.querySelector('[data-ck-policy="'+type+'"]').click();assert.deepEqual(policyCalls,[['terms','#ckAgree_terms'],['privacy','#ckAgree_privacy'],['#ckAgree_refund']]);
  const phone=fill(dom,'mobile_phone','01012345678');assert.equal(phone.value,'010-1234-5678');assert.equal(phone.selectionStart,13);
  for(const value of ['010-1234-5678','010 1234 5678'])assert.equal(fill(dom,'mobile_phone',value).value,'010-1234-5678');
  assert.equal(phone.inputMode,'tel');assert.equal(phone.autocomplete,'tel');assert.equal(phone.maxLength,32);
  all(dom);assert.equal(doc.querySelector('.ck-pay').disabled,false);assert.ok([...doc.querySelectorAll('[data-ck-consent]')].every(e=>e.checked));
  const privacy=doc.querySelector('#ckAgree_privacy');privacy.click();assert.equal(doc.querySelector('.ck-pay').disabled,true);assert.equal(doc.querySelector('[data-ck-all]').indeterminate,true);
  all(dom);assert.equal(doc.querySelector('.ck-pay').disabled,false);all(dom);assert.ok([...doc.querySelectorAll('[data-ck-consent]')].every(e=>!e.checked));all(dom);
  fill(dom,'mobile_phone','01112345678');assert.equal(doc.querySelector('.ck-pay').disabled,true);
  fill(dom,'mobile_phone','01012345678');fill(dom,'contact_email','invalid');assert.equal(doc.querySelector('.ck-pay').disabled,true);
  fill(dom,'contact_email','changed@example.invalid');
  // Separator deletion removes an adjacent digit rather than recreating the dash forever.
  for(const [pos,inputType,expected,caret] of [[4,'deleteContentBackward','011-2345-678',2],[3,'deleteContentForward','010-2345-678',4],[9,'deleteContentBackward','010-1235-678',7],[8,'deleteContentForward','010-1234-678',9]]){
    fill(dom,'mobile_phone','01012345678');phone.setSelectionRange(pos,pos);const event=new dom.window.InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType});phone.dispatchEvent(event);assert.equal(event.defaultPrevented,true);assert.equal(phone.value,expected);assert.equal(phone.selectionStart,caret);
  }
  fill(dom,'mobile_phone','010-9234-5678',5);assert.equal(phone.selectionStart,5);
  fill(dom,'mobile_phone','010-1234-5678',4,8);assert.equal(phone.selectionStart,4);assert.equal(phone.selectionEnd,9);
  fill(dom,'mobile_phone','01012345678');doc.querySelector('.ck-pay').click();await tick();await tick();
  const result=JSON.parse(doc.querySelector('#fixture-result').textContent);assert.deepEqual(result.steps,['contact_saved','order_prepare','mock_pg_opened']);assert.equal(result.amount,9900);assert.equal(result.mobile_phone,'01012345678');assert.equal(result.contact_email,'changed@example.invalid');
  await openTrial(dom);assert.equal(doc.querySelector('[name=contact_email]').value,'changed@example.invalid');dom.window.close();
  dom=await page('saved-contact');await openTrial(dom);assert.equal(dom.window.document.querySelector('[name=contact_email]').value,'saved@example.invalid');dom.window.close();
  for(const mode of ['contact-fail','read-fail']){dom=await page(mode);await openTrial(dom);if(mode==='contact-fail'){fill(dom,'mobile_phone','01012345678');all(dom);dom.window.document.querySelector('.ck-pay').click();await tick();}assert.ok(dom.window.document.querySelector('.ck-form'));assert.equal(dom.window.document.querySelector('#fixture-result').textContent,'');assert.match(dom.window.document.querySelector('.ck-error').textContent,/연락처/);dom.window.close();}
  // Every public SKU reaches mock PortOne with the prepared amount unchanged.
  for(const [plan,amount] of [['single',19900],['pack3',54900],['pack11',179000],['pack33',499000]]){dom=await page();dom.window.document.querySelector('[data-tk-buy="'+plan+'"]').click();await tick();fill(dom,'mobile_phone','01012345678');all(dom);dom.window.document.querySelector('.ck-pay').click();await tick();await tick();assert.equal(JSON.parse(dom.window.document.querySelector('#fixture-result').textContent).amount,amount);dom.window.close();}
  console.log('PASS DOM checkout: prefill/edit/reopen, paste/caret/deletion, all/mixed consent, invalid contact, save failure, no preferences, five SKU mock PG amounts/order sequence');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
