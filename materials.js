/* DayO 대화 자료함 & 지난 대화 리포트 모달 — mypage.html / partner.html 공용 */
(function () {
  'use strict';

  var REPORTS = {
    'r-0802': {
      dateKey: 'mat.report.r0802.date',
      partner: 'Camille 🇫🇷',
      topicKey: 'mat.report.r0802.topic',
      durationMin: 30,
      feedbackKey: 'mat.report.r0802.feedback',
      words: ['hot americano', 'takeout', 'drip coffee'],
      sentences: ['"I\'d like a hot americano for here, please."']
    },
    'r-0729': {
      dateKey: 'mat.report.r0729.date',
      partner: 'Kate 🇺🇸',
      topicKey: 'mat.report.r0729.topic',
      durationMin: 30,
      feedbackKey: 'mat.report.r0729.feedback',
      words: ['hybrid work', 'commute', 'flexible schedule'],
      sentences: [
        '"I usually work from home twice a week."',
        '"What I like most about it is the flexibility."'
      ]
    }
  };

  var MATERIALS = {
    'fr-travel': {
      badgeKey: 'mat.item.frtravel.badge',
      titleKey: 'mat.item.frtravel.title',
      article: {
        headlineKey: 'mat.item.frtravel.headline',
        sourceKey: 'mat.item.frtravel.source',
        summaryKey: 'mat.item.frtravel.summary',
        pointsKey: 'mat.item.frtravel.points'
      },
      meaningsKey: 'mat.item.frtravel.meanings',
      expressions: [
        { phrase: 'Je voudrais un café, s\'il vous plaît.' },
        { phrase: 'C\'est combien, la terrasse ?' },
        { phrase: 'Vous avez une recommandation ?' },
        { phrase: 'Pourriez-vous parler un peu plus lentement ?' },
        { phrase: 'Comment on dit ça en français ?' }
      ]
    },
    'en-opic': {
      badgeKey: 'mat.item.enopic.badge',
      titleKey: 'mat.item.enopic.title',
      article: {
        headlineKey: 'mat.item.enopic.headline',
        sourceKey: 'mat.item.enopic.source',
        summaryKey: 'mat.item.enopic.summary',
        pointsKey: 'mat.item.enopic.points'
      },
      meaningsKey: 'mat.item.enopic.meanings',
      expressions: [
        { phrase: 'I usually work from home twice a week.' },
        { phrase: 'What I like most about it is the flexibility.' },
        { phrase: 'It took me a while to get used to it.' },
        { phrase: 'Compared to before, my mornings are much calmer.' }
      ]
    },
    'ko-daily': {
      badgeKey: 'mat.item.kodaily.badge',
      titleKey: 'mat.item.kodaily.title',
      article: {
        headlineKey: 'mat.item.kodaily.headline',
        sourceKey: 'mat.item.kodaily.source',
        summaryKey: 'mat.item.kodaily.summary',
        pointsKey: 'mat.item.kodaily.points'
      },
      meaningsKey: 'mat.item.kodaily.meanings',
      expressions: [
        { phrase: '요즘 어떻게 지내세요?' },
        { phrase: '이 근처에 괜찮은 카페 있어요?' },
        { phrase: '조금만 천천히 말씀해 주세요.' },
        { phrase: '그건 한국어로 뭐라고 해요?' }
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
    /* 지난 대화 상세 리포트 */
    '.mt-info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem;}',
    '.mt-info-item{padding:.8rem .9rem;border-radius:15px;background:var(--cream,#FFF8F3);}',
    '.mt-info-label{color:var(--muted,#927E77);font-size:.7rem;font-weight:700;}',
    '.mt-info-value{margin-top:.25rem;font-size:.86rem;font-weight:800;}',
    '.mt-quote{margin-top:1rem;padding:1rem;border:1px solid rgba(255,229,196,.9);border-radius:18px;',
    'background:linear-gradient(145deg,#FFF9F3,var(--pink-soft,#FFF0F3));font-size:.85rem;line-height:1.7;',
    'font-weight:700;}',
    '.mt-sec{margin-top:1.4rem;}',
    '.mt-sec-title{font-size:.86rem;font-weight:800;}',
    '.mt-sec-desc{margin-top:.3rem;color:var(--muted,#927E77);font-size:.74rem;line-height:1.6;}',
    '.mt-chips{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.7rem;}',
    '.mt-chip{padding:.5rem .8rem;border:1px solid var(--coral-pale,#FFE9E4);border-radius:999px;',
    'background:var(--coral-pale,#FFE9E4);color:var(--coral-dark,#E85B48);font-size:.8rem;font-weight:800;}',
    '.mt-sentence{margin-top:.55rem;padding:.85rem 1rem;border-radius:16px;background:var(--cream,#FFF8F3);',
    'font-size:.85rem;font-weight:700;line-height:1.65;}',
    '@media (max-width:520px){.mt-head{padding:1.1rem 1.1rem .9rem;}.mt-tabs{padding:.8rem 1.1rem 0;}',
    '.mt-body{padding:1rem 1.1rem 1.3rem;}.mt-info{grid-template-columns:1fr;}}'
  ].join('');

  var overlay;
  var elBadge;
  var elTitle;
  var elTabs;
  var elBody;
  var reportOverlay;
  var reportBody;
  var reportBadge;
  var current = { id: null, view: 'article' };
  var currentReportId = null;
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
      '    <button class="mt-close" type="button" data-i18n="mat.closeAria" data-i18n-attr="aria-label" aria-label="자료 닫기">✕</button>',
      '  </div>',
      '  <div class="mt-tabs" role="tablist">',
      '    <button class="mt-tab" type="button" data-view="article" role="tab" data-i18n="mat.tabArticle">📰 예습 자료</button>',
      '    <button class="mt-tab" type="button" data-view="expressions" role="tab" data-i18n="mat.tabExpressions">💬 추천 표현</button>',
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

  function mountReport() {
    reportOverlay = document.createElement('div');
    reportOverlay.className = 'mt-overlay';
    reportOverlay.innerHTML = [
      '<div class="mt-modal" role="dialog" aria-modal="true" aria-labelledby="mtReportTitle">',
      '  <div class="mt-head">',
      '    <div>',
      '      <span class="mt-badge"></span>',
      '      <p class="mt-title" id="mtReportTitle" data-i18n="report.title">📊 지난 대화 상세 리포트</p>',
      '    </div>',
      '    <button class="mt-close" type="button" data-i18n="report.closeAria" data-i18n-attr="aria-label" aria-label="리포트 닫기">✕</button>',
      '  </div>',
      '  <div class="mt-body"></div>',
      '</div>'
    ].join('');
    document.body.appendChild(reportOverlay);

    reportBadge = reportOverlay.querySelector('.mt-badge');
    reportBody = reportOverlay.querySelector('.mt-body');

    reportOverlay.querySelector('.mt-close').addEventListener('click', closeReport);
    reportOverlay.addEventListener('click', function (e) {
      if (e.target === reportOverlay) closeReport();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && reportOverlay.classList.contains('is-open')) closeReport();
    });
  }

  function t(key, vars) {
    if (!window.DayOI18n) return key;
    return vars ? window.DayOI18n.tf(key, vars) : window.DayOI18n.t(key);
  }

  function openReport(id) {
    var data = REPORTS[id];
    if (!data) return;
    currentReportId = id;

    reportBadge.textContent = t(data.dateKey) + ' · ' + t('mat.durationFormat', { min: data.durationMin });
    reportBody.innerHTML = [
      '<div class="mt-info">',
      '  <div class="mt-info-item"><p class="mt-info-label">' + escapeHtml(t('report.partnerLabel')) + '</p>',
      '  <p class="mt-info-value">' + escapeHtml(data.partner) + '</p></div>',
      '  <div class="mt-info-item"><p class="mt-info-label">' + escapeHtml(t('report.topicLabel')) + '</p>',
      '  <p class="mt-info-value">' + escapeHtml(t(data.topicKey)) + '</p></div>',
      '</div>',
      '<p class="mt-quote">💬 ' + escapeHtml(t(data.feedbackKey)) + '</p>',
      '<div class="mt-sec">',
      '  <p class="mt-sec-title">' + escapeHtml(t('report.aiTitle')) + '</p>',
      '  <p class="mt-sec-desc">' + escapeHtml(t('report.aiDesc')) + '</p>',
      '  <p class="mt-sec-title" style="margin-top:1rem">' + escapeHtml(t('report.words')) + '</p>',
      '  <div class="mt-chips">' + data.words.map(function (word) {
        return '<span class="mt-chip">' + escapeHtml(word) + '</span>';
      }).join('') + '</div>',
      '  <p class="mt-sec-title" style="margin-top:1.1rem">' + escapeHtml(t('report.sentences')) + '</p>',
      data.sentences.map(function (sentence) {
        return '<p class="mt-sentence">' + escapeHtml(sentence) + '</p>';
      }).join(''),
      '</div>'
    ].join('');

    lastFocused = document.activeElement;
    reportOverlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    reportOverlay.querySelector('.mt-close').focus();
  }

  function closeReport() {
    reportOverlay.classList.remove('is-open');
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
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
      var meanings = t(data.meaningsKey) || [];
      elBody.innerHTML = '<div class="mt-exp">' + data.expressions.map(function (item, index) {
        return '<div class="mt-exp-item"><p class="mt-phrase">' + escapeHtml(item.phrase) +
          '</p><p class="mt-meaning">' + escapeHtml(meanings[index] || '') + '</p></div>';
      }).join('') + '</div>';
      return;
    }

    var points = t(data.article.pointsKey) || [];
    elBody.innerHTML = [
      '<p class="mt-headline">' + escapeHtml(t(data.article.headlineKey)) + '</p>',
      '<p class="mt-source">' + escapeHtml(t(data.article.sourceKey)) + '</p>',
      '<p class="mt-summary">' + escapeHtml(t(data.article.summaryKey)) + '</p>',
      '<ul class="mt-points">' + points.map(function (point) {
        return '<li>' + escapeHtml(point) + '</li>';
      }).join('') + '</ul>'
    ].join('');
  }

  function open(id, view) {
    if (!MATERIALS[id]) return;
    current.id = id;
    current.view = view === 'expressions' ? 'expressions' : 'article';
    elBadge.textContent = t(MATERIALS[id].badgeKey);
    elTitle.textContent = t(MATERIALS[id].titleKey);
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
    mountReport();
    if (window.DayOI18n) window.DayOI18n.apply();
    document.addEventListener('click', function (e) {
      var report = e.target.closest('[data-report]');
      if (report) {
        e.preventDefault();
        openReport(report.dataset.report);
        return;
      }
      var trigger = e.target.closest('[data-material]');
      if (!trigger) return;
      e.preventDefault();
      open(trigger.dataset.material, trigger.dataset.materialView);
    });
    window.DayOMaterials = { open: open, close: close, openReport: openReport };

    document.addEventListener('dayo:langchange', function () {
      window.DayOI18n.apply();
      if (overlay.classList.contains('is-open') && current.id) {
        elBadge.textContent = t(MATERIALS[current.id].badgeKey);
        elTitle.textContent = t(MATERIALS[current.id].titleKey);
        renderBody();
      }
      if (reportOverlay.classList.contains('is-open') && currentReportId) openReport(currentReportId);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
