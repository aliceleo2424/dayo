// Explicit opt-in actual Gemini test. Only these synthetic strings leave the
// computer. Reads the user-configured key; never prints or writes credentials.
const assert=require('node:assert/strict');
const contract=require('../public/learner-language-recap-contract.js'),provider=require('../api/_lib/learner-language-recap.js');
if(process.argv[2])process.loadEnvFile(process.argv[2]);
const texts=['I am very agree.','I really like this café.','and I maybe the yesterday','yes'];
const log={id:'synthetic-log',participant_role:'learner',transcript:texts.map((text,i)=>({id:'test-'+i,speaker:'learner',text,timestamp:'2026-10-05T05:01:00Z'}))};
(async()=>{
 if(!process.env.GEMINI_API_KEY)throw Error('Configure server key locally; do not put it in test files.');
 const candidates=contract.candidates(log,'en');assert.deepEqual(candidates.map(x=>x.original_text),texts.slice(0,2));
 const model=process.env.GEMINI_MODEL||'gemini-3.6-flash';
 const corrections=await provider.generate({candidates,language:'en',apiKey:process.env.GEMINI_API_KEY,model,signal:AbortSignal.timeout(25000)});
 assert.equal(corrections.length,1);assert.equal(corrections[0].original_text,texts[0]);
 console.log(JSON.stringify({test:'Actual Gemini / synthetic learner speech',model,corrections,natural_sentence_skipped:true,broken_fragment_not_sent:true,short_answer_not_sent:true},null,2));
})().catch(e=>{console.error('Live recap test:',e.message);process.exitCode=1;});
