/* Waiting-room feature guide (owner request 2026-10-14).
 * Opaque spotlight cards explaining each control while the participant waits.
 * Presentation only: never clicks, toggles media, or changes session state. */
(function () {
  'use strict';
  var KEY = 'dayo_room_guide_seen_v1';
  function ko() { var l = window.DayOI18n && window.DayOI18n.getLang ? String(window.DayOI18n.getLang()) : (document.documentElement.lang || 'ko'); return l.toLowerCase() !== 'en'; }
  function partner() { return typeof window.isPartnerRoomMode === 'function' && window.isPartnerRoomMode(); }
  function steps() {
    var k = ko(), p = partner();
    return [
      ['#timer', k ? '⏳ 남은 시간' : '⏳ Time', k ? '시작 전에는 시작까지 남은 시간이, 대화가 시작되면 남은 대화 시간이 보여요.' : 'Shows the time until the start, then the time left in your conversation.'],
      ['#videoStage', k ? '🧑 상대방 화면' : '🧑 Partner view', k ? '상대방이 들어오면 여기에 영상이 보여요. 연결 중일 때는 잠시만 기다려 주세요.' : 'Your partner appears here once connected. Please wait a moment while connecting.'],
      ['#selfPip', k ? '🙂 내 화면' : '🙂 Your view', k ? '내 모습이에요. 누르면 상대방 화면과 크기를 바꿀 수 있어요.' : 'This is you. Tap to swap it with your partner’s view.'],
      ['#micBtn', k ? '🎤 마이크' : '🎤 Microphone', k ? '누르면 내 목소리를 켜거나 끌 수 있어요. 말한 내용은 대화 기록과 자막에 쓰여요.' : 'Turn your voice on or off. What you say is used for captions and your conversation record.'],
      ['#camBtn', k ? '📹 카메라' : '📹 Camera', k ? '누르면 내 영상을 켜거나 끌 수 있어요.' : 'Turn your video on or off.'],
      ['#wordHelpBtn', k ? '💡 말하기 도움' : '💡 Speaking help', k ? '말이 막힐 때 눌러 보세요. 대화에 쓸 단어를 추천하고, 하고 싶은 말을 한국어로 적으면 영어 표현을 찾아줘요.' : 'Stuck? Get suggested words, or type what you want to say to find a natural expression.'],
      ['#btn-talk-cards', k ? '🌐 대화카드' : '🌐 Talk cards', p ? (k ? '대화 주제 카드를 골라 상대방과 함께 이야기를 시작할 수 있어요.' : 'Pick a topic card to start a conversation together.') : (k ? '이야깃거리가 필요할 때 대화 주제 카드를 볼 수 있어요.' : 'Browse topic cards when you need something to talk about.')],
      ['#chatToggle', k ? '💬 채팅' : '💬 Chat', k ? '말로 하기 어려운 단어나 링크를 글로 주고받을 수 있어요.' : 'Send words or links in text when it is easier than saying them.'],
      ['#safetyReportBtn', k ? '▲ 비매너 신고' : '▲ Report', k ? '불편하거나 부적절한 행동이 있으면 눌러 주세요. DayO가 확인해요.' : 'Press this if something feels inappropriate. DayO will review it.'],
      ['#endBtn', k ? '🚪 세션 종료' : '🚪 End session', k ? '대화는 정해진 시간에 자동으로 시작되고 끝나요. 급한 일이 있을 때만 눌러 주세요. 중간에 종료하면 대화 리포트가 제대로 저장되지 않을 수 있어요.' : 'Your conversation starts and ends automatically. Only press this if something urgent comes up — ending early may stop your report from being saved properly.']
    ].map(function (s) { return { sel: s[0], title: s[1], body: s[2] }; }).filter(function (s) {
      var el = document.querySelector(s.sel); if (!el) return false; var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
    });
  }
  var root, spot, card, list = [], index = 0;
  function css() {
    if (document.getElementById('dayo-room-guide-style')) return;
    var st = document.createElement('style'); st.id = 'dayo-room-guide-style';
    st.textContent = '.rg-root{position:fixed;inset:0;z-index:2147483000;pointer-events:auto}' +
      '.rg-spot{position:fixed;border-radius:14px;box-shadow:0 0 0 9999px rgba(38,32,27,.68);outline:3px solid #FFFBF4;outline-offset:2px;transition:all .25s ease;pointer-events:none}' +
      '.rg-card{position:fixed;width:min(340px,calc(100vw - 32px));background:#FFFBF4;color:#4B4038;border-radius:18px;padding:18px 18px 14px;box-shadow:0 18px 40px rgba(0,0,0,.28);font-family:inherit;transition:top .25s ease,left .25s ease}' +
      '.rg-card h4{margin:0 0 6px;font-size:17px;color:#3e4a42}.rg-card p{margin:0;font-size:14px;line-height:1.6}' +
      '.rg-foot{display:flex;align-items:center;gap:8px;margin-top:14px}.rg-dots{display:flex;gap:4px;flex:1}.rg-dots i{width:6px;height:6px;border-radius:50%;background:#E2D7C6}.rg-dots i.on{background:#5F7D63;width:16px;border-radius:6px}' +
      '.rg-skip{background:none;border:0;color:#7e736b;font:inherit;font-size:13px;min-height:40px;padding:0 6px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}' +
      '.rg-next{background:#5F7D63;color:#fff;border:0;border-radius:12px;font:inherit;font-size:14px;font-weight:600;min-height:42px;padding:0 18px;cursor:pointer}' +
      '.rg-open{position:absolute;top:10px;right:10px;z-index:30;width:36px;height:36px;border-radius:50%;border:1px solid #E2D7C6;background:#FFFBF4;color:#5F7D63;font-weight:700;font-size:16px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.08)}';
    document.head.appendChild(st);
  }
  function place() {
    if (!root) return; var s = list[index], el = s && document.querySelector(s.sel); if (!el) return next();
    var r = el.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, pad = 6;
    var top = Math.max(4, r.top - pad), left = Math.max(4, r.left - pad), w = Math.min(vw - 8, r.width + pad * 2), h = Math.min(vh - 8, r.height + pad * 2);
    spot.style.cssText = 'top:' + top + 'px;left:' + left + 'px;width:' + w + 'px;height:' + h + 'px';
    var cw = card.offsetWidth, ch = card.offsetHeight, below = top + h + 12, above = top - ch - 12, ct;
    if (below + ch <= vh - 12) ct = below; else if (above >= 12) ct = above; else ct = Math.max(12, (vh - ch) / 2);
    var cl = Math.min(Math.max(16, r.left + r.width / 2 - cw / 2), vw - cw - 16);
    card.style.top = ct + 'px'; card.style.left = cl + 'px';
  }
  function render() {
    var s = list[index], k = ko(), last = index === list.length - 1;
    card.innerHTML = '<h4></h4><p></p><div class="rg-foot"><div class="rg-dots">' + list.map(function (_, i) { return '<i class="' + (i === index ? 'on' : '') + '"></i>'; }).join('') + '</div><button type="button" class="rg-skip"></button><button type="button" class="rg-next"></button></div>';
    card.querySelector('h4').textContent = s.title; card.querySelector('p').textContent = s.body;
    card.querySelector('.rg-skip').textContent = k ? '건너뛰기' : 'Skip';
    card.querySelector('.rg-next').textContent = last ? (k ? '시작하기' : 'Got it') : (k ? '다음' : 'Next');
    card.querySelector('.rg-skip').onclick = close; card.querySelector('.rg-next').onclick = next;
    card.querySelector('.rg-next').focus({ preventScroll: true });
    place();
  }
  function next() { index += 1; if (index >= list.length) return close(); render(); }
  function close() {
    try { localStorage.setItem(KEY, '1'); } catch (_) {}
    window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); document.removeEventListener('keydown', onKey);
    if (root) root.remove(); root = null;
  }
  function onKey(e) { if (e.key === 'Escape') close(); else if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); next(); } }
  function open() {
    if (root) return; list = steps(); if (!list.length) return; css(); index = 0;
    root = document.createElement('div'); root.className = 'rg-root'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', ko() ? '화면 사용 안내' : 'Screen guide');
    spot = document.createElement('div'); spot.className = 'rg-spot'; card = document.createElement('div'); card.className = 'rg-card';
    root.appendChild(spot); root.appendChild(card); document.body.appendChild(root);
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true); document.addEventListener('keydown', onKey);
    render();
  }
  function waiting() {
    var t = document.getElementById('timer'), c = document.getElementById('remoteConnectionState');
    return !!(t && /시작까지|--:--/.test(t.textContent || '')) || !!(c && !c.hidden);
  }
  function blocked() {
    if (window.__dayoPreflightActive || window.dayoSessionEnded || window.__dayoInAppBlocked) return true;
    var pf = document.getElementById('devicePreflight'); if (pf && !pf.hidden) return true;
    return !!document.querySelector('.modal-overlay.active, .sheet-overlay.active, .chat-panel.open');
  }
  function addOpenButton() {
    var stage = document.getElementById('videoStage'); if (!stage || document.getElementById('roomGuideOpen')) return;
    css(); var b = document.createElement('button'); b.type = 'button'; b.id = 'roomGuideOpen'; b.className = 'rg-open'; b.textContent = '?';
    b.setAttribute('aria-label', ko() ? '화면 사용 안내 보기' : 'Show screen guide'); b.title = b.getAttribute('aria-label');
    b.addEventListener('click', function (e) { e.stopPropagation(); open(); });
    if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative';
    stage.appendChild(b);
  }
  function boot(access) {
    if (!access || !access.allowed || access.observer || access.adminTest) return;
    addOpenButton();
    var seen = false; try { seen = localStorage.getItem(KEY) === '1'; } catch (_) {}
    if (seen) return;
    var tries = 0, timer = setInterval(function () {
      tries += 1; if (tries > 240) { clearInterval(timer); return; }
      if (blocked()) return;
      clearInterval(timer); if (waiting()) open();
    }, 1000);
  }
  window.DayORoomGuide = { open: open, close: close };
  function start() { if (window.DayORoomAccessReady && typeof window.DayORoomAccessReady.then === 'function') window.DayORoomAccessReady.then(boot, function () {}); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
