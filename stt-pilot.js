(function () {
  'use strict';
  const $ = id => document.getElementById(id), frame = $('room');
  const bookingId = new URLSearchParams(location.search).get('bookingId');
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let active = false, starting = false, attempted = false, run = 0, role = '', userId = '', ws, context, node, source, track;
  let monitor, deadlineTimer, closeTimer, boundDocument, finalText = '', finalCount = 0, tokenCount = 0, began = 0, lastTokenEnd = 0;
  let browserHandler, trackEndedHandler, frameMediaHandler;
  let ready=false,readyUser='',checking=false,countdownTimer;
  function enableStart(){ $('start').disabled=attempted||active||starting||!ready||!$('consent').checked; }
  function remaining(ms){ const s=Math.max(0,Math.ceil(ms/1000));$('remaining').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0'); }
  async function checkReadiness(){
    if(checking||active||starting)return;
    checking=true;ready=false;readyUser='';enableStart();$('check').disabled=true;
    $('readiness').textContent='Checking readiness without allocating a credential / 자격 확인 중, 토큰 발급 없음';
    try{
      const client=frame.contentWindow.supabaseClient,s=client&&await client.auth.getSession(),auth=s?.data?.session;
      if(!auth?.access_token)throw new Error('sign_in_required');
      const response=await fetch('/api/stt-pilot-credentials',{method:'POST',cache:'no-store',headers:{Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'},body:JSON.stringify({action:'state'}),signal:AbortSignal.timeout(10000)});
      const state=await response.json();
      if(!response.ok)throw new Error(state.error||'readiness_unavailable');
      if(!['learner','partner'].includes(state.role)||state.model!=='stt-rt-v5'||state.singleUse!==true||state.startExpirySeconds!==60||state.maxSessionSeconds!==300)throw new Error('invalid_readiness');
      ready=state.available===true&&!attempted;readyUser=auth.user.id;
      $('readiness').textContent=ready?'Ready · '+state.role+' · 1 unused five-minute allocation / 준비 완료 · 본인 1회 테스트 가능':'Allocation already consumed — no restart / 테스트 기회 사용됨, 재시작 불가';
    }catch(e){$('readiness').textContent='Not ready: '+(/^[a-z0-9_]+$/.test(e.message)?e.message:'readiness_unavailable')+' / 로그인 또는 준비 상태를 확인하세요';}
    finally{checking=false;$('check').disabled=false;enableStart();}
  }
  function status(code) { $('status').textContent = code; }
  function append(target, text) {
    const row = document.createElement('p'); row.textContent = text; target.appendChild(row);
    while (target.children.length > 100) target.firstChild.remove(); target.scrollTop = target.scrollHeight;
  }
  function access() { try { return frame.contentWindow.DayORoomAccess; } catch (_) { return null; } }
  function localTrack() {
    const w = frame.contentWindow;
    const stream = w.localMediaStream || w.__localCamStream;
    return stream && stream.getAudioTracks().find(t => t.readyState === 'live');
  }
  function roleOf(a) { return a && a.role === 'partner' ? 'partner' : a && ['user', 'learner'].includes(a.role) ? 'learner' : ''; }
  function flushFinal() {
    if (!finalText.trim()) return;
    const latency = Math.max(0, Math.round(performance.now() - began - lastTokenEnd));
    append($('paid-output'), role + ': ' + finalText.trim() + ' · final latency ~' + latency + ' ms');
    finalCount++; $('metrics').textContent = finalCount + ' finalized fragments · ' + tokenCount + ' final tokens'; finalText = '';
  }
  function receive(message) {
    if (message.error_code) { stop('Provider error ' + Number(message.error_code) + ' — no automatic retry / 자동 재시도 없음', true); return; }
    for (const token of Array.isArray(message.tokens) ? message.tokens : []) {
      if (!token || !token.is_final || token.translation_status === 'translation') continue;
      if (token.text === '<end>' || token.text === '<fin>') { flushFinal(); continue; }
      if (typeof token.text !== 'string' || /^<.*>$/.test(token.text)) continue;
      finalText += token.text; tokenCount++;
      if (Number.isFinite(token.end_ms)) lastTokenEnd = token.end_ms;
      if (finalText.length > 4000) flushFinal();
    }
    if (message.finished) { flushFinal(); if (active || starting) stop('Comparison finished / 비교 종료', true); else if (ws) ws.close(); }
  }
  function detachCapture() {
    clearInterval(monitor); clearInterval(countdownTimer); clearTimeout(deadlineTimer);
    if (track && trackEndedHandler) track.removeEventListener('ended', trackEndedHandler);
    if (boundDocument && browserHandler) boundDocument.removeEventListener('dayo:transcript', browserHandler);
    if (boundDocument && frameMediaHandler) boundDocument.removeEventListener('dayo:livemedia', frameMediaHandler);
    if (node) { node.port.onmessage = null; node.disconnect(); }
    if (source) source.disconnect();
    if (context) context.close().catch(() => {});
    // Never stop/clone/change the room's original media track.
    context = source = node = track = null;
  }
  function stop(reason, immediate) {
    active = starting = false; detachCapture();
    $('stop').disabled = true; enableStart();
    status(reason);
    clearTimeout(closeTimer);
    if (ws && ws.readyState === 1 && !immediate) {
      ws.send(''); const closing = ws; closeTimer = setTimeout(() => { flushFinal(); closing.close(); }, 5000);
    } else { flushFinal(); if (ws) ws.close(); }
  }
  async function start() {
    if (!ready || attempted || active || starting || !$('consent').checked || (ws && ws.readyState < 2)) return;
    const a = access(), r = roleOf(a);
    if (!a || !a.allowed || a.bookingId !== bookingId || !r) { status('Enter the authorized room first / 승인된 대화방에 먼저 입장하세요'); return; }
    const local = localTrack();
    if (!local || !local.enabled || local.muted) { status('Local microphone unavailable or muted / 마이크를 확인하세요'); return; }
    const generation = ++run; starting = true; role = r;
    $('start').disabled = true; $('stop').disabled = false;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio || !window.AudioWorkletNode) throw new Error('AudioWorklet unavailable');
      const captureContext = new Audio(); context = captureContext; await captureContext.resume();
      if (generation !== run || !starting) return;
      await captureContext.audioWorklet.addModule('/stt-pilot-pcm-worklet.js');
      if (generation !== run || !starting) return;
      const client = frame.contentWindow.supabaseClient;
      const session = client && await client.auth.getSession();
      const auth = session && session.data && session.data.session;
      if (!auth || !auth.access_token) throw new Error('Sign in required');
      if(auth.user.id!==readyUser){ready=false;throw new Error('account_changed_check_readiness');}
      userId = auth.user.id;
      const response = await fetch('/api/stt-pilot-credentials', { method: 'POST', cache: 'no-store',
        headers: { Authorization: 'Bearer ' + auth.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, consent: true }), signal: AbortSignal.timeout(10000) });
      const grant = await response.json();
      if (generation !== run || !starting) return;
      if (!response.ok) { if (grant.allocationConsumed === true || grant.allocationConsumed === null) attempted = true; throw new Error(String(grant.error || 'Pilot unavailable')); }
      if (grant.bookingId !== bookingId || grant.role !== role || grant.model !== 'stt-rt-v5' ||
          Date.now() >= Date.parse(grant.expires_at) || (!Number.isFinite(grant.maxSessionSeconds) || grant.maxSessionSeconds <= 0 || grant.maxSessionSeconds > 300) ||
          !Number.isFinite(grant.captureEndsAt) || grant.captureEndsAt <= Date.now()) throw new Error('Invalid authorization');
      track = local; began = performance.now(); finalText = ''; finalCount = tokenCount = lastTokenEnd = 0;
      $('paid-output').textContent = ''; $('browser-output').textContent = '';
      boundDocument = frame.contentDocument;
      browserHandler = event => { if (active && event.detail && event.detail.speaker === role && typeof event.detail.text === 'string')
        append($('browser-output'), role + ': ' + event.detail.text); };
      boundDocument.addEventListener('dayo:transcript', browserHandler);
      trackEndedHandler = () => stop('Microphone ended — pilot stopped / 마이크 종료', true);
      track.addEventListener('ended', trackEndedHandler);
      frameMediaHandler = event => { if (active && event.detail && !event.detail.micOn) status('Mic muted; silent PCM only / 마이크 음소거'); };
      boundDocument.addEventListener('dayo:livemedia', frameMediaHandler);
      attempted = true;
      ws = new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket', ['soniox-api-key', grant.api_key]);
      grant.api_key = ''; // Credential not retained in UI or storage.
      const socket = ws;
      socket.onopen = () => {
        if (generation !== run || !starting || !context || local !== localTrack() || !local.enabled || local.muted) { socket.close(); return; }
        socket.send(JSON.stringify({ model: 'stt-rt-v5', audio_format: 'pcm_s16le', sample_rate: 16000,
          num_channels: 1, language_hints: ['en', 'ko', 'es'], enable_language_identification: true, enable_endpoint_detection: true }));
        clearTimeout(deadlineTimer); began = performance.now();
        node = new AudioWorkletNode(context, 'dayo-pilot-pcm');
        source = context.createMediaStreamSource(new MediaStream([local])); source.connect(node); node.connect(context.destination);
        node.port.onmessage = event => {
          if (!active || generation !== run || socket.readyState !== 1) return;
          if (socket.bufferedAmount > 64000) { stop('Network backpressure — pilot stopped / 네트워크 지연', true); return; }
          socket.send(local.enabled && !local.muted ? event.data : new ArrayBuffer(event.data.byteLength));
        };
        active = true; starting = false; status('Streaming ' + role + ' local mic · maximum 5 minutes / 본인 마이크 비교 중');
        const stopAt=Math.min(grant.captureEndsAt,Date.now()+grant.maxSessionSeconds*1000);
        remaining(stopAt-Date.now());countdownTimer=setInterval(()=>remaining(stopAt-Date.now()),250);
        deadlineTimer = setTimeout(() => {remaining(0);stop('Capture limit reached / 제한 시간 종료', false);},Math.max(0,stopAt-Date.now()));
        monitor = setInterval(async () => {
          const current = access();
          if (!current || !current.allowed || current.bookingId !== bookingId || roleOf(current) !== role ||
              frame.contentWindow.dayoSessionEnded || local !== localTrack()) return stop('Room or microphone changed / 대화방 또는 마이크 변경', true);
          try { const latest = await client.auth.getSession();
            if (generation === run && active && (!latest.data.session || latest.data.session.user.id !== userId)) stop('Account changed / 계정 변경', true);
          } catch (_) { if (generation === run && active) stop('Authentication check failed / 인증 확인 실패', true); }
        }, 1000);
      };
      socket.onmessage = event => { if (generation === run) { try { receive(JSON.parse(event.data)); } catch (_) { stop('Invalid provider response', true); } } };
      socket.onerror = () => { if (generation === run) stop('Network/authentication failure — no automatic retry / 연결 실패', true); };
      socket.onclose = () => { if (generation === run && (active || starting)) stop('Disconnected — no automatic paid retry / 연결 종료', true); };
      deadlineTimer = setTimeout(() => { if (starting) stop('Connection timed out / 연결 시간 초과', true); }, 10000);
    } catch (error) {
      if (generation === run) stop('Pilot unavailable: ' + (/^[a-z_]+$/.test(error.message) ? error.message : 'mic_auth_or_connection_error') + ' / 기존 대화는 그대로 이용하세요', true);
    }
  }
  $('consent').addEventListener('change', () => { enableStart();
    if (!$('consent').checked && (active || starting)) { run++; stop('Consent withdrawn / 동의 철회', true); } });
  $('check').addEventListener('click',checkReadiness);
  window.addEventListener('storage',checkReadiness);
  $('start').addEventListener('click', start);
  $('stop').addEventListener('click', () => { if (starting) run++; stop('Stopped / 중지', false); });
  frame.addEventListener('load', () => { if (active || starting) { run++; stop('Room reloaded / 대화방 새로고침', true); } checkReadiness(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && (active || starting)) { run++; stop('Backgrounded — paid stream stopped / 백그라운드 중지', true); } });
  window.addEventListener('pagehide', () => { run++; stop('Page closed', true); });
  if (UUID.test(bookingId || '')) frame.src = '/room?bookingId=' + encodeURIComponent(bookingId);
  else status('Missing authorized bookingId / 승인된 예약 ID가 필요해요');
})();
