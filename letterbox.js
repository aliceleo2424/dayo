/* 나의 작은 편지함: My Page "letters" view (header 편지함). Envelope per received Partner Letter.
 * Reads only reports already loaded by supabase-client.js (dayo:reportsloaded); approved keepsakes are read
 * through the existing DayOUserConversationReport.refreshKeepsakeImage path. Read state is a per-device
 * convenience (localStorage), never the source of truth. */
(function () {
  'use strict';
  var DEFAULT_IMAGE = 'images/keepsake-default.webp';
  var LETTER_HASHES = ['#letters', '#talkArchiveTitle'];
  var PAPERS = ['#f3e3c3', '#e6eddc', '#f4ddd0', '#dde6ee', '#f6ecd4', '#ebe0ea', '#e3ead9'];
  var UNREAD_DAYS = 14;
  var letters = [], images = {}, lastFocus = null, renderRun = 0, loaded = false;

  function ko() { return !(window.DayOI18n && String(window.DayOI18n.getLang()).toUpperCase() === 'EN'); }
  function t(k, e) { return ko() ? k : e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function root() { return document.getElementById('dayo-letterbox'); }
  function isLettersView() { return LETTER_HASHES.indexOf(location.hash) !== -1; }

  function readSet() { try { return new Set(JSON.parse(localStorage.getItem('dayo_letters_read') || '[]')); } catch (_) { return new Set(); } }
  function markRead(id) { var s = readSet(); s.add(id); try { localStorage.setItem('dayo_letters_read', JSON.stringify(Array.from(s).slice(-200))); } catch (_) {} }

  function letterDate(r) { var raw = (r.bookings && r.bookings.scheduled_at) || r.scheduled_at || r.created_at; var d = raw ? new Date(raw) : null; return d && !isNaN(d) ? d : null; }
  function shortDate(d) { return d ? String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0') : ''; }
  function longDate(d) { return !d ? '' : ko() ? d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일' : d.toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' }); }

  function collect(reports) {
    var read = readSet(), now = Date.now();
    return (Array.isArray(reports) ? reports : []).map(function (r, index) {
      var body = String(r && r.partner_comment || '').replace(/\r\n?/g, '\n').trim();
      if (!body) return null;
      var d = letterDate(r), id = String(r.booking_id || r.id || index);
      return { report: r, index: index, id: id, body: body, date: d, name: String(r.partner_name || 'DayO Partner'),
        unread: !read.has(id) && !!d && now - d.getTime() < UNREAD_DAYS * 864e5 };
    }).filter(Boolean).sort(function (a, b) { return (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0); });
  }

  function render() {
    var host = root(); if (!host) return;
    if (!loaded) { host.innerHTML = '<div class="lb"><div class="lb-head"><h1 class="lb-title">' + t('나의 작은 편지함', 'My little letterbox') + '</h1><p class="lb-sub" role="status">' + t('편지를 불러오고 있어요…', 'Loading your letters…') + '</p></div></div>'; return; }
    var unread = letters.filter(function (l) { return l.unread; }).length;
    var head = '<div class="lb-head"><h1 class="lb-title">' + t('나의 작은 편지함', 'My little letterbox') + '</h1><p class="lb-sub">' +
      (letters.length ? t('받은 편지 <strong>' + letters.length + '통</strong>', '<strong>' + letters.length + '</strong> letters received') +
        (unread ? ' · ' + t('아직 열지 않은 편지 <strong class="lb-unread-count">' + unread + '통</strong>', '<strong class="lb-unread-count">' + unread + '</strong> unopened') : '')
        : t('대화를 마치면 파트너의 편지가 이곳에 도착해요.', 'Letters from your partners arrive here after each conversation.')) + '</p></div>';
    if (!letters.length) {
      host.innerHTML = '<div class="lb">' + head + '<div class="lb-empty">' + t('아직 받은 편지가 없어요.<br>첫 대화를 마치면 파트너가 오늘 이야기를 담아 편지를 보내요.', 'No letters yet.<br>After your first conversation, your partner writes you a letter about it.') +
        '<br><a href="/">' + t('대화 예약하러 가기', 'Book a conversation') + '</a></div></div>';
      return;
    }
    host.innerHTML = '<div class="lb">' + head + '<ul class="lb-grid">' + letters.map(function (l, i) {
      return '<li><button type="button" class="lb-env' + (l.unread ? ' is-unread' : '') + '" data-letter="' + i + '" style="--lb-paper:' + PAPERS[i % PAPERS.length] + '" aria-label="' +
        esc(t(l.name + '의 편지, ' + longDate(l.date) + (l.unread ? ', 읽지 않음' : ''), 'Letter from ' + l.name + ', ' + longDate(l.date) + (l.unread ? ', unopened' : ''))) + '">' +
        '<span class="lb-fold lb-fold--left"></span><span class="lb-fold lb-fold--right"></span><span class="lb-fold lb-fold--bottom"></span><span class="lb-fold lb-fold--flap"></span>' +
        (l.unread ? '<span class="lb-seal" aria-hidden="true">D</span>' : '') +
        '<img class="lb-stamp" alt="" src="' + esc(images[l.id] || DEFAULT_IMAGE) + '" data-stamp="' + esc(l.id) + '">' +
        '<span class="lb-env-meta"><span class="lb-from">From ' + esc(l.name) + '</span><span class="lb-date">' + shortDate(l.date) + '</span></span></button></li>';
    }).join('') + '</ul><p class="lb-hint">' + t('봉투를 누르면 편지가 열려요', 'Tap an envelope to open the letter') + '</p></div>';
  }

  // Approved keepsakes only; everything else keeps the DayO default illustration.
  async function loadImages(run) {
    var api = window.DayOUserConversationReport, db = window.supabaseClient;
    if (!api || typeof api.refreshKeepsakeImage !== 'function' || !db) return;
    for (var i = 0; i < letters.length && i < 24; i++) {
      var l = letters[i]; if (images[l.id] || !l.report.booking_id) continue;
      try {
        var r = await api.refreshKeepsakeImage(db, l.report);
        if (run !== renderRun) return;
        var img = r && r.__dayoKeepsakeImage;
        if (img && img.approved === true && img.booking_id === l.report.booking_id && /^blob:/.test(img.url)) {
          images[l.id] = img.url;
          var stamp = document.querySelector('[data-stamp="' + CSS.escape(l.id) + '"]'); if (stamp) stamp.src = img.url;
        }
      } catch (_) { /* default illustration stays */ }
    }
  }

  function sheet() {
    var el = document.getElementById('dayo-letter-sheet');
    if (el) return el;
    el = document.createElement('div'); el.id = 'dayo-letter-sheet'; el.className = 'lb-sheet'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'lb-sheet-title');
    el.addEventListener('click', function (e) { if (e.target === el) closeLetter(); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeLetter(); }
      if (e.key === 'Tab') { var f = el.querySelectorAll('button'); if (!f.length) return; var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    });
    document.body.appendChild(el); return el;
  }
  function openLetter(i) {
    var l = letters[i]; if (!l) return;
    lastFocus = document.activeElement;
    var el = sheet();
    el.innerHTML = '<div class="lb-sheet-card"><span class="lb-grip" aria-hidden="true"></span>' +
      '<img class="lb-image" src="' + esc(images[l.id] || DEFAULT_IMAGE) + '" alt="' + esc(images[l.id] ? t(l.name + '가 대화에서 그린 기념 그림', 'Keepsake illustration from ' + l.name) : t('DayO 기본 그림', 'DayO illustration')) + '">' +
      '<div class="lb-sheet-head"><h2 class="lb-sheet-title" id="lb-sheet-title">From ' + esc(l.name) + '</h2><span class="lb-sheet-date">' + esc(longDate(l.date)) + '</span></div>' +
      '<p class="lb-letter">' + esc(l.body) + '</p>' +
      '<div class="lb-actions"><button type="button" class="lb-record">' + t('이 대화 기록 보기', 'View this conversation') + '</button><button type="button" class="lb-close">' + t('편지함으로', 'Back to letters') + '</button></div></div>';
    el.querySelector('.lb-close').onclick = closeLetter;
    el.querySelector('.lb-record').onclick = function () { closeLetter(true); if (typeof window.openReportDetailModal === 'function') window.openReportDetailModal('report-' + (l.index + 1)); };
    el.hidden = false; document.body.style.overflow = 'hidden';
    el.querySelector('.lb-close').focus();
    if (l.unread) { markRead(l.id); l.unread = false; }
  }
  function closeLetter(keepFocus) {
    var el = document.getElementById('dayo-letter-sheet'); if (!el || el.hidden) return;
    el.hidden = true; document.body.style.overflow = '';
    render();
    if (keepFocus !== true && lastFocus && document.contains(lastFocus)) lastFocus.focus();
    else { var b = document.querySelector('.lb-env'); if (keepFocus !== true && b) b.focus(); }
  }

  function syncView() {
    var on = isLettersView();
    if (on) document.body.setAttribute('data-mypage-view', 'letters'); else document.body.removeAttribute('data-mypage-view');
    if (on) window.scrollTo(0, 0);
  }
  function load(reports) { loaded = true; renderRun++; letters = collect(reports); render(); loadImages(renderRun); }

  function init() {
    if (document.body.getAttribute('data-customer-page') !== 'mypage' || !root()) return;
    root().addEventListener('click', function (e) { var b = e.target.closest('[data-letter]'); if (b) openLetter(Number(b.getAttribute('data-letter'))); });
    document.addEventListener('dayo:reportsloaded', function (e) { load(e.detail && e.detail.reports); });
    document.addEventListener('dayo:langchange', render);
    window.addEventListener('hashchange', syncView);
    syncView();
    if (Array.isArray(window.__dayoTalkAlbum)) load(window.__dayoTalkAlbum); else render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.DayOLetterbox = { collect: collect };
})();
