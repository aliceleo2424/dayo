/* Monthly UI uses concrete slots returned by the server; it never books a synthetic slot. */
(function(){
  'use strict';
  function mount(){
    var weekly=document.querySelector('.schedule-card'),rules=window.DayOAvailabilityCalendar;
    if(!weekly||!rules||weekly.dataset.monthlyMounted)return;
    weekly.dataset.monthlyMounted='true';
    var wrapper=document.createElement('section');wrapper.className='card monthly-availability';wrapper.id='partner-availability';wrapper.tabIndex=-1;
    weekly.before(wrapper);
    wrapper.innerHTML='<h2>Availability</h2><div class="ma-tabs" role="tablist" aria-label="Availability views"><button type="button" role="tab" id="ma-month-tab" aria-controls="ma-month" aria-selected="true">Monthly Calendar</button><button type="button" role="tab" id="ma-week-tab" aria-controls="ma-week" aria-selected="false">Weekly Template</button></div><section id="ma-month" role="tabpanel" aria-labelledby="ma-month-tab"><p class="ma-range"></p><p class="ma-hint">Manage your actual availability for the next 30 days.</p><button type="button" class="dashboard-action ma-apply">Use weekly template for next 30 days</button><p class="ma-hint">Existing date overrides are kept. Holidays do not close bookings.</p><div class="ma-layout"><div><div class="ma-month-head"><button type="button" class="ma-prev" aria-label="Previous month">‹</button><h3></h3><button type="button" class="ma-next" aria-label="Next month">›</button></div><div class="ma-calendar"></div></div><section class="ma-editor"><h3>Choose a date</h3><p class="ma-date-note"></p><div class="ma-modes"><button type="button" data-mode="default">Use weekly template</button><button type="button" data-mode="open">Open whole day</button><button type="button" data-mode="closed">Close this day</button></div><div class="ma-slots"></div><button type="button" class="dashboard-action ma-save" disabled>Save date availability</button></section></div><p class="ma-message" role="status"></p></section><section id="ma-week" role="tabpanel" aria-labelledby="ma-week-tab" hidden></section>';
    var weekPanel=wrapper.querySelector('#ma-week');weekPanel.append(weekly);
    var desc=weekly.querySelector('.card-subtitle');if(desc){desc.removeAttribute('data-i18n');desc.textContent='Set your usual recurring schedule.';}
    var data=null,selected=null,mode='default',custom=new Set(),busy=false,seq=0,dirty=false,owner=null;
    var w=rules.windowDates(),view=w.start.slice(0,7);
    var monthPanel=wrapper.querySelector('#ma-month'),message=wrapper.querySelector('.ma-message');
    function pickTab(id){var month=id==='month';monthPanel.hidden=!month;weekPanel.hidden=month;wrapper.querySelector('#ma-month-tab').setAttribute('aria-selected',String(month));wrapper.querySelector('#ma-week-tab').setAttribute('aria-selected',String(!month));}
    wrapper.querySelector('#ma-month-tab').onclick=function(){pickTab('month');};wrapper.querySelector('#ma-week-tab').onclick=function(){pickTab('week');};
    // UI adapter only. Weekly controls remain mounted with their original handlers.
    window.DayOPartnerMonthlyUI={open:function(){pickTab('month');wrapper.focus({preventScroll:true});wrapper.scrollIntoView({block:'start'});},reload:load};
    function isReserved(s){return s.status==='booked'||s.reserved===true;}
    function dayRows(date){return (data&&data.slots||[]).filter(function(s){var ms=rules.slotMs(s.slot_time);return isFinite(ms)&&rules.dateAt(ms)===date;});}
    function override(date){return (data&&data.overrides||[]).find(function(o){return o.date===date;});}
    function openTimes(date){return dayRows(date).filter(function(s){return s.status==='available'&&!isReserved(s)&&rules.slotMs(s.slot_time)>Date.now();}).map(function(s){return new Date(rules.slotMs(s.slot_time)+9*3600000).toISOString().slice(11,16);});}
    function weeklyTimes(date){var day=['sun','mon','tue','wed','thu','fri','sat'][new Date(date+'T00:00:00Z').getUTCDay()];return (data&&data.weekly||[]).filter(function(s){return s.dayId===day;}).map(function(s){return s.time;});}
    function calendar(){
      wrapper.querySelector('.ma-range').textContent='KST · '+w.start+' – '+w.end;
      wrapper.querySelector('.ma-month-head h3').textContent=new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(view+'-01T00:00:00Z'));
      wrapper.querySelector('.ma-prev').disabled=view<=w.start.slice(0,7)||busy;wrapper.querySelector('.ma-next').disabled=view>=w.end.slice(0,7)||busy;
      var grid=wrapper.querySelector('.ma-calendar');grid.replaceChildren();
      ['S','M','T','W','T','F','S'].forEach(function(day){var n=document.createElement('span');n.className='ma-dow';n.textContent=day;grid.append(n);});
      var first=new Date(view+'-01T00:00:00Z'),last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
      for(var i=0;i<first.getUTCDay();i++)grid.append(document.createElement('span'));
      for(var day=1;day<=last;day++){
        var date=view+'-'+String(day).padStart(2,'0'),o=override(date),rows=dayRows(date),booked=rows.filter(isReserved).length,opens=openTimes(date).length,holiday=rules.holiday(date,false);
        var b=document.createElement('button');b.type='button';b.dataset.date=date;b.className='ma-day'+(date===selected?' is-selected':'');b.disabled=!data||date<w.start||date>w.end||busy;b.setAttribute('aria-pressed',String(date===selected));
        b.setAttribute('aria-label',date+(holiday?' · '+holiday:'')+' · '+opens+' open · '+booked+' booked'+(o?' · '+o.mode:''));
        var number=document.createElement('strong');number.textContent=day;b.append(number);
        if(holiday){var h=document.createElement('span');h.className='ma-holiday';h.textContent='✦';h.title=holiday;h.setAttribute('aria-hidden','true');b.append(h);}
        var state=document.createElement('small');state.textContent=o&&o.mode==='closed'?'Closed':o&&o.mode==='custom'?'Custom':opens?'Available':'Closed';b.append(state);
        var count=document.createElement('small');count.textContent=booked?opens+' open · '+booked+' booked':opens+' open';b.append(count);grid.append(b);
      }
    }
    function choose(date){selected=date;var o=override(date);mode=o&&o.mode||'default';custom=new Set(mode==='custom'?o.custom_slots:mode==='closed'?[]:openTimes(date));dirty=false;calendar();editor();}
    function editor(){
      wrapper.querySelector('.ma-editor h3').textContent=selected||'Choose a date';
      var holiday=selected?rules.holiday(selected,false):'',reserved=selected?dayRows(selected).filter(isReserved).length:0;
      wrapper.querySelector('.ma-date-note').textContent=selected?(holiday?holiday+' · Public holiday · ':'')+'KST'+(reserved?' · '+reserved+' existing booking'+(reserved===1?'':'s')+' protected. Closing this day only closes unbooked times.':' · Existing bookings are always kept.'):'';
      wrapper.querySelectorAll('[data-mode]').forEach(function(b){b.disabled=!selected||!data||busy;b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});
      var grid=wrapper.querySelector('.ma-slots');grid.replaceChildren();
      if(selected)rules.times.forEach(function(time){var booked=dayRows(selected).some(function(s){return isReserved(s)&&new Date(rules.slotMs(s.slot_time)+9*3600000).toISOString().slice(11,16)===time;});
        var b=document.createElement('button');b.type='button';b.dataset.time=time;b.textContent=time+(booked?' · Booked':'');b.setAttribute('aria-pressed',String(mode!=='closed'&&custom.has(time)));b.disabled=busy||booked||Date.parse(selected+'T'+time+':00+09:00')<=Date.now();grid.append(b);
      });
      wrapper.querySelector('.ma-save').disabled=!selected||!dirty||busy||!data;wrapper.querySelector('.ma-apply').disabled=busy||!data;
    }
    async function call(name,args){var result=await window.supabaseClient.rpc(name,args||{});if(result.error)throw result.error;return result.data;}
    async function load(){var run=++seq;busy=true;message.textContent='Loading schedule…';calendar();editor();
      try{var next=await call('get_partner_monthly_schedule');if(run!==seq)return;data=next;w={start:next.start,end:next.end};if(view<w.start.slice(0,7)||view>w.end.slice(0,7))view=w.start.slice(0,7);message.textContent='';if(selected)choose(selected);}
      catch(error){if(run!==seq)return;data=null;message.textContent=rules.missingRPC(error)?'Monthly Calendar will be available after migration 084. Use Weekly Template for now.':'Could not load schedule. Please retry.';if(rules.missingRPC(error))pickTab('week');}
      finally{if(run===seq){busy=false;calendar();editor();}}
    }
    async function save(name,args){if(busy)return;busy=true;message.textContent='Saving…';calendar();editor();try{await call(name,args);dirty=false;await load();message.textContent='Availability saved.';document.dispatchEvent(new CustomEvent('dayo:availabilitychanged'));}catch(error){busy=false;message.textContent='Could not save: '+(error.message||'Please retry');calendar();editor();}}
    wrapper.querySelector('.ma-calendar').onclick=function(e){var b=e.target.closest('[data-date]');if(b&&!b.disabled&&!busy)choose(b.dataset.date);};
    wrapper.querySelector('.ma-prev').onclick=function(){var d=new Date(view+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);view=d.toISOString().slice(0,7);calendar();};
    wrapper.querySelector('.ma-next').onclick=function(){var d=new Date(view+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);view=d.toISOString().slice(0,7);calendar();};
    wrapper.querySelector('.ma-modes').onclick=function(e){var b=e.target.closest('[data-mode]');if(!b||b.disabled)return;mode=b.dataset.mode==='open'?'custom':b.dataset.mode;custom=new Set(mode==='closed'?[]:b.dataset.mode==='open'?rules.times:weeklyTimes(selected));dirty=true;editor();};
    wrapper.querySelector('.ma-slots').onclick=function(e){var b=e.target.closest('[data-time]');if(!b||b.disabled)return;if(mode==='closed')custom=new Set();mode='custom';custom.has(b.dataset.time)?custom.delete(b.dataset.time):custom.add(b.dataset.time);dirty=true;editor();};
    wrapper.querySelector('.ma-save').onclick=function(){save('save_partner_availability_override',{p_date:selected,p_mode:mode,p_custom_slots:mode==='custom'?Array.from(custom).sort():[]});};
    wrapper.querySelector('.ma-apply').onclick=function(){save('apply_partner_weekly_template');};
    document.addEventListener('dayo:availabilitychanged',function(){if(!busy)load();});
    function clearOwner(){++seq;owner=null;data=null;selected=null;busy=false;calendar();editor();}
    document.addEventListener('dayo:authchange',clearOwner);
    document.addEventListener('dayo:authprofile',function(event){var detail=event.detail||{},profile=detail.profile,user=detail.user;
      if(!profile||profile.role!=='partner'||!user){clearOwner();return;}
      if(owner!==user.id||!data){owner=user.id;load();}
    });
    load();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
