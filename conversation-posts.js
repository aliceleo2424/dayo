/* Published CMS adapter. No writes, partner preselection or stored preference updates. */
(function(root){
 'use strict';
 var interests=['drama','movies','youtube','music','travel','food_cafe','exercise','games','fashion_beauty','pets','books_webtoon','work_school'];
 var purposes=['travel','work_school','abroad','casual'];
 var labelsKO=['드라마','영화','유튜브 · 쇼츠','음악','여행','맛집 · 카페','운동','게임','패션 · 뷰티','반려동물','책 · 웹툰','일 · 학교'];
 var labelsEN=['TV series','Movies','YouTube / shorts','Music','Travel','Food / cafés','Exercise','Games','Fashion / beauty','Pets','Books / webtoons','Work / school'];
 function ko(){return !root.DayOI18n||root.DayOI18n.getLang()==='KO';}
 function keys(value,allowed,max){return Array.isArray(value)?value.filter(function(k,i,a){return allowed.indexOf(k)>=0&&a.indexOf(k)===i;}).slice(0,max):[];}
 function image(value){try{var u=new URL(String(value||''));return u.protocol==='https:'?u.href:'';}catch(e){return '';}}
 function prefill(post){return {interests:keys(post&&post.interests,interests,4),purposes:keys(post&&post.purposes,purposes,4)};}
 function detailLink(post){return '/magazine/'+encodeURIComponent(post.slug||post.id);}
 function text(tag,value,className){var e=document.createElement(tag);e.textContent=String(value||'');if(className)e.className=className;return e;}
 async function list(){var db=root.supabaseClient;if(!db)throw new Error('CMS unavailable');var r=await db.rpc('list_published_conversation_posts',{p_limit:4});if(r.error)throw r.error;return r.data||[];}
 async function read(key){var db=root.supabaseClient;if(!db)throw new Error('CMS unavailable');var r=await db.rpc('get_published_conversation_post',{p_key:String(key||'')});if(r.error)throw r.error;return r.data||null;}
 function renderCards(container,posts){
  container.replaceChildren();
  if(!posts.length){container.append(text('p',ko()?'새로운 대화 이야기를 준비하고 있어요.':'New conversation stories are on their way.','post-empty'));return;}
  posts.forEach(function(post){
   var a=document.createElement('a');a.className='cms-magazine-card lounge-card post-card visible';a.href=detailLink(post);
   var src=image(post.cover_image);if(src){var img=document.createElement('img');img.src=src;img.alt='';img.loading='lazy';a.append(img);}
   var b=text('div','','cms-magazine-card__body');b.append(text('h3',post.title),text('p',post.excerpt));
   var author=post.author_display_name||'DayO';b.append(text('p',author+([post.country,post.language&&String(post.language).toUpperCase()].filter(Boolean).length?' · '+[post.country,post.language&&String(post.language).toUpperCase()].filter(Boolean).join(' · '):''),'post-author'));
   var tags=text('div','','post-tags');keys(post.interests,interests,4).slice(0,3).forEach(function(key){tags.append(text('span',(ko()?labelsKO:labelsEN)[interests.indexOf(key)]));});b.append(tags);a.append(b);container.append(a);
  });
 }
 async function mount(container){try{var posts=await list();renderCards(container,posts);var section=container.closest('#magazine');if(section){section.hidden=false;section.removeAttribute('aria-hidden');section.removeAttribute('data-landing-hidden');}}catch(e){container.replaceChildren(text('p',ko()?'이야기를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.':'Stories could not be loaded. Please try again shortly.','post-empty'));}}
 var api={interests:interests,purposes:purposes,prefill:prefill,image:image,detailLink:detailLink,list:list,read:read,renderCards:renderCards,mount:mount};
 root.DayOConversationPosts=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(typeof document!=='undefined')document.addEventListener('dayo:langchange',function(){['cmsMagazineGrid','loungeTrack'].forEach(function(id){var c=document.getElementById(id);if(c)mount(c);});});
})(typeof window!=='undefined'?window:globalThis);
