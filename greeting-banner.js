/* DayO 상단 인사말 배너 & 스트릭 카운트 — index.html 전용 (로그인 UI와 분리)
 *
 * 시간/날짜는 항상 유저 브라우저·디바이스의 현지 시간대를 사용합니다.
 * (KST 고정 아님, UTC 변환 없음 — Date 로컬 getter만 사용)
 */
(function () {
  'use strict';

  var USER_KEY = 'userName';
  var LAST_LOGIN_KEY = 'lastLoginDate';
  var STREAK_KEY = 'streakCount';

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
      return (window.localStorage.getItem(USER_KEY) || '').trim();
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

  function buildGreeting(userName, streakCount) {
    if (streakCount >= 2) {
      return '🔥 연속 ' + streakCount + '일째! 대단해요, ' + userName + '님!';
    }

    // 디바이스 현지 시간대 기준 시(hour)
    var hour = localHour();
    if (hour >= 5 && hour < 12) {
      return '좋은 아침이에요, ' + userName + '님! ☕';
    }
    if (hour >= 12 && hour < 18) {
      return '활기찬 오후예요, ' + userName + '님! 🌤️';
    }
    if (hour >= 18 && hour < 22) {
      return '편안한 저녁이에요, ' + userName + '님! 🌙';
    }
    // 22:00 ~ 04:59 (현지)
    return '오늘 하루도 고생 많았어요, ' + userName + '님! ✨';
  }

  function renderGreeting() {
    var banner = document.getElementById('greetingBanner');
    var textEl = document.getElementById('greetingBannerText');
    if (!banner || !textEl) return;

    var userName = getUserName();
    if (!userName) {
      banner.hidden = true;
      banner.classList.remove('is-visible');
      textEl.textContent = '';
      return;
    }

    var streak = updateStreakIfNeeded();
    textEl.textContent = buildGreeting(userName, streak);
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

    // 같은 탭에서 로그인/로그아웃 후 헤더가 바뀌면 배너도 동기화
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
