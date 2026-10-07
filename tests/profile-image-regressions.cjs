/* Current-main protection checks + existing SQL fixtures. Offline only. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n');
const head=f=>cp.execFileSync('git',['show','99edf334391f0a747e47f08ab3938675c464265e:'+f],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
for(const file of ['public/availability-slots.js','public/availability-calendar.js','public/partner-monthly-availability.js','public/room-live.js','public/session-lifecycle.js','public/learner-expressions.js','public/memory-game.js','public/supabase-client.js','public/conversation-recap.js','public/user-conversation-report.js','public/profile-store.js','public/i18n.js','supabase/migrations/095_alpha_partner_language_eligibility.sql','supabase/migrations/098_partner_profile_self_edit_interests.sql'])assert.equal(read(file),head(file),file+' unchanged');
function functions(source){const tree=ts.createSourceFile('booking.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),map=new Map();function walk(node){if(ts.isFunctionDeclaration(node)&&node.name)map.set(node.name.text,node.getText(tree));ts.forEachChild(node,walk);}walk(tree);return map;}
const before=functions(head('public/booking-modal.js')),after=functions(read('public/booking-modal.js'));
for(const [name,body] of before)if(!['init','renderPartnerCards'].includes(name))assert.equal(after.get(name),body,'Booking '+name+' unchanged');
assert.equal(read('public/room.html').replace('  <script src="profile-image-resolver.js"></script>\n  <script src="profile-images.js"></script>\n',''),head('public/room.html'),'Room HTML/logic unchanged except image includes');
for(const file of ['booking-modal.js','room.html','mypage.html','partner.html','partner-dashboard.js','partner-profile-completion.js','profile-images.js','profile-image-editor.js','profile-image-resolver.js'])assert.equal(read(file),read('public/'+file),'Mirror '+file);
console.log('PASS current-main guards: all booking functions except image rendering/bootstrap unchanged; STT, room lifecycle, report, quiz, availability, locale, 095 and 098 unchanged.');
// These fixtures contain old full-file guards. Current-main guards above replace
// those checks; keep their real SQL, authorization, snapshot and collision cases.
function runFixture(file,transform){const runner=`const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');const file=path.resolve(${JSON.stringify(file)}),mod=new Module(file);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));let source=fs.readFileSync(file,'utf8');source=(${transform.toString()})(source);mod._compile(source,file);`;return cp.execFileSync(process.execPath,['-e',runner],{cwd:root,encoding:'utf8'});}
console.log(runFixture('tests/partner-profile-self-edit.cjs',s=>s.replace("['public/availability-slots.js','public/booking-modal.js','supabase/migrations/095_alpha_partner_language_eligibility.sql']","['public/availability-slots.js','supabase/migrations/095_alpha_partner_language_eligibility.sql']")).trim());
console.log('PASS reused 098 + Alpha SQL fixtures, User discovery remains role=partner only, Korean-help snapshot/no-filter unchanged.');
// Negative privacy check against the actual current public/matching projection.
(async()=>{const {bootstrap,actor,uid,other}=require('./conversation-matching-fixtures.cjs');const {db}=await bootstrap();try{
 await db.exec(read('supabase/migrations/095_alpha_partner_language_eligibility.sql'));
 await db.query('update profiles set avatar_url=$1 where id in ($2,$3)',['https://example.test/user-discovery-forbidden.webp',uid,other]);
 await actor(db,uid);
 for(const query of ['select list_public_partner_profiles() p',"select list_matching_partner_profiles('en','required') p"]){const rows=(await db.query(query)).rows;assert(rows.every(r=>r.p.id!==uid&&r.p.id!==other));assert(!JSON.stringify(rows).includes('user-discovery-forbidden'));}
 console.log('PASS N: real public/matching RPCs exclude User rows and User image URLs.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
