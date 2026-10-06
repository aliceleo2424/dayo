const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const requireAdmin = createRequire(path.join(root, 'admin/package.json'));
const ts = requireAdmin('typescript');
const React = requireAdmin('react');
const render = requireAdmin('react-dom/server').renderToStaticMarkup;
let profiles = [], profileError = null, state = [], effects = [], calls = [];
const bookings = [{ id: 'booking-exact', learner_id: 'google-id', status: 'completed', scheduled_at: '2026-10-05T00:00:00Z' }];
const reports = [{ booking_id: 'other-booking', learner_id: 'google-id', rating: 5, review: 'Other session review' }];
const supabase = { from(table) { return query(table); }, rpc(name) { assert.equal(name, 'admin_list_profiles'); return query('profiles'); } };
function query(table) {
  const q = {};
  for (const method of ['select', 'eq', 'or', 'order', 'limit']) q[method] = (...args) => { calls.push({ table, method, args }); return q; };
  q.then = (resolve, reject) => Promise.resolve({ data: table === 'profiles' ? profiles : table === 'bookings' ? bookings : table === 'session_reports' ? reports : [], error: table === 'profiles' ? profileError : null }).then(resolve, reject);
  return q;
}
let index = 0;
const hooks = { ...React, useState(initial) { const i = index++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; }, useEffect(fn) { effects.push(fn); }, useMemo(fn) { return fn(); }, useRef(value) { return { current: value }; } };
const cache = {};
function load(file, extra = '') {
  if (cache[file]) return cache[file];
  const source = fs.readFileSync(path.join(root, file), 'utf8') + extra;
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(output, { module: mod, exports: mod.exports, console, Map, Set, require(name) {
    if (name === 'react') return hooks;
    if (name === '@/lib/supabase') return { supabase };
    if (name === '@/lib/admin-data') return load('admin/src/lib/admin-data.ts');
    if (name === '@/components/admin/provider-badge') return load('admin/src/components/admin/provider-badge.tsx');
    if (name === '@/lib/utils') return { formatCurrency: String, formatDate: String };
    if (name.startsWith('@/components/')) return new Proxy({}, { get: () => props => React.createElement('div', null, props.children) });
    return requireAdmin(name);
  } }, { filename: file });
  cache[file] = mod.exports;
  return mod.exports;
}
const component = load('admin/src/components/admin/partner-detail-modal.tsx', '\nexport { loadSessionLearners, SessionLearnerIdentity };');
function identity(learner, fallback = '학습자 정보 없음') {
  return render(React.createElement(component.SessionLearnerIdentity, { session: { learner_name: learner?.name || fallback, learner_email: learner?.email ?? null, learner_provider: learner?.provider || 'unknown', learner_profile_found: Boolean(learner) } }));
}
(async () => {
  profiles = [
    { id: 'email-id', user_id: null, nickname: 'Email learner', email: 'email@example.test', provider: 'email' },
    { id: 'google-id', user_id: null, nickname: '젤리', email: 'google@example.test', provider: 'google' },
    { id: 'kakao-id', user_id: null, nickname: '카카오 학습자', email: null, provider: 'kakao' },
    { id: 'nameless-id', user_id: null, nickname: '', user_name: '', email: 'nameless@example.test', provider: 'email' },
    { id: 'display-id', user_id: null, nickname: '', user_name: 'Display name', email: 'display@example.test', provider: 'google' },
    { id: 'legacy-profile', user_id: 'legacy-id', nickname: 'Legacy learner', email: 'legacy@example.test', provider: 'email' },
    { id: 'unrelated-id', user_id: 'google-id', nickname: 'Wrong alias', email: 'wrong@example.test', provider: 'email' },
    { id: 'partner-id', nickname: 'Partner should never appear', email: 'partner@example.test', provider: 'email' },
  ];
  const ids = ['email-id', 'google-id', 'kakao-id', 'nameless-id', 'display-id', 'legacy-id', 'missing-id'];
  const result = await component.loadSessionLearners(ids);
  assert.equal(result.failed, false);
  assert.equal(result.identities.size, 6);
  assert.match(identity(result.identities.get('email-id')), /Email learner.*email@example.test.*이메일/s);
  assert.match(identity(result.identities.get('google-id')), /젤리.*google@example.test.*구글/s);
  assert.match(identity(result.identities.get('kakao-id')), /카카오 학습자.*이메일 미등록.*카카오/s);
  assert.equal(result.identities.get('nameless-id').name, 'nameless@example.test');
  assert.equal(result.identities.get('display-id').name, 'Display name');
  assert.equal(result.identities.get('legacy-id').name, 'Legacy learner');
  assert.equal(result.identities.get('google-id').name, '젤리', 'exact profile id wins over legacy alias');
  assert.match(identity(result.identities.get('missing-id')), /학습자 정보 없음/);
  assert.doesNotMatch(identity(result.identities.get('missing-id')), /이메일 미등록|Partner should never appear/);
  assert.ok(calls.some(c => c.table === 'profiles' && c.method === 'or' && c.args[0] === 'id.in.(' + ids.join(',') + '),user_id.in.(' + ids.join(',') + ')'));
  console.log('Email/Google/Kakao, nickname/display name/email priority, NULL email, missing profile, exact id and legacy id: passed');
  profileError = { message: 'permission denied' };
  const failed = await component.loadSessionLearners(ids);
  assert.equal(failed.failed, true);
  assert.equal(failed.identities.size, 0);
  assert.doesNotMatch(identity(null, '학습자 정보를 불러오지 못했습니다.'), /이메일 미등록|학습자 정보 없음/);
  profileError = null;
  component.PartnerDetailModal({ partner: { id: 'partner-id', user_id: null, point_balance: 0 }, open: true, onOpenChange() {} });
  effects[0]();
  // The loader is asynchronous even when the query fixture resolves immediately.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state[0][0].id, 'booking-exact');
  assert.equal(state[0][0].learner_id, 'google-id');
  assert.equal(state[0][0].learner_name, '젤리');
  assert.equal(state[0][0].learner_email, 'google@example.test');
  assert.equal(state[0][0].rating, null, 'other booking report must not supply rating');
  assert.equal(state[0][0].review, null, 'other booking report must not supply review');
  reports.push({ booking_id: 'booking-exact', learner_id: 'google-id', rating: 4, review: 'Exact review' });
  effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state[0][0].rating, 4);
  assert.equal(state[0][0].review, 'Exact review');
  console.log('Actual partner session load: exact learner, exact report, status/reward paths preserved, lookup error distinction: passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
