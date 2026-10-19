/* Partner profile: mobile number for booking alerts (owner request 2026-10-20).
 * One shared number per account (user_contact_info.mobile_phone via dayo_contact_phone /
 * dayo_set_contact_phone), so a number saved here, at checkout, or by an admin shows up everywhere.
 * Has its own save button; never touches the existing nickname/intro save. */
(function () {
  'use strict';
  function en() { return !!(window.DayOI18n && String(window.DayOI18n.getLang()).toUpperCase() === 'EN'); }
  function t(ko, e) { return en() ? e : ko; }
  function db() { return window.supabaseClient && window.supabaseClient.auth ? window.supabaseClient : null; }
  function pretty(d) { return /^010\d{8}$/.test(d || '') ? d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7) : (d || ''); }
  var box, input, btn, note, uid = null;

  function css() {
    if (document.getElementById('partner-contact-phone-style')) return;
    var s = document.createElement('style'); s.id = 'partner-contact-phone-style';
    s.textContent = '.pcp-row{display:flex;gap:8px;align-items:center}.pcp-row .input{flex:1;min-width:0}' +
      '.pcp-btn{min-height:44px;padding:0 16px;border-radius:12px;border:1px solid #5F7D63;background:#fff;color:#3F5A45;font:inherit;font-weight:700;cursor:pointer;white-space:nowrap}' +
      '.pcp-btn:disabled{opacity:.6;cursor:default}.pcp-note{margin:6px 0 0;font-size:12.5px;line-height:1.6;color:#6B6259}.pcp-note.is-ok{color:#3F5A45}.pcp-note.is-err{color:#A63D28}';
    document.head.appendChild(s);
  }
  function setNote(text, kind) { note.textContent = text; note.className = 'pcp-note' + (kind ? ' is-' + kind : ''); }
  function labels() {
    box.querySelector('label').textContent = t('예약 알림 받을 휴대폰 번호', 'Mobile number for booking alerts');
    input.placeholder = '010-1234-5678';
    btn.textContent = t('저장', 'Save');
    if (!note.dataset.state) setNote(t('새 예약과 대화 시작 전 알림을 이 번호로 보내요. 한국 휴대폰 번호(010)만 가능해요.', 'We send new-booking and start-time alerts to this number. Korean mobile numbers (010) only.'));
  }
  function mount() {
    var form = document.getElementById('profileForm'); if (!form || document.getElementById('partner-contact-phone')) return;
    css();
    box = document.createElement('div'); box.className = 'field field--wide'; box.id = 'partner-contact-phone';
    box.innerHTML = '<label class="field-label" for="partner-mobile-phone"></label><div class="pcp-row"><input class="input" id="partner-mobile-phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="16"><button type="button" class="pcp-btn"></button></div><p class="pcp-note" aria-live="polite"></p>';
    input = box.querySelector('input'); btn = box.querySelector('button'); note = box.querySelector('.pcp-note');
    var bio = document.getElementById('partner-bio-input');
    var before = bio && bio.closest('.field');
    if (before && before.parentNode === form) form.insertBefore(box, before); else form.appendChild(box);
    labels();
    btn.addEventListener('click', save);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    document.addEventListener('dayo:langchange', labels);
    load();
  }
  async function load() {
    var client = db(), tries = 0;
    while (!client && tries++ < 40) { await new Promise(function (r) { setTimeout(r, 250); }); client = db(); }
    if (!client) return;
    var s = await client.auth.getSession(); uid = s && s.data && s.data.session && s.data.session.user && s.data.session.user.id;
    if (!uid) return;
    var r = await client.rpc('dayo_contact_phone', { p_user_id: uid });
    if (!r.error && r.data && !input.value) input.value = pretty(r.data);
  }
  async function save() {
    var client = db(); if (!client || !uid) { setNote(t('로그인 정보를 확인한 뒤 다시 시도해 주세요.', 'Please sign in again and retry.'), 'err'); return; }
    btn.disabled = true;
    var r = await client.rpc('dayo_set_contact_phone', { p_user_id: uid, p_phone: input.value });
    btn.disabled = false;
    if (r.error) {
      note.dataset.state = 'err';
      setNote(/invalid_phone/.test(r.error.message || '') ? t('010으로 시작하는 휴대폰 번호 11자리를 입력해 주세요.', 'Enter an 11-digit mobile number starting with 010.') : t('저장하지 못했어요. 잠시 후 다시 시도해 주세요.', 'Could not save. Please try again.'), 'err');
      return;
    }
    input.value = pretty(r.data && r.data.mobile_phone);
    note.dataset.state = 'ok';
    setNote(t('저장했어요. 예약 알림을 이 번호로 보내요.', 'Saved. Booking alerts will go to this number.'), 'ok');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
