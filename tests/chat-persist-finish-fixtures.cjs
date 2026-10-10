/* Presentation-only checks against an existing saved CHAT-PERSIST evidence file. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),recap=require('../public/conversation-recap'),ui=require('../public/user-conversation-report');
const evidence=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),stored=recap.saved({...evidence.reports[0],booking_id:evidence.booking.id});
assert(stored&&stored.chat.messages.length===13);const original=JSON.stringify(stored);
for(const locale of ['ko','en']){
 const dom=new JSDOM(recap.render(stored,locale)),doc=dom.window.document;
 assert.equal(doc.querySelectorAll('.recap-chat-preview>p').length,3);
 const disclosure=doc.querySelector('.recap-chat-disclosure');assert(!disclosure.open);
 assert.deepEqual([...doc.querySelectorAll('.recap-chat-scroll>p')].map(p=>p.lastChild.textContent),stored.chat.messages.map(m=>m.text));
 assert.equal(doc.querySelectorAll('.recap-chat-scroll>p').length,13);
 assert.equal(doc.querySelector('.recap-chat-scroll').getAttribute('tabindex'),'0');
 assert.equal(doc.querySelector('.recap-chat-expand').textContent,locale==='ko'?'전체 메시지 보기':'Show all messages');
 assert.equal(doc.querySelector('.recap-chat-collapse').textContent,locale==='ko'?'접기':'Show fewer');
 disclosure.querySelector('summary').click();assert(disclosure.open);disclosure.querySelector('summary').click();assert(!disclosure.open);
 assert.deepEqual(stored.chat.metrics,{user_message_count:8,user_word_count:33,partner_message_count:5,partner_word_count:21});
 assert.equal(JSON.stringify(stored),original,'render/toggle never changes saved content, quiz or metrics');
 for(const count of [0,1,3]){const value={...stored,chat:{...stored.chat,messages:stored.chat.messages.slice(0,count)}};const small=new JSDOM(recap.render(value,locale));assert.equal(small.window.document.querySelectorAll('.recap-chat-disclosure').length,0);assert.equal(small.window.document.querySelectorAll('.recap-chat-preview>p').length,count);small.window.close();}
 const report={...evidence.reports[0],booking_id:evidence.booking.id,partner_name:'Jen',__dayoPublicNameVerified:true,partner_comment:'Fixture-only saved Letter',feedback:[stored]};
 const detail=new JSDOM(ui.renderDetail(report,locale));assert.equal(detail.window.document.querySelectorAll('.ucr-human').length,1);assert(detail.window.document.body.textContent.includes('Fixture-only saved Letter'));assert(!detail.window.document.querySelector('.recap-chat-scroll').textContent.includes('Fixture-only saved Letter'));detail.window.close();
 const absent=new JSDOM(ui.renderDetail({...report,partner_comment:null},locale));assert(!absent.window.document.body.textContent.includes('Fixture-only saved Letter'));absent.window.close();dom.window.close();
}
const css=fs.readFileSync(root+'/public/conversation-recap.css','utf8');assert.match(css,/max-height:240px;overflow-y:auto/);assert.match(css,/\[open\]\+\.recap-chat-preview\{display:none\}/);
for(const file of ['conversation-recap.js','conversation-recap.css'])assert.equal(fs.readFileSync(root+'/public/'+file,'utf8'),fs.readFileSync(root+'/'+file,'utf8'));
console.log('PASS saved 13-message fixture: default 3, native expand/collapse KO/EN, full order/text/roles, focusable 240px scroller, small/empty chat, unchanged typed/spoken/quiz data, Letter separation and missing Letter, mirrors.');
// The stopped Preview omitted this required server-only configuration. Keep
// failure closed: no report read with anon credentials and no guessed success.
const partnerLetter=require('../api/_lib/partner-letter');
(async()=>{const routes=[],B=evidence.booking.id,P=evidence.booking.partner_user_id;
 const result=await partnerLetter.handle({input:{action:'partner_illustration_status',booking_id:B},user:{id:P},env:{},read:async route=>{routes.push(route);if(route.includes('/bookings?'))return [{...evidence.booking,language:'en'}];if(route.includes('/profiles?'))return [{id:P,role:'partner'}];throw Error('Unexpected report access without server key');}});
 assert.deepEqual(result,{status:503,body:{error:'source_unavailable'}});assert.equal(routes.length,2);
 console.log('PASS missing Preview server key reproduces Letter status 503 before report access; no auth fallback, save, or fabricated success.');
})().catch(error=>{console.error(error);process.exitCode=1;});
