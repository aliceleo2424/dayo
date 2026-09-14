/* DayO PortOne (I'mport) ticket checkout — index / mypage 공용 */
(function () {
  'use strict';

  var PORTONE_IMP_CODE = (window.__DAYO_ENV__ && window.__DAYO_ENV__.PORTONE_IMP_CODE)
    || '[여기에_고객사_식별코드_입력]';

  var PRODUCTS = {
    starter3: { name: '3회 스타터 팩', price: 54900, tickets: 3 },
    light11: { name: '가벼운 11 패키지', price: 179000, tickets: 11 },
    full33: { name: '마음껏 33 패키지', price: 499000, tickets: 33 },
    trial: { name: '첫 세션 체험 할인권', price: 9900, tickets: 1 },
    single: { name: '1회 단품 이용권', price: 19900, tickets: 1 }
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
    }
    return product;
  }

  function ensureImp() {
    var IMP = window.IMP;
    if (!IMP || typeof IMP.init !== 'function' || typeof IMP.request_pay !== 'function') {
      alert('결제 모듈을 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.');
      return null;
    }
    var code = String(PORTONE_IMP_CODE || '').trim();
    if (!code || code === '[여기에_고객사_식별코드_입력]') {
      alert('포트원 고객사 식별코드가 아직 설정되지 않았습니다. supabase-env.js의 PORTONE_IMP_CODE를 입력해주세요.');
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

  async function persistOrderAndTickets(session, selectedProduct, rsp) {
    var supabase = getSupabase();
    var userId = session.user.id;
    var charged = false;

    if (supabase) {
      var rpc = await supabase.rpc('grant_purchased_tickets', {
        p_user_id: userId,
        p_ticket_count: selectedProduct.tickets,
        p_merchant_uid: rsp.merchant_uid,
        p_imp_uid: rsp.imp_uid,
        p_product_name: selectedProduct.name,
        p_amount: selectedProduct.price
      });

      if (!rpc.error && rpc.data && rpc.data.success) {
        charged = true;
      } else {
        if (rpc.error) console.warn('[DayO] grant_purchased_tickets', rpc.error);

        var orderRes = await supabase.from('orders').insert({
          user_id: userId,
          merchant_uid: rsp.merchant_uid,
          product_name: selectedProduct.name,
          amount: selectedProduct.price,
          ticket_count: selectedProduct.tickets,
          imp_uid: rsp.imp_uid,
          status: 'paid'
        });
        if (orderRes && orderRes.error) {
          console.warn('[DayO] orders insert failed', orderRes.error);
        }

        var profileRes = await supabase
          .from('profiles')
          .select('ticket_count')
          .eq('user_id', userId)
          .maybeSingle();
        if ((profileRes.error || !profileRes.data) && supabase) {
          profileRes = await supabase
            .from('profiles')
            .select('ticket_count')
            .eq('id', userId)
            .maybeSingle();
        }

        var newCount = (Number(profileRes && profileRes.data && profileRes.data.ticket_count) || 0)
          + selectedProduct.tickets;
        var upd = await supabase
          .from('profiles')
          .update({ ticket_count: newCount })
          .eq('user_id', userId);
        if (upd.error) {
          upd = await supabase
            .from('profiles')
            .update({ ticket_count: newCount })
            .eq('id', userId);
        }
        if (upd.error) throw upd.error;
        charged = true;
      }
    }

    if (window.DayOTicketWallet && typeof window.DayOTicketWallet.addTickets === 'function') {
      window.DayOTicketWallet.addTickets(selectedProduct.tickets);
    } else if (window.DayOProfileStore && typeof window.DayOProfileStore.updateProfile === 'function') {
      var current = window.DayOTicketWallet && typeof window.DayOTicketWallet.getCount === 'function'
        ? window.DayOTicketWallet.getCount()
        : 0;
      window.DayOProfileStore.updateProfile({ ticket_count: current + selectedProduct.tickets }, { skipEvents: true });
    }

    return charged;
  }

  async function requestPay(planId) {
    if (paying) return;
    paying = true;
    try {
      var selectedProduct = resolveProduct(planId);
      if (!selectedProduct) {
        alert('상품 정보를 찾을 수 없습니다.');
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

      var IMP = ensureImp();
      if (!IMP) {
        paying = false;
        return;
      }

      IMP.request_pay({
        pg: 'tosspayments',
        pay_method: 'card',
        merchant_uid: 'dayo_order_' + Date.now(),
        name: selectedProduct.name,
        amount: selectedProduct.price,
        buyer_email: session.user.email,
        buyer_name: (session.user.user_metadata && (session.user.user_metadata.name || session.user.user_metadata.full_name)) || 'DayO 유저'
      }, async function (rsp) {
        try {
          if (rsp && rsp.success) {
            try {
              await persistOrderAndTickets(session, selectedProduct, rsp);
              alert('🎉 결제가 완료되었습니다! 세션 티켓 ' + selectedProduct.tickets + '장이 충전되었습니다.');
              closeTicketModal();
              window.location.reload();
            } catch (err) {
              console.error('티켓 충전 중 오류:', err);
              alert('결제는 성공했으나 티켓 충전 중 오류가 발생했습니다. 고객센터로 문의해주세요.');
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
  window.DayOPay = window.DayOPay || {};
  window.DayOPay.request = function (payload) {
    var id = payload && (payload.planId || payload.id);
    return requestPay(id);
  };
})();
