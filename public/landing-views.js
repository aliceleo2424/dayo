(function () {
  'use strict';
  function init() {
    if (document.body.getAttribute('data-customer-page') !== 'landing') return;
    function render() {
      var hash = location.hash.slice(1);
      var view = ['about', 'how', 'pricing'].indexOf(hash) !== -1 ? hash : hash === 'service-intro' ? 'about' : hash === 'topics' ? 'how' : 'home';
      document.body.setAttribute('data-customer-view', view);
      if (window.DayOI18n) {
        var labels = { about: 'customer.nav.about', how: 'landing.nav.how', pricing: 'landing.nav.pricing' };
        document.title = labels[view] ? window.DayOI18n.t(labels[view]) + ' | DayO' : window.DayOI18n.t('landing.meta.title');
      }
      // Hidden attributes keep inactive content out of the accessibility tree too.
      document.querySelectorAll('[data-home-content], [data-detail-view]').forEach(function (section) {
        section.hidden = section.hasAttribute('data-home-content') ? view !== 'home' : section.getAttribute('data-detail-view') !== view;
      });
      document.dispatchEvent(new Event('dayo:customer-view'));
    }
    function navigate(hash) {
      if (location.hash !== hash) history.pushState(null, '', '/' + hash);
      render();
      scrollTo({ top: 0, behavior: 'instant' });
      var view = document.body.getAttribute('data-customer-view');
      var section = view === 'home' ? document.getElementById('landing-hero') : document.querySelector('[data-detail-view="' + view + '"]');
      var heading = section && section.querySelector('h1, h2');
      if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
    }
    window.DayOLandingViews = { navigate: navigate };
    window.addEventListener('hashchange', render);
    window.addEventListener('popstate', render);
    render();

    // Marketing examples only: no fake Partners, slots, or changes to live Talk Cards.
    var cards = [
      ['나라와 문화','Countries & cultures','프랑스 하면 생각나는 것은?','What comes to mind when you think of France?','빵, 에펠탑… 단어 하나로 시작해요.','Bread, the Eiffel Tower… one word is enough.','#ffeeb4'],
      ['나라와 문화','Countries & cultures','한국 음식 중 무엇을 좋아해요?','Which Korean food do you like?','김밥? 떡볶이? 좋아하는 음식 하나를 골라요.','Gimbap? Tteokbokki? Choose one you like.','#fff3c4'],
      ['밸런스 게임','This or that','바다 여행 vs 도시 여행?','Beach trip or city trip?','하나만 골라요. 이유는 짧게 말해도 돼요.','Pick one. A short reason is enough.','#ffe8a3'],
      ['나라와 문화','Countries & cultures','내 나라에서 추천하고 싶은 음식은?','What food would you recommend from your country?','음식 이름부터 말해봐요.','Start with the name of a food.','#fff6d6'],
      ['밸런스 게임','This or that','아침 커피 vs 저녁 차?','Morning coffee or evening tea?','둘 중 내 취향은?','Which one feels more like you?','#ffebb0']
    ];
    var card = document.querySelector('[data-story-card]');
    var dots = card.querySelector('.lv-story-dots');
    var index = 0, paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var timer;
    dots.innerHTML = cards.map(function (_, n) { return '<button type="button" data-story-index="' + n + '" aria-label="질문 ' + (n + 1) + '" aria-pressed="false"></button>'; }).join('');
    function paint() {
      var en = window.DayOI18n && window.DayOI18n.getLang() === 'EN';
      var value = cards[index];
      card.style.backgroundColor = value[6];
      card.querySelector('[data-story-type]').textContent = (en ? 'Talk card · ' : '이야기 카드 · ') + value[en ? 1 : 0] + (en ? ' (example)' : ' (질문 예시)');
      card.querySelector('[data-story-next]').textContent = en ? 'Next card' : '다음 카드';
      card.querySelector('[data-story-ko]').textContent = value[en ? 3 : 2];
      card.querySelector('[data-story-en]').textContent = en ? value[2] : value[3];
      card.querySelector('[data-story-hint]').textContent = value[en ? 5 : 4];
      card.querySelector('[data-story-pause]').textContent = paused ? '▶' : 'Ⅱ';
      card.querySelector('[data-story-pause]').setAttribute('aria-label', en ? paused ? 'Resume automatic questions' : 'Pause automatic questions' : paused ? '질문 자동 넘김 시작' : '질문 자동 넘김 멈추기');
      card.querySelector('[data-story-prev]').setAttribute('aria-label', en ? 'Previous question' : '이전 질문');
      card.querySelector('[data-story-next]').setAttribute('aria-label', en ? 'Next question' : '다음 질문');
      dots.querySelectorAll('button').forEach(function (b, n) { b.setAttribute('aria-pressed', String(n === index)); b.setAttribute('aria-label', (en ? 'Question ' : '질문 ') + (n + 1)); });
    }
    function restart() {
      clearInterval(timer);
      if (!paused) timer = setInterval(function () {
        if (document.hidden || document.body.getAttribute('data-customer-view') !== 'home' || card.matches(':hover') || card.contains(document.activeElement)) return;
        index = (index + 1) % cards.length; paint();
      }, 7000);
    }
    card.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-story-pause')) paused = !paused;
      else if (button.hasAttribute('data-story-index')) index = Number(button.getAttribute('data-story-index'));
      else index = (index + (button.hasAttribute('data-story-prev') ? cards.length - 1 : 1)) % cards.length;
      paint(); restart();
    });
    document.addEventListener('dayo:langchange', function () { render(); paint(); });
    paint(); restart();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
