(function () {
  'use strict';
  var catalog = window.DayOPartnerFields, languages = catalog.languages;
  var levels = catalog.levels;
  var banner, dialog, currentUser, details, generation = 0, busy = false, photoChecking = false;
  function complete(row) {
    return !!(row && row.completed_at && row.partner_guide_acknowledged_at && row.location_status && row.visa_type && row.korean_level && row.weekly_session_capacity && row.native_languages && row.native_languages.length && row.session_languages && row.session_languages.length);
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
    banner.innerHTML = '<div><h2 id="pcp-banner-title">Complete your Partner Profile</h2><p>Tell us a little more about your languages and weekly capacity.<br>It only takes about 2 minutes.</p></div><button type="button" class="pcp-primary">Complete Profile</button>';
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
    if (!currentUser || busy || photoChecking) return;
    if (dialog) dialog.remove();
    var editing = !!(details && details.completed_at);
    dialog = document.createElement('dialog'); dialog.className = 'pcp-dialog'; dialog.setAttribute('aria-labelledby','pcp-title');
    dialog.innerHTML = '<div class="pcp-head"><div><p class="pcp-eyebrow">DAYO PARTNER</p><h2 id="pcp-title">'+(editing ? 'Edit your Partner Profile' : 'Complete your Partner Profile')+'</h2></div><button type="button" class="pcp-close" aria-label="Close profile setup">×</button></div>' +
      '<form class="pcp-form"><p class="pcp-intro">'+(editing ? 'Update your partner information.' : 'Tell us a little more about your languages and weekly capacity. It only takes about 2 minutes.')+'</p>' +
      '<fieldset><legend>Location &amp; visa</legend><div id="pcp-location">'+catalog.locationMarkup('pcp-field')+'</div></fieldset>' +
      '<fieldset><legend>Languages</legend><h3>Native language(s)</h3><div class="pcp-choices" id="pcp-native"></div><label class="pcp-field" id="pcp-native-custom" hidden>What language?<input name="native_custom" maxlength="100" disabled></label>' +
      '<h3>Other languages you can speak <span>(optional)</span></h3><div class="pcp-choices" id="pcp-other"></div><label class="pcp-field" id="pcp-other-custom" hidden>What language?<input name="other_custom" maxlength="100" disabled></label><div id="pcp-proficiencies"></div>' +
      '<h3>Which language(s) could you host DayO sessions in?</h3><p class="pcp-hint">Choose from your native languages and other languages rated Conversational or higher.</p><div class="pcp-choices" id="pcp-session"></div>' +
      '<label class="pcp-field">Korean level<select name="korean_level" required><option value="">Choose your Korean level</option><option value="none">None</option><option value="basic">Basic</option><option value="conversational">Conversational</option><option value="advanced">Advanced</option><option value="native">Native / near-native</option></select></label></fieldset>' +
      '<fieldset><legend>Weekly capacity</legend><label class="pcp-field">About how many DayO sessions would you usually like to host per week?<select name="weekly_session_capacity" aria-describedby="pcp-capacity-hint" required><option value="">Choose your capacity</option><option value="1-2">1–2</option><option value="3-5">3–5</option><option value="6-10">6–10</option><option value="10+">10+</option></select></label><p class="pcp-hint" id="pcp-capacity-hint">This is just a rough estimate — you can change your actual availability anytime.</p></fieldset>' +
      (editing ? '<fieldset><legend>Conversation interests</legend><p class="pcp-interest-summary"></p><button type="button" class="pcp-secondary pcp-edit-conversation">Edit conversation profile</button><p class="pcp-hint">Choose up to 4 topics you enjoy talking about in your conversation profile.</p></fieldset>' : '') +
      (details && details.partner_guide_acknowledged_at ? '<p class="pcp-guide-complete">✓ Partner Guide completed</p><input type="checkbox" name="guide_acknowledged" hidden disabled checked>' : '<fieldset><legend>Partner Guide</legend><p>Before hosting sessions, please read the DayO Partner Guide.</p><a href="/partner-guide" target="_blank" rel="noopener">View Partner Guide ↗</a><label class="pcp-ack"><input type="checkbox" name="guide_acknowledged" required>I have read the DayO Partner Guide and understand how to create a comfortable conversation.</label></fieldset>') +
      '<p class="pcp-status" role="alert" aria-live="polite"></p><div class="pcp-actions"><button type="button" class="pcp-secondary pcp-cancel">Not now</button><button type="submit" class="pcp-primary">'+(editing ? 'Save changes' : 'Save Partner Profile')+'</button></div></form>';
    document.body.append(dialog);
    var form = dialog.querySelector('form'), saved = details || {}, lastHosts = saved.session_languages || [];
    var locationFields = catalog.mountLocation(dialog.querySelector('#pcp-location'),saved);
    var initialLevels = Object.create(null); (saved.other_languages || []).forEach(function (entry) { initialLevels[entry.language] = entry.level; });
    ['native','other'].forEach(function (group) {
      var selected = group === 'native' ? (saved.native_languages || []) : Object.keys(initialLevels);
      // Saved legacy/custom languages remain individually selected and editable.
      form.elements[group + '_custom'].value = '';
      languages.forEach(function (l) { checkbox(dialog.querySelector('#pcp-' + group),group + '_choice',l,l,selected.includes(l)); });
      selected.filter(function(l){return !languages.includes(l);}).forEach(function(l){checkbox(dialog.querySelector('#pcp-' + group),group + '_choice',l,l+' (saved)',true);});
    });
    ['korean_level','weekly_session_capacity'].forEach(function (key) { form.elements[key].value = saved[key] || ''; });
    form.elements.guide_acknowledged.checked = !!saved.partner_guide_acknowledged_at;
    // An existing acknowledgement remains server-owned and cannot be withdrawn by editing.
    form.elements.guide_acknowledged.disabled = !!saved.partner_guide_acknowledged_at;
    if (saved.visa_type) {
      form.elements.location_status.disabled = true; form.elements.visa_type.disabled = true;
      var managed = document.createElement('p'); managed.className='pcp-hint';
      managed.textContent='Location type and visa are managed by DayO. Contact DayO if they need to change.';
      dialog.querySelector('#pcp-location').append(managed);
    }
    if (editing) {
      var preferences = saved.conversation_preferences, topics = preferences && preferences.schema_version===1 ? preferences.interests : [];
      var conversation = window.DayOPartnerConversationProfile;
      dialog.querySelector('.pcp-interest-summary').textContent=(topics || []).map(function(key){var item=conversation && conversation.catalog.interests.find(function(x){return x[0]===key;});return item ? item[2] : key;}).join(' · ') || 'No topics selected yet.';
      dialog.querySelector('.pcp-edit-conversation').addEventListener('click',function(){
        if (busy) return;
        if (!window.DayOPartnerConversationProfile || !window.DayOPartnerConversationProfile.openEditor()) {
          form.querySelector('.pcp-status').textContent='Conversation profile is not ready. Close this form and retry in Profile.'; return;
        }
        close(); window.DayOPartnerConversationProfile.openEditor();
      });
    }
    function selected(group) {
      return Array.from(form.querySelectorAll('input[name="' + group + '_choice"]:checked')).map(function (input) { return input.value === 'Other' ? canonical(form.elements[group + '_custom'].value) : input.value; }).filter(Boolean);
    }
    function proficiency() { return Array.from(form.querySelectorAll('[data-pcp-language]')).map(function (node) { return {language:node.dataset.pcpLanguage,level:node.value}; }); }
    function hostLanguages() {
      var previous = Array.from(form.querySelectorAll('input[name="session_languages"]:checked')).map(function (n) { return n.value; });
      if (form.querySelector('input[name="session_languages"]')) lastHosts = previous;
      var eligible = selected('native').concat(proficiency().filter(function (x) { return catalog.canHost(x.level); }).map(function (x) { return x.language; }));
      var container = dialog.querySelector('#pcp-session'); container.replaceChildren();
      Array.from(new Set(eligible)).forEach(function (l) { checkbox(container,'session_languages',l,l,lastHosts.includes(l)); });
      lastHosts = lastHosts.filter(function (l) { return eligible.includes(l); });
    }
    function refreshLanguages() {
      var existing = Object.assign(Object.create(null),initialLevels); proficiency().forEach(function (x) { existing[x.language] = x.level; });
      ['native','other'].forEach(function (group) { var on = form.querySelector('input[name="' + group + '_choice"][value="Other"]').checked; var field = dialog.querySelector('#pcp-' + group + '-custom'); field.hidden = !on; form.elements[group + '_custom'].disabled = !on; form.elements[group + '_custom'].required = on; });
      var native = selected('native').map(function (l) { return l.toLowerCase(); });
      form.querySelectorAll('input[name="other_choice"]').forEach(function (n) { n.disabled = n.value !== 'Other' && native.includes(n.value.toLowerCase()); if (n.disabled) n.checked = false; });
      var container = dialog.querySelector('#pcp-proficiencies'); container.replaceChildren();
      selected('other').filter(function (l) { return !native.includes(l.toLowerCase()); }).forEach(function (l) {
        var label = document.createElement('label'), select = document.createElement('select'); label.className = 'pcp-field'; label.append(document.createTextNode(l + ' proficiency')); select.dataset.pcpLanguage = l; select.required = true; select.setAttribute('aria-label',l + ' proficiency'); option(select,'','Choose proficiency'); levels.forEach(function (x) { option(select,x[0],x[1]); }); select.value = existing[l] || ''; select.addEventListener('change',hostLanguages); label.append(select); container.append(label);
      }); hostLanguages();
    }
    ['native','other'].forEach(function (group) { dialog.querySelector('#pcp-' + group).addEventListener('change',refreshLanguages); form.elements[group + '_custom'].addEventListener('input',refreshLanguages); });
    function close() { if (!busy && !photoChecking && dialog) dialog.close(); }
    dialog.querySelector('.pcp-close').addEventListener('click',close); dialog.querySelector('.pcp-cancel').addEventListener('click',close);
    dialog.addEventListener('cancel',function (event) { if (busy || photoChecking) event.preventDefault(); });
    form.addEventListener('submit',async function (event) {
      event.preventDefault(); if (busy || photoChecking || !currentUser || !form.reportValidity()) return;
      var status = form.querySelector('.pcp-status'), fields = new FormData(form);
      if (!details || !details.completed_at) {
        var photoUser=currentUser.id, photoRun=generation, photo;
        photoChecking=true;
        try { photo=await window.supabaseClient.from('profiles').select('avatar_url').eq('id',photoUser).maybeSingle(); }
        catch (_) { photo={error:true}; }
        finally { photoChecking=false; }
        if (!currentUser || photoRun!==generation || currentUser.id!==photoUser) return;
        if (photo.error || !window.DayOProfileImages || !window.DayOProfileImages.hasPhoto(window.DayOProfileImages.resolve(photo.data && photo.data.avatar_url))) {
          status.textContent=document.documentElement.lang==='ko'?'프로필 사진을 추가한 뒤 프로필을 완성해 주세요.':'Add your profile photo before completing your Partner Profile.';return;
        }
      }
      var payload = Object.assign(locationFields.read(),{native_languages:selected('native'),other_languages:proficiency(),session_languages:fields.getAll('session_languages'),korean_level:form.elements.korean_level.value,weekly_session_capacity:form.elements.weekly_session_capacity.value,guide_acknowledged:form.elements.guide_acknowledged.checked});
      if (saved.visa_type) { delete payload.visa_type; delete payload.location_status; }
      if (!payload.native_languages.length || !payload.session_languages.length) { status.textContent = 'Choose at least one native language and session language.'; return; }
      if (new Set(payload.native_languages.map(function (l) { return l.toLowerCase(); })).size !== payload.native_languages.length || selected('other').some(function (l) { return payload.native_languages.some(function (n) { return n.toLowerCase() === l.toLowerCase(); }); })) { status.textContent = 'Choose each language once, without repeating a native language under other languages.'; return; }
      var userId = currentUser.id, saveRun = generation, button = form.querySelector('[type="submit"]');
      busy = true; button.disabled = true; button.textContent = 'Saving…'; status.textContent = '';
      try {
        var session = await window.supabaseClient.auth.getSession();
        if (!session.data.session || session.data.session.user.id !== userId) throw new Error('Session changed. Please reopen profile setup.');
        var result = await window.supabaseClient.rpc('save_partner_profile_completion',{p_details:payload});
        if (result.error || !complete(result.data)) throw new Error('Could not save your profile. Please try again.');
        if (saveRun !== generation) return;
        details = result.data; document.dispatchEvent(new CustomEvent('dayo:partner-detailschanged',{detail:{source:'completion'}})); if (banner) { banner.remove(); banner = null; }
        form.replaceChildren();
        var title = document.createElement('h3'), text = document.createElement('p'), done = document.createElement('button');
        title.textContent = editing ? 'Your Partner Profile is updated!' : 'Your Partner Profile is ready!'; title.tabIndex = -1; text.textContent = 'Thanks! You’re all set for DayO conversations.'; done.type = 'button'; done.className = 'pcp-primary'; done.textContent = 'Go to Partner Lounge'; done.addEventListener('click',close); form.append(title,text,done); title.focus();
      } catch (error) { if (saveRun === generation) status.textContent = error.message; }
      finally { busy = false; if (button.isConnected) { button.disabled = false; button.textContent = editing ? 'Save changes' : 'Save Partner Profile'; } }
    });
    refreshLanguages(); dialog.showModal();
  }
  function start() {
    document.addEventListener('dayo:edit-partner-details',async function () {
      if (busy || (dialog && dialog.open)) return;
      await refresh();
      if (currentUser) openForm();
    });
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
