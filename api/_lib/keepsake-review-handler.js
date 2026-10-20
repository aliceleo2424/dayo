const S=require('./keepsake-safety.js');
const R=require('./keepsake-manual-review.js');
function createHandler({env=process.env,fetchImpl=fetch,clientFactory=S.participantClient}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Origin, Authorization');
  const origin=String(req.headers?.origin||'');
  const origins=['https://www.dayotalk.com','https://dayotalk.com','https://dayo-sufk.vercel.app'];
  if(env.VERCEL_URL)origins.push('https://'+env.VERCEL_URL);
  if(env.VERCEL_BRANCH_URL)origins.push('https://'+env.VERCEL_BRANCH_URL);
  const send=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  if(origin&&!origins.includes(origin))return send(403,{error:'origin_not_allowed'});
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');}
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
  if(req.method!=='POST')return send(405,{error:'method_not_allowed'});
  const jwt=/^Bearer ([A-Za-z0-9._-]+)$/.exec(String(req.headers?.authorization||''));
  if(!jwt)return send(401,{error:'auth_required'});
  const url=String(env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL||'').trim().replace(/\/rest\/v1\/?$/i,'').replace(/\/+$/,'');
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!env.NEXT_PUBLIC_SUPABASE_ANON_KEY)return send(503,{error:'review_unavailable'});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   let input=req.body;if(typeof input==='string')input=JSON.parse(input);
   if(!input){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048)throw Error('invalid_request');}input=JSON.parse(raw);}
   if(JSON.stringify(input).length>2048)return send(400,{error:'invalid_request'});
   const auth=await fetchImpl(url+'/auth/v1/user',{headers:{apikey:env.NEXT_PUBLIC_SUPABASE_ANON_KEY,Authorization:'Bearer '+jwt[1]},signal:controller.signal});
   if(!auth.ok)return send(401,{error:'auth_required'});
   const user=await auth.json();if(!/^[a-f0-9-]{36}$/.test(user.id||''))return send(401,{error:'auth_required'});
   const db=clientFactory({env,jwt:jwt[1],fetchImpl,signal:controller.signal});
   const result=await R.handle({db,input});return send(200,result);
  }catch(e){const code=['invalid_request','access_denied','image_access_unavailable','image_version_changed','invalid_image_binding','review_unavailable','invalid_image'].includes(e.code)?e.code:'review_unavailable';return send(code==='access_denied'?403:code==='invalid_request'?400:409,{error:code});}
  finally{clearTimeout(timer);}
 };
}
module.exports=createHandler();module.exports.createHandler=createHandler;
