const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const turnClient = require('../public/turn-ice.js');
const turnApi = require('../api/turn-credentials.js');

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = String(value || ''); },
  };
}

async function invoke(handler, userId, bookingId, origin = 'https://www.dayotalk.com') {
  const req = {
    method: 'POST',
    headers: {
      origin,
      authorization: userId ? 'Bearer fixture-token' : '',
    },
    body: { bookingId },
    fixtureUserId: userId,
  };
  const res = response();
  await handler(req, res);
  return { status: res.statusCode, body: JSON.parse(res.body || '{}') };
}

const bookingId = '11111111-1111-4111-8111-111111111111';
const learnerId = '22222222-2222-4222-8222-222222222222';
const partnerId = '33333333-3333-4333-8333-333333333333';
const outsiderId = '44444444-4444-4444-8444-444444444444';
const temporaryCredential = 'fixture-temporary-password';
const cloudflareIce = [{
  urls: [
    'stun:stun.cloudflare.com:3478',
    'turn:turn.cloudflare.com:3478?transport=udp',
    'turn:turn.cloudflare.com:443?transport=udp',
    'turn:turn.cloudflare.com:3478?transport=tcp',
    'turns:turn.cloudflare.com:443?transport=tcp',
  ],
  username: 'fixture-temporary-user',
  credential: temporaryCredential,
}];

function apiHandler(overrides = {}) {
  return turnApi.createHandler({
    config: {
      supabaseUrl: 'https://fixture.supabase.co',
      anonKey: 'fixture-anon',
      serviceKey: 'fixture-service',
      turnKeyId: 'fixture-key-id',
      turnApiToken: 'fixture-long-lived-token',
      vercelUrl: '',
    },
    makeClients() { return { auth: {}, service: {} }; },
    authenticateUser(client, req) {
      return Promise.resolve(req.fixtureUserId ? { id: req.fixtureUserId } : null);
    },
    loadBooking() {
      return Promise.resolve({
        id: bookingId,
        learner_id: learnerId,
        partner_id: partnerId,
        partner_user_id: partnerId,
        status: 'confirmed',
      });
    },
    issueCredentials() { return Promise.resolve(cloudflareIce); },
    cache: new Map(),
    ...overrides,
  });
}

async function verifyApiGuards() {
  const handler = apiHandler();
  assert.equal((await invoke(handler, null, bookingId)).status, 401, 'anonymous callers must be denied');
  assert.equal((await invoke(handler, outsiderId, bookingId)).status, 403, 'booking outsiders must be denied');

  const learner = await invoke(handler, learnerId, bookingId);
  assert.equal(learner.status, 200, 'learner participant should receive credentials');
  assert.deepEqual(learner.body.iceServers, cloudflareIce);

  const partner = await invoke(handler, partnerId, bookingId);
  assert.equal(partner.status, 200, 'partner participant should receive credentials');
  assert.deepEqual(partner.body.iceServers, cloudflareIce);
  assert.equal(JSON.stringify(partner.body).includes('fixture-long-lived-token'), false);

  assert.equal((await invoke(handler, learnerId, bookingId, 'https://attacker.example')).status, 403,
    'untrusted browser origins must be denied');
  assert.equal(turnApi.TURN_TTL_SECONDS, 3600);
}

async function verifyProviderAndServerCache() {
  let time = 1000000;
  let calls = 0;
  const handler = apiHandler({
    now: () => time,
    issueCredentials: undefined,
    fetch: async (url, options) => {
      calls += 1;
      assert.equal(url, 'https://rtc.live.cloudflare.com/v1/turn/keys/fixture-key-id/credentials/generate-ice-servers');
      assert.equal(options.headers.Authorization, 'Bearer fixture-long-lived-token');
      assert.equal(JSON.parse(options.body).ttl, 3600);
      return { ok: true, status: 201, json: async () => ({ iceServers: cloudflareIce }) };
    },
  });
  const first = await invoke(handler, learnerId, bookingId);
  time += 60000;
  const cached = await invoke(handler, learnerId, bookingId);
  assert.equal(calls, 1);
  assert.equal(first.body.expiresAt, cached.body.expiresAt, 'cached credentials must keep their original expiry');
  time += 55 * 60 * 1000;
  assert.equal((await invoke(handler, learnerId, bookingId)).status, 200);
  assert.equal(calls, 2, 'expired server cache must request new credentials');

  const failure = apiHandler({ issueCredentials: undefined, fetch: async () => ({ ok: false, json: async () => ({}) }) });
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await invoke(failure, learnerId, bookingId), { status: 502, body: { error: 'turn_unavailable' } });
  } finally { console.error = originalError; }
  assert.equal(turnApi.sanitizeIceServers([{ urls: 'turn:turn.cloudflare.com:3478' }]), null);
  assert.equal(turnApi.sanitizeIceServers([{ ...cloudflareIce[0], credential: '' }]), null);
  assert.equal(turnApi.sanitizeIceServers([{ ...cloudflareIce[0], urls: 'turn:attacker.example:3478' }]), null);
  assert.deepEqual(turnApi.sanitizeIceServers([
    { urls: ['stun:stun.cloudflare.com:3478'] }, cloudflareIce[0],
  ]), [{ urls: ['stun:stun.cloudflare.com:3478'] }, cloudflareIce[0]], 'current split STUN/TURN response must be accepted');
  assert.equal(turnApi.isBookingParticipant({ partner_id: partnerId, partner_user_id: learnerId }, partnerId), false);
  assert.equal((await invoke(apiHandler({ loadBooking: async () => ({ status: 'completed', learner_id: learnerId }) }), learnerId, bookingId)).status, 404);
}

async function verifySupabaseTokenValidation() {
  let tokenChecks = 0;
  let validToken = true;
  const handler = apiHandler({
    authenticateUser: undefined,
    makeClients() {
      return {
        auth: { auth: { getUser: async token => {
          tokenChecks += 1;
          assert.equal(token, 'fixture-token');
          return validToken ? { data: { user: { id: learnerId } } }
            : { data: { user: null }, error: { message: 'invalid token' } };
        } } },
        service: {},
      };
    },
  });
  assert.equal((await invoke(handler, null, bookingId)).status, 401);
  assert.equal(tokenChecks, 0, 'missing bearer token must not be sent to Supabase');
  assert.equal((await invoke(handler, learnerId, bookingId)).status, 200);
  validToken = false;
  assert.equal((await invoke(handler, learnerId, bookingId)).status, 401, 'cached credentials must still require Supabase token validation');
  assert.equal(tokenChecks, 2);
}

async function verifyClientExpiryAndRecovery() {
  let time = 1000000;
  let calls = 0;
  let fail = false;
  const manager = turnClient.createManager({
    now: () => time,
    getAccessToken: async () => 'fixture-session-token',
    fetch: async () => {
      calls += 1;
      return { ok: !fail, status: fail ? 502 : 200, json: async () => ({ iceServers: cloudflareIce, expiresAt: time + 3600000 }) };
    },
  });
  const access = { allowed: true, bookingId };
  await Promise.all([manager.getIceServers(access), manager.getIceServers(access)]);
  assert.equal(calls, 1, 'concurrent requests must share one credential fetch');
  time += 3600000;
  await manager.getIceServers(access);
  assert.equal(calls, 2, 'expired client credentials must refresh');
  time += 3600000;
  fail = true;
  assert.deepEqual(await manager.getIceServers(access), turnClient.FALLBACK_ICE_SERVERS);
  fail = false;
  time += 31000;
  assert.ok((await manager.getIceServers(access)).some(server => JSON.stringify(server.urls).includes('turn:')));
  assert.equal(calls, 4, 'temporary failure should allow a later retry');
  const invalid = turnClient.createManager({
    getAccessToken: async () => 'fixture-session-token',
    fetch: async () => ({ ok: true, json: async () => ({ iceServers: [{ urls: 'turn:turn.cloudflare.com:3478' }] }) }),
  });
  assert.deepEqual(await invalid.getIceServers(access), turnClient.FALLBACK_ICE_SERVERS);
  let aborted = false;
  const stalled = turnClient.createManager({
    requestTimeoutMs: 20,
    getAccessToken: async () => 'fixture-session-token',
    fetch: (url, options) => {
      options.signal.addEventListener('abort', () => { aborted = true; });
      return new Promise(() => {});
    },
  });
  assert.deepEqual(await stalled.getIceServers(access), turnClient.FALLBACK_ICE_SERVERS,
    'a stalled endpoint must not block room entry indefinitely');
  assert.equal(aborted, true);
}

async function verifyClientSuccessAndReconnectCache() {
  const events = [];
  let fetchCount = 0;
  const manager = turnClient.createManager({
    getAccessToken() { return Promise.resolve('fixture-session-token'); },
    fetch(url, options) {
      fetchCount += 1;
      assert.equal(url, '/api/turn-credentials');
      assert.equal(options.method, 'POST');
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ iceServers: cloudflareIce }) });
    },
    logEvent(type, payload) { events.push({ type, payload }); },
  });
  const access = { allowed: true, bookingId, role: 'user' };
  const first = await manager.getIceServers(access);
  const reconnect = await manager.getIceServers(access);
  assert.equal(first, reconnect, 'reconnect should reuse the in-page ICE config');
  assert.equal(fetchCount, 1, 'reconnect must not request another credential');
  assert.ok(first.some((server) => JSON.stringify(server.urls).includes('turn.cloudflare.com')));
  assert.ok(first.some((server) => JSON.stringify(server.urls).includes('stun.l.google.com')),
    'existing STUN servers remain as fallback');
  assert.equal(events.filter((entry) => entry.type === 'turn_credentials_ok').length, 1);

  const listeners = {};
  const peerConnection = {
    iceConnectionState: 'new',
    addEventListener(type, callback) { listeners[type] = callback; },
    getStats() {
      return Promise.resolve(new Map([
        ['transport-1', { id: 'transport-1', type: 'transport', selectedCandidatePairId: 'pair-1' }],
        ['pair-1', { id: 'pair-1', type: 'candidate-pair', state: 'succeeded', nominated: true, localCandidateId: 'local-1', remoteCandidateId: 'remote-1' }],
        ['local-1', { id: 'local-1', type: 'local-candidate', candidateType: 'relay' }],
        ['remote-1', { id: 'remote-1', type: 'remote-candidate', candidateType: 'srflx' }],
      ]));
    },
  };
  manager.bindCall({ peerConnection });
  listeners.icecandidate({ candidate: { candidate: 'candidate:1 1 udp 1 192.0.2.1 5000 typ host' } });
  listeners.icecandidate({ candidate: { type: 'relay' } });
  listeners.icecandidate({ candidate: { type: 'relay' } });
  assert.equal(events.filter((entry) => entry.type === 'ice_candidate_type').length, 2,
    'each observed candidate type is logged once');
  assert.ok(events.some((entry) => entry.type === 'ice_candidate_type' && entry.payload.relay_observed === true));
  peerConnection.iceConnectionState = 'connected';
  listeners.iceconnectionstatechange();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(events.some((entry) => entry.type === 'ice_selected_pair' && entry.payload.relay_selected === true),
    'selected ICE pair should reveal whether relay is actually in use');
}

async function verifyClientFailureFallback() {
  const events = [];
  let fetchCount = 0;
  const manager = turnClient.createManager({
    getAccessToken() { return Promise.resolve('fixture-session-token'); },
    fetch() {
      fetchCount += 1;
      return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
    },
    logEvent(type, payload) { events.push({ type, payload }); },
    warn() {},
  });
  const fallback = await manager.getIceServers({ allowed: true, bookingId, role: 'partner' });
  const reconnect = await manager.getIceServers({ allowed: true, bookingId, role: 'partner' });
  assert.equal(fallback, reconnect);
  assert.equal(fetchCount, 1);
  assert.deepEqual(fallback, turnClient.FALLBACK_ICE_SERVERS);
  assert.ok(events.some((entry) => entry.type === 'turn_credentials_failed' && entry.payload.reason === 'http_503'));
}

function verifySources() {
  const publicRoom = fs.readFileSync(path.join(root, 'public', 'room.html'), 'utf8');
  const rootRoom = fs.readFileSync(path.join(root, 'room.html'), 'utf8');
  const publicClient = fs.readFileSync(path.join(root, 'public', 'turn-ice.js'), 'utf8');
  const rootClient = fs.readFileSync(path.join(root, 'turn-ice.js'), 'utf8');
  assert.equal(publicRoom, rootRoom);
  assert.equal(publicClient, rootClient);
  assert.match(publicRoom, /turn-ice\.js\?v=20260930-cloudflare-turn/);
  assert.match(publicRoom, /activeIceServers = await turnIceManager\.getIceServers\(access\)/);
  assert.match(publicRoom, /new Peer\(participantPeerId, peerOptions\(\)\)/);
  assert.match(publicRoom, /bindCallIceTelemetry\(call\)/);
  assert.doesNotMatch(publicClient, /CLOUDFLARE_(?:TURN_)?(?:KEY|TOKEN|API)/);
  assert.doesNotMatch(publicRoom, /CLOUDFLARE_(?:TURN_)?(?:KEY|TOKEN|API)/);
}

Promise.resolve()
  .then(verifyApiGuards)
  .then(verifyProviderAndServerCache)
  .then(verifySupabaseTokenValidation)
  .then(verifyClientSuccessAndReconnectCache)
  .then(verifyClientFailureFallback)
  .then(verifyClientExpiryAndRecovery)
  .then(verifySources)
  .then(() => {
    console.log('TURN integration fixtures passed: participant guards, temporary credentials, TURN+STUN, fallback, telemetry, reconnect cache, and frontend secret isolation.');
  });
