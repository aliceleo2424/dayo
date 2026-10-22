'use strict';
// Partner welcome + partner approval (welcome to the team) email in the DayO card design. No mail is sent.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const mail = require('../api/_lib/transactional-email.js');
assert.equal(fs.readFileSync(path.join(root, 'api/_lib/transactional-email.js'), 'utf8'), fs.readFileSync(path.join(root, 'admin/src/lib/transactional-email.js'), 'utf8'), 'admin mirror identical');
const a = mail.buildPartnerApprovalMessage({ name: 'Ana <b>', email: 'ana@example.com', signupLink: 'https://www.dayotalk.com/signup' });
assert.match(a.subject, /Welcome to the DayO team/); assert.doesNotMatch(a.html + a.text, /passed the DayO Partner Test/); assert.equal(a.reply_to, mail.REPLY_TO);
for (const body of [a.html, a.text]) {
  assert.ok(body.includes('₩6,000 per completed 30-minute session'));
  assert.ok(body.includes('ana@example.com')); assert.ok(body.includes('https://www.dayotalk.com/signup'));
  assert.ok(body.includes('https://www.dayotalk.com/partner#pd-sessions')); assert.match(body, /Weekly Template/); assert.match(body, /Complete Profile/); assert.match(body, /Monthly Calendar/); assert.match(body, /KST/);
}
assert.ok(a.html.includes('Ana &lt;b&gt;') && !a.html.includes('Ana <b>'), 'name escaped');
assert.match(a.html, /images\/logo_header\.png/);
for (const lang of ['en', 'ko']) {
  const w = mail.buildWelcomeMessage('Jen', 'partner', lang);
  assert.match(w.html, /images\/logo_header\.png/); assert.doesNotMatch(w.text, /9,900/);
  assert.match(w.html, lang === 'en' ? /Getting started/ : /시작하기/); assert.match(w.html, /partner#pd-sessions/); assert.match(w.text, /Complete Profile/);
}
const route = fs.readFileSync(path.join(root, 'admin/src/app/api/send-partner-approval/route.ts'), 'utf8');
assert.match(route, /rpc\('dayo_is_admin'\)/, 'admin check'); assert.match(route, /final_status !== 'approved'/); assert.match(route, /idempotencyKey: 'partner-approval:'/);
assert.doesNotMatch(route, /to:\s*(email|body)/, 'recipient comes from the stored application');
console.log('PASS partner emails: approval email facts/links/escaping/logo, partner welcome KO/EN card design, admin-only approved-only idempotent route, admin mirror.');
