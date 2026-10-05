/* Font-only locale marker for standalone account pages without the i18n UI.
   Does not change app locale, storage, copy, auth or recovery behavior. */
(function () {
  'use strict';
  function updateFontLocale() {
    var locale = '';
    try {
      locale = window.DayOI18n && typeof window.DayOI18n.getLang === 'function'
        ? window.DayOI18n.getLang()
        : window.localStorage.getItem('dayo_lang');
    } catch (error) { /* Keep existing Korean typography if locale is unknown. */ }
    document.documentElement.setAttribute('data-dayo-font-locale', String(locale || '').toLowerCase());
  }
  updateFontLocale();
  document.addEventListener('dayo:langchange', updateFontLocale);
})();
