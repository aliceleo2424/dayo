/* 나의 대화 티켓: stamp-card view of the learner's remaining tickets under "Next Conversation" on My Page.
 * Display only. The count comes from the existing wallet (dayo:ticketchange / DayOTicketWallet); purchases
 * go through the existing [data-tickets-open] modal. A card always shows 10 slots; empty slots stay faint.
 * Tapping a filled stamp briefly turns it into a pastel heart (decoration only). */
(function () {
  'use strict';
  var SLOTS = 10, count = null;
  var PASTELS = ['#F7B9C4', '#FFD3A5', '#FDE59A', '#BFE3C0', '#B9D7F2', '#D9C2F0', '#F5C6E0'];
  var CUP = '<svg class="ts-cup" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3.5c-.8 1 .8 1.8 0 3M12 3.5c-.8 1 .8 1.8 0 3"/></svg>';
  var HEART = '<svg class="ts-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>';

  function ko() { return !(window.DayOI18n && String(window.DayOI18n.getLang()).toUpperCase() === 'EN'); }
  function t(k, e) { return ko() ? k : e; }

  function render() {
    var host = document.getElementById('ud-ticket-stamps');
    if (!host) return;
    if (count == null) { host.hidden = true; return; }
    var n = Math.max(0, Math.floor(count)), filled = Math.min(n, SLOTS), stamps = '';
    for (var i = 0; i < SLOTS; i++) {
      stamps += i < filled
        ? '<button type="button" class="ts-stamp" data-ts-stamp aria-label="' + t('대화 티켓', 'Talk ticket') + '">' + CUP + HEART + '</button>'
        : '<span class="ts-stamp ts-stamp--empty" aria-hidden="true"></span>';
    }
    if (n > SLOTS) stamps += '<span class="ts-more">+' + (n - SLOTS) + '</span>';
    host.innerHTML =
      '<div class="ts-head"><h2 id="ud-stamp-title">' + t('나의 대화 티켓', 'My talk tickets') + '</h2>' +
      '<span class="ts-count">' + (ko() ? '남은 티켓 <strong>' + n + '</strong>장' : '<strong>' + n + '</strong> ' + (n === 1 ? 'ticket' : 'tickets') + ' left') + '</span></div>' +
      '<div class="ts-stamps" role="group" aria-label="' + t('남은 대화 티켓 ' + n + '장', n + ' talk tickets left') + '">' + stamps + '</div>' +
      (n ? '' : '<p class="ts-empty">' + t('티켓을 충전하면 여기에 도장이 찍혀요.', 'Recharge to fill your card with stamps.') + '</p>') +
      '<button type="button" class="ts-buy" data-tickets-open>' + t('티켓 충전할래요', 'Recharge tickets') + '</button>';
    host.hidden = false;
  }

  function sparkle(stamp) {
    clearTimeout(stamp._tsTimer);
    stamp.style.setProperty('--ts-heart', PASTELS[Math.floor(Math.random() * PASTELS.length)]);
    stamp.classList.remove('is-heart'); void stamp.offsetWidth; stamp.classList.add('is-heart');
    stamp._tsTimer = setTimeout(function () { stamp.classList.remove('is-heart'); }, 1100);
  }

  function fromWallet() {
    var w = window.DayOTicketWallet;
    if (w && typeof w.isHydrated === 'function' && w.isHydrated() && typeof w.getCount === 'function') { count = w.getCount(); render(); return true; }
    return false;
  }

  function init() {
    var host = document.getElementById('ud-ticket-stamps');
    if (!host) return;
    host.addEventListener('click', function (e) { var s = e.target.closest('[data-ts-stamp]'); if (s) sparkle(s); });
    document.addEventListener('dayo:ticketchange', function (e) {
      var d = e.detail || {}, v = typeof d.ticketCount === 'number' ? d.ticketCount : typeof d.count === 'number' ? d.count : null;
      if (v != null && isFinite(v)) { count = v; render(); }
    });
    document.addEventListener('dayo:langchange', render);
    if (!fromWallet()) {
      var tries = 40, timer = setInterval(function () { if (fromWallet() || --tries <= 0) clearInterval(timer); }, 500);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
