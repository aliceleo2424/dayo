/* Transport and display only. No booking, payment, role, or session mutations. */
(function(root){
 'use strict';
 var MAX=2097152,urls=new Set(),renders=new WeakMap(),renderEpoch=0;
 var messages={
  invalid_image_type:['JPG, PNG 또는 WebP 사진을 선택해 주세요.','Choose a JPG, PNG or WebP photo.'],
  image_too_large:['사진을 줄이지 못했어요. 2MB 이하 사진을 선택해 주세요.','Could not reduce this photo. Choose a photo up to 2 MB.'],
  invalid_image:['사진을 읽지 못했어요. 다른 JPG, PNG 또는 WebP 사진을 선택해 주세요.','Could not read this photo. Choose another JPG, PNG or WebP photo.'],
  sign_in_required:['로그인 상태를 확인한 뒤 다시 시도해 주세요.','Please sign in again and retry.'],
  image_save_unconfirmed:['저장 결과를 확인하지 못했어요. 새로고침한 뒤 사진을 확인해 주세요.','Could not confirm the save result. Refresh to check your photo.'],
  preparing:['사진을 준비하는 중…','Preparing photo…'],ready:['미리보기를 확인한 뒤 저장해 주세요.','Check the preview, then save your photo.'],
  saving:['사진을 업로드하고 저장하는 중…','Uploading and saving photo…'],saved:['프로필 사진을 저장했어요.','Profile photo saved.'],
  choose:['프로필 사진을 먼저 선택해 주세요.','Choose your profile photo first.'],
  required:['프로필 사진을 추가해 주세요. 기존 예약과 대화 이용은 그대로 유지됩니다.','Please add your profile photo. Existing bookings and conversations remain available.'],
  failed:['사진을 저장하지 못했어요. 기존 사진은 유지됩니다. 다시 시도해 주세요.','Could not save your photo. Your existing photo is unchanged. Please retry.']
 };
 function text(code){var ko=root.document&&root.document.documentElement.lang==='ko';return (messages[code]||messages.failed)[ko?0:1];}
 var resolver=root.DayOProfileImageURL;
 function safe(value){return resolver.safe(value);}
 function hasPhoto(value){return resolver.hasPhoto(value);}
 function resolve(value){return resolver.resolve(value);}
 function release(url){if(urls.has(url)){URL.revokeObjectURL(url);urls.delete(url);}}
 function objectUrl(blob){var url=URL.createObjectURL(blob);urls.add(url);return url;}
 async function prepare(file){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('invalid_image_type');
  if(file.size<=0||file.size>12*1024*1024)throw Error('image_too_large');
  var preview=objectUrl(file),image=new Image();
  try{
   await new Promise(function(resolve,reject){image.onload=resolve;image.onerror=function(){reject(Error('invalid_image'));};image.src=preview;});
   if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)throw Error('invalid_image');
   var factor=Math.min(1,1200/Math.max(image.naturalWidth,image.naturalHeight));
   var canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*factor));canvas.height=Math.max(1,Math.round(image.naturalHeight*factor));
   var blob;
   try{canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);blob=await new Promise(function(resolve){canvas.toBlob(resolve,'image/webp',.82);});}catch(_){blob=null;}
   // Older browsers can fall back to a valid small original. The server still
   // verifies, normalizes EXIF orientation and fully re-encodes every upload.
   if(!blob||!['image/webp','image/png','image/jpeg'].includes(blob.type))blob=file;
   if(blob.size>MAX)throw Error('image_too_large');
   release(preview);preview=objectUrl(blob);
   var base64=await new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(String(reader.result).split(',')[1]);};reader.onerror=reader.onabort=function(){reject(Error('invalid_image'));};reader.readAsDataURL(blob);});
   return {preview:preview,mime:blob.type,base64:base64};
  }catch(error){release(preview);throw error;}
 }
 async function session(){var client=root.supabaseClient;var result=client&&await client.auth.getSession();var current=result&&result.data&&result.data.session;if(!current||!current.access_token)throw Error('sign_in_required');return current;}
 async function upload(prepared,expectedUserId){
  var auth=await session();if(expectedUserId&&auth.user.id!==expectedUserId)throw Error('sign_in_required');
  var response,result;
  try{response=await fetch('/api/profile-image',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.access_token},body:JSON.stringify({mime:prepared.mime,base64:prepared.base64})});result=await response.json();}catch(_){throw Error('image_save_unconfirmed');}
  if(!response.ok||!safe(result.avatar_url))throw Error(result.error||'failed');
  var next=await session();if(next.user.id!==auth.user.id)throw Error('sign_in_required');return result;
 }
 async function paint(element,userId,value){
  if(!element)return false;
  var url=resolve(value);element.dataset.dayoManagedAvatar='true';
  element.style.backgroundImage=url?'url('+JSON.stringify(url)+')':'';
  element.style.backgroundSize='cover';element.style.backgroundPosition='center';element.classList.toggle('has-photo',!!url);
  if(element.classList.contains('tutor-placeholder-avatar'))element.textContent='';
  var icon=element.querySelector('.self-placeholder-icon');if(icon){icon.textContent='';icon.hidden=true;}
  var label=element.querySelector('span');if(label){label.textContent='';label.hidden=true;}return !!url;
 }
 async function room(){
  if(!root.DayORoomAccessReady)return;
  var epoch=renderEpoch;var access=await root.DayORoomAccessReady;if(epoch!==renderEpoch||!access||!access.allowed||access.observer||access.adminTest)return;
  var db=root.supabaseClient;if(!db)return;
  var own=document.querySelector('.pip-avatar')||document.querySelector('.self-placeholder'),other=document.querySelector('.tutor-placeholder-avatar');
  paint(own,access.userId,'');paint(other,'','');
  var ownProfile=await db.from('profiles').select('avatar_url').eq('id',access.userId).maybeSingle();
  if(epoch!==renderEpoch)return;
  if(!ownProfile.error)paint(own,access.userId,ownProfile.data&&ownProfile.data.avatar_url);
  if(access.role==='partner'){
   var brief=await db.rpc('get_partner_booking_brief',{p_booking_id:access.bookingId});
   if(epoch!==renderEpoch)return;
   if(!brief.error)paint(other,access.learnerId,brief.data&&brief.data.learner_avatar_url);
  }else{
   var partners=await db.rpc('list_public_partner_profiles');
   if(epoch!==renderEpoch)return;
   var partner=!partners.error&&(partners.data||[]).find(function(p){return p.id===access.partnerId;});
   if(partner)paint(other,access.partnerId,partner.avatar_url);
  }
 }
 root.DayOProfileImages={prepare:prepare,upload:upload,paint:paint,safe:safe,hasPhoto:hasPhoto,resolve:resolve,text:text,release:release};
 var style=document.createElement('style');style.textContent='.tutor-placeholder-avatar.has-photo,.pip-avatar.has-photo,.self-placeholder.has-photo{font-size:0}#photoModal .modal{min-width:0;box-sizing:border-box}#photoModal button{max-width:100%;white-space:normal;overflow-wrap:anywhere}#photoModal .card-subtitle,#profile-photo-size,#partner-photo-status{overflow-wrap:anywhere}#photoModal [hidden]{display:none!important}';document.head.append(style);
 document.addEventListener('dayo:authchange',function(event){if(!event.detail||event.detail.loggedIn!==false)return;++renderEpoch;urls.forEach(release);document.querySelectorAll('[data-dayo-managed-avatar]').forEach(function(el){renders.delete(el);el.style.backgroundImage='';el.classList.remove('has-photo');delete el.dataset.dayoManagedAvatar;var span=el.querySelector('span');if(span){span.textContent='';span.hidden=true;}});});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){room().catch(function(){});},{once:true});else room().catch(function(){});
})(window);
