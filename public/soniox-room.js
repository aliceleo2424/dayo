/* Authenticated booking participants only. No master keys or audio recording.
   Owner-approved reconnection: at most 3 credentials per participant per booking (server-enforced). */
(function () {
  'use strict';
  var query = new URLSearchParams(location.search);
  var booking = query.get('bookingId') || '';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  // Browser booking is merely a request. The server verifies actual booking participants,
  // active session time and the existing bounded allocation.
  if (!UUID.test(booking)) return;
  var active = false, closing = false, attempted = false, starting = false, authorized = false, entered = false;
  var role = '', identity = '', scheduled = 0, maxSeconds = 0, run = 0, sequence = 0, pending = '';
  var ws, context, source, node, track, grantTimer, captureTimer, watchTimer, closeTimer, audioPreparation;
  var flushPromise, flushResolve, statusNode;
  var paused=false,keepaliveTimer,stopAt=0;
  var MAX_STARTS=3,starts=0,retryAt=0,exhausted=false,noRetry=false,reservationId='',lastToken='',reported=true;
  var previewSequence=0, diagnostics={audioFrames:0,audioBytes:0,silentFrames:0,nonSilentFrames:0,lastAudioAt:0,messages:0,finalTokens:0,interimTokens:0,finals:0,previews:0,lastMessageAt:0,koreanTokens:0,koreanFinalTokens:0,languages:{en:0,ko:0,es:0},stopCode:null,micRebindings:0};
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
  // Content-free stop report (stop code + counters only) so a failed session can be diagnosed afterwards.
  function sendReport() {
    if(reported||!reservationId||!lastToken)return;reported=true;
    try{fetch('/api/conversation-recap',{method:'POST',keepalive:true,cache:'no-store',headers:{Authorization:'Bearer '+lastToken,'Content-Type':'application/json'},body:JSON.stringify({action:'soniox_report',booking_id:booking,reservationId:reservationId,stopCode:/^[a-z0-9_]{1,80}$/.test(diagnostics.stopCode||'')?diagnostics.stopCode:'unknown',audioFrames:diagnostics.audioFrames,nonSilentFrames:diagnostics.nonSilentFrames,finals:diagnostics.finals})}).catch(function(){});}catch(_){}
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
    if(active && window.DayOLive){var accepted=window.DayOLive.acceptSonioxFinal(text,++sequence);if(accepted)diagnostics.finals++;}
  }
  function receive(data) {
    if(data.error_code){stop('Provider rejected capture / 제공자 연결 오류',true);return;}
    diagnostics.messages++;diagnostics.lastMessageAt=Date.now();var interim='';
    for(var token of Array.isArray(data.tokens)?data.tokens:[]){
      if(!token||token.translation_status==='translation'||typeof token.text!=='string')continue;
      if(/[가-힣]/.test(token.text)){diagnostics.koreanTokens++;if(token.is_final===true)diagnostics.koreanFinalTokens++;}
      if(Object.prototype.hasOwnProperty.call(diagnostics.languages,token.language))diagnostics.languages[token.language]++;
      if(token.is_final!==true){if(!/^<.*>$/.test(token.text)){interim+=token.text;diagnostics.interimTokens++;}continue;}
      diagnostics.finalTokens++;
      if(token.text==='<end>'||token.text==='<fin>'){publishFinal();interim='';continue;}
      if(typeof token.text!=='string'||/^<.*>$/.test(token.text))continue;
      pending+=token.text;if(pending.length>4000)publishFinal();
    }
    var preview=(pending+interim).trim();
    if(active && !closing && preview && role==='partner'){
      diagnostics.previews++;
      document.dispatchEvent(new CustomEvent('dayo:caption-preview',{detail:{speaker:'partner',id:'soniox-preview-'+run+'-'+(++previewSequence),text:preview.slice(-400),timestamp:new Date()}}));
    }
    if(data.finished){publishFinal();finish();}
  }
  function detach() {
    clearTimeout(grantTimer);clearTimeout(captureTimer);clearInterval(watchTimer);clearInterval(keepaliveTimer);
    if(node){node.port.onmessage=null;node.disconnect();}if(source)source.disconnect();
    // Keep the gesture-unlocked AudioContext for a reconnect; mobile browsers block a new one without a tap.
    if(context&&(noRetry||window.dayoSessionEnded||exhausted)){context.close().catch(function(){});context=null;audioPreparation=null;}
    source=node=null;
    // Never stop, clone, disable or replace the original WebRTC microphone track.
  }
  function finish() {
    clearTimeout(closeTimer);publishFinal();active=false;closing=false;starting=false;detach();
    if(ws)ws.close();
    if(window.DayOLive)window.DayOLive.setSonioxSource(false);
    sendReport();
    // Unexpected drop (network, provider, mic swap, backgrounding): reconnect with a new bounded credential.
    if(!noRetry&&!window.dayoSessionEnded&&starts<MAX_STARTS)retryAt=Date.now()+1500;
    if(flushResolve){var resolve=flushResolve;flushResolve=null;resolve();}
  }
  function stop(reason,immediate) {
    if(closing)return flushPromise||Promise.resolve();
    if(!active&&!starting){detach();return Promise.resolve();}
    diagnostics.stopCode=String(reason||'session_stop').split(' / ')[0].toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,80);
    noRetry=/^(session_finishing|page_closed|account_changed|soniox_capture_limit_reached)$/.test(diagnostics.stopCode);
    closing=true;starting=false;paused=false;detach();
    status(reason,'Soniox 종료 — 기존 브라우저 음성 인식으로 돌아갑니다.');
    flushPromise=new Promise(function(resolve){flushResolve=resolve;});
    if(!immediate&&ws&&ws.readyState===1){ws.send('');closeTimer=setTimeout(finish,2000);}else finish();
    return flushPromise;
  }
  async function start() {
    if(exhausted||starts>=MAX_STARTS||starting||active||closing||!authorized||!entered||document.hidden||window.__dayoPreflightActive||window.dayoSessionEnded||Date.now()<scheduled||Date.now()<retryAt)return;
    var a=access();if(!a.allowed||a.bookingId!==booking||ownRole()!==role)return;
    var local=localTrack();if(!local||!local.enabled||local.muted||!window.DayOLive)return;
    starting=true;attempted=true;noRetry=false;var current=++run;
    try{
      await prepareAudio();if(context.state && context.state!=='running')await context.resume().catch(function(){});if(context.state && context.state!=='running')throw new Error('audio_processing_unavailable');var auth=await session();
      if(!entered||!starting||current!==run||document.hidden||!auth||auth.user.id!==identity)throw new Error('entry_or_account_changed');
      var grant;
      starts++;grant=await request('start',auth);
      reservationId=typeof grant.reservationId==='string'?grant.reservationId:'';lastToken=auth.access_token;reported=false;
      if(!starting||!entered||document.hidden||current!==run)throw new Error('capture_cancelled');
      if(grant.role!==role||grant.bookingId!==booking||grant.model!=='stt-rt-v5'||grant.singleUse!==true||!Number.isInteger(grant.maxSessionSeconds)||grant.maxSessionSeconds<1||grant.maxSessionSeconds>1500||Date.parse(grant.expires_at)<=Date.now()||grant.captureEndsAt<=Date.now())throw new Error('invalid_grant');
      track=local;ws=new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket',['soniox-api-key',grant.api_key]);grant.api_key='';var socket=ws;
      socket.onopen=function(){
        if(current!==run||!starting||!entered||document.hidden||localTrack()!==local||!context){finish();return;}
        socket.send(JSON.stringify({model:'stt-rt-v5',audio_format:'pcm_s16le',sample_rate:16000,num_channels:1,language_hints:['en','ko','es'],enable_language_identification:true,enable_endpoint_detection:true,max_endpoint_delay_ms:1000}));
        active=true;starting=false;diagnostics.stopCode=null;window.DayOLive.setSonioxSource(true);
        source=context.createMediaStreamSource(new MediaStream([local]));node=new AudioWorkletNode(context,'dayo-pilot-pcm');source.connect(node);node.connect(context.destination);
        node.port.onmessage=function(event){if(!active||closing||paused||document.hidden||socket.readyState!==1)return;if(socket.bufferedAmount>64000){stop('Network backpressure / 네트워크 지연',true);return;}var chunk=local.enabled&&!local.muted?event.data:new ArrayBuffer(event.data.byteLength);var samples=new Int16Array(chunk),energy=0;for(var i=0;i<samples.length;i++)energy+=samples[i]*samples[i];if(samples.length&&Math.sqrt(energy/samples.length)>64)diagnostics.nonSilentFrames++;else diagnostics.silentFrames++;socket.send(chunk);diagnostics.lastAudioAt=Date.now();diagnostics.audioFrames++;diagnostics.audioBytes+=chunk.byteLength;};
        clearTimeout(grantTimer);stopAt=Math.min(grant.captureEndsAt,Date.now()+grant.maxSessionSeconds*1000);
        captureTimer=setTimeout(function(){stop('Soniox capture limit reached / Soniox 제한 시간 종료',false);},Math.max(0,stopAt-Date.now()));
        watchTimer=setInterval(async function(){
          if(!active||closing)return;
          var replacement=localTrack(),a=access();if(window.dayoSessionEnded||!a.allowed||a.bookingId!==booking||ownRole()!==role||!replacement){stop('Session or microphone ended / 세션 또는 마이크 종료',false);return;}
          try {var s=await session();if(!s||s.user.id!==identity){stop('Account changed / 계정 변경',true);return;}}catch(_){stop('Authentication unavailable / 인증 확인 실패',true);return;}
          if(!active||closing)return;
          if(replacement!==local && context && node){source.disconnect();local=replacement;track=local;source=context.createMediaStreamSource(new MediaStream([local]));source.connect(node);diagnostics.micRebindings++;}
          if(Date.now()>=stopAt){stop('Soniox capture limit reached / Soniox 제한 시간 종료',false);return;}
          if(!document.hidden && context && context.state!=='running')recoverAudio();
          var seconds=Math.max(0,Math.ceil((stopAt-Date.now())/1000));status('Soniox · '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'),'Soniox 음성 인식 · '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'));
        },1000);
        keepaliveTimer=setInterval(function(){if(active&&!closing&&socket.readyState===1&&(paused||context&&context.state!=='running'))socket.send(JSON.stringify({type:'keepalive'}));},5000);
        status('Soniox connecting','Soniox 연결 중');
      };
      socket.onmessage=function(event){if(current!==run||(!active&&!closing))return;try{var data=JSON.parse(event.data);if(!data.error_code&&(Array.isArray(data.tokens)||Number(data.total_audio_proc_ms)>0))status('Soniox active — captions and conversation record','Soniox 사용 중 — 자막과 대화 기록에 반영');receive(data);}catch(_){stop('Invalid provider response / 제공자 응답 오류',true);}};
      socket.onerror=function(){if(current===run)stop('Soniox connection failed — browser fallback / Soniox 연결 실패',true);};
      socket.onclose=function(event){diagnostics.stopCode=diagnostics.stopCode||'socket_closed_'+(event&&event.code||0);if(current===run&&(active||starting||closing)){status('Soniox disconnected — reconnecting if available','Soniox 연결 끊김 — 가능하면 자동 재연결합니다');finish();}};
      grantTimer=setTimeout(function(){if(starting)stop('Soniox connection timeout / Soniox 연결 시간 초과',true);},10000);
    }catch(error){starting=false;detach();if(error.consumed===false)starts=Math.max(0,starts-1);if(/^(session_allocation_used|project_budget_exhausted|session_not_active|not_booking_participant)$/.test(error.message))exhausted=true;retryAt=Date.now()+5000;if(window.DayOLive)window.DayOLive.setSonioxSource(false);status('Soniox unavailable: '+(/^[a-z0-9_]+$/.test(error.message)?error.message:'capture_error')+' — Browser STT retained','Soniox를 사용할 수 없어 기존 브라우저 음성 인식을 유지합니다.');}
  }
  function recoverAudio(){
    if(!active&&!closing&&!document.hidden&&context&&context.state!=='running'){context.resume().catch(function(){});return;}
    if(!active||closing||document.hidden||!context)return;
    if(Date.now()>=stopAt){stop('Soniox capture limit reached / Soniox 제한 시간 종료',false);return;}
    var current=context;
    if(current.state==='running'){paused=false;return;}
    current.resume().then(function(){if(context===current&&active&&!closing&&!document.hidden)paused=current.state!=='running';}).catch(function(){status('Soniox audio suspended — microphone processing unavailable','Soniox 오디오 중단 — 마이크 처리를 확인해 주세요.');});
  }
  window.DayOSonioxRoom={isActive:function(){return active;},snapshot:function(){return {socketState:ws?ws.readyState:null,active:active,closing:closing,paused:paused,audioContextState:context?context.state:null,inputSampleRate:context?context.sampleRate:null,outputSampleRate:16000,numChannels:1,audioFormat:'pcm_s16le',koreanTokens:diagnostics.koreanTokens,koreanFinalTokens:diagnostics.koreanFinalTokens,tokenLanguages:Object.assign({},diagnostics.languages),stopCode:diagnostics.stopCode,starts:starts,maxStarts:MAX_STARTS,exhausted:exhausted,microphoneRebindings:diagnostics.micRebindings,audioFramesSent:diagnostics.audioFrames,audioBytesSent:diagnostics.audioBytes,silentFramesSent:diagnostics.silentFrames,nonSilentFramesSent:diagnostics.nonSilentFrames,lastAudioAgeMs:diagnostics.lastAudioAt?Date.now()-diagnostics.lastAudioAt:null,messages:diagnostics.messages,finalTokens:diagnostics.finalTokens,interimTokens:diagnostics.interimTokens,acceptedFinals:diagnostics.finals,captionPreviews:diagnostics.previews,pendingFinalChars:pending.length,lastMessageAgeMs:diagnostics.lastMessageAt?Date.now()-diagnostics.lastMessageAt:null};},isAuthorized:function(){return authorized&&access().allowed&&access().bookingId===booking&&ownRole()===role;},flush:function(){return stop('Session finishing / 세션 마무리',false);}};
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
    var beginTimer=setInterval(function(){if(exhausted||window.dayoSessionEnded){clearInterval(beginTimer);return;}start();},500);
    document.addEventListener('visibilitychange',function(){
      if(document.hidden){
        if(active&&!closing){paused=true;if(ws&&ws.readyState===1){ws.send(JSON.stringify({type:'finalize'}));ws.send(JSON.stringify({type:'keepalive'}));}if(context&&context.state==='running')context.suspend().catch(function(){});}
        else if(starting){run++;stop('Backgrounded before capture / 연결 전 백그라운드',true);}
      }else recoverAudio();
    });
    document.addEventListener('pointerdown',recoverAudio,{passive:true});
    window.addEventListener('pagehide',function(){run++;stop('Page closed / 페이지 종료',true);});
  });
})();
