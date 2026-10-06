/* Owner-only persistent conversation profile. Verified capability/completion stay separate. */
(function (root) {
  'use strict';
  var catalog = {
    comfortable_purposes: [
      ['travel','여행/일상','Travel / daily life'],
      ['work_school','일·학교 생활','Work / school life'],
      ['abroad','취업/유학 준비','Career / study abroad preparation'],
      ['casual','자유 수다','Casual conversation']
    ],
    interests: [
      ['drama','드라마','TV series'],['movies','영화','Movies'],
      ['youtube','유튜브/쇼츠','YouTube / shorts'],['music','음악','Music'],
      ['travel','여행','Travel'],['food_cafe','맛집/카페','Food / cafés'],
      ['exercise','운동','Exercise'],['games','게임','Games'],
      ['fashion_beauty','패션/뷰티','Fashion / beauty'],['pets','반려동물','Pets'],
      ['books_webtoon','책/웹툰','Books / webtoons'],['work_school','일/학교','Work / school']
    ],
    conversation_styles: [
      ['slow','말을 천천히 들어주고 리액션 잘해주는 파트너','Patient listening with warm reactions'],
      ['fast','자연스럽고 빠른 실전 티키타카','Natural, fast back-and-forth conversation'],
      ['correct','교정과 피드백을 꼼꼼하게 해주는 파트너','Detailed corrections and feedback'],
      ['encourage','칭찬과 응원을 많이 해주는 파트너','Plenty of praise and encouragement']
    ]
  };
  Object.keys(catalog).forEach(function (key) { catalog[key].forEach(Object.freeze);Object.freeze(catalog[key]); });Object.freeze(catalog);
  function empty() { return {schema_version:1,comfortable_purposes:[],interests:[],conversation_styles:[]}; }
  function validate(value) {
    if (!value || value.schema_version !== 1) throw new Error('Unsupported conversation profile version.');
    if (Object.keys(value).some(function (key) {return !['schema_version','comfortable_purposes','interests','conversation_styles'].includes(key);})) throw new Error('Unexpected conversation profile field.');
    var result=empty();
    Object.keys(catalog).forEach(function (key) {
      var values=value[key],allowed=catalog[key].map(function (item) {return item[0];});
      if(!Array.isArray(values)||values.some(function (id) {return typeof id!=='string'||!allowed.includes(id);})||new Set(values).size!==values.length||values.length>(key==='interests'?4:allowed.length)) throw new Error('Invalid '+key+' selections.');
      result[key]=allowed.filter(function (id) {return values.includes(id);});
    });return result;
  }
  var contract=Object.freeze({catalog:catalog,empty:empty,validate:validate});
  if(typeof module==='object'&&module.exports)module.exports=contract;
  if(!root||!root.document)return;
  root.DayOPartnerConversationProfile=contract;

  // The host is a two-column profile grid; this independent section spans both columns.
  if (!document.getElementById('dayo-conversation-profile-style')) {
    var style=document.createElement('style');style.id='dayo-conversation-profile-style';
    style.textContent=[
      '.partner-conversation-profile{grid-column:1/-1;min-width:0;width:100%;box-sizing:border-box;text-align:left}',
      '.partner-conversation-profile details{min-width:0}',
      '.partner-conversation-profile summary{cursor:pointer;font-weight:700}',
      '.partner-conversation-profile .pcv-hint,.partner-conversation-profile .pcv-status{font-size:.85rem;line-height:1.5;overflow-wrap:anywhere}',
      '.partner-conversation-profile fieldset{min-width:0;margin:.9rem 0;padding:0;border:0}',
      '.partner-conversation-profile legend{font-size:.85rem;font-weight:600;margin-bottom:.4rem}',
      '.partner-conversation-profile .pcv-chips{display:flex;flex-wrap:wrap;gap:.4rem}',
      '.partner-conversation-profile .pcv-chip{display:flex;align-items:center;gap:.4rem;width:auto;max-width:100%;padding:.5rem .65rem;border:1px solid #e3dfd5;border-radius:12px;box-sizing:border-box;cursor:pointer}',
      '.partner-conversation-profile .pcv-chip input{flex:0 0 auto;width:auto;margin:0;accent-color:#5F7D63}',
      '.partner-conversation-profile .pcv-chip span{min-width:0;overflow-wrap:anywhere}',
      '.partner-conversation-profile .pcv-chip:has(input:checked){border-color:#5F7D63;background:#F8F0E3}',
      '.partner-conversation-profile .pcv-chip:has(input:disabled){opacity:.55;cursor:default}',
      '.partner-conversation-profile .pcv-styles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}',
      '.partner-conversation-profile .pcv-actions{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.6rem}',
      '.partner-conversation-profile .pcv-save{max-width:100%;padding:.6rem .85rem;border:0;border-radius:12px;background:#5F7D63;color:white;font-weight:600;cursor:pointer}',
      '.partner-conversation-profile .pcv-save:disabled{opacity:.5;cursor:default}',
      '.partner-conversation-profile input:focus-visible,.partner-conversation-profile button:focus-visible,.partner-conversation-profile summary:focus-visible{outline:2px solid #5F7D63;outline-offset:3px}',
      '@media(max-width:480px){.partner-conversation-profile .pcv-styles{grid-template-columns:1fr}}'
    ].join('');document.head.append(style);
  }

  var section,activeId=null,activeProfile=null,readDraft=null;
  function clear(){if(section)section.remove();section=null;activeId=activeProfile=null;readDraft=null;}
  async function mount(user,profile,draft,keepOpen){
    if(!user||!profile||profile.role!=='partner'){clear();return;}
    if(activeId===user.id&&section)return;
    clear();var host=document.querySelector('#partner-dashboard-section .profile-card');if(!host)return;
    activeId=user.id;activeProfile=profile;
    var currentUser=user.id,loading=document.createElement('section');loading.className='partner-conversation-profile';
    section=loading;host.append(loading);loading.textContent=document.documentElement.lang==='ko'?'대화 프로필을 불러오는 중…':'Loading conversation profile…';
    var saved=empty();
    try {
      var client=root.supabaseClient;if(!client)throw new Error('Unavailable');
      var auth=await client.auth.getSession(),owner=auth.data&&auth.data.session&&auth.data.session.user;
      if(!owner||owner.id!==currentUser)throw new Error('Session changed');
      var result=await client.from('partner_profile_details').select('conversation_preferences').eq('partner_id',currentUser).maybeSingle();
      if(result.error||!result.data)throw new Error('Unavailable');
      if(result.data.conversation_preferences)saved=validate(result.data.conversation_preferences);
    } catch(_) {
      if(activeId!==currentUser||section!==loading)return;
      loading.textContent=document.documentElement.lang==='ko'?'대화 프로필을 확인하지 못했어요. 파트너 프로필 완성 여부를 확인한 뒤 다시 시도해 주세요.':'Could not load your conversation profile. Complete Partner Profile and retry.';
      var retry=document.createElement('button');retry.type='button';retry.className='pcv-save';retry.textContent=document.documentElement.lang==='ko'?'다시 시도':'Retry';
      retry.addEventListener('click',function(){clear();mount(user,profile,draft,keepOpen);});loading.append(retry);return;
    }
    if(activeId!==currentUser||section!==loading)return;
    loading.remove();
    var original=JSON.stringify(saved),ko=document.documentElement.lang==='ko',inputs=[];
    if(draft)saved=validate(draft);
    function text(koText,enText){return ko?koText:enText;}
    function el(tag,copy,className){var n=document.createElement(tag);if(copy)n.textContent=copy;if(className)n.className=className;return n;}
    section=el('section',null,'partner-conversation-profile');section.id='partner-conversation-profile';
    var details=el('details'),summary=el('summary',text('대화 프로필','Conversation profile'));
    details.open=keepOpen===undefined?Object.keys(catalog).every(function (group) {return !saved[group].length;}):keepOpen;
    details.append(summary,el('p',text('잘 맞는 대화 목적·관심사·스타일을 골라 주세요. 복수 선택할 수 있어요.','Choose the conversations, interests and styles that suit you. Multiple selections are welcome.'),'pcv-hint'));
    var groups={comfortable_purposes:text('잘 맞는 대화 목적','Conversation goals that suit you'),interests:text('관심사 · 최대 4개','Interests · up to 4'),conversation_styles:text('대화 스타일','Conversation styles')};
    Object.keys(catalog).forEach(function (group) {
      var fieldset=el('fieldset'),legend=el('legend',groups[group]),chips=el('div',null,'pcv-chips');
      if(group==='conversation_styles')chips.classList.add('pcv-styles');
      fieldset.append(legend,chips);catalog[group].forEach(function (item) {
        var label=el('label',null,'pcv-chip'),input=el('input');input.type='checkbox';input.name=group;input.value=item[0];input.checked=saved[group].includes(item[0]);
        label.append(input,el('span',item[ko?1:2]));chips.append(label);inputs.push(input);input.addEventListener('change',update);
      });details.append(fieldset);
    });
    var status=el('p',null,'pcv-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    var count=el('span'),save=el('button',text('대화 프로필 저장','Save conversation profile'),'pcv-save');save.type='button';
    var actions=el('div',null,'pcv-actions');actions.append(count,save);details.append(status,actions);section.append(details);host.append(section);
    function payload(){var value=empty();Object.keys(catalog).forEach(function (group) {value[group]=inputs.filter(function (input) {return input.name===group&&input.checked;}).map(function (input) {return input.value;});});return validate(value);}
    readDraft=payload;
    function update(){
      var value=payload(),full=value.interests.length===4;inputs.forEach(function (input) {if(input.name==='interests')input.disabled=full&&!input.checked;});
      count.textContent=text('관심사 ','Interests ')+value.interests.length+'/4';
      save.disabled=JSON.stringify(value)===original;status.textContent='';
    }
    save.addEventListener('click',async function(){
      var expected=activeId,currentSection=section;save.disabled=true;
      try{
        var client=root.supabaseClient;if(!client)throw new Error('Session unavailable.');
        var session=await client.auth.getSession(),current=session.data&&session.data.session&&session.data.session.user;
        if(!current||current.id!==expected||activeId!==expected||section!==currentSection||!activeProfile||activeProfile.role!=='partner')throw new Error(text('세션이 변경됐습니다. 다시 로그인해 주세요.','Session changed. Please sign in again.'));
        var value=payload(),result=await client.rpc('save_partner_conversation_preferences',{p_preferences:value});
        if(result.error)throw new Error(text('저장하지 못했어요. 다시 시도해 주세요.','Could not save. Please retry.'));
        if(activeId!==expected||section!==currentSection)return;
        original=JSON.stringify(validate(result.data));
        status.textContent=text('대화 프로필을 저장했어요. 다음 로그인에서도 유지됩니다.','Conversation profile saved. It will be restored when you sign in again.');
      }catch(error){if(section===currentSection)status.textContent=error.message;}
      finally{if(section===currentSection)save.disabled=JSON.stringify(payload())===original;}
    });
    update();
  }
  function start(){
    document.addEventListener('dayo:partner-authorized',function(event){var d=event.detail||{};mount(d.user,d.profile);});
    if(root.supabaseClient&&root.supabaseClient.auth.onAuthStateChange)root.supabaseClient.auth.onAuthStateChange(function(event,session){if(!session||!session.user||session.user.id!==activeId)clear();});
    document.addEventListener('dayo:langchange',function(){var user=activeId&&{id:activeId},profile=activeProfile,draft=readDraft&&readDraft(),open=section&&section.querySelector('details').open;clear();if(user)mount(user,profile,draft,open);});
    mount(root.__dayoPartnerAuthUser,root.__dayoPartnerProfileGate);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(typeof window!=='undefined'?window:null);
