const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function verifySignupCorrection() {
  const migration = read('supabase/migrations/074_signup_ticket_zero_and_fake_balance_cleanup.sql');
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/m, 'cleanup is transactional');
  assert.match(migration, /'24003bdd-b457-49b9-9e14-40e6b870f3ab'/,
    'only the observed unused grant lot is targeted');
  assert.match(migration, /'d183aa3f-cf18-4fe2-8e59-075129845267'/,
    'only its matching grant ledger is targeted');
  assert.match(migration, /pg_catalog\.replace\(v_fragment, '1', '0'\)/,
    'both live signup functions replace ticket grants with zero');
  assert.match(migration, /v_rows <> 5/, 'exactly five positive profile balances are cleared');
  assert.match(migration, /dayo_ticket_history_before/, 'consumed ticket history is checked');
  assert.match(migration, /has_welcome_coupon is true/, 'welcome coupon flags are retained');
  assert.doesNotMatch(migration, /create\s+table\s+public\.coupons/i,
    'the correction does not add a coupons table');
}

function createWalletFixture(dbProfile) {
  const listeners = {};
  const storage = new Map([['ticketCount', '1'], ['dayo_ticket_count', '1']]);
  const profileWrites = [];
  const document = {
    readyState: 'complete',
    addEventListener(name, callback) { (listeners[name] ||= []).push(callback); },
    dispatchEvent(event) { for (const callback of listeners[event.type] || []) callback(event); },
    querySelectorAll() { return []; },
  };
  const window = {
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
    },
    DayOProfileStore: { updateProfile(payload) { profileWrites.push(payload); } },
    supabaseClient: dbProfile ? {
      from(table) {
        assert.equal(table, 'profiles');
        return {
          select() {
            return {
              eq() { return { async maybeSingle() { return { data: dbProfile, error: null }; } }; },
            };
          },
        };
      },
    } : null,
    addEventListener() {},
  };
  vm.runInNewContext(read('public/ticket-wallet.js'), {
    window,
    document,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  }, { filename: 'ticket-wallet.js' });
  return { window, document, profileWrites };
}

async function verifyTicketWallet() {
  assert.equal(read('public/ticket-wallet.js'), read('ticket-wallet.js'),
    'ticket wallet root/public mirrors match');
  for (const provider of ['email', 'kakao', 'google']) {
    const fixture = createWalletFixture({ ticket_count: 0 });
    const profileEvent = {
      type: 'dayo:authprofile',
      detail: {
        user: { id: `new-${provider}`, created_at: new Date().toISOString() },
        profile: { ticket_count: 0, provider },
      },
    };
    fixture.document.dispatchEvent(profileEvent);
    assert.equal(fixture.window.DayOTicketWallet.getCount(), 0,
      `${provider} signup immediately replaces a stale local 1 with the server's 0`);
    fixture.document.dispatchEvent(profileEvent);
    assert.equal(fixture.window.DayOTicketWallet.getCount(), 0,
      `${provider} login/refresh does not restore a ticket`);
    assert.equal(fixture.profileWrites.length, 0, 'display sync never writes an entitlement');
  }
  const paid = createWalletFixture({ ticket_count: 2 });
  paid.document.dispatchEvent({
    type: 'dayo:authprofile',
    detail: { user: { id: 'paid' }, profile: { ticket_count: 2 } },
  });
  assert.equal(paid.window.DayOTicketWallet.getCount(), 2,
    'existing paid balance is displayed unchanged');
  paid.window.DayOTicketWallet.addTickets(1);
  assert.equal(paid.profileWrites.length, 0,
    'a client-side count change cannot issue an entitlement in profiles');
  assert.equal(paid.window.DayOTicketWallet.getCount(), 3);
  assert.equal(await paid.window.DayOTicketWallet.loadUserTicketBalance('paid'), 2,
    'a fresh server balance supersedes temporary local display after a purchase');
  assert.equal(paid.window.DayOTicketWallet.getCount(), 2);
}

async function main() {
  verifySignupCorrection();
  await verifyTicketWallet();
  console.log('Signup ticket correction and wallet fixtures passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
