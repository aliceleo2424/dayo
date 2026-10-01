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

function verifyCompactAccountSettings() {
  const account = read('public/password-account.js');
  assert.equal(account, read('password-account.js'), 'account settings root/public mirrors match');
  assert.match(account, /\.dayo-account-settings\{display:flex;align-items:center;justify-content:space-between/);
  assert.match(account, /\.dayo-account-password-btn\{flex:0 0 auto;[^']*background:#fff/);
  assert.match(account, /@media\(max-width:600px\)[^']*\.dayo-account-settings\{padding:10px 12px;flex-wrap:wrap\}/);
  const markup = account.match(/section\.innerHTML = \[([\s\S]*?)\]\.join\(''\);/);
  assert.ok(markup, 'account settings markup exists');
  assert.doesNotMatch(markup[1], /accountDesc/, 'the oversized explanation is not rendered');
  assert.match(markup[1], /dayoPasswordChangeButton/, 'password-change control remains');
}

async function verifyWelcomeCopy() {
  const sent = [];
  const sandbox = {
    module: { exports: {} },
    process: { env: { RESEND_API_KEY: 'fixture-only-key' } },
    fetch: async (_url, options) => {
      sent.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ id: 'fixture-email' }) };
    },
  };
  vm.runInNewContext(read('api/send-welcome.js'), sandbox, { filename: 'send-welcome.js' });
  const response = {
    statusCode: 0,
    setHeader() {},
    end(body) { this.body = JSON.parse(body); },
  };
  await sandbox.module.exports({
    method: 'POST',
    body: { email: 'new@example.com', nickname: 'A&B' },
  }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(sent.length, 1);
  const payload = sent[0];
  assert.match(payload.subject, /외국인 파트너와 첫 대화를 준비/);
  for (const body of [payload.html, payload.text]) {
    assert.match(body, /1:1 화상 대화/);
    assert.match(body, /한국어 가능한 파트너/);
    assert.match(body, /AI 단어 도움/);
    assert.match(body, /첫 이용 9,900원 할인 혜택/);
    assert.match(body, /결제 후 지급/);
    assert.doesNotMatch(body, /가입만으로 무료 티켓이 지급되지 않습니다|가입만으로 무료 티켓이 지급되지는 않아요/);
    assert.match(body, /https:\/\/www\.dayotalk\.com\/#how/);
    assert.doesNotMatch(body, /첫 세션 파트너 예약하기|3회 패키지|글로벌 캐주얼 라운지/);
  }
  assert.match(payload.html, /A&amp;B/, 'the HTML nickname remains escaped');
}

async function main() {
  verifySignupCorrection();
  await verifyTicketWallet();
  verifyCompactAccountSettings();
  await verifyWelcomeCopy();
  console.log('Signup contract, ticket wallet, compact account settings, and welcome copy fixtures passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
