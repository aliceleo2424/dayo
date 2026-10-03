const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const modal = read('public/tickets-modal.js');
const payment = read('public/ticket-payment.js');
const api = read('api/ticket-payment.js');
const catalog = read('supabase/migrations/044_add_admin_payment_test_product.sql');

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing source section: ${start}`);
  return source.slice(from, to);
}

const plans = vm.runInNewContext(
  section(modal, 'var PLANS = [', '\n  var CSS =').replace(/^var PLANS = /, '').trim().replace(/;$/, '')
);
const welcomeState = { eligible: false, due: 9900 };
const payload = vm.runInNewContext(
  section(modal, 'function paymentPayload(plan)', '\n  function buyButton') + '\npaymentPayload',
  {
    isCouponApplied: () => welcomeState.eligible,
    welcomeDue: () => ({ due: welcomeState.due })
  }
);
const resolve = vm.runInNewContext(
  section(payment, 'var PRODUCTS = {', '\n  var paying =') +
  section(payment, 'function resolveProduct(planId)', '\n  function notify') + '\nresolveProduct',
  { window: { DayOTickets: { plans, paymentPayload: () => ({ amount: 9900, orderName: 'trial', ticketCount: 1 }) } } }
);
const plan = (id) => {
  const found = plans.find((row) => row.id === id);
  assert.ok(found, `missing plan: ${id}`);
  return found;
};

function check(id, expectedKey, expectedAmount, expectedTickets) {
  const selected = plan(id);
  const ui = payload(selected);
  const product = resolve(selected.payId || selected.id);
  assert.equal(ui.planId, id);
  assert.equal(ui.amount, expectedAmount);
  assert.equal(ui.ticketCount, expectedTickets);
  assert.equal(product.id, expectedKey);
  assert.equal(product.price, expectedAmount);
  assert.equal(product.tickets, expectedTickets);
  assert.match(catalog, new RegExp(`when '${expectedKey}' then[\\s\\S]*?v_amount := ${expectedAmount};[\\s\\S]*?v_ticket_count := ${expectedTickets};`));
}

// A-F: explicit selection, not welcome/local state, controls the product key.
check('trial', 'trial', 9900, 1);
welcomeState.eligible = true;
check('single', 'single', 19900, 1);
welcomeState.eligible = false;
check('single', 'single', 19900, 1); // Trial already used.
welcomeState.eligible = true;
welcomeState.due = 9900;
check('single', 'single', 19900, 1); // Stale welcome state.
check('pack3', 'starter3', 54900, 3);
check('pack11', 'light11', 179000, 11);

// G-I: login precedes preparation; the admin SKU stays guarded; the API and
// PortOne use the server-returned product and amount, never the modal amount.
assert.ok(payment.indexOf('var session = await getSession();') < payment.indexOf('prepared = await preparePayment(session, selectedProduct.id);'));
assert.match(payment, /if \(!session \|\| !session\.user\)[\s\S]*?openLogin\(\)/);
assert.equal(resolve('admin_test_1000').id, 'admin_test_1000');
assert.equal(resolve('admin_test_1000').price, 1000);
assert.match(payment, /if \(productId === 'admin_test_1000'\) body\.payment_test = true/);
assert.match(api, /if \(productKey === 'admin_test_1000'\)[\s\S]*?body\.payment_test !== true/);
assert.match(api, /p_product_key: productKey/);
assert.match(api, /amount: result\.data\.amount/);
assert.match(payment, /amount: prepared\.product\.amount/);
assert.match(payment, /name: prepared\.product\.name/);

for (const name of ['tickets-modal.js', 'ticket-payment.js', 'profile-store.js']) {
  assert.equal(read(name).replace(/\r\n/g, '\n'), read(`public/${name}`).replace(/\r\n/g, '\n'), `${name} mirror differs`);
}

console.log('Payment product identity fixtures passed (trial/single/bundles, auth/admin, server-PortOne amount).');
