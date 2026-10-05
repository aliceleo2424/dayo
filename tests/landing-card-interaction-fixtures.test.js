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
const expected = [['trial', 9900], ['single', 19900], ['starter3', 54900], ['light11', 179000]];
const cards = [...html.matchAll(/<button type="button" class="ticket-price-card[^\"]*" data-landing-ticket="([^\"]+)">([\s\S]*?)<\/button>/g)];
assert.deepEqual(cards.map(card => card[1]), expected.map(row => row[0]));
for (const [id, price] of expected) {
  const plan = plans.find(plan => (plan.payId || plan.id) === id);
  assert.equal(plan.priceValue, price);
  assert.ok(cards.find(card => card[1] === id)[2].includes(price.toLocaleString('ko-KR')));
}
const partners = html.slice(html.indexOf('<!-- Partners -->'), html.indexOf('<!-- Tickets + CTA -->'));
assert.equal((partners.match(/<article class="journey-card/g) || []).length, 3);
assert.ok(!/data-landing-ticket|data-booking-open|onclick|tabindex|role="button"/.test(partners));
assert.ok(html.includes('(hover: hover) and (pointer: fine)'));
assert.ok(html.includes('.ticket-price-card:focus-visible'));
assert.ok(html.includes('prefers-reduced-motion: reduce'));
assert.ok(html.includes('data-booking-open data-i18n="landing.pricing.book"'));
assert.ok(html.includes('data-tickets-open data-i18n="landing.pricing.buy"'));
const code = modal.slice(modal.indexOf('  var landingSelectionPending'), modal.indexOf('  function init()', modal.indexOf('  var landingSelectionPending')));
(async () => {
  let used = false, notices = 0, reads = 0, purchases = [];
  const ctx = { couponState: { trialUsed: false },
    findPlan: id => plans.find(plan => plan.id === id || plan.payId === id),
    loadCoupons: async () => { reads++; ctx.couponState.trialUsed = used; },
    open: () => notices++, completePurchase: async plan => purchases.push(plan.payId || plan.id) };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  for (const [id] of expected) await ctx.selectLandingPlan(id);
  assert.deepEqual(purchases, expected.map(row => row[0]));
  assert.equal(reads, 1);
  used = true; await ctx.selectLandingPlan('trial');
  assert.equal(purchases.length, 4, 'used trial must never enter checkout');
  assert.equal(notices, 1, 'reuse existing product guidance');
  await ctx.selectLandingPlan('admin_test_1000'); await ctx.selectLandingPlan('unknown');
  assert.equal(purchases.length, 4);
  let release;
  ctx.completePurchase = () => new Promise(resolve => { release = resolve; });
  const pending = ctx.selectLandingPlan('single');
  await ctx.selectLandingPlan('light11');
  release(); await pending;
  const purchaseBody = modal.slice(modal.indexOf('  async function completePurchase'), modal.indexOf('  function bindEvents'));
  assert.ok(purchaseBody.includes('return window.requestPay(payId)'));
  const payment = fs.readFileSync(path.join(root, 'public/ticket-payment.js'), 'utf8');
  assert.ok(payment.includes('if (!session || !session.user)'));
  assert.ok(payment.includes('openLogin()'));
  assert.ok(payment.includes('contact = await checkout.open(session, selectedProduct)'));
  console.log('PASS landing cards: canonical mapping/prices, trial-used guard, duplicate selection, existing requestPay/login/checkout entry, native keyboard buttons, CTA preservation, informational partners, responsive hover/reduced-motion, mirrors');
})().catch(error => { console.error(error); process.exitCode = 1; });
