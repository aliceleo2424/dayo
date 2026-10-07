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
  var contract=Object.freeze({catalog:catalog,empty:empty,validate:validate,openEditor:openEditor,mountEditor:mountEditor});
  if(typeof module==='object'&&module.exports)module.exports=contract;
  if(root&&root.document)root.DayOPartnerConversationProfile=contract;

  // Compatibility entry point: every conversation edit uses the same details modal.
  function openEditor() {
    if(!root||!root.document)return false;
    root.document.dispatchEvent(new root.CustomEvent('dayo:edit-partner-details'));return true;
  }
  function mountEditor(host,saved) {
    var doc=host.ownerDocument,ko=doc.documentElement.lang==='ko',originalValue=validate(saved||empty()),inputs=[];
    function text(kr,en){return ko?kr:en;}
    function el(tag,copy,className){var n=doc.createElement(tag);if(copy)n.textContent=copy;if(className)n.className=className;return n;}
    host.classList.add('partner-conversation-profile');
    host.append(el('legend',text('대화 프로필','Conversation profile')),el('p',text('잘 맞는 목적과 스타일, 즐겨 이야기하는 관심사를 골라 주세요. 관심사는 최대 4개예요.','Choose the goals and styles that suit you, and up to 4 topics you enjoy talking about.'),'pcp-hint'));
    var groups={comfortable_purposes:text('대화 목적','Conversation goals'),interests:text('관심사','Interests'),conversation_styles:text('대화 스타일','Conversation styles')};
    Object.keys(catalog).forEach(function(group){
      var fieldset=el('fieldset'),chips=el('div',null,'pcv-chips');
      if(group==='conversation_styles')chips.classList.add('pcv-styles');
      fieldset.append(el('legend',groups[group]),chips);
      catalog[group].forEach(function(item){
        var label=el('label',null,'pcv-chip'),input=el('input');input.type='checkbox';input.name=group;input.value=item[0];input.checked=originalValue[group].includes(item[0]);
        label.append(input,el('span',item[ko?1:2]));chips.append(label);inputs.push(input);input.addEventListener('change',update);
      });host.append(fieldset);
    });
    var count=el('p',null,'pcv-count');count.setAttribute('aria-live','polite');host.append(count);
    function read(){var value=empty();Object.keys(catalog).forEach(function(group){value[group]=inputs.filter(function(input){return input.name===group&&input.checked;}).map(function(input){return input.value;});});return validate(value);}
    function update(){var value=read(),full=value.interests.length===4;inputs.forEach(function(input){if(input.name==='interests')input.disabled=full&&!input.checked;});count.textContent=text('관심사 ','Interests ')+value.interests.length+' / 4';}
    async function save(expected,guard){
      var client=root.supabaseClient,value=read();
      async function owner(){var auth=await client.auth.getSession(),user=auth.data&&auth.data.session&&auth.data.session.user;if(!user||user.id!==expected||!guard())throw new Error(text('세션이 변경됐습니다. 프로필을 다시 열어 주세요.','Session changed. Please reopen your profile.'));}
      if(!client)throw new Error('Session unavailable.');
      await owner();
      var latest=await client.from('partner_profile_details').select('conversation_preferences').eq('partner_id',expected).maybeSingle();
      if(latest.error||!latest.data)throw new Error(text('현재 대화 프로필을 확인하지 못했어요. 다시 시도해 주세요.','Could not confirm the current conversation profile. Please retry.'));
      var fresh=latest.data.conversation_preferences?validate(latest.data.conversation_preferences):empty();
      // Unedited groups follow the latest saved values, including edits in another tab.
      Object.keys(catalog).forEach(function(group){if(JSON.stringify(value[group])===JSON.stringify(originalValue[group]))value[group]=fresh[group];});
      await owner();
      var result=await client.rpc('save_partner_conversation_preferences',{p_preferences:validate(value)});
      if(result.error)throw new Error(text('대화 프로필을 저장하지 못했어요. 다시 시도해 주세요.','Could not save your conversation profile. Please retry.'));
      if(!guard())return;
      originalValue=validate(result.data);inputs.forEach(function(input){input.checked=originalValue[input.name].includes(input.value);});update();
      doc.dispatchEvent(new root.CustomEvent('dayo:partner-detailschanged',{detail:{source:'conversation'}}));
      return originalValue;
    }
    update();return {read:read,save:save};
  }
})(typeof window!=='undefined'?window:null);
