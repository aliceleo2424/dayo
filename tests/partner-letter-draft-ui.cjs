// Partner Letter popup: AI draft -> Partner check/edit -> send gate (owner decision 2026-10-20). JSDOM + mocked API only.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const room=fs.readFileSync('public/room.html','utf8');
const start=room.indexOf('<div id="partner-report-popup"'),end=room.indexOf('<div id="early-exit-modal"');
assert(start>0&&end>start);
const LETTER='Dear Alice,\n\nIt was so lovely to hear about your dinner with a friend and how you sat outside because it was too crowded. Buying your mom mochi to make her happy again was such a sweet idea, and the tanghulu after dinner sounded perfect. Next time I would love to hear which dessert your mom liked the most, and whether you found a new favorite spot to eat outside with your friend.\n\n— Emma';
async function popup(reply){
 const dom=new JSDOM('<!doctype html><body>'+room.slice(start,end)+'</body>',{runScripts:'outside-only',url:'https://dayotalk.com/room'});
 const w=dom.window,calls=[];
 w.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'jwt'}}})}};
 w.fetch=async(url,opts)=>{const body=JSON.parse(opts.body);calls.push(body.action);const r=reply(body.action);return {ok:r.status===200,json:async()=>r.body};};
 w.confirm=()=>true;
 w.eval(fs.readFileSync('public/partner-report-contract.js','utf8'));
 w.eval(fs.readFileSync('public/partner-report.js','utf8'));
 w.DayOPartnerReport.open({bookingId:'ea5289f9-41fe-4b94-9677-bd3b038c87eb'});
 for(let i=0;i<20;i++)await new Promise(r=>setTimeout(r,5));
 return {w,d:w.document,calls};
}
(async()=>{
 const ok=a=>a==='partner_letter_draft'?{status:200,body:{status:'draft_for_review',letter:LETTER,attempts_left:1,facts:[{text:'Mochi for mom',quotes:[{id:'u4',medium:'speech',text:'I bought my mom mochi to make her happy again.'}]}]}}:{status:200,body:{choices:[]}};
 let {w,d,calls}=await popup(ok);
 const area=d.getElementById('popup-partner-comment');
 assert(calls.includes('partner_letter_draft'),'draft requested when the Letter opens');
 assert.equal(area.value,LETTER,'empty Letter box is filled with the draft');
 assert.equal(d.getElementById('pr-draft-check').hidden,false,'check box shown for a draft');
 assert(/nothing in the draft was not said/.test(d.querySelector('.pr-draft-warning').textContent));
 assert(d.getElementById('pr-draft-evidence').textContent.includes('I bought my mom mochi'),'evidence shows what the user said');
 assert.equal(w.DayOPartnerReport.draftChecked(),false,'cannot send the draft before confirming the check');
 assert.equal(d.getElementById('pr-letter-selected').children.length,0,'no duplicate per-line list under a draft');
 area.value=LETTER.replace('sweet idea','kind idea');area.dispatchEvent(new w.Event('input'));
 assert.equal(w.DayOPartnerReport.draftChecked(),false,'editing alone does not replace the check');
 d.getElementById('pr-draft-confirm').checked=true;
 assert.equal(w.DayOPartnerReport.draftChecked(),true);
 assert.equal(w.DayOPartnerReport.payload().partnerComment,area.value,'the edited text is what gets sent');
 assert.equal(d.getElementById('pr-draft-retry').hidden,false,'one rewrite offered');
 assert(!/learner|학습자/i.test(d.getElementById('partner-report-popup').textContent),'no learner wording');
 assert(!/What did they tell you today/.test(area.getAttribute('placeholder')),'placeholder asks for a letter, not notes');
 // Failure: honest message, empty box, sending never blocked by the draft.
 ({w,d}=await popup(a=>a==='partner_letter_draft'?{status:502,body:{error:'draft_unavailable'}}:{status:200,body:{choices:[]}}));
 assert.equal(d.getElementById('popup-partner-comment').value,'');
 assert(/write the letter yourself/.test(d.getElementById('pr-draft-status').textContent));
 assert.equal(d.getElementById('pr-draft-check').hidden,true);
 assert.equal(w.DayOPartnerReport.draftChecked(),true,'a draft failure never blocks sending');
 // Not enough saved conversation.
 ({w,d}=await popup(a=>a==='partner_letter_draft'?{status:200,body:{status:'no_canonical_source',letter:'',facts:[]}}:{status:200,body:{choices:[]}}));
 assert(/isn’t enough saved conversation/.test(d.getElementById('pr-draft-status').textContent));
 assert.equal(w.DayOPartnerReport.draftChecked(),true);
 // A general fallback theme ("Food") is shown but never auto-drawn.
 ({w,d,calls}=await popup(a=>a==='partner_illustration_choices'?{status:200,body:{source_version:'v',choices:[{id:'subject_food',label:'Food'}]}}:a==='partner_letter_draft'?{status:502,body:{}}:{status:200,body:{}}));
 assert(!calls.includes('partner_illustration_generate'),'no automatic picture from a generic theme');
 assert(/couldn’t find words to draw/.test(d.getElementById('pr-keyword-hint').textContent));
 // Room send gate wires the check.
 assert(/draftChecked\(\)\) \{\s*setPartnerReportSubmitStatus\('draft_unchecked'/.test(room));
 console.log('partner-letter-draft-ui: ok');
})().catch(e=>{console.error(e);process.exit(1);});
