/* My Page presentation only: existing nodes, handlers and read-only view events. */
(function () {
  'use strict';
  var mounted = false, nextState = null, speakingState = null;
  function copy(key) { return window.DayOI18n.tf('mypage.dashboard.' + key); }
  function byId(id) { return document.getElementById(id); }
  // My Page-only identity presentation. Shared Partner/Room image resolution stays unchanged.
  var photoOwner = '', photoValue = '';
  function userAvatar(value, user) {
    var resolver = window.DayOProfileImageURL;
    var uploaded = resolver && resolver.resolve(value);
    if (uploaded) return uploaded;
    var meta = user && user.user_metadata || {};
    var provider = user && user.app_metadata && user.app_metadata.provider;
    var identities = user && user.identities || [];
    var social = provider === 'google' || provider === 'kakao' || identities.some(function (identity) {
      return identity.provider === 'google' || identity.provider === 'kakao';
    });
    var image = social && resolver && resolver.resolve(meta.profile_image || meta.avatar_url || meta.picture);
    if (image) return image;
    for (var i = 0; i < identities.length; i++) {
      if (!['google', 'kakao'].includes(identities[i].provider)) continue;
      var data = identities[i].identity_data || {};
      image = resolver && resolver.resolve(data.profile_image || data.avatar_url || data.picture);
      if (image) return image;
    }
    return '';
  }
  function userInitial(user) {
    var profile = window._dayoAuthProfile;
    var own = user && profile && profile._authUserId === user.id;
    var meta = user && user.user_metadata || {};
    var name = [own && profile.nickname, own && profile.user_name, meta.nickname, meta.full_name, meta.name].map(function (value) { return String(value || '').trim(); }).find(function (value) { return !!value; }) || '';
    return Array.from(name)[0] ? Array.from(name)[0].toUpperCase() : '';
  }
  function paintUserAvatar(element, user, value) {
    if (!element) return;
    var url = userAvatar(value, user), initial = url ? '' : userInitial(user);
    var key = url || 'initial:' + initial;
    if (element.classList.contains('ms-avatar') && element.dataset.dayoUserAvatar === key && element.textContent === initial) return;
    element.dataset.dayoUserAvatar = key;
    element.style.backgroundImage = url ? 'url(' + JSON.stringify(url) + ')' : '';
    element.style.backgroundSize = 'cover';
    element.style.backgroundPosition = 'center';
    element.classList.toggle('has-photo', !!url);
    if (element.classList.contains('ms-avatar')) element.textContent = initial;
    var label = element.querySelector('span');
    if (label) { label.textContent = initial; label.hidden = !!url; }
  }
  function renderIdentity() {
    var user = window._dayoAuthUser, profile = window._dayoAuthProfile;
    var own = user && profile && profile._authUserId === user.id;
    var heading = byId('ud-current-nickname');
    if (heading) heading.textContent = own ? String(profile.nickname || '').trim() : '';
    document.querySelectorAll('.topbar .ms-profile .ms-avatar').forEach(function (avatar) {
      if (user) paintUserAvatar(avatar, user, photoOwner === user.id ? photoValue : own && profile.avatar_url);
      else { avatar.style.backgroundImage = ''; delete avatar.dataset.dayoUserAvatar; }
    });
  }
  window.DayOUserAvatar = {
    resolve: userAvatar, paint: paintUserAvatar,
    setPhoto: function (userId, value) { photoOwner = userId; photoValue = value || ''; renderIdentity(); }
  };
  document.addEventListener('dayo:authprofile', renderIdentity);
  document.addEventListener('dayo:authchange', renderIdentity);
  document.addEventListener('dayo:profile-image-saved', function (event) {
    window.DayOUserAvatar.setPhoto(event.detail.userId, event.detail.avatarUrl);
  });
  document.querySelectorAll('.topbar [data-mode-switch]').forEach(function (slot) {
    new MutationObserver(renderIdentity).observe(slot, { childList: true, subtree: true });
  });
  function applyCopy() {
    document.querySelectorAll('[data-ud-copy]').forEach(function (node) {
      var key = node.getAttribute('data-ud-copy');
      node.textContent = copy(key);
    });
    document.querySelectorAll('[data-ud-aria]').forEach(function (node) { node.setAttribute('aria-label', copy(node.getAttribute('data-ud-aria'))); });
    renderNext();
  }
  function move(node, target) { if (node && byId(target)) byId(target).appendChild(node); }
  function renderNext() {
    if (!mounted || !nextState) return;
    var hasSession = !!(nextState.session && nextState.session.partnerName);
    byId('ud-next-empty').hidden = hasSession;
    byId('ud-next-empty-copy').textContent = copy('empty');
    byId('ud-empty-book').hidden = hasSession;
    var language = String(hasSession && nextState.session.language || '').toLowerCase();
    var names = { en: 'EN · English', es: 'ES · Español', fr: 'FR · Français', ko: 'KO · 한국어' };
    byId('ud-next-language').textContent = names[language] || language.toUpperCase();
    byId('ud-next-language').hidden = !hasSession || !language;
  }
  function renderSpeaking() {
    if (!mounted || !speakingState) return;
    byId('ud-speaking-action').hidden = speakingState.diagnosed;
    byId('ud-retest').hidden = !speakingState.diagnosed;
  }
  function activate(name, updateHash) {
    if (!['sessions', 'progress', 'tickets', 'account'].includes(name)) name = 'sessions';
    document.querySelectorAll('[data-ud-tab]').forEach(function (tab) {
      var active = tab.getAttribute('data-ud-tab') === name;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
      byId('ud-' + tab.getAttribute('data-ud-tab')).hidden = !active;
    });
    if (updateHash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + '#ud-' + name);
  }
  function restoreTab() { activate(window.location.hash.replace(/^#ud-/, ''), false); }
  function init() {
    var main = document.querySelector('.mypage-container'), layout = byId('user-dashboard-layout');
    if (!main || !layout || mounted) return;
    var welcome = main.querySelector('.mypage-welcome-row');
    var greeting = welcome.querySelector('.mypage-greeting-line');
    var ticketSummary = byId('user-ticket-count').closest('div');
    var grid = main.querySelector('.mypage-main-grid');
    var archive = byId('talkArchiveTitle').closest('section');
    var story = main.querySelector('[data-story-topic]').closest('section');
    var tea = main.querySelector('.dayo-tea-table');
    var right = byId('right-column');
    // Move the actual nodes: bound handlers, live balance and reports remain intact.
    move(byId('edit-nickname-btn'), 'ud-nickname-action');
    layout.querySelector('.ud-heading').appendChild(main.querySelector('.role-switch-wrapper'));
    layout.querySelector('.ud-heading').appendChild(greeting);
    byId('ud-account').querySelector('.ud-account-identity > div').appendChild(byId('mypage-learning-lang'));
    move(byId('urgent-session-banner'), 'ud-next-booking');
    move(byId('upcoming-booking-list'), 'ud-upcoming');
    move(byId('recent-tech-issue-results'), 'ud-session-updates');
    move(archive, 'ud-archive');
    move(byId('main-action-btn'), 'ud-booking-action');
    move(main.querySelector('.mypage-welcome-cta--room'), 'ud-legacy-room-link');
    move(byId('speaking-progress-card'), 'ud-growth');
    move(byId('dayo-monthly-story-host'), 'ud-growth');
    move(byId('mypage-speak-btn'), 'ud-test-action');
    move(byId('speaking-retest-btn'), 'ud-retest-action');
    move(tea, 'ud-treats');
    move(story, 'ud-explore-content');
    move(byId('loungeCarousel'), 'ud-explore-content');
    move(ticketSummary, 'ud-ticket-summary');
    move(main.querySelector('[data-coupon-wallet]'), 'ud-benefits');
    // Preserve the account mount point for password-account.js (including late mounts).
    move(right, 'ud-account-settings');
    Array.from(grid.children).forEach(function (column) { column.hidden = true; });
    grid.appendChild(byId('ud-panels'));
    layout.appendChild(grid);
    welcome.hidden = true;
    main.classList.add('ud-dashboard');
    mounted = true;
    layout.hidden = false;
    document.querySelectorAll('[data-ud-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () { activate(tab.getAttribute('data-ud-tab'), true); });
      tab.addEventListener('keydown', function (event) {
        var keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        var tabs = Array.from(document.querySelectorAll('[data-ud-tab]')), index = tabs.indexOf(tab);
        index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        activate(tabs[index].getAttribute('data-ud-tab'), true);
        tabs[index].focus();
      });
    });
    byId('ud-empty-book').addEventListener('click', function () { byId('main-action-btn').click(); });
    applyCopy(); renderIdentity(); renderSpeaking(); restoreTab();
  }
  document.addEventListener('dayo:mypage-next', function (event) { nextState = event.detail; renderNext(); });
  document.addEventListener('dayo:mypage-speaking', function (event) { speakingState = event.detail; renderSpeaking(); });
  document.addEventListener('dayo:langchange', applyCopy);
  window.addEventListener('hashchange', restoreTab);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
