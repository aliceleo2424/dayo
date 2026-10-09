const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const modal = fs.readFileSync(path.join(root, 'public/tickets-modal.js'), 'utf8');
for (const file of ['index.html', 'tickets-modal.js']) {
  assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), fs.readFileSync(path.join(root, 'public', file), 'utf8'));
}
const plans = vm.runInNewContext(modal.slice(modal.indexOf('var PLANS = ['), modal.indexOf('  var CSS =')) + '\nPLANS');
const expected = [['single', 19900], ['starter3', 54900], ['light11', 179000], ['full33', 499000]];
const cards = [...html.matchAll(/<button type="button" class="ticket-price-card[^\"]*" data-landing-ticket="([^\"]+)"(?: disabled)?>([\s\S]*?)<\/button>/g)];
assert.deepEqual(cards.filter(card=>card[1]!=='trial').map(card => card[1]), expected.map(row => row[0]));
for (const [id, price] of expected) {
  const plan = plans.find(plan => (plan.payId || plan.id) === id);
  assert.equal(plan.priceValue, price);
  assert.ok(!/[₩원]|\d{1,3},\d{3}/.test(cards.find(card => card[1] === id)[2]), 'landing choices must not display prices');
}
assert.ok(html.includes('data-landing-ticket="trial"'), 'landing trial uses canonical eligibility');
assert.equal(plans.find(plan => plan.id === 'trial').priceValue,9900);
const partners = html.slice(html.indexOf('<!-- Partners -->'), html.indexOf('<!-- Tickets + CTA -->'));
assert.equal((partners.match(/<article class="journey-card/g) || []).length, 3);
assert.ok(!/data-landing-ticket|data-booking-open|onclick|tabindex|role="button"/.test(partners));
assert.ok(html.includes('(hover: hover) and (pointer: fine)'));
assert.ok(html.includes('#partners .journey-card.reveal.visible { animation-fill-mode: backwards; }'));
assert.ok(html.includes('.ticket-price-card:focus-visible'));
assert.ok(html.includes('prefers-reduced-motion: reduce'));
assert.ok(html.includes('data-booking-open data-i18n="landing.pricing.book"'));
assert.ok(html.includes('data-tickets-open data-i18n="landing.pricing.buy"'));
const code = modal.slice(modal.indexOf('  async function selectLandingPlan'), modal.indexOf('  function init()', modal.indexOf('  var landingSelectionPending')));
(async () => {
  let selections = [], opens = 0;
  const ctx = { selectedPlanId: null, trialState:{status:'ineligible'},
    findPlan: id => plans.find(plan => plan.id === id || plan.payId === id),
    syncSelection: () => selections.push(ctx.selectedPlanId), open: () => opens++,
    completePurchase: () => { throw Error('Opening a landing card must not start checkout'); } };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  for (const [id] of expected) ctx.selectLandingPlan(id);
  assert.deepEqual(selections, ['single','pack3','pack11','pack33']);
  assert.equal(opens, 4);
  for (const id of ['trial','admin_test_1000','unknown']) ctx.selectLandingPlan(id);
  assert.equal(opens, 4);
  const purchaseBody = modal.slice(modal.indexOf('  async function completePurchase'), modal.indexOf('  function bindEvents'));
  assert.ok(purchaseBody.includes('return window.requestPay(payId)'));
  const payment = fs.readFileSync(path.join(root, 'public/ticket-payment.js'), 'utf8');
  assert.ok(payment.includes('if (!session || !session.user)'));
  assert.ok(payment.includes('openLogin()'));
  assert.ok(payment.includes('contact = await checkout.open(session, selectedProduct)'));
  console.log('PASS landing cards: canonical mapping/prices, modal preselection without checkout, trial modal only, existing requestPay/login/checkout entry, native keyboard buttons, CTA preservation, informational partners, responsive hover/reduced-motion, mirrors');
})().catch(error => { console.error(error); process.exitCode = 1; });
