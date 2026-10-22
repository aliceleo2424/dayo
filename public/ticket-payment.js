/* DayO PortOne (I'mport) ticket checkout — index / mypage 공용 */
(function () {
  'use strict';

  var PORTONE_IMP_CODE = (window.__DAYO_ENV__ && window.__DAYO_ENV__.PORTONE_IMP_CODE)
    || '[여기에_고객사_식별코드_입력]';

  var PRODUCTS = {
    starter3: { name: '산뜻한 3회 패키지', price: 54900, tickets: 3 },
    light11: { name: '가벼운 11 패키지', price: 179000, tickets: 11 },
    full33: { name: '마음껏 33 패키지', price: 499000, tickets: 33 },
    trial: { name: '첫 세션 체험 할인권', price: 9900, tickets: 1 },
    single: { name: '깔끔한 1회 티켓', price: 19900, tickets: 1 },
    // REMOVE BEFORE PUBLIC LAUNCH: admin-only PortOne E2E test product.
    admin_test_1000: { name: '결제 테스트 1,000원', price: 1000, tickets: 1 }
  };

  var ALIAS = {
    pack3: 'starter3',
    pack11: 'light11',
    pack33: 'full33'
  };

  var paying = false;
  var impReady = false;

  function getSupabase() {
    if (window.supabaseClient && window.supabaseClient.auth) return window.supabaseClient;
    if (window.supabase && window.supabase.auth) return window.supabase;
    return null;
  }

  function openLogin() {
    if (typeof window.openLoginModal === 'function') {
      window.openLoginModal();
      return;
    }
    if (window.DayOMode && typeof window.DayOMode.openLogin === 'function') {
      window.DayOMode.openLogin();
      return;
    }
    if (typeof window.handleNaverFastLogin === 'function') {
      window.handleNaverFastLogin();
    }
  }

  function closeTicketModal() {
    if (window.DayOTickets && typeof window.DayOTickets.close === 'function') {
      window.DayOTickets.close();
    }
  }

  function findPlan(planId) {
    var plans = (window.DayOTickets && window.DayOTickets.plans) || [];
    var key = ALIAS[planId] || planId;
    for (var i = 0; i < plans.length; i++) {
      var plan = plans[i];
      if (plan.id === planId || plan.payId === planId || plan.id === key || plan.payId === key) {
        return plan;
      }
    }
    return null;
  }

  function resolveProduct(planId) {
    var key = ALIAS[planId] || planId;
    var base = PRODUCTS[key];
    if (!base) return null;
    return {
      id: key,
      name: base.name,
      price: base.price,
      tickets: base.tickets
    };
  }

  function notify(message) {
    if (window.DayOTickets && typeof window.DayOTickets.showNotice === 'function') {
      window.DayOTickets.showNotice(message);
      return;
    }
    if (window.DayOTickets && typeof window.DayOTickets.toast === 'function') {
      window.DayOTickets.toast(message, { long: true, ms: 7000 });
      return;
    }
    var toast = document.querySelector('.tk-toast');
    if (toast) {
      toast.textContent = message;
      toast.classList.add('is-on', 'is-long');
      return;
    }
    console.warn('[DayO]', message);
  }

  var PREOPEN_PAY_NOTICE =
    '현재 DayO 프리오픈 시범 운영 기간으로 결제 시스템 점검 중입니다 ☕\n' +
    '정식 오픈 시 등록하신 이메일로 가장 먼저 안내해 드릴게요!\n' +
    '(문의: hello@dayotalk.com)';

  var PREOPEN_DEBUG_PREFIX = '[DayO PREOPEN DEBUG]';

  function paymentTestValue() {
    try {
      return new URLSearchParams(window.location.search).get('paymentTest');
    } catch (e) {
      return null;
    }
  }

  function shortDebugId(value) {
    return value ? String(value).slice(0, 8) : null;
  }

  function preopenDebug(stage, details) {
    if (paymentTestValue() !== '1') return;
    console.log(PREOPEN_DEBUG_PREFIX, stage, details);
  }

  function showPreopenPaymentNotice(reason) {
    preopenDebug('SHOW_CALL', { source: 'ticket-payment', reason: reason });
    preopenDebug('DECISION', { allowPaymentTest: false, action: 'SHOW_PREOPEN', reason: reason });
    notify(PREOPEN_PAY_NOTICE);
  }

  function isPortoneConfigured(code) {
    var value = String(code || '').trim();
    if (!value) return false;
    if (value === '[여기에_고객사_식별코드_입력]') return false;
    if (/demo|placeholder|example|test[_-]?code/i.test(value)) return false;
    return true;
  }

  /* ---- 무통장입금 안내 (PortOne 미연동 기간 전용) ----
     PortOne SDK와 고객사 식별코드가 준비되면 이 카드는 더 이상 뜨지 않고
     기존 결제창 흐름이 그대로 동작한다. 아래 상수만 바꾸면 계좌 정보가 바뀐다. */
  var BANK_TRANSFER = {
    bank: '카카오뱅크',
    account: '3333-3852-49984',
    holder: '여승현(88드래곤즈)',
    confirmWindow: { KO: '영업일 기준 12시간 이내', EN: 'within 12 business hours' },
    contactEmail: 'hello@dayotalk.com'
  };

  function portoneAvailable() {
    var IMP = window.IMP;
    if (!IMP || typeof IMP.init !== 'function' || typeof IMP.request_pay !== 'function') return false;
    return isPortoneConfigured(String(PORTONE_IMP_CODE || '').trim());
  }

  function uiLang() {
    try { return window.DayOI18n && window.DayOI18n.getLang() === 'EN' ? 'EN' : 'KO'; } catch (e) { return 'KO'; }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function wonText(amount) {
    return '₩' + Number(amount || 0).toLocaleString('ko-KR');
  }

  var bankNoticeStyled = false;
  function ensureBankNoticeStyle() {
    if (bankNoticeStyled) return;
    bankNoticeStyled = true;
    var style = document.createElement('style');
    style.setAttribute('data-dayo-bank-notice', '1');
    style.textContent =
      '.bk-overlay{position:fixed;inset:0;z-index:970;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(64,54,47,.45);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .18s ease}' +
      '.bk-overlay.is-open{opacity:1;visibility:visible;pointer-events:auto}' +
      '.bk-card{position:relative;width:min(440px,100%);max-height:min(92vh,92dvh);overflow:auto;box-sizing:border-box;padding:22px 20px 18px;border:1px solid #E7DDD0;border-radius:24px;background:#FFFBF4;color:#40362F;box-shadow:0 18px 48px rgba(64,54,47,.18);text-align:left;font-size:14px;line-height:1.65}' +
      '.bk-kicker{margin:0 0 6px;font-size:12px;font-weight:800;letter-spacing:.08em;color:#5F7D63}' +
      '.bk-title{margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:800;color:#263F35;padding-right:36px;word-break:keep-all}' +
      '.bk-close{position:absolute;top:12px;right:12px;width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:#64776B;font-size:18px;cursor:pointer}' +
      '.bk-close:hover{background:#F4F6E9}' +
      '.bk-order{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin:0 0 14px;padding:12px 14px;border-radius:14px;background:#FFF4CC;color:#40362F}' +
      '.bk-order strong{font-size:22px;white-space:nowrap}' +
      '.bk-account{margin:0 0 12px;padding:14px;border:1px solid #DDE5D9;border-radius:16px;background:white}' +
      '.bk-account dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:6px 12px}' +
      '.bk-account dt{margin:0;color:#64776B;font-size:12px;font-weight:700}' +
      '.bk-account dd{margin:0;font-weight:700;color:#263F35;overflow-wrap:anywhere}' +
      '.bk-account dd.bk-number{font-size:18px;letter-spacing:.02em}' +
      '.bk-copy{margin-top:10px;width:100%;min-height:44px;border:1px solid #5F7D63;border-radius:12px;background:white;color:#435F4C;font:inherit;font-weight:700;cursor:pointer}' +
      '.bk-copy.is-done{background:#EEF3EA}' +
      '.bk-steps{margin:0 0 14px;padding:0 0 0 18px;color:#5C4A42}' +
      '.bk-steps li{margin:4px 0;word-break:keep-all}' +
      '.bk-steps b{color:#263F35}' +
      '.bk-actions{display:flex;flex-direction:column;gap:8px}' +
      '.bk-primary{display:block;box-sizing:border-box;width:100%;min-height:48px;padding:13px 16px;border:0;border-radius:14px;background:#5F7D63;color:white;font:inherit;font-weight:800;text-align:center;text-decoration:none;cursor:pointer}' +
      '.bk-primary:hover{background:#516B55}' +
      '.bk-secondary{display:block;box-sizing:border-box;width:100%;min-height:44px;padding:11px 16px;border:1px solid #DDE5D9;border-radius:14px;background:white;color:#435F4C;font:inherit;font-weight:700;cursor:pointer}' +
      '.bk-foot{margin:12px 0 0;font-size:12px;color:#64776B}' +
      '.bk-card button:focus-visible,.bk-card a:focus-visible{outline:3px solid #5F7D63;outline-offset:3px}' +
      '@media(max-width:430px){.bk-card{padding:18px 16px 16px;border-radius:20px}.bk-title{font-size:18px}.bk-order strong{font-size:20px}}';
    document.head.appendChild(style);
  }

  var bankNotice = null;
  function hideBankNotice() {
    if (!bankNotice) return;
    bankNotice.classList.remove('is-open');
    bankNotice.setAttribute('aria-hidden', 'true');
  }

  function bankTransferMailto(product, contact, lang) {
    var subject = lang === 'EN'
      ? '[DayO] Bank transfer sent - ' + product.name + ' ' + wonText(product.price)
      : '[DayO] 무통장입금 완료 - ' + product.name + ' ' + wonText(product.price);
    var body = lang === 'EN'
      ? ['Product: ' + product.name, 'Amount: ' + wonText(product.price), 'Depositor name (as shown in your bank app): ',
         'Contact email: ' + (contact && contact.contact_email || ''), 'Phone: ' + (contact && contact.mobile_phone || ''), '',
         'Please credit my tickets after confirming the transfer. Thank you!'].join('\n')
      : ['상품: ' + product.name, '입금 금액: ' + wonText(product.price), '입금자명(은행 앱에 표시된 이름): ',
         '연락 이메일: ' + (contact && contact.contact_email || ''), '휴대폰: ' + (contact && contact.mobile_phone || ''), '',
         '입금 확인 후 티켓 충전 부탁드립니다. 감사합니다!'].join('\n');
    return 'mailto:' + BANK_TRANSFER.contactEmail + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  function showBankTransferNotice(product, contact) {
    preopenDebug('SHOW_CALL', { source: 'ticket-payment', reason: 'bank-transfer' });
    var lang = uiLang();
    var EN = lang === 'EN';
    ensureBankNoticeStyle();
    if (!bankNotice) {
      bankNotice = document.createElement('div');
      bankNotice.className = 'bk-overlay';
      bankNotice.setAttribute('data-bank-notice', '1');
      bankNotice.setAttribute('aria-hidden', 'true');
      document.body.appendChild(bankNotice);
      bankNotice.addEventListener('click', function (e) {
        if (e.target === bankNotice || e.target.closest('[data-bk-close]')) { hideBankNotice(); return; }
        var copy = e.target.closest('[data-bk-copy]');
        if (copy) {
          var text = BANK_TRANSFER.account;
          var done = function () { copy.classList.add('is-done'); copy.textContent = copy.getAttribute('data-done-label'); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { window.prompt(copy.getAttribute('data-fallback-label'), text); });
          else window.prompt(copy.getAttribute('data-fallback-label'), text);
        }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && bankNotice.classList.contains('is-open')) hideBankNotice();
      });
    }
    bankNotice.innerHTML =
      '<div class="bk-card" role="dialog" aria-modal="true" aria-labelledby="bkTitle">' +
        '<button type="button" class="bk-close" data-bk-close aria-label="' + (EN ? 'Close' : '닫기') + '">✕</button>' +
        '<p class="bk-kicker">' + (EN ? 'BANK TRANSFER' : '무통장입금 안내') + '</p>' +
        '<h2 class="bk-title" id="bkTitle">' + (EN ? 'Card payment is being set up.<br>Please pay by bank transfer for now ☕' : '카드 결제 준비 중이에요.<br>지금은 계좌이체로 받고 있어요 ☕') + '</h2>' +
        '<div class="bk-order"><span>' + escapeHtml(product.name) + '</span><strong>' + wonText(product.price) + '</strong></div>' +
        '<div class="bk-account"><dl>' +
          '<dt>' + (EN ? 'Bank' : '은행') + '</dt><dd>' + escapeHtml(BANK_TRANSFER.bank) + '</dd>' +
          '<dt>' + (EN ? 'Account' : '계좌번호') + '</dt><dd class="bk-number">' + escapeHtml(BANK_TRANSFER.account) + '</dd>' +
          '<dt>' + (EN ? 'Holder' : '예금주') + '</dt><dd>' + escapeHtml(BANK_TRANSFER.holder) + '</dd>' +
        '</dl>' +
        '<button type="button" class="bk-copy" data-bk-copy data-done-label="' + (EN ? 'Copied ✓' : '복사했어요 ✓') + '" data-fallback-label="' + (EN ? 'Copy this account number' : '계좌번호를 복사해 주세요') + '">' + (EN ? 'Copy account number' : '계좌번호 복사') + '</button></div>' +
        '<ol class="bk-steps">' +
          '<li>' + (EN ? 'Transfer <b>exactly ' + wonText(product.price) + '</b> to the account above.' : '위 계좌로 <b>' + wonText(product.price) + '</b>을 정확히 입금해 주세요.') + '</li>' +
          '<li>' + (EN ? 'Use <b>your real name</b> as the depositor name.' : '입금자명은 <b>본인 실명</b>으로 해 주세요.') + '</li>' +
          '<li>' + (EN ? 'Tap <b>I’ve sent it</b> below — your contact details are filled in for you.' : '아래 <b>입금했어요</b>를 눌러 알려주세요. 연락처는 미리 채워져 있어요.') + '</li>' +
          '<li>' + (EN ? 'Tickets are credited ' + BANK_TRANSFER.confirmWindow.EN + ' after we confirm the transfer.' : '입금 확인 후 ' + BANK_TRANSFER.confirmWindow.KO + '에 티켓을 충전해 드려요.') + '</li>' +
        '</ol>' +
        '<div class="bk-actions">' +
          '<a class="bk-primary" href="' + bankTransferMailto(product, contact, lang) + '">' + (EN ? 'I’ve sent it — notify DayO' : '입금했어요 — DayO에 알리기') + '</a>' +
          '<button type="button" class="bk-secondary" data-bk-close>' + (EN ? 'Close' : '닫기') + '</button>' +
        '</div>' +
        '<p class="bk-foot">' + (EN ? 'Questions: ' : '문의: ') + escapeHtml(BANK_TRANSFER.contactEmail) + '</p>' +
      '</div>';
    bankNotice.setAttribute('aria-hidden', 'false');
    bankNotice.classList.add('is-open');
    var closeBtn = bankNotice.querySelector('.bk-close');
    if (closeBtn) closeBtn.focus();
  }

  function ensureImp() {
    var IMP = window.IMP;
    if (!IMP || typeof IMP.init !== 'function' || typeof IMP.request_pay !== 'function') {
      showPreopenPaymentNotice('portone-sdk-unavailable');
      return null;
    }
    var code = String(PORTONE_IMP_CODE || '').trim();
    if (!isPortoneConfigured(code)) {
      showPreopenPaymentNotice('portone-merchant-code-unavailable');
      return null;
    }
    if (!impReady) {
      IMP.init(code);
      impReady = true;
    }
    return IMP;
  }

  async function getSession() {
    var supabase = getSupabase();
    if (!supabase || !supabase.auth) return null;
    var res = await supabase.auth.getSession();
    return res && res.data ? res.data.session : null;
  }

  function paymentTestRequested() {
    return paymentTestValue() === '1';
  }

  function hasAdminPaymentTestAccess() {
    if (!paymentTestRequested()) return Promise.resolve(false);
    var phase = 'client';
    return (async function () {
      var supabase = getSupabase();
      preopenDebug('TICKET_GATE_START', {
        href: window.location.href,
        search: window.location.search,
        paymentTest: paymentTestValue(),
        paymentTestIsOne: paymentTestRequested(),
        supabaseClientExists: !!window.supabaseClient,
        resolvedClientExists: !!supabase
      });
      if (!supabase || !supabase.auth) {
        preopenDebug('AUTH', { success: false, reason: 'supabase-client-unavailable', userIdExists: false, userId: null });
        return false;
      }
      phase = 'auth.getUser';
      var userResult = await supabase.auth.getUser();
      var user = userResult && userResult.data && userResult.data.user;
      preopenDebug('AUTH', {
        source: 'ticket-payment',
        success: !userResult.error && !!user,
        error: !!userResult.error,
        userIdExists: !!(user && user.id),
        userId: shortDebugId(user && user.id)
      });
      if (userResult.error || !user) return false;
      phase = 'profiles.select';
      var profileResult = await supabase
        .from('profiles')
        .select('id,role')
        .eq('id', user.id)
        .maybeSingle();
      var role = profileResult.data && String(profileResult.data.role || '').trim().toLowerCase();
      var allowed = !profileResult.error && !!profileResult.data && role === 'admin';
      preopenDebug('PROFILE', {
        source: 'ticket-payment',
        success: !profileResult.error && !!profileResult.data,
        error: !!profileResult.error,
        profileId: shortDebugId(profileResult.data && profileResult.data.id),
        role: role || null
      });
      preopenDebug('DECISION', {
        source: 'ticket-payment',
        allowPaymentTest: allowed,
        action: allowed ? 'HIDE_PREOPEN' : 'SHOW_PREOPEN',
        reason: allowed ? 'verified-admin' : (profileResult.error ? 'profile-query-failed' : 'role-not-admin')
      });
      return allowed;
    })().catch(function (error) {
      preopenDebug('ERROR', { source: 'ticket-payment', phase: phase, name: error && error.name ? error.name : 'Error' });
      if (phase === 'auth.getUser') {
        preopenDebug('AUTH', { source: 'ticket-payment', success: false, error: true, userIdExists: false, userId: null });
      } else if (phase === 'profiles.select') {
        preopenDebug('PROFILE', { source: 'ticket-payment', success: false, error: true, profileId: null, role: null });
      }
      preopenDebug('DECISION', { allowPaymentTest: false, action: 'SHOW_PREOPEN', reason: 'ticket-gate-exception' });
      return false;
    });
  }

  async function paymentApi(session, body) {
    if (!session || !session.access_token) throw new Error('authentication-required');
    var response = await fetch('/api/ticket-payment', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {})
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok || !data.ok) {
      var error = new Error((data && data.error) || 'payment-api-failed');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function preparePayment(session, productId) {
    var body = { action: 'prepare', product_id: productId };
    if (productId === 'admin_test_1000') body.payment_test = true;
    preopenDebug('PREPARE_REQUEST', {
      payment_test: body.payment_test,
      payment_test_type: typeof body.payment_test
    });
    return paymentApi(session, body);
  }

  async function finalizePayment(session, rsp, prepared) {
    if (!rsp || !rsp.imp_uid) throw new Error('missing-payment-identifier');
    if (rsp.merchant_uid && rsp.merchant_uid !== prepared.merchant_uid) {
      throw new Error('payment-identifier-mismatch');
    }
    var result = await paymentApi(session, {
      action: 'finalize',
      imp_uid: rsp.imp_uid,
      merchant_uid: prepared.merchant_uid
    });
    if (window.DayOTicketWallet && typeof window.DayOTicketWallet.syncUI === 'function') {
      window.DayOTicketWallet.syncUI(result.ticket_count);
    }
    // Refresh trial presentation only; UI listeners cannot block payment settlement.
    try { document.dispatchEvent(new CustomEvent('dayo:ticketpurchase')); } catch (error) { /* non-blocking */ }
    return result;
  }

  function paymentFailureMessage(rsp) {
    var reason = rsp && rsp.error_msg
      ? String(rsp.error_msg).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 200)
      : '';
    var errorCode = rsp && rsp.error_code ? String(rsp.error_code) : '';
    var cancelled = /취소|cancel/i.test(errorCode + ' ' + reason);
    var message = cancelled ? '결제가 취소되었습니다.' : '결제가 완료되지 않았습니다.';
    return reason ? message + '\n사유: ' + reason : message;
  }

  async function markWelcomeTicketUsed(session) {
    var supabase = getSupabase();
    var userId = session && session.user && session.user.id;
    if (supabase && userId) {
      try {
        var upd = await supabase.from('profiles').update({ has_used_welcome_ticket: true }).eq('user_id', userId);
        if (upd && upd.error) {
          await supabase.from('profiles').update({ has_used_welcome_ticket: true }).eq('id', userId);
        }
      } catch (e) { /* column may not exist yet */ }
    }
    if (window.DayOProfileStore && typeof window.DayOProfileStore.markCouponUsed === 'function') {
      try {
        var rows = await window.DayOProfileStore.fetchCoupons();
        var welcome = window.DayOProfileStore.getUnusedWelcomeCoupon(rows);
        if (welcome) await window.DayOProfileStore.markCouponUsed(welcome);
      } catch (e) { /* ignore */ }
    }
  }

  var checkoutLoading = null;
  function loadCheckout() {
    if (window.DayOCheckout) return Promise.resolve(window.DayOCheckout);
    if (!checkoutLoading) checkoutLoading = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = '/checkout-preparation.js?v=alpha-contact-1';
      script.onload = function () {
        if (window.DayOCheckout) resolve(window.DayOCheckout);
        else { checkoutLoading = null; reject(new Error('checkout-unavailable')); }
      };
      script.onerror = function () { checkoutLoading = null; script.remove(); reject(new Error('checkout-unavailable')); };
      document.head.appendChild(script);
    });
    return checkoutLoading;
  }

  async function requestPay(planId) {
    if (paying) return;
    paying = true;
    try {
      var selectedProduct = resolveProduct(planId);
      if (!selectedProduct) {
        notify('상품 정보를 찾을 수 없습니다.');
        paying = false;
        return;
      }
      if ((selectedProduct.id === 'trial' || planId === 'trial') &&
          window.DayOTickets && typeof window.DayOTickets.isTrialUsed === 'function' &&
          window.DayOTickets.isTrialUsed()) {
        paying = false;
        return;
      }

      var session = await getSession();
      if (!session || !session.user) {
        alert('로그인 후 이용권을 구매하실 수 있습니다.');
        openLogin();
        paying = false;
        return;
      }

      if (selectedProduct.id === 'admin_test_1000') {
        var paymentTestAccess = await hasAdminPaymentTestAccess();
        if (!paymentTestAccess) {
          showPreopenPaymentNotice('admin-payment-test-access-denied');
          paying = false;
          return;
        }
      }

      // Checkout persists private contact BEFORE order preparation or the PG dialog.
      var contact = null;
      if (selectedProduct.id !== 'admin_test_1000') {
        var checkout = await loadCheckout();
        contact = await checkout.open(session, selectedProduct);
        if (!contact) { paying = false; return; }
      } else if (window.DayOTickets && !window.DayOTickets.ensureRefundConsent()) {
        paying = false; return;
      }

      // PortOne 미연동 기간: 결제창 대신 무통장입금 안내 (admin 테스트 상품은 기존 PRE-OPEN 안내 유지)
      if (!portoneAvailable() && selectedProduct.id !== 'admin_test_1000') {
        showBankTransferNotice(selectedProduct, contact);
        paying = false;
        return;
      }

      var IMP = ensureImp();
      if (!IMP) {
        paying = false;
        return;
      }

      var prepared;
      try {
        prepared = await preparePayment(session, selectedProduct.id);
      } catch (prepareError) {
        console.error('[DayO] payment prepare failed', prepareError);
        notify('결제 준비 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.');
        paying = false;
        return;
      }

      IMP.request_pay({
        pg: 'tosspayments',
        pay_method: 'card',
        merchant_uid: prepared.merchant_uid,
        name: prepared.product.name,
        amount: prepared.product.amount,
        buyer_email: contact ? contact.contact_email : session.user.email,
        buyer_tel: contact ? contact.mobile_phone : undefined,
        buyer_name: (session.user.user_metadata && (session.user.user_metadata.name || session.user.user_metadata.full_name)) || 'DayO 유저'
      }, async function (rsp) {
        try {
          var callbackFailed = !rsp || rsp.success === false || rsp.imp_success === false ||
            !!(rsp && rsp.error_code);
          var hasPaymentIds = !!(rsp && rsp.imp_uid && rsp.merchant_uid);
          if (callbackFailed || !hasPaymentIds) {
            console.warn('[DayO] payment was not completed', {
              success: rsp && rsp.success,
              error_code: rsp && rsp.error_code ? String(rsp.error_code).slice(0, 80) : null,
              imp_uid_present: !!(rsp && rsp.imp_uid)
            });
            alert(paymentFailureMessage(rsp));
            return;
          }

          try {
            var finalized = await finalizePayment(session, rsp, prepared);
            if (prepared.product.id === 'trial') await markWelcomeTicketUsed(session);
            if (finalized.duplicate) {
              alert('이미 처리된 결제입니다. 현재 티켓 잔액을 확인해 주세요.');
            } else {
              alert('🎉 결제가 완료되었습니다! 세션 티켓 ' + Number(finalized.added_tickets || 0) + '장이 충전되었습니다.');
            }
            closeTicketModal();
            window.location.reload();
          } catch (err) {
            console.error('결제 검증 및 티켓 충전 중 오류:', err);
            alert('결제 확인 중 문제가 발생했습니다. 고객센터로 문의해 주세요.');
          }
        } finally {
          paying = false;
        }
      });
    } catch (err) {
      console.error('[DayO] requestPay', err);
      paying = false;
      alert('결제 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  window.requestPay = requestPay;
  window.closeTicketModal = closeTicketModal;
  window.DayOPaymentTestAccess = {
    requested: paymentTestRequested,
    isAllowed: hasAdminPaymentTestAccess
  };
  // 무통장입금 안내 카드 (PortOne 미연동 기간). 테스트와 다른 화면에서 재사용.
  window.DayOBankTransfer = {
    info: BANK_TRANSFER,
    portoneAvailable: portoneAvailable,
    show: showBankTransferNotice,
    hide: hideBankNotice
  };
  window.DayOPay = window.DayOPay || {};
  window.DayOPay.request = function (payload) {
    var id = payload && (payload.planId || payload.id);
    return requestPay(id);
  };
})();
