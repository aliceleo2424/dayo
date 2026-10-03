(function () {
  'use strict';
  var form = document.getElementById('application-form');
  var button = document.getElementById('submit-button');
  var status = document.getElementById('form-status');
  var busy = false;
  function success() {
    form.hidden = true;
    var panel = document.getElementById('success');
    panel.hidden = false;
    panel.focus();
  }
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    status.textContent = '';
    var fields = new FormData(form);
    var payload = {};
    fields.forEach(function (value, key) { payload[key] = String(value).trim(); });
    payload.email = payload.email.toLowerCase();
    payload.partner_languages = Array.from(new Set(payload.partner_languages.split(',').map(function (s) { return s.trim(); }).filter(Boolean)));
    payload.availability_periods = fields.getAll('availability_periods');
    payload.privacy_consent = fields.has('privacy_consent');
    if (!payload.availability_periods.length) { status.textContent = 'Please choose at least one availability period.'; return; }
    if (!payload.partner_languages.length || payload.partner_languages.length > 10) { status.textContent = 'Please enter 1–10 partner languages, separated by commas.'; return; }
    var required = ['full_name','email','contact_method','nationality','current_city','strongest_language','scenario_answer','motivation'];
    if (required.some(function (key) { return !payload[key]; })) { status.textContent = 'Please complete all required fields.'; return; }
    if (!window.supabaseClient) { status.textContent = 'The application service is unavailable. Please try again later.'; return; }
    busy = true;
    button.disabled = true;
    button.textContent = 'Submitting…';
    try {
      // No returning SELECT: anonymous applicants have INSERT permission only.
      var result = await window.supabaseClient.from('partner_applications').insert(payload);
      if (result.error) {
        status.textContent = result.error.code === '23505'
          ? 'An application with this email has already been received. Please wait for the DayO team to contact you.'
          : 'We could not submit your application. Please try again later.';
      } else { success(); }
    } catch (_) { status.textContent = 'Connection problem. Please try again. If it was received, your email prevents a duplicate.'; }
    finally { busy = false; button.disabled = false; button.textContent = 'Submit application'; }
  });
}());
