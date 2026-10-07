// Local browser layout QA; external requests are blocked.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto((process.env.ACCOUNT_QA_URL||'http://127.0.0.1:3058')+'/mypage#ud-account');await page.waitForFunction(()=>document.querySelector('#ud-current-nickname')?.textContent==='Judy_tester'&&document.querySelector('.pi-photo')?.dataset.dayoUserAvatar);
  const selector=page.locator('#ud-account .i18n-btn');await selector.click();
  assert.deepEqual(await page.locator('#ud-account .i18n-opt').evaluateAll(nodes=>nodes.map(n=>n.dataset.lang)),['KO','EN']);
  await page.locator('#ud-account .i18n-opt[data-lang="EN"]').click();assert.equal(await page.locator('#ud-current-nickname').textContent(),'Judy_tester');
  await page.locator('#ud-account .i18n-menu').waitFor({state:'hidden'});
  assert.equal(await page.locator('.pi-photo span').textContent(),'J');assert.equal(await page.locator('.pi-photo').evaluate(el=>el.style.backgroundImage),'');
  const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,photoWidth:document.querySelector('.pi-photo').getBoundingClientRect().width}));
  assert(geometry.scrollWidth<=geometry.width);assert(geometry.photoWidth>=60);assert.deepEqual(errors,[]);
  await page.locator('#ud-account').scrollIntoViewIfNeeded();const directory=process.env.ACCOUNT_QA_OUTPUT||path.join(__dirname,'../artifacts/user-account');fs.mkdirSync(directory,{recursive:true});
  await page.screenshot({path:path.join(directory,'account-'+width+'.png'),fullPage:true});
  console.log('PASS My Page account '+width+'px: nickname remains on KO/EN switch; KO/EN-only selector; neutral initials avatar; no overflow or page errors');await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
