/* Explicit separate production step; NEVER run during the local implementation.
 * Uses the existing server env. No object/table owner changes or catalog SQL.
 * Dashboard Storage > Files > New bucket is the preferred setup path.
 * Public-read buckets have NO client allow policy. The live allow-policy baseline only
 * covers public-assets/application-videos; 097 fails closed if that baseline changes.
 * No restrictive image fence or Storage-owner permission is required. API writes only.
 */
const {createClient}=require('@supabase/supabase-js');
async function setup(){
 if(!process.argv.includes('--approved-production-setup'))throw Error('Production bucket setup requires separate explicit authorization.');
 const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error('Existing server configuration required.');
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const inventory=await db.storage.listBuckets();if(inventory.error)throw Error('Cannot verify buckets.');
 for(const id of ['partner-profile-images','user-profile-images']){
  const bucket=inventory.data.find(x=>x.id===id);
  if(bucket){if(!bucket.public||Number(bucket.file_size_limit)!==2097152||JSON.stringify(bucket.allowed_mime_types)!==JSON.stringify(['image/webp']))throw Error('Existing bucket contract mismatch; no changes made.');continue;}
  const created=await db.storage.createBucket(id,{public:true,fileSizeLimit:2097152,allowedMimeTypes:['image/webp']});
  if(created.error)throw Error('Bucket setup failed; inspect before retry.');
 }
 console.log('Public-read profile image buckets ready. Re-audit all live Storage policy modes and run the read-only 097 preflight before DB application/deployment.');
}
if(require.main===module)setup().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={setup};
