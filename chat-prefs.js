/* DayO 대화 옵션 프리셋 — 속도 / 스타일 / 요청사항 + 초심자 플래그
 * index.html (예약) · room.html (인챗) 공용
 */
(function () {
  'use strict';

  var FIRST_KEY = 'dayo.isFirstUser';
  var SPEED_KEY = 'dayo.chat.speed';
  var STYLE_KEY = 'dayo.chat.style';
  var REQUEST_KEY = 'dayo.chat.request';

  var DEFAULTS = {
    speed: 'slow',
    style: 'casual',
    request: 'praise'
  };

  var SPEED_IDS = ['slow', 'native'];
  var STYLE_IDS = ['casual', 'correct', 'interview'];
  var REQUEST_IDS = ['praise', 'gentle', 'encourage'];

  function t(key, vars) {
    if (!window.DayOI18n) return key;
    return vars ? window.DayOI18n.tf(key, vars) : window.DayOI18n.t(key);
  }

  function read(key, fallback) {
    try {
      var v = window.localStorage.getItem(key);
      return v == null || v === '' ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, String(value));
    } catch (e) { /* ignore */ }
  }

  function remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) { /* ignore */ }
  }

  function isFirstUser() {
    return read(FIRST_KEY, '') === '1' || read(FIRST_KEY, '') === 'true';
  }

  function markFirstUser(flag) {
    if (flag) write(FIRST_KEY, '1');
    else remove(FIRST_KEY);
  }

  function normalize(id, allowed, fallback) {
    return allowed.indexOf(id) > -1 ? id : fallback;
  }

  function getPrefs() {
    return {
      speed: normalize(read(SPEED_KEY, DEFAULTS.speed), SPEED_IDS, DEFAULTS.speed),
      style: normalize(read(STYLE_KEY, DEFAULTS.style), STYLE_IDS, DEFAULTS.style),
      request: normalize(read(REQUEST_KEY, DEFAULTS.request), REQUEST_IDS, DEFAULTS.request)
    };
  }

  function persistPrefs(next) {
    if (window.DayOProfileStore && typeof window.DayOProfileStore.updateProfile === 'function') {
      window.DayOProfileStore.updateProfile({
        speech_speed: next.speed,
        preferred_style: next.style,
        preferred_request: next.request
      }, { skipEvents: true });
    }
  }

  function setPrefs(partial, options) {
    var next = getPrefs();
    if (partial && partial.speed != null) next.speed = normalize(partial.speed, SPEED_IDS, next.speed);
    if (partial && partial.style != null) next.style = normalize(partial.style, STYLE_IDS, next.style);
    if (partial && partial.request != null) next.request = normalize(partial.request, REQUEST_IDS, next.request);
    write(SPEED_KEY, next.speed);
    write(STYLE_KEY, next.style);
    write(REQUEST_KEY, next.request);
    if (options && options.clearFirstUser) markFirstUser(false);
    document.dispatchEvent(new CustomEvent('dayo:chatprefschange', { detail: next }));
    persistPrefs(next);
    return next;
  }

  /** 초심자이면 안심 프리셋 적용 후 prefs 반환 */
  function applyFirstUserPresetIfNeeded() {
    if (!isFirstUser()) return getPrefs();
    return setPrefs(DEFAULTS, { clearFirstUser: false });
  }

  function speedLabel(id) {
    return t('chatPrefs.speed.' + normalize(id, SPEED_IDS, DEFAULTS.speed));
  }

  function styleLabel(id) {
    return t('chatPrefs.style.' + normalize(id, STYLE_IDS, DEFAULTS.style));
  }

  function requestLabel(id) {
    return t('chatPrefs.request.' + normalize(id, REQUEST_IDS, DEFAULTS.request));
  }

  function requestBadgeLabel(id) {
    return t('chatPrefs.requestBadge.' + normalize(id, REQUEST_IDS, DEFAULTS.request));
  }

  function firstUserTip() {
    return t('chatPrefs.firstUserTip');
  }

  function safetyToast() {
    return t('chatPrefs.safetyToast');
  }

  window.DayOChatPrefs = {
    SPEED_IDS: SPEED_IDS,
    STYLE_IDS: STYLE_IDS,
    REQUEST_IDS: REQUEST_IDS,
    DEFAULTS: DEFAULTS,
    isFirstUser: isFirstUser,
    markFirstUser: markFirstUser,
    getPrefs: getPrefs,
    setPrefs: setPrefs,
    applyFirstUserPresetIfNeeded: applyFirstUserPresetIfNeeded,
    speedLabel: speedLabel,
    styleLabel: styleLabel,
    requestLabel: requestLabel,
    requestBadgeLabel: requestBadgeLabel,
    firstUserTip: firstUserTip,
    safetyToast: safetyToast
  };
})();
