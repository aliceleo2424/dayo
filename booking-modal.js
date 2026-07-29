/* DayO 스마트 대화 예약 모달 — index.html / room.html 공용 */
(function () {
  'use strict';

  var LANGUAGES = [
    { id: 'en', label: '영어', flag: '🇺🇸' },
    { id: 'es', label: '스페인어', flag: '🇪🇸' },
    { id: 'fr', label: '프랑스어', flag: '🇫🇷' },
    { id: 'ja', label: '일본어', flag: '🇯🇵' },
    { id: 'zh', label: '중국어', flag: '🇨🇳' },
    { id: 'vi', label: '베트남어', flag: '🇻🇳' },
    { id: 'de', label: '독일어', flag: '🇩🇪' },
    { id: 'it', label: '이탈리아어', flag: '🇮🇹' },
    { id: 'ru', label: '러시아어', flag: '🇷🇺' }
  ];

  var PURPOSES = [
    { id: 'travel', label: '✈️ 여행/일상' },
    { id: 'opic', label: '🎯 오픽/토스' },
    { id: 'abroad', label: '💼 워홀/유학 준비' },
    { id: 'casual', label: '☕ 자유 수다' }
  ];

  var STYLES = [
    { id: 'slow', label: '🐢 말을 천천히 들어주고 리액션 잘해주는 파트너' },
    { id: 'fast', label: '⚡ 자연스럽고 빠른 실전 티키타카' },
    { id: 'correct', label: '📝 교정과 피드백을 꼼꼼하게 해주는 파트너' }
  ];

  var TIME_SLOTS = ['10:00', '14:00', '19:30', '21:00', '22:00'];
  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  var STEP_LABELS = ['언어와 목적', '파트너 스타일', '날짜와 시간', '예약 확인'];

  var CSS = [
    '.bk-overlay{position:fixed;inset:0;z-index:900;display:flex;align-items:center;justify-content:center;',
    'padding:1.25rem;background:rgba(92,74,66,.28);backdrop-filter:blur(10px);',
    'opacity:0;visibility:hidden;transition:opacity .3s ease,visibility .3s ease;}',
    '.bk-overlay.is-open{opacity:1;visibility:visible;}',
    '.bk-modal{position:relative;display:flex;flex-direction:column;width:100%;max-width:520px;',
    'max-height:min(88vh,88dvh);background:var(--bg-card,#FFFCFA);border:1px solid var(--coral-pale,#FFE8E3);',
    'border-radius:var(--radius-lg,24px);box-shadow:0 24px 64px rgba(255,107,87,.18);overflow:hidden;',
    'transform:translateY(18px) scale(.96);transition:transform .38s cubic-bezier(.34,1.4,.64,1);',
    'font-family:inherit;color:var(--text,#5C4A42);text-align:left;}',
    '.bk-overlay.is-open .bk-modal{transform:translateY(0) scale(1);}',
    '.bk-head{padding:1.35rem 1.5rem 1rem;background:linear-gradient(135deg,var(--pink,#FFD1DC),var(--peach,#FFE5B4));}',
    '.bk-eyebrow{font-size:.74rem;font-weight:700;letter-spacing:.04em;color:var(--coral,#FF6B57);}',
    '.bk-title{margin-top:.3rem;font-family:Quicksand,sans-serif;font-size:1.18rem;font-weight:700;line-height:1.45;}',
    '.bk-progress{margin-top:.9rem;height:7px;border-radius:999px;background:rgba(255,255,255,.65);overflow:hidden;}',
    '.bk-progress-bar{height:100%;width:25%;border-radius:999px;background:var(--coral,#FF6B57);transition:width .4s ease;}',
    '.bk-progress-label{margin-top:.35rem;font-size:.72rem;font-weight:700;color:var(--text-muted,#9A8580);text-align:right;}',
    '.bk-close{position:absolute;top:.9rem;right:.9rem;width:34px;height:34px;border:none;border-radius:50%;',
    'background:rgba(255,255,255,.75);color:var(--coral,#FF6B57);font-size:.95rem;cursor:pointer;line-height:1;}',
    '.bk-close:hover{background:var(--coral,#FF6B57);color:#fff;}',
    '.bk-body{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:1.25rem 1.5rem;}',
    '.bk-step{display:none;}',
    '.bk-step.is-active{display:block;animation:bkFade .32s ease;}',
    '@keyframes bkFade{from{opacity:0;transform:translateX(18px);}to{opacity:1;transform:translateX(0);}}',
    '.bk-label{margin-bottom:.6rem;font-size:.86rem;font-weight:700;}',
    '.bk-hint{margin-bottom:.6rem;font-size:.76rem;color:var(--text-muted,#9A8580);}',
    '.bk-group{margin-bottom:1.4rem;}',
    '.bk-group:last-child{margin-bottom:0;}',
    '.bk-chips{display:flex;flex-wrap:wrap;gap:.5rem;}',
    '.bk-chips--stack{flex-direction:column;flex-wrap:nowrap;}',
    '.bk-chip{padding:.6rem .95rem;border:1px solid var(--coral-pale,#FFE8E3);border-radius:999px;',
    'background:var(--cream,#FFF8F5);font-family:inherit;font-size:.85rem;color:inherit;cursor:pointer;',
    'text-align:left;transition:background .2s,border-color .2s,transform .2s;}',
    '.bk-chip:hover{border-color:var(--coral,#FF6B57);transform:translateY(-1px);}',
    '.bk-chip.is-on{background:var(--coral,#FF6B57);border-color:var(--coral,#FF6B57);color:#fff;font-weight:700;}',
    '.bk-chips--stack .bk-chip{border-radius:var(--radius,18px);line-height:1.5;}',
    '.bk-cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;}',
    '.bk-cal-title{font-family:Quicksand,sans-serif;font-size:.95rem;font-weight:700;}',
    '.bk-cal-nav{width:32px;height:32px;border:1px solid var(--coral-pale,#FFE8E3);border-radius:50%;',
    'background:var(--cream,#FFF8F5);color:var(--coral,#FF6B57);cursor:pointer;font-size:.85rem;line-height:1;}',
    '.bk-cal-nav:disabled{opacity:.35;cursor:not-allowed;}',
    '.bk-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:.3rem;}',
    '.bk-cal-dow{padding:.3rem 0;font-size:.7rem;font-weight:700;color:var(--text-muted,#9A8580);text-align:center;}',
    '.bk-day{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border:1px solid transparent;',
    'border-radius:50%;background:var(--cream,#FFF8F5);font-family:inherit;font-size:.82rem;color:inherit;cursor:pointer;}',
    '.bk-day:hover:not(:disabled){border-color:var(--coral,#FF6B57);}',
    '.bk-day:disabled{background:transparent;color:#D9CFC9;cursor:not-allowed;}',
    '.bk-day.is-empty{background:transparent;cursor:default;pointer-events:none;}',
    '.bk-day.is-on{background:var(--coral,#FF6B57);border-color:var(--coral,#FF6B57);color:#fff;font-weight:700;}',
    '.bk-slots{margin-top:1.2rem;}',
    '.bk-slots[hidden]{display:none;}',
    '.bk-summary{padding:1.1rem 1.25rem;border-radius:var(--radius,18px);',
    'background:linear-gradient(135deg,var(--pink,#FFD1DC),var(--peach,#FFE5B4));}',
    '.bk-row{display:flex;gap:.75rem;padding:.5rem 0;font-size:.86rem;line-height:1.5;}',
    '.bk-row+.bk-row{border-top:1px dashed rgba(255,255,255,.7);}',
    '.bk-row dt{flex:0 0 4.6rem;font-weight:700;color:var(--coral,#FF6B57);}',
    '.bk-row dd{flex:1;margin:0;}',
    '.bk-foot{display:flex;gap:.6rem;padding:1rem 1.5rem 1.25rem;border-top:1px solid var(--coral-pale,#FFE8E3);',
    'background:var(--bg-card,#FFFCFA);}',
    '.bk-btn{flex:1;padding:.9rem 1rem;border:none;border-radius:var(--radius,18px);font-family:inherit;',
    'font-size:.9rem;font-weight:700;cursor:pointer;transition:transform .15s,opacity .2s;}',
    '.bk-btn:active{transform:translateY(1px);}',
    '.bk-btn--ghost{flex:0 0 auto;padding:.9rem 1.15rem;background:var(--cream,#FFF8F5);',
    'border:1px solid var(--coral-pale,#FFE8E3);color:var(--text-muted,#9A8580);}',
    '.bk-btn--primary{background:var(--coral,#FF6B57);color:#fff;box-shadow:0 4px 0 var(--coral-dark,#E55A45);}',
    '.bk-btn--primary:disabled{opacity:.45;cursor:not-allowed;box-shadow:none;}',
    '.bk-toast{position:fixed;left:50%;bottom:2rem;z-index:960;max-width:min(420px,calc(100vw - 2rem));',
    'padding:.95rem 1.4rem;border:1px solid var(--coral-pale,#FFE8E3);border-radius:var(--radius,18px);',
    'background:var(--bg-card,#FFFCFA);color:var(--text,#5C4A42);font-family:inherit;font-size:.88rem;',
    'font-weight:600;line-height:1.5;text-align:center;box-shadow:0 12px 32px rgba(255,107,87,.2);',
    'opacity:0;transform:translateX(-50%) translateY(70px);transition:opacity .3s,transform .4s ease;pointer-events:none;}',
    '.bk-toast.is-on{opacity:1;transform:translateX(-50%) translateY(0);}',
    '@media (max-width:600px){',
    '.bk-overlay{padding:0;align-items:flex-end;}',
    '.bk-modal{max-width:none;max-height:min(92vh,92dvh);border-radius:var(--radius-lg,24px) var(--radius-lg,24px) 0 0;}',
    '.bk-head{padding:1.15rem 1.15rem .9rem;}.bk-body{padding:1.1rem 1.15rem;}',
    '.bk-foot{padding:.85rem 1.15rem calc(.85rem + env(safe-area-inset-bottom));}',
    '.bk-chip{font-size:.82rem;}}'
  ].join('');

  var state = {
    step: 0,
    language: null,
    purposes: [],
    style: null,
    date: null,
    time: null,
    viewYear: 0,
    viewMonth: 0
  };

  var el = {};
  var lastFocused = null;
  var toastTimer = null;

  function startOfToday() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function chipsMarkup(items, group) {
    return items.map(function (item) {
      var label = item.flag ? item.flag + ' ' + item.label : item.label;
      return '<button type="button" class="bk-chip" data-group="' + group + '" data-id="' + item.id +
        '" aria-pressed="false">' + label + '</button>';
    }).join('');
  }

  function buildMarkup() {
    return '' +
      '<div class="bk-modal" role="dialog" aria-modal="true" aria-labelledby="bkTitle">' +
        '<button type="button" class="bk-close" data-bk-close aria-label="예약 닫기">✕</button>' +
        '<div class="bk-head">' +
          '<p class="bk-eyebrow">SMART BOOKING</p>' +
          '<h2 class="bk-title" id="bkTitle">☕ 오늘의 대화, 예약해요</h2>' +
          '<div class="bk-progress"><div class="bk-progress-bar" id="bkProgressBar"></div></div>' +
          '<p class="bk-progress-label" id="bkProgressLabel"></p>' +
        '</div>' +
        '<div class="bk-body">' +
          '<section class="bk-step" data-step="0">' +
            '<div class="bk-group">' +
              '<p class="bk-label">어떤 언어로 대화할까요?</p>' +
              '<div class="bk-chips" id="bkLanguages">' + chipsMarkup(LANGUAGES, 'language') + '</div>' +
            '</div>' +
            '<div class="bk-group">' +
              '<p class="bk-label">대화 목적을 알려주세요</p>' +
              '<p class="bk-hint">여러 개를 골라도 좋아요</p>' +
              '<div class="bk-chips" id="bkPurposes">' + chipsMarkup(PURPOSES, 'purpose') + '</div>' +
            '</div>' +
          '</section>' +
          '<section class="bk-step" data-step="1">' +
            '<div class="bk-group">' +
              '<p class="bk-label">어떤 대화 파트너가 좋으세요?</p>' +
              '<p class="bk-hint">고른 스타일에 맞춰 파트너를 매칭해 드려요</p>' +
              '<div class="bk-chips bk-chips--stack" id="bkStyles">' + chipsMarkup(STYLES, 'style') + '</div>' +
            '</div>' +
          '</section>' +
          '<section class="bk-step" data-step="2">' +
            '<div class="bk-group">' +
              '<p class="bk-label">언제 만날까요?</p>' +
              '<p class="bk-hint">내일부터 예약할 수 있어요</p>' +
              '<div class="bk-cal-head">' +
                '<button type="button" class="bk-cal-nav" id="bkPrevMonth" aria-label="이전 달">‹</button>' +
                '<span class="bk-cal-title" id="bkCalTitle" aria-live="polite"></span>' +
                '<button type="button" class="bk-cal-nav" id="bkNextMonth" aria-label="다음 달">›</button>' +
              '</div>' +
              '<div class="bk-cal-grid" id="bkCalGrid"></div>' +
            '</div>' +
            '<div class="bk-slots" id="bkSlots" hidden>' +
              '<p class="bk-label">가능한 시간대예요</p>' +
              '<div class="bk-chips" id="bkTimes"></div>' +
            '</div>' +
          '</section>' +
          '<section class="bk-step" data-step="3">' +
            '<div class="bk-group">' +
              '<p class="bk-label">이렇게 예약할게요 🎉</p>' +
              '<dl class="bk-summary" id="bkSummary"></dl>' +
            '</div>' +
          '</section>' +
        '</div>' +
        '<div class="bk-foot">' +
          '<button type="button" class="bk-btn bk-btn--ghost" id="bkPrev">이전</button>' +
          '<button type="button" class="bk-btn bk-btn--primary" id="bkNext">다음</button>' +
        '</div>' +
      '</div>';
  }

  function mount() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.className = 'bk-overlay';
    overlay.id = 'bkOverlay';
    overlay.innerHTML = buildMarkup();
    document.body.appendChild(overlay);

    var toast = document.createElement('div');
    toast.className = 'bk-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);

    el = {
      overlay: overlay,
      modal: overlay.querySelector('.bk-modal'),
      steps: overlay.querySelectorAll('.bk-step'),
      progressBar: overlay.querySelector('#bkProgressBar'),
      progressLabel: overlay.querySelector('#bkProgressLabel'),
      prevBtn: overlay.querySelector('#bkPrev'),
      nextBtn: overlay.querySelector('#bkNext'),
      calTitle: overlay.querySelector('#bkCalTitle'),
      calGrid: overlay.querySelector('#bkCalGrid'),
      prevMonth: overlay.querySelector('#bkPrevMonth'),
      nextMonth: overlay.querySelector('#bkNextMonth'),
      slots: overlay.querySelector('#bkSlots'),
      times: overlay.querySelector('#bkTimes'),
      summary: overlay.querySelector('#bkSummary'),
      toast: toast
    };

    el.times.innerHTML = TIME_SLOTS.map(function (t) {
      return '<button type="button" class="bk-chip" data-group="time" data-id="' + t + '" aria-pressed="false">' + t + '</button>';
    }).join('');

    bindEvents();
  }

  function bindEvents() {
    el.overlay.addEventListener('click', function (e) {
      if (e.target === el.overlay) close();
      if (e.target.closest('[data-bk-close]')) close();
    });

    el.overlay.addEventListener('click', function (e) {
      var chip = e.target.closest('.bk-chip');
      if (!chip) return;
      selectChip(chip);
    });

    el.prevMonth.addEventListener('click', function () { shiftMonth(-1); });
    el.nextMonth.addEventListener('click', function () { shiftMonth(1); });

    el.calGrid.addEventListener('click', function (e) {
      var day = e.target.closest('.bk-day');
      if (!day || day.disabled || !day.dataset.date) return;
      state.date = day.dataset.date;
      state.time = null;
      renderCalendar();
      el.slots.hidden = false;
      syncChips('time');
      updateFooter();
    });

    el.prevBtn.addEventListener('click', function () { goTo(state.step - 1); });
    el.nextBtn.addEventListener('click', function () {
      if (state.step === 3) { confirmBooking(); return; }
      goTo(state.step + 1);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.overlay.classList.contains('is-open')) close();
    });
  }

  function selectChip(chip) {
    var group = chip.dataset.group;
    var id = chip.dataset.id;

    if (group === 'purpose') {
      var at = state.purposes.indexOf(id);
      if (at > -1) state.purposes.splice(at, 1);
      else state.purposes.push(id);
    } else if (group === 'language') {
      state.language = id;
    } else if (group === 'style') {
      state.style = id;
    } else if (group === 'time') {
      state.time = id;
    } else {
      return;
    }

    syncChips(group);
    updateFooter();
  }

  function syncChips(group) {
    var chips = el.overlay.querySelectorAll('.bk-chip[data-group="' + group + '"]');
    Array.prototype.forEach.call(chips, function (chip) {
      var on = group === 'purpose'
        ? state.purposes.indexOf(chip.dataset.id) > -1
        : state[group] === chip.dataset.id;
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function shiftMonth(delta) {
    var view = new Date(state.viewYear, state.viewMonth + delta, 1);
    state.viewYear = view.getFullYear();
    state.viewMonth = view.getMonth();
    renderCalendar();
  }

  function renderCalendar() {
    var today = startOfToday();
    var first = new Date(state.viewYear, state.viewMonth, 1);
    var daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();

    el.calTitle.textContent = state.viewYear + '년 ' + (state.viewMonth + 1) + '월';
    el.prevMonth.disabled = state.viewYear === today.getFullYear() && state.viewMonth === today.getMonth();

    var cells = WEEKDAYS.map(function (d) {
      return '<span class="bk-cal-dow">' + d + '</span>';
    });

    for (var blank = 0; blank < first.getDay(); blank++) {
      cells.push('<span class="bk-day is-empty" aria-hidden="true"></span>');
    }

    for (var day = 1; day <= daysInMonth; day++) {
      var date = new Date(state.viewYear, state.viewMonth, day);
      var iso = toISO(date);
      var selectable = date > today;
      cells.push(
        '<button type="button" class="bk-day' + (state.date === iso ? ' is-on' : '') + '"' +
        ' data-date="' + iso + '"' + (selectable ? '' : ' disabled') +
        ' aria-label="' + state.viewYear + '년 ' + (state.viewMonth + 1) + '월 ' + day + '일">' + day + '</button>'
      );
    }

    el.calGrid.innerHTML = cells.join('');
  }

  function toISO(date) {
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + m + '-' + d;
  }

  function formatDate(iso) {
    var parts = iso.split('-');
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return Number(parts[1]) + '월 ' + Number(parts[2]) + '일 (' + WEEKDAYS[date.getDay()] + ')';
  }

  function labelOf(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i].flag ? list[i].flag + ' ' + list[i].label : list[i].label;
    }
    return '';
  }

  function isStepReady(step) {
    if (step === 0) return !!state.language && state.purposes.length > 0;
    if (step === 1) return !!state.style;
    if (step === 2) return !!state.date && !!state.time;
    return true;
  }

  function renderSummary() {
    var purposeText = state.purposes.map(function (id) {
      return labelOf(PURPOSES, id);
    }).join(', ');

    el.summary.innerHTML = '' +
      row('언어', labelOf(LANGUAGES, state.language)) +
      row('목적', purposeText) +
      row('스타일', labelOf(STYLES, state.style)) +
      row('일시', formatDate(state.date) + ' · ' + state.time);
  }

  function row(term, value) {
    return '<div class="bk-row"><dt>' + term + '</dt><dd>' + value + '</dd></div>';
  }

  function goTo(step) {
    if (step < 0 || step > 3) return;
    if (step > state.step && !isStepReady(state.step)) return;

    state.step = step;
    Array.prototype.forEach.call(el.steps, function (section, i) {
      section.classList.toggle('is-active', i === step);
    });
    if (step === 3) renderSummary();

    el.progressBar.style.width = ((step + 1) / 4 * 100) + '%';
    el.progressLabel.textContent = 'STEP ' + (step + 1) + '/4 · ' + STEP_LABELS[step];
    el.overlay.querySelector('.bk-body').scrollTop = 0;
    updateFooter();
  }

  function updateFooter() {
    el.prevBtn.style.display = state.step === 0 ? 'none' : '';
    el.nextBtn.textContent = state.step === 3 ? '🍰 이 일정으로 대화 예약 확정하기' : '다음';
    el.nextBtn.disabled = !isStepReady(state.step);
  }

  function showToast(message) {
    el.toast.textContent = message;
    el.toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.classList.remove('is-on');
    }, 3600);
  }

  function confirmBooking() {
    if (!isStepReady(2)) return;
    close();
    showToast('예약이 성공적으로 완료되었습니다! 피드백 조건에 맞는 파트너가 매칭됩니다 💖');
  }

  function reset() {
    var today = startOfToday();
    state.language = null;
    state.purposes = [];
    state.style = null;
    state.date = null;
    state.time = null;
    state.viewYear = today.getFullYear();
    state.viewMonth = today.getMonth();

    ['language', 'purpose', 'style', 'time'].forEach(syncChips);
    el.slots.hidden = true;
    renderCalendar();
    goTo(0);
  }

  function open() {
    lastFocused = document.activeElement;
    reset();
    el.overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    el.modal.querySelector('.bk-close').focus();
  }

  function close() {
    el.overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function init() {
    mount();
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-booking-open]');
      if (!trigger) return;
      e.preventDefault();
      open();
    });
    window.DayOBooking = { open: open, close: close };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
