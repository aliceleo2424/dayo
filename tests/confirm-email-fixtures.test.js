const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const normalized = (file) => read(file).replace(/\r\n/g, '\n');
const source = normalized('public/supabase-client.js');
const mode = normalized('public/mode-switch.js');
const store = normalized('public/profile-store.js');
const page = normalized('public/auth-confirmed.html');
const i18n = normalized('public/i18n.js');

for (const file of ['supabase-client.js', 'mode-switch.js', 'profile-store.js', 'i18n.js', 'auth-confirmed.html']) {
  assert.equal(normalized(file), normalized('public/' + file), file + ' root/public mirror');
}

function makeClient(auth) {
  const storage = new Map();
  const alerts = [];
  const deliveries = [];
  const profileUpdates = [];
  const localStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key)
  };
  const window = {
    localStorage,
    location: { hostname: 'www.dayotalk.com', pathname: '/', search: '', href: '/' },
    supabaseClient: {
      auth,
      from(table) {
        assert.equal(table, 'profiles');
        return {
          update(payload) {
            profileUpdates.push(payload);
            return { eq() { return Promise.resolve({ error: null }); } };
          }
        };
      }
    }
  };
  const document = {
    readyState: 'loading',
    documentElement: { hasAttribute: () => false },
    addEventListener() {}
  };
  const context = {
    window, document, localStorage, URLSearchParams,
    alert: (message) => alerts.push(message),
    fetch: async (url) => { deliveries.push(url); return { ok: true }; },
    console: { warn() {}, error() {}, log() {} }
  };
  vm.runInNewContext(source, context, { filename: 'supabase-client.js' });
  window.fetchAuthProfile = async () => null;
  return { window, alerts, deliveries, profileUpdates, storage };
}

async function verifySignupAndLogin() {
  let welcomeCalls = 0;
  let client = makeClient({
    async signUp({ options }) {
      assert.equal(options.emailRedirectTo, 'https://www.dayotalk.com/auth-confirmed.html');
      assert.equal(options.data.dayo_email_signup, true);
      return { data: { user: { id: 'new', email: 'new@example.com' }, session: null }, error: null };
    }
  });
  client.window.DayOSendWelcomeEmail = () => { welcomeCalls += 1; };
  const pending = await client.window.handleEmailSignUp('new@example.com', 'password123');
  assert.equal(pending.needsEmail, true, 'Confirm Email ON: null session is a waiting state');
  assert.equal(client.alerts.length, 0, 'the signup path does not use an alert');
  assert.equal(welcomeCalls, 0, 'no welcome mail before confirmation');
  assert.equal(client.window.location.href, '/', 'no immediate mypage redirect');

  client = makeClient({ async signUp() { return { data: { user: { identities: [] }, session: null }, error: null }; } });
  assert.equal((await client.window.handleEmailSignUp('existing@example.com', 'password123')).needsEmail, true,
    'an obfuscated existing account receives the same pending result');
  assert.equal(client.alerts.length, 0);

  client = makeClient({ async signUp() { return { data: null, error: { code: 'user_already_exists', message: 'User already registered' } }; } });
  assert.equal((await client.window.handleEmailSignUp('existing@example.com', 'password123')).needsEmail, true,
    'an explicit existing-account error is not exposed');

  const user = { id: 'new', email: 'new@example.com', user_metadata: { name: 'New' } };
  client = makeClient({ async signUp() { return { data: { user, session: { user } }, error: null }; } });
  client.window.DayOSendWelcomeEmail = () => { welcomeCalls += 1; };
  await client.window.handleEmailSignUp('new@example.com', 'password123');
  assert.equal(client.window.location.href, '/mypage.html', 'Confirm Email OFF behavior remains');
  assert.equal(welcomeCalls, 1);

  client = makeClient({ async signInWithPassword() { return { data: null, error: { code: 'email_not_confirmed', message: 'Email not confirmed' } }; } });
  assert.equal((await client.window.handleEmailSignIn('new@example.com', 'password123')).needsConfirmation, true);
  assert.equal(client.alerts.length, 0, 'raw confirmation error is not shown');

  client = makeClient({ async signInWithPassword() { return { data: null, error: { code: 'invalid_credentials', message: 'secret detail' } }; } });
  await client.window.handleEmailSignIn('missing@example.com', 'wrong123');
  assert.deepEqual(client.alerts, ['이메일 또는 비밀번호를 확인해 주세요.']);

  client = makeClient({ async signInWithPassword() { return { data: { session: { user } }, error: null }; } });
  await client.window.handleEmailSignIn('new@example.com', 'password123');
  assert.equal(client.window.location.href, '/mypage.html', 'confirmed email login remains normal');
}

async function verifyWelcomeTiming() {
  const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const freshConfirmation = new Date().toISOString();
  const client = makeClient({});
  const user = {
    id: 'late-confirmed', email: 'late@example.com', created_at: oldDate,
    email_confirmed_at: freshConfirmation, user_metadata: { dayo_email_signup: true }
  };
  await client.window.DayOSendWelcomeEmail(user, { welcome_email_sent: false });
  await client.window.DayOSendWelcomeEmail(user, { welcome_email_sent: false });
  assert.equal(client.deliveries.length, 1, 'late-confirmed email signup uses existing sent flag');
  assert.equal(client.profileUpdates.length, 1);
  const oldOAuth = {
    id: 'old-oauth', email: 'oauth@example.com', created_at: oldDate,
    user_metadata: {}, email_confirmed_at: freshConfirmation
  };
  await client.window.DayOSendWelcomeEmail(oldOAuth, { welcome_email_sent: false });
  assert.equal(client.deliveries.length, 1, 'old OAuth users do not become newly welcome-eligible');
}

async function verifyConfirmationPage() {
  const scripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1]).filter(Boolean);
  assert.equal(scripts.length, 2, 'only the two confirmation-page inline scripts are expected');
  async function run(hash, session, user) {
    const elements = Object.fromEntries(['confirmTitle', 'confirmMessage', 'confirmMypage']
      .map((id) => [id, { textContent: '', hidden: false, setAttribute() {} }]));
    let callback;
    let cleared = false;
    const window = {
      location: { hash, pathname: '/auth-confirmed.html' },
      DayOI18n: { t: (key) => key },
      supabaseClient: { auth: {
        async getSession() { return { data: { session } }; },
        async getUser() { return { data: { user }, error: null }; }
      } }
    };
    const context = {
      window, URLSearchParams,
      history: { replaceState() { cleared = true; } },
      document: {
        addEventListener(name, fn) { if (name === 'DOMContentLoaded') callback = fn; },
        getElementById(id) { return elements[id]; }
      }
    };
    scripts.forEach((script) => vm.runInNewContext(script, context));
    await callback();
    return { elements, cleared };
  }
  const success = await run('#access_token=confirmed-token&refresh_token=refresh&type=signup',
    { access_token: 'confirmed-token' }, { id: 'new', email_confirmed_at: new Date().toISOString() });
  assert.equal(success.elements.confirmTitle.textContent, 'auth.confirmPage.successTitle');
  assert.equal(success.elements.confirmMypage.hidden, false);
  assert.equal(success.cleared, true, 'confirmation fragment is removed from the visible URL');
  const invalid = await run('#error=access_denied&type=signup',
    { access_token: 'old-session' }, { id: 'old', email_confirmed_at: new Date().toISOString() });
  assert.equal(invalid.elements.confirmTitle.textContent, 'auth.confirmPage.errorTitle');
  assert.equal(invalid.elements.confirmMypage.hidden, true, 'an existing session alone cannot prove callback success');
}

function verifySourceContracts() {
  assert.match(mode, /showSignupConfirmation\(cleanedEmail\)/);
  assert.match(mode, /\.ms-overlay\.is-confirmation-pending \.ms-form/);
  assert.match(mode, /emailNotConfirmed:/);
  assert.match(mode, /result && result\.needsConfirmation/);
  assert.match(store, /error\.code === 'email_not_confirmed'/);
  assert.match(store, /dayo_email_signup: true/);
  assert.match(source, /var AUTH_REDIRECT = 'https:\/\/www\.dayotalk\.com\/mypage\.html'/,
    'OAuth redirect stays on mypage');
  assert.match(source, /SIGNUP_CONFIRM_REDIRECT = 'https:\/\/www\.dayotalk\.com\/auth-confirmed\.html'/);
  assert.match(source, /error\.code === 'email_not_confirmed'/);
  assert.match(source, /dayo_email_signup === true && user\.email_confirmed_at/);
  assert.match(i18n, /'auth\.confirmPage\.successTitle'/);
  assert.doesNotMatch(source.slice(source.indexOf('window.handleEmailSignUp'), source.indexOf('window.handleEmailSignIn')),
    /alert\('회원가입 오류: '/, 'signup does not expose raw Supabase errors');
}

Promise.resolve().then(verifySignupAndLogin).then(verifyWelcomeTiming)
  .then(verifyConfirmationPage).then(verifySourceContracts)
  .then(() => console.log('Confirm Email fixtures passed'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
