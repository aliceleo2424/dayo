/* Server-only Cloudflare runtime for authenticated booking Partners. */
const safety=require('./keepsake-safety.js');
async function authorize({input,read,user}){
 const rows=await read('/rest/v1/bookings?'+new URLSearchParams({id:'eq.'+input.booking_id,
  partner_user_id:'eq.'+user.id,select:'id,learner_id,partner_user_id,is_test_session,status',limit:'1'}));
 const b=Array.isArray(rows)&&rows.find(b=>b.id===input.booking_id&&b.partner_user_id===user.id);
 if(!b||!b.learner_id||!['confirmed','completed'].includes(b.status))
  return {status:403,body:{error:'not_booking_partner'}};
 return null;
}
function createPilot({env,fetchImpl=fetch,clock=()=>Date.now()}){
 const accountId=String(env.CLOUDFLARE_ACCOUNT_ID||'').trim();
 if(!/^[a-f0-9]{32}$/.test(accountId)||!env.CLOUDFLARE_API_TOKEN||!env.SUPABASE_SERVICE_ROLE_KEY)return null;
 return {manualReview:true,contracts:async({jwt,signal})=>({...safety.createContracts({
  db:safety.serviceClient({env,fetchImpl,signal}),
  manualReview:true,normalBookings:true,participantDb:safety.participantClient({env,jwt,fetchImpl,signal}),accountId,clock
 }),qualityCheck:require('./partner-illustration-quality.js').createInspector({env,fetchImpl,manualReview:true})})};
}
module.exports={authorize,createPilot};
