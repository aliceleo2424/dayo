/* DayO live webinar pre-registration — .dayo-webinar- prefix only
 * Depends on: supabase-env.js, @supabase/supabase-js (CDN ESM)
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.2/+esm';

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var SUCCESS_MSG = '신청이 완료되었어요!\nDayO 라이브 웨비나 일정이 확정되면 이메일로 알려드릴게요.';
var FAIL_MSG = '신청을 저장하지 못했어요. 잠시 후 다시 시도해주세요.';
var BTN_LABEL = {
  free: '웨비나 사전 신청'
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
  selectedType = 'free';
  document.querySelectorAll('[data-webinar-type]').forEach(function (btn) {
    var on = btn.getAttribute('data-webinar-type') === selectedType;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  var submit = document.getElementById('btn-webinar-submit');
  if (submit && !submit.disabled) submit.textContent = BTN_LABEL.free;
}

function validate(name, email, interestLanguage, interestLanguageOther) {
  if (!name) return '이름을 입력해 주세요.';
  if (!email) return '이메일을 입력해 주세요.';
  if (!EMAIL_RE.test(email)) return '올바른 이메일 주소를 입력해 주세요.';
  if (!interestLanguage) return '가장 관심 있는 언어를 선택해 주세요.';
  if (interestLanguage === 'other' && !interestLanguageOther) return '관심 언어를 입력해 주세요.';
  if (interestLanguageOther.length > 80) return '관심 언어는 80자 이하로 입력해 주세요.';
  return '';
}

async function submitApplication(userName, userEmail, interestLanguage, interestLanguageOther) {
  var client = getSupabase();
  if (!client) return { error: { message: 'supabase unavailable' } };
  var { data, error } = await client.rpc('register_webinar_lead', {
    p_name: userName,
    p_email: userEmail,
    p_interest_language: interestLanguage,
    p_interest_language_other: interestLanguageOther || null
  });
  if (error) return { error: error };
  if (!data || data.success !== true) {
    return { error: { message: data && data.code ? data.code : 'registration failed' } };
  }
  return { error: null };
}

function init() {
  var form = document.getElementById('webinar-form');
  var nameInput = document.getElementById('webinar-name');
  var emailInput = document.getElementById('webinar-email');
  var languageInput = document.getElementById('webinar-interest-language');
  var languageOtherField = document.getElementById('webinar-interest-language-other-field');
  var languageOtherInput = document.getElementById('webinar-interest-language-other');
  var submitBtn = document.getElementById('btn-webinar-submit');
  var errorEl = document.getElementById('webinar-error');
  if (!form || !nameInput || !emailInput || !languageInput || !languageOtherField || !languageOtherInput || !submitBtn) return;

  document.querySelectorAll('[data-webinar-type]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setTabs(btn.getAttribute('data-webinar-type'));
    });
  });
  setTabs('free');

  function syncOtherLanguageField() {
    var isOther = languageInput.value === 'other';
    languageOtherField.hidden = !isOther;
    languageOtherInput.required = isOther;
    if (!isOther) languageOtherInput.value = '';
  }

  languageInput.addEventListener('change', syncOtherLanguageField);
  syncOtherLanguageField();

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (submitBtn.disabled) return;

    var userName = String(nameInput.value || '').trim().replace(/\s+/g, ' ');
    var userEmail = String(emailInput.value || '').trim().toLowerCase();
    var interestLanguage = String(languageInput.value || '').trim().toLowerCase();
    var interestLanguageOther = String(languageOtherInput.value || '').trim().replace(/\s+/g, ' ');
    var message = validate(userName, userEmail, interestLanguage, interestLanguageOther);
    setError(errorEl, message);
    if (message) {
      showToast(message, true);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    submitBtn.textContent = '신청 중...';

    try {
      var result = await submitApplication(userName, userEmail, interestLanguage, interestLanguageOther);
      if (result && result.error) {
        console.warn('[DayO] webinar insert failed', result.error);
        setError(errorEl, FAIL_MSG);
        showToast(FAIL_MSG, true);
        return;
      }
      setError(errorEl, '');
      form.reset();
      syncOtherLanguageField();
      setTabs(selectedType);
      showToast(SUCCESS_MSG, false);
    } catch (err) {
      console.warn('[DayO] webinar submit threw', err);
      setError(errorEl, FAIL_MSG);
      showToast(FAIL_MSG, true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
      submitBtn.textContent = BTN_LABEL.free;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
