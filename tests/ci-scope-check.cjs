'use strict';
// PR scope guard. Owner must confirm the declared allowlist and sensitive labels.
const fs=require('node:fs'), child=require('node:child_process'), assert=require('node:assert/strict');
if(process.env.GITHUB_EVENT_NAME!=='pull_request'){
 console.log('PASS: PR scope guard not applicable on push; branch protection needed to block bypasses.');process.exit(0);
}
assert.ok(process.env.GITHUB_EVENT_PATH,'GITHUB_EVENT_PATH required');
const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')),pr=event.pull_request;
assert.ok(pr&&/^[0-9a-f]{40}$/.test(pr.base.sha),'Exact base SHA required');
const match=String(pr.body||'').match(/<!--\s*DAYO_SCOPE_START\s*-->([\s\S]*?)<!--\s*DAYO_SCOPE_END\s*-->/i);
assert.ok(match,'PR must declare exact file paths between DAYO_SCOPE_START and DAYO_SCOPE_END; no wildcards.');
const declared=match[1].split(/\r?\n/).map(s=>s.trim().replace(/^-\s*/,'')).filter(Boolean);
assert.ok(declared.length>0&&declared.length<100,'At least 1 and fewer than 100 paths required');
for(const p of declared)assert.ok(!/[*?{}\[\]\x00-\x1f]/.test(p)&&!p.startsWith('/')&&!p.split('/').includes('..'),'Invalid allowlist path: '+p);
assert.equal(new Set(declared).size,declared.length,'Duplicate path declared');
const diff=child.execFileSync('git',['diff','--name-only','--diff-filter=ACMRD',pr.base.sha+'...HEAD'],{encoding:'utf8'}).split(/\r?\n/).filter(Boolean);
assert.ok(diff.length,'PR has no changes');
assert.deepEqual(diff.filter(p=>!declared.includes(p)),[],'Out-of-scope file changes detected');
assert.deepEqual(declared.filter(p=>!diff.includes(p)),[],'Declared paths not changed');
assert.ok(!diff.some(p=>/(^|\/)\.env(?:\.|$)/.test(p)),'No environment/secrets file may enter Git');
const sensitive=diff.filter(p=>/^(supabase\/migrations\/|api\/|vercel\.json$|\.github\/workflows\/.*(?:release|deploy|production))/i.test(p));
if(sensitive.length){
 const labels=(pr.labels||[]).map(x=>x.name);
 assert.ok(labels.includes('dayo-owner-approved-sensitive'),'Sensitive changes require owner-reviewed "dayo-owner-approved-sensitive" label: '+sensitive.join(', '));
}
console.log('PASS: exact PR change scope verified ('+diff.length+' changed paths).');
