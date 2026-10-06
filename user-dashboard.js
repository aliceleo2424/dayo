/* My Page presentation only: existing nodes, handlers and read-only view events. */
(function () {
  'use strict';
  var mounted = false, nextState = null, speakingState = null;
  var upcomingCopy = new WeakMap();
  var labels = {
    en: { mode: 'USER MODE', next: 'Next Conversation', loading: 'Loading your next conversation…', empty: 'No upcoming conversation', book: 'Book a conversation', sessions: 'Sessions', progress: 'Progress', tickets: 'Tickets', account: 'Account', tabs: 'My Page sections', conversations: 'Your conversations', sense: 'Check your Speaking Sense', senseHint: 'Find your starting point for DayO conversations.', senseOptions: 'Speaking Sense options', explore: 'Explore DayO', exploreHint: 'Story cards & Lounge Magazine', yourTickets: 'Your tickets', buyTickets: 'Buy / recharge tickets', nickname: 'Nickname', nicknameHint: 'Manage how your name appears on DayO.', language: 'Interface language' },
    ko: { mode: '유저 모드', next: '다음 대화', loading: '다음 대화를 불러오고 있어요…', empty: '예정된 대화가 없어요', book: '대화 예약하기', sessions: '대화', progress: '성장', tickets: '티켓', account: '계정', tabs: '마이페이지 메뉴', conversations: '내 대화', sense: '내 스피킹 감각 알아보기', senseHint: 'DayO 대화를 시작하는 나의 감각을 확인해요.', senseOptions: '스피킹 감각 설정', explore: 'DayO 둘러보기', exploreHint: '이야기 카드 · 라운지 매거진', yourTickets: '내 티켓', buyTickets: '티켓 구매 / 충전', nickname: '닉네임', nicknameHint: 'DayO에서 표시되는 이름을 관리해요.', language: '화면 언어' }
  };
  function byId(id) { return document.getElementById(id); }
  function locale() { return String(window.DayOI18n ? window.DayOI18n.getLang() : document.documentElement.lang).toLowerCase() === 'ko' ? 'ko' : 'en'; }
  function applyCopy() {
    var copy = labels[locale()];
    document.querySelectorAll('[data-ud-copy]').forEach(function (node) {
      var key = node.getAttribute('data-ud-copy');
      if (copy[key]) node.textContent = copy[key];
    });
    document.querySelectorAll('[data-ud-aria]').forEach(function (node) { node.setAttribute('aria-label', copy[node.getAttribute('data-ud-aria')]); });
    renderNext(); localizeUpcoming();
  }
  function move(node, target) { if (node && byId(target)) byId(target).appendChild(node); }
  function renderNext() {
    if (!mounted || !nextState) return;
    var hasSession = !!(nextState.session && nextState.session.partnerName);
    byId('ud-next-empty').hidden = hasSession;
    byId('ud-next-empty-copy').textContent = labels[locale()].empty;
    byId('ud-empty-book').hidden = hasSession;
    var language = String(hasSession && nextState.session.language || '').toLowerCase();
    var names = { en: 'EN · English', es: 'ES · Español', fr: 'FR · Français', ko: 'KO · 한국어' };
    byId('ud-next-language').textContent = names[language] || language.toUpperCase();
    byId('ud-next-language').hidden = !hasSession || !language;
  }
  function localizeUpcoming() {
    var list = byId('upcoming-booking-list');
    if (!mounted || !list) return;
    Array.from(list.children).forEach(function (row) {
      var label = row.firstElementChild, button = row.querySelector('button');
      [label, button].forEach(function (node) {
        if (!node) return;
        if (!upcomingCopy.has(node)) upcomingCopy.set(node, node.textContent);
        var original = upcomingCopy.get(node);
        node.textContent = locale() === 'en' ? original.replace(/^추가 예약 · /, 'Upcoming · ').replace(/^예약 취소$/, 'Cancel').replace(/ · (en|es|fr|ko)$/i, function (_, code) { return ' · ' + code.toUpperCase(); }) : original;
      });
    });
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
    applyCopy(); renderSpeaking(); restoreTab();
  }
  document.addEventListener('dayo:mypage-next', function (event) { nextState = event.detail; renderNext(); queueMicrotask(localizeUpcoming); });
  document.addEventListener('dayo:mypage-speaking', function (event) { speakingState = event.detail; renderSpeaking(); });
  document.addEventListener('dayo:langchange', applyCopy);
  window.addEventListener('hashchange', restoreTab);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
