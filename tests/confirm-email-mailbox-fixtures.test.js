const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const mode = fs.readFileSync(path.join(root, 'public/mode-switch.js'), 'utf8');
const mirror = fs.readFileSync(path.join(root, 'mode-switch.js'), 'utf8');
assert.equal(mode, mirror, 'root/public mode-switch mirror');

function extractFunction(name) {
  const match = mode.match(new RegExp('  function ' + name + '\\([^]*?\\n  \\}'));
  assert.ok(match, name + ' is present');
  return match[0].trim();
}

const mailboxProviderForEmail = vm.runInNewContext('(' + extractFunction('mailboxProviderForEmail') + ')');
for (const [email, expected] of [
  ['alice@gmail.com', 'gmail'],
  ['alice@naver.com', 'naver'],
  ['alice@daum.net', 'daum'],
  ['alice@hanmail.net', 'daum'],
  ['alice@outlook.com', 'outlook'],
  ['alice@hotmail.com', 'outlook'],
  ['alice@live.com', 'outlook'],
  ['alice@example.org', ''],
]) {
  assert.equal(mailboxProviderForEmail(email), expected, email + ' mailbox mapping');
}

const names = ['gmail', 'naver', 'daum', 'outlook'];
const links = new Map(names.map((name) => [name, {
  name,
  featured: false,
  classList: { toggle(_className, value) { this.owner.featured = value; } },
}]));
for (const link of links.values()) link.classList.owner = link;
const grid = {
  children: [...links.values()],
  querySelector(selector) {
    const key = selector.match(/data-ms-mailbox="([^"]+)"/)[1];
    return links.get(key);
  },
  appendChild(link) {
    this.children = this.children.filter((item) => item !== link);
    this.children.push(link);
  },
  insertBefore(link, first) {
    this.children = this.children.filter((item) => item !== link);
    this.children.splice(this.children.indexOf(first), 0, link);
  },
  get firstChild() { return this.children[0]; },
};
const overlay = { querySelector() { return grid; } };
const prioritizeMailbox = vm.runInNewContext(
  '(' + extractFunction('prioritizeMailbox') + ')',
  { overlay, mailboxProviderForEmail }
);
for (const [email, featured] of [
  ['a@gmail.com', 'gmail'], ['a@naver.com', 'naver'],
  ['a@daum.net', 'daum'], ['a@hanmail.net', 'daum'],
  ['a@outlook.com', 'outlook'], ['a@hotmail.com', 'outlook'],
  ['a@live.com', 'outlook'], ['a@unknown.org', ''],
]) {
  prioritizeMailbox(email);
  assert.equal(grid.children[0].name, featured || 'gmail', email + ' first mailbox');
  assert.deepEqual([...links.values()].filter((link) => link.featured).map((link) => link.name),
    featured ? [featured] : [], email + ' featured mailbox');
}
assert.deepEqual(grid.children.map((link) => link.name), names,
  'unknown domain restores equal default order');

for (const [name, url] of [
  ['gmail', 'https://mail.google.com/'],
  ['naver', 'https://mail.naver.com/'],
  ['daum', 'https://mail.daum.net/'],
  ['outlook', 'https://outlook.live.com/mail/'],
]) {
  assert.ok(mode.includes('data-ms-mailbox="' + name + '" href="' + url + '" target="_blank" rel="noopener noreferrer"'),
    name + ' opens the expected mailbox in a safe new tab');
}
assert.match(mode, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'mobile-friendly 2×2 mailbox grid');
assert.match(mode, /showSignupConfirmation\(cleanedEmail\)/, 'signup email is used only to prioritize display');
assert.match(mode, /later: '나중에 확인할게요'/, 'pending modal uses the new secondary label');
assert.doesNotMatch(mode, /href="https:\/\/mail\.google\.com\/\?[^" ]*email=/,
  'the signup email is never embedded in mailbox URLs');
console.log('Confirm Email mailbox mapping and modal fixtures passed.');
