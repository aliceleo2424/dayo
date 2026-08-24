/* DayO 포춘쿠키 — 1일 1카드 + 로그인 전환 */
(function () {
  'use strict';

  var DATE_KEY = 'dayo_fortune_date';
  var CARD_KEY = 'dayo_fortune_card';

  var fortuneDeck = [
    {
      id: 'ship',
      original: 'A ship in harbor is safe, but that is not what ships are built for.',
      ko: '항구에 있는 배는 안전하지만, 배는 그걸 위해 만들어지지 않았어요.',
      cheer: '안전한 자리에서 한 발짝, 오늘도 말문이 트일 거예요 🌊'
    },
    {
      id: 'mistakes',
      original: "It's okay to make mistakes — that's how conversations get brave.",
      ko: '실수해도 괜찮아요. 그게 대화를 용기 있게 만드는 길이니까요.',
      cheer: '틀려도 돼요. DayO가 옆에서 같이 고쳐줄게요 💬'
    },
    {
      id: 'small-talk',
      original: 'Small talk is just a tiny door to a bigger world.',
      ko: '스몰토크는 더 큰 세계로 가는 작은 문이래요.',
      cheer: '오늘은 "How are you?" 한 문장만으로도 충분해요 ✨'
    },
    {
      id: 'accent',
      original: 'Your accent is not a bug — it is proof you speak more than one language.',
      ko: '억양은 버그가 아니라, 두 언어를 말한다는 증거예요.',
      cheer: '있는 그대로의 목소리로, 오늘도 자신 있게! 🎙️'
    }
  ];

  var el = {};
  var lastFocused = null;

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) { /* ignore */ }
  }

  function findCard(id) {
    for (var i = 0; i < fortuneDeck.length; i++) {
      if (fortuneDeck[i].id === id) return fortuneDeck[i];
    }
    return null;
  }

  function pickRandomCard() {
    var idx = Math.floor(Math.random() * fortuneDeck.length);
    return fortuneDeck[idx];
  }

  function getOrAssignTodayCard() {
    var today = todayISO();
    var savedDate = readStorage(DATE_KEY);
    var savedId = readStorage(CARD_KEY);
    var card = savedId ? findCard(savedId) : null;

    if (savedDate === today && card) return card;

    card = pickRandomCard();
    writeStorage(DATE_KEY, today);
    writeStorage(CARD_KEY, card.id);
    return card;
  }

  function isLoggedIn() {
    if (window.DayOMode && typeof window.DayOMode.isMember === 'function') {
      return !!window.DayOMode.isMember();
    }
    return document.body.classList.contains('is-logged-in');
  }

  function getDearName() {
    if (!isLoggedIn()) return 'Dear. 오늘의 여행자';
    var name = '';
    if (window.DayOMode && typeof window.DayOMode.getUserName === 'function') {
      name = String(window.DayOMode.getUserName() || '').trim();
    }
    if (!name) name = '여행자';
    return 'Dear. ' + name + '님';
  }

  function renderCard(card) {
    if (!card) return;
    if (el.dear) el.dear.textContent = getDearName();
    if (el.original) el.original.textContent = card.original;
    if (el.ko) el.ko.textContent = card.ko;
    if (el.cheer) el.cheer.textContent = card.cheer;
    if (el.saveBanner) {
      el.saveBanner.hidden = isLoggedIn();
      el.saveBanner.style.display = isLoggedIn() ? 'none' : '';
    }
  }

  function openModal() {
    var card = getOrAssignTodayCard();
    renderCard(card);
    lastFocused = document.activeElement;
    el.modal.hidden = false;
    el.modal.style.display = 'flex';
    if (window.DayOScrollLock) window.DayOScrollLock.lock();
    else document.body.style.overflow = 'hidden';
    var closeBtn = el.modal.querySelector('[data-fortune-close]');
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    if (!el.modal || el.modal.hidden) return;
    el.modal.hidden = true;
    el.modal.style.display = 'none';
    if (window.DayOScrollLock) window.DayOScrollLock.unlock();
    else document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function copyCard() {
    var original = el.original ? el.original.textContent : '';
    var ko = el.ko ? el.ko.textContent : '';
    var cheer = el.cheer ? el.cheer.textContent : '';
    var text = [getDearName(), original, ko, cheer].filter(Boolean).join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        if (window.DayOMode && typeof window.DayOMode.toast === 'function') {
          window.DayOMode.toast('카드 문구를 복사했어요 ✨');
        }
      }).catch(function () { /* ignore */ });
      return;
    }
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) { /* ignore */ }
  }

  function openLogin() {
    closeModal();
    if (window.DayOMode && typeof window.DayOMode.openLogin === 'function') {
      window.DayOMode.openLogin(null);
    }
  }

  function bind() {
    if (el.openBtn) {
      el.openBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openModal();
      });
    }

    el.modal.addEventListener('click', function (e) {
      if (e.target === el.modal) closeModal();
      if (e.target.closest('[data-fortune-close]')) {
        e.preventDefault();
        closeModal();
      }
      if (e.target.closest('[data-fortune-copy]')) {
        e.preventDefault();
        copyCard();
      }
      if (e.target.closest('.dayo-fortune-save-banner')) {
        e.preventDefault();
        openLogin();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.modal && !el.modal.hidden) closeModal();
    });

    document.addEventListener('dayo:authchange', function () {
      if (el.modal && !el.modal.hidden) {
        var id = readStorage(CARD_KEY);
        renderCard(findCard(id) || getOrAssignTodayCard());
      }
    });
  }

  function init() {
    el.openBtn = document.getElementById('btn-open-fortune');
    el.modal = document.getElementById('dayo-fortune-modal');
    if (!el.openBtn || !el.modal) return;

    el.dear = document.getElementById('dayo-fortune-dear');
    el.original = el.modal.querySelector('[data-fortune-original]');
    el.ko = el.modal.querySelector('[data-fortune-ko]');
    el.cheer = el.modal.querySelector('[data-fortune-cheer]');
    el.saveBanner = el.modal.querySelector('.dayo-fortune-save-banner');

    if (el.saveBanner) {
      el.saveBanner.setAttribute('role', 'button');
      el.saveBanner.setAttribute('tabindex', '0');
      el.saveBanner.style.cursor = 'pointer';
      el.saveBanner.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openLogin();
        }
      });
    }

    bind();
    window.DayOFortune = {
      open: openModal,
      close: closeModal,
      deck: fortuneDeck
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
