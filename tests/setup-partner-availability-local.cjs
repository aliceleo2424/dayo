'use strict';
// Metadata-only bootstrap for an explicitly disposable loopback PostgreSQL DB.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{Client}=require('pg');
const root=path.resolve(__dirname,'..');
const name=process.env.DAYO_QA_DATABASE;
if(!/^dayo_contract_qa\d+$/.test(name||''))throw new Error('Explicit disposable QA database name required');
const config={host:'127.0.0.1',port:Number(process.env.DAYO_LOCAL_PG_PORT||55483),user:'postgres',password:fs.readFileSync(process.env.DAYO_LOCAL_PG_PASSWORD_FILE,'utf8')};
(async()=>{
 const admin=new Client({...config,database:'postgres'});await admin.connect();
 await admin.query('create database '+name);await admin.end();
 const db=new Client({...config,database:name});await db.connect();
 await db.query(fs.readFileSync(process.env.DAYO_LOCAL_BASELINE_SQL,'utf8'));
 const base=require('./fixtures/profiles-security-baseline.json');
 const actual=(await db.query("select jsonb_agg(jsonb_build_object('name',policyname,'roles',roles,'cmd',cmd,'using',qual,'check',with_check,'mode',permissive) order by policyname) as data from pg_policies where schemaname='public' and tablename='profiles'")).rows[0].data;
 // PostgreSQL minor versions render the legacy varchar ANY array differently.
 // Permit only that renderer change in LOCAL expected metadata, never SQL guards.
 const normalize=s=>typeof s==='string'?s.replace("(ARRAY['admin'::character varying, 'super_admin'::character varying])::text[]","ARRAY[('admin'::character varying)::text, ('super_admin'::character varying)::text]"):s;
 for(const a of actual){
  const b=base.policies.find(p=>p.name===a.name);assert.ok(b,'Unknown baseline policy');
  assert.deepEqual({...a,using:normalize(a.using),check:normalize(a.check)},{...b,using:normalize(b.using),check:normalize(b.check)});
 }
 assert.equal(actual.length,base.policies.length);
 for(const f of base.functions){
  const a=(await db.query('select md5(pg_get_functiondef(oid)) as hash from pg_proc where proname=$1',[f.name])).rows;
  assert.ok(a.some(x=>x.hash===f.hash),'Preserved RPC differs: '+f.name);
 }
 const security=fs.readFileSync(path.join(root,'supabase/migrations/082_profiles_minimum_privileges.sql'),'utf8');
 assert.ok(security.includes(JSON.stringify(base.policies)));
 await db.query(security.replace(JSON.stringify(base.policies),JSON.stringify(actual)));
 for(const file of ['083_partner_language_location_profile.sql','084_partner_monthly_availability.sql'])await db.query(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
 await db.end();console.log('PASS fresh metadata baseline → 082 Security → 083 Profile → 084 Monthly; no production connection.');
})().catch(e=>{console.error(e.message);process.exit(1)});
