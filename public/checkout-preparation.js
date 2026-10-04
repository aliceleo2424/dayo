/* Private checkout preparation. No pricing, entitlement or ticket issuance. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DayOCheckout = api;
})(typeof window === 'undefined' ? null : window, function (win) {
  'use strict';
  var INTERESTS = [
    ['drama','드라마'],['movies','영화'],['youtube','유튜브/쇼츠'],['music','음악'],
    ['travel','여행'],['food_cafe','맛집/카페'],['exercise','운동'],['games','게임'],
    ['fashion_beauty','패션/뷰티'],['pets','반려동물'],['books_webtoon','책/웹툰'],['work_school','일/학교']
  ];
  var active = null;
  function phone(value) {
    var n = String(value || '').replace(/[\s()-]/g, '');
    return /^010[0-9]{8}$/.test(n) ? n : null;
  }
  function displayPhone(value) {
    var n = phone(value);
    return n ? n.slice(0,3)+'-'+n.slice(3,7)+'-'+n.slice(7) : String(value || '');
  }
  function email(value) {
    var s = String(value || '').trim();
    return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
  }
  function preferences(keys, other) {
    var allowed = INTERESTS.map(function (i) { return i[0]; });
    var list = Array.isArray(keys) ? keys.slice() : [];
    var text = String(other || '').trim();
    if (list.some(function (k, i) { return allowed.indexOf(k) < 0 || list.indexOf(k) !== i; }) ||
        list.length + (text ? 1 : 0) > 4 || text.length > 40) throw new Error('invalid-interests');
    return { interests: list, other_interest: text || null };
  }
  function requiredComplete(items) {
    return items.filter(function (i) { return i.required; }).every(function (i) { return i.checked; });
  }
  function allState(items) {
    return { checked: items.length > 0 && items.every(function (i) { return i.checked; }),
      indeterminate: items.some(function (i) { return i.checked; }) && !items.every(function (i) { return i.checked; }) };
  }
  async function load(client, session) {
    var uid = session.user.id;
    var contact = await client.from('user_contact_info').select('contact_email,mobile_phone').eq('user_id',uid).maybeSingle();
    if (contact.error) throw new Error('contact-unavailable');
    var result = await client.from('user_conversation_preferences').select('schema_version,interests,other_interest').eq('user_id',uid).maybeSingle();
    var pref = result.error ? null : result.data;
    var warning = !!result.error;
    if (pref && pref.schema_version !== 1) { pref = {interests:[],other_interest:null}; warning = true; }
    if (!pref) {
      // Only this authenticated learner's successful booking snapshot can prefill.
      try {
        var recent = await client.from('bookings').select('conversation_brief').eq('learner_id',uid)
          .in('status',['confirmed','completed']).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1);
        if (!recent.error && recent.data && recent.data[0]) {
          var raw = recent.data[0].conversation_brief || {};
          pref = preferences(raw.interests || [], null);
        }
      } catch (_) { /* Optional prefill never blocks checkout. */ }
    }
    try { pref = preferences(pref && pref.interests || [], pref && pref.other_interest); }
    catch (_) { pref = preferences([],null); warning = true; }
    return { contact_email: contact.data && contact.data.contact_email || session.user.email || '',
      mobile_phone: contact.data && contact.data.mobile_phone || '', preferences: pref, preferenceWarning: warning };
  }
  async function persist(client, session, input) {
    var contact = { contact_email: email(input.contact_email), mobile_phone: phone(input.mobile_phone) };
    if (!contact.contact_email || !contact.mobile_phone) throw new Error('invalid-contact');
    var pref = preferences(input.interests, input.other_interest);
    if (!requiredComplete(input.consents || [])) throw new Error('consent-required');
    var current = await client.auth.getSession();
    if (current.error || !current.data || !current.data.session || current.data.session.user.id !== session.user.id)
      throw new Error('session-changed');
    var saved = await client.from('user_contact_info').upsert(Object.assign({user_id:session.user.id},contact),{onConflict:'user_id'})
      .select('contact_email,mobile_phone').single();
    if (saved.error || !saved.data || saved.data.contact_email !== contact.contact_email || saved.data.mobile_phone !== contact.mobile_phone)
      throw new Error('contact-save-failed');
    var warning = false;
    try {
      var ps = await client.from('user_conversation_preferences').upsert(Object.assign({user_id:session.user.id},pref),{onConflict:'user_id'})
        .select('schema_version,interests,other_interest').single();
      warning = !!ps.error || !ps.data || ps.data.schema_version !== 1 || JSON.stringify(ps.data.interests) !== JSON.stringify(pref.interests) ||
        (ps.data.other_interest || null) !== pref.other_interest;
    } catch (_) { warning = true; }
    return { contact: contact, preferences: pref, preferenceWarning: warning };
  }
  var CSS = `
  .tk-modal.ck-mode{height:min(92vh,760px);height:min(92dvh,760px);max-width:600px}
  .ck-mode .tk-head{padding:.7rem 3.5rem .65rem 1rem;text-align:left}.ck-mode .tk-sub,.ck-mode .tk-eyebrow{display:none}
  .ck-mode .tk-title{font-size:1.1rem;margin:0}.ck-mode .tk-body{display:flex;padding:0;overflow:hidden}
  .ck-mode .tk-body>:not(.ck-form){display:none!important}
  .ck-form{display:flex;flex-direction:column;min-height:0;width:100%;font-size:14px;color:#40362F}
  .ck-content{flex:1;min-height:0;overflow-y:auto;padding:12px 16px;overscroll-behavior:contain}
  .ck-form h3{font-size:15px;margin:12px 0 7px}.ck-product{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #E7DDD0;padding-bottom:10px}
  .ck-product span{min-width:0;overflow-wrap:anywhere}.ck-back{background:transparent;border:0;color:#506B55;padding:0 0 8px;cursor:pointer;min-height:32px}
  .ck-field{display:block;margin:8px 0}.ck-field span{display:block;font-size:12px;margin-bottom:4px;color:#6B625B}
  .ck-field input{display:block;box-sizing:border-box;width:100%;min-width:0;min-height:44px;border:1px solid #D2C9BB;border-radius:10px;background:#FFFBF4;color:#40362F;padding:9px 10px;font:inherit;font-size:16px}
  .ck-form input:focus-visible,.ck-form button:focus-visible,.ck-form summary:focus-visible{outline:2px solid #506B55;outline-offset:2px}
  .ck-hint{font-size:12px;color:#6B625B;line-height:1.5;margin:4px 0 8px}
  .ck-preferences{margin:12px 0;background:#F8F0E3;border:1px solid #E7DDD0;border-radius:12px;padding:10px}
  .ck-preferences summary{cursor:pointer;min-height:32px;display:list-item;font-weight:700}.ck-preferences summary span{font-weight:400;font-size:12px}
  .ck-chips{display:flex;flex-wrap:wrap;gap:6px}.ck-chip{font:inherit;font-size:12px;min-height:40px;padding:6px 9px;border:1px solid #D2C9BB;border-radius:20px;background:#FFFBF4;color:#40362F;cursor:pointer}
  .ck-chip[aria-pressed=true]{background:#DDE8D9;color:#364C3A;border-color:#5F7D63}
  .ck-consent{display:flex;align-items:center;gap:8px;min-height:44px;line-height:1.4}.ck-consent label{display:flex;align-items:center;gap:8px;flex:1;min-height:44px;cursor:pointer}
  .ck-consent input{width:18px;height:18px;accent-color:#5F7D63;flex-shrink:0}.ck-consent button{background:transparent;border:0;color:#506B55;font:inherit;font-size:12px;min-height:44px;padding:4px}
  .ck-all{border-bottom:1px solid #E7DDD0;font-weight:700}.ck-footer{flex-shrink:0;padding:10px 16px 12px;border-top:1px solid #E7DDD0;background:#FFFBF4}
  .ck-amount{display:flex;justify-content:space-between;margin-bottom:8px;font-weight:700}.ck-pay{width:100%;min-height:48px;border:0;border-radius:12px;background:#5F7D63;color:white;font:inherit;font-weight:700;cursor:pointer}
  .ck-pay:disabled{background:#CBD5E1;color:#475569;cursor:default}.ck-error{color:#B42318;font-size:13px;line-height:1.4;margin:6px 0;overflow-wrap:anywhere}.ck-error:empty{display:none}
  @media(max-width:400px){.ck-content{padding:10px 12px}.ck-footer{padding:8px 12px 10px}.ck-consent{font-size:13px}.ck-product{font-size:13px}}
  `;
  function cancel() { if (active) active.finish(null); }
  async function open(session, product) {
    if (!win || !win.DayOTickets || !win.supabaseClient) throw new Error('checkout-unavailable');
    cancel();
    win.DayOTickets.open();
    var modal = win.document.querySelector('.tk-modal'), body = modal && modal.querySelector('.tk-body');
    if (!body) throw new Error('checkout-unavailable');
    if (!win.document.getElementById('dayo-checkout-style')) {
      var style = win.document.createElement('style'); style.id='dayo-checkout-style'; style.textContent=CSS; win.document.head.appendChild(style);
    }
    return new Promise(function (resolve) {
      var form=win.document.createElement('form'); form.className='ck-form'; form.noValidate=true;
      form.innerHTML='<div class="ck-content"><button type="button" class="ck-back">← 상품 다시 선택</button>'+
        '<div class="ck-product"><span data-ck-product></span><strong data-ck-price></strong></div>'+
        '<h3>연락처 <small>(필수)</small></h3><label class="ck-field"><span>연락 받을 이메일</span><input name="contact_email" type="email" autocomplete="email" maxlength="254" required></label>'+
        '<label class="ck-field"><span>휴대폰 번호</span><input name="mobile_phone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="20" placeholder="010-1234-5678" required></label>'+
        '<p class="ck-hint">예약·결제 안내를 받을 연락처예요. 로그인 이메일과 달라도 괜찮아요.</p>'+
        '<details class="ck-preferences"><summary>대화 준비 <span>· 관심사 선택 (선택)</span></summary><p class="ck-hint">함께 이야기하기 좋은 주제예요. 기타를 포함해 최대 4개까지 골라요.</p><div class="ck-chips"></div>'+
        '<label class="ck-field"><span>기타 (선택)</span><input name="other_interest" maxlength="40" placeholder="관심사를 직접 입력해 주세요"></label><p class="ck-hint" data-ck-count></p></details>'+
        '<h3>약관 동의</h3><div class="ck-consent ck-all"><label><input type="checkbox" data-ck-all>전체 동의</label></div>'+
        ['terms','privacy','refund'].map(function (key,i) { return '<div class="ck-consent"><label><input type="checkbox" id="ckAgree_'+key+'" data-ck-consent="'+key+'" data-required="true">[필수] '+['이용약관 동의','개인정보처리 관련 동의','취소 및 환불규정 확인'][i]+'</label><button type="button" data-ck-policy="'+key+'" aria-label="'+['이용약관','개인정보처리','취소 및 환불규정'][i]+' 보기">보기</button></div>'; }).join('')+
        '<p class="ck-error" role="alert"></p></div><div class="ck-footer"><div class="ck-amount"><span>결제 금액</span><strong data-ck-total></strong></div><button type="submit" class="ck-pay" disabled>확인 후 결제하기</button></div>';
      var keys=[], ready=false, busy=false, dead=false;
      function q(s){return form.querySelector(s);}
      function consents(){return Array.prototype.map.call(form.querySelectorAll('[data-ck-consent]'),function(c){return {required:c.dataset.required==='true',checked:c.checked};});}
      function update(){var state=allState(consents());q('[data-ck-all]').checked=state.checked;q('[data-ck-all]').indeterminate=state.indeterminate;
        q('.ck-pay').disabled=!ready||busy||!email(q('[name=contact_email]').value)||!phone(q('[name=mobile_phone]').value)||!requiredComplete(consents());
        var selectedCount=keys.length+(q('[name=other_interest]').value.trim()?1:0);q('[data-ck-count]').textContent=selectedCount+'/4개 선택';q('summary span').textContent=selectedCount?'· '+selectedCount+'개 선택 (선택)':'· 관심사 선택 (선택)';}
      function finish(value){if(dead)return;dead=true;active=null;form.remove();modal.classList.remove('ck-mode');resolve(value);}
      active={finish:finish};modal.classList.add('ck-mode');body.appendChild(form);
      q('[data-ck-product]').textContent=product.name+' · 이용권 '+product.tickets+'장';
      var won=Number(product.price).toLocaleString('ko-KR')+'원';q('[data-ck-price]').textContent=won;q('[data-ck-total]').textContent=won;
      INTERESTS.forEach(function(i){var b=win.document.createElement('button');b.type='button';b.className='ck-chip';b.dataset.interest=i[0];b.setAttribute('aria-pressed','false');b.textContent=i[1];q('.ck-chips').appendChild(b);});
      form.addEventListener('click',function(e){
        var chip=e.target.closest('[data-interest]');
        if(chip){var k=chip.dataset.interest, idx=keys.indexOf(k);if(idx>=0)keys.splice(idx,1);else if(keys.length+(q('[name=other_interest]').value.trim()?1:0)<4)keys.push(k);else{q('.ck-error').textContent='관심사는 기타를 포함해 최대 4개까지 선택해 주세요.';return;}
          chip.setAttribute('aria-pressed',keys.indexOf(k)>=0?'true':'false');update();}
        if(e.target.closest('.ck-back'))finish(null);
        var policy=e.target.closest('[data-ck-policy]');if(policy){var type=policy.dataset.ckPolicy;
          if(type==='refund'&&win.openRefundMiniModal)win.openRefundMiniModal('#ckAgree_refund');
          else if(win.DayOTermsMini&&win.DayOTermsMini.open)win.DayOTermsMini.open(type,'#ckAgree_'+type);
          else q('.ck-error').textContent='약관을 불러오지 못했어요. 페이지를 새로고침해 주세요.';}
      });
      form.addEventListener('change',function(e){if(e.target.matches('[data-ck-all]'))Array.prototype.forEach.call(form.querySelectorAll('[data-ck-consent]'),function(c){c.checked=e.target.checked;});update();});
      form.addEventListener('input',function(e){if(e.target.type==='checkbox')return;q('.ck-error').textContent='';if(e.target.name==='other_interest'&&keys.length===4&&e.target.value.trim()){e.target.value='';q('.ck-error').textContent='기타를 입력하려면 선택한 관심사 하나를 해제해 주세요.';}update();});
      form.addEventListener('blur',function(e){if(e.target.name==='mobile_phone'){e.target.value=displayPhone(e.target.value);update();}},true);
      form.addEventListener('submit',async function(e){e.preventDefault();if(!ready||busy)return;busy=true;update();
        try{var saved=await persist(win.supabaseClient,session,{contact_email:q('[name=contact_email]').value,mobile_phone:q('[name=mobile_phone]').value,interests:keys,other_interest:q('[name=other_interest]').value,consents:consents()});
          if(dead)return;var legacy=win.document.getElementById('tkRefundAgree');if(legacy)legacy.checked=true;
          if(saved.preferenceWarning)win.DayOTickets.toast('연락처는 저장됐지만 관심사는 저장하지 못했어요. 결제는 계속할 수 있어요.',{long:true,ms:7000});finish(saved.contact);
        }catch(_){if(!dead){q('.ck-error').textContent='연락처와 필수 동의를 확인해 주세요. 저장하지 못하면 결제를 시작하지 않아요.';}}
        finally{busy=false;if(!dead)update();}
      });
      load(win.supabaseClient,session).then(function(data){if(dead)return;
        q('[name=contact_email]').value=data.contact_email;q('[name=mobile_phone]').value=displayPhone(data.mobile_phone);keys=data.preferences.interests.slice();q('[name=other_interest]').value=data.preferences.other_interest||'';
        Array.prototype.forEach.call(form.querySelectorAll('[data-interest]'),function(c){c.setAttribute('aria-pressed',keys.indexOf(c.dataset.interest)>=0?'true':'false');});
        if(keys.length||data.preferences.other_interest)q('summary span').textContent='· '+(keys.length+(data.preferences.other_interest?1:0))+'개 선택 (선택)';
        if(data.preferenceWarning)q('.ck-error').textContent='저장된 관심사를 확인하지 못했어요. 관심사 선택 없이도 결제할 수 있어요.';
        q('.ck-preferences').open=keys.length===0&&!data.preferences.other_interest;
        ready=true;update();q('[name=contact_email]').focus();
      }).catch(function(){if(!dead)q('.ck-error').textContent='연락처 저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요. 결제는 시작되지 않았어요.';});
    });
  }
  return {interests:INTERESTS,normalizePhone:phone,displayPhone:displayPhone,validEmail:email,preferences:preferences,requiredComplete:requiredComplete,allState:allState,load:load,persist:persist,open:open,cancel:cancel};
});
