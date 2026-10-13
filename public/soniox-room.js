/* Owner-consented family booking only. No master keys, audio recording or automatic paid retries. */
(function () {
  'use strict';
  var query = new URLSearchParams(location.search);
  var booking = query.get('bookingId') || '';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  // Browser booking is merely a request. The Preview server enforces an exact env allowlist,
  // both participant identities, active session time and one bounded allocation.
  if (!UUID.test(booking) || booking !== '2191fadf-ac84-4d9e-8102-d52ae0095683') return;
  var active = false, closing = false, attempted = false, starting = false, authorized = false, entered = false;
  var role = '', identity = '', scheduled = 0, maxSeconds = 0, run = 0, sequence = 0, pending = '';
  var ws, context, source, node, track, grantTimer, captureTimer, watchTimer, closeTimer, audioPreparation;
  var flushPromise, flushResolve, statusNode;
  function en() { return window.DayOI18n && String(window.DayOI18n.getLang()).toUpperCase() === 'EN'; }
  function message(english,korean) { return en() ? english : korean; }
  function status(english,korean) {
    var text = message(english,korean);
    if (statusNode) statusNode.textContent = text;
  }
  function access() { return window.DayORoomAccess || {}; }
  function localTrack() { var stream=window.localMediaStream||window.__localCamStream;return stream && stream.getAudioTracks().find(function(t){return t.readyState==='live';}); }
  function ownRole() { return access().role==='partner'?'partner':['user','learner'].includes(access().role)?'learner':''; }
  async function session() { var result=await window.supabaseClient.auth.getSession();return result && result.data && result.data.session; }
  async function request(action,auth) {
    var response=await fetch('/api/conversation-recap',{method:'POST',cache:'no-store',headers:{Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'},body:JSON.stringify({action:'soniox_'+action,booking_id:booking}),signal:AbortSignal.timeout(10000)});
    var body=await response.json();if(!response.ok){var error=new Error(body.error||'unavailable');error.consumed=body.allocationConsumed;throw error;}return body;
  }
  function prepareAudio() {
    if(audioPreparation)return audioPreparation;
    var Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio||!window.AudioWorkletNode)return Promise.reject(new Error('audio_worklet_unavailable'));
    context=new Audio();
    audioPreparation=Promise.all([context.resume(),context.audioWorklet.addModule('/soniox-pcm-worklet.js')]);
    return audioPreparation;
  }
  function publishFinal() {
    if(!pending.trim())return;
    var text=pending.trim();pending='';
    if(active && window.DayOLive)window.DayOLive.acceptSonioxFinal(text,++sequence);
  }
  function receive(data) {
    if(data.error_code){stop('Provider rejected capture / 제공자 연결 오류',true);return;}
    for(var token of Array.isArray(data.tokens)?data.tokens:[]){
      if(!token||token.is_final!==true||token.translation_status==='translation')continue;
      if(token.text==='<end>'||token.text==='<fin>'){publishFinal();continue;}
      if(typeof token.text!=='string'||/^<.*>$/.test(token.text))continue;
      pending+=token.text;if(pending.length>4000)publishFinal();
    }
    if(data.finished){publishFinal();finish();}
  }
  function detach() {
    clearTimeout(grantTimer);clearTimeout(captureTimer);clearInterval(watchTimer);
    if(node){node.port.onmessage=null;node.disconnect();}if(source)source.disconnect();
    if(context)context.close().catch(function(){});context=source=node=null;audioPreparation=null;
    // Never stop, clone, disable or replace the original WebRTC microphone track.
  }
  function finish() {
    clearTimeout(closeTimer);publishFinal();active=false;closing=false;starting=false;detach();
    if(ws)ws.close();
    if(window.DayOLive)window.DayOLive.setSonioxSource(false);
    if(flushResolve){var resolve=flushResolve;flushResolve=null;resolve();}
  }
  function stop(reason,immediate) {
    if(closing)return flushPromise||Promise.resolve();
    if(!active&&!starting){detach();return Promise.resolve();}
    closing=true;starting=false;detach();
    status(reason,'Soniox 종료 — 기존 브라우저 음성 인식으로 돌아갑니다.');
    flushPromise=new Promise(function(resolve){flushResolve=resolve;});
    if(!immediate&&ws&&ws.readyState===1){ws.send('');closeTimer=setTimeout(finish,2000);}else finish();
    return flushPromise;
  }
  async function start() {
    if(attempted||starting||active||!authorized||!entered||document.hidden||window.__dayoPreflightActive||window.dayoSessionEnded||Date.now()<scheduled)return;
    var local=localTrack();if(!local||!local.enabled||local.muted||!window.DayOLive)return;
    starting=true;attempted=true;var current=++run;
    try{
      await prepareAudio();if(context.state && context.state!=='running')throw new Error('audio_processing_unavailable');var auth=await session();
      if(!entered||!starting||current!==run||document.hidden||!auth||auth.user.id!==identity)throw new Error('entry_or_account_changed');
      var grant;
      attempted=true;grant=await request('start',auth);
      attempted=true;
      if(!starting||!entered||document.hidden||current!==run)throw new Error('capture_cancelled');
      if(grant.role!==role||grant.bookingId!==booking||grant.model!=='stt-rt-v5'||grant.singleUse!==true||!Number.isInteger(grant.maxSessionSeconds)||grant.maxSessionSeconds<1||grant.maxSessionSeconds>1500||Date.parse(grant.expires_at)<=Date.now()||grant.captureEndsAt<=Date.now())throw new Error('invalid_grant');
      track=local;ws=new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket',['soniox-api-key',grant.api_key]);grant.api_key='';var socket=ws;
      socket.onopen=function(){
        if(current!==run||!starting||!entered||document.hidden||localTrack()!==local||!context){finish();return;}
        socket.send(JSON.stringify({model:'stt-rt-v5',audio_format:'pcm_s16le',sample_rate:16000,num_channels:1,language_hints:['en','ko','es'],enable_language_identification:true,enable_endpoint_detection:true}));
        active=true;starting=false;window.DayOLive.setSonioxSource(true);
        source=context.createMediaStreamSource(new MediaStream([local]));node=new AudioWorkletNode(context,'dayo-pilot-pcm');source.connect(node);node.connect(context.destination);
        node.port.onmessage=function(event){if(!active||closing||socket.readyState!==1)return;if(socket.bufferedAmount>64000){stop('Network backpressure — no retry / 네트워크 지연',true);return;}socket.send(local.enabled&&!local.muted?event.data:new ArrayBuffer(event.data.byteLength));};
        clearTimeout(grantTimer);var stopAt=Math.min(grant.captureEndsAt,Date.now()+grant.maxSessionSeconds*1000);
        captureTimer=setTimeout(function(){stop('Soniox capture limit reached / Soniox 제한 시간 종료',false);},Math.max(0,stopAt-Date.now()));
        watchTimer=setInterval(async function(){
          if(!active||closing)return;
          var a=access();if(document.hidden||window.dayoSessionEnded||!a.allowed||a.bookingId!==booking||ownRole()!==role||localTrack()!==local){stop('Session or microphone ended / 세션 또는 마이크 종료',false);return;}
          try {var s=await session();if(!s||s.user.id!==identity){stop('Account changed / 계정 변경',true);return;}}catch(_){stop('Authentication unavailable / 인증 확인 실패',true);return;}
          var seconds=Math.max(0,Math.ceil((stopAt-Date.now())/1000));status('Soniox · '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'),'Soniox 음성 인식 · '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'));
        },1000);
        status('Soniox connecting','Soniox 연결 중');
      };
      socket.onmessage=function(event){if(current!==run||(!active&&!closing))return;try{var data=JSON.parse(event.data);if(!data.error_code&&(Array.isArray(data.tokens)||Number(data.total_audio_proc_ms)>0))status('Soniox active — captions and conversation record','Soniox 사용 중 — 자막과 대화 기록에 반영');receive(data);}catch(_){stop('Invalid provider response / 제공자 응답 오류',true);}};
      socket.onerror=function(){if(current===run)stop('Soniox connection failed — browser fallback / Soniox 연결 실패',true);};
      socket.onclose=function(){if(current===run&&(active||starting||closing)){status('Soniox disconnected — no paid retry','Soniox 연결 종료 — 자동 유료 재시도 없이 브라우저 사용');finish();}};
      grantTimer=setTimeout(function(){if(starting)stop('Soniox connection timeout / Soniox 연결 시간 초과',true);},10000);
    }catch(error){starting=false;detach();if(window.DayOLive)window.DayOLive.setSonioxSource(false);status('Soniox unavailable: '+(/^[a-z0-9_]+$/.test(error.message)?error.message:'capture_error')+' — Browser STT retained','Soniox를 사용할 수 없어 기존 브라우저 음성 인식을 유지합니다.');}
  }
  window.DayOSonioxRoom={isActive:function(){return active;},isAuthorized:function(){return authorized&&access().allowed&&access().bookingId===booking&&ownRole()===role;},flush:function(){return stop('Session finishing / 세션 마무리',false);}};
  window.DayORoomAccessReady.then(async function(a){
    if(!a.allowed||a.bookingId!==booking||a.adminTest||a.observer)return;
    role=ownRole();statusNode=document.getElementById('devicePreflightStt');
    // The owner confirms existing voice-processing consent for this family only.
    // Reuse normal microphone permission and room entry, without duplicate UI.
    var continueButton=document.getElementById('devicePreflightContinue');if(!continueButton)return;
    continueButton.addEventListener('click',function(){entered=true;prepareAudio().catch(function(){entered=false;status('Microphone processing unavailable — Browser STT retained','음성 처리 기능을 사용할 수 없어 브라우저 음성 인식을 유지합니다.');});});
    try {var auth=await session();if(!auth)throw new Error('sign_in_required');var state=await request('state',auth);if(state.role!==role||state.bookingId!==booking||state.model!=='stt-rt-v5'||state.maxSessionSeconds!==1500||state.canonical!==true)throw new Error('invalid_state');identity=auth.user.id;scheduled=Date.parse(state.scheduledAt);maxSeconds=state.maxSessionSeconds;authorized=Number.isFinite(scheduled)&&state.available===true;
      status(authorized?'Soniox ready':'Soniox session unavailable; Browser STT retained',authorized?'Soniox 준비 완료':'Soniox 세션을 확인할 수 없어 브라우저 음성 인식을 유지합니다.');
    }catch(_){status('Paid recognition unavailable — existing conversation remains available','유료 음성 인식을 확인할 수 없어 기존 대화 기능을 유지합니다.');}
    window.supabaseClient.auth.onAuthStateChange && window.supabaseClient.auth.onAuthStateChange(function(event,s){if(identity&&(!s||s.user.id!==identity)){authorized=false;entered=false;run++;stop('Account changed / 계정 변경',true);}});
    var beginTimer=setInterval(function(){if(attempted||window.dayoSessionEnded){clearInterval(beginTimer);return;}start();},500);
    document.addEventListener('visibilitychange',function(){if(document.hidden){run++;if(active||starting)stop('Backgrounded — paid capture stopped / 백그라운드 중지',true);}});
    window.addEventListener('pagehide',function(){run++;stop('Page closed / 페이지 종료',true);});
  });
})();
