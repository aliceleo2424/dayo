// Token stays in the URL fragment and is sent only in the POST body.
module.exports = async function (req, res, { getSupabase }) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  const reply=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body));};
  if (req.method !== 'POST') {res.setHeader('Allow','POST');return reply(405,{ok:false});}
  let body=req.body;
  if (typeof body==='string') {try{body=JSON.parse(body);}catch{return reply(400,{ok:false});}}
  const token=body && body.token;
  if (typeof token!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) return reply(400,{ok:false});
  try {
    const client=getSupabase();
    if(!client) return reply(503,{ok:false});
    const result=await client.rpc('unsubscribe_guidebook_marketing',{p_token:token}).abortSignal(AbortSignal.timeout(5000));
    if(result.error){console.warn('guidebook-unsubscribe-rpc', /^[A-Z0-9_-]{1,24}$/.test(result.error.code || '') ? result.error.code : 'unavailable');return reply(503,{ok:false});}
    // Same success for used/deleted/unknown tokens: no lead existence disclosure.
    return reply(200,{ok:true});
  } catch {return reply(503,{ok:false});}
};
