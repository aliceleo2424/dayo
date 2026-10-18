'use strict';
// Guidebook email body: non-ad by default; DayO introduction only with this request's explicit marketing opt-in.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const mail = require('../api/_lib/guidebook-email.js');
const unsub = 'https://www.dayotalk.com/unsubscribe#token=00000000-0000-4000-8000-000000000000';
const plain = mail.build({ type: 'mac', ad: false, unsubscribe: unsub });
assert.doesNotMatch(plain.subject, /광고/); assert.match(plain.subject, /마카롱님/);
for (const part of [plain.html, plain.text]) { assert.doesNotMatch(part, /9,900|첫 대화 예약하기/); assert.match(part, /guidebook\/level-1/); assert.ok(part.includes(unsub)); }
assert.match(plain.html, /PART 2/); assert.match(plain.html, /images\/emma\/mac\.png/); assert.match(plain.html, /마케팅 수신 동의로 사용하지 않습니다/);
const ad = mail.build({ type: 'cup', ad: true, unsubscribe: unsub });
assert.match(ad.subject, /^\(광고\) 컵케이크님/); assert.match(ad.html, /9,900/); assert.match(ad.html, /PART 1/); assert.match(ad.html, /보낸 곳: DayO/); assert.ok(ad.html.includes(unsub)); assert.doesNotMatch(ad.html, /마케팅 수신 동의로 사용하지 않습니다/);
const none = mail.build({ type: '<script>', ad: false, unsubscribe: unsub });
assert.equal(mail.typeOf('<script>'), null); assert.doesNotMatch(none.html, /images\/emma|<script>/); assert.match(none.subject, /가이드북/);
for (const t of Object.keys(mail.TYPES)) for (const dir of ['public/images/emma', 'images/emma']) assert.ok(fs.existsSync(path.join(__dirname, '..', dir, t + '.png')), dir + '/' + t + '.png');
console.log('PASS guidebook email: non-ad default (no price/CTA), ad only with opt-in ((광고) subject, sender, unsubscribe), per-type chapter + image, unknown type ignored, images in public/root.');
