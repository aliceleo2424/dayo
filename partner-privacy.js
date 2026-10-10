/* Partner-only public names; structured first-name initialization is server-owned. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DayOPartnerPrivacy=api;})(typeof window==='undefined'?globalThis:window,function(){
'use strict';
var codePattern=/^DY-[A-HJ-NP-Z2-9]{8}$/;
function ko(){return typeof document!=='undefined'&&document.documentElement.lang==='ko';}
function copy(en,kr){return ko()?kr:en;}
function validName(value){var n=String(value||'');return n===n.trim()&&n.length>=1&&n.length<=50&&/^[\p{L}][\p{L}'’-]*( [\p{L}]\.?)?$/u.test(n);}
function publicName(row){var n=String(row&&row.nickname||'').trim();return row&&row.public_name_ready===true&&validName(n)?n:'DayO Partner';}
async function rpc(client,name,args){var result=await client.rpc(name,args);if(result.error)throw Error(copy('We could not save or verify this section. Please try again.','이 항목을 저장하거나 확인하지 못했어요. 다시 시도해 주세요.'));return result.data;}
async function identity(client){var r=await client.auth.getUser();if(r.error||!r.data||!r.data.user)throw Error(copy('Please sign in to continue.','로그인 후 다시 시도해 주세요.'));return r.data.user.id;}
function mountName(client,input){
 var host=document.getElementById('partner-public-name-policy');if(!host||!input)return;
 var run=(host._run||0)+1;host._run=run;host._state=null;host._user=null;host._client=client;
 host.replaceChildren();var guide=document.createElement('p'),status=document.createElement('p'),retry=document.createElement('button');
 guide.id='partner-public-name-guidance';input.setAttribute('aria-describedby',guide.id);status.setAttribute('role','status');retry.type='button';retry.hidden=true;host.append(guide,status,retry);
 function message(en,kr){status.dataset.en=en;status.dataset.ko=kr;status.textContent=copy(en,kr);}
 function paint(){if(status.dataset.en)status.textContent=copy(status.dataset.en,status.dataset.ko);guide.textContent=copy('Use your first name, optionally followed by your last initial (Alice or Alice L).','이름 또는 이름과 성의 이니셜을 사용해 주세요 (Alice 또는 Alice L).');retry.textContent=copy('Retry','다시 시도');}
 paint();host._paint=paint;
 async function load(){input.disabled=true;message('Loading your public name…','공개 이름을 불러오는 중…');retry.hidden=true;
  try{var user=await identity(client),state=await rpc(client,'get_my_partner_privacy');if(host._run!==run)return;if(await identity(client)!==user)return;host._user=user;host._state=state;
   if(state.confirmed_at&&validName(state.public_name)){input.value=state.public_name;message('This name is shown to customers.','고객에게 표시되는 이름이에요.');}
   else {input.value='';message('Your existing name needs review. You can save a first-name format here; customers see “DayO Partner” until then.','기존 이름 확인이 필요해요. 여기에서 이름 형식으로 저장할 수 있으며, 그전에는 고객에게 “DayO Partner”로 표시돼요.');}
   input.disabled=false;input.dispatchEvent(new Event('input'));input.dispatchEvent(new Event('input'));
  }catch(_){if(host._run!==run)return;message('Could not load your public name. Please retry.','공개 이름을 불러오지 못했어요. 다시 시도해 주세요.');retry.hidden=false;}}
 retry.onclick=load;load();
}
async function saveName(client,name){
 var host=document.getElementById('partner-public-name-policy'),n=String(name||'').trim(),user=await identity(client);
 if(!host||host._client!==client||host._user!==user||!host._state)throw Error(copy('Please load your public name first.','공개 이름을 먼저 불러와 주세요.'));
 if(!validName(n))throw Error(copy('Use a first name or first name with a last initial (Alice or Alice L).','이름 또는 이름과 성의 이니셜을 입력해 주세요 (Alice 또는 Alice L).'));
 if(host._state.confirmed_at&&host._state.public_name===n)return;
 var run=host._run,state=await rpc(client,'save_my_partner_public_name',{p_public_name:n});
 if(host._run!==run||await identity(client)!==user)throw Error(copy('Your account changed. Please reload.','계정이 변경됐어요. 새로고침해 주세요.'));
 host._state=state;var status=host.querySelector('[role=status]');status.dataset.en='Public name saved. If the introduction fails, retry that section.';status.dataset.ko='공개 이름을 저장했어요. 소개 저장이 실패하면 해당 항목을 다시 시도해 주세요.';host._paint();
}
function mountReferral(host,client){
 var run=0;function reset(){run++;host.replaceChildren();var btn=document.createElement('button'),status=document.createElement('p');btn.type='button';btn.textContent=copy('Show my referral code','내 추천코드 보기');status.setAttribute('role','status');host.append(btn,status);btn.onclick=async function(){var request=++run;btn.disabled=true;try{var user=await identity(client),state=await rpc(client,'ensure_my_partner_referral_code');if(request!==run||await identity(client)!==user)return;if(!codePattern.test(state.referral_code))throw Error('invalid');var code=document.createElement('strong'),link=document.createElement('a'),cp=document.createElement('button');code.textContent=state.referral_code;link.href='https://www.dayotalk.com/partner-apply?ref='+encodeURIComponent(state.referral_code);link.textContent=link.href;cp.type='button';cp.textContent=copy('Copy link','링크 복사');cp.onclick=async function(){try{await navigator.clipboard.writeText(link.href);status.textContent=copy('Link copied','링크를 복사했어요');}catch(_){status.textContent=copy('Please copy the link above.','위 링크를 직접 복사해 주세요.');}};var share=document.createElement('button');share.type='button';share.textContent=copy('Share','공유');share.onclick=async function(){if(navigator.share&&window.matchMedia('(pointer: coarse)').matches){try{await navigator.share({title:'DayO',url:link.href});return;}catch(e){if(e&&e.name==='AbortError')return;}}cp.click();};host.replaceChildren(code,link,cp,share,status);}catch(_){if(request!==run)return;status.textContent=copy('Could not load your code. Please retry.','추천코드를 불러오지 못했어요. 다시 시도해 주세요.');btn.disabled=false;}};}
 reset();document.addEventListener('dayo:authchange',reset);document.addEventListener('dayo:langchange',reset);
}
async function validateReferral(client,value){var code=String(value||'').trim().toUpperCase();if(!code)return '';if(!codePattern.test(code))throw Error(copy('Enter a valid DY- referral code, or leave this field empty.','올바른 DY- 추천코드를 입력하거나 비워 주세요.'));var valid=await rpc(client,'validate_partner_referral_code',{p_code:code});if(valid!==true)throw Error(copy('This referral code is not valid.','유효한 추천코드가 아니에요.'));return code;}
if(typeof document!=='undefined'){document.addEventListener('dayo:langchange',function(){var h=document.getElementById('partner-public-name-policy');if(h&&h._paint)h._paint();});document.addEventListener('dayo:authchange',function(){var h=document.getElementById('partner-public-name-policy');if(h&&h._client){mountName(h._client,document.getElementById('nickname'));}});}
return {codePattern:codePattern,publicName:publicName,mountName:mountName,saveName:saveName,validName:validName,mountReferral:mountReferral,validateReferral:validateReferral};
});
