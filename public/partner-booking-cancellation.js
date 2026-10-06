(function () {
  'use strict';
  if (window.DayOPartnerCancellation) return;
  var active = null;
  function ko() { return !window.DayOI18n || window.DayOI18n.getLang() === 'KO'; }
  function copy(korean, english) { return ko() ? korean : english; }
  var reasons = [
    ['schedule_change','갑작스러운 일정 변경','Unexpected schedule change'],
    ['health','건강 문제','Health issue'], ['school_exam','학교/시험 일정','School or exam'],
    ['technical','인터넷·기기 문제','Internet or device issue'], ['personal','개인 사정','Personal circumstances'],
    ['other','기타','Other']
  ];
  function element(tag, text, className) {
    var node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function style() {
    if (document.getElementById('partner-cancellation-style')) return;
    var node = element('style'); node.id = 'partner-cancellation-style';
    node.textContent = '.pc-overlay{position:fixed;inset:0;z-index:12000;display:flex;align-items:center;justify-content:center;background:rgba(41,52,43,.34);padding:16px;box-sizing:border-box}.pc-panel{box-sizing:border-box;width:min(100%,480px);max-height:calc(100dvh - 32px);overflow-y:auto;background:#FFFBF4;color:#344c38;border:1px solid #d6decf;border-radius:20px;padding:24px;box-shadow:0 16px 50px #29342b26;overflow-wrap:anywhere}.pc-panel *{box-sizing:border-box;min-width:0}.pc-panel h2{font-size:21px;line-height:1.4;margin:0 0 16px}.pc-panel p{line-height:1.6;margin:8px 0}.pc-info{background:#F8F0E3;padding:12px;border-radius:12px}.pc-notice{padding:12px;border-radius:12px;background:#edf2e8;font-size:14px}.pc-notice.is-late{background:#fff1d4;color:#805619;border:1px solid #e8cc92}.pc-panel label{display:block;margin:16px 0 6px;font-weight:600}.pc-panel select,.pc-panel textarea{display:block;width:100%;font:inherit;font-size:16px;padding:10px;border:1px solid #c8d3c4;border-radius:10px;background:#fff;color:inherit}.pc-panel textarea{resize:vertical;min-height:96px}.pc-actions{display:flex;gap:10px;margin-top:20px}.pc-actions button{flex:1;padding:11px 10px;border:1px solid #c8d3c4;border-radius:12px;background:#F8F0E3;color:#344c38;font:inherit;font-weight:600;white-space:normal;line-height:1.4}.pc-actions .pc-primary{background:#5F7D63;border-color:#5F7D63;color:#fff}.pc-panel button:disabled{opacity:.55}.pc-panel button:focus-visible,.pc-panel select:focus-visible,.pc-panel textarea:focus-visible{outline:3px solid #5F7D63;outline-offset:3px}.pc-error{color:#9a472c;font-size:14px}.pc-panel [hidden]{display:none!important}@media(max-width:400px){.pc-overlay{padding:12px}.pc-panel{padding:18px;max-height:calc(100dvh - 24px)}.pc-actions{gap:8px}.pc-actions button{font-size:14px}}';
    document.head.appendChild(node);
  }
  function unwrap(value) { return Array.isArray(value) ? value[0] : value; }
  async function preview(client, id) {
    var result = await client.rpc('get_my_partner_cancellation_preview', { p_booking_id: id });
    if (result.error && result.error.hint === 'booking_created_at_missing') throw new Error('missing_created_at');
    var data = unwrap(result.data);
    if (result.error || !data || data.booking_id !== id || !Number.isFinite(Number(data.remaining_seconds)) || Number(data.remaining_seconds) <= 0) throw new Error('unavailable');
    return data;
  }
  function time(value) {
    return new Intl.DateTimeFormat(ko() ? 'ko-KR' : 'en-GB', {
      timeZone:'Asia/Seoul',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
    }).format(new Date(value)) + ' (KST)';
  }
  function close() { if (active && !active.busy) active.close(); }
  async function open(booking, client) {
    if (active) return;
    style();
    var previous = document.activeElement;
    var overlay = element('div', null, 'pc-overlay');
    var panel = element('section', null, 'pc-panel');
    panel.setAttribute('role','dialog'); panel.setAttribute('aria-modal','true'); panel.setAttribute('aria-labelledby','pc-title');
    var title = element('h2',copy('예약 취소','Cancel booking')); title.id='pc-title';
    var info = element('div',copy('예약 정보를 확인하고 있어요.','Checking booking details…'),'pc-info');
    var notice = element('p',null,'pc-notice');
    var policy = element('p');
    var form = element('div');
    var label = element('label',copy('취소 사유','Cancellation reason')); label.htmlFor='pc-reason';
    var select = element('select'); select.id='pc-reason';
    select.appendChild(element('option',copy('사유를 선택해 주세요','Select a reason'))); select.firstChild.value='';
    reasons.forEach(function(r){var option=element('option',r[ko()?1:2]);option.value=r[0];select.appendChild(option);});
    var otherWrap=element('div');otherWrap.hidden=true;
    var otherLabel=element('label',copy('관리자에게 전달할 상세 사유 (최대 300자)','Details for the admin (max 300 characters)'));otherLabel.htmlFor='pc-other';
    var other=element('textarea');other.id='pc-other';other.maxLength=300;
    otherWrap.append(otherLabel,other); form.append(label,select,otherWrap);
    var confirmation=element('p',copy('정말 이 예약을 취소할까요? 사용한 원래 티켓 1장이 상대방에게 반환됩니다.','Cancel this booking? The learner’s original ticket will be returned.'));
    confirmation.hidden=true;
    var error=element('p',null,'pc-error');error.setAttribute('role','alert');
    var actions=element('div',null,'pc-actions');
    var back=element('button',copy('돌아가기','Go back'));back.type='button';
    var submit=element('button',copy('예약 취소하기','Cancel booking'),'pc-primary');submit.type='button';submit.disabled=true;
    actions.append(back,submit); panel.append(title,info,notice,policy,form,confirmation,error,actions);overlay.appendChild(panel);document.body.appendChild(overlay);
    var previousOverflow=document.body.style.overflow;
    if(window.DayOScrollLock)window.DayOScrollLock.lock();else document.body.style.overflow='hidden';
    var state={busy:false,data:null,stage:0,timer:null,errorKey:null,expired:false,close:function(){
      clearInterval(state.timer);document.removeEventListener('keydown',key);document.removeEventListener('dayo:langchange',localize);overlay.remove();
      if(window.DayOScrollLock)window.DayOScrollLock.unlock();else document.body.style.overflow=previousOverflow;
      active=null;if(previous&&previous.isConnected)previous.focus();
    }};active=state;
    function key(event){
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key==='Tab'){
        var controls=Array.from(panel.querySelectorAll('button,select,textarea')).filter(function(n){return !n.disabled && !n.closest('[hidden]');});
        var first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    }
    document.addEventListener('keydown',key);
    function valid(){return select.value && (select.value!=='other'||(other.value.replace(/[\u0000-\u001f\u007f]/g,'').trim().length>0));}
    function sync(){submit.disabled=state.busy||!state.data||state.data.enabled!==true||!valid();}
    function message(key){
      if(key==='missing_created_at')return copy('원본 예약 생성일이 없어 취소하지 않았습니다. 운영자에게 문의해 주세요.','This booking’s original creation time is missing, so it was not cancelled. Please contact support.');
      if(key==='boundary')return copy('시간이 지나 패널티 기준이 달라졌습니다. 다시 확인해 주세요.','The penalty boundary has changed. Please review again.');
      if(key==='request')return copy('취소 결과를 확인하지 못했어요. 새로고침하여 예약 상태를 확인한 뒤 다시 시도해 주세요.','Could not verify cancellation. Refresh to check the booking status before retrying.');
      if(key==='unavailable')return copy('예약 취소 기능을 아직 사용할 수 없습니다. 예약 상태를 새로 확인해 주세요.','Cancellation is not yet available. Please refresh the booking status.');
      return '';
    }
    function localize(){
      title.textContent=copy('예약 취소','Cancel booking');
      label.textContent=copy('취소 사유','Cancellation reason');
      select.options[0].textContent=copy('사유를 선택해 주세요','Select a reason');
      reasons.forEach(function(r,index){select.options[index+1].textContent=r[ko()?1:2];});
      otherLabel.textContent=copy('관리자에게 전달할 상세 사유 (최대 300자)','Details for the admin (max 300 characters)');
      confirmation.textContent=copy('정말 이 예약을 취소할까요? 사용한 원래 티켓 1장이 상대방에게 반환됩니다.','Cancel this booking? The learner’s original ticket will be returned.');
      back.textContent=copy('돌아가기','Go back');
      submit.textContent=state.stage ? copy('확인하고 취소하기','Confirm cancellation') : copy('예약 취소하기','Cancel booking');
      error.textContent=message(state.errorKey);
      if(!state.data){info.textContent=copy('예약 정보를 확인하고 있어요.','Checking booking details…');return;}
      var data=state.data;info.replaceChildren();
      info.append(element('p',time(data.scheduled_at)),element('p',copy('대화 상대: ','Conversation with: ')+data.learner_nickname));
      var minutes=Math.max(0,Math.ceil(Number(data.remaining_seconds)/60));
      info.appendChild(element('p',copy('남은 시간: ','Time remaining: ')+Math.floor(minutes/60)+copy('시간 ','h ')+(minutes%60)+copy('분','m')));
      notice.classList.toggle('is-late',data.late_cancel===true);
      notice.textContent=data.late_cancel ? copy('예약 시작까지 6시간 미만 남았습니다. 지금 취소하면 늦은 취소 패널티가 적용됩니다.','This session starts within 6 hours. Cancelling now incurs a late-cancellation penalty.') : copy('지금 취소하면 별도 패널티가 적용되지 않습니다.','No penalty applies if you cancel now.');
      if(data.late_cancel && Number.isInteger(data.penalty_amount)){notice.textContent+=' '+data.penalty_amount.toLocaleString()+ 'P';notice.textContent+=' '+copy('기존 잔액은 차감하지 않고 향후 정상 대화 보상에서 상계됩니다.','Your existing balance is unchanged. This is offset against future normal session rewards.');}
      policy.textContent=data.enabled===true ? copy('사용한 원래 티켓 1장이 반환되며 기존 유효기간은 유지됩니다.','The original ticket is returned with its existing expiry.') : copy('취소 정책 확정 전입니다. 현재 이 화면에서 취소를 실행할 수 없습니다.','Cancellation policy is awaiting approval. Cancellation is currently unavailable.');
      if(state.expired)policy.textContent=copy('이미 시작된 예약은 여기서 취소할 수 없습니다.','A session that has started cannot be cancelled here.');
      sync();
    }
    function show(data){state.data=data;localize();}
    document.addEventListener('dayo:langchange',localize);
    select.addEventListener('change',function(){otherWrap.hidden=select.value!=='other';sync();});other.addEventListener('input',sync);
    back.addEventListener('click',function(){if(state.busy)return;if(state.stage){state.stage=0;form.hidden=false;confirmation.hidden=true;submit.textContent=copy('예약 취소하기','Cancel booking');select.focus();}else close();});
    overlay.addEventListener('click',function(e){if(e.target===overlay)close();});
    submit.addEventListener('click',async function(){
      if(submit.disabled||state.busy)return;
      state.busy=true;sync();back.disabled=true;state.errorKey=null;error.textContent='';
      try{
        if(!state.stage){
          var fresh=await preview(client,booking.id);show(fresh);
          if(fresh.enabled!==true)return;
          state.stage=1;form.hidden=true;confirmation.hidden=false;submit.textContent=copy('확인하고 취소하기','Confirm cancellation');
        }else{
          var result=await client.rpc('cancel_my_partner_booking',{p_booking_id:booking.id,p_reason_code:select.value,
            p_reason_text:select.value==='other'?other.value.trim():null,p_accept_late_penalty:state.data.late_cancel===true});
          var data=unwrap(result.data);
          if(result.error)throw new Error(result.error.hint==='booking_created_at_missing'?'missing_created_at':'request_failed');
          if(!data||data.success!==true){
            if(data&&data.code==='late_penalty_confirmation_required'){
              state.stage=0;form.hidden=false;confirmation.hidden=true;submit.textContent=copy('예약 취소하기','Cancel booking');show(await preview(client,booking.id));
              state.errorKey='boundary';localize();return;
            }
            throw new Error('request_failed');
          }
          // Notification is best-effort AFTER commit; the durable outbox retries.
          if(typeof window.DayONotifyCommittedBooking==='function'){
            try{Promise.resolve(window.DayONotifyCommittedBooking(booking.id,'booking_cancelled')).catch(function(){});}catch(_){}
          }
          state.busy=false;state.close();
          if(typeof window.loadPartnerBookings==='function')Promise.resolve(window.loadPartnerBookings()).catch(function(){});
          if(typeof window.loadPartnerSchedule==='function')Promise.resolve(window.loadPartnerSchedule()).catch(function(){});
          if(typeof window.showToast==='function')window.showToast(copy('예약이 취소되었습니다. 상대방의 원래 티켓이 반환되었습니다.','Booking cancelled. The learner’s original ticket was returned.'));
          return;
        }
      }catch(failure){state.errorKey=failure.message==='missing_created_at'?'missing_created_at':'request';if(state.errorKey==='missing_created_at')state.data=null;localize();}
      finally{state.busy=false;back.disabled=false;sync();if(active===state)submit.focus();}
    });
    back.focus();
    try{show(await preview(client,booking.id));}catch(failure){state.errorKey=failure.message==='missing_created_at'?'missing_created_at':'unavailable';localize();}
    if(active!==state)return;
    state.timer=setInterval(function(){
      if(state.busy||!state.data)return;
      var remaining=(new Date(state.data.scheduled_at).getTime()-Date.now())/1000;
      if(remaining<=0){state.data.enabled=false;state.expired=true;localize();}
    },1000);
  }
  window.DayOPartnerCancellation={open:open,close:close};
})();
