/* Saved sentences (owner request 2026-10-14): save lines from the chat-style
 * conversation record and review them in My Page. Own rows only (RLS). */
(function () {
  'use strict';
  function ko() { var l = window.DayOI18n && window.DayOI18n.getLang ? String(window.DayOI18n.getLang()) : (document.documentElement.lang || 'ko'); return l.toLowerCase() !== 'en'; }
  function db() { return window.supabaseClient; }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  async function save(item) {
    var text = String(item && item.text || '').trim().slice(0, 1000);
    if (!text || !db()) return { ok: false };
    var row = { text: text, speaker: item.speaker === 'me' ? 'me' : 'partner', speaker_name: item.speakerName ? String(item.speakerName).slice(0, 60) : null, booking_id: UUID.test(item.bookingId || '') ? item.bookingId : null, spoken_at: item.timestamp && Number.isFinite(Date.parse(item.timestamp)) ? item.timestamp : null };
    var result = await db().from('saved_sentences').insert(row);
    if (result.error && !/duplicate|unique/i.test(result.error.message || '') && result.error.code !== '23505') return { ok: false, error: result.error };
    refresh();
    return { ok: true };
  }
  async function remove(id) { if (!db()) return false; var r = await db().from('saved_sentences').delete().eq('id', id); refresh(); return !r.error; }
  async function list() {
    if (!db()) return [];
    var r = await db().from('saved_sentences').select('id,text,speaker,speaker_name,booking_id,spoken_at,created_at').order('created_at', { ascending: false }).limit(200);
    if (r.error) throw r.error; return r.data || [];
  }
  // Button handler used inside the transcript chat bubbles.
  async function onSaveClick(button) {
    if (!button || button.disabled) return;
    var line = button.closest('.ucr-chat-line'), details = button.closest('[data-transcript-booking]');
    var text = line && line.querySelector('.ucr-chat-bubble') ? line.querySelector('.ucr-chat-bubble').textContent : '';
    button.disabled = true; var k = ko();
    var result = await save({ text: text, speaker: line && line.classList.contains('is-me') ? 'me' : 'partner', speakerName: line && line.querySelector('.ucr-chat-who') ? line.querySelector('.ucr-chat-who').textContent : '', bookingId: details && details.getAttribute('data-transcript-booking'), timestamp: line && line.getAttribute('data-ts') });
    if (result.ok) { button.textContent = k ? '★ 저장됨' : '★ Saved'; button.classList.add('is-saved'); }
    else { button.disabled = false; button.textContent = k ? '저장 실패 · 다시' : 'Failed · retry'; }
  }
  async function refresh() {
    var host = document.getElementById('ud-saved-sentences-list'); if (!host) return;
    var k = ko();
    try {
      var rows = await list();
      if (!rows.length) { host.innerHTML = '<p class="ss-empty">' + (k ? '아직 저장한 문장이 없어요. 대화 기록의 ‘💬 대화 내용 보기’에서 마음에 드는 문장 옆 ☆를 눌러 모아 보세요.' : 'No saved sentences yet. Open “💬 View the conversation” in a report and tap ☆ next to a sentence.') + '</p>'; return; }
      host.innerHTML = rows.map(function (r) {
        var who = r.speaker === 'me' ? (k ? '나' : 'Me') : (r.speaker_name || (k ? '파트너' : 'Partner'));
        var date = r.spoken_at || r.created_at, d = date ? new Date(date).toLocaleDateString(k ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric' }) : '';
        return '<div class="ss-item"><p class="ss-text">' + esc(r.text) + '</p><div class="ss-meta"><span>' + esc(who) + (d ? ' · ' + esc(d) : '') + '</span><span class="ss-actions"><button type="button" class="ss-btn" data-ss-copy>' + (k ? '복사' : 'Copy') + '</button><button type="button" class="ss-btn" data-ss-delete="' + esc(r.id) + '">' + (k ? '삭제' : 'Delete') + '</button></span></div></div>';
      }).join('');
    } catch (_) { host.innerHTML = '<p class="ss-empty">' + (k ? '저장한 문장을 불러오지 못했어요.' : 'Could not load saved sentences.') + '</p>'; }
  }
  function css() {
    if (document.getElementById('saved-sentences-style')) return;
    var s = document.createElement('style'); s.id = 'saved-sentences-style';
    s.textContent = '.ss-card h2{margin:0 0 4px}.ss-sub{margin:0 0 12px;font-size:13px;color:#7e736b}#ud-saved-sentences-list{display:grid;gap:10px}' +
      '.ss-item{padding:12px 14px;border:1px solid #EFE6D8;border-radius:14px;background:#FFFDF8}.ss-text{margin:0;font-size:15px;line-height:1.6;color:#3e4a42;white-space:pre-wrap;overflow-wrap:anywhere}' +
      '.ss-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font-size:12px;color:#7e736b}.ss-actions{display:flex;gap:6px}' +
      '.ss-btn{font:inherit;font-size:12px;min-height:32px;padding:0 10px;border:1px solid #E2D7C6;border-radius:10px;background:#fff;color:#5F7D63;cursor:pointer}.ss-empty{margin:0;font-size:13px;color:#7e736b;line-height:1.6}' +
      '.ucr-chat-save{align-self:inherit;margin:3px 6px 0;font:inherit;font-size:11px;min-height:26px;padding:0 8px;border:1px solid #E2D7C6;border-radius:20px;background:#fff;color:#7e736b;cursor:pointer}.ucr-chat-save.is-saved{color:#5F7D63;border-color:#C6D1BC;background:#eef2eb}';
    document.head.appendChild(s);
  }
  function mount() {
    css();
    var host = document.getElementById('ud-saved-sentences'); if (!host) return;
    var k = ko();
    host.innerHTML = '<h2>' + (k ? '⭐ 저장한 문장' : '⭐ Saved sentences') + '</h2><p class="ss-sub">' + (k ? '대화 중 파트너가 고쳐 준 문장이나 다시 쓰고 싶은 표현을 모아 두는 곳이에요.' : 'Sentences your partner corrected or expressions you want to reuse.') + '</p><div id="ud-saved-sentences-list"><p class="ss-empty">' + (k ? '불러오는 중…' : 'Loading…') + '</p></div>';
    host.addEventListener('click', async function (e) {
      var del = e.target.closest('[data-ss-delete]'), copy = e.target.closest('[data-ss-copy]');
      if (del) { del.disabled = true; await remove(del.getAttribute('data-ss-delete')); }
      if (copy) { var t = copy.closest('.ss-item').querySelector('.ss-text').textContent; try { await navigator.clipboard.writeText(t); copy.textContent = k ? '복사됨' : 'Copied'; } catch (_) {} }
    });
    var tries = 0, wait = setInterval(function () { tries++; if (db() || tries > 40) { clearInterval(wait); refresh(); } }, 250);
  }
  window.DayOSavedSentences = { save: save, remove: remove, list: list, refresh: refresh, onSaveClick: onSaveClick };
  css();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
