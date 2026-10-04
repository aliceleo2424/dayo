/* Local UI preview and canonical contract only. No Supabase table/RPC writes. */
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
  // A deployment of this branch must not expose a fake server Save.
  if(!['localhost','127.0.0.1','[::1]'].includes(root.location.hostname))return;
  var section,activeId=null,activeProfile=null,readDraft=null;
  function clear(){if(section)section.remove();section=null;activeId=activeProfile=null;readDraft=null;}
  function mount(user,profile,draft,keepOpen){
    if(!user||!profile||profile.role!=='partner'){clear();return;}
    if(activeId===user.id&&section)return;
    clear();var host=document.querySelector('#partner-dashboard-section .profile-card');if(!host)return;
    activeId=user.id;activeProfile=profile;
    var key='dayo:partner-conversation-draft:v1:'+user.id,saved=empty(),invalidDraft=false;
    try{var raw=root.localStorage.getItem(key);if(raw)saved=validate(JSON.parse(raw));}catch(_){invalidDraft=true;}
    var original=JSON.stringify(saved),ko=document.documentElement.lang==='ko',inputs=[];
    if(draft)saved=validate(draft);
    function text(koText,enText){return ko?koText:enText;}
    function el(tag,copy,className){var n=document.createElement(tag);if(copy)n.textContent=copy;if(className)n.className=className;return n;}
    section=el('section',null,'partner-conversation-profile');section.id='partner-conversation-profile';
    var details=el('details'),summary=el('summary',text('대화 프로필','Conversation profile'));
    details.open=keepOpen===undefined?(invalidDraft||Object.keys(catalog).every(function (group) {return !saved[group].length;})):keepOpen;
    details.append(summary,el('p',text('잘 맞는 대화 목적·관심사·스타일을 골라 주세요. 복수 선택할 수 있어요.','Choose the conversations, interests and styles that suit you. Multiple selections are welcome.'),'pcv-hint'));
    details.append(el('p',text('로컬 미리보기 · 이 브라우저에만 저장되며 실제 매칭에는 아직 사용되지 않습니다.','Local preview · Saved only in this browser; not yet used for live matching.'),'pcv-preview'));
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
    var count=el('span'),save=el('button',text('로컬 초안 저장','Save local draft'),'pcv-save');save.type='button';
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
        var value=payload();root.localStorage.setItem(key,JSON.stringify(value));original=JSON.stringify(value);
        status.textContent=text('이 브라우저에 초안을 저장했습니다. 운영 프로필에는 반영되지 않습니다.','Draft saved in this browser. Your live profile has not changed.');
      }catch(error){if(section===currentSection)status.textContent=error.message;}
      finally{if(section===currentSection)save.disabled=JSON.stringify(payload())===original;}
    });
    update();if(invalidDraft)status.textContent=text('기존 초안을 읽을 수 없습니다. 다시 선택해서 저장해 주세요.','The existing draft could not be read. Select your preferences again to replace it.');
  }
  function start(){
    document.addEventListener('dayo:partner-authorized',function(event){var d=event.detail||{};mount(d.user,d.profile);});
    if(root.supabaseClient&&root.supabaseClient.auth.onAuthStateChange)root.supabaseClient.auth.onAuthStateChange(function(event,session){if(!session||!session.user||session.user.id!==activeId)clear();});
    document.addEventListener('dayo:langchange',function(){var user=activeId&&{id:activeId},profile=activeProfile,draft=readDraft&&readDraft(),open=section&&section.querySelector('details').open;clear();if(user)mount(user,profile,draft,open);});
    mount(root.__dayoPartnerAuthUser,root.__dayoPartnerProfileGate);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(typeof window!=='undefined'?window:null);
