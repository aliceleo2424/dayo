/* DayO 로그인 홈 인사말 & 스트릭 — index.html auth dashboard 전용
 *
 * 시간/날짜는 항상 유저 브라우저·디바이스의 현지 시간대를 사용합니다.
 * (KST 고정 아님, UTC 변환 없음 — Date 로컬 getter만 사용)
 */
(function () {
  'use strict';

  var USER_KEY = 'userName';
  var LAST_LOGIN_KEY = 'lastLoginDate';
  var STREAK_KEY = 'streakCount';

  function i18n(key, vars) {
    if (window.DayOI18n && typeof window.DayOI18n.tf === 'function') {
      return window.DayOI18n.tf(key, vars);
    }
    return key;
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /** 유저 기기 현지 시각의 Date 스냅샷 */
  function getLocalNow() {
    return new Date();
  }

  /** 현지 달력 기준 YYYY-MM-DD (getUTC* 사용 금지) */
  function localDateKey(date) {
    var d = date || getLocalNow();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** 현지 시각의 시(0–23). new Date().getHours()와 동일하게 디바이스 타임존 기준 */
  function localHour(date) {
    return (date || getLocalNow()).getHours();
  }

  function getUserName() {
    try {
      var user = window._dayoAuthUser;
      if (!user || !user.id) return '';
      var profile = window._dayoAuthProfile;
      if (!profile || profile._authUserId !== user.id) profile = {};
      var nick = String(profile.nickname || '').trim();
      if (nick) return nick;
      var named = String(profile.user_name || '').trim();
      if (named) return named;
      var metadata = user.user_metadata || {};
      var metaName = String(metadata.user_name || metadata.full_name || metadata.name || '').trim();
      if (metaName) return metaName;
      var email = user.email || '';
      if (email && email.indexOf('@') > 0) return email.split('@')[0];
      return '';
    } catch (e) {
      return '';
    }
  }

  function readStreak() {
    try {
      var n = parseInt(window.localStorage.getItem(STREAK_KEY), 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch (e) {
      return 0;
    }
  }

  function readLastLogin() {
    try {
      return window.localStorage.getItem(LAST_LOGIN_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function writeStreakState(count, date) {
    try {
      window.localStorage.setItem(STREAK_KEY, String(count));
      window.localStorage.setItem(LAST_LOGIN_KEY, date);
    } catch (e) { /* ignore */ }
    if (window.DayOProfileStore && typeof window.DayOProfileStore.updateProfile === 'function') {
      window.DayOProfileStore.updateProfile({
        streak_count: count,
        last_login_date: date
      }, { skipEvents: true });
    }
  }

  /** 로그인 유저의 오늘(현지 기준) 첫 접속으로 스트릭 갱신 */
  function updateStreakIfNeeded() {
    var now = getLocalNow();
    var today = localDateKey(now);
    var yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    var yesterday = localDateKey(yesterdayDate);
    var last = readLastLogin();
    var streak = readStreak();

    if (last === today) {
      return streak > 0 ? streak : 1;
    }

    if (last === yesterday) {
      streak = (streak > 0 ? streak : 0) + 1;
    } else {
      streak = 1;
    }

    writeStreakState(streak, today);
    return streak;
  }

  /** 시간대 인사말 — 메인 타이틀 1줄만 노출 */
  function buildGreeting(userName) {
    var hour = localHour();
    var key = 'mypage.greet.night';
    if (hour >= 5 && hour < 12) key = 'mypage.greet.morning';
    else if (hour >= 12 && hour < 18) key = 'mypage.greet.afternoon';
    else if (hour >= 18 && hour < 22) key = 'mypage.greet.evening';
    return i18n(key, { name: userName });
  }

    function renderGreeting() {
    var userName = getUserName();
    if (userName) updateStreakIfNeeded();
    var text = userName
      ? buildGreeting(userName).replace(/^👋\s*/, '')
      : i18n('mypage.heading');

    var mypageEl = document.getElementById('mypage-greeting');
    if (mypageEl) mypageEl.textContent = text;

    var banner = document.getElementById('greetingBanner');
    var textEl = document.getElementById('greetingBannerText');
    if (!banner || !textEl) return;

    if (!userName) {
      banner.hidden = true;
      banner.classList.remove('is-visible');
      textEl.textContent = '';
      return;
    }

    textEl.textContent = buildGreeting(userName);
    banner.hidden = false;
    banner.classList.add('is-visible');
  }

  function hookAuthRefresh() {
    if (!window.DayOMode || typeof window.DayOMode.refresh !== 'function') return;
    if (window.DayOMode.__greetingHooked) return;
    var original = window.DayOMode.refresh;
    window.DayOMode.refresh = function () {
      var result = original.apply(window.DayOMode, arguments);
      renderGreeting();
      return result;
    };
    window.DayOMode.__greetingHooked = true;
  }

  function init() {
    hookAuthRefresh();
    renderGreeting();

    document.addEventListener('dayo:authchange', function () {
      renderGreeting();
    });
    document.addEventListener('dayo:authprofile', function () {
      renderGreeting();
    });
    document.addEventListener('dayo:langchange', function () {
      renderGreeting();
    });

    var slots = document.querySelectorAll('[data-mode-switch]');
    if (slots.length && typeof MutationObserver !== 'undefined') {
      var observer = new MutationObserver(function () {
        renderGreeting();
      });
      Array.prototype.forEach.call(slots, function (slot) {
        observer.observe(slot, { childList: true, subtree: true });
      });
    }

    window.addEventListener('storage', function (e) {
      if (!e.key || e.key === USER_KEY || e.key === STREAK_KEY || e.key === LAST_LOGIN_KEY) {
        renderGreeting();
      }
    });
    window.DayOGreeting = {
      refresh: renderGreeting,
      getDisplayName: getUserName
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
