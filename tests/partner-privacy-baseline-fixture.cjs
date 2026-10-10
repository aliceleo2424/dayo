'use strict';
const fs=require('fs');
// Captured schema/RPC/RLS baseline and synthetic history only. No historical privacy remediation.
async function prepare({query,root,id}){
 const columns=JSON.parse(fs.readFileSync(root+'/tests/fixtures/partner-privacy-historical-columns.json','utf8'));
 for(const table of ['bookings','session_reports','session_logs'])await query('create table '+table+'('+columns.filter(c=>c.table===table).map(c=>c.name+' '+c.type).join(',')+');alter table '+table+' enable row level security;grant select on '+table+' to authenticated;grant all on '+table+' to service_role;');
 await query("alter table profiles alter column role type varchar;drop policy own_profile on profiles;");
 const definitions=fs.readFileSync(root+'/tests/fixtures/partner-privacy-historical-live-rpcs.sql','utf8');
 await query("do $baseline$ begin execute convert_from(decode('"+Buffer.from(definitions).toString('hex')+"','hex'),'UTF8');end $baseline$;");
 const policies=JSON.parse(fs.readFileSync(root+'/tests/fixtures/partner-privacy-historical-policies.json','utf8'));
 for(const p of policies)await query('create policy '+p.policyname+' on '+p.tablename+' as '+p.permissive+' for '+p.cmd+' to '+p.roles.join(',')+(p.qual?' using ('+p.qual+')':'')+(p.with_check?' with check ('+p.with_check+')':'')+';');
 await query(`grant insert(learner_id,partner_id,partner_user_id,partner_name,language,conversation_brief,scheduled_at,slot_id,status) on bookings to authenticated;grant update(rating) on bookings to authenticated;
 revoke all on function dayo_is_admin(),get_partner_booking_brief(uuid),get_partner_learner_spoken_sentence(uuid),list_public_partner_profiles() from public,anon;grant execute on function dayo_is_admin(),get_partner_booking_brief(uuid),get_partner_learner_spoken_sentence(uuid),list_public_partner_profiles() to authenticated;
 insert into profiles(id,user_id,nickname,full_name,role) values ('${id(5)}','${id(5)}','Admin','Internal Admin','admin'),('${id(6)}','${id(6)}','Outsider','Outsider Legal','user');
 insert into bookings(id,learner_id,partner_id,partner_user_id,partner_name,status,scheduled_at,language,is_test_session,conversation_brief,matching_snapshot,ticket_deducted,partner_rewarded,ticket_refunded)
 values('${id(10)}','${id(4)}','${id(1)}','${id(1)}','Legal One','completed','2026-10-08T00:00Z','en',false,
 '{"nested":[{"partner_name":"Legal One","full_name":"Legal One","story":"We met Legal One at a cafe."}]}',
 '{"deep":{"partner":{"legal_name":"Legal One","partnerName":"Legal One"}},"array":["Legal One",{"Legal One":"hello Legal One"}]}',true,true,false),
 ('${id(11)}','${id(6)}','${id(2)}','${id(2)}','Legal Two','confirmed',now(),'en',false,null,null,false,false,false);
 insert into session_reports(id,booking_id,learner_id,partner_user_id,partner_name,summary,spoken_sentence,partner_comment,keyword,feedback,key_expressions,word_help,created_at)
 values('${id(20)}','${id(10)}','${id(4)}','${id(1)}','Legal One','Cafe with Legal One','I met Legal One at a cafe.','Hello from Legal One. I enjoyed your cafe story.','cafe',
 '[{"kind":"conversation_recap","booking_id":"${id(10)}","metrics":{"user_word_count":8},"source":{"learner_log_id":"${id(30)}"},"deep":{"fullName":"Legal One","partner_name":"Legal One"}}]',
 '[{"text":"I met Legal One."}]','[{"word":"cafe","example":"Legal One likes cafes"}]',now()),
 ('${id(21)}',null,'${id(4)}',null,'Unattributed Legal Alias','Legacy conversation',null,'An old letter',null,'[]','[]','[]',now());
 insert into session_logs(id,user_id,booking_id,participant_id,participant_role,transcript,feedback) values
 ('${id(30)}','${id(4)}','${id(10)}','${id(4)}','learner','[{"id":"u1","text":"I spoke to Legal One"}]','{"partner_name":"Legal One"}');
 -- Match Supabase default ACL behavior so new tables cannot accidentally inherit client writes.
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 `);
}
module.exports={prepare};
