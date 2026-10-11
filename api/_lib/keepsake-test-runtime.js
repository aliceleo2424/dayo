/* Server-only, single-booking TEST runtime. Ordinary illustration controls stay disabled. */
const safety=require('./keepsake-safety.js');
const BOOKING='ea5289f9-41fe-4b94-9677-bd3b038c87eb';
const ACCOUNT='540045b64fed74d90933b380a7aa660c';
async function authorize({input,read,user}){
 if(input.booking_id!==BOOKING)return {status:403,body:{error:'test_booking_not_allowlisted'}};
 const rows=await read('/rest/v1/bookings?'+new URLSearchParams({id:'eq.'+BOOKING,
  partner_user_id:'eq.'+user.id,select:'id,learner_id,partner_user_id,is_test_session,status',limit:'1'}));
 const b=Array.isArray(rows)&&rows.find(b=>b.id===BOOKING&&b.partner_user_id===user.id);
 if(!b||b.is_test_session!==true||!b.learner_id||!['confirmed','completed'].includes(b.status))
  return {status:403,body:{error:'test_booking_required'}};
 return null;
}
function createPilot({env,fetchImpl=fetch,clock=()=>Date.now()}){
 if(env.DAYO_KEEPSAKE_TEST_BOOKING!==BOOKING||env.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT
  ||!env.CLOUDFLARE_API_TOKEN||!env.SUPABASE_SERVICE_ROLE_KEY)return null;
 const verifiedAt=env.DAYO_CLOUDFLARE_FREE_VERIFIED_AT, verified=Date.parse(verifiedAt);
 if(!Number.isFinite(verified)||verified>clock()||clock()-verified>12*60*60*1000)return null;
 return {contracts:async({jwt,signal})=>safety.createContracts({
  db:safety.serviceClient({env,fetchImpl,signal}),
  participantDb:safety.participantClient({env,jwt,fetchImpl,signal}),accountId:ACCOUNT,clock,
  verifyFreePlan:async()=>({accountId:ACCOUNT,plan:'workers_free',source:'workers_dashboard',
   enforcedFreeLimit:true,verifiedAt})
 })};
}
module.exports={BOOKING,ACCOUNT,authorize,createPilot};
