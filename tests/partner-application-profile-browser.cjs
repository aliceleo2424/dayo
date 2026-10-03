const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const {createVideo}=require('./partner-application-video-fixture.cjs');
(async()=>{
 const server=require('node:http').createServer((req,res)=>{const file=path.join(root,'public',path.basename((req.url||'/').split('?')[0])||'partner-apply.html');if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const {video,shortVideo}=await createVideo(browser);
  for(const width of [390,1280]){
   const page=await browser.newPage({viewport:{width,height:900}});let payload,uploads=[],tickets=0,submissions=0,uploadFailure=false,apiFailure=false;
   await page.exposeFunction('fixtureSubmit',async data=>{payload=data;submissions++;return {error:null}});
   await page.exposeFunction('fixtureUpload',async(bucket,object,token)=>{uploads.push({bucket,object,token});return {error:uploadFailure?{message:'Fixture failure'}:null}});
   await page.route('**/cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:'window.supabase={createClient:()=>({})}'}));
   await page.route('**/supabase-client.js',r=>r.fulfill({contentType:'text/javascript',body:'window.supabaseClient={from:()=>({insert:p=>window.fixtureSubmit(p)}),storage:{from:bucket=>({uploadToSignedUrl:(path,token,file)=>window.fixtureUpload(bucket,path,token)})}}'}));
   await page.route('**/api/partner-application-upload',r=>{tickets++;assert(r.request().postDataJSON().video);return r.fulfill({status:apiFailure?503:200,contentType:'application/json',body:JSON.stringify(apiFailure?{error:'Fixture unavailable'}:{id:'44444444-4444-4444-8444-444444444444',video:{bucket:'partner-application-videos',path:'applications/fixture/intro.webm',token:'upload-video'}})});});
   await page.goto('http://127.0.0.1:'+server.address().port+'/partner-apply.html');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await page.locator('fieldset').count(),7);
   for(const [name,value]of Object.entries({full_name:'Test Applicant',email:'Applicant@example.invalid',contact_method:'Email',nationality:'Canada',current_country:'Canada',current_city:'Toronto',scenario_answer:'I would give the person time and ask a specific question about their interests so they can comfortably join the conversation.'}))await page.locator('[name='+name+']').fill(value);
   await page.locator('[name=native_language_choice][value=English]').check();await page.locator('[name=native_language_choice][value=Other]').check();await page.locator('[name=native_language_other]').fill('Hindi');
   await page.locator('[name=other_language_choice][value=French]').check();await page.getByLabel('French proficiency',{exact:true}).selectOption('conversational');assert.equal(await page.locator('[name=partner_languages][value=French]').count(),0);
   await page.getByLabel('French proficiency',{exact:true}).selectOption('fluent');await page.locator('[name=partner_languages][value=French]').check();
   await page.locator('[name=other_language_choice][value=Other]').check();await page.locator('[name=other_language_name]').fill('Italian');await page.getByLabel('Italian proficiency',{exact:true}).selectOption('basic');assert.equal(await page.locator('[name=partner_languages][value=Italian]').count(),0);
   await page.locator('[name=partner_languages][value=English]').check();await page.locator('[name=partner_languages][value=Hindi]').check();
   for(const [name,value]of Object.entries({visa_type:'outside_korea',korean_level:'native',stranger_conversation_comfort:'comfortable',weekly_session_capacity:'6-10',device:'laptop_pc',video_environment:'yes',acquisition_source:'other'}))await page.locator('[name='+name+']').selectOption(value);
   await page.locator('[name=acquisition_source_other]').fill('Community newsletter');await page.locator('[value=weekday_early_morning]').check();await page.locator('[value=weekend_late_night]').check();await page.locator('[name=privacy_consent]').check();
   assert.equal(await page.locator('[name=profile_photo],[name=motivation]').count(),0);
   await page.locator('[name=intro_video_language]').selectOption('French');
   await page.locator('[name=partner_languages][value=French]').uncheck();assert.equal(await page.locator('[name=intro_video_language]').inputValue(),'');await page.locator('[name=partner_languages][value=French]').check();await page.locator('[name=intro_video_language]').selectOption('English');
   await page.locator('#submit-button').click();assert.equal(tickets,0);assert.equal(submissions,0);assert.equal(await page.locator('[name=intro_video]').evaluate(e=>e.validity.valueMissing),true);
   await page.locator('[name=intro_video]').setInputFiles({name:'short.webm',mimeType:'video/webm',buffer:shortVideo});
   await page.locator('#submit-button').click();await page.getByRole('status').filter({hasText:'30–60 second'}).waitFor();assert.equal(tickets,0);assert.equal(submissions,0);
   await page.locator('[name=intro_video]').setInputFiles({name:'intro.webm',mimeType:'video/webm',buffer:video});
   apiFailure=true;await page.locator('#submit-button').click();
   await page.waitForFunction(()=>!document.querySelector('#submit-button').disabled);
   assert((await page.locator('#form-status').innerText()).includes('unavailable'),'Expected API failure; got: '+await page.locator('#form-status').innerText());assert.equal(submissions,0);apiFailure=false;
   uploadFailure=true;await page.locator('#submit-button').click();await page.locator('#form-status').filter({hasText:'Could not upload'}).waitFor();assert.equal(submissions,0);uploadFailure=false;
   await page.locator('#submit-button').click();await page.locator('#success').waitFor({state:'visible'});
   assert.deepEqual(payload.native_languages,['English','Hindi']);assert.deepEqual(payload.other_language_proficiencies,{French:'fluent',Italian:'basic'});assert.deepEqual(payload.partner_languages,['English','Hindi','French']);assert.equal(payload.visa_type,'outside_korea');assert.equal(payload.current_country,'Canada');assert.equal(payload.korean_level,'native');assert.deepEqual(payload.availability_periods,['weekday_early_morning','weekend_late_night']);assert.equal(payload.acquisition_source,'other');assert.equal(payload.acquisition_source_other,'Community newsletter');assert(!('motivation' in payload));assert(!('profile_photo_path' in payload));assert.equal(payload.intro_video_language,'English');assert.equal(payload.intro_video_path,'applications/fixture/intro.webm');assert(uploads.some(u=>u.bucket==='partner-application-videos'));assert(!('review_score'in payload));
   await page.goto('http://127.0.0.1:'+server.address().port+'/partner-apply.html');await page.screenshot({path:path.join(root,'.partner-qa/profile-form-'+width+'.png'),fullPage:true});await page.close();
  }
  console.log('PASS: mobile/desktop new submission, native/Other multi-select, per-language proficiency and host eligibility, overseas/KST/source, required video decoding and duration validation, private signed-upload calls, API/upload failure prevents submission.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1});
