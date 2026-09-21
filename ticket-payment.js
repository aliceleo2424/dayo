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
    single: { name: '깔끔한 1회 티켓', price: 19900, tickets: 1 }
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
    var product = {
      id: key,
      name: base.name,
      price: base.price,
      tickets: base.tickets
    };
    var plan = findPlan(planId);
    if (plan && window.DayOTickets && typeof window.DayOTickets.paymentPayload === 'function') {
      var payload = window.DayOTickets.paymentPayload(plan);
      product.name = payload.orderName || product.name;
      product.price = Number(payload.amount) || product.price;
      product.tickets = Number(payload.ticketCount) || product.tickets;
      if (product.price === PRODUCTS.trial.price && product.tickets === PRODUCTS.trial.tickets &&
          /체험|trial/i.test(product.name)) {
        product.id = 'trial';
      }
    }
    return product;
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
    '(문의: dayo.speak@gmail.com)';

  function isPortoneConfigured(code) {
    var value = String(code || '').trim();
    if (!value) return false;
    if (value === '[여기에_고객사_식별코드_입력]') return false;
    if (/demo|placeholder|example|test[_-]?code/i.test(value)) return false;
    return true;
  }

  function ensureImp() {
    var IMP = window.IMP;
    if (!IMP || typeof IMP.init !== 'function' || typeof IMP.request_pay !== 'function') {
      notify(PREOPEN_PAY_NOTICE);
      return null;
    }
    var code = String(PORTONE_IMP_CODE || '').trim();
    if (!isPortoneConfigured(code)) {
      notify(PREOPEN_PAY_NOTICE);
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
    try {
      return new URLSearchParams(window.location.search).get('paymentTest') === '1';
    } catch (e) {
      return false;
    }
  }

  function hasAdminPaymentTestAccess() {
    if (!paymentTestRequested()) return Promise.resolve(false);
    return (async function () {
      var supabase = getSupabase();
      if (!supabase || !supabase.auth) return false;
      var userResult = await supabase.auth.getUser();
      var user = userResult && userResult.data && userResult.data.user;
      if (userResult.error || !user) return false;
      var profileResult = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      return !profileResult.error && !!profileResult.data &&
        String(profileResult.data.role || '').trim().toLowerCase() === 'admin';
    })().catch(function () { return false; });
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
    return paymentApi(session, { action: 'prepare', product_id: productId, payment_test: true });
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
    return result;
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

  async function requestPay(planId) {
    if (paying) return;
    if (window.DayOTickets && typeof window.DayOTickets.ensureRefundConsent === 'function') {
      if (!window.DayOTickets.ensureRefundConsent()) return;
    } else {
      var agree = document.getElementById('tkRefundAgree');
      if (agree && !agree.checked) {
        alert('취소 및 환불 규정에 동의해 주세요.');
        return;
      }
    }
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

      var paymentTestAccess = await hasAdminPaymentTestAccess();
      if (!paymentTestAccess) {
        notify(PREOPEN_PAY_NOTICE);
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
        buyer_email: session.user.email,
        buyer_name: (session.user.user_metadata && (session.user.user_metadata.name || session.user.user_metadata.full_name)) || 'DayO 유저'
      }, async function (rsp) {
        try {
          var hasPaymentIds = !!(rsp && rsp.imp_uid && rsp.merchant_uid);
          var callbackSucceeded = !!(rsp && (
            rsp.success === true || rsp.imp_success === true ||
            (hasPaymentIds && rsp.success !== false && rsp.imp_success !== false)
          ));
          if (callbackSucceeded) {
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
          } else {
            alert('결제에 실패하였습니다: ' + ((rsp && rsp.error_msg) || '취소되었거나 실패했습니다.'));
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
  window.DayOPay = window.DayOPay || {};
  window.DayOPay.request = function (payload) {
    var id = payload && (payload.planId || payload.id);
    return requestPay(id);
  };
})();
