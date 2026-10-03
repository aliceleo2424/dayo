(function () {
  'use strict';
  var languages = ['English','Korean','French','Spanish','Chinese (Mandarin)','Japanese','German','Portuguese','Arabic','Russian','Vietnamese','Thai','Indonesian','Other'];
  var levels = [['basic','Basic'],['conversational','Conversational'],['fluent','Fluent'],['native','Native / near-native']];
  var periods = [['early_morning','Early morning — 6:00 AM–9:00 AM'],['morning','Morning — 9:00 AM–12:00 PM'],['afternoon','Afternoon — 12:00 PM–5:00 PM'],['evening','Evening — 5:00 PM–10:00 PM'],['late_night','Late night — 10:00 PM–1:00 AM']];
  var banner, dialog, currentUser, details, generation = 0, busy = false;
  function complete(row) {
    return !!(row && row.completed_at && row.partner_guide_acknowledged_at && row.location_status && row.visa_type && row.korean_level && row.weekly_session_capacity && row.native_languages && row.native_languages.length && row.session_languages && row.session_languages.length && row.availability_periods && row.availability_periods.length);
  }
  function clear() { if (banner) banner.remove(); if (dialog) { if (dialog.open) dialog.close(); dialog.remove(); } banner = dialog = null; currentUser = details = null; }
  async function refresh() {
    var run = ++generation; clear();
    var client = window.supabaseClient;
    if (!client || !document.getElementById('partner-dashboard-section')) return;
    try {
      var session = await client.auth.getSession(), user = session.data && session.data.session && session.data.session.user;
      if (!user || run !== generation) return;
      var profile = await client.from('profiles').select('role').eq('id',user.id).maybeSingle();
      if (profile.error || !profile.data || profile.data.role !== 'partner' || run !== generation) return;
      var result = await client.from('partner_profile_details').select('*').eq('partner_id',user.id).maybeSingle();
      if (run !== generation) return;
      if (result.error) { console.warn('[DayO] Partner completion unavailable; lounge remains available.'); return; }
      currentUser = user; details = result.data;
      if (!complete(details)) mountBanner();
    } catch (error) { console.warn('[DayO] Partner completion could not load; lounge remains available.'); }
  }
  function mountBanner() {
    banner = document.createElement('section'); banner.className = 'pcp-banner'; banner.setAttribute('aria-labelledby','pcp-banner-title');
    banner.innerHTML = '<div><h2 id="pcp-banner-title">Complete your Partner Profile</h2><p>Tell us a little more about your languages and availability.<br>It only takes about 2 minutes.</p></div><button type="button" class="pcp-primary">Complete Profile</button>';
    banner.querySelector('button').addEventListener('click',openForm);
    var heading = document.querySelector('#partner-dashboard-section .page-heading');
    if (heading) heading.after(banner); else document.getElementById('partner-dashboard-section').prepend(banner);
  }
  function option(select,value,label) { var node = document.createElement('option'); node.value = value; node.textContent = label; select.append(node); }
  function checkbox(container,name,value,label,checked) {
    var item = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.name = name; input.value = value; input.checked = !!checked;
    item.append(input,document.createTextNode(label)); container.append(item);
  }
  function canonical(value) { var text = String(value || '').trim(); return languages.slice(0,-1).find(function (l) { return l.toLowerCase() === text.toLowerCase(); }) || text; }
  function openForm() {
    if (!currentUser || busy) return;
    if (dialog) dialog.remove();
    dialog = document.createElement('dialog'); dialog.className = 'pcp-dialog'; dialog.setAttribute('aria-labelledby','pcp-title');
    dialog.innerHTML = '<div class="pcp-head"><div><p class="pcp-eyebrow">DAYO PARTNER</p><h2 id="pcp-title">Complete your Partner Profile</h2></div><button type="button" class="pcp-close" aria-label="Close profile setup">×</button></div>' +
      '<form class="pcp-form"><p class="pcp-intro">Tell us a little more about your languages and availability. It only takes about 2 minutes.</p>' +
      '<fieldset><legend>Location &amp; visa</legend><label class="pcp-field">Location<select name="location_status" required><option value="">Choose your location</option><option value="korea">Currently living in Korea</option><option value="overseas">Currently living outside Korea</option></select></label>' +
      '<label class="pcp-field">Visa type<select name="visa_type" required><option value="">Choose your visa type</option><option>D-2</option><option>D-4</option><option>F-series</option><option>Other visa</option><option value="not_applicable_overseas" hidden>Not applicable — currently living outside Korea</option></select></label></fieldset>' +
      '<fieldset><legend>Languages</legend><h3>Native language(s)</h3><div class="pcp-choices" id="pcp-native"></div><label class="pcp-field" id="pcp-native-custom" hidden>Other native language<input name="native_custom" maxlength="100" disabled></label>' +
      '<h3>Other languages you can speak <span>(optional)</span></h3><div class="pcp-choices" id="pcp-other"></div><label class="pcp-field" id="pcp-other-custom" hidden>Other language name<input name="other_custom" maxlength="100" disabled></label><div id="pcp-proficiencies"></div>' +
      '<h3>Which language(s) could you host DayO sessions in?</h3><p class="pcp-hint">Choose from your native languages and fluent or near-native other languages.</p><div class="pcp-choices" id="pcp-session"></div>' +
      '<label class="pcp-field">Korean level<select name="korean_level" required><option value="">Choose your Korean level</option><option value="none">None</option><option value="basic">Basic</option><option value="conversational">Conversational</option><option value="advanced">Advanced</option><option value="native">Native / near-native</option></select></label></fieldset>' +
      '<fieldset><legend>Availability</legend><p class="pcp-hint">All times are Korea Standard Time (KST). Late night continues into the next day.</p><h3>Weekdays</h3><div class="pcp-periods" id="pcp-weekday"></div><h3>Weekends</h3><div class="pcp-periods" id="pcp-weekend"></div>' +
      '<label class="pcp-field">Weekly session capacity<select name="weekly_session_capacity" required><option value="">Choose your capacity</option><option value="1-2">1–2</option><option value="3-5">3–5</option><option value="6-10">6–10</option><option value="10+">10+</option></select></label></fieldset>' +
      '<fieldset><legend>Partner Guide</legend><p>Before hosting sessions, please read the DayO Partner Guide.</p><a href="/partner-guide" target="_blank" rel="noopener">View Partner Guide ↗</a><label class="pcp-ack"><input type="checkbox" name="guide_acknowledged" required>I have read the DayO Partner Guide and understand how to create a comfortable conversation.</label></fieldset>' +
      '<p class="pcp-status" role="alert" aria-live="polite"></p><div class="pcp-actions"><button type="button" class="pcp-secondary pcp-cancel">Not now</button><button type="submit" class="pcp-primary">Save Partner Profile</button></div></form>';
    document.body.append(dialog);
    var form = dialog.querySelector('form'), saved = details || {}, lastHosts = saved.session_languages || [];
    var initialLevels = {}; (saved.other_languages || []).forEach(function (entry) { initialLevels[entry.language] = entry.level; });
    ['native','other'].forEach(function (group) {
      var selected = group === 'native' ? (saved.native_languages || []) : Object.keys(initialLevels);
      var custom = selected.find(function (l) { return !languages.slice(0,-1).includes(l); }) || '';
      form.elements[group + '_custom'].value = custom;
      languages.forEach(function (l) { checkbox(dialog.querySelector('#pcp-' + group),group + '_choice',l,l,l === 'Other' ? !!custom : selected.includes(l)); });
    });
    ['weekday','weekend'].forEach(function (day) { periods.forEach(function (p) { var value = day + '_' + p[0]; checkbox(dialog.querySelector('#pcp-' + day),'availability_periods',value,p[1],(saved.availability_periods || []).includes(value)); }); });
    ['location_status','visa_type','korean_level','weekly_session_capacity'].forEach(function (key) { form.elements[key].value = saved[key] || ''; });
    form.elements.guide_acknowledged.checked = !!saved.partner_guide_acknowledged_at;
    function selected(group) {
      return Array.from(form.querySelectorAll('input[name="' + group + '_choice"]:checked')).map(function (input) { return input.value === 'Other' ? canonical(form.elements[group + '_custom'].value) : input.value; }).filter(Boolean);
    }
    function proficiency() { return Array.from(form.querySelectorAll('[data-pcp-language]')).map(function (node) { return {language:node.dataset.pcpLanguage,level:node.value}; }); }
    function hostLanguages() {
      var previous = Array.from(form.querySelectorAll('input[name="session_languages"]:checked')).map(function (n) { return n.value; });
      if (form.querySelector('input[name="session_languages"]')) lastHosts = previous;
      var eligible = selected('native').concat(proficiency().filter(function (x) { return x.level === 'fluent' || x.level === 'native'; }).map(function (x) { return x.language; }));
      var container = dialog.querySelector('#pcp-session'); container.replaceChildren();
      Array.from(new Set(eligible)).forEach(function (l) { checkbox(container,'session_languages',l,l,lastHosts.includes(l)); });
      lastHosts = lastHosts.filter(function (l) { return eligible.includes(l); });
    }
    function refreshLanguages() {
      var existing = Object.assign({},initialLevels); proficiency().forEach(function (x) { existing[x.language] = x.level; });
      ['native','other'].forEach(function (group) { var on = form.querySelector('input[name="' + group + '_choice"][value="Other"]').checked; var field = dialog.querySelector('#pcp-' + group + '-custom'); field.hidden = !on; form.elements[group + '_custom'].disabled = !on; form.elements[group + '_custom'].required = on; });
      var native = selected('native').map(function (l) { return l.toLowerCase(); });
      form.querySelectorAll('input[name="other_choice"]').forEach(function (n) { n.disabled = n.value !== 'Other' && native.includes(n.value.toLowerCase()); if (n.disabled) n.checked = false; });
      var container = dialog.querySelector('#pcp-proficiencies'); container.replaceChildren();
      selected('other').filter(function (l) { return !native.includes(l.toLowerCase()); }).forEach(function (l) {
        var label = document.createElement('label'), select = document.createElement('select'); label.className = 'pcp-field'; label.append(document.createTextNode(l + ' proficiency')); select.dataset.pcpLanguage = l; select.required = true; select.setAttribute('aria-label',l + ' proficiency'); option(select,'','Choose proficiency'); levels.forEach(function (x) { option(select,x[0],x[1]); }); select.value = existing[l] || ''; select.addEventListener('change',hostLanguages); label.append(select); container.append(label);
      }); hostLanguages();
    }
    function locationChanged() {
      var overseas = form.elements.location_status.value === 'overseas', visa = form.elements.visa_type;
      visa.querySelector('[value="not_applicable_overseas"]').hidden = !overseas;
      visa.disabled = overseas;
      if (overseas) visa.value = 'not_applicable_overseas'; else if (visa.value === 'not_applicable_overseas') visa.value = '';
    }
    form.elements.location_status.addEventListener('change',locationChanged);
    ['native','other'].forEach(function (group) { dialog.querySelector('#pcp-' + group).addEventListener('change',refreshLanguages); form.elements[group + '_custom'].addEventListener('input',refreshLanguages); });
    function close() { if (!busy && dialog) dialog.close(); }
    dialog.querySelector('.pcp-close').addEventListener('click',close); dialog.querySelector('.pcp-cancel').addEventListener('click',close);
    dialog.addEventListener('cancel',function (event) { if (busy) event.preventDefault(); });
    form.addEventListener('submit',async function (event) {
      event.preventDefault(); if (busy || !form.reportValidity()) return;
      var status = form.querySelector('.pcp-status'), fields = new FormData(form);
      var payload = {location_status:form.elements.location_status.value,visa_type:form.elements.visa_type.value,native_languages:selected('native'),other_languages:proficiency(),session_languages:fields.getAll('session_languages'),korean_level:form.elements.korean_level.value,availability_periods:fields.getAll('availability_periods'),weekly_session_capacity:form.elements.weekly_session_capacity.value,guide_acknowledged:form.elements.guide_acknowledged.checked};
      if (!payload.native_languages.length || !payload.session_languages.length || !payload.availability_periods.length) { status.textContent = 'Choose at least one native language, session language and availability period.'; return; }
      if (new Set(payload.native_languages.map(function (l) { return l.toLowerCase(); })).size !== payload.native_languages.length || selected('other').some(function (l) { return payload.native_languages.some(function (n) { return n.toLowerCase() === l.toLowerCase(); }); })) { status.textContent = 'Choose each language once, without repeating a native language under other languages.'; return; }
      var userId = currentUser.id, saveRun = generation, button = form.querySelector('[type="submit"]');
      busy = true; button.disabled = true; button.textContent = 'Saving…'; status.textContent = '';
      try {
        var session = await window.supabaseClient.auth.getSession();
        if (!session.data.session || session.data.session.user.id !== userId) throw new Error('Session changed. Please reopen profile setup.');
        var result = await window.supabaseClient.rpc('save_partner_profile_completion',{p_details:payload});
        if (result.error || !complete(result.data)) throw new Error('Could not save your profile. Please try again.');
        if (saveRun !== generation) return;
        details = result.data; if (banner) { banner.remove(); banner = null; }
        form.replaceChildren();
        var title = document.createElement('h3'), text = document.createElement('p'), done = document.createElement('button');
        title.textContent = 'Your Partner Profile is ready!'; title.tabIndex = -1; text.textContent = 'Thanks! You’re all set for DayO conversations.'; done.type = 'button'; done.className = 'pcp-primary'; done.textContent = 'Go to Partner Lounge'; done.addEventListener('click',close); form.append(title,text,done); title.focus();
      } catch (error) { if (saveRun === generation) status.textContent = error.message; }
      finally { busy = false; if (button.isConnected) { button.disabled = false; button.textContent = 'Save Partner Profile'; } }
    });
    locationChanged(); refreshLanguages(); dialog.showModal();
  }
  function start() {
    document.addEventListener('dayo:partner-authorized',refresh);
    if (window.supabaseClient && window.supabaseClient.auth.onAuthStateChange) window.supabaseClient.auth.onAuthStateChange(function (event, session) {
      // Supabase can repeat SIGNED_IN on tab focus; keep the current partner's draft/success screen.
      if (currentUser && session && session.user && session.user.id === currentUser.id &&
        (event === 'TOKEN_REFRESHED' || (event === 'SIGNED_IN' && dialog && dialog.open))) return;
      ++generation; clear(); setTimeout(refresh,0);
    });
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
