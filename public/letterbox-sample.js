/* 나의 작은 편지함 — 예시 편지 (logged-out visitors only). customer-navigation.js loads this on demand when a
 * logged-out visitor taps 편지함. Static copy + static image only: no Supabase reads, no customer data.
 * The sample is a DayO test-session letter chosen by the Owner (2026-10-20); the dog's name was changed on request. */
(function () {
  'use strict';
  var IMAGE = 'images/letter-sample.webp';
  var NAME = 'Jen';
  var BODY = 'Dear Alice,\n\nThank you for such a warm chat! It was wonderful talking with you today. Hearing about your morning walk with your dog Seri along the Han River in Mangwon sounded so peaceful. Stopping by that tiny bakery to buy a warm cinnamon roll right after the walk made me smile, as it sounds like such a lovely way to start the day. I hope you have a great time at the pottery class with your best friend this weekend. Next time we speak, I would love to hear all about how your pottery class went.\n\n— Jen';
  var FLAP_SEALED = 'M0 64 L85 100 L170 64 L170 30 L0 30 Z', FRONT_SEALED = 'M0 64 L0 164 L170 164 L170 64 L85 100 Z';
  var el = null, onLogin = null, lastFocus = null;

  function ko() { return !(window.DayOI18n && String(window.DayOI18n.getLang()).toUpperCase() === 'EN'); }
  function t(k, e) { return ko() ? k : e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function box() {
    el.innerHTML = '<div class="lb-sheet-card lb-sample-card"><span class="lb-grip" aria-hidden="true"></span>' +
      '<div class="lb-head"><h2 class="lb-title" id="lb-sample-title">' + t('나의 작은 편지함', 'My little letterbox') + '</h2>' +
      '<p class="lb-sub">' + t('<strong>예시 편지</strong>예요. 대화를 마치면 파트너의 편지가 이렇게 도착해요.', 'This is a <strong>sample letter</strong>. After each conversation, your partner’s letter arrives like this.') + '</p></div>' +
      '<ul class="lb-grid lb-grid--sample"><li><button type="button" class="lb-env is-unread" data-sample-letter style="--lb-front:#fbf3d7;--lb-flap:#f2e5c3;--lb-fold:#e2cf9f" aria-label="' +
      esc(t(NAME + '의 예시 편지 열기', 'Open the sample letter from ' + NAME)) + '">' +
      '<svg class="lb-env-back" viewBox="0 0 170 164" preserveAspectRatio="none" aria-hidden="true"><path d="' + FLAP_SEALED + '"></path></svg>' +
      '<svg class="lb-env-front" viewBox="0 0 170 164" preserveAspectRatio="none" aria-hidden="true"><path d="' + FRONT_SEALED + '"></path></svg>' +
      '<span class="lb-seal" aria-hidden="true">D</span><span class="lb-new lb-sample-tag">' + t('예시', 'Sample') + '</span>' +
      '<span class="lb-env-meta"><span class="lb-from">From ' + esc(NAME) + '</span></span></button></li></ul>' +
      '<p class="lb-hint">' + t('봉투를 누르면 편지가 열려요', 'Tap the envelope to open the letter') + '</p>' +
      '<div class="lb-actions"><button type="button" class="lb-record" data-sample-login>' + t('로그인하고 내 편지함 보기', 'Log in to see my letters') + '</button>' +
      '<button type="button" class="lb-close" data-sample-close>' + t('닫기', 'Close') + '</button></div></div>';
    el.setAttribute('aria-labelledby', 'lb-sample-title');
  }
  function letter() {
    el.innerHTML = '<div class="lb-sheet-card lb-sample-card"><span class="lb-grip" aria-hidden="true"></span>' +
      '<span class="lb-sample-badge">' + t('예시 편지', 'Sample letter') + '</span>' +
      '<img class="lb-image" src="' + IMAGE + '" alt="' + esc(t('대화에 나온 한강 산책과 강아지를 그린 그림', 'Drawing of a Han River walk with a dog, from the conversation')) + '">' +
      '<div class="lb-sheet-head"><h2 class="lb-sheet-title" id="lb-sample-title">From ' + esc(NAME) + '</h2></div>' +
      '<p class="lb-letter">' + esc(BODY) + '</p>' +
      '<p class="lb-sample-note">' + t('예시로 보여 드리는 편지예요. 내 편지는 대화를 마친 뒤 내 편지함에 도착해요.', 'This letter is a sample. Your own letters arrive in your letterbox after each conversation.') + '</p>' +
      '<div class="lb-actions"><a class="lb-record" href="/#booking" data-booking-open data-sample-close>' + t('첫 대화 예약하기', 'Book a first conversation') + '</a>' +
      '<button type="button" class="lb-close" data-sample-back>' + t('편지함으로', 'Back to letters') + '</button></div></div>';
  }

  function focusFirst() { var b = el.querySelector('[data-sample-letter], [data-sample-back]'); if (b) b.focus({ preventScroll: true }); var c = el.querySelector('.lb-sheet-card'); if (c) c.scrollTop = 0; }
  function sheet() {
    if (el) return el;
    el = document.createElement('div'); el.id = 'dayo-letter-sample'; el.className = 'lb-sheet lb-sample'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.addEventListener('click', function (e) {
      if (e.target === el) { close(); return; }
      if (e.target.closest('[data-sample-letter]')) { letter(); focusFirst(); return; }
      if (e.target.closest('[data-sample-back]')) { box(); focusFirst(); return; }
      if (e.target.closest('[data-sample-login]')) { close(true); if (onLogin) onLogin(); return; }
      if (e.target.closest('[data-sample-close]')) close(true);
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') { var f = el.querySelectorAll('button, a[href]'); if (!f.length) return; var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    });
    document.body.appendChild(el); return el;
  }
  function open(options) {
    onLogin = options && typeof options.login === 'function' ? options.login : null;
    lastFocus = document.activeElement;
    sheet(); box(); el.hidden = false; document.body.style.overflow = 'hidden'; focusFirst();
  }
  function close(keepFocus) {
    if (!el || el.hidden) return;
    el.hidden = true; document.body.style.overflow = '';
    if (keepFocus !== true && lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  document.addEventListener('dayo:langchange', function () { if (el && !el.hidden) { if (el.querySelector('[data-sample-back]')) letter(); else box(); focusFirst(); } });
  window.DayOLetterboxSample = { open: open, close: close };
})();
