'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { makeUi, setup } = require('./price02-eligibility.cjs');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
async function navigationChecks() {
  const html = read('public/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const dom = new JSDOM(html, { url:'https://dayotalk.com/', runScripts:'outside-only', pretendToBeVisual:true });
  const w = dom.window, d = w.document;
  w.matchMedia = () => ({matches:false}); w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = () => {};
  w.eval(read('public/i18n.js'));
  w.eval(read('public/mobile-nav.js'));
  w.eval(read('public/customer-navigation.js'));
  w.eval(read('public/landing-views.js'));
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  const shown = () => [...d.querySelectorAll('[data-home-content],[data-detail-view]')].filter(e => !e.hidden);
  assert.equal(shown().length, 3); assert(shown().every(e => e.hasAttribute('data-home-content')));
  for (const id of ['pricing','about','how']) {
    d.querySelector('.customer-desktop-nav [data-customer-route='+id+']').click();
    assert.deepEqual(shown().map(e => e.id), [id]);
    assert.equal(w.location.hash, '#'+id);
    assert.equal(d.querySelector('.customer-desktop-nav [aria-current=page]').dataset.customerRoute, id);
    assert(shown()[0].contains(d.activeElement), 'focus belongs to the selected view');
  }
  w.DayOMobileNav.open(); assert.equal(d.querySelector('#menuToggle').getAttribute('aria-expanded'),'true');
  d.querySelector('#mobileNav [data-customer-route=about]').click();
  assert.equal(d.querySelector('#menuToggle').getAttribute('aria-expanded'),'false');
  d.querySelector('.customer-bottom-nav [data-customer-route=home]').click();
  assert.equal(w.location.hash,''); assert.equal(shown().length,3);
  const question = d.querySelector('[data-story-ko]'), first = question.textContent;
  d.querySelector('[data-story-next]').click(); assert.notEqual(question.textContent, first);
  d.querySelector('[data-story-prev]').click(); assert.equal(question.textContent, first);
  d.querySelector('[data-story-index="2"]').click(); assert.match(question.textContent,/바다/);
  d.querySelector('[data-story-pause]').click(); assert.match(d.querySelector('[data-story-pause]').getAttribute('aria-label'),/시작/);
  w.DayOI18n.setLang('EN'); assert.match(question.textContent,/Beach/);
  assert.equal(d.querySelector('.customer-bottom-nav [data-customer-route=home] span').textContent,'Home');
  assert.equal(d.querySelector('.customer-desktop-nav [data-customer-route=home]'),null);
  assert.equal(d.querySelector('.logo img').getAttribute('src'),'/images/logo_header.png');
  let logins=0;
  w.checkUserLoggedIn=()=>false; w.openLoginModal=()=>logins++;
  d.querySelector('.customer-bottom-nav [data-customer-route=mypage]').click();
  assert.equal(logins,1,'guest My Page uses the existing login entry');
  await new Promise(resolve => w.setTimeout(resolve, 0));
  w.close();
  console.log('PASS actual DOM: single detail view, existing routes, focus, active links, drawer closure, Home, story controls, KO/EN, official image logo, no desktop Home');
}
async function ticketChecks() {
  const html = read('public/index.html');
  const cards = html.match(/<div class="ticket-price-row reveal">[\s\S]*?(?=        <div class="reveal" style="display: flex;)/)[0];
  for (const locale of ['KO','EN']) for (const state of ['eligible','purchased','used','free-welcome','loggedout']) {
    const ui = await makeUi(state,locale); await ui.ready();
    const d=ui.d, w=ui.w;
    d.body.setAttribute('data-customer-page','landing');
    d.querySelector('#pricing').innerHTML=cards; w.DayOTickets.renderTrialSalesSurfaces();
    for (const [id,plan,amount,discount] of [['single','single',19900,null],['starter3','pack3',54900,'8%'],['light11','pack11',179000,'18%'],['full33','pack33',499000,'24%']]) {
      const card=d.querySelector('[data-landing-ticket='+id+']');
      assert.equal(card.querySelector('.ticket-landing-total').textContent.replace(/\D/g,''),String(amount));
      assert.equal(card.querySelector('.tk-discount strong')?.textContent||null,discount);
      card.click(); card.click(); await ui.ready();
      assert.equal(d.querySelector('input[name=tkPlan]:checked').value,plan);
      assert.equal(d.querySelector('[data-tk-total]').textContent.replace(/\D/g,''),String(amount));
      assert.equal(ui.purchases.length,0,'navigation does not buy');
      w.DayOTickets.close();
    }
    const trial=d.querySelector('[data-landing-ticket=trial]');
    assert.equal(trial.disabled, ['purchased','used'].includes(state));
    if (!trial.disabled) {trial.click();await ui.ready();assert.equal(d.querySelector('input[name=tkPlan]:checked').value,'trial');}
    if (state==='loggedout') assert(d.querySelector('[data-tk-guest-signin]'),'guest checkout still requires login');
    assert(d.querySelector('[data-tk-experience]'));assert(d.querySelector('.tk-policy'));
    w.close();
  }
  const error=await makeUi('eligible','KO',{reply:async()=>({ok:false,status:503,json:async()=>({error:'unavailable'})})});
  await error.ready();assert(error.d.querySelector('[data-tk-eligibility-retry]'));
  assert(!error.d.querySelector('input[value=trial]:not(:disabled)'));
  assert(!error.d.querySelector('input[value=single]').disabled);
  error.w.close();
  console.log('PASS existing ticket DOM/data/event route KO/EN: five canonical prices, discounts, real eligibility fixtures, error/retry, double tap, exact preselection, no automatic purchase, guest login, preserved experience/policy');
}
(async()=>{try{await navigationChecks();await ticketChecks();}finally{const f=await setup();await f.db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
