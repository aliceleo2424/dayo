/* Partner payout bank account (owner request 2026-10-14). Own row only (RLS). */
(function () {
  'use strict';
  function ko() { var l = window.DayOI18n && window.DayOI18n.getLang ? String(window.DayOI18n.getLang()) : (document.documentElement.lang || 'ko'); return l.toLowerCase() !== 'en'; }
  function db() { return window.supabaseClient; }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function mask(n) { var d = String(n || ''); return d.length > 4 ? d.slice(0, -4).replace(/[0-9]/g, '•') + d.slice(-4) : d; }
  var BANKS = ['KB국민', '신한', '우리', '하나', 'NH농협', 'IBK기업', '카카오뱅크', '토스뱅크', '케이뱅크', 'SC제일', '씨티', '부산', '대구', '광주', '전북', '경남', '제주', '수협', '새마을금고', '신협', '우체국'];
  var host, current = null;
  function css() {
    if (document.getElementById('ppa-style')) return;
    var s = document.createElement('style'); s.id = 'ppa-style';
    s.textContent = '.ppa{margin:0 0 16px;padding:16px;border:1px solid #EFE6D8;border-radius:16px;background:#FFFDF8}.ppa h3{margin:0 0 4px;font-size:15px}.ppa p{margin:0;font-size:13px;line-height:1.6;color:#7e736b}' +
      '.ppa form{display:grid;gap:10px;margin-top:12px}.ppa label{display:grid;gap:4px;font-size:12px;color:#5c4f46}.ppa input,.ppa select{font:inherit;font-size:15px;min-height:44px;padding:0 12px;border:1px solid #E2D7C6;border-radius:12px;background:#fff;box-sizing:border-box;width:100%}' +
      '.ppa-row{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:10px}.ppa-saved{font-size:15px;color:#3e4a42;font-weight:600}.ppa-btn{font:inherit;font-size:14px;font-weight:600;min-height:44px;padding:0 16px;border:0;border-radius:12px;background:#5F7D63;color:#fff;cursor:pointer}' +
      '.ppa-btn.ghost{background:#fff;color:#5F7D63;border:1px solid #C6D1BC}.ppa-status{min-height:18px}';
    document.head.appendChild(s);
  }
  function viewSaved() {
    var k = ko();
    host.innerHTML = '<h3>🏦 ' + (k ? '정산 받을 계좌' : 'Payout bank account') + '</h3><p>' + (k ? '매월 10일 이 계좌로 정산돼요.' : 'Monthly payouts are sent to this account on the 10th.') + '</p>' +
      '<div class="ppa-row"><span class="ppa-saved">' + esc(current.bank_name) + ' ' + esc(mask(current.account_number)) + ' · ' + esc(current.account_holder) + '</span><button type="button" class="ppa-btn ghost" data-ppa-edit>' + (k ? '수정' : 'Edit') + '</button></div>';
    host.querySelector('[data-ppa-edit]').onclick = viewForm;
  }
  function viewForm() {
    var k = ko(), c = current || {};
    host.innerHTML = '<h3>🏦 ' + (k ? '정산 받을 계좌 등록' : 'Register your payout account') + '</h3><p>' + (k ? '본인 명의 계좌를 입력해 주세요. DayO 정산 담당자만 확인할 수 있어요.' : 'Use an account in your own name. Only DayO payout staff can see it.') + '</p>' +
      '<form novalidate><label>' + (k ? '은행' : 'Bank') + '<input name="bank" list="ppa-banks" maxlength="40" required autocomplete="off" value="' + esc(c.bank_name || '') + '"><datalist id="ppa-banks">' + BANKS.map(function (b) { return '<option value="' + b + '">'; }).join('') + '</datalist></label>' +
      '<label>' + (k ? '예금주' : 'Account holder') + '<input name="holder" maxlength="40" required autocomplete="name" value="' + esc(c.account_holder || '') + '"></label>' +
      '<label>' + (k ? '계좌번호 (숫자와 - 만)' : 'Account number (digits and - only)') + '<input name="number" inputmode="numeric" maxlength="30" required autocomplete="off" value="' + esc(c.account_number || '') + '"></label>' +
      '<p class="ppa-status" role="status"></p><div class="ppa-row"><span></span><button type="submit" class="ppa-btn">' + (k ? '계좌 저장' : 'Save account') + '</button></div></form>';
    var form = host.querySelector('form'), status = host.querySelector('.ppa-status');
    form.onsubmit = async function (e) {
      e.preventDefault();
      var bank = form.bank.value.trim(), holder = form.holder.value.trim(), number = form.number.value.replace(/\s+/g, '');
      if (!bank || !holder || !/^[0-9-]{6,30}$/.test(number)) { status.textContent = k ? '은행, 예금주, 계좌번호(숫자 6자리 이상)를 확인해 주세요.' : 'Check the bank, holder and account number (6+ digits).'; return; }
      var btn = form.querySelector('button[type=submit]'); btn.disabled = true; status.textContent = k ? '저장 중…' : 'Saving…';
      try {
        var u = await db().auth.getUser(), id = u.data && u.data.user && u.data.user.id; if (!id) throw Error('auth');
        var r = await db().from('partner_payout_accounts').upsert({ partner_id: id, bank_name: bank, account_holder: holder, account_number: number, updated_at: new Date().toISOString() }, { onConflict: 'partner_id' }).select().maybeSingle();
        if (r.error) throw r.error; current = r.data || { bank_name: bank, account_holder: holder, account_number: number }; viewSaved();
      } catch (_) { btn.disabled = false; status.textContent = k ? '저장하지 못했어요. 잠시 후 다시 시도해 주세요.' : 'Could not save. Please try again.'; }
    };
  }
  async function load() {
    try { var r = await db().from('partner_payout_accounts').select('bank_name,account_holder,account_number,updated_at').maybeSingle(); if (r.error) throw r.error; current = r.data; } catch (_) { current = null; }
    if (current) viewSaved(); else viewForm();
  }
  function mount() {
    var modal = document.getElementById('settlement-history-modal'); if (!modal || document.getElementById('partner-payout-account')) return;
    css(); host = document.createElement('section'); host.id = 'partner-payout-account'; host.className = 'ppa';
    var summary = modal.querySelector('.settlement-summary'); (summary ? summary.parentNode.insertBefore(host, summary) : modal.querySelector('.modal').appendChild(host));
    var tries = 0, wait = setInterval(function () { tries++; if (db() || tries > 40) { clearInterval(wait); if (db()) load(); } }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
