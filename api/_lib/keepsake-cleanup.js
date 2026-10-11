/* Private-image outbox executor. Reuses existing server retry authentication only.
 * No notification dispatch, generation or customer data returned. */
const {timingSafeEqual}=require('node:crypto');
const S=require('./keepsake-safety');
function authorized(header,secret){
 const m=/^Bearer\s+([^\s]+)$/i.exec(String(header||''));
 if(!m||typeof secret!=='string'||secret.length<32)return false;
 const a=Buffer.from(m[1]),b=Buffer.from(secret);return a.length===b.length&&timingSafeEqual(a,b);
}
function createHandler({env=process.env,fetchImpl=fetch,service}={}){
 return async(req,res)=>{
  const reply=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.end(JSON.stringify(data));};
  if(req.method!=='POST')return reply(405,{error:'method_not_allowed'});
  if(!authorized(req.headers?.authorization,env.BOOKING_NOTIFICATION_RETRY_SECRET))return reply(401,{error:'authentication_required'});
  if(!req.body||req.body.action!=='keepsake_cleanup'||Object.keys(req.body).length!==1)return reply(400,{error:'invalid_request'});
  const deadline=AbortSignal.timeout(5000);
  try{const db=service||S.serviceClient({env,fetchImpl,signal:deadline});
   const result=await S.cleanup(db,{limit:5});return reply(200,{ok:true,...result});
  }catch(_){return reply(503,{error:'cleanup_unavailable'});}
 };
}
module.exports={createHandler,authorized};
