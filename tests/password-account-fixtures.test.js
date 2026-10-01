const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const account = require('../public/password-account.js');

async function verifyPasswordChangeAndLogin() {
  let storedPassword = 'before-123';
  const client = {
    auth: {
      async updateUser({ password }) {
        storedPassword = password;
        return { data: { user: { id: 'fixture-user' } }, error: null };
      },
      async signInWithPassword({ password }) {
        return password === storedPassword
          ? { data: { session: {} }, error: null }
          : { data: { session: null }, error: { message: 'Invalid login credentials' } };
      },
    },
  };

  const changed = await account.updatePassword(client, 'after-456', 'after-456');
  assert.equal(changed.ok, true, 'email/password user can update the password');
  assert.ok((await client.auth.signInWithPassword({ password: 'before-123' })).error,
    'the previous password no longer signs in');
  assert.ok((await client.auth.signInWithPassword({ password: 'after-456' })).data.session,
    'the new password signs in');
}

async function verifyRecoveryRequestAndEnumerationSafety() {
  const redirects = [];
  const client = {
    auth: {
      async resetPasswordForEmail(email, options) {
        redirects.push({ email, redirectTo: options.redirectTo });
        return email === 'missing@example.com'
          ? { data: {}, error: { message: 'fixture hidden user state' } }
          : { data: {}, error: null };
      },
    },
  };
  const location = { hostname: 'www.dayotalk.com', origin: 'https://www.dayotalk.com' };
  const existing = await account.requestPasswordReset(client, 'member@example.com', location);
  const missing = await account.requestPasswordReset(client, 'missing@example.com', location);
  assert.deepEqual(existing, missing, 'forgot-password response must not reveal account existence');
  assert.equal(existing.submitted, true);
  assert.equal(redirects[0].redirectTo, 'https://www.dayotalk.com/reset-password.html');
  assert.equal(account.recoveryRedirect({ hostname: 'localhost', origin: 'http://localhost:4173' }),
    'http://localhost:4173/reset-password.html');
}

function verifyValidationAndIdentityContracts() {
  assert.equal(account.validatePassword('short', 'short').code, 'too_short');
  assert.equal(account.validatePassword('long-enough', 'different').code, 'mismatch');
  assert.equal(account.validatePassword('long-enough', 'long-enough').ok, true);

  const oauthOnly = { identities: [{ provider: 'google' }, { provider: 'kakao' }] };
  assert.equal(account.hasEmailIdentity(oauthOnly, null), false,
    'OAuth-only users must not receive password-change UI');
  const linked = { identities: [{ provider: 'google' }, { provider: 'email' }] };
  assert.equal(account.hasEmailIdentity(linked, null), true,
    'email + OAuth users retain password-change access');
  assert.equal(account.hasEmailIdentity({ identities: [] }, {
    data: { identities: [{ provider: 'email' }, { provider: 'google' }] },
  }), true, 'getUserIdentities result is authoritative');

  assert.equal(account.readRecoveryUrl({ search: '', hash: '#type=recovery&access_token=fixture' }).hinted, true);
  assert.equal(account.readRecoveryUrl({ search: '?code=fixture', hash: '' }).hinted, true);
  assert.equal(account.readRecoveryUrl({ search: '', hash: '#error_code=otp_expired' }).error, 'otp_expired');
}

async function verifySeparatedEmailAuthWithMocks() {
  const source = fs.readFileSync(path.join(root, 'public', 'profile-store.js'), 'utf8');
  const authFunctions = source.split('function authError')[1].split('async function signInWithGoogle')[0];
  const sandbox = {
    console: { warn() {} },
    window: {},
    client: null,
    getClient() { return sandbox.client; },
    nameFromEmail(email) { return String(email).split('@')[0]; },
    displayNameFromUser(user) { return user && user.email ? user.email.split('@')[0] : ''; },
    async ensureProfileForUser(user) { return { user_name: user.email.split('@')[0] }; },
    localProfileForUser(user) { return { user_name: user.email.split('@')[0] }; },
    applyProfileToLocal() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(
    'function authError' + authFunctions +
    '\nthis.authApi = { signInWithEmail: signInWithEmail, signUpWithEmail: signUpWithEmail };',
    sandbox,
  );

  let signInCalls = 0;
  let signUpCalls = 0;
  sandbox.client = { auth: {
    async signInWithPassword({ email }) {
      signInCalls += 1;
      return { data: { session: {}, user: { id: 'existing', email } }, error: null };
    },
    async signUp() { signUpCalls += 1; throw new Error('signup must not run'); },
  } };
  const login = await sandbox.authApi.signInWithEmail('member@example.com', 'correct-password');
  assert.equal(login.isNew, false);
  assert.equal(signInCalls, 1);
  assert.equal(signUpCalls, 0, 'login with an existing account never invokes signup');

  for (const errorMessage of ['Invalid login credentials', 'User not found']) {
    sandbox.client = { auth: {
      async signInWithPassword() {
        return { data: { session: null }, error: { message: errorMessage, status: 400 } };
      },
    } };
    await assert.rejects(
      sandbox.authApi.signInWithEmail('unknown@example.com', 'wrong-password'),
      (error) => error.code === 'credentials' && error.userMessage === '',
      'wrong email and wrong password must be indistinguishable',
    );
  }

  signInCalls = 0;
  sandbox.client = { auth: {
    async signInWithPassword() { signInCalls += 1; throw new Error('signin must not run'); },
    async signUp() {
      return { data: { user: null, session: null }, error: { message: 'User already registered' } };
    },
  } };
  const explicitExisting = await sandbox.authApi.signUpWithEmail('member@example.com', 'correct-password');
  assert.equal(explicitExisting.signupNotice, true);
  assert.equal(signInCalls, 0, 'signup with an existing account never invokes login');

  sandbox.client = { auth: {
    async signUp({ email }) {
      return { data: { user: { email, identities: [] }, session: null }, error: null };
    },
  } };
  const obfuscatedExisting = await sandbox.authApi.signUpWithEmail('member@example.com', 'different-password');
  assert.equal(obfuscatedExisting.signupNotice, true);
  assert.equal(obfuscatedExisting.isNew, false);

  sandbox.client = { auth: {
    async signUp({ email }) {
      return { data: { user: { email, identities: [{ provider: 'email' }] }, session: null }, error: null };
    },
  } };
  const newSignup = await sandbox.authApi.signUpWithEmail('new@example.com', 'new-password');
  assert.equal(newSignup.signupNotice, true);
  assert.equal(newSignup.needsEmail, true);
}

function verifySourceContracts() {
  const publicAccount = fs.readFileSync(path.join(root, 'public', 'password-account.js'), 'utf8');
  const rootAccount = fs.readFileSync(path.join(root, 'password-account.js'), 'utf8');
  const publicReset = fs.readFileSync(path.join(root, 'public', 'reset-password.html'), 'utf8');
  const rootReset = fs.readFileSync(path.join(root, 'reset-password.html'), 'utf8');
  const publicIndex = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const rootIndex = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const publicMypage = fs.readFileSync(path.join(root, 'public', 'mypage.html'), 'utf8');
  const rootMypage = fs.readFileSync(path.join(root, 'mypage.html'), 'utf8');
  const publicSupabase = fs.readFileSync(path.join(root, 'public', 'supabase-client.js'), 'utf8');
  const rootSupabase = fs.readFileSync(path.join(root, 'supabase-client.js'), 'utf8');
  const modeSwitch = fs.readFileSync(path.join(root, 'public', 'mode-switch.js'), 'utf8');
  const rootModeSwitch = fs.readFileSync(path.join(root, 'mode-switch.js'), 'utf8');
  const profileStore = fs.readFileSync(path.join(root, 'public', 'profile-store.js'), 'utf8');
  const rootProfileStore = fs.readFileSync(path.join(root, 'profile-store.js'), 'utf8');
  const i18n = fs.readFileSync(path.join(root, 'public', 'i18n.js'), 'utf8');
  const rootI18n = fs.readFileSync(path.join(root, 'i18n.js'), 'utf8');

  assert.equal(publicAccount, rootAccount);
  assert.equal(publicReset, rootReset);
  assert.equal(publicIndex, rootIndex);
  assert.equal(publicMypage, rootMypage);
  assert.equal(publicSupabase, rootSupabase);
  assert.equal(modeSwitch, rootModeSwitch);
  assert.equal(profileStore, rootProfileStore);
  assert.equal(i18n.replace(/\r\n/g, '\n'), rootI18n.replace(/\r\n/g, '\n'));

  assert.match(publicAccount, /resetPasswordForEmail/);
  assert.match(publicAccount, /PASSWORD_RECOVERY/);
  assert.match(publicAccount, /updateUser\(\{ password:/);
  assert.match(publicAccount, /provider \|\| ''\)\.toLowerCase\(\) === 'email'/);
  assert.doesNotMatch(publicAccount, /profiles?\.provider/);
  assert.match(publicSupabase, /storageKey = 'dayo-password-recovery-auth'/,
    'recovery must not overwrite the ordinary DayO auth session');
  assert.match(publicReset, /data-password-recovery/);
  assert.match(publicReset, /id="dayoRecoveryForm"/);
  assert.match(publicIndex, /password-account\.js\?v=20260930-password-recovery/);
  assert.match(publicMypage, /password-account\.js\?v=20260930-password-recovery/);
  assert.match(modeSwitch, /handleKakaoLogin\(\)/);
  assert.match(modeSwitch, /handleGoogleLogin\(\)/);
  assert.match(modeSwitch, /id="msLoginForm"/);
  assert.match(modeSwitch, /data-ms-tab="signup"/);

  const signInSection = profileStore.split('async function signInWithEmail')[1]
    .split('async function signUpWithEmail')[0];
  const signUpSection = profileStore.split('async function signUpWithEmail')[1]
    .split('async function signInWithGoogle')[0];
  assert.match(signInSection, /signInWithPassword/);
  assert.doesNotMatch(signInSection, /auth\.signUp/,
    'login must never fall through to account creation');
  assert.match(signInSection, /authError\('credentials', ''\)/,
    'invalid email and invalid password share a non-enumerating error');
  assert.match(signUpSection, /auth\.signUp/);
  assert.doesNotMatch(signUpSection, /signInWithPassword/,
    'signup must never turn into login for an existing account');
  assert.ok((signUpSection.match(/signupNotice: true/g) || []).length >= 3,
    'new, obfuscated-existing, and explicit-existing signup outcomes use a neutral notice');
  assert.match(modeSwitch, /authAction === 'signup' \? 'signUpWithEmail' : 'signInWithEmail'/);
  assert.doesNotMatch(modeSwitch, /showToast\(\(err && err\.message\)/,
    'raw Supabase auth errors must not be shown');
  assert.match(i18n, /이메일 또는 비밀번호를 확인해 주세요\./);
  assert.doesNotMatch(i18n, /이미 가입하셨다면 로그인 탭에서 로그인해 주세요\./);
  assert.match(publicAccount, /\[DayO 돼요\] 비밀번호 재설정 안내/);
  assert.doesNotMatch(publicAccount, /sentBody: '[^']*Reset your password/);
}

Promise.resolve()
  .then(verifyPasswordChangeAndLogin)
  .then(verifyRecoveryRequestAndEnumerationSafety)
  .then(verifyValidationAndIdentityContracts)
  .then(verifySeparatedEmailAuthWithMocks)
  .then(verifySourceContracts)
  .then(() => {
    console.log('Password account fixtures passed: password update/login, recovery redirect and copy, invalid links, validation, identity gating, enumeration safety, isolated recovery session, separated signup/login, generic credential errors, and existing OAuth entry points.');
  });
