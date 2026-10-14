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
      ['나라와 문화','Countries & cultures','프랑스 하면 생각나는 것은?','What comes to mind when you think of France?','답변 예시 · 에펠탑이 떠올라요. / The Eiffel Tower.','Example answer · The Eiffel Tower. / 에펠탑이 떠올라요.','#ffeeb4'],
      ['나라와 문화','Countries & cultures','한국 음식 중 무엇을 좋아해요?','Which Korean food do you like?','답변 예시 · 김밥을 좋아해요. / I like gimbap.','Example answer · I like gimbap. / 김밥을 좋아해요.','#fff3c4'],
      ['밸런스 게임','This or that','바다 여행 vs 도시 여행?','Beach trip or city trip?','답변 예시 · 바다요, 쉬고 싶어서요. / Beach, to relax.','Example answer · Beach, to relax. / 바다요, 쉬고 싶어서요.','#ffe8a3'],
      ['나라와 문화','Countries & cultures','내 나라에서 추천하고 싶은 음식은?','What food would you recommend from your country?','답변 예시 · 김치찌개요, 따뜻해서요. / Kimchi stew — it’s warming.','Example answer · Kimchi stew — it’s warming. / 김치찌개요, 따뜻해서요.','#fff6d6'],
      ['밸런스 게임','This or that','아침 커피 vs 저녁 차?','Morning coffee or evening tea?','답변 예시 · 아침엔 커피요. / Coffee in the morning.','Example answer · Coffee in the morning. / 아침엔 커피요.','#ffebb0']
    ];
    var card = document.querySelector('[data-story-card]');
    var dots = card.querySelector('.lv-story-dots');
    var index = 0;
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
      card.querySelector('[data-story-next]').setAttribute('aria-label', en ? 'Next question' : '다음 질문');
      dots.querySelectorAll('button').forEach(function (b, n) { b.setAttribute('aria-pressed', String(n === index)); b.setAttribute('aria-label', (en ? 'Question ' : '질문 ') + (n + 1)); });
    }
    card.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-story-index')) index = Number(button.getAttribute('data-story-index'));
      else if (button.hasAttribute('data-story-next')) index = (index + 1) % cards.length;
      else return;
      paint();
    });
    document.addEventListener('dayo:langchange', function () { render(); paint(); });
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
