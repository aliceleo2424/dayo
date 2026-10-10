(function () {
  'use strict';
  var form = document.getElementById('application-form'), button = document.getElementById('submit-button'), status = document.getElementById('form-status');
  var busy = false, uploaded = null;
  var referralInput=form.elements.referral_code,sharedCode=new URLSearchParams(location.search).get('ref');
  if(sharedCode&&window.DayOPartnerPrivacy.codePattern.test(sharedCode.toUpperCase()))referralInput.value=sharedCode.toUpperCase();
  referralInput.addEventListener('input',function(){referralInput.value=referralInput.value.toUpperCase();});
  var catalog = window.DayOPartnerFields, languages = catalog.languages;
  var locationContainer = document.getElementById('partner-location-fields');
  locationContainer.innerHTML = catalog.locationMarkup();
  var locationFields = catalog.mountLocation(locationContainer);
  var levels = catalog.levels;
  function check(container, name, value, checked) {
    var label = document.createElement('label'), input = document.createElement('input');
    input.type = 'checkbox'; input.name = name; input.value = value; input.checked = !!checked;
    label.append(input, document.createTextNode(value)); container.append(label);
  }
  ['native','other'].forEach(function (group) { languages.forEach(function (language) { check(document.getElementById(group + '-languages'), group + '_language_choice', language); }); });
  function toggleField(id, on) { var field = document.getElementById(id), input = field.querySelector('input'); field.hidden = !on; input.disabled = !on; input.required = on; }
  function canonicalLanguage(value) { var name = String(value || '').trim(); return languages.find(function (language) { return language.toLowerCase() === name.toLowerCase(); }) || name; }
  function selectedLanguages(group) {
    return Array.from(form.querySelectorAll('input[name="' + group + '_language_choice"]:checked')).map(function (input) {
      return input.value === 'Other' ? canonicalLanguage(form.elements[group === 'native' ? 'native_language_other' : 'other_language_name'].value) : input.value;
    }).filter(Boolean);
  }
  function proficiencyMapping() {
    var mapping = {};
    document.querySelectorAll('[data-language-proficiency]').forEach(function (select) {
      if (select.value) Object.defineProperty(mapping, select.dataset.languageProficiency, { value: select.value, enumerable: true, configurable: true });
    });
    return mapping;
  }
  function refreshVideoLanguages() {
    var select = form.elements.intro_video_language, previous = select.value;
    select.replaceChildren(new Option('Select a DayO session language', ''));
    form.querySelectorAll('[name="partner_languages"]:checked').forEach(function (input) { select.add(new Option(input.value, input.value)); });
    select.value = Array.from(select.options).some(function (option) { return option.value === previous; }) ? previous : '';
  }
  document.getElementById('session-languages').addEventListener('change', refreshVideoLanguages);
  function renderHostLanguages() {
    var container = document.getElementById('session-languages'), chosen = Array.from(container.querySelectorAll('input:checked')).map(function (input) { return input.value; });
    var mapping = proficiencyMapping(), eligible = Array.from(new Set(selectedLanguages('native').concat(Object.keys(mapping).filter(function (name) { return catalog.canHost(mapping[name]); }))));
    container.replaceChildren(); eligible.forEach(function (name) { check(container, 'partner_languages', name, chosen.includes(name)); });
    document.getElementById('session-language-hint').hidden = eligible.length > 0; refreshVideoLanguages();
  }
  function refreshLanguages() {
    var native = selectedLanguages('native'), existing = proficiencyMapping();
    ['native','other'].forEach(function (group) { toggleField(group === 'native' ? 'native-other-field' : 'other-language-field', form.querySelector('input[name="' + group + '_language_choice"][value="Other"]').checked); });
    document.querySelectorAll('input[name="other_language_choice"]').forEach(function (input) { var duplicate = input.value !== 'Other' && native.includes(input.value); input.disabled = duplicate; if (duplicate) input.checked = false; });
    var container = document.getElementById('language-proficiencies'); container.replaceChildren();
    selectedLanguages('other').forEach(function (name) {
      var label = document.createElement('label'), select = document.createElement('select'); label.append(document.createTextNode(name + ' proficiency'));
      select.dataset.languageProficiency = name; select.required = true; select.setAttribute('aria-label', name + ' proficiency');
      [['','Select proficiency']].concat(levels).forEach(function (level) { var option = document.createElement('option'); option.value = level[0]; option.textContent = level[1]; select.append(option); });
      select.value = existing[name] || ''; select.addEventListener('change', renderHostLanguages); label.append(select); container.append(label);
    }); renderHostLanguages();
  }
  document.getElementById('native-languages').addEventListener('change', refreshLanguages);
  document.getElementById('other-languages').addEventListener('change', refreshLanguages);
  ['native_language_other','other_language_name'].forEach(function (name) { form.elements[name].addEventListener('input', refreshLanguages); });
  form.elements.acquisition_source.addEventListener('change', function () { toggleField('source-other-field', this.value === 'other'); }); refreshLanguages();
  function success() { form.hidden = true; var panel = document.getElementById('success'); panel.hidden = false; panel.focus(); }
  function validateFile(file, kind) {
    var allowed = ['video/mp4','video/webm','video/quicktime'], max = 50 * 1024 * 1024;
    if (!file || !allowed.includes(file.type) || !file.size || file.size > max) throw new Error('Please choose a valid ' + kind + ' file (' + 'MP4, WebM or MOV · up to 50 MB' + ').');
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), media = document.createElement('video'), finished = false;
      var timer = setTimeout(function () { finish(new Error('Could not read the ' + kind + ' file. Please choose a supported file.')); }, 10000);
      function finish(error) { if (finished) return; finished = true; clearTimeout(timer); URL.revokeObjectURL(url); media.removeAttribute('src'); if (error) reject(error); else resolve(); }
      media.onerror = function () { finish(new Error('Could not read the ' + kind + ' file. Please choose a supported file.')); };
      media.preload = 'metadata'; media.onloadedmetadata = function () { finish(!Number.isFinite(media.duration) || media.duration < 30 || media.duration > 60 ? new Error('Please choose a 30–60 second introduction video.') : null); };
      media.src = url;
    });
  }
  async function uploadFiles(video) {
    if (!uploaded || uploaded.videoFile !== video || Date.now() - uploaded.created > 3600000) {
      var response = await fetch('/api/partner-application-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ video: { type: video.type, size: video.size } }) });
      var ticket = await response.json();
      if (!response.ok) throw new Error(response.status === 429 ? 'Too many upload attempts. Please try again in 10 minutes.' : 'The private upload service is unavailable. Please try again later.');
      uploaded = { videoFile: video, ticket: ticket, created: Date.now(), done: {} };
    }
    for (var kind of ['video']) {
      var file = video; if (!file || uploaded.done[kind]) continue;
      var target = uploaded.ticket[kind], result = await window.supabaseClient.storage.from(target.bucket).uploadToSignedUrl(target.path, target.token, file, { contentType: file.type });
      if (result.error) throw new Error('Could not upload your ' + kind + '. Please try again.'); uploaded.done[kind] = true;
    } return uploaded.ticket;
  }
  form.addEventListener('submit', async function (event) {
    event.preventDefault(); if (busy || !form.reportValidity()) return; status.textContent = '';
    var fields = new FormData(form), payload = {};
    ['full_name','email','contact_method','nationality','current_country','current_city','university','visa_type','korean_level','stranger_conversation_comfort','weekly_session_capacity','device','video_environment','scenario_answer','intro_video_language','acquisition_source','acquisition_source_other','referral_code'].forEach(function (key) { payload[key] = String(fields.get(key) || '').trim(); });
    var location = locationFields.read(); payload.location_status = location.location_status; payload.current_country = location.country; payload.current_city = location.city; payload.korea_city_other = location.korea_city_other; payload.visa_type = location.visa_type;
    payload.email = payload.email.toLowerCase(); payload.native_languages = selectedLanguages('native'); payload.other_language_proficiencies = proficiencyMapping();
    payload.partner_languages = fields.getAll('partner_languages'); payload.strongest_language = payload.native_languages[0];
    payload.other_languages = Object.keys(payload.other_language_proficiencies).join(', ').slice(0,300); payload.privacy_consent = fields.has('privacy_consent');
    var lower = payload.native_languages.map(function (name) { return name.toLowerCase(); });
    if (!lower.length || new Set(lower).size !== lower.length || Object.keys(payload.other_language_proficiencies).some(function (name) { return lower.includes(name.toLowerCase()); })) { status.textContent = 'Choose your native languages and avoid selecting the same language twice.'; return; }
    if (!payload.partner_languages.length) { status.textContent = 'Please choose at least one DayO session language.'; return; }
    if (['full_name','email','contact_method','nationality','current_country','current_city','scenario_answer','intro_video_language'].some(function (key) { return !payload[key]; })) { status.textContent = 'Please complete all required fields.'; return; }
    if (!window.supabaseClient) { status.textContent = 'The application service is unavailable. Please try again later.'; return; }
    var video = form.elements.intro_video.files[0];
    busy = true; button.disabled = true; button.textContent = 'Submitting…';
    try {
      payload.referral_code=await window.DayOPartnerPrivacy.validateReferral(window.supabaseClient,payload.referral_code);
      await validateFile(video, 'video'); status.textContent = 'Uploading your private files…';
      var media = await uploadFiles(video); payload.media_upload_id = media.id; payload.intro_video_path = media.video.path;
      // No returning SELECT: anonymous applicants still have INSERT permission only.
      var result = await window.supabaseClient.from('partner_applications').insert(payload);
      if (result.error) status.textContent = result.error.code === '23505' ? 'An application with this email has already been received. Please wait for the DayO team to contact you.' : 'We could not submit your application. Please try again later.';
      else success();
    } catch (error) { status.textContent = error instanceof TypeError ? 'Connection problem. Please try again. If it was received, your email prevents a duplicate.' : error.message || 'We could not submit your application. Please try again later.'; }
    finally { busy = false; button.disabled = false; button.textContent = 'Submit application'; }
  });
}());
