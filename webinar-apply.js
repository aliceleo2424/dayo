/* DayO live webinar pre-registration — .dayo-webinar- prefix only
 * Depends on: supabase-env.js, @supabase/supabase-js (CDN ESM)
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.2/+esm';

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var PHONE_RE = /^01[016789]\d{7,8}$/;
var SUCCESS_MSG = '🎉 웨비나 신청이 완료되었습니다! 라이브 시작 전 문자/이메일로 접속 링크를 보내드립니다.';
var FAIL_MSG = '신청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
var BTN_LABEL = {
  free: '웨비나 무료 알림 신청하기',
  paid: '심화 실전 마스터 알림 신청하기'
};

var supabase = null;
var selectedType = 'free';
var toastTimer = null;

function env(name) {
  try {
    return (window.__DAYO_ENV__ && window.__DAYO_ENV__[name]) || '';
  } catch (e) {
    return '';
  }
}

function normalizeUrl(url) {
  return String(url || '').replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
}

function getSupabase() {
  if (supabase) return supabase;
  if (window.DayOProfileStore && typeof window.DayOProfileStore.getClient === 'function') {
    var existing = window.DayOProfileStore.getClient();
    if (existing) {
      supabase = existing;
      return supabase;
    }
  }
  var url = normalizeUrl(env('NEXT_PUBLIC_SUPABASE_URL'));
  var key = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !key) return null;
  try {
    supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  } catch (e) {
    console.warn('[DayO] webinar supabase init failed', e);
    supabase = null;
  }
  return supabase;
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatPhone(value) {
  var d = digitsOnly(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return d.slice(0, 3) + '-' + d.slice(3);
  return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
}

function showToast(message, isError) {
  var toast = document.getElementById('dayo-webinar-toast');
  if (!toast) {
    window.alert(message);
    return;
  }
  toast.textContent = message;
  toast.classList.toggle('is-error', !!isError);
  toast.classList.add('is-show');
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toast.classList.remove('is-show');
  }, isError ? 4200 : 5200);
}

function setError(el, message) {
  if (!el) return;
  el.textContent = message || '';
}

function setTabs(type) {
  selectedType = type === 'paid' ? 'paid' : 'free';
  document.querySelectorAll('[data-webinar-type]').forEach(function (btn) {
    var on = btn.getAttribute('data-webinar-type') === selectedType;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  var submit = document.getElementById('btn-webinar-submit');
  if (submit && !submit.disabled) submit.textContent = BTN_LABEL[selectedType];
}

function validate(name, phone, email) {
  if (!name) return '이름을 입력해 주세요.';
  if (!phone) return '연락처를 입력해 주세요.';
  if (!PHONE_RE.test(digitsOnly(phone))) return '휴대폰 번호를 확인해 주세요. (예: 010-0000-0000)';
  if (!email) return '이메일을 입력해 주세요.';
  if (!EMAIL_RE.test(email)) return '올바른 이메일 주소를 입력해 주세요.';
  return '';
}

async function submitApplication(userName, userPhone, userEmail) {
  var client = getSupabase();
  if (!client) return { error: { message: 'supabase unavailable' } };
  var { error } = await client
    .from('webinar_applications')
    .insert([
      {
        name: userName,
        phone: userPhone,
        email: userEmail,
        webinar_type: selectedType || 'free'
      }
    ]);
  return { error: error || null };
}

function init() {
  var form = document.getElementById('webinar-form');
  var nameInput = document.getElementById('webinar-name');
  var phoneInput = document.getElementById('webinar-phone');
  var emailInput = document.getElementById('webinar-email');
  var submitBtn = document.getElementById('btn-webinar-submit');
  var errorEl = document.getElementById('webinar-error');
  if (!form || !nameInput || !phoneInput || !emailInput || !submitBtn) return;

  document.querySelectorAll('[data-webinar-type]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setTabs(btn.getAttribute('data-webinar-type'));
    });
  });
  setTabs('free');

  phoneInput.addEventListener('input', function () {
    var start = phoneInput.selectionStart;
    var before = phoneInput.value;
    phoneInput.value = formatPhone(phoneInput.value);
    if (typeof start === 'number' && document.activeElement === phoneInput) {
      var diff = phoneInput.value.length - before.length;
      phoneInput.setSelectionRange(Math.max(0, start + diff), Math.max(0, start + diff));
    }
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (submitBtn.disabled) return;

    var userName = String(nameInput.value || '').trim();
    var userPhone = formatPhone(phoneInput.value);
    var userEmail = String(emailInput.value || '').trim();
    var message = validate(userName, userPhone, userEmail);
    setError(errorEl, message);
    if (message) {
      showToast(message, true);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    submitBtn.textContent = '신청 중...';

    try {
      var result = await submitApplication(userName, userPhone, userEmail);
      if (result && result.error) {
        console.warn('[DayO] webinar insert failed', result.error);
        setError(errorEl, FAIL_MSG);
        showToast(FAIL_MSG, true);
        return;
      }
      setError(errorEl, '');
      form.reset();
      setTabs(selectedType);
      showToast(SUCCESS_MSG, false);
    } catch (err) {
      console.warn('[DayO] webinar submit threw', err);
      setError(errorEl, FAIL_MSG);
      showToast(FAIL_MSG, true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
      submitBtn.textContent = BTN_LABEL[selectedType];
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
