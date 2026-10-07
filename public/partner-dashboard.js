/* Presentation only: move existing nodes, preserving their state and handlers. */
(function () {
  'use strict';
  // Read-only presentation decisions; no schedule or reward writes.
  var overviewState = window.DayOPartnerSetup = {
    hasProfileFields: function(row) {
      return !!(row && row.location_status && row.visa_type && row.korean_level && row.weekly_session_capacity && row.native_languages && row.native_languages.length && row.session_languages && row.session_languages.length);
    },
    hasFutureSlot: function(rows,now) {
      return rows.some(function(row) {
        var raw=String(row.slot_time||'').trim().replace(' ','T');
        if(row.status!=='available'||!/^\d{4}-\d{2}-\d{2}T\d{2}:(00|30)/.test(raw))return false;
        if (/[+-]\d{2}$/.test(raw))raw+=':00';
        else if (/[+-]\d{4}$/.test(raw))raw=raw.slice(0,-2)+':'+raw.slice(-2);
        else if (!/(Z|[+-]\d{2}:\d{2})$/i.test(raw))raw+='+09:00';
        var ms=new Date(raw).getTime(),rules=window.DayOAvailabilityCalendar;
        return ms>now&&(!rules||rules.inWindow(rules.dateAt(ms),now));
      });
    },
    checklist: function(row,profile,open) {
      return [
        {id:'profile',complete:row===undefined?null:!!(this.hasProfileFields(row)&&row.completed_at&&row.partner_guide_acknowledged_at)},
        {id:'image',complete:profile===undefined?null:!!(window.DayOPartnerAvatars&&window.DayOPartnerAvatars.imageUrl(profile&&profile.avatar_url))},
        {id:'intro',complete:profile===undefined?null:!!String(profile&&profile.bio||'').trim()},
        {id:'guide',complete:row===undefined?null:!!(row&&row.partner_guide_acknowledged_at)},
        {id:'availability',complete:typeof open==='boolean'?open:null}
      ];
    }
  };
  function mount() {
    var root = document.getElementById('partner-dashboard-section');
    if (!root || root.dataset.dashboardReady) return;
    var profile = root.querySelector('.profile-card'), schedule = root.querySelector('.schedule-card');
    var upcoming = root.querySelector('.partner-upcoming'), stats = root.querySelector('.lounge-stats');
    var promos = root.querySelector('.lounge-promos'), updates = root.querySelector('.sessions-card');
    var resources = root.querySelector('.tips-card'), convert = root.querySelector('.convert-banner');
    var heading = root.querySelector('.page-heading');
    if (!profile || !schedule || !upcoming || !stats || !promos || !resources || !heading) return;
    root.dataset.dashboardReady = 'true';
    // Put the existing profile title above the avatar/editor without rebuilding the form.
    profile.prepend(profile.querySelector('.card-head'));
    if (!window.DayODashboardTabs) return;
    upcoming.classList.add('dashboard-next'); heading.after(upcoming);
    var nextTitle = upcoming.querySelector('h2'); nextTitle.removeAttribute('data-i18n');
    var status = document.createElement('span'); status.className = 'pd-status'; status.setAttribute('aria-live','polite'); heading.append(status);
    var statusToggle = document.getElementById('partner-status-toggle');
    function syncStatus() { if (statusToggle) {status.textContent = statusToggle.textContent;status.dataset.active = statusToggle.getAttribute('aria-pressed');} }
    syncStatus();
    if (statusToggle) new MutationObserver(syncStatus).observe(statusToggle,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-pressed']});
    var resourceLink = document.createElement('a'); resourceLink.className = 'pd-guide-link';resourceLink.href = '/partner-guide';
    resourceLink.target = '_blank';resourceLink.rel = 'noopener';resourceLink.dataset.en = 'Read the Partner Guide ↗';resourceLink.dataset.ko = '파트너 가이드 읽기 ↗';
    resources.querySelector('.card-head').after(resourceLink);
    var statHeading = document.createElement('h2');statHeading.className='pd-stat-heading';statHeading.dataset.en='Partner Stats';statHeading.dataset.ko='파트너 활동';stats.prepend(statHeading);
    function panel(id,primary,secondary) {
      var section=document.createElement('section');section.id=id;
      var board=document.createElement('div');board.className='pd-board';
      var left=document.createElement('div'),right=document.createElement('div');left.className='pd-column';right.className='pd-column';
      primary.filter(Boolean).forEach(function (node) {left.append(node);});secondary.filter(Boolean).forEach(function (node) {right.append(node);});
      board.append(left,right);section.append(board);return section;
    }
    var labels=[];
    function label(tag,en,ko){var n=document.createElement(tag);n.dataset.en=en;n.dataset.ko=ko;labels.push(n);return n;}
    var modeBadge=heading.querySelector('.eyebrow');if(modeBadge){modeBadge.removeAttribute('data-i18n');modeBadge.dataset.en='PARTNER MODE';modeBadge.dataset.ko='파트너 모드';labels.push(modeBadge);}
    function action(en,ko,fn){var n=label('button',en,ko);n.type='button';n.className='dashboard-action';n.addEventListener('click',fn);return n;}
    function select(id){document.getElementById(id+'-tab').click();}
    schedule.id='pd-weekly-availability';schedule.tabIndex=-1;
    var routingToSchedule=false;
    function openWeeklyAvailability(){routingToSchedule=true;select('pd-sessions');routingToSchedule=false;if(window.DayOPartnerMonthlyUI){window.DayOPartnerMonthlyUI.open();return;}schedule.focus({preventScroll:true});schedule.scrollIntoView({block:'start'});}
    // Keep the placeholder handler for future implementation, but do not expose it.
    var calendar=schedule.querySelector('#gcalSync'),calendarCard;
    if(calendar){calendarCard=document.createElement('section');calendarCard.className='card pd-calendar-card';calendarCard.hidden=true;calendarCard.setAttribute('aria-label','Google Calendar');calendarCard.append(calendar);}
    function card(en,ko,copyEn,copyKo){var n=document.createElement('article');n.className='dashboard-card';n.append(label('h2',en,ko),label('p',copyEn,copyKo));return n;}
    var profileInfo=card('Your partner details','파트너 상세 정보','Loading profile details…','프로필 정보를 불러오는 중…');
    var actionCenter=card('Action Center','Action Center','Checking your next step…','다음 할 일을 확인하는 중…');actionCenter.id='pd-action-center';
    var actionCopy=actionCenter.querySelector('p'),checklist=document.createElement('ul');checklist.className='pd-checklist';actionCenter.append(checklist);
    var availabilityAlert=card('No availability open','열린 예약 시간이 없어요','Open dates to receive bookings.','예약을 받을 날짜를 열어 주세요.');availabilityAlert.id='pd-availability-alert';availabilityAlert.hidden=true;
    availabilityAlert.append(action('Manage schedule →','스케줄 관리 →',openWeeklyAvailability));
    actionCenter.setAttribute('aria-live','polite');
    var actionRow,actionProfile,openSlots,actionFailed=false;
    function setupAction(en,ko,fn){var n=document.createElement('button');n.type='button';n.className='dashboard-action';n.textContent=document.documentElement.lang==='ko'?ko:en;n.addEventListener('click',fn);return n;}
    function goToSetup(id){
      if(id==='guide'){window.open('/partner-guide','_blank','noopener');return;}
      if(id==='availability'){openWeeklyAvailability();return;}
      select('pd-profile');
      if(id==='profile'){var setup=profilePanel.querySelector('.pcp-banner button');if(setup)setup.click();}
      if(id==='image')document.getElementById('photoBtn').click();
      if(id==='intro'){var intro=document.getElementById('partner-bio-input');intro.scrollIntoView({block:'center'});intro.focus();}
    }
    function paintAction(){
      var ko=document.documentElement.lang==='ko',items=overviewState.checklist(actionRow,actionProfile,openSlots).filter(function(x){return x.id!=='availability';}),done=items.filter(function(x){return x.complete===true;}).length,unknown=items.some(function(x){return x.complete===null;});
      checklist.replaceChildren();actionCenter.hidden=done===4;actionCenter.classList.remove('is-complete');
      availabilityAlert.hidden=openSlots!==false;
      actionCenter.querySelector('h2').textContent='Action Center';
      var missing=items.filter(function(x){return x.complete===false;}).length;
      actionCopy.textContent=unknown?(actionFailed?(ko?'일부 정보를 확인하지 못했어요. 다시 확인해 주세요.':'Some information could not load. Please retry.'):(ko?'준비 상태를 확인 중…':'Checking your setup…')):(ko?missing+'개 항목을 완료해 주세요':missing+(missing===1?' thing to finish':' things to finish'));
      var copy={profile:['Complete Partner Profile','Complete profile →','파트너 프로필 완성','프로필 완성 →'],image:['Choose a profile image','Set image →','프로필 이미지 선택','이미지 설정 →'],intro:['Add a one-line intro','Add intro →','한 줄 소개 추가','소개 추가 →'],guide:['Read Partner Guide','Read guide →','파트너 가이드 확인','가이드 읽기 →'],availability:['Open your availability','Open slots →','예약 가능 시간 열기','가능 시간 열기 →']};
      items.filter(function(item){return item.complete===false;}).forEach(function(item){var li=document.createElement('li'),name=document.createElement('span'),c=copy[item.id];name.textContent='○ '+c[ko?2:0];li.dataset.complete='false';li.append(name,setupAction(c[1],c[3],function(){goToSetup(item.id);}));checklist.append(li);});
      if(actionFailed){var retry=document.createElement('li');retry.append(setupAction('Retry →','다시 확인 →',showProfileDetails));checklist.append(retry);}
    }
    // Preserve the internal points DOM/handler for existing data binders and payouts.
    var pointsCard=stats.querySelector('#stat-points-card');pointsCard.hidden=true;
    var payCard=document.createElement('article');payCard.className='stat-box partner-stat-card';
    var payLabel=label('p','Estimated activity pay','예상 활동 수익');payLabel.className='stat-label';
    var payValue=document.createElement('p');payValue.className='stat-value';payValue.textContent='…';payCard.append(payLabel,payValue);stats.append(payCard);
    var profilePanel=panel('pd-profile',[profile],[profileInfo]);
    // Owner-only persistent conversation preferences, loaded after the Lounge is mounted.
    var conversationProfile=document.createElement('script');conversationProfile.src='partner-conversation-profile.js';conversationProfile.addEventListener('load',showProfileDetails);document.head.append(conversationProfile);
    var past=card('Past Sessions','지난 대화','Loading recorded conversations…','대화 기록을 불러오는 중…');
    var pastList=document.createElement('ul');pastList.className='pd-past-list';past.append(pastList);
    var pastPartnerId=null,pastRun=0,pastRows=[];
    function paintPast(){var ko=document.documentElement.lang==='ko';pastList.replaceChildren();past.querySelector('p').textContent=pastRows.length?(ko?'최근 완료 대화 기록':'Recent completed conversation records'):(ko?'아직 기록된 대화가 없어요.':'No recorded conversations yet.');pastRows.slice(0,20).forEach(function(row){var li=document.createElement('li'),date=new Date(row.ended_at||row.completed_at||row.created_at);li.textContent=(ko?'완료 · ':'Completed · ')+(Number.isFinite(date.getTime())?date.toLocaleString(ko?'ko-KR':'en-US'):'—');pastList.append(li);});}
    async function loadPast(id){var run=++pastRun;pastRows=[];pastList.replaceChildren();try{var store=window.DayOProfileStore;if(!store||typeof store.fetchPartnerSessionLogs!=='function')throw new Error('unavailable');if(store.ready)await store.ready();var rows=await store.fetchPartnerSessionLogs();if(run!==pastRun||id!==pastPartnerId)return;pastRows=(rows||[]).slice().sort(function(a,b){return new Date(b.ended_at||b.completed_at||b.created_at)-new Date(a.ended_at||a.completed_at||a.created_at);});paintPast();}catch(_){if(run!==pastRun)return;past.querySelector('p').textContent=document.documentElement.lang==='ko'?'대화 기록을 확인하지 못했어요.':'Conversation records could not load.';}}
    var completed=card('Completed this month','이번 달 완료한 대화','Loading session summary…','세션 요약을 불러오는 중…');
    var countSource=stats.querySelector('#statMonthCount');
    function syncCompleted(){completed.querySelector('p').textContent=countSource.textContent;}
    syncCompleted();new MutationObserver(syncCompleted).observe(countSource,{childList:true,subtree:true,characterData:true});
    var earnings=card('Payouts & rewards','정산 · 리워드','View existing payout information.','기존 정산 정보를 확인하세요.');
    earnings.append(action('Payout information →','정산 정보 보기 →',function(){document.getElementById('stat-points-card').click();}));
    var referralPromo=card('Invite a friend to DayO','DayO에 친구를 초대하세요','Invite a great Conversation Partner and earn a referral bonus.','좋은 Conversation Partner가 될 친구가 있나요? DayO에 추천하고 친구가 조건을 충족하면 추천 보너스를 받으세요.');
    referralPromo.classList.add('pd-referral-promo');
    // Replace the legacy fixed-amount referral promotion without changing reward logic.
    var legacyReferral=promos.querySelector('.promo-card');if(legacyReferral)legacyReferral.hidden=true;
    var referralUrl='https://www.dayotalk.com/partner-apply';
    var referralLink=document.createElement('a');referralLink.className='pd-referral-url';referralLink.href=referralUrl;referralLink.textContent=referralUrl;referralLink.target='_blank';referralLink.rel='noopener';
    async function copyReferralLink(){
      var copied=false,ko=document.documentElement.lang==='ko';
      try{await navigator.clipboard.writeText(referralUrl);copied=true;}catch(_){
        var temporary=document.createElement('textarea');temporary.value=referralUrl;temporary.readOnly=true;temporary.style.position='fixed';temporary.style.opacity='0';document.body.append(temporary);temporary.select();
        try{copied=document.execCommand('copy');}catch(_){}finally{temporary.remove();}
      }
      if(typeof window.showToast==='function')window.showToast(copied?(ko?'지원 링크를 복사했어요!':'Referral link copied!'):(ko?'위의 지원 링크를 직접 복사해 주세요.':'Please copy the referral link above.'));
    }
    var referralCopy=action('Copy link','링크 복사',copyReferralLink);
    var referralShare=action('Share','공유',async function(){
      if(typeof navigator.share==='function'&&window.matchMedia('(pointer: coarse)').matches){
        try{await navigator.share({title:'Join DayO as a Conversation Partner',url:referralUrl});return;}
        catch(error){if(error&&error.name==='AbortError')return;}
      }
      await copyReferralLink();
    });
    var referralActions=document.createElement('div');referralActions.className='pd-referral-actions';referralActions.append(referralCopy,referralShare);
    var referralHelper=label('p','Ask your friend to enter your full name in the Referral field.','친구에게 Referral 항목에 추천인의 전체 이름을 입력해 달라고 안내해 주세요.');referralHelper.className='pd-referral-helper';
    referralPromo.append(referralLink,referralActions,referralHelper);
    var reliability=card('Partner benefits','파트너 혜택','Explore referral rewards and partner benefits.','추천 리워드와 파트너 혜택을 확인하세요.');
    // Retain the existing reward card and its copy, at lower priority.
    var legacyReward=promos.querySelectorAll('.promo-card')[1];if(legacyReward){var legacyDetails=document.createElement('details');legacyDetails.className='pd-legacy-reward';legacyDetails.append(label('summary','Other reward information','기타 리워드 안내'),legacyReward);promos.append(legacyDetails);}
    var resourceCards=document.createElement('div');resourceCards.className='dashboard-resource-grid';
    function resource(en,ko,descEn,descKo,href){var n=card(en,ko,descEn,descKo),a=label('a','View details →','자세히 보기 →');a.className='dashboard-action';a.href=href;if(href==='/partner-guide'){a.classList.add('pd-guide-action');a.target='_blank';a.rel='noopener';}if(href==='#pd-pay-rules')a.classList.add('pd-rules-action');n.append(a);resourceCards.append(n);return n;}
    resource('Conversation Guide · HOW TO TALK','Conversation Guide · 대화 진행 가이드','Help users feel comfortable and keep talking.','편안한 대화를 이어가는 방법.','/partner-guide');
    resource('Pay & Rules · HOW DAYO WORKS','Pay & Rules · 운영 규정','Session pay, bonuses, cancellations & partner standards.','세션 수익, 보너스, 취소 및 파트너 기준.','#pd-pay-rules');
    resource('Safety & Privacy','안전 · 개인정보','Keep conversations on DayO. Respect boundaries and avoid requesting private contact details.','대화는 DayO에서 진행하고, 상대의 경계와 개인 연락처를 존중해 주세요.','/privacy');
    resource('Help / Contact','도움 · 운영 문의','For session issues, reporting and policy questions, contact DayO.','세션 문제, 신고 및 운영 규정은 DayO에 문의해 주세요.','mailto:dayo.speak@gmail.com');
    var rules=card('Pay & Rules','Pay & Rules','Earnings shown here use the existing session-log estimate; they are not a confirmed payout statement. Check Earnings for your current summary. For cancellation, referral and reliability terms, contact DayO before relying on an amount.','표시된 수익은 기존 세션 기록 기반 추정치이며 확정 지급 내역이 아닙니다. Earnings에서 요약을 확인하세요. 취소·추천·Reliability Bonus의 적용 조건과 금액은 운영팀에 확인해 주세요.');rules.id='pd-pay-rules';
    rules.append(action('Open Earnings →','Earnings 보기 →',function(){select('pd-earnings');}));
    earnings.append(action('Pay & Bonus Rules →','수익 · 보너스 규정 →',function(){select('pd-resources');rules.scrollIntoView({block:'start'});}));
    rules.append(label('h3','Availability & session updates','예약 가능 시간 · 세션 처리'),label('p','Open and update actual booking slots in Sessions. Review cancellation and technical issue outcomes there. Conversation entry follows the existing booking window.','Sessions에서 실제 예약 슬롯을 열고 수정할 수 있습니다. 취소·기술 문제 처리 결과도 같은 탭에서 확인하세요. 대화 입장은 기존 예약 기준을 따릅니다.'),action('Open Sessions →','Sessions 보기 →',function(){select('pd-sessions');}));
    var editDetails=document.createElement('button');editDetails.type='button';editDetails.className='dashboard-primary-link';editDetails.textContent=document.documentElement.lang==='ko'?'상세 정보 수정':'Edit details';editDetails.hidden=true;
    editDetails.addEventListener('click',function(){document.dispatchEvent(new CustomEvent('dayo:edit-partner-details'));});profileInfo.append(editDetails);
    var completion=card('Partner profile','파트너 프로필','Loading completion status…','완료 상태를 불러오는 중…');
    var completionValue=completion.querySelector('p');profilePanel.querySelectorAll('.pd-column')[1].prepend(completion);
    var bonusSummary=card('Bonuses','보너스','Referral rewards and partner benefits','추천 리워드와 파트너 혜택');
    var panels=[{panel:panel('pd-sessions',[availabilityAlert,schedule,calendarCard],[past,updates]),en:'Sessions',ko:'세션'},
      {panel:profilePanel,en:'Profile',ko:'프로필'},
      {panel:(function(){var n=panel('pd-earnings',[stats,earnings,bonusSummary],[completed,promos,reliability,convert]);n.prepend(referralPromo);return n;})(),en:'Earnings',ko:'수익'},
      {panel:panel('pd-resources',[resourceCards,rules],[resources]),en:'Resources',ko:'자료'}];
    var tabsHost=document.createElement('div');tabsHost.className='pd-tabs-host';upcoming.after(tabsHost);tabsHost.after(actionCenter);
    if(window.location.hash==='#pd-overview')window.history.replaceState(null,'',window.location.pathname+window.location.search+'#pd-sessions');
    var nav=window.DayODashboardTabs.mount(tabsHost,panels,'Partner Lounge sections');
    // Keep the original count binder and View All handler; expose just one count control.
    var bookingCount=document.getElementById('partner-upcoming-count'),countButton=document.createElement('button');
    countButton.type='button';countButton.className='pd-booking-count';bookingCount.before(countButton);countButton.append(bookingCount);
    bookingCount.hidden=true;var countLabel=document.createElement('span');countButton.append(countLabel);
    countButton.addEventListener('click',function(){var more=upcoming.querySelector('.partner-upcoming-more');if(more)more.click();});
    function syncCount(){var total=(bookingCount.textContent.match(/\d+/)||[])[0],more=upcoming.querySelector('.partner-upcoming-more'),ko=document.documentElement.lang==='ko';countButton.hidden=!bookingCount.textContent.trim();countButton.disabled=!more;countLabel.textContent=more?(ko?'전체 '+total+'건 보기 →':'View all '+total+' →'):bookingCount.textContent;}
    syncCount();new MutationObserver(syncCount).observe(bookingCount,{childList:true,characterData:true,subtree:true});
    var openAvailability=action('Open availability','가능 시간 열기',openWeeklyAvailability);upcoming.append(openAvailability);
    var sourceList=document.getElementById('partner-upcoming-list'),sourceEmpty=document.getElementById('partner-upcoming-empty');
    var prepTitle=document.getElementById('bookingPrepTitle');
    if(prepTitle)prepTitle.removeAttribute('data-i18n');
    // Relabel the existing clickable brief controls, leaving their handlers and entry timer intact.
    function syncBriefControls(){var ko=document.documentElement.lang==='ko';[sourceList,document.getElementById('partner-upcoming-all-list')].filter(Boolean).forEach(function(list){list.querySelectorAll('.partner-upcoming-prepare').forEach(function(button){var text=ko?'준비하기':'Prepare';if(button.textContent!==text)button.textContent=text;});});if(prepTitle)prepTitle.textContent=ko?'대화 정보':'Conversation Brief';syncCount();}
    new MutationObserver(syncBriefControls).observe(sourceList,{childList:true,subtree:true,characterData:true});
    var allBookings=document.getElementById('partner-upcoming-all-list');if(allBookings)new MutationObserver(syncBriefControls).observe(allBookings,{childList:true,subtree:true,characterData:true});
    syncBriefControls();
    function syncEmpty(){openAvailability.hidden=sourceEmpty.hidden;}
    syncEmpty();new MutationObserver(syncEmpty).observe(sourceEmpty,{attributes:true,attributeFilter:['hidden']});
    function syncEarnings(){
      var data=window.__dayoPartnerEarnings,ko=document.documentElement.lang==='ko';
      // Existing model has estimates, not a verified payment ledger.
      payValue.textContent=data&&Number.isFinite(data.pendingWon)?'₩'+data.pendingWon.toLocaleString():'—';
    }
    new MutationObserver(syncEarnings).observe(document.getElementById('statMonthCount'),{childList:true,characterData:true,subtree:true});syncEarnings();
    var detailsRun=0;
    async function showProfileDetails(){
      editDetails.hidden=true;
      var run=++detailsRun,ko=document.documentElement.lang==='ko';
      actionRow=undefined;actionProfile=undefined;openSlots=undefined;actionFailed=false;paintAction();
      profileInfo.querySelector('p').textContent=ko?'프로필 정보를 불러오는 중…':'Loading profile details…';completionValue.textContent=ko?'완료 상태를 불러오는 중…':'Loading completion status…';
      try {
        var client=window.supabaseClient;if(!client)throw new Error('unavailable');
        var session=await client.auth.getSession(),user=session.data.session&&session.data.session.user;
        if(!user)throw new Error('signed out');
        var roleResult=await client.from('profiles').select('role,bio,avatar_url').eq('id',user.id).maybeSingle();
        if(roleResult.error||!roleResult.data||roleResult.data.role!=='partner')throw new Error('not partner');
        if(run!==detailsRun)return;editDetails.hidden=false;editDetails.textContent=ko?'상세 정보 수정':'Edit details';actionProfile=roleResult.data;paintAction();
        if(pastPartnerId!==user.id){pastPartnerId=user.id;loadPast(user.id);}
        var result=await client.from('partner_profile_details').select('*').eq('partner_id',user.id).maybeSingle();
        if(run!==detailsRun)return;if(result.error)throw result.error;
        var row=result.data,complete=!!(row&&row.completed_at&&row.partner_guide_acknowledged_at&&row.location_status&&row.visa_type&&row.korean_level&&row.weekly_session_capacity&&row.native_languages&&row.native_languages.length&&row.session_languages&&row.session_languages.length);
        actionRow=row;paintAction();
        // Read actual dated available slots, not weekly templates or profile estimates.
        (async function(){try {
          var available=false;
          for(var offset=0;!available;offset+=500){
            var slots=await client.from('availability_slots').select('id,slot_time,status').eq('partner_id',user.id).eq('status','available').order('id',{ascending:true}).range(offset,offset+499);
            if(run!==detailsRun)return;if(slots.error)throw slots.error;
            available=overviewState.hasFutureSlot(slots.data||[],Date.now());
            if((slots.data||[]).length<500)break;
          }
          if(run===detailsRun){openSlots=available;paintAction();}
        }catch(_){if(run===detailsRun){openSlots=null;actionFailed=true;paintAction();}}})();
        completionValue.textContent=complete?(ko?'프로필 완료 · 가이드 확인':'Profile complete · Guide read'):(ko?'프로필 보완이 필요해요':'Complete your Partner Profile');
        var value=profileInfo.querySelector('p');value.textContent='';
        if(!row){value.textContent=ko?'프로필 보완에서 언어와 위치 정보를 입력해 주세요.':'Complete your profile to add languages and location.';return;}
        var fields=[['Native languages','모국어',(row.native_languages||[]).join(', ')],['Other languages','기타 언어',(row.other_languages||[]).map(function(x){return x.language+' · '+x.level;}).join(', ')],['Session languages','진행 언어',(row.session_languages||[]).join(', ')],['Location','위치',[row.country,row.city].filter(Boolean).join(' · ')||row.location_status],['Visa','비자',row.visa_type==='not_applicable_overseas'?'N/A · overseas':row.visa_type],['Korean level','한국어 수준',row.korean_level],['Rough weekly capacity','주당 예상 세션',row.weekly_session_capacity]];
        var topics=row.conversation_preferences && row.conversation_preferences.schema_version===1 ? row.conversation_preferences.interests : [];
        var conversation=window.DayOPartnerConversationProfile;
        if (topics && topics.length && conversation) {
          var chips=document.createElement('span');chips.className='pd-interest-chips';chips.setAttribute('aria-label',ko?'관심사':'Interests');
          topics.forEach(function(key){var item=conversation.catalog.interests.find(function(x){return x[0]===key;});var chip=document.createElement('span');chip.className='pd-interest-chip';chip.textContent=item?item[ko?1:2]:key;chips.append(chip);});value.append(chips);
        }
        fields.forEach(function(f){if(f[2]){var line=document.createElement('span');line.className='dashboard-detail-line';line.textContent=(ko?f[1]:f[0])+': '+f[2];value.append(line);}});
      }catch(_){if(run!==detailsRun)return;if(actionProfile===undefined){pastPartnerId=null;++pastRun;pastRows=[];paintPast();}actionFailed=true;paintAction();profileInfo.querySelector('p').textContent=ko?'프로필 정보를 불러오지 못했어요. 라운지 기능은 계속 이용할 수 있습니다.':'Profile details could not load. Lounge features remain available.';completionValue.textContent=ko?'프로필에서 상태 확인':'Check status in Profile';}
    }
    document.addEventListener('dayo:partner-detailschanged',showProfileDetails);
    document.addEventListener('dayo:availabilitychanged',showProfileDetails);
    showProfileDetails();document.addEventListener('dayo:partner-authorized',showProfileDetails);
    if(window.supabaseClient&&window.supabaseClient.auth.onAuthStateChange)window.supabaseClient.auth.onAuthStateChange(function(){setTimeout(showProfileDetails,0);});
    function placeCompletionBanner() {
      var banner=root.querySelector(':scope > .pcp-banner');if(banner)profilePanel.prepend(banner);
    }
    placeCompletionBanner();new MutationObserver(placeCompletionBanner).observe(root,{childList:true});
    new MutationObserver(function(records){if(records.some(function(r){return Array.from(r.removedNodes).some(function(n){return n.classList&&n.classList.contains('pcp-banner');});}))showProfileDetails();}).observe(profilePanel,{childList:true});
    // Keep the original now-empty wrappers for compatibility; no feature node is deleted.
    ['.partner-utility-row','.dashboard-grid'].forEach(function (selector) {var wrapper=root.querySelector(selector);if(wrapper)wrapper.hidden=true;});
    function localize() {
      var ko = document.documentElement.lang === 'ko';nav.setAttribute('aria-label',ko ? '파트너 라운지 섹션' : 'Partner Lounge sections');
      nextTitle.textContent=ko ? '다가오는 대화 일정' : 'Upcoming Schedule';
      resourceLink.textContent=ko ? resourceLink.dataset.ko : resourceLink.dataset.en;
      [statHeading].concat(labels).forEach(function (node) {node.textContent=ko ? node.dataset.ko : node.dataset.en;});
      syncEarnings();
      syncBriefControls();
      paintAction();
      if(pastPartnerId)paintPast();
    }
    localize();document.addEventListener('dayo:langchange',localize);
    document.addEventListener('dayo:langchange',showProfileDetails);
    // Re-read saved values after navigation or existing save handlers finish.
    nav.addEventListener('click',function(){if(!routingToSchedule)showProfileDetails();});
    ['partner-profile-save-btn','photo-save-btn'].forEach(function(id){var control=document.getElementById(id);if(control)new MutationObserver(function(){if(!control.disabled)showProfileDetails();}).observe(control,{attributes:true,attributeFilter:['disabled']});});
    var saveSchedule=document.getElementById('saveSchedule');
    if(saveSchedule)new MutationObserver(function(){if(!saveSchedule.disabled)showProfileDetails();}).observe(saveSchedule,{attributes:true,attributeFilter:['disabled']});
    resourceCards.querySelector('a[href="#pd-pay-rules"]').addEventListener('click',function(event){event.preventDefault();select('pd-resources');rules.scrollIntoView({block:'start'});});
    if(window.location.hash==='#pd-pay-rules'){select('pd-resources');rules.scrollIntoView({block:'start'});}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
