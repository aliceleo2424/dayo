const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

  assert.equal(publicAccount, rootAccount);
  assert.equal(publicReset, rootReset);
  assert.equal(publicIndex, rootIndex);
  assert.equal(publicMypage, rootMypage);
  assert.equal(publicSupabase, rootSupabase);

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
}

Promise.resolve()
  .then(verifyPasswordChangeAndLogin)
  .then(verifyRecoveryRequestAndEnumerationSafety)
  .then(verifyValidationAndIdentityContracts)
  .then(verifySourceContracts)
  .then(() => {
    console.log('Password account fixtures passed: password update/login, recovery redirect, invalid links, validation, identity gating, enumeration safety, isolated recovery session, and existing auth entry points.');
  });
