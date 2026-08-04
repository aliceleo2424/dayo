/* DayO 대화 자료함 모달 — mypage.html / partner.html 공용 */
(function () {
  'use strict';

  var MATERIALS = {
    'fr-travel': {
      badge: '🇫🇷 프랑스어 · 여행 회화',
      title: '니스 여행에서 바로 쓰는 대화 준비',
      article: {
        headline: '남프랑스 니스, 여름 축제로 붐비는 해변 도시',
        source: 'DayO 큐레이션 · 3분 예습',
        summary: '대화 파트너와 만나기 전에 한 번 읽어두면 좋은 배경 지식이에요. 모르는 단어는 표시해 두었다가 대화 중에 물어보세요.',
        points: [
          '니스의 해변 산책로 프롬나드 데 장글레는 여름마다 야외 공연장으로 변신합니다.',
          '7월 재즈 페스티벌 기간에는 숙소 예약이 평소보다 두 배 이상 몰립니다.',
          '현지 카페는 테라스 자리와 실내 자리의 가격이 다를 수 있어 주문 전에 확인이 필요합니다.'
        ]
      },
      expressions: [
        { phrase: 'Je voudrais un café, s\'il vous plaît.', meaning: '커피 한 잔 주세요.' },
        { phrase: 'C\'est combien, la terrasse ?', meaning: '테라스 자리는 얼마인가요?' },
        { phrase: 'Vous avez une recommandation ?', meaning: '추천해 주실 만한 게 있나요?' },
        { phrase: 'Pourriez-vous parler un peu plus lentement ?', meaning: '조금만 더 천천히 말씀해 주시겠어요?' },
        { phrase: 'Comment on dit ça en français ?', meaning: '이건 프랑스어로 뭐라고 하나요?' }
      ]
    },
    'en-opic': {
      badge: '🇺🇸 영어 · 오픽/토스',
      title: '오픽 인터뷰 빈출 주제 예습',
      article: {
        headline: '재택근무 이후 달라진 사무실 풍경',
        source: 'DayO 큐레이션 · 4분 예습',
        summary: '오픽에서 자주 나오는 "일과 일상" 주제예요. 내 경험과 연결해서 두세 문장으로 말해보는 연습을 해보세요.',
        points: [
          '많은 회사가 주 2~3일만 출근하는 하이브리드 방식을 유지하고 있습니다.',
          '집중 업무 공간보다 협업과 회의를 위한 라운지형 공간이 늘어나는 추세입니다.',
          '통근 시간이 줄면서 아침 시간을 학습이나 운동에 쓰는 사람이 많아졌습니다.'
        ]
      },
      expressions: [
        { phrase: 'I usually work from home twice a week.', meaning: '보통 일주일에 이틀은 재택으로 일해요.' },
        { phrase: 'What I like most about it is the flexibility.', meaning: '가장 마음에 드는 점은 유연함이에요.' },
        { phrase: 'It took me a while to get used to it.', meaning: '익숙해지는 데 시간이 좀 걸렸어요.' },
        { phrase: 'Compared to before, my mornings are much calmer.', meaning: '예전과 비교하면 아침이 훨씬 여유로워요.' }
      ]
    },
    'ko-daily': {
      badge: '🇰🇷 한국어 · 일상 수다',
      title: '한국어 대화 파트너와의 첫 수다 준비',
      article: {
        headline: '요즘 서울에서 인기 있는 동네 카페 산책',
        source: 'DayO 큐레이션 · 3분 예습',
        summary: '가볍게 읽고 대화 소재로 활용해 보세요. 발음이 어려운 표현은 대화 중에 파트너에게 물어봐도 좋아요.',
        points: [
          '성수동과 연남동은 오래된 주택을 고친 작은 카페가 많은 동네입니다.',
          '주말 오전에는 대기가 길어 평일 낮 시간대를 추천하는 사람이 많습니다.',
          '요즘은 디저트 한 가지만 전문으로 하는 작은 가게가 인기를 얻고 있습니다.'
        ]
      },
      expressions: [
        { phrase: '요즘 어떻게 지내세요?', meaning: '안부를 묻는 가장 편한 표현이에요.' },
        { phrase: '이 근처에 괜찮은 카페 있어요?', meaning: '장소를 추천받을 때 쓰는 표현이에요.' },
        { phrase: '조금만 천천히 말씀해 주세요.', meaning: '속도 조절을 부탁할 때 쓰는 표현이에요.' },
        { phrase: '그건 한국어로 뭐라고 해요?', meaning: '모르는 단어를 물어볼 때 쓰는 표현이에요.' }
      ]
    }
  };

  var CSS = [
    '.mt-overlay{position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;',
    'padding:1.25rem;background:rgba(89,72,66,.34);backdrop-filter:blur(6px);opacity:0;visibility:hidden;',
    'transition:opacity .25s;}',
    '.mt-overlay.is-open{opacity:1;visibility:visible;}',
    '.mt-modal{width:min(560px,100%);max-height:min(86vh,720px);display:flex;flex-direction:column;',
    'border:1px solid rgba(255,214,223,.75);border-radius:26px;background:#FFFCFA;',
    'box-shadow:0 26px 60px rgba(113,83,72,.24);transform:translateY(18px);transition:transform .28s;',
    'font-family:inherit;color:var(--text,#594842);overflow:hidden;}',
    '.mt-overlay.is-open .mt-modal{transform:translateY(0);}',
    '.mt-head{display:flex;align-items:flex-start;gap:1rem;padding:1.4rem 1.5rem 1rem;',
    'background:linear-gradient(135deg,var(--pink-soft,#FFF0F3),var(--yellow,#FFF6C7));}',
    '.mt-badge{display:inline-block;margin-bottom:.5rem;padding:.28rem .6rem;border-radius:999px;',
    'background:rgba(255,255,255,.8);color:var(--coral-dark,#E85B48);font-size:.68rem;font-weight:800;}',
    '.mt-title{font-size:1.05rem;font-weight:800;letter-spacing:-.02em;line-height:1.4;}',
    '.mt-close{flex:0 0 34px;width:34px;height:34px;border:none;border-radius:50%;cursor:pointer;',
    'background:rgba(255,255,255,.85);color:var(--muted,#927E77);font-size:1rem;}',
    '.mt-close:hover{color:var(--coral,#FF6B57);}',
    '.mt-tabs{display:flex;gap:.4rem;padding:.9rem 1.5rem 0;}',
    '.mt-tab{padding:.5rem .9rem;border:1px solid var(--line,rgba(146,126,119,.14));border-radius:999px;',
    'background:var(--cream,#FFF8F3);color:var(--muted,#927E77);font-size:.78rem;font-weight:800;cursor:pointer;}',
    '.mt-tab.is-active{border-color:var(--coral,#FF6B57);background:var(--coral-pale,#FFE9E4);',
    'color:var(--coral-dark,#E85B48);}',
    '.mt-body{padding:1.1rem 1.5rem 1.6rem;overflow-y:auto;}',
    '.mt-headline{font-size:.98rem;font-weight:800;line-height:1.5;}',
    '.mt-source{margin-top:.35rem;color:var(--muted,#927E77);font-size:.72rem;font-weight:700;}',
    '.mt-summary{margin-top:.85rem;padding:.9rem 1rem;border-radius:16px;',
    'background:var(--cream,#FFF8F3);color:var(--muted,#927E77);font-size:.82rem;line-height:1.7;}',
    '.mt-points{margin-top:1rem;display:grid;gap:.6rem;list-style:none;}',
    '.mt-points li{position:relative;padding-left:1.5rem;font-size:.85rem;line-height:1.7;}',
    '.mt-points li::before{content:"☕";position:absolute;left:0;top:.05rem;font-size:.8rem;}',
    '.mt-exp{display:grid;gap:.6rem;}',
    '.mt-exp-item{padding:.9rem 1rem;border:1px solid rgba(255,229,196,.85);border-radius:16px;',
    'background:linear-gradient(145deg,#FFF9F3,var(--pink-soft,#FFF0F3));}',
    '.mt-phrase{font-size:.9rem;font-weight:800;line-height:1.5;}',
    '.mt-meaning{margin-top:.32rem;color:var(--muted,#927E77);font-size:.78rem;line-height:1.6;}',
    '@media (max-width:520px){.mt-head{padding:1.1rem 1.1rem .9rem;}.mt-tabs{padding:.8rem 1.1rem 0;}',
    '.mt-body{padding:1rem 1.1rem 1.3rem;}}'
  ].join('');

  var overlay;
  var elBadge;
  var elTitle;
  var elTabs;
  var elBody;
  var current = { id: null, view: 'article' };
  var lastFocused = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char];
    });
  }

  function mount() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    overlay = document.createElement('div');
    overlay.className = 'mt-overlay';
    overlay.innerHTML = [
      '<div class="mt-modal" role="dialog" aria-modal="true" aria-labelledby="mtTitle">',
      '  <div class="mt-head">',
      '    <div>',
      '      <span class="mt-badge"></span>',
      '      <p class="mt-title" id="mtTitle"></p>',
      '    </div>',
      '    <button class="mt-close" type="button" aria-label="자료 닫기">✕</button>',
      '  </div>',
      '  <div class="mt-tabs" role="tablist">',
      '    <button class="mt-tab" type="button" data-view="article" role="tab">📰 예습 자료</button>',
      '    <button class="mt-tab" type="button" data-view="expressions" role="tab">💬 추천 표현</button>',
      '  </div>',
      '  <div class="mt-body"></div>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);

    elBadge = overlay.querySelector('.mt-badge');
    elTitle = overlay.querySelector('.mt-title');
    elTabs = overlay.querySelector('.mt-tabs');
    elBody = overlay.querySelector('.mt-body');

    overlay.querySelector('.mt-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    elTabs.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-view]');
      if (!tab) return;
      current.view = tab.dataset.view;
      renderBody();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) close();
    });
  }

  function renderBody() {
    var data = MATERIALS[current.id];
    if (!data) return;

    Array.prototype.forEach.call(elTabs.querySelectorAll('.mt-tab'), function (tab) {
      var active = tab.dataset.view === current.view;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });

    if (current.view === 'expressions') {
      elBody.innerHTML = '<div class="mt-exp">' + data.expressions.map(function (item) {
        return '<div class="mt-exp-item"><p class="mt-phrase">' + escapeHtml(item.phrase) +
          '</p><p class="mt-meaning">' + escapeHtml(item.meaning) + '</p></div>';
      }).join('') + '</div>';
      return;
    }

    elBody.innerHTML = [
      '<p class="mt-headline">' + escapeHtml(data.article.headline) + '</p>',
      '<p class="mt-source">' + escapeHtml(data.article.source) + '</p>',
      '<p class="mt-summary">' + escapeHtml(data.article.summary) + '</p>',
      '<ul class="mt-points">' + data.article.points.map(function (point) {
        return '<li>' + escapeHtml(point) + '</li>';
      }).join('') + '</ul>'
    ].join('');
  }

  function open(id, view) {
    if (!MATERIALS[id]) return;
    current.id = id;
    current.view = view === 'expressions' ? 'expressions' : 'article';
    elBadge.textContent = MATERIALS[id].badge;
    elTitle.textContent = MATERIALS[id].title;
    renderBody();
    lastFocused = document.activeElement;
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    overlay.querySelector('.mt-close').focus();
  }

  function close() {
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function init() {
    mount();
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-material]');
      if (!trigger) return;
      e.preventDefault();
      open(trigger.dataset.material, trigger.dataset.materialView);
    });
    window.DayOMaterials = { open: open, close: close };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
