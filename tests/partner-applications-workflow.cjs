// Run with NODE_PATH pointing to installed @electric-sql/pglite and playwright.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, role text not null);
    insert into public.profiles values
      ('11111111-1111-4111-8111-111111111111', 'admin'),
      ('33333333-3333-4333-8333-333333333333', 'user');`);
  // Use the existing production helper definition and its grants, not a mock admin flag.
  const adminMigration = fs.readFileSync(path.join(root, 'supabase/migrations/039_secure_bookings_rls.sql'), 'utf8');
  const helperStart = adminMigration.indexOf('create or replace function public.dayo_is_admin()');
  const helperEnd = adminMigration.indexOf('-- Remove the broad production policies');
  assert(helperStart >= 0 && helperEnd > helperStart);
  await db.exec(adminMigration.slice(helperStart, helperEnd));
  await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/077_partner_applications.sql'), 'utf8'));
  const fields = ['full_name','email','contact_method','nationality','current_city','visa_type','strongest_language','partner_languages','korean_level','stranger_conversation_comfort','availability_periods','weekly_session_capacity','device','video_environment','scenario_answer','motivation','privacy_consent'];
  const base = ['Test Applicant','test@example.com','Email','Canada','Seoul','D-2','English',['English'],'basic','comfortable',['weekday_evening'],'3-5','laptop_pc','yes','A'.repeat(80),'Meet people',true];
  const insert = values => db.query(`insert into public.partner_applications (${fields.join(',')}) values (${fields.map((_, i) => '$' + (i + 1)).join(',')})`, values);
  async function denied(fn) { await assert.rejects(fn); }
  await db.exec('set role anon');
  await insert(base);
  await denied(() => db.query('select * from public.partner_applications'));
  await denied(() => db.query("update public.partner_applications set final_status = 'approved'"));
  await denied(() => insert(base.map((v, i) => i === 1 ? ' TEST@example.com ' : v)));
  await denied(() => insert(base.map((v, i) => i === 1 ? 'invalid@example.com' : i === 16 ? false : v)));
  await denied(() => db.query("insert into public.partner_applications (review_score) values (7)"));
  await db.exec("reset role; set role authenticated; set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333'");
  assert.equal((await db.query('select * from public.partner_applications')).rows.length, 0);
  assert.equal((await db.query("update public.partner_applications set final_status = 'approved' returning id")).rows.length, 0);
  await insert(base.map((v, i) => i === 1 ? 'signedin@example.com' : v));
  await db.exec("set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111'");
  const first = (await db.query('select * from public.partner_applications order by created_at')).rows[0];
  assert.equal(first.review_score, 7); assert.equal(first.review_status, 'ready');
  assert.equal(first.final_status, 'pending'); assert.equal(first.test_status, 'not_invited');
  const id = first.id;
  for (const status of ['invited','scheduled','completed']) {
    await db.query('update public.partner_applications set test_status=$1 where id=$2', [status, id]);
    assert.equal((await db.query('select test_status from public.partner_applications where id=$1', [id])).rows[0].test_status, status);
  }
  for (const status of ['hold','rejected','approved']) {
    await db.query('update public.partner_applications set final_status=$1,review_note=$2 where id=$3', [status, 'Reviewed', id]);
    assert.equal((await db.query('select final_status from public.partner_applications where id=$1', [id])).rows[0].final_status, status);
  }
  // Rejection releases the email, but the new pending application is unique again.
  await db.query("update public.partner_applications set final_status='rejected' where id=$1", [id]);
  await db.exec("reset role; set role anon; set request.jwt.claim.sub = ''");
  await insert(base.map((v, i) => i === 1 ? ' TEST@example.com ' : v));
  await denied(() => insert(base));
  await db.exec("reset role; set role authenticated; set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111'");
  const attempts = (await db.query('select id,final_status,review_score,review_status,test_status from public.partner_applications where email=$1', ['test@example.com'])).rows;
  assert.equal(attempts.length, 2);
  assert.equal(attempts.find(row => row.id === id).final_status, 'rejected');
  const reapplication = attempts.find(row => row.id !== id);
  assert.equal(reapplication.final_status, 'pending');
  assert.equal(reapplication.review_score, 7); assert.equal(reapplication.review_status, 'ready');
  assert.equal(reapplication.test_status, 'not_invited');
  await denied(() => db.query("update public.partner_applications set final_status='approved' where id=$1", [id]));
  await denied(() => db.query('delete from public.partner_applications'));
  await denied(() => db.query('update public.partner_applications set review_score=0'));
  for (const visa of ['D-2','D-4','F-series','Other']) {
    await insert(base.map((v, i) => i === 1 ? visa + '@example.com' : i === 5 ? visa : v));
    const row = (await db.query('select review_score,final_status from public.partner_applications where email=$1', [visa.toLowerCase() + '@example.com'])).rows[0];
    assert.equal(row.review_score, 7); assert.equal(row.final_status, 'pending');
  }
  for (const [score, comfort, capacity, video, answer, status] of [
    [0,'uncomfortable','1-2','no','Short','hold'],
    [3,'comfortable','1-2','no','A'.repeat(80),'review'],
    [6,'comfortable','3-5','yes','Short','ready'],
  ]) {
    const values = base.map((v, i) => ({1:`score${score}@example.com`,9:comfort,11:capacity,13:video,14:answer})[i] ?? v);
    await insert(values);
    const row = (await db.query('select review_score,review_status from public.partner_applications where email=$1', [`score${score}@example.com`])).rows[0];
    assert.equal(row.review_score, score); assert.equal(row.review_status, status);
  }
  await db.close();
  console.log('PASS: SQL migration, actual dayo_is_admin helper, anonymous/authenticated submission, duplicate/consent validation, rejected reapplication, admin RLS, protected fields, state persistence, triage boundaries and visa independence');
}

function messages() {
  const ts = require(path.join(root, 'admin/node_modules/typescript'));
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'admin/src/lib/partner-applications.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { exports: module.exports, require: () => ({ supabase: {} }) });
  const { actionChanges, applicationMessage } = module.exports;
  const app = { full_name: 'Jane', partner_languages: ['English', 'Japanese'] };
  for (const action of ['invite','hold','approve','reject']) {
    const message = applicationMessage(action, app, 'https://example.com/test');
    assert(!message.includes('{{')); assert(message.length > 100);
    assert(Object.keys(actionChanges(action)).length > 0);
    if (action === 'invite' || action === 'approve') assert(message.includes('https://example.com/test'));
  }
  assert(applicationMessage('hold', app, '').includes('English, Japanese'));
  console.log('PASS: four review actions and message templates');
}

async function browser() {
  const server = require('node:http').createServer((req, res) => {
    const file = path.join(root, 'public', path.basename((req.url || '').split('?')[0]) || 'partner-apply.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    let payload, requests = 0, error = null;
    await page.route('**/cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'text/javascript', body: 'window.supabase={createClient:()=>({})};' }));
    await page.route('**/supabase-client.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.supabaseClient={from:()=>({insert:async p=>window.submitMock(p)}),storage:{from:()=>({uploadToSignedUrl:async()=>({error:null})})}};' }));
    await page.route('**/api/partner-application-upload', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: '44444444-4444-4444-8444-444444444444', video: { bucket: 'partner-application-videos', path: 'applications/fixture/intro.webm', token: 'fixture-only' } }) }));
    await page.exposeFunction('submitMock', async data => { payload = data; requests++; return { error }; });
    const url = `http://127.0.0.1:${server.address().port}/partner-apply.html`;
    await page.goto(url);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const name of ['full_name','contact_method','nationality','current_country','current_city','scenario_answer']) await page.locator(`[name=${name}]`).fill('Test answer');
    await page.locator('[name=email]').fill('Test@example.com');
    await page.locator('[name=native_language_choice][value=English]').check();
    await page.locator('[name=other_language_choice][value=Japanese]').check();
    await page.getByLabel('Japanese proficiency', { exact: true }).selectOption('fluent');
    await page.locator('[name=partner_languages][value=English]').check();
    await page.locator('[name=partner_languages][value=Japanese]').check();
    const {video}=await require('./partner-application-video-fixture.cjs').createVideo(browser);
    await page.locator('[name=intro_video]').setInputFiles({name:'intro.webm',mimeType:'video/webm',buffer:video});
    await page.locator('[name=intro_video_language]').selectOption('English');
    for (const [name, value] of Object.entries({visa_type:'D-2',korean_level:'basic',stranger_conversation_comfort:'comfortable',weekly_session_capacity:'3-5',device:'laptop_pc',video_environment:'yes'})) await page.locator(`[name=${name}]`).selectOption(value);
    await page.locator('[name=privacy_consent]').check();
    await page.locator('#submit-button').click();
    assert.equal(requests, 0); assert((await page.locator('#form-status').innerText()).includes('availability'));
    await page.locator('[value=weekday_evening]').check();
    error = { code: '23505' };
    await page.locator('#submit-button').click();
    await page.waitForFunction(() => document.querySelector('#form-status').textContent.includes('already'));
    assert(await page.locator('#application-form').isVisible());
    error = { code: '500' };
    await page.locator('#submit-button').click();
    await page.waitForFunction(() => document.querySelector('#form-status').textContent.includes('could not'));
    error = null;
    await page.locator('#submit-button').click();
    await page.locator('#success').waitFor({ state: 'visible' });
    assert.deepEqual(payload.partner_languages, ['English', 'Japanese']);
    assert.deepEqual(payload.native_languages, ['English']);
    assert.deepEqual(payload.other_language_proficiencies, { Japanese: 'fluent' });
    assert.equal(payload.intro_video_path, 'applications/fixture/intro.webm');assert(!('motivation' in payload));
    assert.equal(payload.email, 'test@example.com'); assert.equal(payload.privacy_consent, true);
    assert(!('review_score' in payload)); assert(!('submitted_at' in payload));
    await page.goto(url);
    await page.screenshot({ path: path.join(root, '.partner-qa/mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(root, '.partner-qa/desktop.png'), fullPage: true });
    console.log('PASS: mobile/desktop overflow, required availability, duplicate/error feedback, successful anonymous form payload and screen');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
async function adminBrowser() {
  if (!process.env.PARTNER_ADMIN_QA_URL) return;
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const {video}=await require('./partner-application-video-fixture.cjs').createVideo(browser);
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const user = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.com', role: 'authenticated', aud: 'authenticated', app_metadata: {}, user_metadata: {} };
    const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now()/1000) + 3600 })).toString('base64url'), 'test'].join('.');
    await page.addInitScript(session => {
      localStorage.setItem('sb-mmh apsimcngmtefqfrcg-auth-token'.replace(' ', ''), JSON.stringify(session));
    }, { access_token: token, refresh_token: 'fake-test-token', token_type: 'bearer', expires_at: Math.floor(Date.now()/1000) + 3600, expires_in: 3600, user });
    let row = { id: '22222222-2222-4222-8222-222222222222', full_name: 'Jane Applicant', email: 'jane@example.com', nationality: 'Canada', current_country: 'Canada', current_city: 'Toronto', native_languages: ['English'], other_language_proficiencies: { Japanese: 'fluent' }, partner_languages: ['English','Japanese'], korean_level: 'native', visa_type: 'outside_korea', availability_periods: ['weekend_late_night'], acquisition_source: 'other', acquisition_source_other: 'Local newsletter', intro_video_language: 'English', intro_video_path: 'applications/fixture/intro.webm', weekly_session_capacity: '3-5', review_score: 7, review_status: 'ready', test_status: 'not_invited', final_status: 'pending', review_note: '', submitted_at: new Date().toISOString() };
    let failSave = false;
    await page.route('**/*.supabase.co/**', async route => {
      const url = route.request().url();
      let body;
      if (url.includes('/storage/v1/object/sign/')) {
        if (route.request().method() === 'POST') {
          assert.equal(route.request().postDataJSON().expiresIn, 120);
          body = { signedURL: new URL(url).pathname.replace('/storage/v1', '') + '?token=fixture-only-read-token' };
        } else {
          await route.fulfill({ contentType: 'video/webm', body: video }); return;
        }
      }
      else if (url.includes('/auth/v1/')) body = user;
      else if (url.includes('/rest/v1/profiles')) body = { id: user.id, role: 'admin', nickname: 'Admin', email: user.email };
      else if (url.includes('/rest/v1/partner_applications')) {
        if (route.request().method() === 'PATCH') {
          if (failSave) { await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Test failure' }) }); return; }
          row = { ...row, ...route.request().postDataJSON() }; body = row;
        } else body = [row];
      } else body = [];
      await route.fulfill({ contentType: 'application/json', headers: { 'content-range': '0-0/0' }, body: JSON.stringify(body) });
    });
    await page.routeWebSocket('**/*.supabase.co/**', socket => socket.close());
    await page.goto(process.env.PARTNER_ADMIN_QA_URL);
    await page.getByRole('button', { name: 'Jane Applicant', exact: true }).click({ timeout: 60000 });
    await page.locator('video[src]').waitFor();
    assert((await page.getByRole('dialog').innerText()).includes('Toronto, Canada'));
    assert((await page.getByRole('dialog').innerText()).includes('Japanese: Fluent'));
    assert((await page.getByRole('dialog').innerText()).includes('Late night · 10:00 PM–1:00 AM'));
    assert((await page.getByRole('dialog').innerText()).includes('Local newsletter'));
    assert.equal(await page.locator('video').count(), 1);
    await page.waitForFunction(()=>document.querySelector('video')?.readyState>=1);
    assert.equal(await page.locator('video').evaluate(e=>e.duration),35);
    await page.locator('video').evaluate(e=>e.play());
    assert.equal(await page.locator('video').evaluate(e=>e.paused),false);
    assert.equal(await page.getByAltText('Applicant profile photo').count(),0);
    await page.getByRole('button', { name: 'Refresh private links' }).click();
    await page.locator('video[src]').waitFor();
    await page.getByRole('dialog').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: path.join(root, '.partner-qa/admin-profile-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(root, '.partner-qa/admin-profile-mobile.png') });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: 'Invite to Test', exact: true }).click();
    assert((await page.getByRole('dialog').innerText()).includes('올바른 링크'));
    await page.getByLabel('Test booking link').fill('https://example.com/test');
    await page.getByRole('button', { name: 'Invite to Test', exact: true }).click();
    await page.getByRole('button', { name: 'Copy', exact: true }).waitFor();
    assert.equal(row.test_status, 'invited');
    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    assert((await page.evaluate(() => navigator.clipboard.readText())).includes('https://example.com/test'));
    await page.getByLabel('Test status').selectOption('completed');
    await page.getByLabel('Review note', { exact: true }).fill('Passed test');
    await page.getByRole('button', { name: 'Save note & test status', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[role=dialog]').innerText.includes('저장했습니다'));
    assert.equal(row.test_status, 'completed'); assert.equal(row.review_note, 'Passed test');
    for (const [label, status] of [['Hold','hold'], ['Reject','rejected'], ['Approve','approved']]) {
      if (label === 'Approve') await page.getByLabel('Onboarding link').fill('https://example.com/onboarding');
      await page.getByRole('button', { name: label, exact: true }).last().click();
      await page.getByRole('button', { name: 'Copy', exact: true }).waitFor();
      assert.equal(row.final_status, status);
    }
    failSave = true;
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[role=dialog]').innerText.includes('저장하지 못'));
    assert.equal(row.final_status, 'approved');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Jane Applicant', exact: true }).waitFor();
    assert((await page.locator('tbody').innerText()).includes('approved'));
    console.log('PASS: admin structured profile/private media, mobile/desktop, expiring read links, link validation, four state changes, notes/test status, refresh persistence, failed-save feedback and real clipboard copy (mock backend)');
  } finally { await browser.close(); }
}
(async () => { await database(); messages(); await browser(); await adminBrowser(); })().catch(error => { console.error(error); process.exitCode = 1; });
