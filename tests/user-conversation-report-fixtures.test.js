const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const report=require('../public/user-conversation-report.js');
const fixture={id:'report-fixture',booking_id:'11111111-1111-4111-8111-111111111111',partner_name:'Alex',created_at:'2026-10-05T05:00:00Z',language:'en',partner_comment:'It was so nice talking with you today.\nHave a great day!',stamp:'green_tea',keyword:'Seoul Forest cafés',illust_url:'/images/cafe.png',summary:'You talked about cafés in Seoul. You shared your weekend plans.',key_expressions:['I enjoy visiting new places',{expression:'I went to Osaka last year',usage:'Talking about past travel'},'I love exploring new cafés','I enjoy visiting new places','um uh yeah','zxq qwe zxq'],quiz_score:80,feedback:[{original:'I am very agree.',corrected:'I totally agree.',source:'learner_recognized_speech',meaning_preserved:true,correction_needed:true,explanation:'Use “agree” as a verb.'}],__dayoLearnerTranscript:[{speaker:'learner',text:'I am very agree.',timestamp:'2026-10-05T05:01:00Z'},{speaker:'partner',text:'I go to Osaka yesterday'}]};
module.exports={fixture};
if(require.main===module){
 const recap=require('../public/conversation-recap.js'),cp=require('node:child_process'),base='3e3decc';
 const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/\r/g,'');
 const old=f=>cp.execFileSync('git',['-C',path.join(__dirname,'..'),'show',base+':'+f],{encoding:'utf8'}).replace(/\r/g,'');
 for(const f of ['api/ticket-payment.js','api/turn-credentials.js','api/word-help.js','public/partner-report-contract.js','public/partner-reward.js','public/booking-modal.js','public/mypage-dashboard.js','public/supabase-client.js','public/turn-ice.js'])assert.equal(read(f),old(f),f+' protected');
 const payload=s=>s.slice(s.indexOf('payload:function()'));assert.equal(payload(read('public/partner-report.js')),payload(old('public/partner-report.js')),'Partner payload contract unchanged');
 const before=JSON.stringify(fixture),legacy=report.renderDetail(fixture,'ko');assert.equal(JSON.stringify(fixture),before);assert(legacy.includes('파트너 레터'));assert(!/80%|퀴즈 결과|More natural/.test(legacy));assert(legacy.includes('저장된 대화 기록을 확인할 수 없어요'));
 const data=recap.build({bookingId:fixture.booking_id,learnerId:'own',language:'en',learnerLog:{id:'own-source',booking_id:fixture.booking_id,participant_id:'own',participant_role:'learner',transcript:[{id:'u1',speaker:'learner',text:'The crowded café served delicious food.',timestamp:'2026-10-05T05:01:00Z'}]}});
 const current={...fixture,feedback:fixture.feedback.concat([data])},html=report.renderDetail(current,'ko');assert(html.includes('오늘의 대화 리캡'));assert(html.includes('The crowded café served delicious food.'));assert(!/80%|More natural|퀴즈 결과/.test(html));assert(html.indexOf('오늘의 대화 리캡')<html.indexOf('파트너 레터'));
 assert(report.renderArchive(current,0,'ko').includes('30초 리캡'));assert(!report.renderArchive(current,0,'ko').includes('80%'));
 assert(!report.renderDetail({...current,partner_name:'<img>',partner_comment:'<script>alert(1)</script>'},'ko').includes('<script>'));
 assert(!report.renderDetail({...current,illust_url:'/images/logo_header.png'},'ko').includes('<img'));
 const wrong={...fixture,feedback:[{...data,booking_id:'other'}]};assert(!report.renderDetail(wrong,'ko').includes('The crowded café served delicious food.'));
 console.log('User report fixtures passed: recap-first UI, legacy data preserved, no scores/corrections, exact booking provenance, escaping and core contracts unchanged.');
}
