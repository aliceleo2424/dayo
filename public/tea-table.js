(function () {
  'use strict';

  var TREATS = [
    { key: 'americano', labelKey: 'treat.americano', fallback: '아메리카노' },
    { key: 'green_tea', labelKey: 'treat.greenTea', fallback: '그린티' },
    { key: 'vanilla_latte', labelKey: 'treat.vanillaLatte', fallback: '바닐라라떼' },
    { key: 'cookie', labelKey: 'treat.cookie', fallback: '쿠키' },
    { key: 'croissant', labelKey: 'treat.croissant', fallback: '크루아상' },
    { key: 'macaron', labelKey: 'treat.macaron', fallback: '마카롱' }
  ];

  function translate(key, fallback) {
    if (window.DayOI18n && typeof window.DayOI18n.t === 'function') {
      var translated = window.DayOI18n.t(key);
      if (translated && translated !== key) return translated;
    }
    return fallback;
  }

  function treatIllustration(key) {
    var common = 'viewBox="0 0 64 64" aria-hidden="true" focusable="false"';
    if (key === 'americano') {
      return '<svg ' + common + '><path d="M15 20h32v25a8 8 0 0 1-8 8H23a8 8 0 0 1-8-8Z" fill="#F8E8D2" stroke="#8C6048" stroke-width="3"/><path d="M19 24h24v8H19z" fill="#6F4937"/><path d="M47 27h4a8 8 0 0 1 0 16h-4" fill="none" stroke="#8C6048" stroke-width="3"/><path d="M10 55h43" stroke="#CFAE8D" stroke-width="3" stroke-linecap="round"/></svg>';
    }
    if (key === 'green_tea') {
      return '<svg ' + common + '><path d="M14 23h34v21a9 9 0 0 1-9 9H23a9 9 0 0 1-9-9Z" fill="#EDF3D8" stroke="#71845A" stroke-width="3"/><path d="M19 27h24v8H19z" fill="#A8BE78"/><path d="M48 29h4a7 7 0 0 1 0 14h-4" fill="none" stroke="#71845A" stroke-width="3"/><path d="M24 18c0-4 4-5 4-9M35 18c0-4 4-5 4-9" fill="none" stroke="#A8BE78" stroke-width="2.5" stroke-linecap="round"/></svg>';
    }
    if (key === 'vanilla_latte') {
      return '<svg ' + common + '><path d="M19 12h26l-3 42H22Z" fill="#FFF4D9" stroke="#A77452" stroke-width="3"/><path d="M21 29h22l-1 13H22z" fill="#C58A63"/><path d="M22 20h21l-1 9H22z" fill="#F6D9A7"/><path d="M27 8h20" stroke="#A77452" stroke-width="3" stroke-linecap="round"/><path d="M37 8l-4 13" stroke="#A77452" stroke-width="2.5"/></svg>';
    }
    if (key === 'cookie') {
      return '<svg ' + common + '><circle cx="32" cy="33" r="21" fill="#D9A66F" stroke="#8B6043" stroke-width="3"/><circle cx="24" cy="24" r="3" fill="#75503A"/><circle cx="40" cy="29" r="3" fill="#75503A"/><circle cx="29" cy="42" r="3" fill="#75503A"/><circle cx="43" cy="44" r="2.5" fill="#75503A"/><circle cx="18" cy="36" r="2.5" fill="#75503A"/></svg>';
    }
    if (key === 'croissant') {
      return '<svg ' + common + '><path d="M11 39c6-18 14-25 21-25s15 7 21 25c-6 10-14 14-21 14S17 49 11 39Z" fill="#E7B96C" stroke="#9A683D" stroke-width="3"/><path d="M21 21c3 8 3 18 0 27M32 15c3 11 3 27 0 38M43 21c-3 8-3 18 0 27" fill="none" stroke="#C3894E" stroke-width="2.5" stroke-linecap="round"/></svg>';
    }
    return '<svg ' + common + '><path d="M15 29c1-11 8-17 17-17s16 6 17 17Z" fill="#E8AFC0" stroke="#936276" stroke-width="3"/><path d="M15 37c1 11 8 17 17 17s16-6 17-17Z" fill="#E8AFC0" stroke="#936276" stroke-width="3"/><rect x="14" y="28" width="36" height="10" rx="5" fill="#FFF2D9" stroke="#936276" stroke-width="3"/></svg>';
  }

  function aggregate(reports) {
    var counts = {};
    TREATS.forEach(function (treat) { counts[treat.key] = 0; });
    (Array.isArray(reports) ? reports : []).forEach(function (report) {
      var key = String((report && report.stamp) || '').trim();
      if (Object.prototype.hasOwnProperty.call(counts, key)) counts[key] += 1;
    });
    return counts;
  }

  function render(reports) {
    var grid = document.getElementById('dayo-tea-table-grid');
    if (!grid) return;
    var counts = aggregate(reports);
    grid.innerHTML = TREATS.map(function (treat) {
      var count = counts[treat.key];
      var label = translate(treat.labelKey, treat.fallback);
      return '<div class="dayo-treat-item' + (count ? ' is-earned' : ' is-unearned') + '" data-treat-key="' + treat.key + '">' +
        '<span class="dayo-treat-art">' + treatIllustration(treat.key) + '</span>' +
        '<span class="dayo-treat-name">' + label + '</span>' +
        '<span class="dayo-treat-count"' + (count ? '' : ' aria-hidden="true"') + '>' + (count ? ('×' + count) : '×0') + '</span>' +
      '</div>';
    }).join('');
  }

  document.addEventListener('dayo:reportsloaded', function (event) {
    var detail = event && event.detail;
    render(detail && (detail.treatReports || detail.reports));
  });
  document.addEventListener('dayo:langchange', function () {
    render(window.__dayoTreatReports || []);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { render(window.__dayoTreatReports || []); });
  } else {
    render(window.__dayoTreatReports || []);
  }
})();
